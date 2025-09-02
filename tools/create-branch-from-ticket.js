#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { readJiraTicket } from './read-jira-ticket.js';

// Project directory mappings
const PROJECT_DIRECTORIES = {
  'TRIC': '/Users/joshuamullet/repos/tric',
  'TRMI': '/Users/joshuamullet/repos/asap-fork',
  'ASAP Fork': '/Users/joshuamullet/repos/asap-fork',
  'ASAP-Fork': '/Users/joshuamullet/repos/asap-fork',
  'DTMI': '/Users/joshuamullet/repos/dtmi',
  'hub': '/Users/joshuamullet/repos/hub',
};

// Auto-detect branch type from JIRA issue type
const ISSUE_TYPE_TO_BRANCH_TYPE = {
  'Bug': 'bugfix',
  'Story': 'feature',
  'Epic': 'feature',
  'Task': 'feature',
  'Sub-task': 'feature',
  'Improvement': 'feature',
  'New Feature': 'feature',
};

function execCommand(command, cwd = null, options = {}) {
  try {
    const result = execSync(command, {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
      stdio: options.quiet ? 'pipe' : 'inherit',
      ...options
    });
    return result ? result.trim() : '';
  } catch (error) {
    throw new Error(`Command failed: ${command}\n${error.message}`);
  }
}

function detectCurrentProject() {
  const cwd = process.cwd();
  
  // Check if we're in a known project directory
  for (const [projectName, projectPath] of Object.entries(PROJECT_DIRECTORIES)) {
    if (cwd.startsWith(projectPath)) {
      return projectName;
    }
  }
  
  return null;
}

function resolveProjectDirectory(project) {
  if (!project) {
    // Try to detect from current directory
    const detected = detectCurrentProject();
    if (detected) {
      return PROJECT_DIRECTORIES[detected];
    }
    throw new Error('No project specified and could not detect current project. Please specify a project: TRIC, TRMI, DTMI, or hub');
  }
  
  // Normalize project name
  const normalizedProject = Object.keys(PROJECT_DIRECTORIES).find(
    key => key.toLowerCase() === project.toLowerCase() || 
           key.replace(/[-\s]/g, '').toLowerCase() === project.replace(/[-\s]/g, '').toLowerCase()
  );
  
  if (!normalizedProject) {
    const availableProjects = Object.keys(PROJECT_DIRECTORIES).join(', ');
    throw new Error(`Unknown project: ${project}. Available projects: ${availableProjects}`);
  }
  
  const projectDir = PROJECT_DIRECTORIES[normalizedProject];
  
  if (!fs.existsSync(projectDir)) {
    throw new Error(`Project directory does not exist: ${projectDir}`);
  }
  
  return projectDir;
}

function formatTicketKey(ticketNumber) {
  // Handle different input formats
  if (ticketNumber.includes('-')) {
    return ticketNumber.toUpperCase(); // Already formatted (e.g., "FRON-1384")
  } else {
    return `FRON-${ticketNumber}`; // Just number (e.g., "1384")
  }
}

function determineStashName(ticketKey, projectName) {
  return `branch-creation-${ticketKey}-${projectName}-${Date.now()}`;
}

