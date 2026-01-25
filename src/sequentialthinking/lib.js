import chalk from 'chalk';
export class SequentialThinkingServer {
    thoughtHistory = [];
    branches = {};
    disableThoughtLogging;
    constructor() {
        this.disableThoughtLogging = (process.env.DISABLE_THOUGHT_LOGGING || "").toLowerCase() === "true";
    }
    formatThought(thoughtData) {
        const { thoughtNumber, totalThoughts, thought, isRevision, revisesThought, branchFromThought, branchId } = thoughtData;
        let prefix = '';
        let context = '';
        if (isRevision) {
            prefix = chalk.yellow('🔄 Revision');
            context = ` (revising thought ${revisesThought})`;
        }
        else if (branchFromThought) {
            prefix = chalk.green('🌿 Branch');
            context = ` (from thought ${branchFromThought}, ID: ${branchId})`;
        }
        else {
            prefix = chalk.blue('💭 Thought');
            context = '';
        }
        const header = `${prefix} ${thoughtNumber}/${totalThoughts}${context}`;
        const border = '─'.repeat(Math.max(header.length, thought.length) + 4);
        return `
┌${border}┐
│ ${header} │
├${border}┤
│ ${thought.padEnd(border.length - 2)} │
└${border}┘`;
    }
    processThought(input) {
        try {
            // Validation happens at the tool registration layer via Zod
            // Adjust totalThoughts if thoughtNumber exceeds it
            if (input.thoughtNumber > input.totalThoughts) {
                input.totalThoughts = input.thoughtNumber;
            }
            this.thoughtHistory.push(input);
            if (input.branchFromThought && input.branchId) {
                if (!this.branches[input.branchId]) {
                    this.branches[input.branchId] = [];
                }
                this.branches[input.branchId].push(input);
            }
            if (!this.disableThoughtLogging) {
                const formattedThought = this.formatThought(input);
                console.error(formattedThought);
            }
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({
                            thoughtNumber: input.thoughtNumber,
                            totalThoughts: input.totalThoughts,
                            nextThoughtNeeded: input.nextThoughtNeeded,
                            branches: Object.keys(this.branches),
                            thoughtHistoryLength: this.thoughtHistory.length
                        }, null, 2)
                    }]
            };
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({
                            error: error instanceof Error ? error.message : String(error),
                            status: 'failed'
                        }, null, 2)
                    }],
                isError: true
            };
        }
    }
}
