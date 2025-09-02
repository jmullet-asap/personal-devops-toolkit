#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const { JIRA_EMAIL, JIRA_TOKEN } = process.env;

if (!JIRA_EMAIL || !JIRA_TOKEN) {
  console.error('Missing JIRA_EMAIL or JIRA_TOKEN in .env');
  process.exit(1);
}

// Parse user input and structure it into Current/Desired format
function parseTicketContent(userInput) {
  // Extract project label - only accept very specific/unambiguous keywords
  let projectLabel = null;
  const projectKeywords = {
    'DTMI': ['dtmi', 'discount tire', 'discount-tire'],
    'TRMI': ['trmi', 'treadware', 'asap fork', 'asap-fork'],
    'TRIC': ['tric', 'trickware'],
    'SHM': ['shm', 'shop management']
  };
  
  const inputLower = userInput.toLowerCase();
  for (const [label, keywords] of Object.entries(projectKeywords)) {
    if (keywords.some(keyword => inputLower.includes(keyword))) {
      projectLabel = label;
      break;
    }
  }
  
  // Also check for explicit project mentions (most reliable)
  const projectMatches = userInput.match(/\b(DTMI|TRMI|TRIC|SHM)\b/gi);
  if (!projectLabel && projectMatches) {
    projectLabel = projectMatches[0].toUpperCase();
  }
  
  // Determine if it's a bug or task from context
  const bugKeywords = ['bug', 'broken', 'error', 'issue', 'problem', 'not working', 'fails', 'crash'];
  const isBug = bugKeywords.some(keyword => userInput.toLowerCase().includes(keyword));
  const issueType = isBug ? 'Bug' : 'Task';
  
  // Try to extract current/desired if explicitly stated
  const currentMatch = userInput.match(/current[:\s]+(.*?)(?=desired|$)/is);
  const desiredMatch = userInput.match(/desired[:\s]+(.*?)$/is);
  
  // If no project detected, return special indicator for MCP server to handle
  if (!projectLabel) {
    return {
      needsProjectClarification: true,
      message: "Unable to determine which project this ticket is for. Please specify: DTMI, TRMI/Tire Rack, TRIC/Treadware, or SHM in your description."
    };
  }
  
  let current, desired, summary;
  
  if (currentMatch && desiredMatch) {
    // User explicitly provided current/desired
    current = currentMatch[1].trim();
    desired = desiredMatch[1].trim();
    // Generate summary from the content
    summary = generateSummary(current, desired, issueType, projectLabel);
  } else {
    // Parse from word vomit - split into current/desired
    const parts = parseWordVomit(userInput, projectLabel);
    current = parts.current;
    desired = parts.desired;
    summary = parts.summary;
  }
  
  return {
    summary,
    current,
    desired,
    projectLabel,
    issueType
  };
}

function parseWordVomit(input, projectLabel) {
  // Look for problem description and solution
  const sentences = input.split(/[.!]+/).filter(s => s.trim());
  
  // Simple heuristic: first part describes current state, later parts describe what should happen
  const midpoint = Math.ceil(sentences.length / 2);
  const currentPart = sentences.slice(0, midpoint).join('. ').trim();
  const desiredPart = sentences.slice(midpoint).join('. ').trim();
  
  // Generate a concise summary
  const summary = generateSummary(currentPart, desiredPart, 'Task', projectLabel);
  
  return {
    current: currentPart || 'Current behavior needs documentation',
    desired: desiredPart || 'Desired behavior needs specification', 
    summary
  };
}

