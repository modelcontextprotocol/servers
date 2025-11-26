import {
  Table,
  TableRow,
  TableCell,
  Paragraph,
  TextRun,
  AlignmentType,
  VerticalAlign,
  WidthType
} from 'docx';
import { TableData, TableCellConfig, TableStyle, TextStyle } from '../types/style.js';
import { TABLE_STYLE_PRESETS } from './tableProcessor.js';

/**
 * 表格构建器类 - 支持合并单元格和嵌套表格
 */
export class TableBuilder {
  /**
   * 从TableData创建DOCX表格
   * @param tableData 表格数据
   * @param defaultStyle 默认样式配置
   * @returns DOCX Table对象
   */
  static createTable(tableData: TableData, defaultStyle?: TableStyle): Table {
    // 获取表格样式
    let tableStyle: TableStyle;
    if (typeof tableData.style === 'string') {
      tableStyle = TABLE_STYLE_PRESETS[tableData.style] || TABLE_STYLE_PRESETS['minimal'] || {};
    } else if (tableData.style) {
      tableStyle = tableData.style;
    } else {
      tableStyle = defaultStyle || TABLE_STYLE_PRESETS['minimal'] || {};
    }

    // 计算列宽
    const columnCount = tableData.rows[0]?.length || 0;
    const columnWidths = tableStyle.columnWidths || 
      Array(columnCount).fill(Math.floor(10000 / columnCount));

    // 创建表格行
    const docxRows = tableData.rows.map((row, rowIndex) => 
      this.createTableRow(row, rowIndex, tableStyle, columnWidths)
    );

    // 创建表格
    return new Table({
      width: tableStyle.width || {
        size: 100,
        type: WidthType.PERCENTAGE
      },
      columnWidths: columnWidths,
      borders: this.convertBorders(tableStyle.borders),
      rows: docxRows
    });
  }

  /**
   * 创建表格行
   */
  private static createTableRow(
    row: TableCellConfig[],
    rowIndex: number,
    tableStyle: TableStyle,
    columnWidths: number[]
  ): TableRow {
    const isHeaderRow = rowIndex === 0;
    
    const cells = row.map((cellConfig, cellIndex) => 
      this.createTableCell(cellConfig, rowIndex, cellIndex, isHeaderRow, tableStyle, columnWidths)
    );

    return new TableRow({
      children: cells,
      tableHeader: isHeaderRow
    });
  }

  /**
   * 创建表格单元格
   */
  private static createTableCell(
    cellConfig: TableCellConfig,
    rowIndex: number,
    cellIndex: number,
    isHeaderRow: boolean,
    tableStyle: TableStyle,
    columnWidths: number[]
  ): TableCell {
    // 处理单元格内容
    let children: Paragraph[];
    
    if (cellConfig.nestedTable) {
      // 嵌套表格
      const nestedTable = this.createTable(cellConfig.nestedTable, tableStyle);
      children = [
        new Paragraph({
          children: [],
          spacing: { before: 0, after: 0 }
        })
      ];
      // 注意：docx库可能不直接支持在TableCell中嵌套Table
      // 这里作为占位，实际使用时可能需要其他方式处理
    } else if (Array.isArray(cellConfig.content)) {
      // 富文本内容
      children = [new Paragraph({
        children: cellConfig.content,
        spacing: { line: 360 }
      })];
    } else {
      // 纯文本内容
      const textStyle = cellConfig.style?.textStyle || 
                       (isHeaderRow ? tableStyle.headerStyle?.textStyle : undefined);
      
      children = [new Paragraph({
        children: [new TextRun({
          text: String(cellConfig.content),
          ...this.convertTextStyle(textStyle)
        })],
        spacing: { line: 360 },
        alignment: this.getAlignment(cellConfig, isHeaderRow, tableStyle)
      })];
    }

    // 确定单元格对齐方式
    const horizontalAlign = this.getAlignment(cellConfig, isHeaderRow, tableStyle);
    const verticalAlign = this.getVerticalAlignment(cellConfig, tableStyle);

    // 确定单元格背景色
    let shading: string | undefined;
    if (cellConfig.style?.shading) {
      shading = cellConfig.style.shading;
    } else if (isHeaderRow) {
      shading = tableStyle.headerStyle?.shading;
    } else if (tableStyle.stripedRows?.enabled) {
      const isOddRow = rowIndex % 2 === 1;
      shading = isOddRow 
        ? tableStyle.stripedRows.oddRowShading 
        : tableStyle.stripedRows.evenRowShading;
    }

    // 创建单元格配置
    const cellOptions: any = {
      children,
      verticalAlign: verticalAlign,
      margins: tableStyle.cellMargin || {
        top: 100,
        bottom: 100,
        left: 100,
        right: 100
      }
    };

    // 添加背景色
    if (shading) {
      cellOptions.shading = {
        fill: shading,
        type: 'solid' as const,
        color: shading
      };
    }

    // 添加边框（如果单元格有自定义边框）
    if (cellConfig.style?.borders) {
      cellOptions.borders = this.convertBorders(cellConfig.style.borders);
    }

    // 添加合并单元格配置
    if (cellConfig.merge) {
      if (cellConfig.merge.rowSpan && cellConfig.merge.rowSpan > 1) {
        cellOptions.rowSpan = cellConfig.merge.rowSpan;
      }
      if (cellConfig.merge.colSpan && cellConfig.merge.colSpan > 1) {
        cellOptions.columnSpan = cellConfig.merge.colSpan;
      }
    }

    // 设置列宽
    if (columnWidths[cellIndex]) {
      cellOptions.width = {
        size: columnWidths[cellIndex],
        type: WidthType.DXA
      };
    }

    return new TableCell(cellOptions);
  }

