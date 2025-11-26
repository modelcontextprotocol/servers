type HorizontalPositionRelativeFrom = 'margin' | 'page' | 'column' | 'leftMargin' | 'rightMargin' | 'insideMargin' | 'outsideMargin';
type HorizontalPositionAlign = 'left' | 'center' | 'right' | 'inside' | 'outside';
type VerticalPositionRelativeFrom = 'margin' | 'page' | 'topMargin' | 'bottomMargin' | 'insideMargin' | 'outsideMargin';
type VerticalPositionAlign = 'top' | 'center' | 'bottom' | 'inside' | 'outside';

/**
 * 文本样式配置接口
 */
export interface TextStyle {
  /** 字体名称 */
  font?: string;
  /** 字体大小（半点为单位，如32表示16pt） */
  size?: number;
  /** 文字颜色（十六进制，不含#） */
  color?: string;
  /** 是否加粗 */
  bold?: boolean;
  /** 是否斜体 */
  italic?: boolean;
  /** 是否下划线 */
  underline?: boolean;
  /** 是否删除线 */
  strike?: boolean;
}

/**
 * 段落样式配置接口
 */
export interface ParagraphStyle extends TextStyle {
  /** 样式名称 */
  name?: string;
  /** 对齐方式 */
  alignment?: 'left' | 'center' | 'right' | 'justify';
  /** 间距设置 */
  spacing?: {
    /** 段前间距（缇为单位） */
    before?: number;
    /** 段后间距（缇为单位） */
    after?: number;
    /** 行距（缇为单位） */
    line?: number;
    /** 行距规则 */
    lineRule?: 'auto' | 'exact' | 'atLeast';
  };
  /** 缩进设置 */
  indent?: {
    /** 左缩进（缇为单位） */
    left?: number;
    /** 右缩进（缇为单位） */
    right?: number;
    /** 首行缩进（缇为单位） */
    firstLine?: number;
    /** 悬挂缩进（缇为单位） */
    hanging?: number;
  };
  /** 边框设置 */
  border?: {
    top?: BorderStyle;
    bottom?: BorderStyle;
    left?: BorderStyle;
    right?: BorderStyle;
  };
  /** 底纹设置 */
  shading?: {
    /** 填充颜色 */
    fill?: string;
    /** 底纹类型 */
    type?: 'clear' | 'solid' | 'pct5' | 'pct10' | 'pct20' | 'pct25' | 'pct30' | 'pct40' | 'pct50' | 'pct60' | 'pct70' | 'pct75' | 'pct80' | 'pct90';
    /** 底纹颜色 */
    color?: string;
  };
}

/**
 * 标题样式配置接口
 */
export interface HeadingStyle extends ParagraphStyle {
  /** 标题级别 */
  level: 1 | 2 | 3 | 4 | 5 | 6;
  /** 是否显示编号 */
  numbering?: boolean;
  /** 编号格式 */
  numberingFormat?: string;
}

/**
 * 列表样式配置接口
 */
export interface ListStyle extends ParagraphStyle {
  /** 列表类型 */
  type: 'bullet' | 'number';
  /** 列表级别 */
  level?: number;
  /** 项目符号或编号格式 */
  format?: string;
  /** 起始编号（仅数字列表） */
  start?: number;
}

/**
 * 单元格合并配置接口
 */
export interface CellMergeConfig {
  /** 合并的行数 */
  rowSpan?: number;
  /** 合并的列数 */
  colSpan?: number;
}

/**
 * 表格单元格配置接口
 */
export interface TableCellConfig {
  /** 单元格内容 */
  content: string | any[];
  /** 单元格合并配置 */
  merge?: CellMergeConfig;
  /** 单元格样式 */
  style?: {
    /** 背景色 */
    shading?: string;
    /** 文字样式 */
    textStyle?: TextStyle;
    /** 对齐方式 */
    alignment?: {
      horizontal?: 'left' | 'center' | 'right';
      vertical?: 'top' | 'center' | 'bottom';
    };
    /** 边框 */
    borders?: {
      top?: BorderStyle;
      bottom?: BorderStyle;
      left?: BorderStyle;
      right?: BorderStyle;
    };
  };
  /** 是否为嵌套表格 */
  nestedTable?: TableData;
}

/**
 * 表格数据接口
 */
export interface TableData {
  /** 表格行数据 */
  rows: TableCellConfig[][];
  /** 表格样式 */
  style?: string | TableStyle;
}

