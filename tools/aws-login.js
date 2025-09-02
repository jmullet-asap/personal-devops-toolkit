#!/usr/bin/env node

import { execSync } from 'child_process';

// Project to AWS profile mapping
const PROJECT_CONFIG = {
  'dtmi': {
    environments: {
      'dev': 'dtmi-nonprod',
      'qa': 'dtmi-nonprod', 
      'train': 'dtmi-nonprod',
      'prod': 'dtmi-prod',
      'nonprod': 'dtmi-nonprod' // Alias for convenience
    },
    defaultProfile: 'dtmi-prod'
  },
  'tric': {
    environments: {
      'dev': 'tric-nonprod',
      'qa': 'tric-nonprod',
      'train': 'tric-nonprod',
      'prod': 'tric-prod',
      'nonprod': 'tric-nonprod' // Alias for convenience
    },
    defaultProfile: 'tric-prod'
  },
  'trmi': {
    environments: {
      'dev': 'default',
      'qa': 'default',
      'train': 'default', 
      'prod': 'default'
    },
    defaultProfile: 'default'
  },
  'asap-fork': {
    environments: {
      'dev': 'default',
      'qa': 'default',
      'train': 'default',
      'prod': 'default'
    },
    defaultProfile: 'default'
  }
};

// Function to normalize project name
function normalizeProject(input) {
  const lower = input.toLowerCase();
  if (['dtmi', 'discount tire', 'dt'].includes(lower)) return 'dtmi';
  if (['tric', 'tire rack installation center'].includes(lower)) return 'tric';
  if (['trmi', 'asap fork', 'asap-fork', 'tire rack'].includes(lower)) return 'trmi';
  return lower; // Return as-is for unknown projects
}

// Function to determine AWS profile
function determineProfile(project, environment) {
  const normalizedProject = normalizeProject(project);
  const config = PROJECT_CONFIG[normalizedProject];
  
  if (!config) {
    throw new Error(`Unknown project: ${project}. Supported: DTMI, TRIC, TRMI, ASAP Fork`);
  }
  
  if (!environment) {
    return config.defaultProfile;
  }
  
  const profile = config.environments[environment.toLowerCase()];
  if (!profile) {
    throw new Error(`Unknown environment '${environment}' for ${normalizedProject}. Supported: ${Object.keys(config.environments).join(', ')}`);
  }
  
  return profile;
}

// Function to check current authentication
function getCurrentAuth() {
  try {
    const currentProfile = process.env.AWS_PROFILE || 'default';
    const identity = execSync(`aws sts get-caller-identity --profile ${currentProfile}`, { 
      encoding: 'utf8',
      timeout: 10000 
    });
    const parsed = JSON.parse(identity.trim());
    return {
      authenticated: true,
      profile: currentProfile,
      account: parsed.Account,
      arn: parsed.Arn,
      userId: parsed.UserId
    };
  } catch (error) {
    return {
      authenticated: false,
      profile: process.env.AWS_PROFILE || 'default',
      error: error.message
    };
  }
}

