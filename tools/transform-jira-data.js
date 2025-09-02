#!/usr/bin/env node

import fs from 'fs/promises';

async function transformJiraData(inputFile, outputPrefix) {
  try {
    console.log(`📥 Reading JIRA data from: ${inputFile}`);
    const rawData = await fs.readFile(inputFile, 'utf8');
    const jiraData = JSON.parse(rawData);
    
    console.log(`📊 Processing ${jiraData.issues.length} issues...`);
    
    // Transform JIRA issues into deployment report format
    const tickets = jiraData.issues.map(issue => {
      // Extract deployment type from labels or summary
      let deploymentType = 'Normal';
      const labels = issue.fields.labels || [];
      const summary = issue.fields.summary || '';
      
      if (labels.some(label => label.toLowerCase().includes('hotfix')) || 
          summary.toLowerCase().includes('hotfix')) {
        deploymentType = 'Hotfix';
      } else if (labels.some(label => label.toLowerCase().includes('rollback')) || 
                 summary.toLowerCase().includes('rollback')) {
        deploymentType = 'Rollback';
      }
      
      // Determine project from labels
      let project = 'Unknown';
      if (labels.includes('TRIC')) project = 'TRIC';
      else if (labels.includes('DTMI')) project = 'DTMI'; 
      else if (labels.includes('TRMI')) project = 'TRMI';
      
      return {
        key: issue.key,
        summary: issue.fields.summary,
        project: project,
        deploymentType: deploymentType,
        status: issue.fields.status.name,
        created: issue.fields.created,
        resolved: issue.fields.resolutiondate,
        assignee: issue.fields.assignee?.displayName || 'Unassigned',
        labels: labels.join(', '),
        description: issue.fields.description || ''
      };
    });
    
    // Generate summary first
    const summary = {
      totalTickets: tickets.length,
      totalReleases: new Set(tickets.map(t => `${t.project}-${t.deploymentType}`)).size,
      breakdown: {
        Normal: {
          TRIC: tickets.filter(t => t.project === 'TRIC' && t.deploymentType === 'Normal').length,
          DTMI: tickets.filter(t => t.project === 'DTMI' && t.deploymentType === 'Normal').length,
          TRMI: tickets.filter(t => t.project === 'TRMI' && t.deploymentType === 'Normal').length
        },
        Hotfix: {
          TRIC: tickets.filter(t => t.project === 'TRIC' && t.deploymentType === 'Hotfix').length,
          DTMI: tickets.filter(t => t.project === 'DTMI' && t.deploymentType === 'Hotfix').length,
          TRMI: tickets.filter(t => t.project === 'TRMI' && t.deploymentType === 'Hotfix').length
        },
        Rollback: {
          TRIC: tickets.filter(t => t.project === 'TRIC' && t.deploymentType === 'Rollback').length,
          DTMI: tickets.filter(t => t.project === 'DTMI' && t.deploymentType === 'Rollback').length,
          TRMI: tickets.filter(t => t.project === 'TRMI' && t.deploymentType === 'Rollback').length
        }
      }
    };
    
    // Group tickets by release
    const releaseGroups = [];
    const ticketsByRelease = new Map();
    
    tickets.forEach(ticket => {
      const releaseKey = `${ticket.project}-${ticket.deploymentType}`;
      if (!ticketsByRelease.has(releaseKey)) {
        ticketsByRelease.set(releaseKey, []);
      }
      ticketsByRelease.get(releaseKey).push({
        ticket: ticket.key,
        title: ticket.summary,
        done_date: ticket.resolved,
        release_type: ticket.deploymentType,
        project: ticket.project
      });
    });
    
    // Convert to releases array format
    for (const [releaseKey, ticketList] of ticketsByRelease) {
      releaseGroups.push({
        label: releaseKey,
        tickets: ticketList
      });
    }
    
    // Create complete output structure
    const outputData = {
      summary: summary.breakdown,
      releases: releaseGroups,
      metadata: {
        total_tickets: summary.totalTickets,
        total_releases: summary.totalReleases
      }
    };
    
    // Save transformed data
    const outputFile = `${outputPrefix}.json`;
    await fs.writeFile(outputFile, JSON.stringify(outputData, null, 2));
    console.log(`💾 Transformed data saved to: ${outputFile}`);
    
    // Save summary
    const summaryFile = `${outputPrefix}-summary.txt`;
    let summaryText = 'JIRA Transformation Results\n';
    summaryText += '============================\n\n';
    summaryText += `Total Issues: ${summary.totalTickets}\n`;
    summaryText += `Total Releases: ${summary.totalReleases}\n\n`;
    summaryText += 'Breakdown by Project and Type:\n';
    summaryText += `  Normal Releases:\n`;
    summaryText += `    - TRIC: ${summary.breakdown.Normal.TRIC}\n`;
    summaryText += `    - DTMI: ${summary.breakdown.Normal.DTMI}\n`;
    summaryText += `    - TRMI: ${summary.breakdown.Normal.TRMI}\n`;
    summaryText += `  Hotfixes:\n`;
    summaryText += `    - TRIC: ${summary.breakdown.Hotfix.TRIC}\n`;
    summaryText += `    - DTMI: ${summary.breakdown.Hotfix.DTMI}\n`;
    summaryText += `    - TRMI: ${summary.breakdown.Hotfix.TRMI}\n`;
    summaryText += `  Rollbacks:\n`;
    summaryText += `    - TRIC: ${summary.breakdown.Rollback.TRIC}\n`;
    summaryText += `    - DTMI: ${summary.breakdown.Rollback.DTMI}\n`;
    summaryText += `    - TRMI: ${summary.breakdown.Rollback.TRMI}\n`;
    
    await fs.writeFile(summaryFile, summaryText);
    console.log(`📄 Summary saved to: ${summaryFile}`);
    
    return { tickets, summary, outputFile, summaryFile };
    
  } catch (error) {
    console.error(`❌ Error transforming JIRA data:`, error.message);
    throw error;
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const inputFile = process.argv[2];
  const outputPrefix = process.argv[3] || 'transformed-jira-data';
  
  if (!inputFile) {
    console.error('Usage: node transform-jira-data.js <input-file> [output-prefix]');
    process.exit(1);
  }
  
  transformJiraData(inputFile, outputPrefix)
    .then(result => {
      console.log('✅ Transformation complete!');
    })
    .catch(error => {
      console.error('💥 Transformation failed:', error.message);
      process.exit(1);
    });
}

export { transformJiraData };