/**
 * 表格样式配置接口
 */
export interface TableStyle {
  /** 样式名称 */
  name?: string;
  /** 样式描述 */
  description?: string;
  /** 表格宽度 */
  width?: {
    /** 宽度值 */
    size: number;
    /** 宽度类型 */
    type: 'auto' | 'pct' | 'dxa';
  };
  /** 列宽配置 */
  columnWidths?: number[];
  /** 表格边框 */
  borders?: {
    top?: BorderStyle;
    bottom?: BorderStyle;
    left?: BorderStyle;
    right?: BorderStyle;
    insideHorizontal?: BorderStyle;
    insideVertical?: BorderStyle;
  };
  /** 单元格边距 */
  cellMargin?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  /** 表格对齐 */
  alignment?: 'left' | 'center' | 'right';
  /** 表头样式 */
  headerStyle?: {
    /** 表头背景色 */
    shading?: string;
    /** 表头文字样式 */
    textStyle?: TextStyle;
    /** 表头对齐方式 */
    alignment?: 'left' | 'center' | 'right';
  };
  /** 单元格对齐方式 */
  cellAlignment?: {
    /** 水平对齐 */
    horizontal?: 'left' | 'center' | 'right';
    /** 垂直对齐 */
    vertical?: 'top' | 'center' | 'bottom';
  };
  /** 斑马纹样式 */
  stripedRows?: {
    /** 是否启用 */
    enabled?: boolean;
    /** 奇数行背景色 */
    oddRowShading?: string;
    /** 偶数行背景色 */
    evenRowShading?: string;
  };
}

/**
 * 边框样式接口
 */
export interface BorderStyle {
  /** 边框宽度（八分之一点为单位） */
  size: number;
  /** 边框颜色（十六进制，不含#） */
  color: string;
  /** 边框样式 */
  style: 'single' | 'double' | 'dash' | 'dotted' | 'none';
}

/**
 * 代码块样式配置接口
 */
export interface CodeBlockStyle extends ParagraphStyle {
  /** 代码字体（通常为等宽字体） */
  codeFont?: string;
  /** 背景颜色 */
  backgroundColor?: string;
  /** 是否显示行号 */
  showLineNumbers?: boolean;
}

/**
 * 引用块样式配置接口
 */
export interface BlockquoteStyle extends ParagraphStyle {
  /** 引用标记样式 */
  quoteMarkStyle?: {
    /** 标记字符 */
    character?: string;
    /** 标记颜色 */
    color?: string;
    /** 标记大小 */
    size?: number;
  };
}

/**
 * 图片样式配置接口
 */
export interface ImageStyle {
    /** 图片宽度（缇为单位） */
    width?: number;
    /** 图片高度（缇为单位） */
    height?: number;
    /** 最大宽度（缇为单位，用于自适应缩放） */
    maxWidth?: number;
    /** 最大高度（缇为单位，用于自适应缩放） */
    maxHeight?: number;
    /** 是否保持宽高比 */
    maintainAspectRatio?: boolean;
    /** 对齐方式 */
    alignment?: 'left' | 'center' | 'right';
    /** 间距设置 */
    spacing?: {
        before?: number;
        after?: number;
    };
    /** 边框设置 */
    border?: {
        color?: string;
        width?: number;
        style?: 'single' | 'double' | 'dash' | 'dotted' | 'none';
    };
    /** 浮动设置 */
    floating?: {
        zIndex?: number;
        horizontalPosition?: {
            relative?: HorizontalPositionRelativeFrom;
            align?: HorizontalPositionAlign;
            offset?: number;
        };
        verticalPosition?: {
            relative?: VerticalPositionRelativeFrom;
            align?: VerticalPositionAlign;
            offset?: number;
        };
    };
    /** 图片质量（0-100） */
    quality?: number;
    /** 支持的图片格式 */
    supportedFormats?: ('jpg' | 'png' | 'gif' | 'bmp' | 'svg' | 'webp')[];
}

/**
 * 水印配置接口
 */
export interface WatermarkConfig {
  /** 水印文本 */
  text: string;
  /** 水印字体 */
  font?: string;
  /** 水印字号 */
  size?: number;
  /** 水印颜色 */
  color?: string;
  /** 水印透明度（0-1） */
  opacity?: number;
  /** 水印旋转角度（度） */
  rotation?: number;
  /** 水印位置 */
  position?: 'diagonal' | 'horizontal' | 'vertical';
}

