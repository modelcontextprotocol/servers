import { WatermarkConfig } from '../types/style.js';
import { Paragraph, TextRun, VerticalPositionAlign, HorizontalPositionAlign } from 'docx';

/**
 * 水印处理器类
 * 负责创建和配置文档水印
 */
export class WatermarkProcessor {
  /**
   * 创建水印配置
   */
  static createWatermark(config: WatermarkConfig): any {
    const {
      text,
      font = '宋体',
      size = 100,
      color = 'CCCCCC',
      opacity = 0.3,
      rotation = -45,
      position = 'diagonal'
    } = config;

    // docx库的水印配置
    return {
      text: text,
      font: font,
      size: size,
      color: color,
      opacity: Math.max(0, Math.min(1, opacity)), // 确保在0-1之间
      angle: rotation
    };
  }

  /**
   * 验证水印配置
   */
  static validateWatermarkConfig(config: WatermarkConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.text || config.text.trim() === '') {
      errors.push('水印文本不能为空');
    }

    if (config.size && (config.size < 10 || config.size > 500)) {
      errors.push('水印字号应在10-500之间');
    }

    if (config.color && !/^[0-9A-Fa-f]{6}$/.test(config.color)) {
      errors.push('水印颜色格式无效，应为6位十六进制');
    }

    if (config.opacity !== undefined && (config.opacity < 0 || config.opacity > 1)) {
      errors.push('水印透明度应在0-1之间');
    }

    if (config.rotation !== undefined && (config.rotation < -360 || config.rotation > 360)) {
      errors.push('水印旋转角度应在-360到360度之间');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 获取默认水印配置
   */
  static getDefaultConfig(): WatermarkConfig {
    return {
      text: '机密文档',
      font: '宋体',
      size: 100,
      color: 'CCCCCC',
      opacity: 0.3,
      rotation: -45,
      position: 'diagonal'
    };
  }

  /**
   * 合并水印配置
   */
  static mergeConfig(base: WatermarkConfig, override: Partial<WatermarkConfig>): WatermarkConfig {
    return {
      ...base,
      ...override
    };
  }
}