// Main authentication function
async function authenticateAWS(project, environment) {
  try {
    console.log(`🔑 AWS Authentication: ${project}${environment ? ` ${environment}` : ''}`);
    
    // Determine target profile
    const targetProfile = determineProfile(project, environment);
    console.log(`🎯 Target AWS Profile: ${targetProfile}`);
    
    // Check current authentication state
    console.log(`🔍 Checking current authentication...`);
    const currentAuth = getCurrentAuth();
    
    if (currentAuth.authenticated) {
      console.log(`✅ Currently authenticated as: ${currentAuth.profile}`);
      console.log(`   Account: ${currentAuth.account}`);
      console.log(`   User: ${currentAuth.arn.split('/').pop()}`);
      
      if (currentAuth.profile === targetProfile) {
        console.log(`🎉 Already authenticated to correct profile!`);
        return {
          success: true,
          alreadyAuthenticated: true,
          profile: targetProfile,
          account: currentAuth.account,
          user: currentAuth.arn.split('/').pop()
        };
      } else {
        console.log(`🔄 Need to switch from ${currentAuth.profile} to ${targetProfile}`);
      }
    } else {
      console.log(`❌ Not currently authenticated: ${currentAuth.error}`);
    }
    
    // Switch to target profile
    process.env.AWS_PROFILE = targetProfile;
    console.log(`🔄 Switched AWS_PROFILE to: ${targetProfile}`);
    
    // Check if target profile is already authenticated
    console.log(`🔍 Checking authentication for ${targetProfile}...`);
    try {
      const targetAuth = execSync(`aws sts get-caller-identity --profile ${targetProfile}`, { 
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 10000 
      });
      const parsed = JSON.parse(targetAuth.trim());
      
      console.log(`✅ ${targetProfile} is already authenticated!`);
      console.log(`   Account: ${parsed.Account}`);
      console.log(`   User: ${parsed.Arn.split('/').pop()}`);
      
      return {
        success: true,
        alreadyAuthenticated: true,
        profile: targetProfile,
        account: parsed.Account,
        user: parsed.Arn.split('/').pop()
      };
      
    } catch (error) {
      console.log(`🔑 ${targetProfile} requires authentication`);
    }
    
    // Start SSO login process
    console.log(`🚀 Starting SSO login for ${targetProfile}...`);
    console.log(`🌐 This will open your browser for authentication`);
    console.log(`⏰ Please complete authentication within 2 minutes`);
    
    try {
      // Run SSO login with 2 minute timeout
      execSync(`aws sso login --profile ${targetProfile}`, { 
        stdio: 'inherit', 
        timeout: 120000 // 2 minutes
      });
      
      // Verify authentication worked
      const verifyAuth = execSync(`aws sts get-caller-identity --profile ${targetProfile}`, { 
        encoding: 'utf8',
        timeout: 10000 
      });
      const parsed = JSON.parse(verifyAuth.trim());
      
      console.log(`✅ Authentication successful for ${targetProfile}!`);
      console.log(`   Account: ${parsed.Account}`);
      console.log(`   User: ${parsed.Arn.split('/').pop()}`);
      
      return {
        success: true,
        alreadyAuthenticated: false,
        profile: targetProfile,
        account: parsed.Account,
        user: parsed.Arn.split('/').pop()
      };
      
    } catch (authError) {
      if (authError.signal === 'SIGTERM') {
        throw new Error(`⏰ Authentication timeout: Please run 'aws sso login --profile ${targetProfile}' manually and try again.`);
      }
      throw new Error(`❌ Authentication failed for ${targetProfile}: ${authError.message}\n\n🔧 Try running: aws sso login --profile ${targetProfile}`);
    }
    
  } catch (error) {
    console.error(`❌ AWS login failed: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const [project, environment] = process.argv.slice(2);
  
  if (!project) {
    console.error('Usage: node aws-login.js <project> [environment]');
    console.error('Examples:');
    console.error('  node aws-login.js DTMI');
    console.error('  node aws-login.js DTMI nonprod');
    console.error('  node aws-login.js TRIC');
    console.error('  node aws-login.js TRIC nonprod');
    console.error('  node aws-login.js TRMI');
    console.error('  node aws-login.js "ASAP Fork"');
    console.error('');
    console.error('Projects: DTMI, TRIC, TRMI, ASAP Fork');
    console.error('DTMI environments: prod (default), nonprod, dev, qa, train');
    console.error('TRIC environments: prod (default), nonprod, dev, qa, train');
    console.error('TRMI/ASAP Fork environments: all use default profile');
    process.exit(1);
  }

  authenticateAWS(project, environment)
    .then(result => {
      if (result.success) {
        console.log(`\n🎉 AWS Authentication Complete!`);
        console.log(`🔗 Profile: ${result.profile}`);
        console.log(`🏢 Account: ${result.account}`);
        console.log(`👤 User: ${result.user}`);
        if (result.alreadyAuthenticated) {
          console.log(`ℹ️  Note: Was already authenticated to this profile`);
        }
        console.log(`\n💡 AWS_PROFILE environment variable is now set to: ${result.profile}`);
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

export { authenticateAWS };