import { Document, Packer, Paragraph, TextRun, Header, Footer, PageNumber } from 'docx';
import fs from 'fs';

/**
 * 调试页眉页脚功能
 */
async function debugHeaders() {
  console.log('🔍 创建详细的页眉页脚测试文档...\n');

  // 创建多页内容以确保页眉页脚可见
  const paragraphs: Paragraph[] = [];
  
  for (let i = 1; i <= 50; i++) {
    paragraphs.push(new Paragraph({
      text: `这是第 ${i} 段内容，用于测试页眉页脚在多页文档中的显示效果。`,
      spacing: {
        after: 200
      }
    }));
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,  // 1 inch
              right: 1440,
              bottom: 1440,
              left: 1440
            }
          }
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "【页眉测试】这是文档页眉",
                    bold: true,
                    size: 24
                  })
                ],
                alignment: 'center',
                border: {
                  bottom: {
                    color: "000000",
                    space: 1,
                    style: 'single',
                    size: 6
                  }
                }
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun("【页脚测试】第 "),
                  new TextRun({
                    children: [PageNumber.CURRENT]
                  }),
                  new TextRun(" 页")
                ],
                alignment: 'center',
                border: {
                  top: {
                    color: "000000",
                    space: 1,
                    style: 'single',
                    size: 6
                  }
                }
              })
            ]
          })
        },
        children: paragraphs
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync('debug-headers.docx', buffer);
  console.log('✅ 测试文件已生成: debug-headers.docx');
  console.log('📋 文件包含 50 段内容，应该有多页');
  console.log('💡 提示: 在 Word 中，请确保：');
  console.log('   1. 使用"打印布局"视图（视图 -> 打印布局）');
  console.log('   2. 或者使用打印预览查看页眉页脚');
  console.log('   3. 页眉页脚有明显的边框，应该很容易识别\n');
}

debugHeaders().catch(console.error);