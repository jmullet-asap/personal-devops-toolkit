# AWS Authentication Workflow

## When User Requests AWS Profile Switching

**Trigger phrases to recognize:**
- "log into [project] [environment]"
- "switch to [project] [environment]"
- "authenticate to [profile]"
- "login to [account]"
- "auth to [project] prod"
- "switch to default account"

## Step-by-Step Protocol

### 1. Gather Current AWS Context
**Before doing anything, collect current authentication state:**

```bash
# Get current AWS state
if ! aws sts get-caller-identity &>/dev/null; then
    echo "⚠️  No current AWS authentication detected"
    CURRENT_STATE="None"
else
    CURRENT_IDENTITY=$(aws sts get-caller-identity)
    CURRENT_ACCOUNT=$(echo "$CURRENT_IDENTITY" | jq -r '.Account')
    CURRENT_USER=$(echo "$CURRENT_IDENTITY" | jq -r '.UserId')
    CURRENT_PROFILE=${AWS_PROFILE:-"default"}
fi
```

### 2. Parse Request & Map to AWS Profile

**From user request, determine target profile using existing mapping:**

```bash
# Function to parse authentication request
parse_auth_request() {
    local request="$1"
    
    # Normalize to lowercase for parsing
    local lower_request=$(echo "$request" | tr '[:upper:]' '[:lower:]')
    
    case "$lower_request" in
        *"dtmi"*"prod"*|*"dtmi production"*)
            echo "dtmi-prod"
            ;;
        *"dtmi"*"nonprod"*|*"dtmi"*"non-prod"*|*"dtmi"*"dev"*|*"dtmi"*"qa"*|*"dtmi"*"train"*)
            echo "dtmi-nonprod"
            ;;
        *"dtmi"*)
            # Default DTMI to prod if no environment specified
            echo "dtmi-prod"
            ;;
        *"trmi"*|*"asap"*|*"tire rack"*|*"tric"*|*"default"*)
            echo "default"
            ;;
        *)
            echo "UNKNOWN"
            return 1
            ;;
    esac
}

# Function to get account info from profile
get_account_info() {
    local profile="$1"
    
    case "$profile" in
        "dtmi-prod")
            echo "DTMI Production Account|604673406635"
            ;;
        "dtmi-nonprod")
            echo "DTMI Non-Production Account|233402347455"
            ;;
        "default")
            echo "TRIC Management Account|801622747719"
            ;;
        *)
            echo "Unknown Account|Unknown"
            ;;
    esac
}
```

### 3. Show Quick Status & Execute Immediately

**Display brief current state and execute immediately (no confirmation needed):**

```bash
# Function to show quick status and execute
quick_auth_status_and_execute() {
    local current_state="$1"
    local target_profile="$2" 
    local target_account_info="$3"
    
    local target_account_name=$(echo "$target_account_info" | cut -d'|' -f1)
    local target_account_id=$(echo "$target_account_info" | cut -d'|' -f2)
    
    if [[ "$current_state" == "None" ]]; then
        echo "🔐 No current AWS authentication detected"
        echo "🎯 Logging into: $target_account_name ($target_account_id)"
    elif [[ "$CURRENT_PROFILE" == "$target_profile" ]]; then
        echo "✅ Already authenticated to: $target_account_name ($target_account_id)"
        echo "🔄 Refreshing credentials..."
    else
        echo "🔄 Switching AWS authentication:"
        echo "   From: $(get_account_name_from_id "$CURRENT_ACCOUNT") ($CURRENT_ACCOUNT) [$CURRENT_PROFILE]"
        echo "   To: $target_account_name ($target_account_id) [$target_profile]"
    fi
    
    echo ""
    echo "🚀 Executing authentication..."
}
```

**Example Status Messages:**

**User says**: "log into DTMI prod" (when currently in TRIC)
**System shows**:
```
🔄 Switching AWS authentication:
   From: TRIC Management Account (801622747719) [default]
   To: DTMI Production Account (604673406635) [dtmi-prod]

🚀 Executing authentication...
```

**User says**: "switch to DTMI prod" (when already in DTMI prod)
**System shows**:
```
✅ Already authenticated to: DTMI Production Account (604673406635)
🔄 Refreshing credentials...

🚀 Executing authentication...
```

### 4. Execute Profile Switch & Authentication (Immediate Execution)

**Execute immediately after showing status (no confirmation required):**

