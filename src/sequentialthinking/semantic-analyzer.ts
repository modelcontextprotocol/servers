/**
 * Advanced Semantic Analysis for Sequential Thinking
 * 
 * This module implements deeper semantic understanding of code through
 * AST parsing, control flow analysis, and data flow detection.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

// Interfaces for semantic analysis
export interface SemanticModel {
  symbols: SymbolInfo[];
  dependencies: DependencyInfo[];
  controlFlow: ControlFlowInfo[];
  dataFlow: DataFlowInfo[];
  complexity: ComplexityMetrics;
}

export interface SymbolInfo {
  name: string;
  kind: string;
  location: {
    file: string;
    line: number;
    column: number;
  };
  references: {
    file: string;
    line: number;
    column: number;
  }[];
  documentation?: string;
}

export interface DependencyInfo {
  source: string;
  target: string;
  type: 'import' | 'inheritance' | 'implementation' | 'usage';
  location: {
    file: string;
    line: number;
  };
}

export interface ControlFlowInfo {
  type: 'condition' | 'loop' | 'try-catch' | 'switch';
  location: {
    file: string;
    startLine: number;
    endLine: number;
  };
  complexity: number;
  nestedLevel: number;
}

export interface DataFlowInfo {
  variable: string;
  flows: {
    from: {
      file: string;
      line: number;
      symbol: string;
    };
    to: {
      file: string;
      line: number;
      symbol: string;
    };
    transformations: string[];
  }[];
}

export interface ComplexityMetrics {
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  nestingDepth: number;
  halsteadMetrics: {
    volume: number;
    difficulty: number;
    effort: number;
  };
}

/**
 * Class for semantic code analysis
 */
export class SemanticAnalyzer {
  private typeChecker: ts.TypeChecker | null = null;
  private program: ts.Program | null = null;
  
  /**
   * Initialize the TypeScript compiler
   */
  private initializeCompiler(filePaths: string[]): void {
    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
      sourceMap: true,
      declaration: true,
      jsx: ts.JsxEmit.React,
      allowJs: true,
    };
    
