# Release Notes - v3.0.2

## 🎉 发布概览

**发布日期：** 2025-01-18  
**版本：** 3.0.2  
**类型：** 功能增强版本

## 📦 新增内容

### 静态资源（3个）

#### 1. converters://supported_formats
- **功能：** 查看支持的输入输出格式
- **返回：** JSON 格式的完整格式列表
- **包含：** 当前支持的格式、计划中的格式、每种格式的特性

#### 2. templates://categories
- **功能：** 按分类浏览模板
- **返回：** JSON 格式的分类模板信息
- **包含：** 学术类、商务类、技术类、简约类等分类

#### 3. performance://metrics
- **功能：** 了解性能指标和优化建议
- **返回：** Markdown 格式的详细文档
- **包含：** 性能基准、优化建议、系统要求

### 动态资源（3个）

#### 4. batch://{jobId}/status
- **功能：** 查询批处理任务状态
- **参数：** jobId - 批处理任务ID
- **返回：** JSON 格式的任务进度信息
- **包含：** 总数、完成数、失败数、每个文件的详细状态

#### 5. analysis://{docId}/report
- **功能：** 获取文档分析报告
- **参数：** docId - 文档ID
- **返回：** JSON 格式的分析报告
- **包含：** 统计数据、文档结构、复杂度评估、优化建议

#### 6. integrations://available
- **功能：** 查看可用的集成服务
- **返回：** JSON 格式的集成列表
- **包含：** 存储集成、AI集成、导出集成及其状态

### 提示模板（2个）

#### 7. batch_processing_workflow
- **功能：** 批量处理工作流指导
- **参数：** scenario - 场景类型（academic/business/technical）
- **提供：** 分步骤流程、最佳实践、配置示例
- **场景：** 
  - Academic - 学术论文批量处理
  - Business - 商务报告批量转换
  - Technical - 技术文档批量生成

#### 8. troubleshooting_guide
- **功能：** 故障排除指南
- **参数：** errorType - 错误类型（conversion/performance/integration）
- **提供：** 问题诊断、原因分析、解决方案
- **覆盖：**
  - Conversion - 图片、表格、样式等转换问题
  - Performance - 速度、内存等性能问题
  - Integration - MCP连接、Sampling等集成问题

## 🔧 改进内容

### 资源系统
- ✅ 修复了现有资源无法访问的问题
- ✅ 优化了资源响应格式，提升可读性
- ✅ 改进了资源加载性能
- ✅ 新增了辅助函数支持分类管理

### 提示系统
- ✅ 提供场景化的工作流指导
- ✅ 系统化的问题诊断和解决方案
- ✅ 更丰富的交互式提示体验

### 文档更新
- ✅ 更新 README.md，添加所有新资源和提示说明
- ✅ 更新 CHANGELOG.md，详细记录版本变更
- ✅ 新增 ENHANCEMENTS.md，详细说明增强功能
- ✅ 创建完整的测试脚本验证功能

## 📊 版本对比

| 指标 | v3.0.1 | v3.0.2 | 增长 |
|------|--------|--------|------|
| 静态资源 | 3 | 6 | +100% |
| 动态资源模板 | 1 | 4 | +300% |
| 提示模板 | 3 | 5 | +67% |
| 总资源数 | 4 | 10 | +150% |
| 总提示数 | 3 | 5 | +67% |

## 🎯 使用示例

### 查看模板分类
```javascript
const categories = await client.readResource('templates://categories');
console.log(categories);
```

### 获取批处理工作流指导
```javascript
const workflow = await client.getPrompt('batch_processing_workflow', {
  scenario: 'business'
});
```

### 监控批处理任务
```javascript
const status = await client.readResource('batch://my-job/status');
console.log(`进度: ${status.progress.completed}/${status.progress.total}`);
```

### 诊断转换问题
```javascript
const guide = await client.getPrompt('troubleshooting_guide', {
  errorType: 'conversion'
});
```

## 🚀 升级指南

### 从 v3.0.1 升级

1. **更新包版本**
```bash
npm update aigroup-mdtoword-mcp
```

2. **重新构建**
```bash
npm run build
```

3. **验证新功能**
```bash
node tests/test-resources.js
```

### 无破坏性变更
- ✅ 完全向后兼容 v3.0.1
- ✅ 所有现有功能保持不变
- ✅ 仅新增功能，无修改或删除

## 📚 相关文档

- [README.md](README.md) - 完整使用指南
- [CHANGELOG.md](CHANGELOG.md) - 版本变更历史
- [ENHANCEMENTS.md](ENHANCEMENTS.md) - 增强功能详解
- [UPGRADE.md](UPGRADE.md) - 升级指南

## 🎁 亮点功能

### 1️⃣ 资源分类系统
轻松按类别浏览模板，快速找到适合的模板类型。

### 2️⃣ 批处理监控
实时监控批量转换任务，了解进度和失败原因。

### 3️⃣ 文档智能分析
自动分析文档复杂度，提供针对性的优化建议。

### 4️⃣ 场景化工作流
针对学术、商务、技术三种场景的专业处理流程。

### 5️⃣ 系统化故障排除
完整的问题诊断体系，快速定位和解决常见问题。

## 🐛 已知问题

- 无

## 🔮 未来计划

- [ ] PDF 导出支持
- [ ] HTML 导出支持
- [ ] 云存储集成
- [ ] AI 翻译功能
- [ ] 更多预设模板

## 💝 致谢

感谢所有用户的反馈和建议，帮助我们不断改进产品！

## 📞 联系方式

- **问题反馈：** https://github.com/aigroup/aigroup-mdtoword-mcp/issues
- **邮箱：** jackdark425@gmail.com

---

**Enjoy the enhanced features! 🎉**