function generateSummary(current, desired, issueType = 'Task', projectLabel = null) {
  // Extract key elements for a concise summary
  const currentWords = current.toLowerCase().replace(/\n/g, ' ').split(' ');
  const desiredWords = desired.toLowerCase().replace(/\n/g, ' ').split(' ');
  
  // Look for page/feature references
  const pageMatch = current.match(/(page|dashboard|form|login|signup|checkout|order|user)/i);
  const actionMatch = desired.match(/(show|display|work|allow|enable|fix|create|add)/i);
  
  let summary = '';
  if (pageMatch && actionMatch) {
    summary = `${actionMatch[1]} ${pageMatch[1]}`.replace(/^\w/, c => c.toUpperCase());
  } else {
    // Fallback: use first meaningful words
    const meaningfulWords = [...currentWords, ...desiredWords]
      .filter(word => word.length > 3 && !['should', 'would', 'could', 'when', 'then', 'that', 'this'].includes(word))
      .slice(0, 4);
    summary = meaningfulWords.join(' ').replace(/^\w/, c => c.toUpperCase());
  }
  
  const baseSummary = (summary || `${issueType} - needs description`).replace(/\n/g, ' ').trim();
  
  // Add project label prefix if available
  return projectLabel ? `[${projectLabel}] ${baseSummary}` : baseSummary;
}

function formatDescription(current, desired) {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Current",
            marks: [{ type: "strong" }]
          }
        ]
      },
      {
        type: "paragraph", 
        content: [
          {
            type: "text",
            text: current
          }
        ]
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text", 
            text: ""
          }
        ]
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Desired",
            marks: [{ type: "strong" }]
          }
        ]
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: desired
          }
        ]
      }
    ]
  };
}

async function createJiraTicket(ticketData) {
  try {
    console.log('🎫 Creating JIRA ticket...');
    
    const response = await axios.post(
      'https://asaptire.atlassian.net/rest/api/3/issue',
      {
        fields: {
          project: { key: 'FRON' }, // Always FRON project
          summary: ticketData.summary,
          description: formatDescription(ticketData.current, ticketData.desired),
          issuetype: { name: ticketData.issueType || 'Task' },
          priority: { name: ticketData.priority || 'Medium' },
          assignee: ticketData.assignee ? { emailAddress: ticketData.assignee } : null,
          labels: ticketData.labels || []
        }
      },
      {
        auth: {
          username: JIRA_EMAIL,
          password: JIRA_TOKEN,
        },
        headers: { 
          'Accept': 'application/json',
          'Content-Type': 'application/json' 
        },
      }
    );

    const ticketKey = response.data.key;
    const ticketUrl = `https://asaptire.atlassian.net/browse/${ticketKey}`;
    
    console.log(`✅ Created JIRA ticket: ${ticketKey}`);
    console.log(`🔗 URL: ${ticketUrl}`);
    
    return {
      key: ticketKey,
      id: response.data.id,
      url: ticketUrl,
      self: response.data.self
    };

  } catch (error) {
    console.error('❌ Error creating JIRA ticket:', error.response?.data || error.message);
    throw error;
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const userInput = process.argv.slice(2).join(' ');
  
  if (!userInput) {
    console.error('Usage: node create-jira-ticket.js <ticket description>');
    console.error('Example: node create-jira-ticket.js "On DTMI dashboard users cannot see order history. It should display last 10 orders in a table."');
    process.exit(1);
  }
  
  const parsed = parseTicketContent(userInput);
  
  console.log('\n📋 Ticket Preview:');
  console.log('==================');
  console.log(`Title: ${parsed.summary}`);
  console.log(`Type: ${parsed.issueType}`);
  console.log(`Project Label: ${parsed.projectLabel || 'None'}`);
  console.log('\nDescription:');
  console.log(`**Current**\n${parsed.current}\n\n**Desired**\n${parsed.desired}`);
  console.log('==================\n');
  
  const ticketData = {
    summary: parsed.summary,
    current: parsed.current,
    desired: parsed.desired,
    issueType: parsed.issueType,
    labels: parsed.projectLabel ? [parsed.projectLabel] : []
  };
  
  createJiraTicket(ticketData)
    .then(result => {
      console.log(`🎉 Ticket created successfully: ${result.key}`);
    })
    .catch(error => {
      console.error('💥 Failed to create ticket');
      process.exit(1);
    });
}

export { createJiraTicket, parseTicketContent };