import { ErrorDetail, StyleValidationResult } from '../types/style.js';

/**
 * 错误处理器类
 * 提供统一的错误处理和验证机制
 */
export class ErrorHandler {
  private errors: ErrorDetail[] = [];
  private warnings: ErrorDetail[] = [];

  /**
   * 添加错误
   */
  addError(code: string, message: string, location?: ErrorDetail['location'], suggestion?: string): void {
    this.errors.push({
      code,
      message,
      location,
      severity: 'error',
      suggestion
    });
  }

  /**
   * 添加警告
   */
  addWarning(code: string, message: string, location?: ErrorDetail['location'], suggestion?: string): void {
    this.warnings.push({
      code,
      message,
      location,
      severity: 'warning',
      suggestion
    });
  }

  /**
   * 获取所有错误
   */
  getErrors(): ErrorDetail[] {
    return [...this.errors];
  }

  /**
   * 获取所有警告
   */
  getWarnings(): ErrorDetail[] {
    return [...this.warnings];
  }

  /**
   * 是否有错误
   */
  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  /**
   * 是否有警告
   */
  hasWarnings(): boolean {
    return this.warnings.length > 0;
  }

  /**
   * 清空所有错误和警告
   */
  clear(): void {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * 获取验证结果
   */
  getValidationResult(): StyleValidationResult {
    return {
      valid: !this.hasErrors(),
      errors: this.hasErrors() ? this.errors.map(e => e.message) : undefined,
      warnings: this.hasWarnings() ? this.warnings.map(w => w.message) : undefined,
      suggestions: [...this.errors, ...this.warnings]
        .filter(item => item.suggestion)
        .map(item => item.suggestion!)
    };
  }

  /**
   * 格式化错误信息
   */
  formatError(error: ErrorDetail): string {
    let formatted = `[${error.severity.toUpperCase()}] ${error.code}: ${error.message}`;
    
    if (error.location) {
      const loc = error.location;
      if (loc.file) formatted += `\n  文件: ${loc.file}`;
      if (loc.line !== undefined) formatted += `\n  行: ${loc.line}`;
      if (loc.column !== undefined) formatted += `\n  列: ${loc.column}`;
    }
    
    if (error.suggestion) {
      formatted += `\n  建议: ${error.suggestion}`;
    }
    
    return formatted;
  }

  /**
   * 打印所有错误和警告
   */
  printAll(): void {
    if (this.hasErrors()) {
      console.error('\n=== 错误 ===');
      this.errors.forEach(error => {
        console.error(this.formatError(error));
      });
    }

    if (this.hasWarnings()) {
      console.warn('\n=== 警告 ===');
      this.warnings.forEach(warning => {
        console.warn(this.formatError(warning));
      });
    }
  }

  /**
   * 尝试自动修复错误
   */
  static autoFix(config: any): { fixed: any; changes: string[] } {
    const changes: string[] = [];
    const fixed = JSON.parse(JSON.stringify(config));

    // 修复颜色格式
    const fixColor = (obj: any, path: string) => {
      if (obj && typeof obj === 'object') {
        for (const key in obj) {
          if (key === 'color' && typeof obj[key] === 'string') {
            // 移除#号
            if (obj[key].startsWith('#')) {
              obj[key] = obj[key].substring(1);
              changes.push(`移除 ${path}.${key} 中的 # 号`);
            }
            // 验证十六进制格式
            if (!/^[0-9A-Fa-f]{6}$/.test(obj[key])) {
              obj[key] = '000000';
              changes.push(`修正 ${path}.${key} 的颜色格式为默认值 000000`);
            }
          } else if (typeof obj[key] === 'object') {
            fixColor(obj[key], `${path}.${key}`);
          }
        }
      }
    };

    // 修复字号范围
    const fixSize = (obj: any, path: string) => {
      if (obj && typeof obj === 'object') {
        for (const key in obj) {
          if (key === 'size' && typeof obj[key] === 'number') {
            if (obj[key] < 8) {
              obj[key] = 8;
              changes.push(`调整 ${path}.${key} 字号至最小值 8`);
            } else if (obj[key] > 144) {
              obj[key] = 144;
              changes.push(`调整 ${path}.${key} 字号至最大值 144`);
            }
          } else if (typeof obj[key] === 'object') {
            fixSize(obj[key], `${path}.${key}`);
          }
        }
      }
    };

    fixColor(fixed, 'config');
    fixSize(fixed, 'config');

    return { fixed, changes };
  }
}

/**
 * 配置验证器类
 */
export class ConfigValidator {
  private errorHandler: ErrorHandler;

  constructor() {
    this.errorHandler = new ErrorHandler();
  }

  /**
   * 验证颜色值
   */
  validateColor(color: string | undefined, fieldName: string): boolean {
    if (!color) return true;

    if (!/^[0-9A-Fa-f]{6}$/.test(color)) {
      this.errorHandler.addError(
        'INVALID_COLOR',
        `${fieldName} 颜色格式无效`,
        undefined,
        '颜色应为6位十六进制格式，如 "FF0000"'
      );
      return false;
    }
    return true;
  }

  /**
   * 验证字号
   */
  validateSize(size: number | undefined, fieldName: string, min = 8, max = 144): boolean {
    if (size === undefined) return true;

    if (size < min || size > max) {
      this.errorHandler.addWarning(
        'SIZE_OUT_OF_RANGE',
        `${fieldName} 字号超出建议范围`,
        undefined,
        `建议字号范围: ${min}-${max}`
      );
      return false;
    }
    return true;
  }

  /**
   * 验证透明度
   */
  validateOpacity(opacity: number | undefined, fieldName: string): boolean {
    if (opacity === undefined) return true;

    if (opacity < 0 || opacity > 1) {
      this.errorHandler.addError(
        'INVALID_OPACITY',
        `${fieldName} 透明度无效`,
        undefined,
        '透明度应在 0-1 之间'
      );
      return false;
    }
    return true;
  }

  /**
   * 获取验证结果
   */
  getResult(): StyleValidationResult {
    return this.errorHandler.getValidationResult();
  }

  /**
   * 重置验证器
   */
  reset(): void {
    this.errorHandler.clear();
  }

  /**
   * 打印验证结果
   */
  print(): void {
    this.errorHandler.printAll();
  }
}