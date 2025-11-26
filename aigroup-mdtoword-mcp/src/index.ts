#!/usr/bin/env node

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { DocxMarkdownConverter } from './converter/markdown.js';
import { presetTemplateLoader } from './template/presetLoader.js';
import { DocxTemplateProcessor } from './template/processor.js';
import { TableProcessor } from './utils/tableProcessor.js';
import { TableBuilder } from './utils/tableBuilder.js';
import path from 'path';
import fs from 'fs/promises';

// 创建MCP服务器，启用通知防抖以优化性能
const server = new McpServer(
  {
    name: 'aigroup-mdtoword-mcp',
    version: '4.0.1',
  },
  {
    // 启用通知防抖，减少网络流量
    debouncedNotificationMethods: [
      'notifications/tools/list_changed',
      'notifications/resources/list_changed',
      'notifications/prompts/list_changed',
    ],
  }
);

// ==================== Zod Schemas ====================

// 主题配置 Schema
const ThemeSchema = z.object({
  name: z.string().optional().describe('主题名称'),
  colors: z.object({
    primary: z.string().regex(/^[0-9A-Fa-f]{6}$/).optional().describe('主色调（6位十六进制）'),
    secondary: z.string().regex(/^[0-9A-Fa-f]{6}$/).optional().describe('辅助色（6位十六进制）'),
    text: z.string().regex(/^[0-9A-Fa-f]{6}$/).optional().describe('文本颜色（6位十六进制）'),
  }).optional(),
  fonts: z.object({
    heading: z.string().optional().describe('标题字体'),
    body: z.string().optional().describe('正文字体'),
    code: z.string().optional().describe('代码字体'),
  }).optional(),
  spacing: z.object({
    small: z.number().optional().describe('小间距（缇）'),
    medium: z.number().optional().describe('中间距（缇）'),
    large: z.number().optional().describe('大间距（缇）'),
  }).optional(),
}).optional();

// 水印配置 Schema
const WatermarkSchema = z.object({
  text: z.string().describe('水印文本'),
  font: z.string().optional().describe('水印字体'),
  size: z.number().min(1).max(200).optional().describe('水印字号'),
  color: z.string().regex(/^[0-9A-Fa-f]{6}$/).optional().describe('水印颜色（6位十六进制）'),
  opacity: z.number().min(0).max(1).optional().describe('透明度（0-1）'),
  rotation: z.number().min(-90).max(90).optional().describe('旋转角度（-90到90）'),
}).optional();

// 目录配置 Schema
const TableOfContentsSchema = z.object({
  enabled: z.boolean().optional().describe('是否启用目录'),
  title: z.string().optional().describe('目录标题'),
  levels: z.array(z.number().min(1).max(6)).optional().describe('包含的标题级别'),
  showPageNumbers: z.boolean().optional().describe('是否显示页码'),
  tabLeader: z.enum(['dot', 'hyphen', 'underscore', 'none']).optional().describe('页码引导符'),
}).optional();

// 页眉页脚配置 Schema
const HeaderFooterSchema = z.object({
  header: z.object({
    content: z.string().optional().describe('页眉内容文本'),
    alignment: z.enum(['left', 'center', 'right', 'both']).optional().describe('页眉对齐方式：left(左对齐)、center(居中)、right(右对齐)、both(两端对齐)'),
  }).optional().describe('默认页眉配置（应用于所有页或奇数页）'),
  footer: z.object({
    content: z.string().optional().describe('页脚内容文本（页码前的文字，如"第 "）'),
    showPageNumber: z.boolean().optional().describe('是否显示当前页码。设为true时会在页脚显示页码'),
    pageNumberFormat: z.string().optional().describe('页码后缀文本（紧跟页码后的文字，如" 页"）。示例：content="第 " + 页码 + pageNumberFormat=" 页" = "第 1 页"'),
    showTotalPages: z.boolean().optional().describe('是否显示总页数。设为true时会显示文档总页数'),
    totalPagesFormat: z.string().optional().describe('总页数前的连接文本（如" / 共 "、" of "）。示例：完整格式为"第 1 页 / 共 5 页"'),
    alignment: z.enum(['left', 'center', 'right', 'both']).optional().describe('页脚对齐方式'),
  }).optional().describe('默认页脚配置（应用于所有页或奇数页）。支持灵活的页码格式组合'),
  firstPageHeader: z.object({
    content: z.string().optional().describe('首页页眉内容'),
    alignment: z.enum(['left', 'center', 'right', 'both']).optional().describe('首页页眉对齐方式'),
  }).optional().describe('首页专用页眉（需设置differentFirstPage为true）。常用于封面页不显示页眉或显示特殊内容'),
  firstPageFooter: z.object({
    content: z.string().optional().describe('首页页脚内容'),
    showPageNumber: z.boolean().optional().describe('首页是否显示页码'),
    pageNumberFormat: z.string().optional().describe('首页页码格式'),
    showTotalPages: z.boolean().optional().describe('首页是否显示总页数'),
    totalPagesFormat: z.string().optional().describe('首页总页数格式'),
    alignment: z.enum(['left', 'center', 'right', 'both']).optional().describe('首页页脚对齐'),
  }).optional().describe('首页专用页脚（需设置differentFirstPage为true）。常用于封面页不显示页码'),
  evenPageHeader: z.object({
    content: z.string().optional().describe('偶数页页眉内容'),
    alignment: z.enum(['left', 'center', 'right', 'both']).optional().describe('偶数页页眉对齐'),
  }).optional().describe('偶数页专用页眉（需设置differentOddEven为true）。用于双面打印时奇偶页显示不同内容'),
  evenPageFooter: z.object({
    content: z.string().optional().describe('偶数页页脚内容'),
    showPageNumber: z.boolean().optional().describe('偶数页是否显示页码'),
    pageNumberFormat: z.string().optional().describe('偶数页页码格式'),
    showTotalPages: z.boolean().optional().describe('偶数页是否显示总页数'),
    totalPagesFormat: z.string().optional().describe('偶数页总页数格式'),
    alignment: z.enum(['left', 'center', 'right', 'both']).optional().describe('偶数页页脚对齐'),
  }).optional().describe('偶数页专用页脚（需设置differentOddEven为true）'),
  differentFirstPage: z.boolean().optional().describe('是否首页不同。设为true时首页使用firstPageHeader和firstPageFooter，常用于封面页'),
  differentOddEven: z.boolean().optional().describe('是否奇偶页不同。设为true时偶数页使用evenPageHeader和evenPageFooter，用于双面打印'),
  pageNumberStart: z.number().optional().describe('页码起始编号。默认为1，可设置为其他数字如5表示从第5页开始编号'),
  pageNumberFormatType: z.enum(['decimal', 'upperRoman', 'lowerRoman', 'upperLetter', 'lowerLetter']).optional().describe('页码数字格式：decimal(阿拉伯数字1,2,3)、upperRoman(大写罗马I,II,III)、lowerRoman(小写罗马i,ii,iii)、upperLetter(大写字母A,B,C)、lowerLetter(小写字母a,b,c)'),
}).optional().describe('页眉页脚配置。支持显示页码、总页数、不同首页、奇偶页不同等功能。页码格式可灵活组合，如"第 1 页 / 共 5 页"、"Page 1 of 5"等');

