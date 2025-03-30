/**
 * Templates and Patterns Module for Sequential Thinking
 * 
 * This module adds template capabilities to the Sequential Thinking server,
 * allowing users to create and use pre-defined structures for common
 * types of reasoning or problem-solving approaches.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { ThoughtData } from './types.js';

/**
 * Template interface
 */
export interface Template {
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

/**
 * Template step interface
 */
export interface TemplateStep {
  stepNumber: number;
  title: string;
  description: string;
  promptText: string; // Can include parameter placeholders like {{parameter_name}}
  isChainOfThought?: boolean;
  isHypothesis?: boolean;
  isVerification?: boolean;
  branchPoint?: boolean; // Indicates if this step can branch into multiple paths
}

/**
 * Template parameter interface
 */
export interface TemplateParameter {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  defaultValue?: any;
  required: boolean;
  options?: any[]; // For parameters with predefined options
}

/**
 * Template Manager class
 */
export class TemplateManager {
  private builtInTemplates: Map<string, Template> = new Map();
  private userTemplates: Map<string, Template> = new Map();
  private templateDir: string;

  constructor(templateDir: string) {
    this.templateDir = templateDir;
    this.loadBuiltInTemplates();
    this.loadUserTemplates();
  }

  /**
   * Load built-in templates
   */
  private loadBuiltInTemplates(): void {
    // Import additional templates
    try {
      // Use dynamic import for ES modules
      import('./additional-templates.js')
        .then(module => {
          const additionalTemplates = module.getAdditionalTemplates();
          
          for (const template of additionalTemplates) {
            this.builtInTemplates.set(template.id, template);
          }
        })
        .catch(error => {
          console.error('Error loading additional templates:', error);
        });
    } catch (error) {
      console.error('Error loading additional templates:', error);
    }
    
    // Scientific Method template
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
      version: '1.0.0',
      tags: ['research', 'hypothesis testing', 'experimentation']
    };

    this.builtInTemplates.set(scientificMethod.id, scientificMethod);

    // Design Thinking template
    const designThinking: Template = {
      id: 'design-thinking',
      name: 'Design Thinking',
      description: 'A human-centered approach to innovation and problem-solving.',
      category: 'Design',
      steps: [
        {
          stepNumber: 1,
          title: 'Empathize',
          description: 'Understand the needs, thoughts, and feelings of the users.',
          promptText: 'Who are the users or stakeholders? What are their needs, pain points, and goals?'
        },
        {
          stepNumber: 2,
          title: 'Define',
          description: 'Define the problem statement based on user needs.',
          promptText: 'Based on your understanding of the users, what is the specific problem that needs to be solved?'
        },
        {
          stepNumber: 3,
          title: 'Ideate',
          description: 'Generate a wide range of creative solutions.',
          promptText: 'What are all the possible solutions to the problem? Don\'t limit yourself at this stage.',
          branchPoint: true
        },
        {
          stepNumber: 4,
          title: 'Prototype',
          description: 'Build representations of one or more of your solutions.',
          promptText: 'How would you create a simple prototype of your solution? What would it look like?'
        },
        {
          stepNumber: 5,
          title: 'Test',
          description: 'Test your prototypes with users and gather feedback.',
          promptText: 'How would you test your prototype with users? What feedback would you expect to receive?',
          isVerification: true
        },
        {
          stepNumber: 6,
          title: 'Iterate',
          description: 'Refine your solution based on feedback.',
          promptText: 'Based on the feedback, how would you improve your solution?'
        }
      ],
      parameters: [
        {
          name: 'user_group',
          description: 'The target user group',
          type: 'string',
          required: false
        },
        {
          name: 'design_constraints',
          description: 'Any constraints on the design',
          type: 'string',
          required: false
        }
      ],
      version: '1.0.0',
      tags: ['design', 'innovation', 'user-centered', 'prototyping']
    };

    this.builtInTemplates.set(designThinking.id, designThinking);
  }

