import { TableStyle, TableData, TableCellConfig } from '../types/style.js';
import { parse } from 'csv-parse/sync';

/**
 * 预定义的表格样式库
 */
export const TABLE_STYLE_PRESETS: Record<string, TableStyle> = {
  /**
   * 1. 简约现代风格
   */
  minimal: {
    name: 'minimal',
    description: '简约现代风格 - 细线边框，清爽布局',
    width: { size: 100, type: 'pct' },
    borders: {
      top: { style: 'single', size: 1, color: 'CCCCCC' },
      bottom: { style: 'single', size: 1, color: 'CCCCCC' },
      left: { style: 'none', size: 0, color: '000000' },
      right: { style: 'none', size: 0, color: '000000' },
      insideHorizontal: { style: 'single', size: 1, color: 'EEEEEE' },
      insideVertical: { style: 'none', size: 0, color: '000000' }
    },
    headerStyle: {
      shading: 'F8F9FA',
      alignment: 'left'
    },
    cellAlignment: {
      horizontal: 'left',
      vertical: 'center'
    },
    cellMargin: { top: 100, bottom: 100, left: 150, right: 150 }
  },

  /**
   * 2. 专业商务风格
   */
  professional: {
    name: 'professional',
    description: '专业商务风格 - 深色表头，正式布局',
    width: { size: 100, type: 'pct' },
    borders: {
      top: { style: 'single', size: 6, color: '2C3E50' },
      bottom: { style: 'single', size: 6, color: '2C3E50' },
      left: { style: 'single', size: 2, color: 'BDC3C7' },
      right: { style: 'single', size: 2, color: 'BDC3C7' },
      insideHorizontal: { style: 'single', size: 2, color: 'ECF0F1' },
      insideVertical: { style: 'single', size: 2, color: 'ECF0F1' }
    },
    headerStyle: {
      shading: '34495E',
      alignment: 'center'
    },
    cellAlignment: {
      horizontal: 'center',
      vertical: 'center'
    },
    cellMargin: { top: 120, bottom: 120, left: 120, right: 120 }
  },

  /**
   * 3. 斑马纹风格
   */
  striped: {
    name: 'striped',
    description: '斑马纹风格 - 交替行颜色，易读性强',
    width: { size: 100, type: 'pct' },
    borders: {
      top: { style: 'single', size: 4, color: '000000' },
      bottom: { style: 'single', size: 4, color: '000000' },
      left: { style: 'none', size: 0, color: '000000' },
      right: { style: 'none', size: 0, color: '000000' },
      insideHorizontal: { style: 'none', size: 0, color: '000000' },
      insideVertical: { style: 'none', size: 0, color: '000000' }
    },
    headerStyle: {
      shading: '3498DB',
      alignment: 'center'
    },
    cellAlignment: {
      horizontal: 'left',
      vertical: 'center'
    },
    stripedRows: {
      enabled: true,
      oddRowShading: 'FFFFFF',
      evenRowShading: 'F2F2F2'
    },
    cellMargin: { top: 100, bottom: 100, left: 150, right: 150 }
  },

  /**
   * 4. 网格风格
   */
  grid: {
    name: 'grid',
    description: '网格风格 - 完整网格边框，结构清晰',
    width: { size: 100, type: 'pct' },
    borders: {
      top: { style: 'single', size: 4, color: '000000' },
      bottom: { style: 'single', size: 4, color: '000000' },
      left: { style: 'single', size: 4, color: '000000' },
      right: { style: 'single', size: 4, color: '000000' },
      insideHorizontal: { style: 'single', size: 2, color: '666666' },
      insideVertical: { style: 'single', size: 2, color: '666666' }
    },
    headerStyle: {
      shading: 'DDDDDD',
      alignment: 'center'
    },
    cellAlignment: {
      horizontal: 'center',
      vertical: 'center'
    },
    cellMargin: { top: 100, bottom: 100, left: 100, right: 100 }
  },

  /**
   * 5. 优雅风格
   */
  elegant: {
    name: 'elegant',
    description: '优雅风格 - 双线边框，典雅大方',
    width: { size: 100, type: 'pct' },
    borders: {
      top: { style: 'double', size: 6, color: '2C3E50' },
      bottom: { style: 'double', size: 6, color: '2C3E50' },
      left: { style: 'none', size: 0, color: '000000' },
      right: { style: 'none', size: 0, color: '000000' },
      insideHorizontal: { style: 'single', size: 1, color: 'BDC3C7' },
      insideVertical: { style: 'none', size: 0, color: '000000' }
    },
    headerStyle: {
      shading: 'ECF0F1',
      alignment: 'left'
    },
    cellAlignment: {
      horizontal: 'left',
      vertical: 'center'
    },
    cellMargin: { top: 120, bottom: 120, left: 150, right: 150 }
  },

  /**
   * 6. 彩色风格
   */
  colorful: {
    name: 'colorful',
    description: '彩色风格 - 彩色表头，活力四射',
    width: { size: 100, type: 'pct' },
    borders: {
      top: { style: 'single', size: 4, color: 'E74C3C' },
      bottom: { style: 'single', size: 4, color: 'E74C3C' },
      left: { style: 'single', size: 2, color: 'F39C12' },
      right: { style: 'single', size: 2, color: 'F39C12' },
      insideHorizontal: { style: 'single', size: 2, color: 'F39C12' },
      insideVertical: { style: 'single', size: 2, color: 'F39C12' }
    },
    headerStyle: {
      shading: 'E74C3C',
      alignment: 'center'
    },
    cellAlignment: {
      horizontal: 'center',
      vertical: 'center'
    },
    cellMargin: { top: 100, bottom: 100, left: 120, right: 120 }
  },

  /**
   * 7. 紧凑风格
   */
  compact: {
    name: 'compact',
    description: '紧凑风格 - 小边距，信息密集',
    width: { size: 100, type: 'pct' },
    borders: {
      top: { style: 'single', size: 2, color: '000000' },
      bottom: { style: 'single', size: 2, color: '000000' },
      left: { style: 'single', size: 1, color: 'CCCCCC' },
      right: { style: 'single', size: 1, color: 'CCCCCC' },
      insideHorizontal: { style: 'single', size: 1, color: 'CCCCCC' },
      insideVertical: { style: 'single', size: 1, color: 'CCCCCC' }
    },
    headerStyle: {
      shading: 'F0F0F0',
      alignment: 'center'
    },
    cellAlignment: {
      horizontal: 'left',
      vertical: 'center'
    },
    cellMargin: { top: 60, bottom: 60, left: 80, right: 80 }
  },

  /**
   * 8. 清新风格
   */
  fresh: {
    name: 'fresh',
    description: '清新风格 - 淡绿色调，清爽宜人',
    width: { size: 100, type: 'pct' },
    borders: {
      top: { style: 'single', size: 4, color: '27AE60' },
      bottom: { style: 'single', size: 4, color: '27AE60' },
      left: { style: 'none', size: 0, color: '000000' },
      right: { style: 'none', size: 0, color: '000000' },
      insideHorizontal: { style: 'single', size: 2, color: 'D5F4E6' },
      insideVertical: { style: 'none', size: 0, color: '000000' }
    },
    headerStyle: {
      shading: '27AE60',
      alignment: 'center'
    },
    cellAlignment: {
      horizontal: 'left',
      vertical: 'center'
    },
    stripedRows: {
      enabled: true,
      oddRowShading: 'FFFFFF',
      evenRowShading: 'E8F8F5'
    },
    cellMargin: { top: 100, bottom: 100, left: 150, right: 150 }
  },

  /**
   * 9. 科技风格
   */
  tech: {
    name: 'tech',
    description: '科技风格 - 蓝色主题，现代科技感',
    width: { size: 100, type: 'pct' },
    borders: {
      top: { style: 'single', size: 6, color: '2980B9' },
      bottom: { style: 'single', size: 6, color: '2980B9' },
      left: { style: 'single', size: 2, color: '3498DB' },
      right: { style: 'single', size: 2, color: '3498DB' },
      insideHorizontal: { style: 'single', size: 1, color: 'AED6F1' },
      insideVertical: { style: 'single', size: 1, color: 'AED6F1' }
    },
    headerStyle: {
      shading: '2980B9',
      alignment: 'center'
    },
    cellAlignment: {
      horizontal: 'center',
      vertical: 'center'
    },
    cellMargin: { top: 100, bottom: 100, left: 120, right: 120 }
  },

  /**
   * 10. 报告风格
   */
  report: {
    name: 'report',
    description: '报告风格 - 正式报告样式，专业严谨',
    width: { size: 100, type: 'pct' },
    borders: {
      top: { style: 'double', size: 8, color: '000000' },
      bottom: { style: 'double', size: 8, color: '000000' },
      left: { style: 'single', size: 2, color: '000000' },
      right: { style: 'single', size: 2, color: '000000' },
      insideHorizontal: { style: 'single', size: 2, color: '666666' },
      insideVertical: { style: 'single', size: 2, color: '666666' }
    },
    headerStyle: {
      shading: 'D0D0D0',
      alignment: 'center'
    },
    cellAlignment: {
      horizontal: 'left',
      vertical: 'center'
    },
    cellMargin: { top: 120, bottom: 120, left: 150, right: 150 }
  },

  /**
   * 11. 财务风格
   */
  financial: {
    name: 'financial',
    description: '财务风格 - 适合财务报表，数字对齐',
    width: { size: 100, type: 'pct' },
    borders: {
      top: { style: 'double', size: 6, color: '000000' },
      bottom: { style: 'double', size: 6, color: '000000' },
      left: { style: 'none', size: 0, color: '000000' },
      right: { style: 'none', size: 0, color: '000000' },
      insideHorizontal: { style: 'single', size: 1, color: 'CCCCCC' },
      insideVertical: { style: 'single', size: 1, color: 'E0E0E0' }
    },
    headerStyle: {
      shading: 'F5F5F5',
      alignment: 'right'
    },
    cellAlignment: {
      horizontal: 'right',
      vertical: 'center'
    },
    cellMargin: { top: 100, bottom: 100, left: 150, right: 150 }
  },

  /**
   * 12. 学术风格
   */
  academic: {
    name: 'academic',
    description: '学术风格 - 适合学术论文，严谨规范',
    width: { size: 100, type: 'pct' },
    borders: {
      top: { style: 'single', size: 8, color: '000000' },
      bottom: { style: 'single', size: 8, color: '000000' },
      left: { style: 'none', size: 0, color: '000000' },
      right: { style: 'none', size: 0, color: '000000' },
      insideHorizontal: { style: 'single', size: 4, color: '000000' },
      insideVertical: { style: 'none', size: 0, color: '000000' }
    },
    headerStyle: {
      shading: 'FFFFFF',
      alignment: 'center'
    },
    cellAlignment: {
      horizontal: 'center',
      vertical: 'center'
    },
    cellMargin: { top: 120, bottom: 120, left: 150, right: 150 }
  }
};