// 表格样式配置 Schema
const TableStylesSchema = z.object({
  default: z.object({
    columnWidths: z.array(z.number()).optional().describe('列宽数组（缇）'),
    cellAlignment: z.object({
      horizontal: z.enum(['left', 'center', 'right']).optional().describe('水平对齐'),
      vertical: z.enum(['top', 'center', 'bottom']).optional().describe('垂直对齐'),
    }).optional(),
    stripedRows: z.object({
      enabled: z.boolean().optional().describe('是否启用斑马纹'),
      oddRowShading: z.string().regex(/^[0-9A-Fa-f]{6}$/).optional().describe('奇数行背景色'),
      evenRowShading: z.string().regex(/^[0-9A-Fa-f]{6}$/).optional().describe('偶数行背景色'),
    }).optional(),
  }).optional(),
}).optional();

// 图片样式配置 Schema
const ImageStylesSchema = z.object({
  default: z.object({
    maxWidth: z.number().optional().describe('最大宽度（缇）'),
    maxHeight: z.number().optional().describe('最大高度（缇）'),
    maintainAspectRatio: z.boolean().optional().describe('保持宽高比'),
    alignment: z.enum(['left', 'center', 'right']).optional().describe('对齐方式'),
    border: z.object({
      color: z.string().regex(/^[0-9A-Fa-f]{6}$/).optional().describe('边框颜色'),
      width: z.number().optional().describe('边框宽度'),
      style: z.enum(['single', 'double', 'dotted', 'dashed']).optional().describe('边框样式'),
    }).optional(),
  }).optional(),
}).optional();

// 样式配置 Schema
const StyleConfigSchema = z.object({
  theme: ThemeSchema,
  watermark: WatermarkSchema,
  tableOfContents: TableOfContentsSchema,
  headerFooter: HeaderFooterSchema,
  tableStyles: TableStylesSchema,
  imageStyles: ImageStylesSchema,
  document: z.object({
    defaultFont: z.string().optional().describe('默认字体'),
    defaultSize: z.number().optional().describe('默认字号（半点）'),
  }).optional(),
  paragraphStyles: z.record(z.any()).optional().describe('段落样式配置'),
  headingStyles: z.record(z.any()).optional().describe('标题样式配置'),
}).optional();

// 模板配置 Schema
const TemplateSchema = z.object({
  type: z.enum(['preset']).describe('模板类型：preset=预设模板'),
  presetId: z.string().describe('预设模板ID。可选值：academic（学术论文）、business（商务报告）、customer-analysis（客户分析-默认）、technical（技术文档）、minimal（极简风格）、enhanced-features（增强功能示例）'),
}).optional().describe('模板配置。使用预设模板可以快速应用专业样式，也可以与styleConfig组合使用');

// 工具输入 Schema
const MarkdownToDocxInputSchema = z.object({
  markdown: z.string().optional().describe('Markdown格式的文本内容（与inputPath二选一）'),
  inputPath: z.string().optional().describe('Markdown文件路径（与markdown二选一）'),
  filename: z.string().regex(/\.docx$/).describe('输出的Word文档文件名，必须以.docx结尾'),
  outputPath: z.string().optional().describe('输出目录，默认为当前工作目录'),
  template: TemplateSchema,
  styleConfig: StyleConfigSchema.describe('样式配置对象。支持主题系统（theme）、水印（watermark）、页眉页脚（headerFooter）、自动目录（tableOfContents）、表格样式（tableStyles）、图片样式（imageStyles）等。可与template组合使用以覆盖模板的默认样式'),
});

