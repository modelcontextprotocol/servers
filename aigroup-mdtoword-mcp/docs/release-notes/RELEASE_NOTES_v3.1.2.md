# Release Notes - v3.1.2

## 🐛 Bug修复

### 页眉页脚功能修复

**问题描述：**
在 v3.1.1 及之前的版本中，虽然代码中实现了页眉页脚功能，但由于样式引擎的合并逻辑缺少对 `headerFooter` 配置的处理，导致用户配置的页眉页脚信息在样式合并过程中丢失，最终生成的文档中无法显示页眉页脚。

**修复内容：**
- 修复了 `styleEngine.ts` 中 `mergeStyleConfigs` 方法的问题
- 添加了对以下配置项的合并支持：
  - `headerFooter` - 页眉页脚配置
  - `watermark` - 水印配置
  - `tableOfContents` - 目录配置
  - `imageStyles` - 图片样式配置

**影响范围：**
此修复确保所有文档格式化配置都能正确合并，特别是：
1. ✅ 页眉配置（内容、对齐、文字样式、边框）
2. ✅ 页脚配置（内容、对齐、页码、文字样式、边框）
3. ✅ 水印配置
4. ✅ 自动目录配置
5. ✅ 图片样式配置

## 📝 测试验证

创建了完整的测试套件来验证页眉页脚功能：
- `tests/test-header-footer.ts` - 综合测试脚本（5个测试场景）
- `tests/verify-docx-headers.ts` - docx 包功能验证
- `tests/debug-headers.ts` - 调试测试（多页文档）
- `tests/final-header-footer-test.ts` - 最终验证测试

所有测试均通过，页眉页脚在生成的 Word 文档中正确显示。

## 🔧 技术细节

**修改文件：**
- `src/utils/styleEngine.ts` (第 392-414 行)

**修改代码：**
```typescript
// 合并页眉页脚配置
if (override.headerFooter) {
  result.headerFooter = this.deepMerge(result.headerFooter || {}, override.headerFooter, overrideExisting);
}

// 合并水印配置
if (override.watermark) {
  result.watermark = this.deepMerge(result.watermark || {}, override.watermark, overrideExisting);
}

// 合并目录配置
if (override.tableOfContents) {
  result.tableOfContents = this.deepMerge(result.tableOfContents || {}, override.tableOfContents, overrideExisting);
}

// 合并图片样式
if (override.imageStyles) {
  result.imageStyles = this.deepMerge(result.imageStyles || {}, override.imageStyles, overrideExisting);
}
```

## 📊 使用示例

现在可以正常使用页眉页脚功能：

```typescript
import { DocxMarkdownConverter } from 'aigroup-mdtoword-mcp';

const config = {
  headerFooter: {
    header: {
      content: '文档标题',
      alignment: 'center',
      textStyle: {
        font: '宋体',
        size: 24,
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
      content: '第 ',
      alignment: 'center',
      showPageNumber: true,
      pageNumberFormat: ' 页',
      textStyle: {
        font: '宋体',
        size: 20
      }
    }
  }
};

const converter = new DocxMarkdownConverter(config);
const buffer = await converter.convert(markdownContent);
```

## 🎯 升级建议

强烈建议所有用户升级到 v3.1.2，特别是需要使用以下功能的用户：
- 页眉页脚
- 文档水印
- 自动目录
- 自定义图片样式

## 📦 安装/升级

```bash
npm install aigroup-mdtoword-mcp@3.1.2
```

或

```bash
npm update aigroup-mdtoword-mcp
```

## 🙏 致谢

感谢用户反馈此问题，帮助我们发现并修复了这个重要的bug。

---

**发布日期：** 2025-10-19  
**版本：** 3.1.2  
**类型：** Bug修复版本