/**
 * Quality Check Script for MCP Server
 * 
 * This script validates the project against MCP official standards
 * and ensures code quality best practices.
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class QualityChecker {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.projectRoot = join(__dirname, '..');
  }

  /**
   * Check if file exists and is readable
   */
  checkFileExists(filePath, description) {
    const fullPath = join(this.projectRoot, filePath);
    if (!existsSync(fullPath)) {
      this.errors.push(`Missing required file: ${filePath} (${description})`);
      return false;
    }
    return true;
  }

  /**
   * Validate package.json structure
   */
  validatePackageJson() {
    console.log('📦 Validating package.json...');
    
    try {
      const packageJsonPath = join(this.projectRoot, 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

      // Required fields
      const requiredFields = ['name', 'version', 'description', 'main', 'type', 'scripts'];
      for (const field of requiredFields) {
        if (!packageJson[field]) {
          this.errors.push(`package.json missing required field: ${field}`);
        }
      }

      // MCP specific fields
      if (!packageJson.mcp) {
        this.errors.push('package.json missing MCP configuration section');
      } else {
        const mcpFields = ['type', 'transports', 'tools'];
        for (const field of mcpFields) {
          if (!packageJson.mcp[field]) {
            this.errors.push(`MCP configuration missing required field: ${field}`);
          }
        }
      }

      // Dependencies check
      const requiredDeps = [
        '@modelcontextprotocol/sdk',
        'docx',
        'markdown-it',
        'zod'
      ];
      for (const dep of requiredDeps) {
        if (!packageJson.dependencies?.[dep]) {
          this.warnings.push(`Missing recommended dependency: ${dep}`);
        }
      }

      // Scripts check
      const requiredScripts = ['build', 'start'];
      for (const script of requiredScripts) {
        if (!packageJson.scripts?.[script]) {
          this.warnings.push(`Missing recommended script: ${script}`);
        }
      }

    } catch (error) {
      this.errors.push(`Failed to parse package.json: ${error.message}`);
    }
  }

  /**
   * Validate project structure
   */
  validateProjectStructure() {
    console.log('📁 Validating project structure...');

    const requiredFiles = [
      { path: 'README.md', description: 'Project documentation' },
      { path: 'package.json', description: 'Package configuration' },
      { path: 'src/index.ts', description: 'Main server entry point' },
      { path: 'src/types/index.ts', description: 'Type definitions' },
      { path: 'tsconfig.json', description: 'TypeScript configuration' },
      { path: 'LICENSE', description: 'License file' }
    ];

    const recommendedFiles = [
      { path: 'examples/', description: 'Usage examples' },
      { path: 'docs/', description: 'Documentation' },
      { path: 'tests/', description: 'Test files' }
    ];

    for (const file of requiredFiles) {
      this.checkFileExists(file.path, file.description);
    }

    for (const file of recommendedFiles) {
      if (!this.checkFileExists(file.path, file.description)) {
        this.warnings.push(`Missing recommended directory: ${file.path}`);
      }
    }
  }

  /**
   * Validate TypeScript configuration
   */
  validateTypeScriptConfig() {
    console.log('🔧 Validating TypeScript configuration...');
    
    try {
      const tsconfigPath = join(this.projectRoot, 'tsconfig.json');
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));

      // Check for required compiler options
      const requiredOptions = ['target', 'module', 'outDir', 'rootDir', 'strict'];
      for (const option of requiredOptions) {
        if (tsconfig.compilerOptions?.[option] === undefined) {
          this.warnings.push(`TypeScript configuration missing recommended option: ${option}`);
        }
      }

      // Check for ESM support
      if (tsconfig.compilerOptions?.module !== 'ESNext' && tsconfig.compilerOptions?.module !== 'ES2022') {
        this.warnings.push('TypeScript module should be ESNext or ES2022 for modern MCP servers');
      }

    } catch (error) {
      this.errors.push(`Failed to parse tsconfig.json: ${error.message}`);
    }
  }

  /**
   * Validate MCP server implementation
   */
  validateMCPImplementation() {
    console.log('🔌 Validating MCP server implementation...');
    
    try {
      const indexFile = join(this.projectRoot, 'src/index.ts');
      const content = readFileSync(indexFile, 'utf8');

      // Check for required MCP components
      const requiredPatterns = [
        { pattern: /import.*@modelcontextprotocol\/sdk/, description: 'MCP SDK import' },
        { pattern: /class.*Server/, description: 'Server class definition' },
        { pattern: /tools.*\[/, description: 'Tools registration' },
        { pattern: /resources.*\[/, description: 'Resources registration' },
        { pattern: /prompts.*\[/, description: 'Prompts registration' }
      ];

      for (const { pattern, description } of requiredPatterns) {
        if (!pattern.test(content)) {
          this.warnings.push(`MCP server may be missing: ${description}`);
        }
      }

      // Check for proper error handling
      if (!content.includes('try') && !content.includes('catch')) {
        this.warnings.push('MCP server may lack proper error handling');
      }

    } catch (error) {
      this.errors.push(`Failed to validate MCP implementation: ${error.message}`);
    }
  }

  /**
   * Check for security best practices
   */
  validateSecurity() {
    console.log('🔒 Validating security practices...');
    
    try {
      const packageJsonPath = join(this.projectRoot, 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

      // Check for security-related dependencies
      const securityDeps = ['helmet', 'cors', 'express-rate-limit'];
      for (const dep of securityDeps) {
        if (!packageJson.dependencies?.[dep] && !packageJson.devDependencies?.[dep]) {
          this.warnings.push(`Consider adding security dependency: ${dep}`);
        }
      }

      // Check for .gitignore
      if (!this.checkFileExists('.gitignore', 'Git ignore file')) {
        this.warnings.push('Missing .gitignore file for security');
      }

    } catch (error) {
      this.warnings.push(`Security validation incomplete: ${error.message}`);
    }
  }

  /**
   * Run all quality checks
   */
  runAllChecks() {
    console.log('🚀 Starting MCP Quality Checks...\n');
    
    this.validatePackageJson();
    this.validateProjectStructure();
    this.validateTypeScriptConfig();
    this.validateMCPImplementation();
    this.validateSecurity();

    console.log('\n' + '='.repeat(60));
    console.log('📊 QUALITY CHECK RESULTS');
    console.log('='.repeat(60));

    if (this.errors.length > 0) {
      console.log('\n❌ ERRORS (must be fixed):');
      this.errors.forEach(error => console.log(`  • ${error}`));
    }

    if (this.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS (recommended improvements):');
      this.warnings.forEach(warning => console.log(`  • ${warning}`));
    }

    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('\n✅ All quality checks passed! Project is MCP-ready.');
    }

    console.log(`\nSummary: ${this.errors.length} errors, ${this.warnings.length} warnings`);

    return {
      passed: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    };
  }
}

// Run quality checks if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const checker = new QualityChecker();
  const result = checker.runAllChecks();
  
  process.exit(result.passed ? 0 : 1);
}

export default QualityChecker;