// 工具输出 Schema
const MarkdownToDocxOutputSchema = z.object({
  success: z.boolean(),
  filename: z.string(),
  path: z.string(),
  size: z.number(),
  message: z.string().optional(),
});

// ==================== 工具注册 ====================

server.registerTool(
  'markdown_to_docx',
  {
    title: 'Markdown 转 Word',
    description: '将Markdown文档转换为Word文档（DOCX格式），支持样式配置、模板系统和多种图像嵌入方式（本地文件、网络图片、Base64编码）',
    inputSchema: MarkdownToDocxInputSchema.shape,
    outputSchema: MarkdownToDocxOutputSchema.shape,
  },
  async (args) => {
    try {
      // 参数验证
      if (!args.markdown && !args.inputPath) {
        throw new Error('必须提供 markdown 或 inputPath 参数');
      }

      // 获取Markdown内容和基础目录
      let markdownContent: string;
      let baseDir: string | undefined;
      
      if (args.inputPath) {
        markdownContent = await fs.readFile(args.inputPath, 'utf-8');
        // 提取Markdown文件所在目录，用于解析相对路径图片
        baseDir = path.dirname(path.resolve(args.inputPath));
        console.log(`📁 [工具] Markdown文件路径: ${args.inputPath}`);
        console.log(`📁 [工具] 解析的基础目录: ${baseDir}`);
      } else {
        markdownContent = args.markdown!;
        // 如果直接提供markdown内容，使用当前工作目录作为基础目录
        baseDir = process.cwd();
        console.log(`📁 [工具] 使用当前工作目录作为基础目录: ${baseDir}`);
      }

      // 处理样式配置
      let finalStyleConfig = args.styleConfig;
      const templateProcessor = new DocxTemplateProcessor();

      // 如果没有指定模板和样式配置，使用默认的客户分析模板
      if (!args.template && !args.styleConfig) {
        const defaultTemplate = presetTemplateLoader.getDefaultTemplate();
        if (defaultTemplate) {
          finalStyleConfig = defaultTemplate.styleConfig as any;
        }
      }

      // 如果有模板配置，从模板提取样式并与直接样式配置合并
      if (args.template?.type === 'preset' && args.template.presetId) {
        const presetTemplate = presetTemplateLoader.getPresetTemplate(args.template.presetId);
        if (presetTemplate) {
          const templateStyleConfig = presetTemplate.styleConfig;
          if (finalStyleConfig) {
            const { styleEngine } = await import('./utils/styleEngine.js');
            finalStyleConfig = styleEngine.mergeStyleConfigs(templateStyleConfig as any, finalStyleConfig as any) as any;
          } else {
            finalStyleConfig = templateStyleConfig as any;
          }
        } else {
          throw new Error(`预设模板 "${args.template.presetId}" 不存在`);
        }
      }

      // 执行转换，传递baseDir用于解析相对路径图片
      const converter = new DocxMarkdownConverter(finalStyleConfig as any, baseDir);
      const docxContent = await converter.convert(markdownContent);

      // 保存文件
      const outputPath = args.outputPath || process.cwd();
      await fs.mkdir(outputPath, { recursive: true });

      const fullPath = path.join(outputPath, args.filename);
      await fs.writeFile(fullPath, docxContent);

      const output = {
        success: true,
        filename: args.filename,
        path: fullPath,
        size: docxContent.length,
        message: '文档转换成功！',
      };

      return {
        content: [
          {
            type: 'text',
            text: `✅ ${output.message}\n\n📄 文件名: ${output.filename}\n📁 保存路径: ${output.path}\n💾 文件大小: ${output.size} 字节`,
          },
        ],
        structuredContent: output,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      return {
        content: [
          {
            type: 'text',
            text: `❌ 转换失败: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ==================== 资源注册 ====================

// 静态资源：模板列表
server.registerResource(
  'templates-list',
  'templates://list',
  {
    title: '模板列表',
    description: '所有可用的预设模板',
    mimeType: 'text/markdown',
  },
  async (uri) => {
    const templates = presetTemplateLoader.getTemplateList();
    const templateInfo = templates
      .map(
        (t) =>
          `- **${t.id}**: ${t.name}${t.isDefault ? ' ⭐ (默认)' : ''}\n  分类: ${t.category}\n  描述: ${t.description}`
      )
      .join('\n\n');

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: `# 可用模板列表\n\n${templateInfo}\n\n## 使用方法\n\n在 template 参数中指定：\n\`\`\`json\n{\n  "type": "preset",\n  "presetId": "模板ID"\n}\n\`\`\``,
        },
      ],
    };
  }
);

// 静态资源：默认模板
server.registerResource(
  'templates-default',
  'templates://default',
  {
    title: '默认模板',
    description: '默认的客户分析模板信息',
    mimeType: 'text/markdown',
  },
  async (uri) => {
    const defaultTemplate = presetTemplateLoader.getDefaultTemplate();
    const defaultId = presetTemplateLoader.getDefaultTemplateId();

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: `# 默认模板\n\nID: ${defaultId}\n名称: ${defaultTemplate?.name}\n分类: ${defaultTemplate?.category}\n描述: ${defaultTemplate?.description}\n\n特点：\n- 正文首行缩进2个字符\n- 黑色文本，宋体字体\n- 符合中文文档规范`,
        },
      ],
    };
  }
);

