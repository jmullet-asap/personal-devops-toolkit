# Command Hub Capabilities

*Last updated: 2025-08-01*

## Mission

Command Hub is your personal AI command center - a global assistant that automates repetitive tasks through natural language commands. When summoned with `hub`, Claude has access to all your repositories and a growing toolkit of automation capabilities.

## Philosophy

**"Never drag a file if a tool can pull it. Let humans talk to systems in their own language."**

Build small, reusable tools that chain together. Let AI and CLI work together seamlessly.

---

## 🚀 Available Tools

### 1. Git Branch Management *(NEW)*

**What it does:** Automate the complete branch creation workflow for JIRA tickets with validation, stashing, and context.

**How to use:**
- "create branch for ticket 1384"
- "make a new branch for FRON-1234 in TRIC"
- "start working on ticket 1500"
- "create a bugfix branch for ticket 1843 in DTMI"

**What happens:**
1. **Validates ticket exists** in JIRA FRON board before proceeding
2. **Reads ticket details** for full context (summary, type, status)
3. **Auto-detects branch type** from JIRA issue type (Bug → bugfix, Story → feature)
4. **Stashes uncommitted work** to preserve your current changes
5. **Switches to dev** and pulls latest changes
6. **Creates properly named branch**: `jmullet/[bugfix|feature]/fron-[number]`
7. **Reapplies stashed changes** to your new branch

**Smart Features:**
- **Project auto-detection** from current directory or explicit specification
- **Branch naming consistency** follows team conventions automatically
- **Zero data loss** - preserves all uncommitted work
- **JIRA integration** - shows ticket summary and links in output
- **Error handling** - validates everything before making changes

**Project Support:**
- **TRIC** (`/Users/joshuamullet/repos/tric`)
- **DTMI** (`/Users/joshuamullet/repos/dtmi`) 
- **TRMI/ASAP Fork** (`/Users/joshuamullet/repos/asap-fork`)
- **hub** (`/Users/joshuamullet/repos/hub`)

**Example Output:**
```
🎉 Branch Creation Successful!
🌿 Branch: jmullet/bugfix/fron-1384
🎫 Ticket: FRON-1384
📋 Summary: Fix mileage input jumpiness on mobile
🎯 Type: Bug | Status: In Progress
🔗 URL: https://asaptire.atlassian.net/browse/FRON-1384
```

**MCP Integration:** Available via `create_branch` tool - chains naturally with `read_ticket` for full context.

---

### 2. JIRA Deployment Reports

**What it does:** Generates boss-ready Excel deployment reports from JIRA data with natural language commands.

**How to use:**
- "Get me July's release data"
- "Generate July 1st through 10th deployment report"  
- "Show me the deployment summary for this month"

**What happens:**
1. Downloads JIRA issues for specified date range (FRON project, Done status)
2. Transforms data using ChatGPT's exact classification logic:
   - **Projects**: TRIC, DTMI, TRMI (fallback)
   - **Release Types**: Normal, Hotfix, Rollback  
   - **Grouping**: 30-minute sequential release windows
3. Generates 3-sheet Excel file: Summary, Releases, Details
4. Saves to ~/Downloads/ with smart naming: `Deployment_Report_July_2025_TIMESTAMP.xlsx`

**MCP Integration:** Available via `run_jira_query` tool in the MCP server.

---

### 2. AWS Cognito Password Resets

**What it does:** Automate AWS Cognito password resets with intelligent profile switching and secure password generation.

**How to use:**
- "Reset password for user@example.com in DTMI"
- "Reset password for test@company.com in dtmi-prod temporarily"
- "Set permanent password for admin@company.com in dtmi-nonprod"

**What happens:**
1. Captures current AWS profile state for restoration
2. Switches to target AWS account (dtmi-prod, dtmi-nonprod)
3. Validates authentication (triggers SSO login if needed)
4. Uses secure default password from .env file (meets all AWS requirements)
5. Executes `aws cognito-idp admin-set-user-password` with appropriate flags
6. Restores original AWS profile to prevent session disruption
7. Returns new password for immediate use

**Account Support:**
- **dtmi-prod**: User pool `us-east-1_qd8J8GRQ2` (production DTMI account)
- **dtmi-nonprod**: User pool `us-east-1_LscuOViAQ` (development/testing)
- **TRIC accounts**: *Coming soon after authentication setup*

**MCP Integration:** Available via `reset_cognito_password` tool in the MCP server.

---

## 🔮 Planned Tools

### 3. AWS Cognito Account Creation *(Coming Soon)*

**What it will do:** Create new AWS Cognito user accounts with proper initialization.

### 4. AWS Cognito Account Deletion *(Coming Soon)*

**What it will do:** Remove AWS Cognito user accounts safely with confirmation prompts.

