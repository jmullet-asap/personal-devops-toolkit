# Database Access Workflow

## When User Requests Database Access

**Trigger phrases to recognize:**
- "port forward to [project] [environment]"
- "connect to [project] database"
- "what's the status of order [id] in [project]?"
- "query [table] in [project]"
- "show me [data] from [project] database"
- "check [something] in the database"

## Step-by-Step Protocol

### 1. Gather Current Context & Parse Request
**Before doing anything, collect this information:**

```bash
# Get current AWS state (following DTMI aws_setup pattern)
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

### 2. Parse Request Details & Discover Database Configuration

**From user request, determine:**
- Target project (DTMI, ASAP Fork/TRMI)
- Target environment (dev, qa, train, prod) - **DEFAULTS TO PROD** if not specified
- Target database (app, bi) - ASAP Fork only, defaults to app
- Query intent (port forward only, or specific query)

**Environment Detection & Default Logic:**

```bash
# Function to parse and default environment
parse_environment() {
    local request="$1"
    local project="$2"
    
    # Extract environment from request (case insensitive)
    if [[ "$request" =~ (dev|development) ]]; then
        echo "dev"
    elif [[ "$request" =~ (qa|quality|staging) ]]; then
        echo "qa"  
    elif [[ "$request" =~ (train|training|demo) ]]; then
        echo "train"
    elif [[ "$request" =~ (prod|production) ]]; then
        echo "prod"
    else
        # DEFAULT TO PRODUCTION if not specified
        echo "prod"
        echo "WARNING: No environment specified, defaulting to PRODUCTION" >&2
    fi
}

# Function to validate environment for project  
validate_environment() {
    local project="$1"
    local environment="$2"
    
    case "$project" in
        "dtmi")
            case "$environment" in
                "prod") 
                    echo "dtmi-prod" # Dedicated prod account
                    ;;
                "dev"|"qa"|"train")
                    echo "dtmi-nonprod" # All non-prod environments in one account
                    ;;
                *)
                    echo "ERROR: Invalid DTMI environment: $environment" >&2
                    return 1
                    ;;
            esac
            ;;
        "asap-fork")
            case "$environment" in
                "dev"|"qa"|"train"|"prod")
                    echo "default" # All environments use default profile
                    ;;
                *)
                    echo "ERROR: Invalid ASAP Fork environment: $environment" >&2
                    return 1
                    ;;
            esac
            ;;
    esac
}
```

**Dynamic Database Discovery Pattern:**

**For DTMI:**
```bash
# DTMI pattern: single database per environment
PROJECT="dtmi"
ENVIRONMENT="[parsed_environment]"  # dev, qa, train, prod
BASTION_TAG="dtmi-${ENVIRONMENT}-db-bastion"
SECRET_ID="/dtmi/${ENVIRONMENT}/database/secret"
DATABASE_NAME="dtmi"
```

**For ASAP Fork/TRMI:**
```bash
# ASAP Fork pattern: multiple databases per environment
PROJECT="trmi" 
ENVIRONMENT="[parsed_environment]"  # dev, qa, train, prod
DATABASE_TYPE="[parsed_type]"       # app (-a) or bi (-b)

if [[ "$DATABASE_TYPE" == "app" ]]; then
    BASTION_TAG="trmi-${ENVIRONMENT}-db-bastion"
    SECRET_ID="/trmi/${ENVIRONMENT}/database/secret"
    DATABASE_NAME="trmi"
elif [[ "$DATABASE_TYPE" == "bi" ]]; then
    BASTION_TAG="trmi-${ENVIRONMENT}-bi-db-bastion"
    SECRET_ID="/trmi/${ENVIRONMENT}/bi/database/secret"
    DATABASE_NAME="bi"
