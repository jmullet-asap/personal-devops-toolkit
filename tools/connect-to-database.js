#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import crypto from 'crypto';

// Project configuration mapping
const PROJECT_CONFIG = {
  'dtmi': {
    environments: {
      'dev': { profile: 'dtmi-nonprod', bastionTag: 'dtmi-dev-db-bastion', secretId: '/dtmi/dev/database/secret', database: 'dtmi' },
      'qa': { profile: 'dtmi-nonprod', bastionTag: 'dtmi-qa-db-bastion', secretId: '/dtmi/qa/database/secret', database: 'dtmi' },
      'train': { profile: 'dtmi-nonprod', bastionTag: 'dtmi-train-db-bastion', secretId: '/dtmi/train/database/secret', database: 'dtmi' },
      'prod': { profile: 'dtmi-prod', bastionTag: 'dtmi-prod-db-bastion', secretId: '/dtmi/prod/database/secret', database: 'dtmi' }
    }
  },
  'asap-fork': {
    environments: {
      'dev': { profile: 'default', bastionTag: 'trmi-dev-db-bastion', secretId: '/trmi/dev/database/secret', database: 'trmi' },
      'qa': { profile: 'default', bastionTag: 'trmi-qa-db-bastion', secretId: '/trmi/qa/database/secret', database: 'trmi' },
      'train': { profile: 'default', bastionTag: 'trmi-train-db-bastion', secretId: '/trmi/train/database/secret', database: 'trmi' },
      'prod': { profile: 'default', bastionTag: 'trmi-prod-db-bastion', secretId: '/trmi/prod/database/secret', database: 'trmi' }
    }
  }
};

// Function to normalize project name
function normalizeProject(input) {
  const lower = input.toLowerCase();
  if (['dtmi', 'discount tire', 'dt'].includes(lower)) return 'dtmi';
  if (['trmi', 'asap fork', 'asap-fork', 'tire rack', 'tric'].includes(lower)) return 'asap-fork';
  throw new Error(`Unknown project: ${input}`);
}

// Function to find available port
function findAvailablePort(startPort = 3307) {
  let port = startPort;
  while (port < startPort + 100) {
    try {
      execSync(`lsof -i :${port}`, { stdio: 'ignore' });
      port++;
    } catch (error) {
      return port; // Port is available
    }
  }
  throw new Error('No available ports found');
}

