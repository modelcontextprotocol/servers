import { DocxMarkdownConverter } from '../src/converter/markdown.js';
import fs from 'fs/promises';
import path from 'path';

async function testLocalImages() {
  console.log('🧪 开始测试本地图片嵌入功能...\n');
  
  try {
    // 读取测试markdown文件
    const markdownPath = path.join(process.cwd(), 'test-image-embed.md');
    const markdown = await fs.readFile(markdownPath, 'utf-8');
    console.log('✅ 成功读取测试markdown文件');
    console.log(`📄 Markdown内容长度: ${markdown.length} 字符\n`);
    
    // 创建转换器
    console.log('🔧 创建Markdown转换器...');
    const converter = new DocxMarkdownConverter();
    console.log('✅ 转换器创建成功\n');
    
    // 执行转换
    console.log('🔄 开始转换过程...');
    const docxBuffer = await converter.convert(markdown);
    console.log('✅ 转换完成！');
    console.log(`📦 生成的DOCX文件大小: ${docxBuffer.length} 字节\n`);
    
    // 保存文件
    const outputPath = path.join(process.cwd(), 'test-output.docx');
    await fs.writeFile(outputPath, docxBuffer);
    console.log(`💾 文件已保存到: ${outputPath}`);
    console.log('\n✅ 测试完成！');
    
  } catch (error) {
    console.error('\n❌ 测试失败！');
    console.error('错误类型:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('错误消息:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\n错误堆栈:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testLocalImages();