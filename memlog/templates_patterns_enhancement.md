# Templates and Patterns Enhancement for Sequential Thinking Tool

## Overview

This document outlines a proposed enhancement to the Sequential Thinking tool to add Templates and Patterns functionality. This enhancement would provide pre-defined structures for common types of reasoning or problem-solving approaches, making the tool more accessible to new users and standardizing approaches to common problem types.

## Motivation

The Templates and Patterns enhancement would:
- Make structured thinking more accessible to new users
- Standardize approaches to common problem types
- Accelerate the problem-solving process
- Provide starting points for different types of thinking tasks

This enhancement builds on the existing functionality without requiring major architectural changes (unlike Collaborative Thinking) and would provide immediate value to users.

## Implementation Details

### Key Components

1. **Template System**
   - Create interfaces for Template, TemplateStep, and TemplateParameter
   - Implement a TemplateManager class to manage templates
   - Add new MCP tools for working with templates
   - Integrate with the existing server

2. **Built-in Templates**
   - Scientific Method
   - Design Thinking
   - SWOT Analysis
   - Problem-Solution Framework
   - Decision Matrix
   - Root Cause Analysis
   - And more...

3. **User-Defined Templates**
   - Allow users to create and save custom templates
   - Support importing and exporting templates as JSON files
   - Provide a template editor interface

### Data Structures

```typescript
// Template interface
interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  steps: TemplateStep[];
  parameters: TemplateParameter[];
  version: string;
  author?: string;
  tags?: string[];
}

// Template step interface
interface TemplateStep {
  stepNumber: number;
  title: string;
  description: string;
  promptText: string; // Can include parameter placeholders like {{parameter_name}}
  isChainOfThought?: boolean;
  isHypothesis?: boolean;
  isVerification?: boolean;
  branchPoint?: boolean; // Indicates if this step can branch into multiple paths
}

// Template parameter interface
interface TemplateParameter {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  defaultValue?: any;
  required: boolean;
  options?: any[]; // For parameters with predefined options
}
```

### Template Manager

The TemplateManager class would be responsible for:
- Loading built-in templates
- Loading user-defined templates from files
- Validating templates
- Saving user-defined templates
- Creating sessions from templates

### MCP Tools

New MCP tools would be added to support template functionality:
- `list_templates`: List available thinking templates
- `get_template`: Get details of a specific template
- `create_from_template`: Create a new thinking session from a template
- `save_template`: Save a custom template
- `delete_template`: Delete a custom template

## Example: Scientific Method Template

```typescript
const scientificMethod: Template = {
  id: 'scientific-method',
  name: 'Scientific Method',
  description: 'A systematic approach to problem-solving using observation, hypothesis, experimentation, and conclusion.',
  category: 'Research',
  steps: [
    {
      stepNumber: 1,
      title: 'Observation',
      description: 'Observe and define the problem or question.',
      promptText: 'What is the problem or question you are trying to solve? Describe your observations and the context of the problem.'
    },
    {
      stepNumber: 2,
      title: 'Research',
      description: 'Gather information and research related to the problem.',
      promptText: 'What information do you already have about this problem? What additional information would be helpful?'
    },
    {
      stepNumber: 3,
      title: 'Hypothesis',
      description: 'Formulate a hypothesis that might answer the question.',
      promptText: 'Based on your observations and research, what is your hypothesis? What do you think might be the answer or solution?',
      isHypothesis: true
    },
    {
      stepNumber: 4,
      title: 'Experiment',
      description: 'Design and conduct experiments to test the hypothesis.',
      promptText: 'How can you test your hypothesis? What experiments or tests would provide evidence for or against your hypothesis?'
    },
    {
      stepNumber: 5,
      title: 'Analysis',
      description: 'Analyze the data and results from the experiments.',
      promptText: 'What do the results of your experiments show? Do they support or contradict your hypothesis?'
    },
    {
      stepNumber: 6,
      title: 'Conclusion',
      description: 'Draw conclusions based on the analysis.',
      promptText: 'What conclusions can you draw from your analysis? Was your hypothesis supported or refuted?',
      isVerification: true
    },
    {
      stepNumber: 7,
      title: 'Communication',
      description: 'Communicate the results and conclusions.',
      promptText: 'How would you communicate your findings to others? What are the key points to emphasize?'
    }
  ],
  parameters: [
    {
      name: 'problem_domain',
      description: 'The domain or field of the problem',
      type: 'string',
      required: false
    },
    {
      name: 'time_constraint',
      description: 'Any time constraints for solving the problem',
      type: 'string',
      required: false
    }
  ],
  version: '1.0.0'
};
```

## Implementation Steps

1. Create a new `templates.ts` file to define the template system interfaces and classes
2. Implement the TemplateManager class
3. Add built-in templates for common reasoning patterns
4. Add new MCP tools for working with templates
5. Modify the server's request handler to handle the new tools
6. Implement handler functions for each of the new tools
7. Add functionality to export and import templates as JSON files
8. Update documentation to describe the new template functionality

## Conclusion

The Templates and Patterns enhancement would be a valuable addition to the Sequential Thinking tool, making it more accessible and useful for a wider range of users and problem types. It builds on the existing functionality and would be a logical next step after the Visualization enhancement that has already been implemented.
