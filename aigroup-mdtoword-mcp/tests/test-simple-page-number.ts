import { DocxMarkdownConverter } from '../src/converter/markdown.js';
import { StyleConfig } from '../src/types/style.js';
import fs from 'fs';

/**
 * 最简单的页码测试 - 用于调试
 */
async function testSimplePageNumber() {
  console.log('🔍 调试：最简单的页码测试\n');

  const markdown = `# 测试
  
第一页内容

第二页内容

第三页内容`;

  // 最简单的配置 - 只有页脚和页码
  const config: StyleConfig = {
    headerFooter: {
      footer: {
        showPageNumber: true,
        alignment: 'center'
      }
    }
  };

  console.log('配置:', JSON.stringify(config, null, 2));

  const converter = new DocxMarkdownConverter(config);
  const buffer = await converter.convert(markdown);
  
  fs.writeFileSync('test-simple-page-number.docx', buffer);
  console.log('\n✅ 文件已生成: test-simple-page-number.docx');
  console.log('请用Word打开查看是否有页码显示');
}

testSimplePageNumber().catch(console.error);