---

### 3. Database Access Automation *(COMPLETED)*

**What it does:** Lightning-fast database connections with automatic port forwarding and Beekeeper Studio integration.

**How to use:**
- "connect to DTMI prod database"
- "connect to ASAP Fork dev"
- "connect to TRMI qa BI database"

**What happens:**
1. **NO CONFIRMATIONS** - executes immediately for speed
2. Dynamically discovers bastion hosts and database secrets
3. Establishes AWS SSM port forwarding on available port
4. **Automatically adds/updates Beekeeper Studio connection**
5. **Launches Beekeeper Studio with connection ready**
6. Connection appears as "[PROJECT] [ENV] (Auto)" in Beekeeper

**Project Support:**
- **DTMI**: Single database per environment (dev, qa, train, prod)
- **ASAP Fork/TRMI**: App + BI databases per environment
- **Smart AWS profile switching**: Handles dtmi-prod, dtmi-nonprod, default profiles
- **Username always 'admin'**: Ignores what AWS Secrets claim

**Speed Features:**
- **Zero manual setup** - from command to querying in ~10 seconds
- **Persistent connections** - saved in Beekeeper for reuse
- **Port conflict resolution** - finds available ports automatically
- **Background processing** - port forwarding established in background

**MCP Integration:** Available via `connect_to_database` tool in the MCP server.

---

### 4. AWS Authentication & Profile Switching *(COMPLETED)*

**What it does:** Streamline AWS profile switching and authentication with natural language commands.

**How to use:**
- "log into TRMI"
- "sign into DTMI nonprod"
- "authenticate to TRIC prod"
- "log into TRIC nonprod"
- "log into DTMI prod"

**What happens:**
1. **Smart Project Recognition**: Maps project names to AWS profiles
   - **DTMI**: Uses `dtmi-prod` or `dtmi-nonprod` profiles
   - **TRIC**: Uses `tric-prod` or `tric-nonprod` profiles
   - **TRMI/ASAP Fork**: Uses `default` profile  
2. **Authentication Check**: Verifies current AWS authentication status
3. **Profile Switching**: Sets AWS_PROFILE environment variable
4. **SSO Login**: Launches browser for AWS SSO if authentication needed
5. **Verification**: Confirms successful authentication

**Project Mapping:**
- **DTMI**: prod (default), nonprod, dev, qa, train
- **TRIC**: prod (default), nonprod, dev, qa, train
- **TRMI/ASAP Fork**: All environments use `default` profile
- **Smart Aliases**: Recognizes "Discount Tire", "Tire Rack Installation Center", etc.

**Status Display:**
- Shows current vs target authentication state
- Displays account ID and user information
- Indicates if already authenticated or newly logged in

**MCP Integration:** Available via `aws_login` tool in the MCP server.

### 5. Future Automation Ideas

- **GitHub workflow triggers** - Deploy, release, PR automation
- **Slack/Email notifications** - Alert stakeholders automatically  
- **Data transformations** - CSV processing, report generation
- **System monitoring** - Health checks, alert systems

---

## 🛠 Technical Architecture

### MCP Server
- **Location:** `/Users/joshuamullet/repos/hub/mcp-server.js`
- **Registration:** `claude mcp list` shows "command-hub-jira: ✓ Connected"
- **Tools exposed:** Currently `run_jira_query`, expanding to AWS tools

### Global Launcher
- **Command:** `hub` (available globally)  
- **Features:** `--resume`, `--continue`, `--debug`
- **Access:** All ~/repos/* + dangerous permissions enabled
- **Location:** `/Users/joshuamullet/repos/hub/bin/hub`

### Tool Structure
- **CLI Scripts:** Individual tools in `/tools/` directory
- **Full Pipeline:** Each tool does complete workflow (download → transform → deliver)
- **Output:** Files go to ~/Downloads/ with descriptive names

---

## 📋 Workflow: Adding New Tools

When building new automation tools:

1. **Create CLI script** in `/tools/` directory
2. **Add to MCP server** in `mcp-server.js`  
3. **Update this capabilities.md** with new tool documentation
4. **Test via natural language** in separate Claude session
5. **Verify end-to-end workflow** produces expected deliverables

---

## 🎯 Current Status

**✅ Completed:**
- Global `hub` launcher with repo access
- End-to-end JIRA deployment reports  
- Perfect ChatGPT transformation replication
- MCP integration with natural language
- AWS Cognito password reset automation

**⏳ In Progress:**
- Expanding AWS account support (TRIC profiles)

**🔜 Next:**
- AWS account creation tool  
- AWS account deletion tool
- Additional automation integrations

---

*This file serves as Claude's "tool belt" knowledge when launched via `hub` command.*