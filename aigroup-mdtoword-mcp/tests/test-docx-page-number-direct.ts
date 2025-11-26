// 直接使用docx API测试页码 - 验证官方文档示例
import { Document, Packer, Paragraph, TextRun, Header, Footer, PageNumber, AlignmentType } from 'docx';
import fs from 'fs';

async function testDirectDocxPageNumber() {
  console.log('🔍 直接测试docx的PageNumber API\n');

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          pageNumbers: {
            start: 1,
            formatType: 'decimal' as any
          }
        }
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun("页眉测试")
              ],
              alignment: AlignmentType.CENTER
            })
          ]
        })
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  children: ["第 ", PageNumber.CURRENT, " 页"]
                })
              ],
              alignment: AlignmentType.CENTER
            })
          ]
        })
      },
      children: [
        new Paragraph("第一页内容"),
        new Paragraph("更多内容"),
        new Paragraph("更多内容"),
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync('test-docx-direct-page-number.docx', buffer);
  
  console.log('✅ 直接docx API测试文件已生成: test-docx-direct-page-number.docx');
  console.log('请用Word打开查看页眉页脚和页码');
}

testDirectDocxPageNumber().catch(console.error);