/**
 * 表格处理器类
 */
export class TableProcessor {
  /**
   * 从CSV数据创建表格
   * @param csvData CSV字符串数据
   * @param options 解析选项
   * @returns 表格数据
   */
  static fromCSV(csvData: string, options?: {
    hasHeader?: boolean;
    delimiter?: string;
    styleName?: string;
  }): TableData {
    const { hasHeader = true, delimiter = ',', styleName = 'default' } = options || {};
    
    // 解析CSV
    const records = parse(csvData, {
      delimiter,
      skip_empty_lines: true,
      trim: true
    });

    if (!records || records.length === 0) {
      throw new Error('CSV数据为空');
    }

    // 转换为表格数据
    const rows: TableCellConfig[][] = records.map((row: string[]) => 
      row.map(cell => ({
        content: cell
      }))
    );

    return {
      rows,
      style: styleName
    };
  }

  /**
   * 从JSON数据创建表格
   * @param jsonData JSON字符串或对象数组
   * @param options 转换选项
   * @returns 表格数据
   */
  static fromJSON(jsonData: string | any[], options?: {
    columns?: string[];
    styleName?: string;
  }): TableData {
    const { columns, styleName = 'default' } = options || {};
    
    // 解析JSON
    const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('JSON数据必须是非空数组');
    }