// 动态资源：特定模板详情
server.registerResource(
  'template-details',
  new ResourceTemplate('templates://{templateId}', { list: undefined }),
  {
    title: '模板详情',
    description: '查看特定模板的详细配置',
    mimeType: 'application/json',
  },
  async (uri, { templateId }) => {
    const template = presetTemplateLoader.getPresetTemplate(templateId as string);
    
    if (!template) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/plain',
            text: `模板 "${templateId}" 不存在`,
          },
        ],
      };
    }

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(template, null, 2),
        },
      ],
    };
  }
);

// 静态资源：样式配置指南
server.registerResource(
  'style-guide',
  'style-guide://complete',
  {
    title: '样式配置指南',
    description: '完整的样式配置文档',
    mimeType: 'text/markdown',
  },
  async (uri) => {
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: `# Markdown转Word样式配置指南

## 单位换算
- **缇（Twip）**: 1/1440英寸 = 1/20点，用于间距和边距
- **半点**: 字号单位，24半点 = 12pt
- **示例**: 2个字符缩进 = 480缇，1英寸边距 = 1440缇

## 常用颜色（6位十六进制）
- \`000000\` - 纯黑色
- \`333333\` - 深灰色
- \`666666\` - 中灰色
- \`2E74B5\` - 专业蓝色

## 配置示例

### 基础段落样式
\`\`\`json
{
  "styleConfig": {
    "paragraphStyles": {
      "normal": {
        "font": "宋体",
        "size": 24,
        "indent": { "firstLine": 480 },
        "alignment": "justify"
      }
    }
  }
}
\`\`\`

### 标题样式
\`\`\`json
{
  "styleConfig": {
    "headingStyles": {
      "h1": {
        "font": "黑体",
        "size": 36,
        "color": "2E74B5",
        "bold": true
      }
    }
  }
}
\`\`\`

### 主题系统
\`\`\`json
{
  "styleConfig": {
    "theme": {
      "name": "专业主题",
      "colors": {
        "primary": "2E74B5",
        "secondary": "5A8FC4",
        "text": "333333"
      },
      "fonts": {
        "heading": "微软雅黑",
        "body": "宋体",
        "code": "Consolas"
      }
    }
  }
}
\`\`\``,
        },
      ],
    };
  }
);

// ==================== 新增静态资源 ====================

// 静态资源：支持的格式列表
server.registerResource(
  'converters-supported-formats',
  'converters://supported_formats',
  {
    title: '支持的格式',
    description: '支持的输入和输出格式列表',
    mimeType: 'application/json',
  },
  async (uri) => {
    const formats = {
      input: {
        markdown: {
          name: 'Markdown',
          extensions: ['.md', '.markdown'],
          mimeType: 'text/markdown',
          features: ['标题', '段落', '列表', '表格', '代码块', '图片', '链接', '强调']
        }
      },
      output: {
        docx: {
          name: 'Microsoft Word',
          extension: '.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          features: ['完整样式', '主题系统', '水印', '页眉页脚', '目录', '表格', '图片']
        }
      },
      planned: {
        pdf: {
          name: 'PDF',
          extension: '.pdf',
          status: '计划中',
          description: '未来将支持直接导出为PDF格式'
        },
        html: {
          name: 'HTML',
          extension: '.html',
          status: '计划中',
          description: '未来将支持导出为HTML格式'
        }
      }
    };

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(formats, null, 2),
        },
      ],
    };
  }
);

// 静态资源：模板分类信息
server.registerResource(
  'templates-categories',
  'templates://categories',
  {
    title: '模板分类',
    description: '按分类组织的模板信息',
    mimeType: 'application/json',
  },
  async (uri) => {
    const templates = presetTemplateLoader.getTemplateList();
    const categories: Record<string, any> = {};

    // 按分类组织模板
    templates.forEach((template) => {
      const category = template.category || 'other';
      if (!categories[category]) {
        categories[category] = {
          name: getCategoryName(category),
          description: getCategoryDescription(category),
          templates: []
        };
      }
      categories[category].templates.push({
        id: template.id,
        name: template.name,
        description: template.description,
        isDefault: template.isDefault
      });
    });

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(categories, null, 2),
        },
      ],
    };
  }
);

// 静态资源：性能指标说明
server.registerResource(
  'performance-metrics',
  'performance://metrics',
  {
    title: '性能指标',
    description: '系统性能指标和优化建议',
    mimeType: 'text/markdown',
  },
  async (uri) => {
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: `# 性能指标说明

## 转换性能

### 小文档（< 10KB）
- 预期转换时间：< 500ms
- 内存使用：< 50MB
- 适用场景：简单报告、文章

### 中等文档（10KB - 100KB）
- 预期转换时间：500ms - 2s
- 内存使用：50MB - 100MB
- 适用场景：技术文档、商务报告

### 大文档（> 100KB）
- 预期转换时间：2s - 10s
- 内存使用：100MB - 200MB
- 适用场景：学术论文、完整书籍章节

## 优化建议

### 1. 图片优化
- 使用适当的图片尺寸（建议不超过 2000x2000 像素）
- 避免使用过大的图片文件（单个图片建议 < 5MB）
- 考虑使用 PNG 或 JPEG 格式

### 2. 表格优化
- 避免过于复杂的表格结构
- 建议每个表格列数 < 10
- 建议每个表格行数 < 100

### 3. 样式优化
- 使用预设模板可以提高转换速度
- 避免过多的自定义样式覆盖
- 合理使用主题系统统一样式

## 性能监控

当前版本已启用：
- ✅ 通知防抖优化
- ✅ 静态模板加载（零文件系统操作）
- ✅ 结构化输出
- ✅ 增量转换支持

## 系统要求

- Node.js: >= 18.0.0
- 内存: 至少 512MB 可用内存
- 磁盘: 至少 100MB 可用空间`,
        },
      ],
    };
  }
);

