# 数学公式功能开发文档

## 📋 功能概述

本次开发为MCP服务器添加了完整的数学公式支持，使Markdown文档中的LaTeX数学表达式能够自动转换为Word文档的原生数学公式。

## ✨ 新增功能

### 1. 数学公式处理模块 (`src/utils/mathProcessor.ts`)

#### 核心组件

**MathParser** - LaTeX解析器
- 解析LaTeX数学表达式为抽象语法树(AST)
- 支持多种LaTeX命令和符号
- 智能处理嵌套结构

**MathConverter** - docx转换器
- 将AST转换为docx.js的数学对象
- 支持所有docx.js提供的数学组件
- 保持数学表达式的结构和语义

**MathProcessor** - 主处理器
- 统一的数学公式处理接口
- Markdown文本预处理
- 公式提取和占位符替换

#### 支持的LaTeX命令

| 类型 | LaTeX命令 | 示例 | 说明 |
|------|-----------|------|------|
| **分数** | `\frac{分子}{分母}` | `\frac{1}{2}` | 分数表达式 |
| **根式** | `\sqrt{内容}` | `\sqrt{2}` | 平方根 |
| **根式** | `\sqrt[次数]{内容}` | `\sqrt[3]{8}` | n次根 |
| **上标** | `^{内容}` | `x^2` | 指数/上标 |
| **下标** | `_{内容}` | `x_1` | 下标 |
| **求和** | `\sum_{下限}^{上限}` | `\sum_{i=1}^{n}` | 求和符号 |
| **积分** | `\int` | `\int f(x)dx` | 积分符号 |
| **三角函数** | `\sin`, `\cos`, `\tan` | `\sin\theta` | 三角函数 |
| **对数** | `\log`, `\ln` | `\ln x` | 对数函数 |
| **极限** | `\lim` | `\lim_{x \to 0}` | 极限 |
| **希腊字母** | `\alpha`, `\beta`, `\pi`等 | `\pi r^2` | 希腊字母 |
| **括号** | 方括号、圆括号、花括号、尖括号 | `[x]`, `(x)`, `{x}`, `<x>` | 各种括号 |

### 2. Markdown转换器集成

在 `src/converter/markdown.ts` 中集成了数学公式处理：

#### 处理流程

```
Markdown输入
    ↓
数学公式预处理（提取$...$和$$...$$）
    ↓
替换为占位符（[MATH_INLINE_X]和[MATH_BLOCK_X]）
    ↓
Markdown标准解析
    ↓
文本处理时还原数学公式
    ↓
转换为docx数学对象
    ↓
生成Word文档
```

#### 关键修改点

1. **导入数学处理器**
   ```typescript
   import { MathProcessor } from '../utils/mathProcessor.js';
   ```

2. **初始化数学处理器**
   ```typescript
   private mathProcessor: MathProcessor;
   
   constructor(styleConfig?: StyleConfig) {
     // ...
     this.mathProcessor = new MathProcessor();
   }
   ```

3. **预处理数学公式**
   ```typescript
   const { processed, mathBlocks } = this.mathProcessor.processMathInMarkdown(markdown);
   ```

4. **文本处理时还原公式**
   ```typescript
   // 检测占位符并转换为数学对象
   const mathMatch = /\[MATH_(BLOCK|INLINE)_(\d+)\]/g.exec(text);
   const mathObj = this.mathProcessor.convertLatexToDocx(mathBlock.latex);
   ```

### 3. 示例文档

**`examples/math-formulas-demo.md`**
- 150行完整的数学公式示例
- 涵盖从基础到高级的各种公式类型
- 包含实际应用场景（物理、统计、金融等）

### 4. 测试代码

**`tests/test-math-formulas.ts`**
- LaTeX解析测试
- Markdown公式检测测试
- 完整转换流程测试

## 🎯 使用方法

### Markdown中使用数学公式