fi
```

### 3. Dynamic Port Selection
**Find available local port automatically:**

```bash
# Function to find next available port
find_available_port() {
    local start_port=$1
    local port=$start_port
    
    while lsof -i :$port &>/dev/null; do
        ((port++))
        if [[ $port -gt $((start_port + 100)) ]]; then
            echo "ERROR: No available ports found in range $start_port-$((start_port + 100))"
            return 1
        fi
    done
    
    echo $port
}

# Base port suggestions (but adapt if occupied)
case "$PROJECT-$ENVIRONMENT" in
    "dtmi-dev") BASE_PORT=3307 ;;
    "dtmi-qa") BASE_PORT=3309 ;;
    "dtmi-train") BASE_PORT=3310 ;;
    "dtmi-prod") BASE_PORT=3308 ;;
    "trmi-"*"-app") BASE_PORT=3307 ;;  # Will increment for env
    "trmi-"*"-bi") BASE_PORT=3407 ;;   # Will increment for env
esac

LOCAL_PORT=$(find_available_port $BASE_PORT)
```

### 4. Execute Connection Immediately 

**⚠️ NO CONFIRMATIONS for database connections - execute immediately for speed**

**Show brief status during execution:**

```
🚀 Fast database connection: [PROJECT] [ENVIRONMENT]
🎯 Target: [normalized_project] [environment] [database_type] database
🔧 AWS Profile: [target_profile]
🔄 Switched AWS profile: [old] → [new] (if needed)
🔑 Triggering SSO login for [profile]... (if needed)
🔍 Discovering bastion host: [bastion_tag]
✅ Found bastion: [instance_id]
🔐 Retrieving database credentials...
🔌 Using local port: [available_port]
🌉 Starting port forwarding: [db_host]:[db_port] → 127.0.0.1:[local_port]
⏳ Waiting for port forwarding to establish...
✅ Port forwarding established on [port]
✅ Added/Updated Beekeeper connection: [connection_name]
🐝 Launching Beekeeper Studio...
```

**Example Execution Flow:**

**User says**: "connect to TRMI database"
**System executes**:
```
🚀 Fast database connection: TRMI prod
🎯 Target: asap-fork prod app database  
🔧 AWS Profile: default
🔍 Discovering bastion host: trmi-prod-db-bastion
✅ Found bastion: i-1234567890abcdef0
🔐 Retrieving database credentials...
🔌 Using local port: 3307
🌉 Starting port forwarding: trmi-db.cluster-xyz.us-east-1.rds.amazonaws.com:3306 → 127.0.0.1:3307
✅ Port forwarding established on 3307
✅ Updated existing Beekeeper connection: ASAP-FORK prod (Auto)
🐝 Launching Beekeeper Studio...
```

**User says**: "connect to DTMI QA"  
**System executes**:
```
🚀 Fast database connection: DTMI qa
🎯 Target: dtmi qa database
🔧 AWS Profile: dtmi-nonprod
🔄 Switched AWS profile: default → dtmi-nonprod
🔍 Discovering bastion host: dtmi-qa-db-bastion
✅ Found bastion: i-abcdef1234567890
🔐 Retrieving database credentials...
🔌 Using local port: 3308
✅ Added new Beekeeper connection: DTMI qa (Auto)
🐝 Launching Beekeeper Studio...
```

## Request Parsing Examples

**⚠️ UPDATED: NO CONFIRMATIONS - Execute immediately for speed**

### Scenario 1: Ambiguous Request  
**User says**: "show me recent orders from TRMI"
**System should**:
1. Parse: Project=ASAP Fork, Environment=prod (DEFAULTED), Database=trmi
2. Log: "⚠️ NO ENVIRONMENT SPECIFIED - DEFAULTING TO PRODUCTION" (in execution output)
3. Execute connection immediately
4. If multiple bastion hosts found, error and suggest being more specific

### Scenario 2: Environment Specified  
**User says**: "connect to DTMI dev database"
**System should**:
1. Parse: Project=DTMI, Environment=dev (EXPLICIT), Account=dtmi-nonprod
2. Show: "Environment explicitly requested: dev"
3. Proceed with dtmi-nonprod AWS profile

### Scenario 3: Multiple Bastion Hosts Detected
**User says**: "port forward to TRMI" (and 4 bastion hosts exist)
**System should**:
1. Parse: Project=ASAP Fork, Environment=prod (DEFAULTED)
2. Discover multiple bastion hosts in default account
3. Error: "Multiple environments detected. Please specify environment explicitly."
4. Show examples: "Try: 'TRMI dev', 'TRMI qa', 'TRMI prod'"

### Scenario 4: Explicit Environment + Database
**User says**: "query the BI database in ASAP Fork QA"
**System should**:
1. Parse: Project=ASAP Fork, Environment=qa (EXPLICIT), Database=bi
2. Use: AWS profile=default, Database=bi, Bastion=trmi-qa-bi-db-bastion
3. Show: "Environment explicitly requested: qa"

### 5. Wait for Confirmation
**Do NOT run any commands until user explicitly says "yes"**

### 6. Execute Database Connection
**Only after confirmation, establish connection:**

```bash
# Switch to target AWS profile if needed
if [[ "$CURRENT_PROFILE" != "$TARGET_PROFILE" ]]; then
    export AWS_PROFILE=$TARGET_PROFILE
    
    # Validate auth following aws_setup pattern
    if ! aws sts get-caller-identity --profile $TARGET_PROFILE &>/dev/null; then
        aws sso login --profile $TARGET_PROFILE
    fi
