
# Release Notes v3.1.0

## 🎉 表格功能大幅增强

发布日期：2025-01-19

### ✨ 新增功能

#### 1. 12种预定义表格样式

新增了12种专业的表格样式，覆盖各种应用场景：

- **minimal** - 简约现代风格：细线边框，清爽布局，适合简单报告
- **professional** - 专业商务风格：深色表头，正式布局，适合商务文档
- **striped** - 斑马纹风格：交替行颜色，易读性强，适合数据报表
- **grid** - 网格风格：完整网格边框，结构清晰，适合数据密集型表格
- **elegant** - 优雅风格：双线边框，典雅大方，适合正式文档
- **colorful** - 彩色风格：彩色表头，活力四射，适合创意文档
- **compact** - 紧凑风格：小边距，信息密集，适合信息密集型文档
- **fresh** - 清新风格：淡绿色调，清爽宜人，适合轻松文档
- **tech** - 科技风格：蓝色主题，现代科技感，适合技术文档
- **report** - 报告风格：双线边框，严谨规范，适合分析报告
- **financial** - 财务风格：数字右对齐，专业财务，适合财务报表
- **academic** - 学术风格：粗线边框，学术规范，适合学术论文

#### 2. 数据导入功能

##### CSV数据导入
- 支持从CSV数据快速创建表格
- 自动识别表头
- 自定义分隔符
- 支持多种编码

##### JSON数据导入
- 支持从JSON数组创建表格
- 可选择特定列
- 自动生成表头
- 类型安全的数据转换

#### 3. 复杂表格支持

- **单元格合并**：支持rowSpan和colSpan
- **嵌套表格**：支持在单元格中嵌套子表格（实验性）
- **自定义单元格样式**：每个单元格可以有独立的样式
- **表格数据验证**：自动验证表格结构的正确性

#### 4. 新增MCP工具

##### create_table_from_csv
将CSV数据转换为表格

```json
{
  "tool": "create_table_from_csv",
  "arguments": {
    "csvData": "姓名,年龄,城市\n张三,28,北京\n李四,32,上海",
    "hasHeader": true,
    "delimiter": ",",
    "styleName": "professional"
  }
}
```

##### create_table_from_json
将JSON数组转换为表格

```json
{
  "tool": "create_table_from_json",
  "arguments": {
    "jsonData": "[{\"name\":\"张三\",\"age\":28},{\"name\":\"李四\",\"age\":32}]",
    "columns": ["name", "age"],
    "styleName": "minimal"
  }
}
```

##### list_table_styles
列出所有可用的预定义表格样式

```json
{
  "tool": "list_table_styles"
}
```

### 🔧 技术改进

#### 新增文件
- `src/utils/tableProcessor.ts` - 表格数据处理和样式管理（475行）
- `src/utils/tableBuilder.ts` - 表格构建和DOCX渲染（291行）
- `examples/table-features-demo.md` - 完整的功能示例文档（286行）
- `TABLE_FEATURES.md` - 详细的功能总结文档（509行）

#### 更新文件
- `src/types/style.ts` - 添加表格相关类型定义
- `src/converter/markdown.ts` - 集成新的表格功能
- `src/index.ts` - 添