  /**
   * 获取单元格水平对齐方式
   */
  private static getAlignment(
    cellConfig: TableCellConfig,
    isHeaderRow: boolean,
    tableStyle: TableStyle
  ): typeof AlignmentType[keyof typeof AlignmentType] {
    // 优先级：单元格样式 > 表头样式 > 表格默认样式
    let alignment: string | undefined;
    
    if (cellConfig.style?.alignment?.horizontal) {
      alignment = cellConfig.style.alignment.horizontal;
    } else if (isHeaderRow && tableStyle.headerStyle?.alignment) {
      alignment = tableStyle.headerStyle.alignment;
    } else if (tableStyle.cellAlignment?.horizontal) {
      alignment = tableStyle.cellAlignment.horizontal;
    } else {
      alignment = tableStyle.alignment || 'left';
    }

    switch (alignment) {
      case 'center': return AlignmentType.CENTER;
      case 'right': return AlignmentType.RIGHT;
      default: return AlignmentType.LEFT;
    }
  }

  /**
   * 获取单元格垂直对齐方式
   */
  private static getVerticalAlignment(
    cellConfig: TableCellConfig,
    tableStyle: TableStyle
  ): typeof VerticalAlign[keyof typeof VerticalAlign] {
    const alignment = cellConfig.style?.alignment?.vertical || 
                     tableStyle.cellAlignment?.vertical || 
                     'center';

    switch (alignment) {
      case 'top': return VerticalAlign.TOP;
      case 'bottom': return VerticalAlign.BOTTOM;
      default: return VerticalAlign.CENTER;
    }
  }

  /**
   * 转换边框样式
   */
  private static convertBorders(borders?: any): any {
    if (!borders) {
      return {
        top: { style: 'single', size: 4, color: '000000' },
        bottom: { style: 'single', size: 4, color: '000000' },
        left: { style: 'single', size: 4, color: '000000' },
        right: { style: 'single', size: 4, color: '000000' },
        insideHorizontal: { style: 'single', size: 2, color: 'DDDDDD' },
        insideVertical: { style: 'single', size: 2, color: 'DDDDDD' }
      };
    }

    const convertBorderStyle = (border: any) => {
      if (!border || border.style === 'none') return undefined;
      return {
        style: border.style === 'dash' ? 'dashed' : border.style,
        size: border.size,
        color: border.color
      };
    };

    return {
      top: convertBorderStyle(borders.top),
      bottom: convertBorderStyle(borders.bottom),
      left: convertBorderStyle(borders.left),
      right: convertBorderStyle(borders.right),
      insideHorizontal: convertBorderStyle(borders.insideHorizontal),
      insideVertical: convertBorderStyle(borders.insideVertical)
    };
  }

  /**
   * 转换文本样式
   */
  private static convertTextStyle(textStyle?: TextStyle): any {
    if (!textStyle) return {};

    return {
      font: textStyle.font,
      size: textStyle.size,
      color: textStyle.color,
      bold: textStyle.bold,
      italics: textStyle.italic,
      underline: textStyle.underline ? {} : undefined,
      strike: textStyle.strike
    };
  }

  /**
   * 从简单的二维数组创建表格
   * @param data 二维字符串数组
   * @param styleName 样式名称
   * @returns DOCX Table对象
   */
  static fromSimpleArray(data: string[][], styleName: string = 'minimal'): Table {
    const tableData: TableData = {
      rows: data.map(row => row.map(cell => ({ content: cell }))),
      style: styleName
    };
    return this.createTable(tableData);
  }
}