fi

# Discover bastion host(s) - handle multiple environments
INSTANCE_IDS=$(aws ec2 describe-instances \
    --filter Name=tag:Name,Values=$BASTION_TAG \
    --query "Reservations[].Instances[?State.Code==\`16\`].InstanceId" \
    --output text)

if [[ -z "$INSTANCE_IDS" ]]; then
    echo "ERROR: No bastion host found for $BASTION_TAG"
    return 1
fi

# Handle multiple bastion hosts (common in ASAP Fork/TRMI)
INSTANCE_COUNT=$(echo "$INSTANCE_IDS" | wc -w)
if [[ $INSTANCE_COUNT -gt 1 ]]; then
    echo "⚠️  Multiple bastion hosts found for $BASTION_TAG:"
    aws ec2 describe-instances \
        --filter Name=tag:Name,Values=$BASTION_TAG \
        --query "Reservations[].Instances[?State.Code==\`16\`].[InstanceId,Tags[?Key==\`Name\`].Value|[0]]" \
        --output table
    
    echo "ERROR: Multiple environments detected. Please specify environment explicitly."
    echo "Examples: 'TRMI dev', 'TRMI qa', 'TRMI prod'"
    return 1
fi

INSTANCE_ID=$(echo "$INSTANCE_IDS" | head -n1)

# Retrieve database credentials
DATABASE_SECRET=$(aws secretsmanager get-secret-value \
    --secret-id $SECRET_ID \
    --query SecretString --output text)

if [[ -z "$DATABASE_SECRET" ]]; then
    echo "ERROR: No database secret found for $SECRET_ID"
    return 1
fi

export DB_HOST=$(echo $DATABASE_SECRET | jq .host -r)
export DB_PORT=$(echo $DATABASE_SECRET | jq .port -r)
export DB_PASSWORD=$(echo $DATABASE_SECRET | jq .password -r)

# CRITICAL: Username is ALWAYS 'admin' regardless of what secrets claim
export DB_USERNAME="admin"

# Kill existing port forwarding on target port
PID=$(lsof -i tcp:$LOCAL_PORT -n | grep session-m | awk '{print $2}')
if [[ -n "$PID" ]]; then
    kill -9 $PID
    echo "Killed existing port forwarding on port $LOCAL_PORT"
fi

# Start SSM port forwarding session
echo "Starting port forwarding: $DB_HOST:$DB_PORT -> 127.0.0.1:$LOCAL_PORT"

