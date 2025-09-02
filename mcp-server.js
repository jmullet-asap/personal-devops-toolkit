#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { runFullPipeline } from './tools/full-pipeline.js';
import { connectToDatabase } from './tools/connect-to-database.js';
import { createJiraTicket, parseTicketContent } from './tools/create-jira-ticket.js';
import { readJiraTicket } from './tools/read-jira-ticket.js';
import { createBranchFromTicket } from './tools/create-branch-from-ticket.js';
import { authenticateAWS } from './tools/aws-login.js';
import { execSync } from 'child_process';

// Account to User Pool ID mapping
const ACCOUNT_POOLS = {
    'dtmi-nonprod': 'us-east-1_LscuOViAQ',
    'dtmi-prod': 'us-east-1_qd8J8GRQ2'
};

const server = new Server(
  {
    name: 'command-hub',
    version: '0.2.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'generate_deployment_report',
        description: 'Generate Excel deployment reports from JIRA data. Downloads FRON project Done items, transforms into boss-ready format, saves to Downloads folder. Use for: "get me July release data", "generate deployment report for August". Accepts natural language dates like "July 2025" (full month) or "July 1st through 10th" (date range). Convert to ISO format (YYYY-MM-DD) before calling.',
        inputSchema: {
          type: 'object',
          properties: {
            start: {
              type: 'string',
              description: 'Start date in ISO format (YYYY-MM-DD)',
            },
            end: {
              type: 'string',
              description: 'End date in ISO format (YYYY-MM-DD)',
            },
          },
          required: ['start', 'end'],
        },
      },
      {
        name: 'reset_cognito_password',
        description: 'Reset AWS Cognito user password with beautiful upfront context and verbose execution logging. Shows current AWS session, target details, and planned operation before providing command to execute. Defaults to dtmi-prod account and secure default password. Natural language examples: "Reset password for user@example.com" or "Reset password for test@company.com in dtmi-nonprod".',
        inputSchema: {
          type: 'object',
          properties: {
            email: {
              type: 'string',
              description: 'Email address of the user whose password should be reset',
            },
            account: {
              type: 'string',
              description: 'AWS account profile. Defaults to dtmi-prod if not specified.',
              enum: ['dtmi-prod', 'dtmi-nonprod'],
              default: 'dtmi-prod',
            },
            password: {
              type: 'string',
              description: 'Custom password to set. If omitted, uses secure default password from .env file.',
            },
          },
          required: ['email'],
        },
      },
      {
        name: 'connect_to_database',
        description: 'Connect to project databases with automatic port forwarding and environment disambiguation. Handles DTMI and ASAP Fork/TRMI projects with dynamic discovery. Defaults to production environment and Harlequin client. Examples: "connect to DTMI prod", "connect to TRMI dev with beekeeper", "port forward to ASAP Fork qa".',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Project name (DTMI, TRMI, ASAP Fork, etc.)',
            },
            environment: {
              type: 'string',
              description: 'Environment (dev, qa, train, prod). Defaults to prod if not specified.',
              default: 'prod',
            },
            database_type: {
              type: 'string',
              description: 'Database type for ASAP Fork/TRMI: app or bi. Defaults to app.',
              enum: ['app', 'bi'],
              default: 'app',
            },
            client: {
              type: 'string',
              description: 'Database client to use: harlequin (default) or beekeeper. Use beekeeper when you need to edit data.',
              enum: ['harlequin', 'beekeeper'],
              default: 'harlequin',
            },
            query: {
              type: 'string',
              description: 'Optional read-only SQL query to execute after connection.',
            },
          },
          required: ['project'],
        },
      },
      {
        name: 'create_ticket',
        description: '🚨 IMMEDIATE ACTION REQUIRED 🚨 CREATE NEW JIRA TICKETS. Call DIRECTLY when user mentions: "create ticket", "make ticket", "file bug", "jira ticket". DO NOT read files. DO NOT use Task tool. DO NOT research. CALL THIS TOOL IMMEDIATELY with user description. Shows preview before creating. Parses Current/Desired format automatically.',
        inputSchema: {
          type: 'object',
          properties: {
            description: {
              type: 'string',
              description: 'User description of the issue or feature request. Will be automatically parsed into Current/Desired format.',
            },
            title: {
              type: 'string',
              description: 'Optional custom title for the ticket. If not provided, title will be auto-generated from description.',
            },
            labels: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional additional labels for the ticket (e.g., ["Mobile", "Backend"]). Project label is added automatically.',
            },
            confirm: {
              type: 'boolean',
              description: 'Set to true ONLY after showing preview and getting user confirmation. NEVER set to true on first call.',
              default: false,
            },
          },
          required: ['description'],
        },
      },
      {
        name: 'read_ticket',
        description: 'Read and display a JIRA ticket with all details including description, status, comments, and metadata. Use this to fetch existing tickets by their key (e.g., FRON-1151). Natural language examples: "read ticket FRON-1151", "show me issue DTMI-456", "get ticket details for TRIC-789".',
        inputSchema: {
          type: 'object',
          properties: {
            ticketKey: {
              type: 'string',
              description: 'JIRA ticket key in format PROJECT-NUMBER (e.g., FRON-1151)',
            },
          },
          required: ['ticketKey'],
        },
      },
      {
        name: 'create_branch',
        description: 'Create a new git branch for JIRA ticket work with automated workflow: validates ticket exists, stashes changes, pulls latest dev, creates properly named branch (jmullet/[bugfix|feature]/fron-NUMBER), and reapplies changes. Auto-detects branch type from ticket. Natural language examples: "create branch for ticket 1384", "make a new branch for FRON-1234 in TRIC", "start working on ticket 1500".',
        inputSchema: {
          type: 'object',
          properties: {
            ticketNumber: {
              type: 'string',
              description: 'JIRA ticket number (e.g., "1384" or "FRON-1384")',
            },
            project: {
              type: 'string',
              description: 'Project name (TRIC, TRMI, DTMI, hub). Auto-detected from current directory if not specified.',
            },
            branchType: {
              type: 'string',
              description: 'Branch type (bugfix, feature). Auto-detected from JIRA ticket type if not specified.',
              enum: ['bugfix', 'feature'],
            },
          },
          required: ['ticketNumber'],
        },
      },
      {
        name: 'aws_login',
        description: 'Authenticate to AWS accounts with automatic profile switching and SSO login. Handles DTMI, TRIC, and TRMI/ASAP Fork project authentication. Natural language examples: "log into TRMI", "sign into DTMI nonprod", "authenticate to TRIC prod", "log into TRIC nonprod". Shows current auth status and switches profiles automatically.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Project name (DTMI, TRMI, ASAP Fork, etc.)',
            },
            environment: {
              type: 'string',
              description: 'Environment for DTMI/TRIC (prod, nonprod, dev, qa, train). TRMI/ASAP Fork always use default profile. Defaults to prod for DTMI/TRIC.',
            },
          },
          required: ['project'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'generate_deployment_report') {
    const { start, end } = args;
    
    try {
      const result = await runFullPipeline(start, end);
      
      return {
        content: [
          {
            type: 'text',
            text: `🎉 Deployment report generated successfully!

📁 File: ${result.fileName}
📂 Location: ${result.filePath}

📊 Summary:
   • Total tickets: ${result.summary.totalTickets}
   • Release groups: ${result.summary.totalReleases} 
   • Normal releases: TRIC=${result.summary.breakdown.Normal.TRIC}, DTMI=${result.summary.breakdown.Normal.DTMI}, TRMI=${result.summary.breakdown.Normal.TRMI}
   • Hotfixes: ${result.summary.breakdown.Hotfix.TRIC + result.summary.breakdown.Hotfix.DTMI + result.summary.breakdown.Hotfix.TRMI}
   • Rollbacks: ${result.summary.breakdown.Rollback.TRIC + result.summary.breakdown.Rollback.DTMI + result.summary.breakdown.Rollback.TRMI}

The Excel file is ready for your boss! 📈`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error generating deployment report: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === 'reset_cognito_password') {
    const { email, account = 'dtmi-prod', password } = args;
    
    try {
      // Get current AWS state for context
      let currentState = null;
      try {
        const identity = JSON.parse(execSync('aws sts get-caller-identity', { encoding: 'utf8' }));
        const currentProfile = process.env.AWS_PROFILE || 'default';
        currentState = {
          account: identity.Account,
          userId: identity.UserId,
          profile: currentProfile
        };
      } catch (error) {
        // If we can't get current state, continue anyway
      }
      
      // Determine final password
      const finalPassword = password || process.env.DEFAULT_COGNITO_PASSWORD || 'DEFAULT_PASSWORD_NOT_SET';
      
      // Build command for execution
      const commandArgs = [
        `"${email}"`,
        `"${account}"`
      ];
      
      if (password) {
        commandArgs.push(`"${password}"`);
      }
      
      const command = `node tools/aws-cognito-reset-password-noninteractive.js ${commandArgs.join(' ')}`;
      
      // Create beautiful upfront context
      let contextText = `🔐 **AWS Cognito Password Reset Request**

📋 **Current Session:**`;
      
      if (currentState) {
        contextText += `
   Profile: ${currentState.profile}
   Account: ${currentState.account}
   User: ${currentState.userId}`;
      } else {
        contextText += `
   ⚠️  Unable to determine current AWS state`;
      }
      
      contextText += `

🎯 **Planned Operation:**
   📧 Target User: ${email}
   🏢 Target Account: ${account} (${ACCOUNT_POOLS[account] || 'Unknown'})
   🔑 Password: ${finalPassword}
   ⏰ Type: Permanent (user can login immediately)
   
🔄 **Executing password reset...**

`;

      // ACTUALLY EXECUTE THE PASSWORD RESET
      try {
        const output = execSync(command, { 
          encoding: 'utf8',
          cwd: process.cwd()
        });
        
        contextText += `✅ **Password Reset Successful!**

${output}

🎉 **Final Result:**
   📧 User: ${email}
   🔑 Password: ${finalPassword}
   🏢 Account: ${account}
   ⏰ Status: Ready to login immediately`;

      } catch (execError) {
        contextText += `❌ **Password Reset Failed:**

${execError.message}

This could be due to:
- AWS authentication issues
- User account not found
- Password policy violations
- Network connectivity problems`;
      }

      return {
        content: [
          {
            type: 'text',
            text: contextText,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error preparing password reset context: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === 'connect_to_database') {
    const { project, environment = 'prod', database_type = 'app', client = 'harlequin' } = args;
    
    try {
      const result = await connectToDatabase(project, environment, database_type, client);
      
      if (result.success) {
        // Create base response
        let responseText = `🎉 **Database Connection Established!**

🎯 **Connection Details:**
   📋 Project: ${result.project.toUpperCase()} ${result.environment}
   🗄️  Database: ${result.database}
   🔗 Local: ${result.host}:${result.localPort}
   👤 Username: ${result.username}

🎯 **${result.client === 'beekeeper' ? 'Beekeeper Studio' : 'Harlequin Terminal Client'}:**
   ${result.client === 'beekeeper' ? 'GUI application launching with connection setup' : 'Opening in separate terminal window with connection ready'}

${result.passwordMessage ? `🔑 **Database Password:** \`${result.passwordMessage}\`
📝 Copy this password - you may need to enter it manually in Beekeeper

` : ''}✅ **Ready to ${result.client === 'beekeeper' ? 'edit and query' : 'query'}!** Port forwarding is active and ${result.client === 'beekeeper' ? 'Beekeeper' : 'Harlequin'} should be launching.`;

        return {
          content: [
            {
              type: 'text',
              text: responseText,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `❌ **Database Connection Failed**

Error: ${result.error}

🔧 **Troubleshooting:**
- Check AWS profile authentication
- Verify bastion host is running  
- Ensure environment exists
- Try again - sometimes SSM sessions need a moment`,
            },
          ],
          isError: true,
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `💥 **Unexpected Error**

${error.message}

🔧 **This might help:**
- Check AWS CLI is installed and configured
- Verify MCP tool has proper permissions
- Try the manual command: node tools/connect-to-database.js "${project}" "${environment}"`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === 'create_ticket') {
    const { description, title, labels = [], confirm = false } = args;
    
    try {
      const parsed = parseTicketContent(description);
      
      // Use custom title if provided, otherwise use auto-generated one
      if (title) {
        parsed.summary = title;
      }
      
      // Check if project clarification is needed
      if (parsed.needsProjectClarification) {
        return {
          content: [
            {
              type: 'text',
              text: `PROJECT_UNCLEAR|${parsed.message}`,
            },
          ],
        };
      }
      
      // Always show preview first
      let previewText = `📋 **JIRA Ticket Preview**

🎯 **Summary:** ${parsed.summary}
📌 **Type:** ${parsed.issueType}
🏷️ **Project Label:** ${parsed.projectLabel || 'None detected'}

📄 **Description:**

**Current**
${parsed.current}

**Desired**  
${parsed.desired}

---`;

      if (!confirm) {
        // Preview mode - return structured data for Claude to format
        return {
          content: [
            {
              type: 'text',
              text: `PREVIEW_MODE|${parsed.summary}|${parsed.issueType}|${parsed.projectLabel || 'None'}|${parsed.current}|${parsed.desired}`,
            },
          ],
        };
      } else {
        // Actually create the ticket
        const allLabels = [];
        if (parsed.projectLabel) {
          allLabels.push(parsed.projectLabel);
        }
        allLabels.push(...labels);
        
        const ticketData = {
          summary: parsed.summary,
          current: parsed.current,
          desired: parsed.desired,
          issueType: parsed.issueType,
          labels: allLabels
        };
        
        const result = await createJiraTicket(ticketData);
        
        return {
          content: [
            {
              type: 'text',
              text: `${previewText}

✅ **JIRA Ticket Created Successfully!**

🎫 **Ticket:** ${result.key}  
🔗 **URL:** ${result.url}

The ticket has been created in the FRON project with your Current/Desired format.`,
            },
          ],
        };
      }
      
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ **Error creating JIRA ticket:** ${error.message}

🔧 **This might help:**
- Check JIRA credentials in .env file
- Verify network connectivity to JIRA
- Ensure description contains enough detail for parsing`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === 'read_ticket') {
    const { ticketKey } = args;
    
    try {
      const ticket = await readJiraTicket(ticketKey);
      
      return {
        content: [
          {
            type: 'text',
            text: `🎫 **${ticket.key}: ${ticket.summary}**

📋 **Project:** ${ticket.project}
🔗 **URL:** ${ticket.url}
📊 **Status:** ${ticket.status}
🎯 **Type:** ${ticket.issueType}
⚡ **Priority:** ${ticket.priority}
👤 **Assignee:** ${ticket.assignee}
📝 **Reporter:** ${ticket.reporter}
📅 **Created:** ${ticket.created}
🔄 **Updated:** ${ticket.updated}
${ticket.labels.length > 0 ? `🏷️ **Labels:** ${ticket.labels.join(', ')}` : ''}
${ticket.components.length > 0 ? `🧩 **Components:** ${ticket.components.join(', ')}` : ''}
${ticket.fixVersions.length > 0 ? `🚀 **Fix Versions:** ${ticket.fixVersions.join(', ')}` : ''}

📄 **Description:**
${ticket.description || 'No description provided'}

${ticket.comments.length > 0 ? `💬 **Recent Comments:**
${ticket.comments.map(comment => 
  `**${comment.author}** (${comment.created}):
${comment.body}`
).join('\n\n---\n\n')}` : ''}`,
          },
        ],
      };
      
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ **Error reading JIRA ticket:** ${error.message}

🔧 **This might help:**
- Verify ticket key format (e.g., FRON-1151)
- Check JIRA credentials in .env file
- Ensure you have permission to view this ticket
- Verify network connectivity to JIRA`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === 'aws_login') {
    const { project, environment } = args;
    
    try {
      const result = await authenticateAWS(project, environment);
      
      if (result.success) {
        let responseText = `🔑 **AWS Authentication ${result.alreadyAuthenticated ? 'Verified' : 'Complete'}!**

🎯 **Authentication Details:**
   📋 Project: ${project.toUpperCase()}${environment ? ` ${environment}` : ''}
   🏢 AWS Profile: ${result.profile}
   🆔 Account: ${result.account}
   👤 User: ${result.user}

${result.alreadyAuthenticated ? 
  '✅ **Status:** Already authenticated to this profile' : 
  '🚀 **Status:** Successfully authenticated via SSO login'}

💡 **Environment Variable:** AWS_PROFILE is now set to \`${result.profile}\`

Ready for AWS operations!`;

        return {
          content: [
            {
              type: 'text',
              text: responseText,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `❌ **AWS Authentication Failed**

Error: ${result.error}

🔧 **Troubleshooting:**
- Run \`aws configure sso\` to set up SSO profiles
- Check AWS CLI installation
- Verify project name is correct (DTMI, TRIC, TRMI, ASAP Fork)
- For DTMI/TRIC, specify environment (prod, nonprod, dev, qa, train)`,
            },
          ],
          isError: true,
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `💥 **Unexpected AWS Login Error**

${error.message}

🔧 **This might help:**
- Check AWS CLI is installed and configured
- Verify project and environment parameters
- Try the manual command: node tools/aws-login.js "${project}"${environment ? ` "${environment}"` : ''}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === 'create_branch') {
    const { ticketNumber, project, branchType } = args;
    
    try {
      const result = await createBranchFromTicket({
        ticketNumber,
        project,
        branchType,
        readTicket: true
      });
      
      if (result.success) {
        let responseText = `🎉 **Branch Creation Successful!**

🌿 **Branch Details:**
   📂 Project: ${result.projectName}
   🌱 Branch: ${result.branchName}
   🎫 Ticket: ${result.ticketKey}`;

        if (result.ticketInfo) {
          responseText += `
   📋 Summary: ${result.ticketInfo.summary}
   🎯 Type: ${result.ticketInfo.issueType}
   📊 Status: ${result.ticketInfo.status}
   🔗 URL: ${result.ticketInfo.url}`;
        }

        if (result.hasUncommittedChanges) {
          responseText += `
   
💾 **Previous Work:** Your uncommitted changes have been reapplied to this branch`;
        }

        responseText += `

🚀 **Next Steps:**
1. Start coding your changes for ${result.ticketKey}
2. Commit your work when ready
3. Push branch: \`git push -u origin ${result.branchName}\`
4. Create PR when ready for review

✅ You're now ready to work on ${result.ticketKey}!`;

        return {
          content: [
            {
              type: 'text',
              text: responseText,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `❌ **Branch Creation Failed**

**Error:** ${result.error}

💡 **Troubleshooting Tips:**
- Verify ticket ${result.ticketKey} exists in JIRA
- Check git access to the repository
- Ensure you're in the correct project directory
- Make sure dev branch exists and is accessible`,
            },
          ],
          isError: true,
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ **Branch Creation Error**

${error.message}

Please check the ticket number and try again.`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Command Hub MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});