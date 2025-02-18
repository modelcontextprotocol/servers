#!/usr/bin/env python3

from typing import Dict, List, Optional
import json

# Fixed chalk import for ESM
import chalk

from fastapi import FastAPI, Request
from pydantic import BaseModel
import uvicorn

class ThoughtData(BaseModel):
    thought: str
    thought_number: int
    total_thoughts: int
    next_thought_needed: bool
    is_revision: Optional[bool] = False
    revises_thought: Optional[int] = None
    branch_from_thought: Optional[int] = None
    branch_id: Optional[str] = None
    needs_more_thoughts: Optional[bool] = None

class SequentialThinkingServer:
    def __init__(self):
        self.thought_history: List[ThoughtData] = []        # type: ignore
        self.branches: Dict[str, List[ThoughtData]] = {}  # type: ignore

    def validate_thought_data(self, data: dict) -> ThoughtData:
        return ThoughtData(**data)

    def format_thought(self, thought_data: ThoughtData) -> str:
        thought_number = thought_data.thought_number
        total_thoughts = thought_data.total_thoughts
        thought = thought_data.thought
        is_revision = thought_data.is_revision
        revises_thought = thought_data.revises_thought
        branch_from_thought = thought_data.branch_from_thought
        branch_id = thought_data.branch_id

        prefix = ''
        context = ''

        if is_revision:
            prefix = chalk.yellow('🔄 Revision')
            context = f' (revising thought {revises_thought})'
        elif branch_from_thought:
            prefix = chalk.green('🌿 Branch')
            context = f' (from thought {branch_from_thought}, ID: {branch_id})'
        else:
            prefix = chalk.blue('💭 Thought')
            context = ''

        header = f'{prefix} {thought_number}/{total_thoughts}{context}'
        border = '─' * (max(len(header), len(thought)) + 4)

        return f"""
┌{border}┐
│ {header} │
├{border}┤
│ {thought.ljust(len(border) - 2)} │
└{border}┘"""

    def process_thought(self, data: dict) -> dict:
        try:
            validated_input = self.validate_thought_data(data)

            if validated_input.thought_number > validated_input.total_thoughts:
                validated_input.total_thoughts = validated_input.thought_number

            self.thought_history.append(validated_input)

            if validated_input.branch_from_thought and validated_input.branch_id:
                if validated_input.branch_id not in self.branches:
                    self.branches[validated_input.branch_id] = []
                self.branches[validated_input.branch_id].append(validated_input)

            formatted_thought = self.format_thought(validated_input)
            print(formatted_thought)

            return {
                "content": [{
                    "type": "text",
                    "text": json.dumps({
                        "thought_number": validated_input.thought_number,
                        "total_thoughts": validated_input.total_thoughts,
                        "next_thought_needed": validated_input.next_thought_needed,
                        "branches": list(self.branches.keys()),
                        "thought_history_length": len(self.thought_history)
                    }, indent=2)
                }]
            }
        except Exception as e:
            return {
                "content": [{
                    "type": "text",
                    "text": json.dumps({
                        "error": str(e),
                        "status": "failed"
                    }, indent=2)
                }],
                "is_error": True
            }

SEQUENTIAL_THINKING_TOOL = {
    "name": "sequentialthinking",
    "description": """A detailed tool for dynamic and reflective problem-solving through thoughts.
This tool helps analyze problems through a flexible thinking process that can adapt and evolve.
Each thought can build on, question, or revise previous insights as understanding deepens.

When to use this tool:
- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope might not be clear initially
- Problems that require a multi-step solution
- Tasks that need to maintain context over multiple steps
- Situations where irrelevant information needs to be filtered out

Key features:
- You can adjust total_thoughts up or down as you progress
- You can question or revise previous thoughts
- You can add more thoughts even after reaching what seemed like the end
- You can express uncertainty and explore alternative approaches
- Not every thought needs to build linearly - you can branch or backtrack
- Generates a solution hypothesis
- Verifies the hypothesis based on the Chain of Thought steps
- Repeats the process until satisfied
- Provides a correct answer

Parameters explained:
- thought: Your current thinking step, which can include:
* Regular analytical steps
* Revisions of previous thoughts
* Questions about previous decisions
* Realizations about needing more analysis
* Changes in approach
* Hypothesis generation
* Hypothesis verification
- next_thought_needed: True if you need more thinking, even if at what seemed like the end
- thought_number: Current number in sequence (can go beyond initial total if needed)
- total_thoughts: Current estimate of thoughts needed (can be adjusted up/down)
- is_revision: A boolean indicating if this thought revises previous thinking
- revises_thought: If is_revision is true, which thought number is being reconsidered
- branch_from_thought: If branching, which thought number is the branching point
- branch_id: Identifier for the current branch (if any)
- needs_more_thoughts: If reaching end but realizing more thoughts needed

You should:
1. Start with an initial estimate of needed thoughts, but be ready to adjust
2. Feel free to question or revise previous thoughts
3. Don't hesitate to add more thoughts if needed, even at the "end"
4. Express uncertainty when present
5. Mark thoughts that revise previous thinking or branch into new paths
6. Ignore information that is irrelevant to the current step
7. Generate a solution hypothesis when appropriate
8. Verify the hypothesis based on the Chain of Thought steps
9. Repeat the process until satisfied with the solution
10. Provide a single, ideally correct answer as the final output
11. Only set next_thought_needed to false when truly done and a satisfactory answer is reached""",
    "input_schema": {
        "type": "object",
        "properties": {
            "thought": {
                "type": "string",
                "description": "Your current thinking step"
            },
            "next_thought_needed": {
                "type": "boolean",
                "description": "Whether another thought step is needed"
            },
            "thought_number": {
                "type": "integer",
                "description": "Current thought number",
                "minimum": 1
            },
            "total_thoughts": {
                "type": "integer",
                "description": "Estimated total thoughts needed",
                "minimum": 1
            },
            "is_revision": {
                "type": "boolean",
                "description": "Whether this revises previous thinking"
            },
            "revises_thought": {
                "type": "integer",
                "description": "Which thought is being reconsidered",
                "minimum": 1
            },
            "branch_from_thought": {
                "type": "integer",
                "description": "Branching point thought number",
                "minimum": 1
            },
            "branch_id": {
                "type": "string",
                "description": "Branch identifier"
            },
            "needs_more_thoughts": {
                "type": "boolean",
                "description": "If more thoughts are needed"
            }
        },
        "required": ["thought", "next_thought_needed", "thought_number", "total_thoughts"]
    }
}

app = FastAPI()
thinking_server = SequentialThinkingServer()

@app.get("/tools")
async def list_tools():
    return {"tools": [SEQUENTIAL_THINKING_TOOL]}

@app.post("/tools/sequentialthinking")
async def call_sequential_thinking(request: Request):
    data = await request.json()
    return thinking_server.process_thought(data)