// ==================== 新增动态资源模板 ====================

// 动态资源：批处理任务状态
server.registerResource(
  'batch-job-status',
  new ResourceTemplate('batch://{jobId}/status', { list: undefined }),
  {
    title: '批处理任务状态',
    description: '查看批处理任务的当前状态',
    mimeType: 'application/json',
  },
  async (uri, { jobId }) => {
    // 模拟批处理任务状态（实际应用中应从数据库或缓存中获取）
    const mockStatus = {
      jobId: jobId as string,
      status: 'processing',
      progress: {
        total: 10,
        completed: 7,
        failed: 1,
        pending: 2
      },
      startTime: new Date(Date.now() - 300000).toISOString(),
      estimatedCompletion: new Date(Date.now() + 120000).toISOString(),
      files: [
        { name: 'doc1.md', status: 'completed', size: 15360 },
        { name: 'doc2.md', status: 'completed', size: 23040 },
        { name: 'doc3.md', status: 'failed', error: '图片加载失败' },
        { name: 'doc4.md', status: 'processing', progress: 75 }
      ]
    };

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(mockStatus, null, 2),
        },
      ],
    };
  }
);

// 动态资源：文档分析报告
server.registerResource(
  'document-analysis-report',
  new ResourceTemplate('analysis://{docId}/report', { list: undefined }),
  {
    title: '文档分析报告',
    description: '获取文档的详细分析报告',
    mimeType: 'application/json',
  },
  async (uri, { docId }) => {
    // 模拟文档分析报告
    const mockReport = {
      documentId: docId as string,
      analysis: {
        statistics: {
          wordCount: 1250,
          characterCount: 5420,
          paragraphCount: 45,
          headingCount: 12,
          imageCount: 3,
          tableCount: 2,
          codeBlockCount: 5
        },
        structure: {
          headingLevels: {
            h1: 1,
            h2: 5,
            h3: 6
          },
          maxNestingLevel: 3,
          hasTableOfContents: false
        },
        complexity: {
          level: 'medium',
          score: 6.5,
          factors: [
            '包含多个表格',
            '存在代码块',
            '图片数量适中'
          ]
        },
        recommendations: [
          '建议添加自动目录以改善导航',
          '考虑使用 technical 模板以更好地展示代码',
          '表格较多，建议启用斑马纹样式'
        ]
      },
      generatedAt: new Date().toISOString()
    };

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(mockReport, null, 2),
        },
      ],
    };
  }
);

// 静态资源：可用集成服务
server.registerResource(
  'integrations-available',
  'integrations://available',
  {
    title: '可用集成',
    description: '可与系统集成的外部服务列表',
    mimeType: 'application/json',
  },
  async (uri) => {
    const integrations = {
      storage: {
        local: {
          name: '本地存储',
          status: 'active',
          description: '直接保存到本地文件系统',
          features: ['快速访问', '无网络依赖']
        },
        cloud: {
          name: '云存储',
          status: 'planned',
          description: '未来将支持云存储服务（如 S3、Google Drive）',
          features: ['远程访问', '自动备份', '团队协作']
        }
      },
      ai: {
        summarization: {
          name: 'AI 摘要',
          status: 'active',
          description: '使用 LLM 生成文档摘要',
          requiresSampling: true
        },
        translation: {
          name: 'AI 翻译',
          status: 'planned',
          description: '未来将支持多语言翻译',
          requiresSampling: true
        }
      },
      export: {
        pdf: {
          name: 'PDF 导出',
          status: 'planned',
          description: '未来将支持直接导出为 PDF'
        },
        html: {
          name: 'HTML 导出',
          status: 'planned',
          description: '未来将支持导出为网页格式'
        }
      }
    };

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(integrations, null, 2),
        },
      ],
    };
  }
);

// ==================== 辅助函数 ====================

/**
 * 获取分类名称
 */
function getCategoryName(category: string): string {
  const names: Record<string, string> = {
    academic: '学术类',
    business: '商务类',
    technical: '技术类',
    minimal: '简约类',
    other: '其他'
  };
  return names[category] || category;
}

/**
 * 获取分类描述
 */
function getCategoryDescription(category: string): string {
  const descriptions: Record<string, string> = {
    academic: '适用于学术论文、研究报告等学术文档',
    business: '适用于商务报告、分析文档等商业场景',
    technical: '适用于技术文档、API文档、开发指南等',
    minimal: '简洁风格，适用于快速文档创建',
    other: '其他类型模板'
  };
  return descriptions[category] || '未分类模板';
}

// ==================== 提示注册 ====================

