#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const { JIRA_EMAIL, JIRA_TOKEN } = process.env;

if (!JIRA_EMAIL || !JIRA_TOKEN) {
  console.error('Missing JIRA_EMAIL or JIRA_TOKEN in .env');
  process.exit(1);
}

const JIRA_BASE_URL = 'https://asaptire.atlassian.net';

// Create axios instance with auth
const jiraApi = axios.create({
  baseURL: JIRA_BASE_URL,
  auth: {
    username: JIRA_EMAIL,
    password: JIRA_TOKEN
  },
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }
});

async function readJiraTicket(ticketKey) {
  try {
    // Validate ticket key format
    if (!ticketKey || !ticketKey.match(/^[A-Z]+-\d+$/)) {
      throw new Error(`Invalid ticket key format: ${ticketKey}. Expected format: PROJECT-123`);
    }

    console.log(`🔍 Fetching JIRA ticket: ${ticketKey}...`);

    // Fetch ticket with expanded fields
    const response = await jiraApi.get(`/rest/api/3/issue/${ticketKey}`);

    const ticket = response.data;
    const fields = ticket.fields;

    // Format the ticket data for easy reading
    const formattedTicket = {
      key: ticket.key || 'Unknown',
      url: `${JIRA_BASE_URL}/browse/${ticket.key}`,
      summary: fields.summary || 'No summary',
      description: fields.description?.content ? formatDescription(fields.description) : (fields.description || 'No description'),
      status: fields.status?.name || 'Unknown status',
      priority: fields.priority?.name || 'No priority set',
      assignee: fields.assignee ? fields.assignee.displayName : 'Unassigned',
      reporter: fields.reporter ? fields.reporter.displayName : 'No reporter',
      created: fields.created ? new Date(fields.created).toLocaleString() : 'Unknown',
      updated: fields.updated ? new Date(fields.updated).toLocaleString() : 'Unknown',
      issueType: fields.issuetype?.name || 'Unknown type',
      project: fields.project?.name || 'Unknown project',
      labels: fields.labels || [],
      components: fields.components?.map(c => c.name) || [],
      fixVersions: fields.fixVersions?.map(v => v.name) || [],
      comments: fields.comment?.comments?.slice(-3).map(comment => ({
        author: comment.author?.displayName || 'Unknown author',
        created: comment.created ? new Date(comment.created).toLocaleString() : 'Unknown date',
        body: formatDescription(comment.body)
      })) || []
    };

    return formattedTicket;

  } catch (error) {
    if (error.response?.status === 404) {
      throw new Error(`Ticket ${ticketKey} not found. Make sure the ticket exists and you have permission to view it.`);
    } else if (error.response?.status === 401) {
      throw new Error('Authentication failed. Check your JIRA_EMAIL and JIRA_TOKEN in .env file.');
    } else if (error.response?.status === 403) {
      throw new Error(`Access denied to ticket ${ticketKey}. Check your permissions.`);
    } else {
      throw new Error(`Failed to fetch ticket: ${error.message}`);
    }
  }
}

// Format Atlassian Document Format (ADF) to plain text
function formatDescription(adfContent) {
  if (!adfContent || typeof adfContent === 'string') {
    return adfContent || '';
  }

  function extractText(node) {
    if (!node) return '';
    
    if (typeof node === 'string') {
      return node;
    }

    if (node.type === 'text') {
      return node.text || '';
    }

    if (node.content && Array.isArray(node.content)) {
      return node.content.map(child => extractText(child)).join('');
    }

    if (node.type === 'paragraph' || node.type === 'heading') {
      const text = node.content ? node.content.map(child => extractText(child)).join('') : '';
      return text + '\n\n';
    }

    if (node.type === 'listItem') {
      const text = node.content ? node.content.map(child => extractText(child)).join('') : '';
      return '• ' + text + '\n';
    }

    if (node.type === 'orderedList' || node.type === 'bulletList') {
      return node.content ? node.content.map(child => extractText(child)).join('') : '';
    }

    if (node.type === 'codeBlock') {
      const text = node.content ? node.content.map(child => extractText(child)).join('') : '';
      return `\`\`\`\n${text}\n\`\`\`\n\n`;
    }

    if (node.type === 'inlineCard' && node.attrs?.url) {
      return `[${node.attrs.url}]`;
    }

    return '';
  }

  return extractText(adfContent).trim();
}

// Pretty print the ticket information
function printTicket(ticket) {
  console.log('\n' + '='.repeat(80));
  console.log(`🎫 ${ticket.key}: ${ticket.summary}`);
  console.log('='.repeat(80));
  
  console.log(`\n📋 **Project:** ${ticket.project}`);
  console.log(`🔗 **URL:** ${ticket.url}`);
  console.log(`📊 **Status:** ${ticket.status}`);
  console.log(`🎯 **Type:** ${ticket.issueType}`);
  console.log(`⚡ **Priority:** ${ticket.priority}`);
  console.log(`👤 **Assignee:** ${ticket.assignee}`);
  console.log(`📝 **Reporter:** ${ticket.reporter}`);
  console.log(`📅 **Created:** ${ticket.created}`);
  console.log(`🔄 **Updated:** ${ticket.updated}`);
  
  if (ticket.labels.length > 0) {
    console.log(`🏷️  **Labels:** ${ticket.labels.join(', ')}`);
  }
  
  if (ticket.components.length > 0) {
    console.log(`🧩 **Components:** ${ticket.components.join(', ')}`);
  }
  
  if (ticket.fixVersions.length > 0) {
    console.log(`🚀 **Fix Versions:** ${ticket.fixVersions.join(', ')}`);
  }
  
  console.log('\n📄 **Description:**');
  console.log('-'.repeat(40));
  console.log(ticket.description || 'No description provided');
  
  if (ticket.comments.length > 0) {
    console.log('\n💬 **Recent Comments:**');
    console.log('-'.repeat(40));
    ticket.comments.forEach((comment, index) => {
      console.log(`\n**${comment.author}** (${comment.created}):`);
      console.log(comment.body);
      if (index < ticket.comments.length - 1) {
        console.log('-'.repeat(20));
      }
    });
  }
  
  console.log('\n' + '='.repeat(80));
}

// CLI usage
async function main() {
  const ticketKey = process.argv[2];
  
  if (!ticketKey) {
    console.error('Usage: node read-jira-ticket.js <TICKET_KEY>');
    console.error('Example: node read-jira-ticket.js FRON-1151');
    process.exit(1);
  }
  
  try {
    const ticket = await readJiraTicket(ticketKey);
    printTicket(ticket);
    
    console.log('\n✅ Ticket fetched successfully!');
    
  } catch (error) {
    console.error(`❌ Error reading JIRA ticket: ${error.message}`);
    process.exit(1);
  }
}

// Export for use as module
export { readJiraTicket, formatDescription };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}