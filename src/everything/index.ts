#!/usr/bin/env node

// Parse command line arguments first
const args = process.argv.slice(2);
const scriptName = args[0] || 'stdio';

async function run() {
    try {
        // Dynamically import only the requested module to prevent all modules from initializing
        switch (scriptName) {
            case 'stdio':
                // Import and run the default server
                await import('./stdio.js');
                break;
            case 'sse':
                // Import and run the SSE server
                await import('./sse.js');
                break;
            case 'streamableHttp':
                // Import and run the streamable HTTP server
                await import('./streamableHttp.js');
                break;
            default:
                console.error(`Unknown script: ${scriptName}`);
                console.log('Available scripts:');
                console.log('- stdio');
                console.log('- sse');
                console.log('- streamableHttp');
                process.exit(1);
        }
    } catch (error) {
        console.error('Error running script:', error);
        process.exit(1);
    }
}

run();