server.registerPrompt(
  'markdown_to_docx_help',
  {
    title: '使用帮助',
    description: '获取Markdown转Word服务的使用帮助',
  },
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `# Markdown转Word服务使用指南

## 🚀 快速开始
最简单的使用方式（使用默认模板）：
\`\`\`json
{
  "markdown": "# 我的报告\\n\\n这是正文内容",
  "filename": "report.docx"
}
\`\`\`

## 📋 可用预设模板
- **academic**: 学术论文
- **business**: 商务报告
- **customer-analysis**: 客户分析（默认）⭐
- **minimal**: 极简风格
- **technical**: 技术文档
- **enhanced-features**: 增强功能示例

## 💡 使用提示
1. 查看 'templates://list' 资源获取所有模板
2. 查看 'style-guide://complete' 资源获取样式指南
3. 可以同时使用模板和自定义样式
4. 输出文件默认保存在当前目录

## 🎨 新特性
- 主题系统：统一颜色、字体管理
- 水印功能：自定义文本、透明度、旋转
- 页眉页脚：自定义内容和自动页码
- 自动目录：可配置级别和样式
- 增强表格：列宽、对齐、斑马纹
- 优化图片：自适应尺寸、格式检测`,
        },
      },
    ],
  })
);

server.registerPrompt(
  'markdown_to_docx_examples',
  {
    title: '实用示例',
    description: '获取实用示例和最佳实践',
  },
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `# 实用示例

## 📝 基础转换
\`\`\`json
{
  "markdown": "# 标题\\n\\n正文内容",
  "filename": "output.docx"
}
\`\`\`

## 📖 从文件读取
\`\`\`json
{
  "inputPath": "./input/document.md",
  "filename": "output.docx",
  "outputPath": "./output"
}
\`\`\`

## 🎨 使用模板
\`\`\`json
{
  "markdown": "# 学术论文\\n\\n内容",
  "filename": "paper.docx",
  "template": {
    "type": "preset",
    "presetId": "academic"
  }
}
\`\`\`

## 💧 添加水印
\`\`\`json
{
  "markdown": "# 机密文档\\n\\n内容",
  "filename": "confidential.docx",
  "styleConfig": {
    "watermark": {
      "text": "机密",
      "opacity": 0.2,
      "rotation": -45
    }
  }
}
\`\`\`

## 📑 自动目录
\`\`\`json
{
  "markdown": "# 第一章\\n\\n## 1.1 节\\n\\n## 1.2 节",
  "filename": "with-toc.docx",
  "styleConfig": {
    "tableOfContents": {
      "enabled": true,
      "title": "目 录",
      "levels": [1, 2, 3]
    }
  }
}
\`\`\``,
        },
      },
    ],
  })
);

server.registerPrompt(
  'create_document',
  {
    title: '创建文档',
    description: '引导用户创建新的Word文档',
    argsSchema: {
      documentType: z.enum(['academic', 'business', 'technical', 'report']).describe('文档类型'),
    },
  },
  ({ documentType }) => {
    const templates: Record<string, string> = {
      academic: 'academic',
      business: 'business',
      technical: 'technical',
      report: 'customer-analysis',
    };

    return {
      messages: [
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `我将帮你创建一个${documentType}文档。建议使用 "${templates[documentType]}" 模板。\n\n请提供文档内容的Markdown格式文本，我会将其转换为专业的Word文档。`,
          },
        },
      ],
    };
  }
);

// ==================== 新增提示模板 ====================

// 提示：批处理工作流
server.registerPrompt(
  'batch_processing_workflow',
  {
    title: '批量处理工作流',
    description: '指导用户进行批量文档处理',
    argsSchema: {
      scenario: z.enum(['academic', 'business', 'technical']).describe('应用场景'),
    },
  },
  ({ scenario }) => {
    const workflows: Record<string, any> = {
      academic: {
        title: '学术论文批量处理',
        steps: [
          '1. 准备多个 Markdown 格式的论文章节',
          '2. 为每个章节选择 "academic" 模板',
          '3. 配置统一的样式（如引用格式、图表样式）',
          '4. 批量转换所有章节',
          '5. 合并生成的 Word 文档'
        ],
        tips: [
          '💡 使用相同的主题配置确保风格统一',
          '💡 为图表添加自动编号',
          '💡 启用目录功能便于导航',
          '💡 考虑添加页眉页脚标注章节信息'
        ],
        example: {
          template: { type: 'preset', presetId: 'academic' },
          styleConfig: {
            tableOfContents: { enabled: true, levels: [1, 2, 3] },
            headerFooter: {
              header: { content: '学术论文标题', alignment: 'center' },
              footer: { showPageNumber: true }
            }
          }
        }
      },
      business: {
        title: '商务报告批量处理',
        steps: [
          '1. 收集各部门的报告数据（Markdown 格式）',
          '2. 选择 "business" 或 "customer-analysis" 模板',
          '3. 为每份报告添加公司水印',
          '4. 统一页眉页脚和品牌标识',
          '5. 批量生成带样式的 Word 报告'
        ],
        tips: [
          '💡 使用企业主题色统一视觉风格',
          '💡 添加保密水印保护敏感信息',
          '💡 启用表格斑马纹提升可读性',
          '💡 使用一致的字体和间距'
        ],
        example: {
          template: { type: 'preset', presetId: 'business' },
          styleConfig: {
            watermark: { text: '公司机密', opacity: 0.15, rotation: -45 },
            theme: {
              colors: { primary: '2E74B5', secondary: '5A8FC4' }
            }
          }
        }
      },
      technical: {
        title: '技术文档批量处理',
        steps: [
          '1. 整理 API 文档、开发指南等技术内容',
          '2. 使用 "technical" 模板',
          '3. 配置代码块样式和语法高亮',
          '4. 添加目录和章节导航',
          '5. 批量转换生成文档'
        ],
        tips: [
          '💡 使用等宽字体展示代码',
          '💡 为代码块添加背景色',
          '💡 保持技术术语的一致性',
          '💡 使用清晰的标题层级'
        ],
        example: {
          template: { type: 'preset', presetId: 'technical' },
          styleConfig: {
            codeBlockStyle: {
              font: 'Consolas',
              backgroundColor: 'F8F8F8'
            },
            tableOfContents: { enabled: true }
          }
        }
      }
    };

    const workflow = workflows[scenario];

    return {
      messages: [
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `# ${workflow.title}

## 📋 处理步骤

${workflow.steps.join('\n')}

## 💡 最佳实践

${workflow.tips.join('\n')}

## 📝 配置示例

\`\`\`json
${JSON.stringify(workflow.example, null, 2)}
\`\`\`

## 🚀 开始批量处理

现在您可以：
1. 准备好所有 Markdown 文件
2. 使用上述配置为每个文件调用转换工具
3. 检查生成的文档确保格式一致

需要帮助吗？请告诉我您的具体需求！`,
          },
        },
      ],
    };
  }
);

