/**
 * Additional Templates for Sequential Thinking
 * 
 * This module provides additional templates for the Sequential Thinking tool,
 * expanding the utility of the Templates and Patterns enhancement.
 */

import { Template } from './templates.js';

/**
 * SWOT Analysis template
 */
export const swotAnalysis: Template = {
  id: 'swot-analysis',
  name: 'SWOT Analysis',
  description: 'A strategic planning technique used to identify Strengths, Weaknesses, Opportunities, and Threats.',
  category: 'Business',
  steps: [
    {
      stepNumber: 1,
      title: 'Strengths',
      description: 'Identify internal strengths.',
      promptText: 'What are the internal strengths of the subject? Consider resources, capabilities, advantages, etc.'
    },
    {
      stepNumber: 2,
      title: 'Weaknesses',
      description: 'Identify internal weaknesses.',
      promptText: 'What are the internal weaknesses of the subject? Consider limitations, disadvantages, areas for improvement, etc.'
    },
    {
      stepNumber: 3,
      title: 'Opportunities',
      description: 'Identify external opportunities.',
      promptText: 'What are the external opportunities available to the subject? Consider market trends, technological advances, changes in regulations, etc.'
    },
    {
      stepNumber: 4,
      title: 'Threats',
      description: 'Identify external threats.',
      promptText: 'What are the external threats facing the subject? Consider competition, economic factors, political factors, etc.'
    },
    {
      stepNumber: 5,
      title: 'Analysis',
      description: 'Analyze the SWOT findings.',
      promptText: 'Based on the SWOT analysis, what are the key insights and strategic implications?',
      isVerification: true
    }
  ],
  parameters: [
    {
      name: 'subject',
      description: 'The subject of the SWOT analysis',
      type: 'string',
      required: true
    },
    {
      name: 'context',
      description: 'The context or purpose of the analysis',
      type: 'string',
      required: false
    }
  ],
  version: '1.0.0',
  tags: ['strategic planning', 'business analysis', 'evaluation']
};

/**
 * Six Thinking Hats template
 */
export const sixThinkingHats: Template = {
  id: 'six-thinking-hats',
  name: 'Six Thinking Hats',
  description: 'A parallel thinking process that helps people be more productive, focused, and mindfully involved.',
  category: 'Creative',
  steps: [
    {
      stepNumber: 1,
      title: 'White Hat',
      description: 'Focus on the facts and data.',
      promptText: 'What are the facts and data related to this situation? What information do we have? What information is missing?'
    },
    {
      stepNumber: 2,
      title: 'Red Hat',
      description: 'Express feelings, intuition, and emotions.',
      promptText: 'What are your feelings and intuitions about this situation? What is your gut reaction?'
    },
    {
      stepNumber: 3,
      title: 'Black Hat',
      description: 'Consider potential problems and risks.',
      promptText: 'What are the potential problems, risks, and challenges? What could go wrong?'
    },
    {
      stepNumber: 4,
      title: 'Yellow Hat',
      description: 'Focus on benefits and value.',
      promptText: 'What are the benefits and value? What are the positive aspects and opportunities?'
    },
    {
      stepNumber: 5,
      title: 'Green Hat',
      description: 'Generate creative ideas and alternatives.',
      promptText: 'What are some creative ideas and alternatives? How can we approach this differently?'
    },
    {
      stepNumber: 6,
      title: 'Blue Hat',
      description: 'Manage the thinking process and draw conclusions.',
      promptText: 'What have we learned from this thinking process? What are the key insights and next steps?',
      isVerification: true
    }
  ],
  parameters: [
    {
      name: 'topic',
      description: 'The topic or problem to think about',
      type: 'string',
      required: true
    },
    {
      name: 'goal',
      description: 'The goal of the thinking process',
      type: 'string',
      required: false
    }
  ],
  version: '1.0.0',
  tags: ['creative thinking', 'problem solving', 'decision making']
};

/**
 * Root Cause Analysis template
 */
export const rootCauseAnalysis: Template = {
  id: 'root-cause-analysis',
  name: 'Root Cause Analysis',
  description: 'A method of problem solving used for identifying the root causes of faults or problems.',
  category: 'Problem Solving',
  steps: [
    {
      stepNumber: 1,
      title: 'Define the Problem',
      description: 'Clearly define the problem or issue.',
      promptText: 'What is the specific problem or issue that needs to be addressed? Describe it in detail.'
    },
    {
      stepNumber: 2,
      title: 'Collect Data',
      description: 'Gather data and evidence related to the problem.',
      promptText: 'What data and evidence do you have about the problem? What are the symptoms and effects?'
    },
    {
      stepNumber: 3,
      title: 'Identify Possible Causes',
      description: 'Identify all possible causes of the problem.',
      promptText: 'What are all the possible causes of this problem? Consider using techniques like the 5 Whys or Fishbone Diagram.'
    },
    {
      stepNumber: 4,
      title: 'Identify Root Causes',
      description: 'Determine which causes are root causes.',
      promptText: 'Among the possible causes, which ones are the root causes? These are the fundamental issues that, if resolved, would prevent the problem from recurring.'
    },
    {
      stepNumber: 5,
      title: 'Develop Solutions',
      description: 'Develop solutions to address the root causes.',
      promptText: 'What solutions would effectively address the root causes? How would these solutions prevent the problem from recurring?'
    },
    {
      stepNumber: 6,
      title: 'Implement and Monitor',
      description: 'Plan the implementation of solutions and how to monitor their effectiveness.',
      promptText: 'How will the solutions be implemented? How will their effectiveness be monitored and evaluated?',
      isVerification: true
    }
  ],
  parameters: [
    {
      name: 'problem_statement',
      description: 'A clear statement of the problem',
      type: 'string',
      required: true
    },
    {
      name: 'context',
      description: 'The context in which the problem occurs',
      type: 'string',
      required: false
    }
  ],
  version: '1.0.0',
  tags: ['problem solving', 'analysis', 'quality improvement']
};

