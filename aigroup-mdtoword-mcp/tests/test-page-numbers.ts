import { DocxMarkdownConverter } from '../src/converter/markdown.js';
import { StyleConfig } from '../src/types/style.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 测试页码功能（包括总页数）
 */
async function testPageNumbers() {
  console.log('🧪 开始测试页码功能（含总页数）...\n');

  // 测试用的 Markdown 内容（确保有多页）
  const markdownContent = `# 页码功能测试文档

这是一个测试页码功能的文档，包括当前页和总页数的显示。

## 第一节

这是第一节的内容。为了确保文档有多页，我们需要添加足够的内容。

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

## 第二节

这是第二节的内容。继续添加内容以确保文档分页。

Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

## 第三节

这是第三节的内容。

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.

## 第四节

这是第四节的内容。

Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

## 表格测试

| 列1 | 列2 | 列3 |
|-----|-----|-----|
| 数据1 | 数据2 | 数据3 |
| 数据4 | 数据5 | 数据6 |
| 数据7 | 数据8 | 数据9 |

## 更多内容

继续添加内容以确保文档有足够的长度来分页。

这是更多的内容，用于测试页码在多页文档中的效果。
`;

  // 测试1: 基础页码 - "第 X 页"
  console.log('📝 测试 1: 基础页码显示（第 X 页）');
  const config1: StyleConfig = {
    headerFooter: {
      footer: {
        content: '第 ',
        showPageNumber: true,
        pageNumberFormat: ' 页',
        alignment: 'center'
      }
    }
  };

  try {
    const converter1 = new DocxMarkdownConverter(config1);
    const buffer1 = await converter1.convert(markdownContent);
    const outputPath1 = path.join(__dirname, '../test-output-page-number-basic.docx');
    fs.writeFileSync(outputPath1, buffer1);
    console.log(`✅ 测试 1 通过 - 文件已生成: ${outputPath1}\n`);
  } catch (error) {
    console.error('❌ 测试 1 失败:', error);
    console.error((error as Error).stack);
  }

  // 测试2: 带总页数 - "第 X 页 / 共 Y 页"
  console.log('📝 测试 2: 显示总页数（第 X 页 / 共 Y 页）');
  const config2: StyleConfig = {
    headerFooter: {
      footer: {
        content: '第 ',
        showPageNumber: true,
        pageNumberFormat: ' 页',
        showTotalPages: true,
        totalPagesFormat: ' / 共 ',
        alignment: 'center'
      }
    }
  };

  try {
    const converter2 = new DocxMarkdownConverter(config2);
    const buffer2 = await converter2.convert(markdownContent);
    const outputPath2 = path.join(__dirname, '../test-output-page-number-total.docx');
    fs.writeFileSync(outputPath2, buffer2);
    console.log(`✅ 测试 2 通过 - 文件已生成: ${outputPath2}\n`);
  } catch (error) {
    console.error('❌ 测试 2 失败:', error);
    console.error((error as Error).stack);
  }

  // 测试3: 英文格式 - "Page X of Y"
  console.log('📝 测试 3: 英文格式页码（Page X of Y）');
  const config3: StyleConfig = {
    headerFooter: {
      footer: {
        content: 'Page ',
        showPageNumber: true,
        showTotalPages: true,
        totalPagesFormat: ' of ',
        alignment: 'center'
      }
    }
  };

  try {
    const converter3 = new DocxMarkdownConverter(config3);
    const buffer3 = await converter3.convert(markdownContent);
    const outputPath3 = path.join(__dirname, '../test-output-page-number-english.docx');
    fs.writeFileSync(outputPath3, buffer3);
    console.log(`✅ 测试 3 通过 - 文件已生成: ${outputPath3}\n`);
  } catch (error) {
    console.error('❌ 测试 3 失败:', error);
    console.error((error as Error).stack);
  }

  // 测试4: 页眉页脚组合 + 页码配置
  console.log('📝 测试 4: 页眉页脚组合+页码起始编号');
  const config4: StyleConfig = {
    headerFooter: {
      header: {
        content: '文档标题',
        alignment: 'center'
      },
      footer: {
        content: '- ',
        showPageNumber: true,
        pageNumberFormat: ' -',
        showTotalPages: true,
        totalPagesFormat: ' / ',
        alignment: 'center'
      },
      pageNumberStart: 5,  // 从第5页开始编号
      pageNumberFormatType: 'decimal'
    }
  };

  try {
    const converter4 = new DocxMarkdownConverter(config4);
    const buffer4 = await converter4.convert(markdownContent);
    const outputPath4 = path.join(__dirname, '../test-output-page-number-custom-start.docx');
    fs.writeFileSync(outputPath4, buffer4);
    console.log(`✅ 测试 4 通过 - 文件已生成: ${outputPath4}\n`);
  } catch (error) {
    console.error('❌ 测试 4 失败:', error);
    console.error((error as Error).stack);
  }

  // 测试5: 不同首页
  console.log('📝 测试 5: 不同首页（首页无页码，后续页有页码）');
  const config5: StyleConfig = {
    headerFooter: {
      header: {
        content: '正常页眉',
        alignment: 'center'
      },
      footer: {
        content: '第 ',
        showPageNumber: true,
        showTotalPages: true,
        totalPagesFormat: ' / ',
        alignment: 'center'
      },
      firstPageHeader: {
        content: '首页标题',
        alignment: 'center'
      },
      firstPageFooter: {
        content: '封面页',
        alignment: 'center'
        // 首页不显示页码
      },
      differentFirstPage: true
    }
  };

  try {
    const converter5 = new DocxMarkdownConverter(config5);
    const buffer5 = await converter5.convert(markdownContent);
    const outputPath5 = path.join(__dirname, '../test-output-page-number-diff-first.docx');
    fs.writeFileSync(outputPath5, buffer5);
    console.log(`✅ 测试 5 通过 - 文件已生成: ${outputPath5}\n`);
  } catch (error) {
    console.error('❌ 测试 5 失败:', error);
    console.error((error as Error).stack);
  }

  // 测试6: 罗马数字页码
  console.log('📝 测试 6: 罗马数字页码');
  const config6: StyleConfig = {
    headerFooter: {
      footer: {
        showPageNumber: true,
        showTotalPages: true,
        totalPagesFormat: ' / ',
        alignment: 'center'
      },
      pageNumberFormatType: 'upperRoman'  // I, II, III, IV...
    }
  };

  try {
    const converter6 = new DocxMarkdownConverter(config6);
    const buffer6 = await converter6.convert(markdownContent);
    const outputPath6 = path.join(__dirname, '../test-output-page-number-roman.docx');
    fs.writeFileSync(outputPath6, buffer6);
    console.log(`✅ 测试 6 通过 - 文件已生成: ${outputPath6}\n`);
  } catch (error) {
    console.error('❌ 测试 6 失败:', error);
    console.error((error as Error).stack);
  }

  console.log('🎉 所有测试完成！');
  console.log('\n📋 生成的测试文件：');
  console.log('1. test-output-page-number-basic.docx - 基础页码');
  console.log('2. test-output-page-number-total.docx - 带总页数');
  console.log('3. test-output-page-number-english.docx - 英文格式');
  console.log('4. test-output-page-number-custom-start.docx - 自定义起始页码');
  console.log('5. test-output-page-number-diff-first.docx - 不同首页');
  console.log('6. test-output-page-number-roman.docx - 罗马数字页码');
  console.log('\n请在Word中打开这些文件查看页眉页脚和页码是否正确显示！');
}

// 运行测试
testPageNumbers().catch(error => {
  console.error('💥 测试执行失败:', error);
  process.exit(1);
});