/**
 * 页眉页脚配置接口
 */
export interface HeaderFooterConfig {
  /** 页眉配置 */
  header?: {
    /** 页眉内容 */
    content?: string;
    /** 页眉对齐方式 */
    alignment?: 'left' | 'center' | 'right' | 'both';
    /** 页眉文字样式 */
    textStyle?: TextStyle;
    /** 页眉边框 */
    border?: {
      bottom?: BorderStyle;
    };
  };
  /** 页脚配置 */
  footer?: {
    /** 页脚内容 */
    content?: string;
    /** 页脚对齐方式 */
    alignment?: 'left' | 'center' | 'right' | 'both';
    /** 页脚文字样式 */
    textStyle?: TextStyle;
    /** 页脚边框 */
    border?: {
      top?: BorderStyle;
    };
    /** 是否显示页码 */
    showPageNumber?: boolean;
    /** 页码格式（前缀文本） */
    pageNumberFormat?: string;
    /** 是否显示总页数 */
    showTotalPages?: boolean;
    /** 总页数格式（连接文本，如 " of "） */
    totalPagesFormat?: string;
  };
  /** 首页页眉（当differentFirstPage为true时使用） */
  firstPageHeader?: {
    content?: string;
    alignment?: 'left' | 'center' | 'right' | 'both';
    textStyle?: TextStyle;
    border?: {
      bottom?: BorderStyle;
    };
  };
  /** 首页页脚（当differentFirstPage为true时使用） */
  firstPageFooter?: {
    content?: string;
    alignment?: 'left' | 'center' | 'right' | 'both';
    textStyle?: TextStyle;
    border?: {
      top?: BorderStyle;
    };
    showPageNumber?: boolean;
    pageNumberFormat?: string;
    showTotalPages?: boolean;
    totalPagesFormat?: string;
  };
  /** 偶数页页眉（当differentOddEven为true时使用） */
  evenPageHeader?: {
    content?: string;
    alignment?: 'left' | 'center' | 'right' | 'both';
    textStyle?: TextStyle;
    border?: {
      bottom?: BorderStyle;
    };
  };
  /** 偶数页页脚（当differentOddEven为true时使用） */
  evenPageFooter?: {
    content?: string;
    alignment?: 'left' | 'center' | 'right' | 'both';
    textStyle?: TextStyle;
    border?: {
      top?: BorderStyle;
    };
    showPageNumber?: boolean;
    pageNumberFormat?: string;
    showTotalPages?: boolean;
    totalPagesFormat?: string;
  };
  /** 首页不同 */
  differentFirstPage?: boolean;
  /** 奇偶页不同 */
  differentOddEven?: boolean;
  /** 页码起始编号 */
  pageNumberStart?: number;
  /** 页码格式类型 */
  pageNumberFormatType?: 'decimal' | 'upperRoman' | 'lowerRoman' | 'upperLetter' | 'lowerLetter';
}

/**
 * 目录配置接口
 */
export interface TableOfContentsConfig {
  /** 是否启用目录 */
  enabled?: boolean;
  /** 目录标题 */
  title?: string;
  /** 目录标题样式 */
  titleStyle?: ParagraphStyle;
  /** 包含的标题级别 */
  levels?: number[];
  /** 目录项样式 */
  entryStyles?: {
    [level: number]: ParagraphStyle;
  };
  /** 是否显示页码 */
  showPageNumbers?: boolean;
  /** 页码对齐方式 */
  pageNumberAlignment?: 'left' | 'right';
  /** 引导符 */
  tabLeader?: 'dot' | 'hyphen' | 'underscore' | 'none';
}

/**
 * 主题配置接口
 */
export interface ThemeConfig {
  /** 主题名称 */
  name: string;
  /** 主题描述 */
  description?: string;
  /** 主题颜色变量 */
  colors?: {
    /** 主色调 */
    primary?: string;
    /** 次要色 */
    secondary?: string;
    /** 强调色 */
    accent?: string;
    /** 文字颜色 */
    text?: string;
    /** 背景色 */
    background?: string;
    /** 边框颜色 */
    border?: string;
    /** 自定义颜色 */
    [key: string]: string | undefined;
  };
  /** 主题字体变量 */
  fonts?: {
    /** 标题字体 */
    heading?: string;
    /** 正文字体 */
    body?: string;
    /** 代码字体 */
    code?: string;
    /** 自定义字体 */
    [key: string]: string | undefined;
  };
  /** 主题间距变量 */
  spacing?: {
    /** 小间距 */
    small?: number;
    /** 中等间距 */
    medium?: number;
    /** 大间距 */
    large?: number;
    /** 自定义间距 */
    [key: string]: number | undefined;
  };
}

