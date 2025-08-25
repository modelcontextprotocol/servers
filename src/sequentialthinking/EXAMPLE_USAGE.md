# Example: Architectural Decision Analysis

This example demonstrates the decision tree visualization tool in action during a technical architecture decision process.

## Scenario: Database Selection for a New Application

### Step 1: Initial thoughts with the Sequential Thinking tool

```json
[
  {
    "thought": "I need to choose between SQL and NoSQL database for our new user management system",
    "thoughtNumber": 1,
    "totalThoughts": 6,
    "nextThoughtNeeded": true,
    "confidence": 0.3,
    "tags": ["database", "architecture", "decision"],
    "evidence": ["Application requirements documented"],
    "assumptions": ["Team has experience with both", "Performance is critical"]
  },
  {
    "thought": "Let me analyze our data structure - user profiles, settings, audit logs",
    "thoughtNumber": 2,
    "totalThoughts": 6,
    "nextThoughtNeeded": true,
    "confidence": 0.8,
    "tags": ["analysis", "data-structure"],
    "evidence": ["Data model requirements", "Relationship analysis complete", "Query patterns identified"],
    "assumptions": ["Data structure is well-defined"],
    "references": [1]
  },
  {
    "thought": "PostgreSQL seems ideal - ACID compliance for user data, JSON support for flexible fields",
    "thoughtNumber": 3,
    "totalThoughts": 6,
    "nextThoughtNeeded": true,
    "confidence": 0.85,
    "tags": ["postgresql", "sql", "recommendation"],
    "evidence": ["ACID compliance matches requirements", "JSON support available", "Strong consistency guarantees"],
    "assumptions": ["Team can handle SQL complexity"],
    "references": [2]
  },
  {
    "thought": "But what about MongoDB for the flexible user metadata and fast reads?",
    "thoughtNumber": 4,
    "totalThoughts": 6,
    "nextThoughtNeeded": true,
    "confidence": 0.6,
    "tags": ["mongodb", "nosql", "alternative"],
    "evidence": ["Document model fits user profiles", "Horizontal scaling potential"],
    "assumptions": ["Eventual consistency is acceptable", "Schema flexibility needed"],
    "references": [2],
    "branchFromThought": 2,
    "branchId": "nosql-branch"
  },
  {
    "thought": "Actually, the ACID requirements for financial data rule out MongoDB",
    "thoughtNumber": 5,
    "totalThoughts": 6,
    "nextThoughtNeeded": true,
    "confidence": 0.9,
    "tags": ["constraint", "financial-data", "acid"],
    "evidence": ["Financial audit requirements", "Regulatory compliance needs", "Strong consistency critical"],
    "assumptions": [],
    "references": [3, 4]
  },
  {
    "thought": "Final decision: PostgreSQL with JSON columns for the best of both worlds",
    "thoughtNumber": 6,
    "totalThoughts": 6,
    "nextThoughtNeeded": false,
    "confidence": 0.95,
    "tags": ["final-decision", "postgresql", "hybrid-approach"],
    "evidence": ["ACID compliance", "JSON flexibility", "Team expertise", "Mature ecosystem"],
    "assumptions": ["Performance requirements can be met"],
    "references": [3, 5]
  }
]
```

### Step 2: Generate the decision tree visualization

```json
{
  "name": "visualize_decision_tree",
  "arguments": {
    "outputFormat": "both",
    "showEvidence": true
  }
}
```

### Step 3: Visualization Output

```
Decision Tree Visualization
══════════════════════════════════════════════════
├── [1] ░░░ 🔶 I need to choose between SQL and NoSQL... (30%) [database, architecture, decision] +1E -2A
│   └── [2] ███ Let me analyze our data structure... (80%) [analysis, data-structure] +3E -1A
│       ├── [3] ███ ⭐ PostgreSQL seems ideal - ACID com... (85%) [postgresql, sql, recommendation] +3E -1A
│       │   └── [5] ███ ⭐ Actually, the ACID requirements... (90%) [constraint, financial-data, acid] +3E
│       │       └── [6] ███ ⭐ Final decision: PostgreSQL with... (95%) [final-decision, postgresql, hybrid-approach] +4E -1A
│       └── [4] ██░ 🔶 But what about MongoDB for the flex... (60%) [mongodb, nosql, alternative] +2E -2A
──────────────────────────────────────────────────
Decision Points: 2 | Critical Path: 1→2→3→5→6 | Avg Confidence: 0.73
Depth: 4 | Breadth: 1.2 | Low Confidence: 1 | Evidence Gaps: 0
```

### Step 4: Analysis with confidence filtering

To focus on the uncertain areas:

```json
{
  "name": "visualize_decision_tree",
  "arguments": {
    "confidenceThreshold": 0.5,
    "outputFormat": "ascii"
  }
}
```

Output:
```
Decision Tree Visualization
══════════════════════════════════════════════════
├── [2] ███ Let me analyze our data structure... (80%) [analysis, data-structure] +3E -1A
│   ├── [3] ███ ⭐ PostgreSQL seems ideal - ACID com... (85%) [postgresql, sql, recommendation] +3E -1A
│   │   └── [5] ███ ⭐ Actually, the ACID requirements... (90%) [constraint, financial-data, acid] +3E
│   │       └── [6] ███ ⭐ Final decision: PostgreSQL with... (95%) [final-decision, postgresql, hybrid-approach] +4E -1A
│   └── [4] ██░ 🔶 But what about MongoDB for the flex... (60%) [mongodb, nosql, alternative] +2E -2A
──────────────────────────────────────────────────
Decision Points: 1 | Critical Path: 2→3→5→6 | Avg Confidence: 0.84
Depth: 4 | Breadth: 1.2 | Low Confidence: 0 | Evidence Gaps: 0
```

### Step 5: Focus on the alternative branch

```json
{
  "name": "visualize_decision_tree",
  "arguments": {
    "focusBranch": "nosql-branch",
    "outputFormat": "ascii"
  }
}
```

Output:
```
Decision Tree Visualization
══════════════════════════════════════════════════
└── [4] ██░ 🔶 But what about MongoDB for the flex... (60%) [mongodb, nosql, alternative] +2E -2A
──────────────────────────────────────────────────
Decision Points: 1 | Critical Path: 4 | Avg Confidence: 0.60
Depth: 1 | Breadth: 1 | Low Confidence: 1 | Evidence Gaps: 0
```

## Key Insights from the Visualization

1. **Clear Decision Path**: The critical path (1→2→3→5→6) shows the main reasoning flow with increasing confidence
2. **Decision Points**: Two key decision points identified - the initial database choice (thought 1) and the MongoDB alternative consideration (thought 4)
3. **Confidence Growth**: Confidence increases along the critical path from 30% to 95%
4. **Evidence Quality**: No evidence gaps, with good supporting data throughout
5. **Branch Analysis**: The MongoDB alternative (thought 4) remains at medium confidence with assumption risks
6. **Resolution**: The constraint discovery in thought 5 effectively resolves the decision with high confidence

## Benefits of Tree Visualization

- **Pattern Recognition**: Easily see how confidence builds through the reasoning process
- **Decision Tracking**: Clearly identify where choices were made and alternatives considered  
- **Quality Assessment**: Evidence gaps and assumption risks are immediately visible
- **Critical Path Analysis**: Focus on the strongest reasoning chain for final decisions
- **Branch Exploration**: Examine alternative paths that were considered but not pursued

This visualization transforms a sequential list of thoughts into an intuitive tree structure that reveals the underlying decision-making process and helps validate the reasoning quality.