// Function to check if Beekeeper connection exists
function checkBeekeeperConnection(name) {
  const beekeeperDb = `${process.env.HOME}/Library/Application Support/beekeeper-studio/app.db`;
  
  if (!fs.existsSync(beekeeperDb)) {
    return false;
  }

  try {
    const escapedName = name.replace(/'/g, "''");
    const selectCmd = `sqlite3 "${beekeeperDb}" "SELECT COUNT(*) FROM saved_connection WHERE name='${escapedName}';"`;
    const count = execSync(selectCmd, { encoding: 'utf8' }).trim();
    return parseInt(count) > 0;
  } catch (error) {
    return false;
  }
}

// Function to add/update Beekeeper connection
function updateBeekeeperConnection(name, host, port, username, password, database) {
  const beekeeperDb = `${process.env.HOME}/Library/Application Support/beekeeper-studio/app.db`;
  
  if (!fs.existsSync(beekeeperDb)) {
    console.log('⚠️  Beekeeper Studio database not found - connection not added');
    return;
  }

  const uniqueHash = crypto.randomBytes(8).toString('hex');
  
  try {
    // Escape single quotes in password and other fields for SQL
    const escapedPassword = password.replace(/'/g, "''");
    const escapedName = name.replace(/'/g, "''");
    const escapedHost = host.replace(/'/g, "''");
    const escapedUsername = username.replace(/'/g, "''");
    const escapedDatabase = database.replace(/'/g, "''");
    
    // Try to update existing connection first
    const updateCmd = `sqlite3 "${beekeeperDb}" "UPDATE saved_connection SET host='${escapedHost}', port=${port}, username='${escapedUsername}', password='${escapedPassword}', defaultDatabase='${escapedDatabase}', updatedAt=datetime('now') WHERE name='${escapedName}';"`;
    execSync(updateCmd);
    
    // Check if update affected any rows by trying to select
    const selectCmd = `sqlite3 "${beekeeperDb}" "SELECT COUNT(*) FROM saved_connection WHERE name='${escapedName}';"`;
    const count = execSync(selectCmd, { encoding: 'utf8' }).trim();
    
    if (count === '0') {
      // Connection doesn't exist, insert new one
      const insertCmd = `sqlite3 "${beekeeperDb}" "INSERT INTO saved_connection (name, connectionType, host, port, username, password, defaultDatabase, uniqueHash, version, rememberPassword) VALUES ('${escapedName}', 'mysql', '${escapedHost}', ${port}, '${escapedUsername}', '${escapedPassword}', '${escapedDatabase}', '${uniqueHash}', 1, 1);"`;
      execSync(insertCmd);
      console.log(`✅ Added new Beekeeper connection: ${name}`);
    } else {
      console.log(`✅ Updated existing Beekeeper connection: ${name}`);
    }
    
  } catch (error) {
    console.log(`⚠️  Failed to update Beekeeper connection: ${error.message}`);
    console.log(`Password length: ${password.length}, contains special chars: ${/[^a-zA-Z0-9]/.test(password)}`);
  }
}

// Function to kill existing port forwarding
function killPortForwarding(port) {
  try {
    const pids = execSync(`lsof -i :${port} -t`, { encoding: 'utf8' }).trim().split('\n');
    pids.forEach(pid => {
      if (pid) {
        execSync(`kill -9 ${pid}`);
        console.log(`🔪 Killed existing port forwarding on port ${port}`);
      }
    });
  } catch (error) {
    // No existing forwarding to kill
  }
}

// Main connection function
async function connectToDatabase(project, environment = 'prod', databaseType = 'app', client = 'harlequin') {
  try {
    console.log(`🚀 Fast database connection: ${project} ${environment}`);
    
    // Normalize and validate
    const normalizedProject = normalizeProject(project);
    const config = PROJECT_CONFIG[normalizedProject].environments[environment];
    
    if (!config) {
      throw new Error(`Environment '${environment}' not found for project '${normalizedProject}'`);
    }

    // For ASAP Fork, handle database type
    let bastionTag = config.bastionTag;
    let secretId = config.secretId;
    let database = config.database;
    
    if (normalizedProject === 'asap-fork' && databaseType === 'bi') {
      bastionTag = config.bastionTag.replace('-db-bastion', '-bi-db-bastion');
      secretId = config.secretId.replace('/database/secret', '/bi/database/secret');
      database = 'bi';
    }

    console.log(`🎯 Target: ${normalizedProject} ${environment} ${databaseType} database`);
    console.log(`🔧 AWS Profile: ${config.profile}`);

    // Switch AWS profile if needed
    const currentProfile = process.env.AWS_PROFILE || 'default';
    if (currentProfile !== config.profile) {
      process.env.AWS_PROFILE = config.profile;
      console.log(`🔄 Switched AWS profile: ${currentProfile} → ${config.profile}`);
    }
    
    // Validate authentication with enhanced error handling
    console.log(`🔍 Checking AWS authentication for ${config.profile}...`);
    try {
      execSync(`aws sts get-caller-identity --profile ${config.profile}`, { stdio: 'ignore', timeout: 10000 });
      console.log(`✅ AWS authentication verified for ${config.profile}`);
    } catch (error) {
      console.log(`🔑 AWS authentication required for ${config.profile}`);
      console.log(`🚀 Starting SSO login process (this will open your browser)...`);
      console.log(`⏰ Please complete authentication within 2 minutes`);
      
      try {
        // Run SSO login with 2 minute timeout
        execSync(`aws sso login --profile ${config.profile}`, { 
          stdio: 'inherit', 
          timeout: 120000 // 2 minutes
        });
        
        // Verify authentication worked
        execSync(`aws sts get-caller-identity --profile ${config.profile}`, { 
          stdio: 'ignore', 
          timeout: 10000 
        });
        console.log(`✅ AWS authentication successful for ${config.profile}`);
        
      } catch (authError) {
        if (authError.signal === 'SIGTERM') {
          throw new Error(`⏰ Authentication timeout: Please run 'aws sso login --profile ${config.profile}' manually and try again.`);
        }
        throw new Error(`❌ Authentication failed for ${config.profile}: ${authError.message}\n\n🔧 Try running: aws sso login --profile ${config.profile}`);
      }
    }

    // Discover bastion host
    console.log(`🔍 Discovering bastion host: ${bastionTag}`);
    const instanceQuery = `aws ec2 describe-instances --filter Name=tag:Name,Values=${bastionTag} --query 'Reservations[].Instances[?State.Code==\`16\`].InstanceId' --output text --profile ${config.profile}`;
    const instanceIds = execSync(instanceQuery, { encoding: 'utf8' }).trim().split(/\s+/).filter(id => id);
    
    if (instanceIds.length === 0) {
      throw new Error(`No running bastion host found for ${bastionTag}`);
    }
    
    if (instanceIds.length > 1) {
      throw new Error(`Multiple bastion hosts found for ${bastionTag}. Please specify environment more precisely.`);
    }
    
    const instanceId = instanceIds[0];
    console.log(`✅ Found bastion: ${instanceId}`);

    // Get database credentials
    console.log(`🔐 Retrieving database credentials...`);
    const secretCmd = `aws secretsmanager get-secret-value --secret-id ${secretId} --query SecretString --output text --profile ${config.profile}`;
    const secretString = execSync(secretCmd, { encoding: 'utf8' }).trim();
    const secret = JSON.parse(secretString);

    const dbHost = secret.host;
    const dbPort = secret.port || 3306;
    const dbPassword = secret.password;
    const dbUsername = 'admin'; // Always admin regardless of what secrets say

    // Find available local port
    const localPort = findAvailablePort();
    console.log(`🔌 Using local port: ${localPort}`);

    // Kill any existing port forwarding on this port
    killPortForwarding(localPort);

    // Start SSM port forwarding
    console.log(`🌉 Starting port forwarding: ${dbHost}:${dbPort} → 127.0.0.1:${localPort}`);
    const ssmCmd = `aws ssm start-session --document-name AWS-StartPortForwardingSessionToRemoteHost --target ${instanceId} --parameters '{"host":["${dbHost}"],"portNumber":["${dbPort}"],"localPortNumber":["${localPort}"]}' --profile ${config.profile}`;
    
    // Start port forwarding in background
    execSync(`${ssmCmd} > /dev/null 2>&1 &`);
    
    // Wait for connection to establish
    console.log(`⏳ Waiting for port forwarding to establish...`);
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Verify port forwarding is working
    try {
      execSync(`lsof -i :${localPort}`, { stdio: 'ignore' });
      console.log(`✅ Port forwarding established on ${localPort}`);
    } catch (error) {
      throw new Error(`Port forwarding failed to establish on ${localPort}`);
    }

    // Launch database client based on choice
    let passwordMessage = null;
    
    if (client === 'beekeeper') {
      // Check for existing Beekeeper connection
      const connectionName = `${normalizedProject.toUpperCase()} ${environment} (Auto)`;
      const existingConnection = checkBeekeeperConnection(connectionName);
      
      if (existingConnection) {
        console.log(`✅ Found existing Beekeeper connection: ${connectionName}`);
        console.log(`🔌 Connection will use port ${localPort} (updated automatically)`);
      } else {
        console.log(`🆕 Creating new Beekeeper connection: ${connectionName}`);
        updateBeekeeperConnection(connectionName, 'localhost', localPort, dbUsername, dbPassword, database);
      }
      
      // Always show password for manual entry (since auto-save is unreliable)
      passwordMessage = `${dbPassword}`;
      console.log(`🔑 Database password: ${dbPassword}`);
      console.log(`📝 Copy this password - you may need to enter it manually in Beekeeper`);
      
      // Launch Beekeeper Studio
      console.log(`🐝 Launching Beekeeper Studio...`);
      execSync('open -a "Beekeeper Studio"');
      
    } else {
      // Launch Harlequin in separate terminal
      const harlequinCmd = `harlequin --adapter mysql --host localhost --port ${localPort} --username ${dbUsername} --password '${dbPassword}' --database ${database}`;
      
      console.log(`🎯 Launching Harlequin in large terminal window...`);
      const applescript = `
        tell application "Terminal"
          set newTab to do script "${harlequinCmd}"
          set bounds of front window to {100, 100, 1400, 900}
        end tell
      `;
      execSync(`osascript -e '${applescript}'`);
    }

    // Return connection details
    return {
      success: true,
      project: normalizedProject,
      environment,
      database,
      localPort,
      host: 'localhost',
      username: dbUsername,
      password: dbPassword,
      client,
      passwordMessage
    };

  } catch (error) {
    console.error(`❌ Connection failed: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const [project, environment = 'prod', databaseType = 'app', client = 'harlequin'] = process.argv.slice(2);
  
  if (!project) {
    console.error('Usage: node connect-to-database.js <project> [environment] [databaseType] [client]');
    console.error('Examples:');
    console.error('  node connect-to-database.js DTMI prod');
    console.error('  node connect-to-database.js "ASAP Fork" dev app harlequin');
    console.error('  node connect-to-database.js DTMI prod app beekeeper');
    process.exit(1);
  }

  connectToDatabase(project, environment, databaseType, client)
    .then(result => {
      if (result.success) {
        console.log(`\n🎉 Database connection ready!`);
        console.log(`🔗 Details: ${result.host}:${result.localPort}`);
        console.log(`👤 Username: ${result.username} (always admin)`);
        console.log(`🗄️  Database: ${result.database}`);
        if (result.passwordMessage) {
          console.log(`🔑 Password: ${result.passwordMessage}`);
        }
        console.log(`\n🎯 ${result.client === 'beekeeper' ? 'Beekeeper Studio' : 'Harlequin'} should be ${result.client === 'beekeeper' ? 'launching' : 'opening in a new terminal window'}!`);
      } else {
        console.error(`\n💥 Failed: ${result.error}`);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error(`\n💥 Unexpected error: ${error.message}`);
      process.exit(1);
    });
}

export { connectToDatabase };