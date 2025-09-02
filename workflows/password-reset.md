# Password Reset Workflow

## When User Requests Password Reset

**Trigger phrases to recognize:**
- "reset password for [email]"
- "reset the password for [email]" 
- "password reset [email]"
- "[email] password reset"

## Step-by-Step Protocol

### 1. Gather Current Context
**Before doing anything, collect this information following aws_setup script pattern:**

```bash
# Get current AWS state (following DTMI aws_setup pattern)
# Check if current credentials are valid first
if ! aws sts get-caller-identity &>/dev/null; then
    echo "⚠️  Current AWS credentials appear invalid"
fi

aws sts get-caller-identity
```

**Extract and translate:**
- Current AWS account ID → Human readable name using this mapping:
  - `801622747719` = "TRIC Management Account"
  - `604673406635` = "DTMI Production Account" 
  - `233402347455` = "DTMI Non-Production Account"
  - `default` = "Unknown/Default Account"
- Current profile (from $AWS_PROFILE or 'default')
- Current user identity

**Account ID Translation:**
Always show both numeric ID and human name: "DTMI Production (604673406635)"

### 2. Parse Request Details
**From user request, determine:**
- Target email address
- Target account (default: dtmi-prod unless specified)
- Custom password (default: DiscountTire1$DTMI! from .env)

### 3. Show Confirmation Summary

**Display in plain English:**

```
🔐 Password Reset Confirmation

📋 Current Situation:
   You're currently authenticated to: [ACCOUNT_NAME] ([ACCOUNT_ID])
   Using profile: [PROFILE_NAME]
   As user: [USER_IDENTITY]

🎯 Planned Action:
   → Switch to: DTMI Production (604673406635)
   → Target user pool: us-east-1_qd8J8GRQ2
   → Reset password for: [EMAIL]
   → New password: DiscountTire1$DTMI!
   → Password type: Permanent (user can login immediately)
   → Restore session to: [ORIGINAL_ACCOUNT_NAME] ([ORIGINAL_PROFILE])

Does this look correct? Reply 'yes' to proceed or 'no' to cancel.
```

### 4. Wait for Confirmation
**Do NOT run any MCP tools until user explicitly says "yes"**

If user says:
- **"yes"** → Proceed to step 5
- **"no"** → Cancel and ask what to change
- **anything else** → Ask for clarification

### 5. Execute Password Reset
**Only after confirmation, use MCP tool:**

```
reset_cognito_password(
  email: [EMAIL],
  account: [ACCOUNT], 
  password: [PASSWORD if custom]
)
```

### 6. Report Results
**Show final outcome:**
- Success: Password reset completed
- Failure: Specific error message and troubleshooting

## Account Mapping Reference

- **dtmi-prod**: `us-east-1_qd8J8GRQ2` (production)
- **dtmi-nonprod**: `us-east-1_LscuOViAQ` (development/testing)

## Default Password
**From .env file:** `DiscountTire1$DTMI!`
- 18 characters
- Meets AWS Cognito permanent password requirements
- Uppercase + lowercase + numbers + symbols

## Error Handling

**Common issues:**
- **InvalidPasswordException**: Password doesn't meet policy
- **UserNotFoundException**: User doesn't exist in user pool
- **NotAuthorizedException**: AWS permissions issue

**Always show specific error messages to user for troubleshooting.**