#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * JMullet Tool: Reverse Location DaySettings Conversion
 * 
 * Reverses the location conversion from DaySettings-only mode back to WeekCalendar mode.
 * This tool is intended for testing and development purposes.
 * 
 * What this tool does:
 * 1. Sets location.daySettingsOnlyMode = false
 * 2. Deletes all SchedulePatterns for technicians at the location
 * 3. Deletes all generated DaySettings (keeps manually created ones)
 * 4. Shows summary of what was reversed
 * 
 * Usage: node reverse-location-conversion.js <locationName> [environment]
 * 
 * Examples:
 * - node reverse-location-conversion.js "South Bend IN"
 * - node reverse-location-conversion.js "South Bend IN" dev
 */

// Database connection helper
function getDatabaseConnection(environment = 'dev') {
  const envPath = '/Users/joshuamullet/repos/asap-fork/.env';
  
  if (!fs.existsSync(envPath)) {
    throw new Error(`Environment file not found at ${envPath}`);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const dbMatch = envContent.match(/DATABASE_SECRET=({.*})/);
  
  if (!dbMatch) {
    throw new Error('DATABASE_SECRET not found in .env file');
  }

  const dbConfig = JSON.parse(dbMatch[1]);
  return {
    host: dbConfig.host,
    port: dbConfig.port,
    username: dbConfig.username,
    password: dbConfig.password,
    database: 'trmi'
  };
}

// Execute SQL query
function executeQuery(query, dbConfig) {
  const command = `mysql -h ${dbConfig.host} -P ${dbConfig.port} -u ${dbConfig.username} -p'${dbConfig.password}' -e "${query}" ${dbConfig.database}`;
  
  try {
    const result = execSync(command, { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result;
  } catch (error) {
    console.error(`❌ Database query failed: ${error.message}`);
    process.exit(1);
  }
}

// Main reversal function
async function reverseLocationConversion(locationName, environment = 'dev') {
  console.log(`🔄 **Reversing DaySettings conversion for location: "${locationName}"**\n`);

  const dbConfig = getDatabaseConnection(environment);
  console.log(`🔗 **Database**: ${dbConfig.host}:${dbConfig.port} (${dbConfig.database})\n`);

  // Step 1: Find and verify location
  console.log('📍 **Step 1: Locating target location...**');
  const locationQuery = `SELECT objectId, name, daySettingsOnlyMode FROM location WHERE name = '${locationName}';`;
  const locationResult = executeQuery(locationQuery, dbConfig);
  
  if (!locationResult.trim() || locationResult.includes('Empty set')) {
    console.error(`❌ Location "${locationName}" not found`);
    process.exit(1);
  }

  const locationLines = locationResult.trim().split('\n');
  if (locationLines.length < 2) {
    console.error(`❌ Location "${locationName}" not found`);
    process.exit(1);
  }

  // Parse location data (skip header line)
  const locationData = locationLines[1].split('\t');
  const locationId = locationData[0];
  const currentMode = locationData[2];
  
  console.log(`   ✅ Found: ${locationName} (${locationId})`);
  console.log(`   📊 Current daySettingsOnlyMode: ${currentMode}`);
  
  if (currentMode === '0') {
    console.log(`   ⚠️  Location is not in DaySettings-only mode. Nothing to reverse.`);
    return;
  }

  // Step 2: Count what will be deleted
  console.log('\n📊 **Step 2: Analyzing conversion data...**');
  
  // Count SchedulePatterns
  const patternCountQuery = `
    SELECT COUNT(*) as count 
    FROM schedule_pattern sp
    JOIN technician t ON sp.technicianObjectId = t.objectId  
    WHERE t.locationObjectId = '${locationId}';
  `;
  const patternCountResult = executeQuery(patternCountQuery, dbConfig);
  const patternCount = patternCountResult.trim().split('\n')[1];
  
  // Count generated DaySettings
  const daySettingsCountQuery = `
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN generatedFromPattern IS NOT NULL THEN 1 END) as generated,
      COUNT(CASE WHEN humanUpdatedTimestamp IS NOT NULL THEN 1 END) as manual
    FROM day_setting ds
    JOIN technician t ON ds.technicianObjectId = t.objectId  
    WHERE t.locationObjectId = '${locationId}';
  `;
  const daySettingsResult = executeQuery(daySettingsCountQuery, dbConfig);
  const daySettingsData = daySettingsResult.trim().split('\n')[1].split('\t');
  const totalDaySettings = daySettingsData[0];
  const generatedDaySettings = daySettingsData[1];
  const manualDaySettings = daySettingsData[2];

  console.log(`   📋 SchedulePatterns to delete: ${patternCount}`);
  console.log(`   📅 Generated DaySettings to delete: ${generatedDaySettings}`);
  console.log(`   📝 Manual DaySettings to preserve: ${manualDaySettings}`);
  console.log(`   📊 Total DaySettings currently: ${totalDaySettings}`);

  // Step 3: Confirmation
  console.log('\n⚠️  **CONFIRMATION REQUIRED**');
  console.log('This will:');
  console.log(`   - Set location "${locationName}" back to WeekCalendar mode`);
  console.log(`   - Delete ${patternCount} SchedulePattern(s)`);
  console.log(`   - Delete ${generatedDaySettings} generated DaySettings`);
  console.log(`   - Preserve ${manualDaySettings} manual DaySettings`);
  
  // Simple confirmation (for automation, could be made interactive)
  const shouldContinue = process.argv.includes('--confirm') || process.argv.includes('-y');
  
  if (!shouldContinue) {
    console.log('\n❌ **Reversal cancelled**');
    console.log('   Add --confirm or -y flag to execute the reversal');
    process.exit(0);
  }

  // Step 4: Execute reversal
  console.log('\n🔄 **Step 3: Executing reversal...**');
  
  // Delete generated DaySettings
  console.log('   🗑️  Deleting generated DaySettings...');
  const deleteDaySettingsQuery = `
    DELETE ds FROM day_setting ds
    JOIN technician t ON ds.technicianObjectId = t.objectId  
    WHERE t.locationObjectId = '${locationId}'
    AND ds.generatedFromPattern IS NOT NULL;
  `;
  executeQuery(deleteDaySettingsQuery, dbConfig);
  console.log(`   ✅ Deleted ${generatedDaySettings} generated DaySettings`);

  // Delete SchedulePatterns
  console.log('   🗑️  Deleting SchedulePatterns...');
  const deletePatternsQuery = `
    DELETE sp FROM schedule_pattern sp
    JOIN technician t ON sp.technicianObjectId = t.objectId  
    WHERE t.locationObjectId = '${locationId}';
  `;
  executeQuery(deletePatternsQuery, dbConfig);
  console.log(`   ✅ Deleted ${patternCount} SchedulePatterns`);

  // Reset location mode
  console.log('   🔄 Setting location back to WeekCalendar mode...');
  const resetLocationQuery = `UPDATE location SET daySettingsOnlyMode = 0 WHERE objectId = '${locationId}';`;
  executeQuery(resetLocationQuery, dbConfig);
  console.log('   ✅ Location reset to WeekCalendar mode');

  // Step 5: Verification
  console.log('\n✅ **Step 4: Verifying reversal...**');
  const verifyQuery = `SELECT name, daySettingsOnlyMode FROM location WHERE objectId = '${locationId}';`;
  const verifyResult = executeQuery(verifyQuery, dbConfig);
  const verifyData = verifyResult.trim().split('\n')[1].split('\t');
  const newMode = verifyData[1];
  
  console.log(`   📊 Final daySettingsOnlyMode: ${newMode}`);
  
  if (newMode === '0') {
    console.log('   ✅ Reversal successful!');
  } else {
    console.log('   ❌ Reversal may have failed - mode not reset');
  }

  // Final summary
  console.log('\n🎉 **Reversal Complete**');
  console.log(`   📍 Location: ${locationName}`);
  console.log(`   🔄 Mode: DaySettings-only → WeekCalendar`);
  console.log(`   🗑️  Deleted: ${patternCount} patterns, ${generatedDaySettings} generated DaySettings`);
  console.log(`   📝 Preserved: ${manualDaySettings} manual DaySettings`);
  console.log('\n   💡 The location can now be converted again for testing');
}

// CLI handling
if (process.argv.length < 3) {
  console.log('❌ **Missing location name**');
  console.log('\n📖 **Usage:**');
  console.log('   node reverse-location-conversion.js <locationName> [environment]');
  console.log('\n📋 **Examples:**');
  console.log('   node reverse-location-conversion.js "South Bend IN"');
  console.log('   node reverse-location-conversion.js "South Bend IN" dev');
  console.log('\n⚠️  **Add --confirm or -y to execute (otherwise shows preview)**');
  process.exit(1);
}

const locationName = process.argv[2];
const environment = process.argv[3] || 'dev';

// Execute reversal
try {
  await reverseLocationConversion(locationName, environment);
} catch (error) {
  console.error(`❌ **Reversal failed:** ${error.message}`);
  process.exit(1);
}