    // 确定列
    const cols = columns || Object.keys(data[0]);
    
    // 创建表头
    const headerRow: TableCellConfig[] = cols.map(col => ({
      content: col
    }));

    // 创建数据行
    const dataRows: TableCellConfig[][] = data.map(item => 
      cols.map(col => ({
        content: String(item[col] ?? '')
      }))
    );

    return {
      rows: [headerRow, ...dataRows],
      style: styleName
    };
  }

  /**
   * 创建带合并单元格的表格
   * @param rows 行数据，包含合并配置
   * @param styleName 样式名称
   * @returns 表格数据
   */
  static createWithMerge(rows: TableCellConfig[][], styleName?: string): TableData {
    return {
      rows,
      style: styleName || 'default'
    };
  }

  /**
   * 获取预定义样式
   * @param styleName 样式名称
   * @returns 表格样式或undefined
   */
  static getPresetStyle(styleName: string): TableStyle | undefined {
    return TABLE_STYLE_PRESETS[styleName];
  }

  /**
   * 获取所有预定义样式名称
   * @returns 样式名称数组
   */
  static getPresetStyleNames(): string[] {
    return Object.keys(TABLE_STYLE_PRESETS);
  }

  /**
   * 列出所有预定义样式
   * @returns 样式信息数组
   */
  static listPresetStyles(): Array<{ name: string; description: string }> {
    return Object.values(TABLE_STYLE_PRESETS).map(style => ({
      name: style.name!,
      description: style.description || ''
    }));
  }

  /**
   * 验证表格数据
   * @param tableData 表格数据
   * @returns 验证结果
   */
  static validate(tableData: TableData): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!tableData.rows || tableData.rows.length === 0) {
      errors.push('表格必须至少包含一行');
    }

    // 检查行列数一致性
    if (tableData.rows.length > 0) {
      const columnCount = tableData.rows[0].length;
      for (let i = 1; i < tableData.rows.length; i++) {
        if (tableData.rows[i].length !== columnCount) {
          errors.push(`第${i + 1}行的列数(${tableData.rows[i].length})与第1行(${columnCount})不一致`);
        }
      }
    }

    // 检查合并单元格配置
    for (let rowIndex = 0; rowIndex < tableData.rows.length; rowIndex++) {
      const row = tableData.rows[rowIndex];
      for (let colIndex = 0; colIndex < row.length; colIndex++) {
        const cell = row[colIndex];
        if (cell.merge) {
          const { rowSpan = 1, colSpan = 1 } = cell.merge;
          if (rowSpan < 1 || colSpan < 1) {
            errors.push(`单元格[${rowIndex},${colIndex}]的合并配置无效：rowSpan和colSpan必须至少为1`);
          }
          if (rowIndex + rowSpan > tableData.rows.length) {
            errors.push(`单元格[${rowIndex},${colIndex}]的rowSpan(${rowSpan})超出表格范围`);
          }
          if (colIndex + colSpan > row.length) {
            errors.push(`单元格[${rowIndex},${colIndex}]的colSpan(${colSpan})超出表格范围`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}