aws ssm start-session \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --target $INSTANCE_ID \
    --parameters "{\"host\":[\"$DB_HOST\"],\"portNumber\":[\"$DB_PORT\"],\"localPortNumber\":[\"$LOCAL_PORT\"]}" &

# Wait for connection to establish
sleep 3

echo "✅ Port forwarding established!"
echo "🔗 Connection details:"
echo "   Host: 127.0.0.1"
echo "   Port: $LOCAL_PORT"
echo "   User: admin (⚠️ ALWAYS 'admin' - secrets may lie!)"
echo "   Pass: $DB_PASSWORD"
echo "   Database: $DATABASE_NAME"
```

### 7. Execute Read-Only Query (if requested)
**If user requested specific query, execute it safely:**

```bash
# Only if query was requested and confirmed
if [[ -n "$USER_QUERY" ]]; then
    # Validate query is read-only (starts with SELECT)
    if [[ ! "$USER_QUERY" =~ ^[[:space:]]*SELECT ]]; then
        echo "ERROR: Only SELECT queries are allowed for safety"
        return 1
    fi
    
    # Execute query with timeout and row limit
    # Note: Username is ALWAYS 'admin' regardless of what secrets say
    mysql -h 127.0.0.1 -P $LOCAL_PORT -u admin -p$DB_PASSWORD \
          -D $DATABASE_NAME \
          -e "SET SESSION sql_select_limit=100; $USER_QUERY" \
          --connect-timeout=10
fi
```

## Project-Specific Patterns

### DTMI Database Access
- **Environments**: dev, qa, train, prod
- **Command pattern**: `source ./scripts/rds-port-forwarding.sh [env] [port]`
- **Database**: Single `dtmi` database per environment
- **Common tables**: `order`, `user`, `location`
- **Bastion naming**: `dtmi-[env]-db-bastion`
- **Secret path**: `/dtmi/[env]/database/secret`

### ASAP Fork (TRMI) Database Access  
- **Environments**: dev, qa, train, prod
- **Command pattern**: `source ./scripts/rds-port-forwarding.sh [env] [port] [-a|-b]`
- **Databases**: 
  - App database (`-a`): `trmi` database
  - BI database (`-b`): `bi` database
- **Common tables**: 
  - App: `endpoint_log`, `order`, `location` (called `site`)
  - BI: Analytics and reporting tables
- **Bastion naming**: 
  - App: `trmi-[env]-db-bastion`
  - BI: `trmi-[env]-bi-db-bastion`
- **Secret paths**:
  - App: `/trmi/[env]/database/secret`
  - BI: `/trmi/[env]/bi/database/secret`

## Safety Features

- **Read-only access**: Only SELECT queries allowed
- **Query limits**: Max 100 rows returned, 10 second timeout
- **Port conflict resolution**: Auto-finds available ports
- **Session cleanup**: Kills existing port forwarding before starting new
- **Credential security**: Never logs passwords in CI environments
- **Confirmation required**: Always show connection details before proceeding

## Error Handling

**Common Issues**:
- **No bastion host found**: Environment doesn't exist or bastion is stopped
- **No database secret**: Secrets Manager access issue or wrong secret path
- **Port already in use**: Automatically finds next available port
- **SSM session failed**: IAM permissions or bastion host connectivity issue
- **Query timeout**: Database overloaded or complex query

**Always provide specific error messages and troubleshooting steps.**

## ⚠️ CRITICAL: Project Name Mapping

**The biggest confusion: User language vs Code vs AWS profiles**

### TRMI/ASAP Fork Project:
- **User says**: "TRMI", "ASAP Fork", "Tire Rack"
- **Codebase folder**: `/repos/asap-fork/`
- **Code references**: `trmi` (in scripts, database names, etc.)
- **AWS profile**: `default` (NOT "trmi" or "asap-fork")
- **Database names**: `trmi` (app), `bi` (business intelligence)

### DTMI Project:
- **User says**: "DTMI", "Discount Tire"
- **Codebase folder**: `/repos/dtmi/`
- **Code references**: `dtmi` (consistent)
- **AWS profiles**: `dtmi-prod`, `dtmi-nonprod`
- **Database name**: `dtmi`

### Account ID Mapping:
- **TRMI/ASAP Fork** (AWS profile: `default`):
  - Account ID: `801622747719` = "TRIC Management Account"
- **DTMI** (AWS profiles: `dtmi-prod`, `dtmi-nonprod`):
  - Prod: `604673406635` = "DTMI Production Account"
  - Non-prod: `233402347455` = "DTMI Non-Production Account"

## Project Detection Logic

**When user mentions any of these terms, map to correct project:**

```bash
# Function to normalize project name
normalize_project_name() {
    local input="$1"
    case "$input" in
        "TRMI"|"trmi"|"ASAP Fork"|"asap-fork"|"Tire Rack"|"TRIC"|"tric")
            echo "asap-fork"
            return 0
            ;;
        "DTMI"|"dtmi"|"Discount Tire")
            echo "dtmi"
            return 0
            ;;
        *)
            echo "UNKNOWN"
            return 1
            ;;
    esac
}

