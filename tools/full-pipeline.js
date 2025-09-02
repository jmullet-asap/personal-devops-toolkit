import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

function generateFileName(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15); // YYYYMMDDTHHMMSS
  
  // Check if it's a full month
  const isFullMonth = (
    start.getDate() === 1 && 
    end.getMonth() === start.getMonth() &&
    end.getDate() === new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()
  );
  
  if (isFullMonth) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = monthNames[start.getMonth()];
    return `Deployment_Report_${monthName}_${start.getFullYear()}_${timestamp}.xlsx`;
  } else {
    const startStr = start.toISOString().slice(5, 10).replace('-', ''); // MMDD  
    const endStr = end.toISOString().slice(5, 10).replace('-', ''); // MMDD
    return `Deployment_Report_${startStr}-${endStr}_${start.getFullYear()}_${timestamp}.xlsx`;
  }
}

async function runFullPipeline(startDate, endDate) {
  const tempDir = '/tmp/jira-pipeline';
  await fs.mkdir(tempDir, { recursive: true });
  
  const tempJiraFile = path.join(tempDir, 'jira-data.json');
  const tempTransformFile = path.join(tempDir, 'transformed-data.json');
  
  console.log('🚀 Starting full JIRA pipeline...');
  console.log(`📅 Date range: ${startDate} to ${endDate}`);
  
  try {
    // Step 1: Download JIRA data
    console.log('📥 Step 1: Downloading JIRA data...');
    await execAsync(`node tools/run-jira-query.js "${startDate}" "${endDate}"`);
    
    // Move jira-results.json to temp location
    await execAsync(`mv jira-results.json "${tempJiraFile}"`);
    console.log('✅ JIRA data downloaded');
    
    // Step 2: Transform the data
    console.log('🔄 Step 2: Transforming data...');
    await execAsync(`node tools/transform-jira-data.js "${tempJiraFile}" "${tempTransformFile.replace('.json', '')}"`);
    console.log('✅ Data transformed');
    
    // Step 3: Generate Excel file
    console.log('📊 Step 3: Generating Excel file...');
    const fileName = generateFileName(startDate, endDate);
    const downloadsPath = path.join(os.homedir(), 'Downloads', fileName);
    
    await execAsync(`node tools/create-excel-output.js "${tempTransformFile}" "${downloadsPath}"`);
    console.log('✅ Excel file generated');
    
    console.log('🎉 Pipeline complete!');
    console.log(`📁 File saved to: ${downloadsPath}`);
    
    // Return summary info (read before cleanup)
    const transformData = JSON.parse(await fs.readFile(tempTransformFile, 'utf8'));
    
    // Step 4: Clean up temp files
    console.log('🧹 Cleaning up...');
    await execAsync(`rm -rf "${tempDir}"`);
    return {
      success: true,
      fileName: fileName,
      filePath: downloadsPath,
      summary: {
        totalTickets: transformData.metadata.total_tickets,
        totalReleases: transformData.metadata.total_releases,
        breakdown: transformData.summary
      }
    };
    
  } catch (error) {
    console.error('❌ Pipeline failed:', error.message);
    
    // Clean up on error
    try {
      await execAsync(`rm -rf "${tempDir}"`);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    throw error;
  }
}

// Run if called directly
if (process.argv[2] && process.argv[3]) {
  const startDate = process.argv[2];
  const endDate = process.argv[3];
  
  runFullPipeline(startDate, endDate)
    .then(result => {
      console.log('\n📊 SUMMARY:');
      console.log(`   File: ${result.fileName}`);
      console.log(`   Tickets: ${result.summary.totalTickets}`);
      console.log(`   Releases: ${result.summary.totalReleases}`);
      console.log(`   Normal: TRIC=${result.summary.breakdown.Normal.TRIC}, DTMI=${result.summary.breakdown.Normal.DTMI}, TRMI=${result.summary.breakdown.Normal.TRMI}`);
    })
    .catch(error => {
      console.error('❌ Error:', error.message);
      process.exit(1);
    });
}

export { runFullPipeline };