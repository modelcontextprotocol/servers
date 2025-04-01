# Sequential Thinking Server

A Model Context Protocol (MCP) server that provides a tool for dynamic and reflective problem-solving through sequential thoughts and chain of thought reasoning.

## Overview

The Sequential Thinking server helps analyze problems through a flexible thinking process that can adapt and evolve. Each thought can build on, question, or revise previous insights as understanding deepens.

## Setup

This server requires an API key from OpenRouter to function.

1.  Create a `.env` file in the root directory of this project (where the main `package.json` for the `servers` repository resides).
2.  Add your OpenRouter API key to the `.env` file like this:

    ```
    OPENROUTER_API_KEY=your_openrouter_api_key_here
    OPENAI_API_KEY=your_openai_api_key_here
    ```

    *   `OPENROUTER_API_KEY`: Used for accessing Gemini and Claude models via OpenRouter for the core reasoning steps.
    *   `OPENAI_API_KEY`: Used for generating text embeddings (via `text-embedding-3-small`) if the embeddings feature is utilized. If not provided, a basic fallback embedding method will be used.

## Features

- **Sequential Thinking**: Break down complex problems into manageable steps
- **Flexible Thought Process**: Adjust the number of thoughts as needed, revise previous thoughts, and branch into new paths
- **Chain of Thought Reasoning**: Explicitly mark thoughts as part of a Chain of Thought sequence
- **Hypothesis Generation**: Create and test hypotheses as part of the reasoning process
- **Verification**: Verify hypotheses through structured reasoning
- **Persistence**: Save and load thought processes between sessions
- **Multiple Hypotheses**: Support for multiple competing hypotheses with unique identifiers
- **Confidence Levels**: Assign confidence levels (0-100) to hypotheses
- **Branch Merging**: Merge different branches of thought at specific points
- **Chain of Thought Validation**: Automatic validation of Chain of Thought reasoning
- **IDE Context Awareness**: Can optionally receive file structure and open file information from the IDE to inform reasoning.
- **Two-Stage Analysis**: Utilizes Gemini for initial context-aware analysis and pre-reasoning, followed by Claude for final response refinement.

## When to Use

- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope might not be clear initially
- Problems that require a multi-step solution
- Tasks that need to maintain context over multiple steps
- Situations where irrelevant information needs to be filtered out
- When explicit chain of thought reasoning would be beneficial

## Usage

### Regular Sequential Thinking

```javascript
{
  "thought": "This is a regular sequential thought that breaks down a problem.",
  "thoughtNumber": 1,
  "totalThoughts": 5,
  "nextThoughtNeeded": true
}
```

### Chain of Thought Reasoning

```javascript
{
  "thought": "This is a Chain of Thought reasoning step that explicitly follows a structured reasoning process.",
  "thoughtNumber": 2,
  "totalThoughts": 5,
  "nextThoughtNeeded": true,
  "isChainOfThought": true,
  "chainOfThoughtStep": 1,
  "totalChainOfThoughtSteps": 3
}
```

### Hypothesis Generation

```javascript
{
  "thought": "Based on the previous reasoning, I hypothesize that the solution is X because of Y and Z.",
  "thoughtNumber": 3,
  "totalThoughts": 5,
  "nextThoughtNeeded": true,
  "isChainOfThought": true,
  "isHypothesis": true,
  "chainOfThoughtStep": 2,
  "totalChainOfThoughtSteps": 3
}
```

### Hypothesis Verification

```javascript
{
  "thought": "To verify my hypothesis, I'll check if conditions A, B, and C are met. A is true because... B is true because... C is true because... Therefore, my hypothesis is correct.",
  "thoughtNumber": 4,
  "totalThoughts": 5,
  "nextThoughtNeeded": true,
  "isChainOfThought": true,
  "isVerification": true,
  "chainOfThoughtStep": 3,
  "totalChainOfThoughtSteps": 3
}
```

### Conclusion

```javascript
{
  "thought": "After going through the Chain of Thought reasoning process, I can confidently conclude that the answer is X.",
  "thoughtNumber": 5,
  "totalThoughts": 5,
  "nextThoughtNeeded": false
}
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| thought | string | Your current thinking step |
| nextThoughtNeeded | boolean | Whether another thought step is needed |
| thoughtNumber | integer | Current thought number |
| totalThoughts | integer | Estimated total thoughts needed |
| isRevision | boolean | Whether this revises previous thinking |
| revisesThought | integer | Which thought is being reconsidered |
| branchFromThought | integer | Branching point thought number |
| branchId | string | Branch identifier |
| needsMoreThoughts | boolean | If more thoughts are needed |
| isChainOfThought | boolean | Whether this thought is part of a Chain of Thought sequence |
| isHypothesis | boolean | Whether this thought is a hypothesis in the Chain of Thought |
| isVerification | boolean | Whether this thought is verifying a hypothesis in the Chain of Thought |
| chainOfThoughtStep | integer | The step number in the Chain of Thought sequence |
| totalChainOfThoughtSteps | integer | The total number of steps in the Chain of Thought sequence |
| confidenceLevel | number | Confidence level for a hypothesis (0-100) |
| hypothesisId | string | Identifier for a specific hypothesis when working with multiple hypotheses |
| mergeBranchId | string | ID of a branch to merge with the current branch |
| mergeBranchPoint | integer | Thought number where branches should be merged |
| validationStatus | string | Validation status of a Chain of Thought step ('valid', 'invalid', or 'uncertain') |
| validationReason | string | Reason for the validation status |
| dynamicContextWindowSize | integer | Optional dynamic context window size for analysis |
| fileStructure | string | Optional JSON string representing the file structure of the relevant project directory. |
| openFiles | array | Optional array of strings listing the paths of currently open files in the IDE. |

## License

MIT