/**
 * 完整的样式配置接口
 */
export interface StyleConfig {
  /** 文档默认样式 */
  document?: {
    /** 默认字体 */
    defaultFont?: string;
    /** 默认字号 */
    defaultSize?: number;
    /** 默认颜色 */
    defaultColor?: string;
    /** 页面设置 */
    page?: {
      /** 页面大小 */
      size?: 'A4' | 'A3' | 'Letter' | 'Legal';
      /** 页面方向 */
      orientation?: 'portrait' | 'landscape';
      /** 页边距 */
      margins?: {
        top?: number;
        bottom?: number;
        left?: number;
        right?: number;
      };
    };
  };
  
  /** 主题配置 */
  theme?: ThemeConfig;
  
  /** 水印配置 */
  watermark?: WatermarkConfig;
  
  /** 页眉页脚配置 */
  headerFooter?: HeaderFooterConfig;
  
  /** 目录配置 */
  tableOfContents?: TableOfContentsConfig;
  
  /** 段落样式映射 */
  paragraphStyles?: {
    /** 普通段落样式 */
    normal?: ParagraphStyle;
    /** 自定义段落样式 */
    [key: string]: ParagraphStyle | undefined;
  };
  
  /** 标题样式映射 */
  headingStyles?: {
    h1?: HeadingStyle;
    h2?: HeadingStyle;
    h3?: HeadingStyle;
    h4?: HeadingStyle;
    h5?: HeadingStyle;
    h6?: HeadingStyle;
  };
  
  /** 列表样式映射 */
  listStyles?: {
    /** 无序列表样式 */
    bullet?: ListStyle;
    /** 有序列表样式 */
    ordered?: ListStyle;
    /** 自定义列表样式 */
    [key: string]: ListStyle | undefined;
  };
  
  /** 表格样式映射 */
  tableStyles?: {
    /** 默认表格样式 */
    default?: TableStyle;
    /** 自定义表格样式 */
    [key: string]: TableStyle | undefined;
  };
  
  /** 代码块样式 */
  codeBlockStyle?: CodeBlockStyle;
  
  /** 引用块样式 */
  blockquoteStyle?: BlockquoteStyle;
  
  /** 行内代码样式 */
  inlineCodeStyle?: TextStyle;
  
  /** 强调文本样式 */
  emphasisStyles?: {
    /** 加粗样式 */
    strong?: TextStyle;
    /** 斜体样式 */
    emphasis?: TextStyle;
    /** 删除线样式 */
    strikethrough?: TextStyle;
  };
  
  /** 图片样式配置 */
  imageStyles?: {
    /** 默认图片样式 */
    default?: ImageStyle;
    /** 自定义图片样式 */
    [key: string]: ImageStyle | undefined;
  };
}

/**
 * 样式合并选项
 */
export interface StyleMergeOptions {
  /** 是否深度合并 */
  deep?: boolean;
  /** 是否覆盖已存在的属性 */
  override?: boolean;
}

/**
 * 样式验证结果
 */
export interface StyleValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误信息 */
  errors?: string[];
  /** 警告信息 */
  warnings?: string[];
  /** 修复建议 */
  suggestions?: string[];
}

/**
 * 错误详情接口
 */
export interface ErrorDetail {
  /** 错误代码 */
  code: string;
  /** 错误消息 */
  message: string;
  /** 错误位置 */
  location?: {
    file?: string;
    line?: number;
    column?: number;
  };
  /** 错误级别 */
  severity: 'error' | 'warning' | 'info';
  /** 修复建议 */
  suggestion?: string;
}

/**
 * 样式应用上下文
 */
export interface StyleContext {
    /** 当前元素类型 */
    elementType: 'paragraph' | 'heading' | 'list' | 'table' | 'code' | 'blockquote' | 'inline' | 'image';
    /** 当前层级（用于标题、列表等） */
    level?: number;
    /** 父级样式 */
    parentStyle?: ParagraphStyle;
    /** 是否在列表中 */
    inList?: boolean;
    /** 是否在表格中 */
    inTable?: boolean;
}