  /**
   * Load user templates from files
   */
  private loadUserTemplates(): void {
    if (!fs.existsSync(this.templateDir)) {
      fs.mkdirSync(this.templateDir, { recursive: true });
      return;
    }

    const files = fs.readdirSync(this.templateDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(this.templateDir, file);
          const templateData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          
          // Validate the template data
          if (this.validateTemplate(templateData)) {
            this.userTemplates.set(templateData.id, templateData);
          }
        } catch (error) {
          console.error(`Error loading template file ${file}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  /**
   * Validate a template object
   */
  private validateTemplate(template: any): template is Template {
    // Basic validation
    if (!template.id || !template.name || !template.description || !template.category) {
      return false;
    }

    if (!Array.isArray(template.steps) || template.steps.length === 0) {
      return false;
    }

    if (!Array.isArray(template.parameters)) {
      return false;
    }

    // Validate steps
    for (const step of template.steps) {
      if (!step.stepNumber || !step.title || !step.description || !step.promptText) {
        return false;
      }
    }

    // Validate parameters
    for (const param of template.parameters) {
      if (!param.name || !param.description || !param.type) {
        return false;
      }
      if (!['string', 'number', 'boolean', 'array'].includes(param.type)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get all available templates
   */
  public getAllTemplates(): Template[] {
    return [...this.builtInTemplates.values(), ...this.userTemplates.values()];
  }

  /**
   * Get templates by category
   */
  public getTemplatesByCategory(category: string): Template[] {
    return this.getAllTemplates().filter(template => template.category === category);
  }

  /**
   * Get all unique tags across all templates
   */
  public getAllTags(): string[] {
    const tagsSet = new Set<string>();
    
    this.getAllTemplates().forEach(template => {
      if (template.tags) {
        template.tags.forEach(tag => tagsSet.add(tag));
      }
    });
    
    return Array.from(tagsSet);
  }
  
  /**
   * Get templates by tag
   */
  public getTemplatesByTag(tag: string): Template[] {
    return this.getAllTemplates().filter(template => 
      template.tags && template.tags.includes(tag)
    );
  }

  /**
   * Get a template by ID
   */
  public getTemplate(id: string): Template | undefined {
    return this.builtInTemplates.get(id) || this.userTemplates.get(id);
  }

  /**
   * Save a user template
   */
  public saveUserTemplate(template: Template): void {
    if (!template.id) {
      template.id = this.generateTemplateId(template.name);
    }

    this.userTemplates.set(template.id, template);
    
    const filePath = path.join(this.templateDir, `${template.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(template, null, 2));
  }

  /**
   * Delete a user template
   */
  public deleteUserTemplate(id: string): boolean {
    if (!this.userTemplates.has(id)) {
      return false;
    }

    const filePath = path.join(this.templateDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return this.userTemplates.delete(id);
  }

  /**
   * Generate a template ID from a name
   */
  private generateTemplateId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + 
           Math.random().toString(36).substring(2, 7);
  }

  /**
   * Create a session from a template
   */
  public createSessionFromTemplate(templateId: string, parameters: Record<string, any> = {}): ThoughtData[] {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Generate thoughts from template steps
    const thoughts: ThoughtData[] = [];
    
    for (const step of template.steps) {
      // Replace parameter placeholders in the prompt text
      let promptText = step.promptText;
      for (const [key, value] of Object.entries(parameters)) {
        promptText = promptText.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
      }

      // Create a thought from the template step
      const thought: ThoughtData = {
        thought: promptText,
        thoughtNumber: step.stepNumber,
        totalThoughts: template.steps.length,
        nextThoughtNeeded: true,
        isChainOfThought: step.isChainOfThought,
        isHypothesis: step.isHypothesis,
        isVerification: step.isVerification,
        chainOfThoughtStep: step.stepNumber,
        totalChainOfThoughtSteps: template.steps.length
      };

      thoughts.push(thought);
    }

    return thoughts;
  }
}

// Example of how to use the TemplateManager
export function setupTemplateManager(): TemplateManager {
  const TEMPLATE_DIR = path.join(os.homedir(), '.sequential-thinking', 'templates');
  return new TemplateManager(TEMPLATE_DIR);
}