/**
 * Five Whys template
 */
export const fiveWhys: Template = {
  id: 'five-whys',
  name: 'Five Whys',
  description: 'A simple but powerful technique for getting to the root cause of a problem by asking "why" multiple times.',
  category: 'Problem Solving',
  steps: [
    {
      stepNumber: 1,
      title: 'Define the Problem',
      description: 'Clearly define the problem or issue.',
      promptText: 'What is the specific problem or issue that needs to be addressed? Describe it in detail.'
    },
    {
      stepNumber: 2,
      title: 'First Why',
      description: 'Ask why the problem occurs.',
      promptText: 'Why does this problem occur? What is the immediate cause?'
    },
    {
      stepNumber: 3,
      title: 'Second Why',
      description: 'Ask why the cause identified in the first why occurs.',
      promptText: 'Why does that cause occur? What is behind it?'
    },
    {
      stepNumber: 4,
      title: 'Third Why',
      description: 'Ask why the cause identified in the second why occurs.',
      promptText: 'Why does that deeper cause occur? What is behind it?'
    },
    {
      stepNumber: 5,
      title: 'Fourth Why',
      description: 'Ask why the cause identified in the third why occurs.',
      promptText: 'Why does that even deeper cause occur? What is behind it?'
    },
    {
      stepNumber: 6,
      title: 'Fifth Why',
      description: 'Ask why the cause identified in the fourth why occurs.',
      promptText: 'Why does that root cause occur? What is the fundamental reason?'
    },
    {
      stepNumber: 7,
      title: 'Identify Root Cause',
      description: 'Identify the root cause based on the five whys.',
      promptText: 'Based on the five whys analysis, what is the root cause of the problem?',
      isVerification: true
    }
  ],
  parameters: [
    {
      name: 'problem_statement',
      description: 'A clear statement of the problem',
      type: 'string',
      required: true
    }
  ],
  version: '1.0.0',
  tags: ['problem solving', 'root cause analysis', 'quality improvement']
};

/**
 * Decision Matrix template
 */
export const decisionMatrix: Template = {
  id: 'decision-matrix',
  name: 'Decision Matrix',
  description: 'A systematic method for evaluating and prioritizing a list of options based on multiple criteria.',
  category: 'Decision Making',
  steps: [
    {
      stepNumber: 1,
      title: 'Define the Decision',
      description: 'Clearly define the decision to be made.',
      promptText: 'What decision needs to be made? What is the goal of this decision-making process?'
    },
    {
      stepNumber: 2,
      title: 'Identify Options',
      description: 'List all the options or alternatives being considered.',
      promptText: 'What are all the possible options or alternatives for this decision?'
    },
    {
      stepNumber: 3,
      title: 'Establish Criteria',
      description: 'Identify the criteria that will be used to evaluate the options.',
      promptText: 'What criteria should be used to evaluate these options? What factors are important in making this decision?'
    },
    {
      stepNumber: 4,
      title: 'Assign Weights',
      description: 'Assign weights to each criterion based on its importance.',
      promptText: 'How important is each criterion relative to the others? Assign a weight (e.g., 1-10) to each criterion.'
    },
    {
      stepNumber: 5,
      title: 'Score Options',
      description: 'Score each option against each criterion.',
      promptText: 'For each option, assign a score (e.g., 1-10) for how well it meets each criterion.'
    },
    {
      stepNumber: 6,
      title: 'Calculate Weighted Scores',
      description: 'Calculate the weighted score for each option.',
      promptText: 'For each option, multiply its score for each criterion by the weight of that criterion, then sum these weighted scores.'
    },
    {
      stepNumber: 7,
      title: 'Make Decision',
      description: 'Make a decision based on the weighted scores.',
      promptText: 'Based on the weighted scores, which option is the best choice? Are there any other factors to consider?',
      isVerification: true
    }
  ],
  parameters: [
    {
      name: 'decision_statement',
      description: 'A clear statement of the decision to be made',
      type: 'string',
      required: true
    },
    {
      name: 'options',
      description: 'A comma-separated list of options to consider',
      type: 'string',
      required: false
    },
    {
      name: 'criteria',
      description: 'A comma-separated list of criteria to use',
      type: 'string',
      required: false
    }
  ],
  version: '1.0.0',
  tags: ['decision making', 'evaluation', 'prioritization']
};

/**
 * Get all additional templates
 */
export function getAdditionalTemplates(): Template[] {
  return [
    swotAnalysis,
    sixThinkingHats,
    rootCauseAnalysis,
    fiveWhys,
    decisionMatrix
  ];
}
