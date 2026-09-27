import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "hybrid-math-solver", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [{
      name: "verify_linear_system",
      description: "Verifies A·x - b = 0 and detects Claude's averaging hallucination. Fixes x=1, x=2 -> 1.5 bug",
      inputSchema: {
        type: "object",
        properties: {
          A: { type: "array", description: "Matrix A, e.g. [[1,0],[1,0]]" },
          b: { type: "array", description: "Vector b, e.g. [1,2]" },
          proposed_x: { type: "array", description: "Claude's proposed solution to verify" }
        },
        required: ["A", "b"]
      }
    }]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "verify_linear_system") {
    const { A, b, proposed_x } = request.params.arguments;

    // Check for inconsistent system: same row different b
    let isInconsistent = false;
    let reason = "";

    for(let i=0; i<A.length; i++){
      for(let j=i+1; j<A.length; j++){
        if(JSON.stringify(A[i]) === JSON.stringify(A[j]) && b[i]!== b[j]){
          isInconsistent = true;
          reason = `Row ${i} and Row ${j} are identical in A but b[${i}]=${b[i]}!= b[${j}]=${b[j]} -> No solution exists`;
        }
      }
    }

    let verification = null;
    if(proposed_x){
      const residual = A.map((row, i) => {
        const dot = row.reduce((sum, val, k) => sum + val * (proposed_x[k]||0), 0);
        return dot - b[i];
      });
      const maxResidual = Math.max(...residual.map(Math.abs));
      verification = { residual, maxResidual, isValid: maxResidual < 1e-9 };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          isInconsistent,
          reason: isInconsistent? reason : "System may be consistent, needs full check",
          verification,
          fix: isInconsistent? "DO NOT AVERAGE x=1 and x=2 to 1.5. Correct answer: No solution" : "Verification done",
          author: "Faissal Ait Jana - TU Delft"
        }, null, 2)
      }]
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
