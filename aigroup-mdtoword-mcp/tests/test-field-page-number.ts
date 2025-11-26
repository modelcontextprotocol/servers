// 使用Field方式插入页码
import { Document, Packer, Paragraph, TextRun, Header, Footer, AlignmentType, SimpleField } from 'docx';
import fs from 'fs';

async function testFieldPageNumber() {
  console.log('🔍 使用Field方式测试页码\n');

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          pageNumbers: {
            start: 1
          }
        }
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun("使用Field的页眉测试")
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
                new TextRun("第 "),
                new SimpleField("PAGE"),
                new TextRun(" 页 / 共 "),
                new SimpleField("NUMPAGES"),
                new TextRun(" 页")
              ],
              alignment: AlignmentType.CENTER
            })
          ]
        })
      },
      children: [
        new Paragraph("第一页内容"),
        new Paragraph("第二页内容"),
        new Paragraph("第三页内容"),
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync('test-field-page-number.docx', buffer);
  
  console.log('✅ Field方式测试文件已生成: test-field-page-number.docx');
  console.log('请用Word打开查看页眉页脚和页码');
}

testFieldPageNumber().catch(console.error);