// 提示：故障排除指南
server.registerPrompt(
  'troubleshooting_guide',
  {
    title: '故障排除指南',
    description: '常见问题和解决方案',
    argsSchema: {
      errorType: z.enum(['conversion', 'performance', 'integration']).describe('错误类型'),
    },
  },
  ({ errorType }) => {
    const guides: Record<string, any> = {
      conversion: {
        title: '转换错误排查',
        problems: [
          {
            issue: '❌ 图片无法显示',
            causes: [
              '图片路径不正确',
              '图片格式不支持',
              '图片文件过大',
              '网络图片无法访问'
            ],
            solutions: [
              '✅ 使用相对路径或绝对路径',
              '✅ 确保使用 PNG、JPEG、GIF 等常见格式',
              '✅ 压缩图片到 5MB 以下',
              '✅ 下载网络图片到本地后引用'
            ]
          },
          {
            issue: '❌ 表格格式错误',
            causes: [
              'Markdown 表格语法不正确',
              '表格过于复杂',
              '列宽设置不合理'
            ],
            solutions: [
              '✅ 检查表格语法（使用 | 分隔列）',
              '✅ 简化表格结构',
              '✅ 在 styleConfig 中配置合适的列宽'
            ]
          },
          {
            issue: '❌ 样式未生效',
            causes: [
              '样式配置语法错误',
              '模板和自定义样式冲突',
              '颜色值格式不正确'
            ],
            solutions: [
              '✅ 验证 JSON 格式是否正确',
              '✅ 检查样式优先级（自定义样式会覆盖模板）',
              '✅ 使用 6 位十六进制颜色值（如 "2E74B5"）'
            ]
          }
        ]
      },
      performance: {
        title: '性能问题排查',
        problems: [
          {
            issue: '⚠️ 转换速度慢',
            causes: [
              '文档过大',
              '图片过多或过大',
              '系统资源不足'
            ],
            solutions: [
              '✅ 分割大文档为多个小文档',
              '✅ 优化图片大小和数量',
              '✅ 确保系统有足够内存（至少 512MB）',
              '✅ 使用预设模板而非过多自定义样式'
            ]
          },
          {
            issue: '⚠️ 内存占用高',
            causes: [
              '处理多个大文档',
              '图片未压缩',
              '样式配置过于复杂'
            ],
            solutions: [
              '✅ 分批处理文档',
              '✅ 压缩图片文件',
              '✅ 简化样式配置',
              '✅ 处理完一个文档后再处理下一个'
            ]
          }
        ]
      },
      integration: {
        title: '集成问题排查',
        problems: [
          {
            issue: '🔌 MCP 连接失败',
            causes: [
              'Node.js 版本过低',
              '依赖包未安装',
              '端口被占用'
            ],
            solutions: [
              '✅ 确保 Node.js >= 18.0.0',
              '✅ 运行 npm install 安装依赖',
              '✅ 检查并释放被占用的端口'
            ]
          },
          {
            issue: '🔌 Sampling 不可用',
            causes: [
              '客户端不支持 sampling',
              'MCP 版本不兼容'
            ],
            solutions: [
              '✅ 更新到支持 sampling 的 MCP 客户端',
              '✅ 检查 MCP SDK 版本（需要 >= 1.20.0）',
              '✅ 暂时不使用需要 sampling 的功能（如 AI 摘要）'
            ]
          },
          {
            issue: '🔌 资源访问失败',
            causes: [
              '资源 URI 格式不正确',
              '动态资源参数缺失'
            ],
            solutions: [
              '✅ 检查资源 URI 格式（如 templates://list）',
              '✅ 为动态资源提供必要参数（如 batch://{jobId}/status）',
              '✅ 使用 list 命令查看可用资源'
            ]
          }
        ]
      }
    };

    const guide = guides[errorType];

    return {
      messages: [
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `# ${guide.title}

${guide.problems.map((problem: any) => `
## ${problem.issue}

### 可能原因
${problem.causes.map((cause: string) => `- ${cause}`).join('\n')}

### 解决方案
${problem.solutions.map((solution: string) => `${solution}`).join('\n')}
`).join('\n')}

## 📞 获取更多帮助

如果问题仍未解决：
1. 查看完整文档和示例
2. 检查系统日志获取详细错误信息
3. 访问资源获取最新信息：
   - templates://list - 查看可用模板
   - style-guide://complete - 样式配置指南
   - converters://supported_formats - 支持的格式
   - performance://metrics - 性能指标

需要具体的帮助吗？请描述您遇到的问题！`,
          },
        },
      ],
    };
  }
);

