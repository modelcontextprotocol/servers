#!/usr/bin/env ts-node
import * as actions from '../operations/actions.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Check if the required environment variables are set
if (!process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
  console.error('❌ Error: GITHUB_PERSONAL_ACCESS_TOKEN environment variable is required');
  console.error('Please create a GitHub token with the "workflow" scope and set it in your .env file');
  process.exit(1);
}

// Repository info - use environment variables or defaults
const OWNER = process.env.E2E_TEST_OWNER || 'modelcontextprotocol';
const REPO = process.env.E2E_TEST_REPO || 'servers';

// Demo function
async function runDemo() {
  try {
    console.log('🚀 Starting GitHub Actions Demo');
    console.log(`📁 Using repository: ${OWNER}/${REPO}\n`);
    
    // List workflows
    console.log('📋 Listing workflows...');
    const workflows = await actions.listWorkflows(OWNER, REPO);
    console.log(`Found ${workflows.total_count} workflows`);
    workflows.workflows.forEach((workflow: any, index: number) => {
      console.log(`  ${index + 1}. ${workflow.name} (${workflow.state}) - ${workflow.path}`);
    });
    console.log();
    
    // List recent workflow runs
    console.log('📋 Listing recent workflow runs...');
    const runs = await actions.listWorkflowRuns(OWNER, REPO, { per_page: 5 });
    console.log(`Found ${runs.total_count} workflow runs`);
    runs.workflow_runs.forEach((run: any, index: number) => {
      console.log(`  ${index + 1}. ${run.name} (#${run.run_number}) - ${run.status}/${run.conclusion || 'pending'}`);
    });
    console.log();
    
    // Check for failed runs
    console.log('🔍 Looking for failed runs...');
    const failedRuns = await actions.getRecentFailedRuns(OWNER, REPO, 3);
    if (failedRuns.length === 0) {
      console.log('✅ No failed runs found (that\'s good!)');
    } else {
      console.log(`⚠️ Found ${failedRuns.length} failed runs`);
      failedRuns.forEach((failedRun: any, index: number) => {
        console.log(`  ${index + 1}. ${failedRun.run.name} - ${failedRun.run.url}`);
        failedRun.failed_jobs.forEach((job: any) => {
          console.log(`    ❌ Job: ${job.name}`);
          job.steps.forEach((step: any) => {
            console.log(`      - Failed step: ${step.name} (#${step.number})`);
          });
        });
      });
    }
    
    console.log('\n✨ Demo completed successfully!');
  } catch (error) {
    console.error('❌ Demo failed with error:');
    console.error(error);
    process.exit(1);
  }
}

// Run the demo
runDemo(); 