```bash
# Function to switch AWS profile and authenticate
switch_aws_profile() {
    local target_profile="$1"
    local account_info="$2"
    
    echo "🔄 Switching to AWS profile: $target_profile"
    
    # Set AWS_PROFILE environment variable
    export AWS_PROFILE="$target_profile"
    
    echo "✅ AWS_PROFILE set to: $target_profile"
    
    # Check if current credentials are valid
    if aws sts get-caller-identity --profile "$target_profile" &>/dev/null; then
        echo "✅ Existing credentials are valid"
    else
        echo "🔑 Credentials invalid or expired, triggering SSO login..."
        
        # Trigger SSO login
        if aws sso login --profile "$target_profile"; then
            echo "✅ SSO login successful"
        else
            echo "❌ SSO login failed"
            return 1
        fi
    fi
    
    # Verify authentication worked
    local new_identity
    if new_identity=$(aws sts get-caller-identity --profile "$target_profile" 2>/dev/null); then
        local new_account=$(echo "$new_identity" | jq -r '.Account')
        local new_user=$(echo "$new_identity" | jq -r '.UserId')
        
        echo ""
        echo "✅ Authentication successful!"
        echo "🎯 Now authenticated to:"
        echo "   Account: $(echo "$account_info" | cut -d'|' -f1) ($new_account)"
        echo "   Profile: $target_profile"
        echo "   User: $new_user"
        echo ""
        echo "🚀 You can now use AWS CLI commands with this profile"
        echo "💡 This profile will persist for this terminal session"
        
        return 0
    else
        echo "❌ Authentication verification failed"
        return 1
    fi
}

# Execute the switch
TARGET_PROFILE=$(parse_auth_request "$USER_REQUEST")
ACCOUNT_INFO=$(get_account_info "$TARGET_PROFILE")

if [[ "$TARGET_PROFILE" == "UNKNOWN" ]]; then
    echo "❌ Unable to determine target AWS profile from request"
    echo "Available options:"
    echo "  - 'log into DTMI prod' → dtmi-prod"
    echo "  - 'log into DTMI non-prod' → dtmi-nonprod"  
    echo "  - 'switch to default' → default (TRIC)"
    return 1
fi

switch_aws_profile "$TARGET_PROFILE" "$ACCOUNT_INFO"
```

### 5. Report Results
**Show final authentication state:**

- **Success**: Clear confirmation of new authentication state
- **Failure**: Specific error message and troubleshooting steps

## Request Parsing Examples

### Scenario 1: Basic Profile Switch
**User says**: "log into DTMI prod"
**System should**:
1. Parse: Target=dtmi-prod, Account=DTMI Production
2. Show current vs target authentication status
3. Execute profile switch and SSO login immediately
4. Report successful authentication results

### Scenario 2: Environment Specified
**User says**: "switch to DTMI non-prod"
**System should**:
1. Parse: Target=dtmi-nonprod, Account=DTMI Non-Production
2. Handle multiple environments (dev/qa/train all use dtmi-nonprod)
3. Show appropriate account information

### Scenario 3: Default Account
**User says**: "authenticate to default account"
**System should**:
1. Parse: Target=default, Account=TRIC Management
2. Switch to default profile (TRMI/ASAP Fork account)

### Scenario 4: Already Authenticated
**User says**: "log into DTMI prod" (when already in dtmi-prod)
**System should**:
1. Detect current profile matches target
2. Show: "Already authenticated to DTMI Production Account"
3. Refresh credentials automatically to ensure they're valid

## Profile Mapping Reference

**Available AWS Profiles:**
- **dtmi-prod**: DTMI Production Account (604673406635)
- **dtmi-nonprod**: DTMI Non-Production Account (233402347455) - handles dev, qa, train
- **default**: TRIC Management Account (801622747719) - TRMI/ASAP Fork

## Natural Language Patterns

**Supported request patterns:**
- "log into [project] [environment]"
- "switch to [project] [environment]"
- "authenticate to [profile name]"
- "auth to [project] prod"
- "login to default"

**Project name recognition:**
- DTMI, Discount Tire → dtmi profiles
- TRMI, ASAP Fork, Tire Rack, TRIC, default → default profile

**Environment recognition:**
- prod, production → prod environment
- dev, development, qa, train, nonprod, non-prod → non-prod environment

## Error Handling

**Common Issues:**
- **SSO login failed**: Network issues or expired SSO session
- **Unknown profile**: Unrecognized project/environment combination
- **Invalid credentials**: Profile exists but authentication failed
- **No current auth**: No existing AWS authentication detected

## Security Notes

- **Session persistence**: AWS_PROFILE persists for current terminal session only
- **Credential security**: Uses existing AWS SSO infrastructure
- **No credential storage**: Relies on AWS CLI credential cache
- **Profile isolation**: Each profile has independent credentials and permissions