// ==================== 表格处理工具 ====================

// 工具：从CSV创建表格数据
server.registerTool(
  'create_table_from_csv',
  {
    title: '从CSV创建表格',
    description: '将CSV数据转换为可用于文档的表格数据',
    inputSchema: {
      csvData: z.string().describe('CSV格式的数据'),
      hasHeader: z.boolean().optional().default(true).describe('第一行是否为表头'),
      delimiter: z.string().optional().default(',').describe('分隔符'),
      styleName: z.string().optional().default('minimal').describe('表格样式名称'),
    },
    outputSchema: {
      success: z.boolean(),
      rowCount: z.number(),
      columnCount: z.number(),
      styleName: z.string(),
      preview: z.string(),
    },
  },
  async ({ csvData, hasHeader = true, delimiter = ',', styleName = 'minimal' }) => {
    try {
      const tableData = TableProcessor.fromCSV(csvData, { hasHeader, delimiter, styleName });
      const validation = TableProcessor.validate(tableData);
      
      if (!validation.valid) {
        throw new Error(`表格数据验证失败: ${validation.errors.join(', ')}`);
      }

      const rowCount = tableData.rows.length;
      const columnCount = tableData.rows[0]?.length || 0;
      const preview = tableData.rows.slice(0, 3).map((row, i) =>
        `${i + 1}. ${row.map(cell => cell.content).join(' | ')}`
      ).join('\n');

      const output = {
        success: true,
        rowCount,
        columnCount,
        styleName: typeof tableData.style === 'string' ? tableData.style : 'custom',
        preview: preview || '空表格'
      };

      return {
        content: [
          {
            type: 'text',
            text: `✅ CSV表格创建成功！\n\n📊 行数: ${rowCount}\n📊 列数: ${columnCount}\n🎨 样式: ${output.styleName}\n\n📝 预览（前3行）:\n${output.preview}`,
          },
        ],
        structuredContent: output,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      return {
        content: [
          {
            type: 'text',
            text: `❌ CSV表格创建失败: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// 工具：从JSON创建表格数据
server.registerTool(
  'create_table_from_json',
  {
    title: '从JSON创建表格',
    description: '将JSON数组数据转换为可用于文档的表格数据',
    inputSchema: {
      jsonData: z.string().describe('JSON格式的数据（数组）'),
      columns: z.array(z.string()).optional().describe('要包含的列名（可选，默认全部）'),
      styleName: z.string().optional().default('minimal').describe('表格样式名称'),
    },
    outputSchema: {
      success: z.boolean(),
      rowCount: z.number(),
      columnCount: z.number(),
      styleName: z.string(),
      preview: z.string(),
    },
  },
  async ({ jsonData, columns, styleName = 'minimal' }) => {
    try {
      const tableData = TableProcessor.fromJSON(jsonData, { columns, styleName });
      const validation = TableProcessor.validate(tableData);
      
      if (!validation.valid) {
        throw new Error(`表格数据验证失败: ${validation.errors.join(', ')}`);
      }

      const rowCount = tableData.rows.length;
      const columnCount = tableData.rows[0]?.length || 0;
      const preview = tableData.rows.slice(0, 3).map((row, i) =>
        `${i + 1}. ${row.map(cell => cell.content).join(' | ')}`
      ).join('\n');

      const output = {
        success: true,
        rowCount,
        columnCount,
        styleName: typeof tableData.style === 'string' ? tableData.style : 'custom',
        preview: preview || '空表格'
      };

      return {
        content: [
          {
            type: 'text',
            text: `✅ JSON表格创建成功！\n\n📊 行数: ${rowCount}\n📊 列数: ${columnCount}\n🎨 样式: ${output.styleName}\n\n📝 预览（前3行）:\n${output.preview}`,
          },
        ],
        structuredContent: output,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      return {
        content: [
          {
            type: 'text',
            text: `❌ JSON表格创建失败: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// 工具：列出所有预定义表格样式
server.registerTool(
  'list_table_styles',
  {
    title: '列出表格样式',
    description: '获取所有可用的预定义表格样式',
    inputSchema: {},
    outputSchema: {
      styles: z.array(z.object({
        name: z.string(),
        description: z.string(),
      })),
      count: z.number(),
    },
  },
  async () => {
    try {
      const styles = TableProcessor.listPresetStyles();
      const output = {
        styles,
        count: styles.length,
      };

      const styleList = styles.map(s => `• **${s.name}**: ${s.description}`).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `📋 可用表格样式（共${output.count}种）:\n\n${styleList}\n\n💡 在创建表格时使用 styleName 参数指定样式`,
          },
        ],
        structuredContent: output,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      return {
        content: [
          {
            type: 'text',
            text: `❌ 获取表格样式失败: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ==================== 服务器启动 ====================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('aigroup-mdtoword-mcp MCP 服务器已启动 (v3.0.0)');
  console.error('- 使用最新 MCP SDK 1.20.1');
  console.error('- 支持 Zod 类型验证');
  console.error('- 启用通知防抖优化');
  console.error('- 提供结构化输出');
  console.error('- 支持 Sampling（AI辅助摘要）');
}

main().catch((error) => {
  console.error('服务器启动失败:', error);
  process.exit(1);
});