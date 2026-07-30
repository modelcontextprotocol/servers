# 🔬 MCP Advanced Data Profiler Server

> An MCP server that empowers AI agents with advanced data profiling, data quality analysis, and statistical outlier detection capabilities for CSV datasets.

---

## 📌 Overview

**MCP Advanced Data Profiler Server** is a data analysis server built on the [Model Context Protocol (MCP)](https://modelcontextprotocol.io) standard. It connects to AI clients such as Claude Desktop and integrates CSV analysis workflows — including missing value detection, column type inspection, and IQR-based outlier detection — directly into AI agent pipelines.

---

## 🛠️ Tools

### 1. `analyze_data_quality`

Analyzes a CSV file and produces a comprehensive data quality report.

| Output | Description |
|---|---|
| Total rows & columns | Overall dataset dimensions |
| Column data types | `int`, `float`, `object`, etc. |
| Missing value count & percentage | Reported per column |

**Example prompt:**
```
"Generate a quality report for sales_data.csv"
```

---

### 2. `find_outliers_iqr`

Detects statistical outliers in a specified numerical column using the **Interquartile Range (IQR)** method.

| Output | Description |
|---|---|
| Lower & upper bounds | `Q1 - 1.5×IQR` and `Q3 + 1.5×IQR` |
| Outlier count & percentage | Share of outliers within total data |
| Sample outlier values | Preview of the first few detected values |

**Example prompt:**
```
"Find outliers in the revenue column using the IQR method"
```

---

## 🚀 Installation

### Requirements

- Python 3.10+
- `mcp` library

```bash
pip install mcp
```

### Running the Server

```bash
python -m mcp run src/benim-mcp-sunucum/server.py
```

---

## ⚙️ Configuration

To use this server with Claude Desktop or any MCP-compatible client, add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "data-profiler": {
      "command": "python",
      "args": [
        "-m",
        "mcp",
        "run",
        "src/benim-mcp-sunucum/server.py"
      ]
    }
  }
}
```

> 💡 Config file location:
> - **macOS / Linux:** `~/.config/claude/claude_desktop_config.json`
> - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

---

## 📁 Project Structure

```
benim-mcp-sunucum/
├── src/
│   └── benim-mcp-sunucum/
│       └── server.py           # MCP tool definitions and business logic
├── claude_desktop_config.json  # Example client configuration
├── requirements.txt
└── README.md
```

---

## 📄 License

MIT License — See `LICENSE` for details.

---

<div align="center">
  <sub>Built with Model Context Protocol · Python · Claude Desktop</sub>
</div>