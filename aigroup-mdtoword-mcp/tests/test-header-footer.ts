import { DocxMarkdownConverter } from '../src/converter/markdown.js';
import { StyleConfig } from '../src/types/style.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 测试页眉页脚功能
 */
async function testHeaderFooter() {
  console.log('🧪 开始测试页眉页脚功能...\n');

  // 测试用的 Markdown 内容
  const markdownContent = `# 页眉页脚测试文档

这是一个测试页眉页脚功能的文档。

## 第一节

这是第一节的内容。页眉页脚应该在每一页显示。

## 第二节

这是第二节的内容。

### 子节

更多内容以确保文档有足够的长度来显示多页效果。

## 表格测试

| 列1 | 列2 | 列3 |
|-----|-----|-----|
| 数据1 | 数据2 | 数据3 |
| 数据4 | 数据5 | 数据6 |

## 代码测试

\`\`\`javascript
function test() {
  console.log("Hello World");
}
\`\`\`

这是更多的内容，用于测试页眉页脚在多页文档中的效果。
`;

  // 测试配置 1: 基本页眉页脚
  console.log('📝 测试 1: 基本页眉页脚');
  const config1: StyleConfig = {
    headerFooter: {
      header: {
        content: '测试文档 - 页眉',
        alignment: 'center'
      },
      footer: {
        content: '机密文档',
        alignment: 'center',
        showPageNumber: true,
        pageNumberFormat: '/ 共'
      }
    }
  };

  try {
    const converter1 = new DocxMarkdownConverter(config1);
    const buffer1 = await converter1.convert(markdownContent);
    const outputPath1 = path.join(__dirname, '../test-output-header-footer-basic.docx');
    fs.writeFileSync(outputPath1, buffer1);
    console.log(`✅ 测试 1 通过 - 文件已生成: ${outputPath1}\n`);
  } catch (error) {
    console.error('❌ 测试 1 失败:', error);
    console.error((error as Error).stack);
  }

  // 测试配置 2: 带样式的页眉页脚
  console.log('📝 测试 2: 带样式的页眉页脚');
  const config2: StyleConfig = {
    headerFooter: {
      header: {
        content: '专业报告 - 2024',
        alignment: 'right',
        textStyle: {
          font: '宋体',
          size: 20,
          color: '666666',
          italic: true
        },
        border: {
          bottom: {
            size: 4,
            color: '000000',
            style: 'single'
          }
        }
      },
      footer: {
        content: '版权所有 © 2024',
        alignment: 'left',
        showPageNumber: true,
        pageNumberFormat: '页',
        textStyle: {
          font: '宋体',
          size: 18,
          color: '999999'
        },
        border: {
          top: {
            size: 2,
            color: 'CCCCCC',
            style: 'single'
          }
        }
      }
    }
  };

  try {
    const converter2 = new DocxMarkdownConverter(config2);
    const buffer2 = await converter2.convert(markdownContent);
    const outputPath2 = path.join(__dirname, '../test-output-header-footer-styled.docx');
    fs.writeFileSync(outputPath2, buffer2);
    console.log(`✅ 测试 2 通过 - 文件已生成: ${outputPath2}\n`);
  } catch (error) {
    console.error('❌ 测试 2 失败:', error);
    console.error((error as Error).stack);
  }

  // 测试配置 3: 只有页眉
  console.log('📝 测试 3: 仅页眉（无页脚）');
  const config3: StyleConfig = {
    headerFooter: {
      header: {
        content: '仅页眉测试',
        alignment: 'center',
        textStyle: {
          font: '黑体',
          size: 24,
          color: '000000',
          bold: true
        }
      }
    }
  };

  try {
    const converter3 = new DocxMarkdownConverter(config3);
    const buffer3 = await converter3.convert(markdownContent);
    const outputPath3 = path.join(__dirname, '../test-output-header-only.docx');
    fs.writeFileSync(outputPath3, buffer3);
    console.log(`✅ 测试 3 通过 - 文件已生成: ${outputPath3}\n`);
  } catch (error) {
    console.error('❌ 测试 3 失败:', error);
    console.error((error as Error).stack);
  }

  // 测试配置 4: 只有页脚（带页码）
  console.log('📝 测试 4: 仅页脚（带页码）');
  const config4: StyleConfig = {
    headerFooter: {
      footer: {
        content: '第 ',
        alignment: 'center',
        showPageNumber: true,
        pageNumberFormat: ' 页',
        textStyle: {
          font: '宋体',
          size: 20,
          color: '000000'
        }
      }
    }
  };

  try {
    const converter4 = new DocxMarkdownConverter(config4);
    const buffer4 = await converter4.convert(markdownContent);
    const outputPath4 = path.join(__dirname, '../test-output-footer-only.docx');
    fs.writeFileSync(outputPath4, buffer4);
    console.log(`✅ 测试 4 通过 - 文件已生成: ${outputPath4}\n`);
  } catch (error) {
    console.error('❌ 测试 4 失败:', error);
    console.error((error as Error).stack);
  }

  // 测试配置 5: 不同对齐方式
  console.log('📝 测试 5: 不同对齐方式（左/右对齐）');
  const config5: StyleConfig = {
    headerFooter: {
      header: {
        content: '左对齐页眉',
        alignment: 'left',
        textStyle: {
          font: '宋体',
          size: 20,
          color: '333333'
        }
      },
      footer: {
        content: '右对齐页脚',
        alignment: 'right',
        showPageNumber: true,
        textStyle: {
          font: '宋体',
          size: 20,
          color: '333333'
        }
      }
    }
  };

  try {
    const converter5 = new DocxMarkdownConverter(config5);
    const buffer5 = await converter5.convert(markdownContent);
    const outputPath5 = path.join(__dirname, '../test-output-header-footer-aligned.docx');
    fs.writeFileSync(outputPath5, buffer5);
    console.log(`✅ 测试 5 通过 - 文件已生成: ${outputPath5}\n`);
  } catch (error) {
    console.error('❌ 测试 5 失败:', error);
    console.error((error as Error).stack);
  }

  console.log('🎉 所有测试完成！请检查生成的 DOCX 文件以验证页眉页脚是否正确显示。');
}

// 运行测试
testHeaderFooter().catch(error => {
  console.error('💥 测试执行失败:', error);
  process.exit(1);
});