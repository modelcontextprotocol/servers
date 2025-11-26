# 🎉 版本 3.2.0 发布说明

发布日期: 2024-10-19

## 🚀 主要更新

### 修复页眉页脚页码功能

这是一个重要的bug修复版本，完全重构了页眉页脚页码的实现方式，使其完全符合Word文档标准。

## ✨ 新功能

### 1. 完整的页码支持

#### 当前页码和总页数
- ✅ 支持显示当前页码
- ✅ 支持显示总页数
- ✅ 灵活的页码格式组合

**示例**：
```json
{
  "headerFooter": {
    "footer": {
      "content": "第 ",
      "showPageNumber": true,
      "pageNumberFormat": " 页",
      "showTotalPages": true,
      "totalPagesFormat": " / 共 ",
      "alignment": "center"
    }
  }
}
```
**结果**: "第 1 页 / 共 5 页"

#### 多种页码格式
- `decimal`: 阿拉伯数字 (1, 2, 3...)
- `upperRoman`: 大写罗马数字 (I, II, III...)
- `lowerRoman`: 小写罗马数字 (i, ii, iii...)
- `upperLetter`: 大写字母 (A, B, C...)
- `lowerLetter`: 小写字母 (a, b, c...)

**示例**：
```json
{
  "headerFooter": {
    "footer": {
      "showPageNumber": true,
      "showTotalPages": true,
      "totalPagesFormat": " / "
    },
    "pageNumberFormatType": "upperRoman"
  }
}
```
**结果**: "I / III"

### 2. 不同首页支持

允许首页使用不同的页眉页脚，常用于封面页。

**示例**：
```json
{
  "headerFooter": {
    "header": {
      "content": "正常页眉",
      "alignment": "center"
    },
    "footer": {
      "content": "第 ",
      "showPageNumber": true,
      "pageNumberFormat": " 页"
    },
    "firstPageHeader": {
      "content": "封面标题",
      "alignment": "center"
    },
    "firstPageFooter": {
      "content": "封面页"
    },
    "differentFirstPage": true
  }
}
```

### 3. 奇偶页不同支持

支持奇数页和偶数页显示不同的页眉页脚，适用于双面打印。

**示例**：
```json
{
  "headerFooter": {
    "header": {
      "content": "奇数页页眉",
      "alignment": "right"
    },
    "evenPageHeader": {
      "content": "偶数页页眉",
      "alignment": "left"
    },
    "differentOddEven": true
  }
}
```

### 4. 页码起始编号

可以指定页码从任意数字开始。

**示例**：
```json
{
  "headerFooter": {
    "footer": {
      "showPageNumber": true
    },
    "pageNumberStart": 5
  }
}
```
**结果**: 第一页显示为"5"

## 🔧 技术改进

### 使用Word标准域代码实现页码
- 将 `PageNumber.CURRENT` 改为 `SimpleField("PAGE")`
- 将 `PageNumber.TOTAL_PAGES` 改为 `SimpleField("NUMPAGES")`
- 这是Word文档中页码的标准实现方式，确保兼容性

### 增强的配置验证
- 添加了详细的Schema描述
- 为AI大模型提供清晰的使用说明
- 支持多种页码格式组合

## 📦 完整功能列表

### 页眉页脚配置项

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `header.content` | string | 页眉文本内容 |
| `header.alignment` | string | 页眉对齐方式 |
| `footer.content` | string | 页脚文本（页码前） |
| `footer.showPageNumber` | boolean | 是否显示页码 |
| `footer.pageNumberFormat` | string | 页码后缀文本 |
| `footer.showTotalPages` | boolean | 是否显示总页数 |
| `footer.totalPagesFormat` | string | 总页数连接文本 |
| `footer.alignment` | string | 页脚对齐方式 |
| `firstPageHeader` | object | 首页专用页眉 |
| `firstPageFooter` | object | 首页专用页脚 |
| `evenPageHeader` | object | 偶数页专用页眉 |
| `evenPageFooter` | object | 偶数页专用页脚 |
| `differentFirstPage` | boolean | 是否首页不同 |
| `differentOddEven` | boolean | 是否奇偶页不同 |
| `pageNumberStart` | number | 页码起始编号 |
| `pageNumberFormatType` | string | 页码格式类型 |

## 🎯 使用场景

### 场景1：简单页码
```json
{
  "headerFooter": {
    "footer": {
      "showPageNumber": true,
      "alignment": "center"
    }
  }
}
```

### 场景2：中文格式（推荐）
```json
{
  "headerFooter": {
    "footer": {
      "content": "第 ",
      "showPageNumber": true,
      "pageNumberFormat": " 页",
      "showTotalPages": true,
      "totalPagesFormat": " / 共 ",
      "alignment": "center"
    }
  }
}
```

### 场景3：英文格式
```json
{
  "headerFooter": {
    "footer": {
      "content": "Page ",
      "showPageNumber": true,
      "showTotalPages": true,
      "totalPagesFormat": " of ",
      "alignment": "center"
    }
  }
}
```

### 场景4：学术论文（封面无页码）
```json
{
  "headerFooter": {
    "footer": {
      "content": "第 ",
      "showPageNumber": true,
      "pageNumberFormat": " 页"
    },
    "firstPageFooter": {
      "content": "© 2024 研究机构"
    },
    "differentFirstPage": true
  }
}
```

## 🐛 Bug修复

- 修复页码功能完全不工作的问题
- 修复 `PageNumber.CURRENT` 无法正确渲染的问题
- 修复总页数无法显示的问题
- 修复首页和奇偶页配置不生效的问题

## 📝 升级指南

从 v3.1.x 升级到 v3.2.0：

```bash
npm install aigroup-mdtoword-mcp@3.2.0
```

### 配置变更

旧版本（不工作）：
```json
{
  "headerFooter": {
    "footer": {
      "content": "机密文档",
      "showPageNumber": true,
      "pageNumberFormat": "/ 共"
    }
  }
}
```

新版本（完全工作）：
```json
{
  "headerFooter": {
    "footer": {
      "content": "第 ",
      "showPageNumber": true,
      "pageNumberFormat": " 页",
      "showTotalPages": true,
      "totalPagesFormat": " / 共 ",
      "alignment": "center"
    }
  }
}
```

## 🔗 相关资源

- [完整文档](../../README.md)
- [使用示例](../../examples/)
- [API参考](../README.md)

## 🙏 致谢

感谢社区用户反馈页码功能的问题，帮助我们发现并修复了这个关键bug。

---

**下载**: `npm install aigroup-mdtoword-mcp@3.2.0`