    this.program = ts.createProgram(filePaths, compilerOptions);
    this.typeChecker = this.program.getTypeChecker();
  }
  
  /**
   * Analyze a file for semantic information
   */
  public async analyzeFile(filePath: string): Promise<SemanticModel> {
    try {
      // Initialize empty result
      const result: SemanticModel = {
        symbols: [],
        dependencies: [],
        controlFlow: [],
        dataFlow: [],
        complexity: {
          cyclomaticComplexity: 0,
          cognitiveComplexity: 0,
          nestingDepth: 0,
          halsteadMetrics: {
            volume: 0,
            difficulty: 0,
            effort: 0
          }
        }
      };
      
      // Check if file exists and is a TypeScript/JavaScript file
      if (!fs.existsSync(filePath)) {
        console.error(`File does not exist: ${filePath}`);
        return result;
      }
      
      const ext = path.extname(filePath).toLowerCase();
      if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
        console.log(`File is not a TypeScript/JavaScript file: ${filePath}`);
        return result;
      }
      
      // Initialize compiler
      this.initializeCompiler([filePath]);
      
      if (!this.program || !this.typeChecker) {
        console.error("Failed to initialize TypeScript compiler");
        return result;
      }
      
      // Get source file
      const sourceFile = this.program.getSourceFile(filePath);
      if (!sourceFile) {
        console.error(`Could not get source file: ${filePath}`);
        return result;
      }
      
      // Extract symbols
      result.symbols = this.extractSymbols(sourceFile);
      
      // Extract dependencies
      result.dependencies = this.extractDependencies(sourceFile);
      
      // Analyze control flow
      result.controlFlow = this.analyzeControlFlow(sourceFile);
      
      // Calculate complexity metrics
      result.complexity = this.calculateComplexity(sourceFile);
      
      // Perform basic data flow analysis
      result.dataFlow = this.analyzeDataFlow(sourceFile);
      console.log(`Analyzed data flow for ${filePath}: found ${result.dataFlow.length} flows`);
      
      return result;
    } catch (error) {
      console.error(`Error analyzing file ${filePath}:`, error);
      return {
        symbols: [],
        dependencies: [],
        controlFlow: [],
        dataFlow: [],
        complexity: {
          cyclomaticComplexity: 0,
          cognitiveComplexity: 0,
          nestingDepth: 0,
          halsteadMetrics: {
            volume: 0,
            difficulty: 0,
            effort: 0
          }
        }
      };
    }
  }
  
  /**
   * Extract symbols from source file
   */
  private extractSymbols(sourceFile: ts.SourceFile): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];
    
    // Helper function to process node
    const visit = (node: ts.Node) => {
      let symbol: SymbolInfo | null = null;
      
      // Check for declarations
      if (ts.isClassDeclaration(node) && node.name) {
        const name = node.name.text;
        const pos = sourceFile.getLineAndCharacterOfPosition(node.name.getStart());
        
        symbol = {
          name,
          kind: 'class',
          location: {
            file: sourceFile.fileName,
            line: pos.line + 1,
            column: pos.character + 1
          },
          references: [],
          documentation: this.getDocumentation(node)
        };
      } else if (ts.isFunctionDeclaration(node) && node.name) {
        const name = node.name.text;
        const pos = sourceFile.getLineAndCharacterOfPosition(node.name.getStart());
        
        symbol = {
          name,
          kind: 'function',
          location: {
            file: sourceFile.fileName,
            line: pos.line + 1,
            column: pos.character + 1
          },
          references: [],
          documentation: this.getDocumentation(node)
        };
      } else if (ts.isInterfaceDeclaration(node) && node.name) {
        const name = node.name.text;
        const pos = sourceFile.getLineAndCharacterOfPosition(node.name.getStart());
        
        symbol = {
          name,
          kind: 'interface',
          location: {
            file: sourceFile.fileName,
            line: pos.line + 1,
            column: pos.character + 1
          },
          references: [],
          documentation: this.getDocumentation(node)
        };
      } else if (ts.isMethodDeclaration(node) && node.name) {
        let name = '';
        if (ts.isIdentifier(node.name)) {
          name = node.name.text;
        } else if (ts.isStringLiteral(node.name)) {
          name = node.name.text;
        }
        
        if (name) {
          const pos = sourceFile.getLineAndCharacterOfPosition(node.name.getStart());
          
          // Try to get parent class/interface name
          let parentName = '';
          if (node.parent && ts.isClassDeclaration(node.parent) && node.parent.name) {
            parentName = node.parent.name.text + '.';
          }
          
          symbol = {
            name: parentName + name,
            kind: 'method',
            location: {
              file: sourceFile.fileName,
              line: pos.line + 1,
              column: pos.character + 1
            },
            references: [],
            documentation: this.getDocumentation(node)
          };
        }
      } else if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
        const name = node.name.text;
        const pos = sourceFile.getLineAndCharacterOfPosition(node.name.getStart());
        
        symbol = {
          name,
          kind: 'variable',
          location: {
            file: sourceFile.fileName,
            line: pos.line + 1,
            column: pos.character + 1
          },
          references: [],
          documentation: this.getDocumentation(node.parent)
        };
      }
      
      // Add symbol if found
      if (symbol) {
        symbols.push(symbol);
      }
      
      // Continue traversing
      ts.forEachChild(node, visit);
    };
    
    // Start traversal
    visit(sourceFile);
    
    return symbols;
  }
  
  /**
   * Extract JSDoc documentation from node
   */
  private getDocumentation(node: ts.Node | undefined): string | undefined {
    if (!node) return undefined;
    
    const jsDocTags = ts.getJSDocTags(node);
    if (jsDocTags.length === 0) return undefined;
    
    return jsDocTags.map(tag => {
      let text = tag.tagName.text;
      
      if (tag.comment) {
        if (typeof tag.comment === 'string') {
          text += ' ' + tag.comment;
        } else {
          text += ' ' + tag.comment.map(c => c.text).join(' ');
        }
      }
      
      return '@' + text;
    }).join('\n');
  }
  
  /**
   * Extract dependencies from imports and class extensions
   */
  private extractDependencies(sourceFile: ts.SourceFile): DependencyInfo[] {
    const dependencies: DependencyInfo[] = [];
    
    // Helper function to process node
    const visit = (node: ts.Node) => {
      // Import dependencies
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier;
        if (ts.isStringLiteral(moduleSpecifier)) {
          const importPath = moduleSpecifier.text;
          const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          
          dependencies.push({
            source: sourceFile.fileName,
            target: importPath,
            type: 'import',
            location: {
              file: sourceFile.fileName,
              line: pos.line + 1
            }
          });
        }
      }
      
      // Class inheritance
      if (ts.isClassDeclaration(node) && node.name && node.heritageClauses) {
        const className = node.name.text;
        
        for (const heritage of node.heritageClauses) {
          if (heritage.token === ts.SyntaxKind.ExtendsKeyword) {
            for (const type of heritage.types) {
              if (ts.isExpressionWithTypeArguments(type)) {
                const expression = type.expression;
                if (ts.isIdentifier(expression)) {
                  const baseClassName = expression.text;
                  const pos = sourceFile.getLineAndCharacterOfPosition(expression.getStart());
                  
                  dependencies.push({
                    source: className,
                    target: baseClassName,
                    type: 'inheritance',
                    location: {
                      file: sourceFile.fileName,
                      line: pos.line + 1
                    }
                  });
                }
              }
            }
          } else if (heritage.token === ts.SyntaxKind.ImplementsKeyword) {
            for (const type of heritage.types) {
              if (ts.isExpressionWithTypeArguments(type)) {
                const expression = type.expression;
                if (ts.isIdentifier(expression)) {
                  const interfaceName = expression.text;
                  const pos = sourceFile.getLineAndCharacterOfPosition(expression.getStart());
                  
                  dependencies.push({
                    source: className,
                    target: interfaceName,
                    type: 'implementation',
                    location: {
                      file: sourceFile.fileName,
                      line: pos.line + 1
                    }
                  });
                }
              }
            }
          }
        }
      }
      
      // Continue traversing
      ts.forEachChild(node, visit);
    };
    
    // Start traversal
    visit(sourceFile);
    
    return dependencies;
  }
  
  /**
   * Analyze data flow by tracking variable assignments and usages
   */
  private analyzeDataFlow(sourceFile: ts.SourceFile): DataFlowInfo[] {
    const dataFlows: DataFlowInfo[] = [];
    const variableAssignments = new Map<string, Array<{
      file: string;
      line: number;
      symbol: string;
    }>>();
    const variableUsages = new Map<string, Array<{
      file: string;
      line: number;
      symbol: string;
    }>>();
    
    // Helper function to process nodes
    const visit = (node: ts.Node) => {
      // Track variable declarations with initializers
      if (ts.isVariableDeclaration(node) && node.initializer) {
        const variableName = node.name.getText();
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        
        if (!variableAssignments.has(variableName)) {
          variableAssignments.set(variableName, []);
        }
        
        variableAssignments.get(variableName)?.push({
          file: sourceFile.fileName,
          line: pos.line + 1,
          symbol: variableName
        });
        
        // If initializer uses other variables, track those relationships
        trackExpressionUsages(node.initializer, variableName);
      }
      
      // Track assignments
      if (ts.isBinaryExpression(node) && 
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken && 
          ts.isIdentifier(node.left)) {
        const variableName = node.left.getText();
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        
        if (!variableAssignments.has(variableName)) {
          variableAssignments.set(variableName, []);
        }
        
        variableAssignments.get(variableName)?.push({
          file: sourceFile.fileName,
          line: pos.line + 1,
          symbol: variableName
        });
        
        // If right side uses other variables, track those relationships
        trackExpressionUsages(node.right, variableName);
      }
      
      // Continue traversing
      ts.forEachChild(node, visit);
    };
    
    // Helper to track variable usages in expressions
    const trackExpressionUsages = (expression: ts.Expression, targetVar: string) => {
      const expressionVisitor = (node: ts.Node) => {
        if (ts.isIdentifier(node)) {
          const usedVarName = node.getText();
          // Don't count self-references
          if (usedVarName !== targetVar) {
            const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            
            if (!variableUsages.has(usedVarName)) {
              variableUsages.set(usedVarName, []);
            }
            
            variableUsages.get(usedVarName)?.push({
              file: sourceFile.fileName,
              line: pos.line + 1,
              symbol: targetVar
            });
          }
        }
        ts.forEachChild(node, expressionVisitor);
      };
      
      expressionVisitor(expression);
    };
    
    // Start traversal
    visit(sourceFile);
    
    // Build data flow information
    for (const [variable, assignments] of variableAssignments.entries()) {
      const usages = variableUsages.get(variable) || [];
      
      // Create data flow entries for each assignment that flows to usages
      for (const assignment of assignments) {
        const flows = usages.map(usage => ({
          from: assignment,
          to: usage,
          transformations: []
        }));
        
        if (flows.length > 0) {
          dataFlows.push({
            variable,
            flows
          });
        }
      }
    }
    
    return dataFlows;
  }

  /**
   * Analyze control flow structures (conditions, loops, etc.)
   */
  private analyzeControlFlow(sourceFile: ts.SourceFile): ControlFlowInfo[] {
    const controlFlow: ControlFlowInfo[] = [];
    
    // Track nesting level
    let nestingLevel = 0;
    
    // Helper function to process node
    const visit = (node: ts.Node) => {
      let cfInfo: ControlFlowInfo | null = null;
      
      // Check node type
      if (ts.isIfStatement(node)) {
        const startPos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        const endPos = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
        
        cfInfo = {
          type: 'condition',
          location: {
            file: sourceFile.fileName,
            startLine: startPos.line + 1,
            endLine: endPos.line + 1
          },
          complexity: 1, // Basic complexity
          nestedLevel: nestingLevel
        };
      } else if (ts.isForStatement(node) || ts.isForInStatement(node) || 
                ts.isForOfStatement(node) || ts.isWhileStatement(node) ||
                ts.isDoStatement(node)) {
        const startPos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        const endPos = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
        
        cfInfo = {
          type: 'loop',
          location: {
            file: sourceFile.fileName,
            startLine: startPos.line + 1,
            endLine: endPos.line + 1
          },
          complexity: 1, // Basic complexity
          nestedLevel: nestingLevel
        };
      } else if (ts.isTryStatement(node)) {
        const startPos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        const endPos = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
        
        cfInfo = {
          type: 'try-catch',
          location: {
            file: sourceFile.fileName,
            startLine: startPos.line + 1,
            endLine: endPos.line + 1
          },
          complexity: 1, // Basic complexity
          nestedLevel: nestingLevel
        };
      } else if (ts.isSwitchStatement(node)) {
        const startPos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        const endPos = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
        
        // Count case clauses for complexity
        let caseCount = 0;
        if (node.caseBlock && node.caseBlock.clauses) {
          caseCount = node.caseBlock.clauses.length;
        }
        
        cfInfo = {
          type: 'switch',
          location: {
            file: sourceFile.fileName,
            startLine: startPos.line + 1,
            endLine: endPos.line + 1
          },
          complexity: caseCount, // Complexity based on number of cases
          nestedLevel: nestingLevel
        };
      }
      
      // Add control flow info if found
      if (cfInfo) {
        controlFlow.push(cfInfo);
        
        // Increase nesting level for children
        nestingLevel++;
        ts.forEachChild(node, visit);
        nestingLevel--;
      } else {
        // Continue traversing
        ts.forEachChild(node, visit);
      }
    };
    
    // Start traversal
    visit(sourceFile);
    
    return controlFlow;
  }
  
  /**
   * Calculate code complexity metrics
   */
  private calculateComplexity(sourceFile: ts.SourceFile): ComplexityMetrics {
    // Initialize metrics
    let cyclomaticComplexity = 1; // Base complexity of 1
    let cognitiveComplexity = 0;
    let maxNestingDepth = 0;
    let currentNestingDepth = 0;
    
    // Halstead metrics
    let operators = new Set<string>();
    let operands = new Set<string>();
    let totalOperators = 0;
    let totalOperands = 0;
    
    // Helper function to process node
    const visit = (node: ts.Node) => {
      // Track nesting for certain structures
      let increasedNesting = false;
      
      // Cyclomatic complexity increases for:
      // - if statements
      // - while, for, do-while loops
      // - case clauses in switch statements
      // - conditional expressions
      // - logical && and || operators (short-circuit evaluation)
      // - catch clauses
      
      if (ts.isIfStatement(node) || 
          ts.isWhileStatement(node) || 
          ts.isForStatement(node) || 
          ts.isForInStatement(node) || 
          ts.isForOfStatement(node) || 
          ts.isDoStatement(node)) {
        cyclomaticComplexity++;
        cognitiveComplexity += (1 + currentNestingDepth); // Cognitive complexity considers nesting
        
        currentNestingDepth++;
        increasedNesting = true;
      } else if (ts.isCaseClause(node)) {
        cyclomaticComplexity++;
        cognitiveComplexity++;
      } else if (ts.isConditionalExpression(node)) {
        cyclomaticComplexity++;
        cognitiveComplexity++;
      } else if (ts.isBinaryExpression(node)) {
        if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || 
            node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
          cyclomaticComplexity++;
          cognitiveComplexity++;
        }
        
        // Track operators and operands for Halstead metrics
        operators.add(ts.tokenToString(node.operatorToken.kind) || "unknown");
        totalOperators++;
        
        // Continue with children
        ts.forEachChild(node, visit);
      } else if (ts.isCatchClause(node)) {
        cyclomaticComplexity++;
        cognitiveComplexity += (1 + currentNestingDepth);
      } else if (ts.isIdentifier(node)) {
        // Track operands
        operands.add(node.text);
        totalOperands++;
      } else {
        // Continue with children
        ts.forEachChild(node, visit);
      }
      
      // Update max nesting depth
      maxNestingDepth = Math.max(maxNestingDepth, currentNestingDepth);
      
      // Decrease nesting level if we increased it
      if (increasedNesting) {
        currentNestingDepth--;
      }
    };
    
    // Start traversal
    visit(sourceFile);
    
    // Calculate Halstead metrics
    const n1 = operators.size; // Number of distinct operators
    const n2 = operands.size;  // Number of distinct operands
    const N1 = totalOperators; // Total number of operators
    const N2 = totalOperands;  // Total number of operands
    
    const vocabulary = n1 + n2;
    const length = N1 + N2;
    const volume = length * Math.log2(Math.max(vocabulary, 1));
    const difficulty = (n1 / 2) * (N2 / Math.max(n2, 1));
    const effort = volume * difficulty;
    
    return {
      cyclomaticComplexity,
      cognitiveComplexity,
      nestingDepth: maxNestingDepth,
      halsteadMetrics: {
        volume: Math.round(volume * 100) / 100,
        difficulty: Math.round(difficulty * 100) / 100,
        effort: Math.round(effort * 100) / 100
      }
    };
  }
  
  /**
   * Generate a summary of the semantic analysis
   */
  public summarizeAnalysis(analysis: SemanticModel): string {
    let summary = `# Semantic Analysis Summary\n\n`;
    
    // Symbols summary
    summary += `## Code Structure\n`;
    summary += `- Found ${analysis.symbols.length} symbols\n`;
    
    const symbolsByType = analysis.symbols.reduce((acc, symbol) => {
      acc[symbol.kind] = (acc[symbol.kind] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    for (const [kind, count] of Object.entries(symbolsByType)) {
      summary += `  - ${count} ${kind}(s)\n`;
    }
    
    // Dependencies summary
    summary += `\n## Dependencies\n`;
    summary += `- Found ${analysis.dependencies.length} dependencies\n`;
    
    const dependenciesByType = analysis.dependencies.reduce((acc, dep) => {
      acc[dep.type] = (acc[dep.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    for (const [type, count] of Object.entries(dependenciesByType)) {
      summary += `  - ${count} ${type} relationship(s)\n`;
    }
    
    // Control flow summary
    summary += `\n## Control Flow\n`;
    summary += `- Found ${analysis.controlFlow.length} control flow structures\n`;
    
    const flowByType = analysis.controlFlow.reduce((acc, flow) => {
      acc[flow.type] = (acc[flow.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    for (const [type, count] of Object.entries(flowByType)) {
      summary += `  - ${count} ${type}(s)\n`;
    }
    
    // Maximum nesting level
    const maxNesting = analysis.controlFlow.reduce((max, flow) => 
      Math.max(max, flow.nestedLevel), 0);
    
    summary += `  - Maximum nesting depth: ${maxNesting}\n`;
    
    // Complexity metrics
    summary += `\n## Complexity Metrics\n`;
    summary += `- Cyclomatic Complexity: ${analysis.complexity.cyclomaticComplexity}\n`;
    summary += `- Cognitive Complexity: ${analysis.complexity.cognitiveComplexity}\n`;
    summary += `- Halstead Volume: ${analysis.complexity.halsteadMetrics.volume}\n`;
    summary += `- Halstead Difficulty: ${analysis.complexity.halsteadMetrics.difficulty}\n`;
    
    // Interpretation and recommendations
    summary += `\n## Interpretation\n`;
    
    // Evaluate cyclomatic complexity
    if (analysis.complexity.cyclomaticComplexity <= 10) {
      summary += `- 👍 The code has reasonable cyclomatic complexity (${analysis.complexity.cyclomaticComplexity})\n`;
    } else if (analysis.complexity.cyclomaticComplexity <= 20) {
      summary += `- ⚠️ The code has moderate cyclomatic complexity (${analysis.complexity.cyclomaticComplexity}), consider refactoring complex methods\n`;
    } else {
      summary += `- ❌ The code has high cyclomatic complexity (${analysis.complexity.cyclomaticComplexity}), refactoring is strongly recommended\n`;
    }
    
    // Evaluate nesting depth
    if (maxNesting <= 3) {
      summary += `- 👍 The nesting depth is reasonable (${maxNesting})\n`;
    } else if (maxNesting <= 5) {
      summary += `- ⚠️ The nesting depth is getting high (${maxNesting}), consider extracting methods\n`;
    } else {
      summary += `- ❌ The nesting depth is too high (${maxNesting}), code readability may be affected\n`;
    }
    
    // Overall complexity assessment
    const overallComplexity = (
      (analysis.complexity.cyclomaticComplexity / 10) +
      (maxNesting / 3) +
      (analysis.complexity.cognitiveComplexity / 15)
    ) / 3;
    
    if (overallComplexity < 0.7) {
      summary += `- 👍 Overall, the code is well-structured and maintainable\n`;
    } else if (overallComplexity < 1.2) {
      summary += `- ⚠️ The code is moderately complex, some parts may need refactoring\n`;
    } else {
      summary += `- ❌ The code is highly complex, significant refactoring recommended\n`;
    }
    
    return summary;
  }
}

// Export singleton instance
export const semanticAnalyzer = new SemanticAnalyzer();
