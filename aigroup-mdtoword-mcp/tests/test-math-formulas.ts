import { DocxMarkdownConverter } from '../src/converter/markdown.js';
import { MathProcessor } from '../src/utils/mathProcessor.js';
import fs from 'fs/promises';
import path from 'path';

async function testMathFormulas() {
  console.log('🧮 开始测试数学公式功能...\n');

  // 测试1: 基础LaTeX解析
  console.log('📝 测试1: 基础LaTeX解析');
  const mathProcessor = new MathProcessor();
  
  const testCases = [
    { name: '简单分数', latex: '\\frac{1}{2}' },
    { name: '平方根', latex: '\\sqrt{2}' },
    { name: '上标', latex: 'x^2' },
    { name: '下标', latex: 'x_1' },
    { name: '求和', latex: '\\sum_{i=1}^{n} x_i' },
  ];

  for (const testCase of testCases) {
    console.log(`  - ${testCase.name}: ${testCase.latex}`);
    const mathObj = mathProcessor.convertLatexToDocx(testCase.latex);
    console.log(`    ✅ 转换${mathObj ? '成功' : '失败'}`);
  }

  // 测试2: Markdown中的数学公式检测
  console.log('\n📝 测试2: Markdown中的数学公式检测');
  const markdownWithMath = `
# 测试文档

这是一个行内公式：$x + y = z$，非常简单。

这是一个行间公式：

$$\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

继续正文内容。
  `.trim();

  const { processed, mathBlocks } = mathProcessor.processMathInMarkdown(markdownWithMath);
  console.log(`  - 找到 ${mathBlocks.length} 个数学公式`);
  mathBlocks.forEach((block, index) => {
    console.log(`    ${index + 1}. ${block.inline ? '行内' : '行间'}公式: ${block.latex}`);
  });

  // 测试3: 完整的Markdown到DOCX转换
  console.log('\n📝 测试3: 完整的Markdown到DOCX转换');
  
  try {
    // 读取示例文件
    const examplePath = path.join(process.cwd(), 'examples', 'math-formulas-demo.md');
    const markdownContent = await fs.readFile(examplePath, 'utf-8');
    console.log(`  - 读取示例文件: ${examplePath}`);
    console.log(`  - 文件大小: ${markdownContent.length} 字符`);

    // 创建转换器
    const converter = new DocxMarkdownConverter({
      document: {
        defaultFont: '宋体',
        defaultSize: 24
      },
      paragraphStyles: {
        normal: {
          font: '宋体',
          size: 24,
          spacing: {
            line: 360,
            before: 100,
            after: 100
          }
        }
      }
    });

    // 转换
    console.log('  - 开始转换...');
    const docxBuffer = await converter.convert(markdownContent);
    console.log(`  - 转换完成，生成文件大小: ${docxBuffer.length} 字节`);

    // 保存文件
    const outputPath = path.join(process.cwd(), 'tests', 'output-math-formulas.docx');
    await fs.writeFile(outputPath, docxBuffer);
    console.log(`  - ✅ 文件已保存: ${outputPath}`);

  } catch (error) {
    console.error('  - ❌ 转换失败:', error);
  }

  console.log('\n🎉 测试完成！');
}

// 运行测试
testMathFormulas().catch(console.error);