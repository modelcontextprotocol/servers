import { ThoughtData } from './types';

interface MCTSNode {
  thought: ThoughtData;
  parent: MCTSNode | null;
  children: MCTSNode[];
  visits: number;
  score: number;
  untriedActions: string[];
}

export class MCTSThinkingEnhancement {
  private readonly explorationConstant = Math.sqrt(2);
  private readonly maxSimulations = 50;
  private readonly maxDepth = 5;

  constructor() {}

  private createNode(thought: ThoughtData, parent: MCTSNode | null = null): MCTSNode {
    return {
      thought,
      parent,
      children: [],
      visits: 0,
      score: 0,
      untriedActions: this.getPossibleActions(thought)
    };
  }

  private getPossibleActions(thought: ThoughtData): string[] {
    const actions = [
      'continue',
      'revise',
      'branch',
      'conclude'
    ];
    
    // Filter actions based on thought context
    if (thought.thoughtNumber >= thought.totalThoughts) {
      actions.push('expand_thoughts');
    }
    if (thought.thoughtNumber > 1) {
      actions.push('revise_previous');
    }
    
    return actions;
  }

  private selectNode(node: MCTSNode): MCTSNode {
    while (node.untriedActions.length === 0 && node.children.length > 0) {
      node = this.selectBestChild(node);
    }
    return node;
  }

  private selectBestChild(node: MCTSNode): MCTSNode {
    return node.children.reduce((best, child) => {
      const ucb1 = this.calculateUCB1(child, node);
      return ucb1 > this.calculateUCB1(best, node) ? child : best;
    }, node.children[0]);
  }

  private calculateUCB1(node: MCTSNode, parent: MCTSNode): number {
    const exploitation = node.score / node.visits;
    const exploration = Math.sqrt(Math.log(parent.visits) / node.visits);
    return exploitation + this.explorationConstant * exploration;
  }

  private expand(node: MCTSNode): MCTSNode {
    const actionIndex = Math.floor(Math.random() * node.untriedActions.length);
    const action = node.untriedActions[actionIndex];
    node.untriedActions.splice(actionIndex, 1);

    const newThought = this.simulateAction(node.thought, action);
    const childNode = this.createNode(newThought, node);
    node.children.push(childNode);
    
    return childNode;
  }

  private simulateAction(thought: ThoughtData, action: string): ThoughtData {
    const newThought = { ...thought };
    
    switch (action) {
      case 'continue':
        newThought.thoughtNumber++;
        break;
      case 'revise':
        newThought.isRevision = true;
        newThought.revisesThought = thought.thoughtNumber;
        break;
      case 'branch':
        newThought.branchFromThought = thought.thoughtNumber;
        newThought.branchId = `branch_${Date.now()}`;
        break;
      case 'expand_thoughts':
        newThought.totalThoughts++;
        newThought.needsMoreThoughts = true;
        break;
      case 'conclude':
        newThought.nextThoughtNeeded = false;
        break;
    }
    
    return newThought;
  }

  private simulate(node: MCTSNode): number {
    let current = { ...node.thought };
    let depth = 0;
    let score = 0;

    while (depth < this.maxDepth && current.nextThoughtNeeded) {
      const actions = this.getPossibleActions(current);
      const action = actions[Math.floor(Math.random() * actions.length)];
      current = this.simulateAction(current, action);
      
      // Score based on various factors
      score += this.evaluateThought(current);
      depth++;
    }

    return score / depth; // Normalize score
  }

  private evaluateThought(thought: ThoughtData): number {
    let score = 0;
    
    // Reward for progress
    score += thought.thoughtNumber / thought.totalThoughts;
    
    // Reward for revisions (showing critical thinking)
    if (thought.isRevision) score += 0.3;
    
    // Reward for branching (exploring alternatives)
    if (thought.branchFromThought) score += 0.2;
    
    // Penalty for excessive length
    if (thought.thoughtNumber > thought.totalThoughts * 1.5) score -= 0.4;
    
    return Math.max(0, Math.min(1, score)); // Normalize between 0 and 1
  }

  private backpropagate(node: MCTSNode, score: number): void {
    while (node !== null) {
      node.visits++;
      node.score += score;
      node = node.parent!;
    }
  }

  public findBestNextThought(currentThought: ThoughtData): ThoughtData {
    const rootNode = this.createNode(currentThought);
    
    for (let i = 0; i < this.maxSimulations; i++) {
      let node = this.selectNode(rootNode);
      
      if (node.untriedActions.length > 0) {
        node = this.expand(node);
      }
      
      const score = this.simulate(node);
      this.backpropagate(node, score);
    }
    
    const bestChild = this.selectBestChild(rootNode);
    return bestChild.thought;
  }
}