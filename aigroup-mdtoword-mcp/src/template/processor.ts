import { StyleConfig, TemplateProcessor, ParagraphStyle, CharacterStyle, TableStyle, BorderStyle } from '../types/template.js';

// 使用any类型绕过类型检查问题
declare type Buffer = any;

// 使用动态导入来处理docx库
let docx: any;
let Document: any;
let Paragraph: any;
let Table: any;
let TableRow: any;
let TableCell: any;

// 异步初始化docx库
async function initDocx() {
  if (!docx) {
    docx = await import('docx');
    Document = docx.Document;
    Paragraph = docx.Paragraph;
    Table = docx.Table;
    TableRow = docx.TableRow;
    TableCell = docx.TableCell;
  }
}

export class DocxTemplateProcessor implements TemplateProcessor {
  async extractStyles(template: Buffer): Promise<StyleConfig> {
    try {
      // 初始化docx库
      await initDocx();
      const styles: StyleConfig = {
        paragraphStyles: {},
        headingStyles: {},
        tableStyles: {},
        listStyles: {},
        emphasisStyles: {}
      };

      // TODO: 实现从docx文件中提取样式
      // 这里需要使用docx库解析模板文件并提取样式信息
      // 目前返回预定义的样式配置

      // 添加正文样式（三号字=16磅）
      if (styles.paragraphStyles) {
        styles.paragraphStyles['normal'] = {
          name: 'Normal',
          font: '宋体',
          size: 32, // 16磅 = 32半磅
          color: '000000',
        };
      }

      // 添加标题样式
      if (styles.headingStyles) {
        // 添加大标题样式（二号字=32磅）
        styles.headingStyles['h1'] = {
          name: 'Heading 1',
          level: 1,
          font: '黑体',
          size: 64, // 32磅 = 64半磅
          color: '000000',
          bold: true,
          spacing: {
            before: 240, // 12pt
            after: 120, // 6pt
          }
        };

        // 添加一级标题样式（三号字=16磅）
        styles.headingStyles['h2'] = {
          name: 'Heading 2',
          level: 2,
          font: '黑体',
          size: 32, // 16磅 = 32半磅
          color: '000000',
          bold: true,
          spacing: {
            before: 240,
            after: 120,
          }
        };
      }

      // 添加强调样式
      if (styles.emphasisStyles) {
        // 粗体样式
        styles.emphasisStyles['strong'] = {
          font: '宋体',
          size: 32,
          color: '000000',
          bold: true
        };

        // 斜体样式
        styles.emphasisStyles['emphasis'] = {
          font: '宋体',
          size: 32,
          color: '000000',
          italic: true
        };
      }

      // 行内代码样式
      styles.inlineCodeStyle = {
        font: 'Courier New',
        size: 32,
        color: '000000'
      };

      // 添加默认表格样式
      if (styles.tableStyles) {
        styles.tableStyles['default'] = {
          name: 'Default Table',
          borders: {
            top: { size: 1, color: '000000', style: 'single' },
            bottom: { size: 1, color: '000000', style: 'single' },
            left: { size: 1, color: '000000', style: 'single' },
            right: { size: 1, color: '000000', style: 'single' },
            insideHorizontal: { size: 1, color: '000000', style: 'single' },
            insideVertical: { size: 1, color: '000000', style: 'single' },
          },
          cellMargin: {
            top: 120, // 6pt
            bottom: 120,
            left: 120,
            right: 120,
          }
        };
      }

      // 添加默认列表样式
      if (styles.listStyles) {
        styles.listStyles['bullet'] = {
          name: 'Default Bullet',
          type: 'bullet',
          indent: {
            left: 720, // 0.5 inch
          }
        };

        styles.listStyles['ordered'] = {
          name: 'Default Number',
          type: 'number',
          format: '%1.',
          indent: {
            left: 720,
          },
          start: 1,
        };
      }

      return styles;
    } catch (error) {
      console.error('Error extracting styles from template:', error);
      throw new Error('Failed to extract styles from template');
    }
  }
}