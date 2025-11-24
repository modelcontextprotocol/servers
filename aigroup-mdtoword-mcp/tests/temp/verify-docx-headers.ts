import { Document, Packer, Paragraph, TextRun, Header, Footer, PageNumber } from 'docx';
import fs from 'fs';

/**
 * 验证 docx 包的页眉页脚功能
 */
async function verifyDocxHeaders() {
  console.log('🔍 验证 docx 包的页眉页脚功能...\n');

  // 创建一个带页眉页脚的简单文档
  const doc = new Document({
    sections: [
      {
        properties: {},
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                text: "这是页眉测试",
                alignment: 'center'
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: 'center',
                children: [
                  new TextRun("第 "),
                  new TextRun({
                    children: [PageNumber.CURRENT]
                  }),
                  new TextRun(" 页")
                ]
              })
            ]
          })
        },
        children: [
          new Paragraph({
            text: "这是文档内容 - 第一段",
          }),
          new Paragraph({
            text: "这是文档内容 - 第二段",
          }),
          new Paragraph({
            text: "这是文档内容 - 第三段",
          })
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync('verify-docx-headers.docx', buffer);
  console.log('✅ 测试文件已生成: verify-docx-headers.docx');
  console.log('📋 请手动打开文件检查页眉页脚是否显示');
}

verifyDocxHeaders().catch(console.error);