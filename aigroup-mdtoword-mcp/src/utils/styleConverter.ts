import { StyleConfig } from '../types/style.js';
import { LegacyStyleConfig } from '../types/template.js';

/**
 * 样式转换工具类
 * 用于在新旧样式系统之间进行转换
 */
export class StyleConverter {
  /**
   * 将旧版样式配置转换为新版样式配置
   */
  static convertLegacyToNew(legacyConfig: LegacyStyleConfig): StyleConfig {
    const newConfig: StyleConfig = {};

    // 转换段落样式
    if (legacyConfig.paragraphStyles) {
      newConfig.paragraphStyles = {};
      Object.entries(legacyConfig.paragraphStyles).forEach(([key, style]) => {
        newConfig.paragraphStyles![key] = {
          name: style.name,
          font: style.font,
          size: style.size,
          color: style.color,
          bold: style.bold,
          italic: style.italic,
          alignment: style.alignment,
          spacing: style.spacing,
          indent: style.indent
        };
      });
    }

    // 转换列表样式
    if (legacyConfig.listStyles) {
      newConfig.listStyles = {};
      Object.entries(legacyConfig.listStyles).forEach(([key, style]) => {
        newConfig.listStyles![key] = {
          name: style.name,
          type: style.type,
          format: style.format,
          start: style.start,
          indent: style.indent ? { left: style.indent } : undefined
        };
      });
    }

    // 转换表格样式
    if (legacyConfig.tableStyles) {
      newConfig.tableStyles = {};
      Object.entries(legacyConfig.tableStyles).forEach(([key, style]) => {
        const s = style as import('../types/template.js').LegacyTableStyle;
        newConfig.tableStyles![key] = {
          name: s.name,
          alignment: s.alignment,
          cellMargin: s.cellMargin,
          borders: s.borders ? {
            top: s.borders.top,
            bottom: s.borders.bottom,
            left: s.borders.left,
            right: s.borders.right,
            insideHorizontal: s.borders.insideH,
            insideVertical: s.borders.insideV
          } : undefined
        };
      });
    }

    return newConfig;
  }

  /**
   * 将新版样式配置转换为旧版样式配置
   */
  static convertNewToLegacy(newConfig: StyleConfig): LegacyStyleConfig {
    const legacyConfig: LegacyStyleConfig = {
      paragraphStyles: {},
      characterStyles: {},
      tableStyles: {},
      listStyles: {}
    };

    // 转换段落样式
    if (newConfig.paragraphStyles) {
      Object.entries(newConfig.paragraphStyles).forEach(([key, style]) => {
        if (style) {
          legacyConfig.paragraphStyles[key] = {
            name: style.name || key,
            font: style.font,
            size: style.size,
            color: style.color,
            bold: style.bold,
            italic: style.italic,
            alignment: style.alignment,
            spacing: style.spacing,
            indent: style.indent
          };
        }
      });
    }

    // 转换列表样式
    if (newConfig.listStyles) {
      Object.entries(newConfig.listStyles).forEach(([key, style]) => {
        if (style) {
          legacyConfig.listStyles[key] = {
            name: style.name || key,
            type: style.type,
            format: style.format,
            start: style.start,
            indent: style.indent?.left
          };
        }
      });
    }

    // 转换表格样式
    if (newConfig.tableStyles) {
      Object.entries(newConfig.tableStyles).forEach(([key, style]) => {
        if (style) {
          legacyConfig.tableStyles[key] = {
            name: style.name || key,
            alignment: style.alignment,
            cellMargin: style.cellMargin,
            borders: style.borders ? {
              top: style.borders.top ? {
                size: style.borders.top.size,
                color: style.borders.top.color,
                style: style.borders.top.style === 'dotted' ? 'dash' : style.borders.top.style
              } : undefined,
              bottom: style.borders.bottom ? {
                size: style.borders.bottom.size,
                color: style.borders.bottom.color,
                style: style.borders.bottom.style === 'dotted' ? 'dash' : style.borders.bottom.style
              } : undefined,
              left: style.borders.left ? {
                size: style.borders.left.size,
                color: style.borders.left.color,
                style: style.borders.left.style === 'dotted' ? 'dash' : style.borders.left.style
              } : undefined,
              right: style.borders.right ? {
                size: style.borders.right.size,
                color: style.borders.right.color,
                style: style.borders.right.style === 'dotted' ? 'dash' : style.borders.right.style
              } : undefined,
              insideH: style.borders.insideHorizontal ? {
                size: style.borders.insideHorizontal.size,
                color: style.borders.insideHorizontal.color,
                style: style.borders.insideHorizontal.style === 'dotted' ? 'dash' : style.borders.insideHorizontal.style
              } : undefined,
              insideV: style.borders.insideVertical ? {
                size: style.borders.insideVertical.size,
                color: style.borders.insideVertical.color,
                style: style.borders.insideVertical.style === 'dotted' ? 'dash' : style.borders.insideVertical.style
              } : undefined
            } : undefined
          };
        }
      });
    }

    return legacyConfig;
  }

  /**
   * 验证样式配置是否为旧版格式
   */
  static isLegacyConfig(config: any): config is LegacyStyleConfig {
    return config && 
           typeof config === 'object' &&
           (config.paragraphStyles || config.characterStyles || config.tableStyles || config.listStyles) &&
           !config.document && // 新版配置有 document 属性
           !config.headingStyles; // 新版配置有 headingStyles 属性
  }

  /**
   * 自动检测并转换样式配置
   */
  static autoConvert(config: any): StyleConfig {
    if (!config) {
      return {};
    }

    if (this.isLegacyConfig(config)) {
      return this.convertLegacyToNew(config);
    }

    return config as StyleConfig;
  }
}

/**
 * 样式配置验证器
 */
export class StyleValidator {
  /**
   * 验证颜色格式
   */
  static isValidColor(color: string): boolean {
    return /^[0-9A-Fa-f]{6}$/.test(color);
  }

  /**
   * 验证字体大小
   */
  static isValidFontSize(size: number): boolean {
    return size >= 8 && size <= 144;
  }

  /**
   * 验证样式配置
   */
  static validateStyleConfig(config: StyleConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 验证文档样式
    if (config.document) {
      if (config.document.defaultColor && !this.isValidColor(config.document.defaultColor)) {
        errors.push('文档默认颜色格式无效');
      }
      if (config.document.defaultSize && !this.isValidFontSize(config.document.defaultSize)) {
        errors.push('文档默认字号超出范围（8-144）');
      }
    }

    // 验证标题样式
    if (config.headingStyles) {
      Object.entries(config.headingStyles).forEach(([key, style]) => {
        if (style) {
          if (style.color && !this.isValidColor(style.color)) {
            errors.push(`标题${key}颜色格式无效`);
          }
          if (style.size && !this.isValidFontSize(style.size)) {
            errors.push(`标题${key}字号超出范围（8-144）`);
          }
        }
      });
    }

    // 验证段落样式
    if (config.paragraphStyles) {
      Object.entries(config.paragraphStyles).forEach(([key, style]) => {
        if (style) {
          if (style.color && !this.isValidColor(style.color)) {
            errors.push(`段落样式${key}颜色格式无效`);
          }
          if (style.size && !this.isValidFontSize(style.size)) {
            errors.push(`段落样式${key}字号超出范围（8-144）`);
          }
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}