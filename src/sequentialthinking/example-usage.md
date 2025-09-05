# Sequential Thinking with Multi-Modal Attachments - Example Usage

This document demonstrates the enhanced Sequential Thinking MCP server with multi-modal attachment support.

## Basic Usage

### 1. Start a Reasoning Session

```json
{
  "tool": "sequentialthinking",
  "arguments": {
    "thought": "I need to design a fraud detection system for financial transactions",
    "thoughtNumber": 1,
    "totalThoughts": 5,
    "nextThoughtNeeded": true,
    "confidence": 0.7,
    "tags": ["design", "fraud-detection", "system-architecture"],
    "evidence": ["Industry best practices", "Previous experience with ML systems"]
  }
}
```

### 2. Add a System Architecture Diagram

```json
{
  "tool": "add_attachment",
  "arguments": {
    "thoughtNumber": 1,
    "attachment": {
      "type": "diagram",
      "name": "Fraud Detection System Architecture",
      "content": "┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐\n│   Transaction   │───▶│   ML Pipeline    │───▶│   Risk Score    │\n│   Ingestion     │    │   (Real-time)    │    │   Output        │\n└─────────────────┘    └──────────────────┘    └─────────────────┘\n         │                       │                       │\n         ▼                       ▼                       ▼\n┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐\n│   Data Store    │    │   Feature Store  │    │   Alert System  │\n│   (Events)      │    │   (ML Features)  │    │   (Notifications)│\n└─────────────────┘    └──────────────────┘    └─────────────────┘",
      "metadata": {
        "format": "ascii",
        "description": "High-level system architecture showing data flow"
      }
    }
  }
}
```

### 3. Continue with Technical Implementation

```json
{
  "tool": "sequentialthinking",
  "arguments": {
    "thought": "Now I'll implement the core ML model for fraud detection using ensemble methods",
    "thoughtNumber": 2,
    "totalThoughts": 5,
    "nextThoughtNeeded": true,
    "references": [1],
    "confidence": 0.8,
    "tags": ["machine-learning", "implementation", "fraud-detection"],
    "evidence": ["Research papers on ensemble methods", "Similar implementations in production"]
  }
}
```

### 4. Add Code Implementation

```json
{
  "tool": "add_attachment",
  "arguments": {
    "thoughtNumber": 2,
    "attachment": {
      "type": "code",
      "name": "Fraud Detection Model",
      "content": "import numpy as np\nfrom sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier\nfrom sklearn.linear_model import LogisticRegression\nfrom sklearn.preprocessing import StandardScaler\n\nclass FraudDetectionEnsemble:\n    def __init__(self):\n        self.models = {\n            'rf': RandomForestClassifier(n_estimators=100, random_state=42),\n            'gb': GradientBoostingClassifier(n_estimators=100, random_state=42),\n            'lr': LogisticRegression(random_state=42)\n        }\n        self.scaler = StandardScaler()\n        self.weights = {'rf': 0.4, 'gb': 0.4, 'lr': 0.2}\n    \n    def fit(self, X, y):\n        X_scaled = self.scaler.fit_transform(X)\n        for model in self.models.values():\n            model.fit(X_scaled, y)\n    \n    def predict_proba(self, X):\n        X_scaled = self.scaler.transform(X)\n        predictions = {}\n        \n        for name, model in self.models.items():\n            predictions[name] = model.predict_proba(X)[:, 1]\n        \n        # Weighted ensemble prediction\n        ensemble_pred = np.zeros(len(X))\n        for name, pred in predictions.items():\n            ensemble_pred += self.weights[name] * pred\n        \n        return ensemble_pred\n    \n    def predict(self, X, threshold=0.5):\n        proba = self.predict_proba(X)\n        return (proba >= threshold).astype(int)",
      "metadata": {
        "language": "python",
        "description": "Ensemble fraud detection model implementation",
        "complexity": 45
      }
    }
  }
}
```

### 5. Add Training Data Schema

```json
{
  "tool": "add_attachment",
  "arguments": {
    "thoughtNumber": 2,
    "attachment": {
      "type": "json",
      "name": "Training Data Schema",
      "content": {
        "transaction_features": {
          "amount": {
            "type": "number",
            "description": "Transaction amount in USD",
            "range": [0.01, 100000]
          },
          "merchant_category": {
            "type": "string",
            "description": "Merchant category code",
            "categories": ["grocery", "gas", "retail", "restaurant", "online"]
          },
          "time_of_day": {
            "type": "integer",
            "description": "Hour of day (0-23)",
            "range": [0, 23]
          },
          "day_of_week": {
            "type": "integer", 
            "description": "Day of week (0-6, Monday=0)",
            "range": [0, 6]
          },
          "location_risk_score": {
            "type": "number",
            "description": "Risk score for transaction location",
            "range": [0.0, 1.0]
          }
        },
        "target": {
          "is_fraud": {
            "type": "boolean",
            "description": "True if transaction is fraudulent"
          }
        }
      },
      "metadata": {
        "schema": "JSON Schema v7",
        "description": "Schema for fraud detection training data"
      }
    }
  }
}
```

### 6. Search for Code Attachments

```json
{
  "tool": "search_attachments",
  "arguments": {
    "query": "ensemble",
    "types": ["code"],
    "includeContent": true,
    "maxResults": 10
  }
}
```

### 7. Get All Attachments for a Thought

```json
{
  "tool": "get_attachments",
  "arguments": {
    "thoughtNumber": 2,
    "type": "code"
  }
}
```

### 8. Complete Analysis and Synthesize

```json
{
  "tool": "sequentialthinking",
  "arguments": {
    "thought": "The fraud detection system is now complete with architecture, implementation, and data schema. Ready for deployment.",
    "thoughtNumber": 5,
    "totalThoughts": 5,
    "nextThoughtNeeded": false,
    "references": [1, 2],
    "confidence": 0.9,
    "tags": ["completion", "deployment-ready"],
    "evidence": ["Complete implementation", "Architecture diagram", "Data schema defined"]
  }
}
```

### 9. Generate Comprehensive Synthesis

```json
{
  "tool": "synthesizeThoughts",
  "arguments": {}
}
```

## Expected Benefits

The enhanced Sequential Thinking server with multi-modal attachments provides:

1. **Rich Context**: Visual diagrams and code examples make reasoning more concrete
2. **Better Documentation**: Attachments serve as evidence and reference materials  
3. **Enhanced Analysis**: Synthesis includes analysis of code complexity, diagram types, and data structures
4. **Improved Confidence**: Evidence-based attachments boost confidence scores
5. **Cross-Reference Capabilities**: Find related thoughts through attachment content
6. **Multi-Modal Search**: Search across text, code, diagrams, and structured data

## Attachment Types Supported

- **code**: Programming code with language detection and complexity analysis
- **diagram**: ASCII diagrams for system architecture and flow charts
- **image**: Base64-encoded images with metadata extraction
- **json**: JSON data with schema validation and structure analysis  
- **table**: CSV/TSV tabular data with format detection
- **file**: File references with metadata
- **url**: Web links and references
- **text**: Plain text documents
- **markdown**: Rich text with markdown formatting
- **yaml**: YAML configuration files
- **xml**: XML data with structure validation

Each attachment type is processed with specialized handlers that extract relevant metadata, perform validation, and enable intelligent search and analysis.