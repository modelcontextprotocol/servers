import { TableOfContentsConfig, ParagraphStyle } from '../types/style.js';
import { Paragraph, TextRun, TableOfContents, AlignmentType } from 'docx';

/**
 * 目录生成器类
 * 负责生成和管理文档目录
 */
export class TOCGenerator {
  private headings: Array<{ level: number; text: string; pageNumber?: number }> = [];

  /**
   * 添加标题条目
   */
  addHeading(level: number, text: string, pageNumber?: number): void {
    this.headings.push({ level, text, pageNumber });
  }

  /**
   * 清空标题列表
   */
  clear(): void {
    this.headings = [];
  }

  /**
   * 创建目录段落
   */
  static createTOC(config: TableOfContentsConfig): TableOfContents {
    const {
      title = '目录',
      levels = [1, 2, 3],
      showPageNumbers = true,
      tabLeader = 'dot'
    } = config;

    // 使用docx库的TableOfContents
    return new TableOfContents(title, {
      hyperlink: true,
      headingStyleRange: `1-${Math.max(...levels)}`,
      stylesWithLevels: levels.map(level => ({
        styleName: `Heading${level}`,
        level
      }))
    });
  }

  /**
   * 创建目录标题段落
   */
  static createTOCTitle(config: TableOfContentsConfig): Paragraph {
    const {
      title = '目录',
      titleStyle
    } = config;

    return new Paragraph({
      text: title,
      heading: undefined,
      alignment: titleStyle?.alignment === 'justify' ? AlignmentType.BOTH : 
                titleStyle?.alignment === 'center' ? AlignmentType.CENTER :
                titleStyle?.alignment === 'right' ? AlignmentType.RIGHT :
                AlignmentType.LEFT,
      spacing: {
        before: titleStyle?.spacing?.before || 480,
        after: titleStyle?.spacing?.after || 240,
        line: titleStyle?.spacing?.line || 400
      },
      style: 'TOCHeading'
    });
  }

  /**
   * 验证目录配置
   */
  static validateTOCConfig(config: TableOfContentsConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (config.levels && config.levels.length === 0) {
      errors.push('目录级别不能为空');
    }

    if (config.levels && config.levels.some(level => level < 1 || level > 6)) {
      errors.push('目录级别必须在1-6之间');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 获取默认目录配置
   */
  static getDefaultConfig(): TableOfContentsConfig {
    return {
      enabled: true,
      title: '目录',
      levels: [1, 2, 3],
      showPageNumbers: true,
      pageNumberAlignment: 'right',
      tabLeader: 'dot'
    };
  }

  /**
   * 合并目录配置
   */
  static mergeConfig(base: TableOfContentsConfig, override: Partial<TableOfContentsConfig>): TableOfContentsConfig {
    return {
      ...base,
      ...override,
      levels: override.levels || base.levels,
      entryStyles: override.entryStyles || base.entryStyles
    };
  }

  /**
   * 从文档内容中提取标题
   */
  extractHeadings(content: string): Array<{ level: number; text: string }> {
    const headings: Array<{ level: number; text: string }> = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        headings.push({ level, text });
      }
    }
    
    return headings;
  }
}