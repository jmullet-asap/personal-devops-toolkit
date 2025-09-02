#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync } from 'fs';  
import dotenv from 'dotenv';
import readline from 'readline';

// Load environment variables
dotenv.config();

// Account to User Pool ID mapping
const ACCOUNT_POOLS = {
    'dtmi-nonprod': 'us-east-1_LscuOViAQ',
    'dtmi-prod': 'us-east-1_qd8J8GRQ2'
    // TRIC accounts TBD - need discovery
};

// Load default password from .env
const DEFAULT_PASSWORD = process.env.DEFAULT_COGNITO_PASSWORD;
if (!DEFAULT_PASSWORD) {
    console.error('❌ DEFAULT_COGNITO_PASSWORD not found in .env file');
    process.exit(1);
}

// CLI argument parsing
const [,, email, account = 'dtmi-prod', customPassword] = process.argv;

if (!email) {
    console.error('Usage: node aws-cognito-reset-password.js <EMAIL> [ACCOUNT] [CUSTOM_PASSWORD]');
    console.error('');
    console.error('Available accounts:');
    Object.keys(ACCOUNT_POOLS).forEach(acc => {
        console.error(`  ${acc} → ${ACCOUNT_POOLS[acc]}`);
    });
    console.error('');
    console.error('Default account: dtmi-prod');
    console.error('Default password: loaded from .env');
    process.exit(1);
}

// Validate account mapping
if (!ACCOUNT_POOLS[account]) {
    console.error(`❌ Unknown account: ${account}`);
    console.error('Available accounts:', Object.keys(ACCOUNT_POOLS).join(', '));
    process.exit(1);
}

// Validate email format (basic)
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
    console.error(`❌ Invalid email format: ${email}`);
    process.exit(1);
}

// Determine password to use
const password = customPassword || DEFAULT_PASSWORD;

console.log(`🔐 AWS Cognito Password Reset Tool`);
console.log(`=====================================`);

// AWS state management functions
function getCurrentAWSState() {
    try {
        const identity = JSON.parse(execSync('aws sts get-caller-identity', { encoding: 'utf8' }));
        const currentProfile = process.env.AWS_PROFILE || 'default';
        
        return {
            account: identity.Account,
            userId: identity.UserId,
            arn: identity.Arn,
            profile: currentProfile
        };
    } catch (error) {
        console.error('❌ Unable to determine current AWS state:', error.message);
        return null;
    }
}

function switchToProfile(targetProfile) {
    console.log(`🔄 Switching to AWS profile: ${targetProfile}`);
    
    // Set AWS_PROFILE environment variable
    process.env.AWS_PROFILE = targetProfile;
    
    // Test authentication
    try {
        const identity = JSON.parse(execSync(`aws sts get-caller-identity --profile ${targetProfile}`, { encoding: 'utf8' }));
        console.log(`✅ Authenticated to account: ${identity.Account}`);
        return identity;
    } catch (error) {
        console.log(`🔑 Authentication required for ${targetProfile}, triggering SSO login...`);
        
        try {
            execSync(`aws sso login --profile ${targetProfile}`, { stdio: 'inherit' });
            const identity = JSON.parse(execSync(`aws sts get-caller-identity --profile ${targetProfile}`, { encoding: 'utf8' }));
            console.log(`✅ Successfully authenticated to account: ${identity.Account}`);
            return identity;
        } catch (loginError) {
            console.error(`❌ Failed to authenticate to ${targetProfile}:`, loginError.message);
            throw new Error(`Authentication failed for ${targetProfile}`);
        }
    }
}

function restoreAWSState(originalState) {
    if (!originalState) return;
    
    console.log(`🔙 Restoring AWS session...`);
    console.log(`   Profile: ${originalState.profile}`);
    console.log(`   Account: ${originalState.account}`);
    
    if (originalState.profile && originalState.profile !== 'default') {
        process.env.AWS_PROFILE = originalState.profile;
    } else {
        delete process.env.AWS_PROFILE;
    }
    
    // Verify restoration worked
    try {
        const currentIdentity = JSON.parse(execSync('aws sts get-caller-identity', { encoding: 'utf8' }));
        if (currentIdentity.Account === originalState.account) {
            console.log(`✅ AWS session restored successfully`);
        } else {
            console.log(`⚠️  AWS session restoration may have failed - different account detected`);
        }
    } catch (error) {
        console.log(`⚠️  Unable to verify AWS session restoration`);
    }
}

// Interactive confirmation
function askConfirmation(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim().toLowerCase());
        });
    });
}

// Main execution
async function main() {
    let originalAWSState = null;
    
    try {
        // 1. Capture current AWS state
        console.log(`📋 Current AWS Session:`);
        originalAWSState = getCurrentAWSState();
        if (originalAWSState) {
            console.log(`   Profile: ${originalAWSState.profile}`);
            console.log(`   Account: ${originalAWSState.account}`);
            console.log(`   User: ${originalAWSState.userId}`);
        } else {
            console.log(`   ⚠️  Unable to determine current state`);
        }
        
        console.log('');
        
        // 2. Show confirmation details
        console.log(`🔐 About to reset password:`);
        console.log(`📧 User: ${email}`);
        console.log(`🏢 Account: ${account} (${ACCOUNT_POOLS[account]})`);
        console.log(`🔑 Password: ${password}`);
        console.log(`⏰ Type: Permanent (no forced change)`);
        console.log('');
        
        // 3. Get confirmation
        const response = await askConfirmation('Continue? (y/n/edit): ');
        
        if (response === 'n' || response === 'no') {
            console.log('❌ Password reset cancelled');
            return;
        }
        
        let finalPassword = password;
        
        if (response === 'edit' || response === 'e') {
            const newPassword = await askConfirmation('Enter new password: ');
            if (newPassword) {
                finalPassword = newPassword;
                console.log(`✏️  Updated password: ${finalPassword}`);
                console.log('');
            }
        }
        
        if (response !== 'y' && response !== 'yes' && response !== 'edit' && response !== 'e') {
            console.log('❌ Invalid response. Password reset cancelled');
            return;
        }
        
        // 4. Switch to target profile
        console.log(`🚀 Executing password reset...`);
        const targetIdentity = switchToProfile(account);
        
        // 5. Execute Cognito password reset
        const userPoolId = ACCOUNT_POOLS[account];
        const command = `aws cognito-idp admin-set-user-password --user-pool-id ${userPoolId} --username "${email}" --password "${finalPassword}" --permanent`;
        
        console.log(`🔧 Running AWS Cognito command...`);
        execSync(command, { stdio: 'pipe' });
        
        console.log('');
        console.log(`✅ Password reset successful!`);
        console.log(`📧 User: ${email}`);
        console.log(`🏢 Account: ${account} → ${targetIdentity.Account}`);
        console.log(`🔑 New password: ${finalPassword}`);
        console.log(`⏰ Type: Permanent (user can login immediately)`);
        
    } catch (error) {
        console.error('');
        console.error(`❌ Password reset failed:`, error.message);
        process.exit(1);
    } finally {
        // 6. Always restore original AWS state
        if (originalAWSState) {
            console.log('');
            restoreAWSState(originalAWSState);
        }
    }
}

// Execute main function
main().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
});