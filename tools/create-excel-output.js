import XLSX from 'xlsx';
import fs from 'fs/promises';

async function createExcelFromTransformation(jsonFile, outputFile) {
  console.log(`📊 Reading transformation data: ${jsonFile}`);
  
  const data = JSON.parse(await fs.readFile(jsonFile, 'utf8'));
  
  // Create a new workbook
  const workbook = XLSX.utils.book_new();
  
  // Sheet 1: Summary
  console.log('📋 Creating Summary sheet...');
  const summaryData = [
    ['Release Type', 'Total', 'TRIC', 'DTMI', 'TRMI']
  ];
  
  for (const [releaseType, projects] of Object.entries(data.summary)) {
    const total = projects.TRIC + projects.DTMI + projects.TRMI;
    summaryData.push([releaseType, total, projects.TRIC, projects.DTMI, projects.TRMI]);
  }
  
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
  
  // Sheet 2: Releases
  console.log('📅 Creating Releases sheet...');
  const releasesData = [
    ['Release', 'Ticket', 'Title', 'Project']
  ];
  
  for (const group of data.releases) {
    // Add release header row
    releasesData.push([group.label, '', '', '']);
    
    // Add tickets for this release
    for (const ticket of group.tickets) {
      releasesData.push([null, ticket.ticket, ticket.title, ticket.project]);
    }
  }
  
  const releasesSheet = XLSX.utils.aoa_to_sheet(releasesData);
  XLSX.utils.book_append_sheet(workbook, releasesSheet, 'Releases');
  
  // Sheet 3: Details
  console.log('📋 Creating Details sheet...');
  const detailsData = [
    ['Ticket', 'Title', 'Done Date', 'Release Type', 'Project', 'Group', 'Release Label']
  ];
  
  let groupIndex = 0;
  for (const group of data.releases) {
    for (const ticket of group.tickets) {
      // Convert date to Excel serial number format (like ChatGPT does)
      const doneDate = new Date(ticket.done_date);
      const excelDate = (doneDate.getTime() - new Date('1900-01-01').getTime()) / (24 * 60 * 60 * 1000) + 1;
      
      detailsData.push([
        ticket.ticket,
        ticket.title,
        excelDate,  // Excel serial date format
        ticket.release_type,
        ticket.project,
        groupIndex,
        group.label
      ]);
    }
    groupIndex++;
  }
  
  const detailsSheet = XLSX.utils.aoa_to_sheet(detailsData);
  XLSX.utils.book_append_sheet(workbook, detailsSheet, 'Details');
  
  // Write the Excel file
  console.log(`💾 Writing Excel file: ${outputFile}`);
  XLSX.writeFile(workbook, outputFile);
  
  console.log('✅ Excel file created successfully!');
  console.log(`📊 Summary: ${data.metadata.total_tickets} tickets, ${data.metadata.total_releases} release groups`);
  
  return outputFile;
}

// Run if called directly
if (process.argv[2] && process.argv[3]) {
  const jsonFile = process.argv[2];
  const outputFile = process.argv[3];
  
  createExcelFromTransformation(jsonFile, outputFile)
    .then(() => {
      console.log('🎉 Excel generation complete!');
    })
    .catch(error => {
      console.error('❌ Error:', error.message);
      process.exit(1);
    });
}