async function createBranchFromTicket({
  ticketNumber,
  project = null,
  branchType = null,
  readTicket = true,
  username = 'jmullet'
}) {
  console.log('🚀 Starting branch creation process...\n');
  
  try {
    // Format ticket key
    const ticketKey = formatTicketKey(ticketNumber);
    console.log(`🎫 Working with ticket: ${ticketKey}`);
    
    // Read ticket if requested (for validation and context)
    let ticketInfo = null;
    if (readTicket) {
      console.log('📖 Reading ticket for validation and context...');
      try {
        ticketInfo = await readJiraTicket(ticketKey);
        console.log(`✅ Ticket validated: ${ticketInfo.summary}`);
        console.log(`📋 Type: ${ticketInfo.issueType} | Status: ${ticketInfo.status}\n`);
      } catch (error) {
        throw new Error(`Failed to read ticket ${ticketKey}: ${error.message}`);
      }
    }
    
    // Resolve project directory
    const projectDir = resolveProjectDirectory(project);
    const projectName = Object.keys(PROJECT_DIRECTORIES).find(
      key => PROJECT_DIRECTORIES[key] === projectDir
    );
    console.log(`📂 Working in project: ${projectName} (${projectDir})`);
    
    // Auto-detect branch type from ticket if not specified
    let finalBranchType = branchType;
    if (!finalBranchType && ticketInfo) {
      finalBranchType = ISSUE_TYPE_TO_BRANCH_TYPE[ticketInfo.issueType] || 'feature';
      console.log(`🔍 Auto-detected branch type: ${finalBranchType} (from ${ticketInfo.issueType})`);
    } else if (!finalBranchType) {
      finalBranchType = 'bugfix'; // Default
      console.log(`📌 Using default branch type: ${finalBranchType}`);
    }
    
    // Generate branch name
    const branchName = `${username}/${finalBranchType}/fron-${ticketNumber}`;
    console.log(`🌿 Target branch: ${branchName}\n`);
    
    // Change to project directory
    process.chdir(projectDir);
    console.log(`📁 Changed to directory: ${projectDir}`);
    
    // Check if we're in a git repository
    try {
      execCommand('git rev-parse --git-dir', projectDir, { quiet: true });
    } catch (error) {
      throw new Error(`Not a git repository: ${projectDir}`);
    }
    
    // Check for uncommitted changes
    let hasUncommittedChanges = false;
    let stashName = null;
    
    try {
      const status = execCommand('git status --porcelain', projectDir, { quiet: true });
      if (status.trim()) {
        hasUncommittedChanges = true;
        stashName = determineStashName(ticketKey, projectName);
        console.log('📦 Uncommitted changes detected, stashing...');
        execCommand(`git stash push -m "${stashName}"`, projectDir);
        console.log(`✅ Changes stashed as: ${stashName}`);
      }
    } catch (error) {
      console.log('⚠️  Could not check git status, continuing...');
    }
    
    // Switch to dev branch
    console.log('\n🔄 Switching to dev branch...');
    try {
      execCommand('git checkout dev', projectDir);
      console.log('✅ Switched to dev branch');
    } catch (error) {
      throw new Error(`Failed to switch to dev branch: ${error.message}`);
    }
    
    // Pull latest changes
    console.log('⬇️  Pulling latest changes from origin/dev...');
    try {
      execCommand('git pull origin dev', projectDir);
      console.log('✅ Successfully pulled latest dev changes');
    } catch (error) {
      console.log(`⚠️  Warning: Could not pull latest changes: ${error.message}`);
    }
    
    // Check if branch already exists
    let branchExists = false;
    try {
      const existingBranches = execCommand('git branch -a', projectDir, { quiet: true });
      // More precise matching - look for exact branch name matches
      const branchLines = existingBranches.split('\n');
      branchExists = branchLines.some(line => {
        const cleanLine = line.replace(/^\*?\s+/, '').replace(/^remotes\/origin\//, '');
        return cleanLine === branchName;
      });
    } catch (error) {
      console.log('⚠️  Could not check existing branches, continuing...');
    }
    
    if (branchExists) {
      console.log(`\n🔍 Branch ${branchName} already exists!`);
      console.log('✅ Switching to existing branch instead of creating new one...');
      
      try {
        execCommand(`git checkout ${branchName}`, projectDir);
        console.log(`✅ Successfully switched to existing branch: ${branchName}`);
        
        // Pull latest changes for the existing branch
        try {
          execCommand(`git pull origin ${branchName}`, projectDir, { quiet: true });
          console.log('✅ Pulled latest changes for existing branch');
        } catch (pullError) {
          console.log('⚠️  Could not pull changes (branch may not exist on remote yet)');
        }
      } catch (error) {
        throw new Error(`Failed to switch to existing branch: ${error.message}`);
      }
    } else {
      // Create new branch
      console.log(`\n🌱 Creating new branch: ${branchName}`);
      try {
        execCommand(`git checkout -b ${branchName}`, projectDir);
        console.log('✅ New branch created and checked out');
      } catch (error) {
        throw new Error(`Failed to create branch: ${error.message}`);
      }
    }
    
    // Reapply stashed changes if any
    if (hasUncommittedChanges && stashName) {
      console.log('\n📤 Reapplying stashed changes...');
      try {
        // Find the stash by name
        const stashList = execCommand('git stash list', projectDir, { quiet: true });
        const stashEntry = stashList.split('\n').find(line => line.includes(stashName));
        
        if (stashEntry) {
          const stashRef = stashEntry.split(':')[0]; // e.g., "stash@{0}"
          execCommand(`git stash apply ${stashRef}`, projectDir);
          console.log('✅ Stashed changes reapplied');
          
          // Optionally drop the stash since it's been applied
          execCommand(`git stash drop ${stashRef}`, projectDir, { quiet: true });
          console.log('🗑️  Stash dropped after successful application');
        } else {
          console.log('⚠️  Could not find stash to reapply');
        }
      } catch (error) {
        console.log(`⚠️  Warning: Could not reapply stashed changes: ${error.message}`);
        console.log('💡 You can manually apply stash later with: git stash list && git stash apply <stash-ref>');
      }
    }
    
    // Success summary
    console.log('\n' + '='.repeat(80));
    if (branchExists) {
      console.log('🎉 BRANCH SETUP SUCCESSFUL!');
    } else {
      console.log('🎉 BRANCH CREATION SUCCESSFUL!');
    }
    console.log('='.repeat(80));
    console.log(`📂 Project: ${projectName}`);
    console.log(`🌿 Branch: ${branchName}`);
    console.log(`🎫 Ticket: ${ticketKey}`);
    
    if (ticketInfo) {
      console.log(`📋 Summary: ${ticketInfo.summary}`);
      console.log(`🔗 URL: ${ticketInfo.url}`);
    }
    
    console.log('\n🚀 Next steps:');
    console.log('1. Start coding your changes');
    console.log('2. Commit your work when ready');
    console.log('3. Push branch: git push -u origin ' + branchName);
    console.log('4. Create PR when ready for review');
    
    if (hasUncommittedChanges) {
      console.log('\n💾 Your previous work has been reapplied to this branch');
    }
    
    console.log('\n' + '='.repeat(80));
    
    return {
      success: true,
      branchName,
      ticketKey,
      projectName,
      projectDir,
      ticketInfo,
      hasUncommittedChanges,
      wasExisting: branchExists,
      message: branchExists 
        ? `Successfully switched to existing branch ${branchName} for ticket ${ticketKey}`
        : `Successfully created branch ${branchName} for ticket ${ticketKey}`
    };
    
  } catch (error) {
    console.error('\n❌ BRANCH CREATION FAILED');
    console.error('='.repeat(50));
    console.error(`Error: ${error.message}`);
    console.error('\n💡 Troubleshooting tips:');
    console.error('- Make sure you have git access to the repository');
    console.error('- Verify the ticket number exists in JIRA');
    console.error('- Check that you\'re in the correct project directory');
    console.error('- Ensure dev branch exists and is up to date');
    
    return {
      success: false,
      error: error.message,
      ticketKey: formatTicketKey(ticketNumber),
      projectName: project
    };
  }
}

// CLI usage
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node create-branch-from-ticket.js <TICKET_NUMBER> [PROJECT] [BRANCH_TYPE] [USERNAME]');
    console.log('');
    console.log('Arguments:');
    console.log('  TICKET_NUMBER    JIRA ticket number (e.g., 1384 or FRON-1384)');
    console.log('  PROJECT          Project name (TRIC, TRMI, DTMI, hub) - auto-detected if not provided');
    console.log('  BRANCH_TYPE      Branch type (bugfix, feature) - auto-detected from ticket if not provided');
    console.log('  USERNAME         Username for branch (defaults to jmullet)');
    console.log('');
    console.log('Examples:');
    console.log('  node create-branch-from-ticket.js 1384');
    console.log('  node create-branch-from-ticket.js 1384 TRIC');
    console.log('  node create-branch-from-ticket.js FRON-1384 DTMI feature');
    console.log('');
    process.exit(0);
  }
  
  const ticketNumber = args[0];
  const project = args[1] || null;
  const branchType = args[2] || null;
  const username = args[3] || 'jmullet';
  
  const result = await createBranchFromTicket({
    ticketNumber,
    project,
    branchType,
    readTicket: true,
    username
  });
  
  if (!result.success) {
    process.exit(1);
  }
}

// Export for use as module
export { createBranchFromTicket };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}