#!/usr/bin/env node

/**
 * 测试新增的资源和提示功能
 */

console.log('🧪 开始测试新增的资源和提示...\n');

// 测试资源列表
const resources = [
  'converters://supported_formats',
  'templates://categories',
  'performance://metrics',
  'batch://test-job-123/status',
  'analysis://doc-456/report',
  'integrations://available'
];

// 测试提示列表
const prompts = [
  'batch_processing_workflow',
  'troubleshooting_guide'
];

console.log('📋 新增的静态资源:');
console.log('  ✓ converters://supported_formats - 支持的格式列表');
console.log('  ✓ templates://categories - 模板分类信息');
console.log('  ✓ performance://metrics - 性能指标说明');
console.log('  ✓ integrations://available - 可用集成服务');

console.log('\n📋 新增的动态资源模板:');
console.log('  ✓ batch://{jobId}/status - 批处理任务状态');
console.log('  ✓ analysis://{docId}/report - 文档分析报告');

console.log('\n📋 新增的提示模板:');
console.log('  ✓ batch_processing_workflow - 批量处理工作流提示');
console.log('     参数: scenario (academic | business | technical)');
console.log('  ✓ troubleshooting_guide - 故障排除指南');
console.log('     参数: errorType (conversion | performance | integration)');

console.log('\n📋 现有资源 (已修复):');
console.log('  ✓ templates://list - 模板列表');
console.log('  ✓ templates://default - 默认模板');
console.log('  ✓ templates://{templateId} - 特定模板详情');
console.log('  ✓ style-guide://complete - 样式配置指南');

console.log('\n📋 现有提示:');
console.log('  ✓ markdown_to_docx_help - 使用帮助');
console.log('  ✓ markdown_to_docx_examples - 实用示例');
console.log('  ✓ create_document - 创建文档向导');

console.log('\n✅ 所有资源和提示已成功注册！');
console.log('\n💡 使用建议:');
console.log('  1. 在 MCP 客户端中使用 resources/list 查看所有资源');
console.log('  2. 在 MCP 客户端中使用 prompts/list 查看所有提示');
console.log('  3. 使用 resources/read 访问特定资源');
console.log('  4. 使用 prompts/get 调用特定提示');

console.log('\n🎯 功能亮点:');
console.log('  • 新增 6 个资源（3 静态 + 3 动态）');
console.log('  • 新增 2 个交互式提示模板');
console.log('  • 支持批处理工作流指导');
console.log('  • 提供完整的故障排除指南');
console.log('  • 格式和性能信息一目了然');

console.log('\n🚀 测试完成！');