# Function to get AWS profile from project
get_aws_profile() {
    local project="$1"
    local environment="$2"
    
    case "$project" in
        "asap-fork")
            echo "default"  # CRITICAL: ASAP Fork uses 'default' profile
            ;;
        "dtmi")
            case "$environment" in
                "prod") echo "dtmi-prod" ;;
                *) echo "dtmi-nonprod" ;;
            esac
            ;;
    esac
}
```

## Terminology Translation

**Cross-project database terminology**:
- ASAP Fork `site` = DTMI `location`
- ASAP Fork `endpoint_log` = DTMI request/response logs
- ASAP Fork `order` = DTMI `order` (similar structure)
- ASAP Fork `trmi` database = Main app database
- ASAP Fork `bi` database = Business intelligence/analytics

**Environment mapping**:
- `dev` = Development/testing
- `qa` = Quality assurance/staging
- `train` = Training/demo environment
- `prod` = Production (handle with extra care)

## 🚨 KEY TAKEAWAYS FOR CLAUDE

**NEVER ASSUME ENVIRONMENT - ALWAYS BE EXPLICIT:**
1. **Default to production** when no environment specified
2. **Show warning** when defaulting: "⚠️ NO ENVIRONMENT SPECIFIED - DEFAULTING TO PRODUCTION"
3. **Require explicit confirmation** before proceeding to any environment
4. **Handle multiple bastion hosts** by asking for specific environment
5. **Map account correctly**:
   - DTMI prod → `dtmi-prod` AWS profile  
   - DTMI (dev/qa/train) → `dtmi-nonprod` AWS profile
   - TRMI/ASAP Fork (all environments) → `default` AWS profile

**CRITICAL AUTHENTICATION RULES:**
- **Username is ALWAYS 'admin'** - secrets will lie and say jmullet/root/whatever, ignore them
- **Password comes from secrets** - this is correct
- **Connection always**: `mysql -u admin -p[password from secrets]`

**CRITICAL PARSING RULES:**
- "TRMI" = asap-fork project + default AWS profile + trmi database
- "DTMI QA" = dtmi project + dtmi-nonprod AWS profile + qa environment
- "show me recent orders from TRMI" = PRODUCTION (defaulted) + warning + confirmation required

## Example User Request Translations

**User says**: "show me recent orders from TRMI"
**System translates to**:
- Project: `asap-fork` (codebase folder)
- AWS Profile: `default` (NOT trmi!)
- Database: `trmi` (app database)
- Table: `order`

**User says**: "port forward to DTMI dev"
**System translates to**:
- Project: `dtmi` (codebase folder)
- AWS Profile: `dtmi-nonprod`
- Database: `dtmi`