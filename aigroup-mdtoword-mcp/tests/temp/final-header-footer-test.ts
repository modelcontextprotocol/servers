import { DocxMarkdownConverter } from '../src/converter/markdown.js';
import { StyleConfig } from '../src/types/style.js';
import fs from 'fs';

/**
 * 最终的页眉页脚测试
 */
async function finalTest() {
  console.log('🧪 最终页眉页脚测试\n');

  // 创建足够长的内容以产生多页
  const content = `# 页眉页脚最终测试

这是一个详细的页眉页脚测试文档。

## 第一部分

${Array(20).fill('这是测试内容段落，用于生成足够的页数来查看页眉页脚效果。').join('\n\n')}

## 第二部分

${Array(20).fill('更多的测试内容段落，确保文档有多页。').join('\n\n')}

## 第三部分

${Array(20).fill('继续添加更多内容以确保能看到页眉页脚。').join('\n\n')}
`;

  const config: StyleConfig = {
    headerFooter: {
      header: {
        content: '【这是页眉】测试文档',
        alignment: 'center',
        textStyle: {
          font: '宋体',
          size: 24,  // 12pt
          color: '000000',
          bold: true
        },
        border: {
          bottom: {
            size: 6,
            color: '000000',
            style: 'single'
          }
        }
      },
      footer: {
        content: '【这是页脚】第 ',
        alignment: 'center',
        showPageNumber: true,
        pageNumberFormat: ' 页',
        textStyle: {
          font: '宋体',
          size: 20,  // 10pt
          color: '000000'
        },
        border: {
          top: {
            size: 6,
            color: '000000',
            style: 'single'
          }
        }
      }
    }
  };

  console.log('📝 配置信息:');
  console.log('页眉:', config.headerFooter?.header?.content);
  console.log('页脚:', config.headerFooter?.footer?.content);
  console.log();

  const converter = new DocxMarkdownConverter(config);
  const buffer = await converter.convert(content);
  
  const outputPath = 'final-header-footer-test.docx';
  fs.writeFileSync(outputPath, buffer);
  
  console.log(`\n✅ 测试文件已生成: ${outputPath}`);
  console.log('\n📋 验证步骤:');
  console.log('1. 打开 Word 文档');
  console.log('2. 确保使用"打印布局"视图');
  console.log('3. 页眉应显示: 【这是页眉】测试文档（有下边框）');
  console.log('4. 页脚应显示: 【这是页脚】第 X 页（有上边框）');
  console.log('5. 滚动到不同页面验证页眉页脚是否都显示');
}

finalTest().catch(error => {
  console.error('测试失败:', error);
  process.exit(1);
});