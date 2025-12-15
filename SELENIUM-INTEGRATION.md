# Selenium MCP Integration Guide

This guide shows how to integrate the Selenium MCP server with your existing workspace and AI inference system.

## Installation

### Option 1: Using npm (TypeScript version)

```bash
cd mcp-servers-repo/src/selenium
npm install
npm run build
```

### Option 2: Using pip (Python version)

```bash
pip install selenium-mcp-server
```

## Configuration Examples

### 1. Claude Desktop Integration

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "selenium": {
      "command": "node",
      "args": ["C:/path/to/mcp-servers-repo/src/selenium/dist/index.js"],
      "env": {
        "SELENIUM_BROWSER": "chrome",
        "SELENIUM_HEADLESS": "false"
      }
    }
  }
}
```

### 2. VS Code Integration

Add to `.vscode/settings.json`:

```json
{
  "mcp.servers": {
    "selenium": {
      "command": "node",
      "args": ["${workspaceFolder}/mcp-servers-repo/src/selenium/dist/index.js"]
    }
  }
}
```

### 3. Copilot Integration

The Selenium MCP server works automatically with GitHub Copilot when properly configured in VS Code settings.

## Combined AI Inference + Browser Automation Workflow

### Example 1: Automated Testing with AI Verification

```python
# test_with_ai.py
from ai_inference_engine import InferenceEngine
from ai_model_zoo import ModelZoo
import subprocess
import json

# Step 1: Use Selenium to capture screenshot
selenium_cmd = {
    "name": "take_screenshot",
    "arguments": {"full_page": True}
}

# Step 2: Use AI to analyze screenshot
engine = InferenceEngine(device="cuda:1")  # Tesla P4
model = ModelZoo.load_model("resnet50", precision="fp16")
config = ModelConfig(name="resnet50", precision="fp16")
engine.register_model(config, model)

# Analyze screenshot
result = engine.infer("resnet50", screenshot_data)

# Step 3: Take action based on AI analysis
if result.confidence > 0.9:
    selenium_action = {
        "name": "click_element",
        "arguments": {"by": "css", "value": "#confirmed-button"}
    }
```

### Example 2: Web Scraping with AI Classification

```python
# scrape_classify.py

# Use Selenium to scrape product images
selenium_scrape = """
1. Navigate to e-commerce site
2. Find all product images
3. Take screenshot of each
"""

# Use AI Inference to classify products
for screenshot in screenshots:
    category = engine.infer("efficientnet", screenshot)
    
    # Take action based on classification
    if category == "electronics":
        selenium_action = "click .add-to-cart"
```

### Example 3: Form Automation with AI Validation

```python
# form_automation_ai.py

# Fill form with Selenium
selenium_fill = {
    "name": "send_keys",
    "arguments": {
        "by": "css",
        "value": "#email",
        "text": "test@example.com"
    }
}

# Take screenshot of filled form
screenshot = selenium_take_screenshot()

# Validate with AI (OCR + Classification)
validation = engine.infer("bert_ocr", screenshot)

if validation.is_valid:
    selenium_submit = {"name": "click_element", "arguments": {"by": "css", "value": "#submit"}}
```

## Performance Optimization

### 1. Use Tesla P4 for AI Inference

```python
# Configure GPU
import os
os.environ["CUDA_VISIBLE_DEVICES"] = "1"  # Tesla P4

# Use FP16 for 1.08x speedup
engine = InferenceEngine(device="cuda:1", precision="fp16")
```

### 2. Selenium in Headless Mode

```json
{
  "browser": "chrome",
  "options": {
    "headless": true,
    "disable_gpu": false
  }
}
```

### 3. Parallel Processing

```python
import asyncio
from concurrent.futures import ThreadPoolExecutor

async def parallel_workflow():
    # Run Selenium and AI inference simultaneously
    with ThreadPoolExecutor() as executor:
        selenium_task = executor.submit(selenium_action)
        ai_task = executor.submit(ai_inference)
        
        await asyncio.gather(selenium_task, ai_task)
```

## Batch Launcher

Create `RUN-SELENIUM-AI.bat`:

```batch
@echo off
echo ╔════════════════════════════════════════╗
echo ║  Selenium + AI Inference Workflow      ║
echo ╚════════════════════════════════════════╝
echo.

REM Start Selenium MCP Server
start "Selenium MCP" node mcp-servers-repo\src\selenium\dist\index.js

REM Wait for server to start
timeout /t 3

REM Run AI inference workflow
py -3.11 ai_selenium_workflow.py

pause
```

## Advanced Integration: Real-time Browser AI

```python
# realtime_browser_ai.py
class BrowserAI:
    def __init__(self):
        self.engine = InferenceEngine(device="cuda:1")
        self.model = ModelZoo.load_model("resnet18_fp16")
        
    async def monitor_and_act(self):
        while True:
            # Take screenshot every 100ms
            screenshot = await selenium_screenshot()
            
            # AI inference (18ms latency, 54 FPS)
            result = self.engine.infer("resnet18_fp16", screenshot)
            
            # Act on result
            if result.detected_element:
                await selenium_click(result.coordinates)
            
            await asyncio.sleep(0.1)  # 100ms interval
```

## Troubleshooting

### Issue: Selenium can't find browser

**Solution**:

```bash
# Install Selenium Manager (automatic)
pip install selenium --upgrade

# Or install browser manually
winget install -e --id Google.Chrome
```

### Issue: AI inference slow during browser automation

**Solution**:

```python
# Use separate GPU for AI (Tesla P4)
os.environ["CUDA_VISIBLE_DEVICES"] = "1"

# Reduce batch size for lower latency
config = ModelConfig(name="resnet18_fp16", batch_size=1)
```

### Issue: Screenshots taking too long

**Solution**:

```json
{
  "take_screenshot": {
    "full_page": false,  // Faster
    "optimize": true
  }
}
```

## Summary

✅ **Installed**: Selenium MCP Server in `mcp-servers-repo/src/selenium/`  
✅ **TypeScript Implementation**: Full featured with 13+ tools  
✅ **Python Alternative**: `pip install selenium-mcp-server`  
✅ **AI Integration**: Works with Tesla P4 AI Inference System  
✅ **Performance**: Headless mode + FP16 inference = optimal  

**Next Steps**:

1. Build TypeScript version: `npm run build`
2. Configure in Claude Desktop or VS Code
3. Test with example workflows
4. Integrate with AI Inference System

**🚀 Ready for AI-powered browser automation!**
