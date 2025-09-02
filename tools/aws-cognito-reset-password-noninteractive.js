#!/usr/bin/env node

import { execSync } from 'child_process';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Account to User Pool ID mapping
const ACCOUNT_POOLS = {
    'dtmi-nonprod': 'us-east-1_LscuOViAQ',
    'dtmi-prod': 'us-east-1_qd8J8GRQ2'
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
    console.error('Usage: node aws-cognito-reset-password-noninteractive.js <EMAIL> [ACCOUNT] [CUSTOM_PASSWORD]');
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

console.log(`🔐 AWS Cognito Password Reset - Non-Interactive Mode`);
console.log(`=====================================================`);

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
        console.log(`✅ Successfully authenticated to account: ${identity.Account}`);
        console.log(`👤 User: ${identity.UserId}`);
        return identity;
    } catch (error) {
        console.log(`🔑 Authentication required for ${targetProfile}, triggering SSO login...`);
        
        try {
            execSync(`aws sso login --profile ${targetProfile}`, { stdio: 'inherit' });
            const identity = JSON.parse(execSync(`aws sts get-caller-identity --profile ${targetProfile}`, { encoding: 'utf8' }));
            console.log(`✅ Successfully authenticated to account: ${identity.Account}`);
            console.log(`👤 User: ${identity.UserId}`);
            return identity;
        } catch (loginError) {
            console.error(`❌ Failed to authenticate to ${targetProfile}:`, loginError.message);
            throw new Error(`Authentication failed for ${targetProfile}`);
        }
    }
}

function restoreAWSState(originalState) {
    if (!originalState) return;
    
    console.log(`🔙 Restoring AWS session to original state...`);
    console.log(`   → Profile: ${originalState.profile}`);
    console.log(`   → Account: ${originalState.account}`);
    console.log(`   → User: ${originalState.userId}`);
    
    if (originalState.profile && originalState.profile !== 'default') {
        process.env.AWS_PROFILE = originalState.profile;
    } else {
        delete process.env.AWS_PROFILE;
    }
    
    // Verify restoration worked
    try {
        const currentIdentity = JSON.parse(execSync('aws sts get-caller-identity', { encoding: 'utf8' }));
        if (currentIdentity.Account === originalState.account) {
            console.log(`✅ AWS session successfully restored`);
        } else {
            console.log(`⚠️  Warning: Current account (${currentIdentity.Account}) differs from original (${originalState.account})`);
        }
    } catch (error) {
        console.log(`⚠️  Unable to verify AWS session restoration: ${error.message}`);
    }
}

// Main execution
async function main() {
    let originalAWSState = null;
    
    try {
        // 1. Capture and display current AWS state
        console.log(`📋 Current AWS Session State:`);
        originalAWSState = getCurrentAWSState();
        if (originalAWSState) {
            console.log(`   Profile: ${originalAWSState.profile}`);
            console.log(`   Account: ${originalAWSState.account}`);
            console.log(`   User: ${originalAWSState.userId}`);
        } else {
            console.log(`   ⚠️  Unable to determine current state`);
        }
        
        console.log('');
        console.log(`🎯 Password Reset Operation Details:`);
        console.log(`   📧 Target User: ${email}`);
        console.log(`   🏢 Target Account: ${account} (${ACCOUNT_POOLS[account]})`);
        console.log(`   🔑 Password: ${password}`);
        console.log(`   ⏰ Type: Permanent (no forced change on next login)`);
        console.log('');
        
        // 2. Switch to target profile with verbose logging
        console.log(`🚀 Beginning AWS profile switch and password reset...`);
        const targetIdentity = switchToProfile(account);
        console.log('');
        
        // 3. Execute Cognito password reset with verbose logging
        const userPoolId = ACCOUNT_POOLS[account];
        const command = `aws cognito-idp admin-set-user-password --user-pool-id ${userPoolId} --username "${email}" --password "${password}" --permanent`;
        
        console.log(`🔧 Executing AWS Cognito command:`);
        console.log(`   Command: aws cognito-idp admin-set-user-password`);
        console.log(`   User Pool: ${userPoolId}`);
        console.log(`   Username: ${email}`);
        console.log(`   Password: ${password}`);
        console.log(`   Mode: --permanent`);
        console.log('');
        
        execSync(command, { stdio: 'pipe' });
        
        console.log(`✅ Password reset completed successfully!`);
        console.log(`📊 Operation Summary:`);
        console.log(`   📧 User: ${email}`);
        console.log(`   🏢 Account: ${account} → ${targetIdentity.Account}`);
        console.log(`   🔑 New Password: ${password}`);
        console.log(`   ⏰ Status: Permanent (user can login immediately)`);
        console.log('');
        
    } catch (error) {
        console.error('');
        console.error(`❌ Password reset operation failed:`);
        console.error(`   Error: ${error.message}`);
        console.error('');
        
        if (error.message.includes('InvalidPasswordException')) {
            console.error(`💡 Password Policy Violation:`);
            console.error(`   The password "${password}" does not meet AWS Cognito requirements`);
            console.error(`   Try a longer password with mixed case, numbers, and symbols`);
        } else if (error.message.includes('UserNotFoundException')) {
            console.error(`💡 User Not Found:`);
            console.error(`   The user "${email}" does not exist in the user pool`);
        } else if (error.message.includes('NotAuthorizedException')) {
            console.error(`💡 Authorization Issue:`);
            console.error(`   Check AWS credentials and permissions for account ${account}`);
        }
        
        process.exit(1);
    } finally {
        // 4. Always restore original AWS state with verbose logging
        if (originalAWSState) {
            console.log(`🔄 Restoring original AWS session...`);
            restoreAWSState(originalAWSState);
        }
    }
}

// Execute main function
main().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
});