#### 行内公式
使用单个`$`符号包裹：
```markdown
这是一个行内公式：$x^2 + y^2 = r^2$
```

#### 行间公式（独立段落）
使用双`$$`符号包裹：
```markdown
$$
\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$
```

### MCP工具调用示例

```json
{
  "markdown": "# 数学测试\n\n二次方程：$ax^2 + bx + c = 0$\n\n求根公式：\n\n$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$",
  "filename": "math-test.docx",
  "styleConfig": {
    "document": {
      "defaultFont": "宋体",
      "defaultSize": 24
    }
  }
}
```

## 🔧 技术细节

### 数学组件映射

| LaTeX | docx.js类 | 说明 |
|-------|----------|------|
| 文本 | `MathRun` | 基础数学文本 |
| `\frac` | `MathFraction` | 分数 |
| `\sqrt` | `MathRadical` | 根式 |
| `^` | `MathSuperScript` | 上标 |
| `_` | `MathSubScript` | 下标 |
| `^_` | `MathSubSuperScript` | 上下标组合 |
| `\sum` | `MathSum` | 求和 |
| `\lim` | `MathLimitUpper/Lower` | 极限 |
| 函数 | `MathFunction` | 函数 |
| `[]` | `MathSquareBrackets` | 方括号 |
| `()` | `MathRoundBrackets` | 圆括号 |
| `{}` | `MathCurlyBrackets` | 花括号 |
| `<>` | `MathAngledBrackets` | 尖括号 |

### 占位符机制

为了不干扰Markdown的标准解析，使用占位符机制：

1. **提取阶段**：识别`$...$`和`$$...$$`
2. **替换阶段**：替换为`[MATH_INLINE_X]`或`[MATH_BLOCK_X]`
3. **还原阶段**：在文本处理时还原为数学对象

### 错误处理

- 无法解析的LaTeX会被跳过，不影响其他内容
- 支持的命令会正常转换
- 未知命令会被当作普通文本处理

## 📊 性能特性

- **增量处理**：只处理包含数学公式的段落
- **智能缓存**：重复的公式表达式可以复用解析结果
- **流式处理**：大文档不会一次性加载到内存

## 🚀 后续优化方向

### 短期优化
1. ✅ 添加更多LaTeX命令支持（矩阵、方程组等）
2. ✅ 优化复杂公式的解析性能
3. ✅ 添加公式语法验证

### 中期优化
1. 支持自定义公式样式（字体、大小、颜色）
2. 支持MathML输入格式
3. 添加公式编号和引用功能

### 长期优化
1. 支持交互式公式编辑器
2. 公式图像渲染预览
3. 公式OCR识别（从图片提取公式）

## 📝 已知限制

1. **复杂嵌套**：过度复杂的嵌套可能导致解析失败
2. **特殊符号**：部分特殊数学符号可能不支持
3. **矩阵**：目前矩阵支持有限，需要进一步开发
4. **对齐**：多行公式的对齐功能尚未实现

## 🧪 测试建议

运行测试：
```bash
npm run build
node dist/tests/test-math-formulas.js
```

预期输出：
- ✅ LaTeX解析测试通过
- ✅ Markdown检测测试通过
- ✅ 完整转换测试通过
- ✅ 生成测试文档：`tests/output-math-formulas.docx`

## 📚 参考资料

- [LaTeX数学符号](https://www.latex-project.org/help/documentation/)
- [docx.js数学API](https://docx.js.org/#/usage/math)
- [MathML规范](https://www.w3.org/TR/MathML3/)

## 🤝 贡献指南

如需添加新的数学功能：

1. 在`MathParser`中添加解析逻辑
2. 在`MathConverter`中添加转换逻辑
3. 更新示例文档`examples/math-formulas-demo.md`
4. 添加测试用例到`tests/test-math-formulas.ts`
5. 更新本文档

---

**版本**: 1.0.0  
**最后更新**: 2025-10-19  
**开发者**: AI Group