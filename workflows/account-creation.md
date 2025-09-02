# Account Creation Workflow

## When User Requests Account Creation

**Trigger phrases to recognize:**
- "create account for [email]"
- "create user [email]" 
- "add user [email]"
- "new account for [email]"
- "create [email] account"

## Step-by-Step Protocol

### 1. Gather Current Context & Discover User Pools
**Before doing anything, collect this information dynamically:**

```bash
# Get current AWS state (following DTMI aws_setup pattern)
# Check if current credentials are valid first
if ! aws sts get-caller-identity &>/dev/null; then
    echo "⚠️  Current AWS credentials appear invalid"
fi

aws sts get-caller-identity
```

**Extract and translate account ID:**
- Current AWS account ID → Human readable name using this mapping:
  - `801622747719` = "TRIC Management Account"
  - `604673406635` = "DTMI Production Account" 
  - `233402347455` = "DTMI Non-Production Account"
  - `default` = "Unknown/Default Account"

### 2. Parse Request Details
**From user request, determine:**
- Target email address (this becomes both username and email attribute)
- Target account (default: dtmi-prod unless specified)
- Password (default: [REDACTED] from .env)

### 3. Dynamic User Pool Discovery
**For the target account, discover user pools:**

```bash
# Switch to target account and discover user pools
export AWS_PROFILE=[target-account]

# Validate auth and discover user pools
if ! aws sts get-caller-identity --profile [target-account] &>/dev/null; then
    aws sso login --profile [target-account]
fi

# List available user pools
aws cognito-idp list-user-pools --max-results 10 --profile [target-account]
```

**Handle discovery results:**
- If 1 user pool found: Use it automatically
- If multiple user pools found: Show list and ask user to specify
- If no user pools found: Error - account has no Cognito setup

### 4. Show Confirmation Summary

**Display in plain English:**

```
👤 Account Creation Confirmation

📋 Current Situation:
   You're currently authenticated to: [ACCOUNT_NAME] ([ACCOUNT_ID])
   Using profile: [PROFILE_NAME]

🎯 Planned Action:
   → Switch to: [TARGET_ACCOUNT_NAME] ([TARGET_ACCOUNT_ID])
   → Target user pool: [USER_POOL_ID] ([USER_POOL_NAME])
   → Create user: [EMAIL]
   → Username: [EMAIL] (same as email)
   → Password: [REDACTED]
   → Password type: Permanent (no forced change on first login)
   → Email verified: Yes
   → Custom attributes: None
   → Group memberships: None
   → Restore session to: [ORIGINAL_ACCOUNT_NAME] ([ORIGINAL_PROFILE])

Does this look correct? Reply 'yes' to proceed or 'no' to cancel.
```

### 5. Wait for Confirmation
**Do NOT run any commands until user explicitly says "yes"**

If user says:
- **"yes"** → Proceed to step 6
- **"no"** → Cancel and ask what to change
- **anything else** → Ask for clarification

### 6. Execute Account Creation
**Only after confirmation, create the user:**

```bash
# Switch to target account
export AWS_PROFILE=[target-account]

# Create user with specified attributes
aws cognito-idp admin-create-user \
  --user-pool-id [USER_POOL_ID] \
  --username "[EMAIL]" \
  --user-attributes Name=email,Value=[EMAIL] Name=email_verified,Value=true \
  --temporary-password "[TEMP_PASSWORD]" \
  --message-action SUPPRESS \
  --profile [target-account]

# Immediately set permanent password (no forced change)
aws cognito-idp admin-set-user-password \
  --user-pool-id [USER_POOL_ID] \
  --username "[EMAIL]" \
  --password "[PERMANENT_PASSWORD]" \
  --permanent \
  --profile [target-account]
```

### 7. Report Results
**Show final outcome:**
- Success: Account created successfully
- Failure: Specific error message and troubleshooting

## User Creation Specifications

**Required attributes:**
- Username: Same as email address
- Email: Same as username
- Email verified: True
- Password: Permanent (no forced change)
- Temporary password: Not used (immediately replaced with permanent)

**NOT included:**
- Custom attributes
- Group memberships  
- Force password change on first login
- Temporary password workflows

## Default Password
**From .env file:** `[REDACTED]`
- 18 characters
- Meets AWS Cognito permanent password requirements
- Uppercase + lowercase + numbers + symbols

## Error Handling

**Common issues:**
- **UsernameExistsException**: User already exists
- **InvalidPasswordException**: Password doesn't meet policy
- **NotAuthorizedException**: AWS permissions issue
- **UserPoolNotFoundException**: Invalid user pool ID

**Always show specific error messages to user for troubleshooting.**

## Dynamic Discovery Benefits

- No hardcoded user pool mappings to maintain
- Adapts to new AWS accounts automatically
- Discovers infrastructure changes dynamically
- Self-documenting through discovery process