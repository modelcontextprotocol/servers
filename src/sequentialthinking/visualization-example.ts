/**
 * Visualization Module for Sequential Thinking
 * 
 * This module demonstrates how visualization capabilities could be added
 * to the Sequential Thinking tool. It provides functions to convert thought
 * processes into various visualization formats.
 */

import { ThoughtData, SessionData } from './types.js';

/**
 * Generates a Mermaid flowchart representation of a thought process
 * @param thoughtHistory Array of thoughts to visualize
 * @param branches Record of branch IDs to branch thoughts
 * @returns Mermaid flowchart diagram as a string
 */
export function generateMermaidFlowchart(
  thoughtHistory: ThoughtData[],
  branches: Record<string, ThoughtData[]>
): string {
  let mermaid = 'flowchart TD\n';
  
  // Add nodes for each thought
  for (const thought of thoughtHistory) {
    const nodeId = `T${thought.thoughtNumber}`;
    let nodeLabel = `Thought ${thought.thoughtNumber}`;
    let nodeStyle = '';
    
    // Style nodes based on thought type
    if (thought.isChainOfThought) {
      if (thought.isHypothesis) {
        nodeStyle = `style T${thought.thoughtNumber} fill:#f9f,stroke:#333,stroke-width:2px`;
        nodeLabel = `Hypothesis ${thought.thoughtNumber}`;
        if (thought.confidenceLevel !== undefined) {
          nodeLabel += `\\nConfidence: ${thought.confidenceLevel}%`;
        }
      } else if (thought.isVerification) {
        nodeStyle = `style T${thought.thoughtNumber} fill:#9ff,stroke:#333,stroke-width:2px`;
        nodeLabel += '\\nVerification';
      } else {
        nodeStyle = `style T${thought.thoughtNumber} fill:#bbf,stroke:#333,stroke-width:1px`;
        nodeLabel += '\\nChain of Thought';
      }
    } else if (thought.isRevision) {
      nodeStyle = `style T${thought.thoughtNumber} fill:#ff9,stroke:#333,stroke-width:1px`;
      nodeLabel += `\\nRevision of T${thought.revisesThought}`;
    }
    
    // Add node to diagram
    mermaid += `    ${nodeId}["${nodeLabel}"]\n`;
    if (nodeStyle) {
      mermaid += `    ${nodeStyle}\n`;
    }
  }
  
  // Add connections between thoughts
  for (let i = 0; i < thoughtHistory.length; i++) {
    const thought = thoughtHistory[i];
    
    // Connect to next thought if not a branch or revision
    if (i < thoughtHistory.length - 1 && 
        !thought.branchFromThought && 
        !thoughtHistory[i + 1].branchFromThought &&
        !thoughtHistory[i + 1].isRevision) {
      mermaid += `    T${thought.thoughtNumber} --> T${thoughtHistory[i + 1].thoughtNumber}\n`;
    }
    
    // Connect revisions to original thoughts
    if (thought.isRevision && thought.revisesThought) {
      mermaid += `    T${thought.revisesThought} -.-> T${thought.thoughtNumber}\n`;
    }
    
    // Connect branches to their origin
    if (thought.branchFromThought) {
      mermaid += `    T${thought.branchFromThought} -.-> T${thought.thoughtNumber}\n`;
    }
    
    // Connect merged branches
    if (thought.mergeBranchId && thought.mergeBranchPoint) {
      mermaid += `    T${thought.thoughtNumber} -.-> T${thought.mergeBranchPoint}\n`;
    }
  }
  
  return mermaid;
}

/**
 * Generates a D3.js compatible JSON representation of a thought process
 * @param thoughtHistory Array of thoughts to visualize
 * @param branches Record of branch IDs to branch thoughts
 * @returns JSON object for D3.js visualization
 */
export function generateD3Json(
  thoughtHistory: ThoughtData[],
  branches: Record<string, ThoughtData[]>
): any {
  const nodes: any[] = [];
  const links: any[] = [];
  
  // Create nodes for each thought
  for (const thought of thoughtHistory) {
    let nodeType = 'thought';
    if (thought.isChainOfThought) {
      if (thought.isHypothesis) {
        nodeType = 'hypothesis';
      } else if (thought.isVerification) {
        nodeType = 'verification';
      } else {
        nodeType = 'chainOfThought';
      }
    } else if (thought.isRevision) {
      nodeType = 'revision';
    } else if (thought.branchFromThought) {
      nodeType = 'branch';
    }
    
    nodes.push({
      id: `T${thought.thoughtNumber}`,
      label: `Thought ${thought.thoughtNumber}`,
      type: nodeType,
      confidence: thought.confidenceLevel,
      branchId: thought.branchId,
      data: thought
    });
  }
  
  // Create links between thoughts
  for (let i = 0; i < thoughtHistory.length; i++) {
    const thought = thoughtHistory[i];
    
    // Connect to next thought if not a branch or revision
    if (i < thoughtHistory.length - 1 && 
        !thought.branchFromThought && 
        !thoughtHistory[i + 1].branchFromThought &&
        !thoughtHistory[i + 1].isRevision) {
      links.push({
        source: `T${thought.thoughtNumber}`,
        target: `T${thoughtHistory[i + 1].thoughtNumber}`,
        type: 'sequence'
      });
    }
    
    // Connect revisions to original thoughts
    if (thought.isRevision && thought.revisesThought) {
      links.push({
        source: `T${thought.revisesThought}`,
        target: `T${thought.thoughtNumber}`,
        type: 'revision'
      });
    }
    
    // Connect branches to their origin
    if (thought.branchFromThought) {
      links.push({
        source: `T${thought.branchFromThought}`,
        target: `T${thought.thoughtNumber}`,
        type: 'branch'
      });
    }
    
    // Connect merged branches
    if (thought.mergeBranchId && thought.mergeBranchPoint) {
      links.push({
        source: `T${thought.thoughtNumber}`,
        target: `T${thought.mergeBranchPoint}`,
        type: 'merge'
      });
    }
  }
  
  return { nodes, links };
}

/**
 * Generates an HTML page with an interactive visualization of a thought process
 * @param sessionData Session data containing thought history and branches
 * @returns HTML string with embedded visualization
 */
export function generateVisualizationHtml(sessionData: SessionData): string {
  const d3Data = generateD3Json(sessionData.thoughtHistory, sessionData.branches);
  const mermaidDiagram = generateMermaidFlowchart(sessionData.thoughtHistory, sessionData.branches);
  
  return `<!DOCTYPE html>
<html>
<head>
  <title>Sequential Thinking Visualization - ${sessionData.name}</title>
  <meta charset="utf-8">
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 20px;
    }
    .container {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .visualization-container {
      border: 1px solid #ccc;
      border-radius: 5px;
      padding: 20px;
    }
    .tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 10px;
    }
    .tab {
      padding: 10px 20px;
      border: 1px solid #ccc;
      border-radius: 5px 5px 0 0;
      cursor: pointer;
    }
    .tab.active {
      background-color: #f0f0f0;
      border-bottom: none;
    }
    .tab-content {
      display: none;
    }
    .tab-content.active {
      display: block;
    }
    #d3-visualization {
      width: 100%;
      height: 600px;
      border: 1px solid #ccc;
    }
    .node {
      cursor: pointer;
    }
    .node circle {
      fill: #fff;
      stroke: #333;
      stroke-width: 1.5px;
    }
    .node text {
      font-size: 12px;
    }
    .link {
      fill: none;
      stroke: #999;
      stroke-width: 1.5px;
    }
    .thought { fill: #bbf; }
    .hypothesis { fill: #f9f; }
    .verification { fill: #9ff; }
    .chainOfThought { fill: #bbf; }
    .revision { fill: #ff9; }
    .branch { fill: #bfb; }
    .details-panel {
      margin-top: 20px;
      padding: 10px;
      border: 1px solid #ccc;
      border-radius: 5px;
      background-color: #f9f9f9;
    }
  </style>
</head>
<body>
  <h1>Sequential Thinking Visualization - ${sessionData.name}</h1>
  <p>Session ID: ${sessionData.id}</p>
  <p>Created: ${new Date(sessionData.createdAt).toLocaleString()}</p>
  <p>Updated: ${new Date(sessionData.updatedAt).toLocaleString()}</p>
  
  <div class="container">
    <div class="tabs">
      <div class="tab active" data-tab="d3">Interactive Graph</div>
      <div class="tab" data-tab="mermaid">Flowchart</div>
    </div>
    
    <div class="visualization-container">
      <div class="tab-content active" id="d3-tab">
        <div id="d3-visualization"></div>
        <div class="details-panel" id="node-details">
          <h3>Click on a node to see details</h3>
        </div>
      </div>
      
      <div class="tab-content" id="mermaid-tab">
        <div class="mermaid">
${mermaidDiagram}
        </div>
      </div>
    </div>
  </div>
  
  <script>
    // Initialize mermaid
    mermaid.initialize({ startOnLoad: true });
    
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab + '-tab').classList.add('active');
      });
    });
    
    // D3.js visualization
    const data = ${JSON.stringify(d3Data)};
    
    const width = document.getElementById('d3-visualization').clientWidth;
    const height = document.getElementById('d3-visualization').clientHeight;
    
    const svg = d3.select('#d3-visualization')
      .append('svg')
      .attr('width', width)
      .attr('height', height);
    
    const simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(data.links).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2));
    
    const link = svg.append('g')
      .selectAll('line')
      .data(data.links)
      .enter().append('line')
      .attr('class', 'link')
      .attr('stroke-dasharray', d => d.type === 'sequence' ? '0' : '5,5')
      .attr('stroke', d => {
        switch(d.type) {
          case 'revision': return '#f90';
          case 'branch': return '#090';
          case 'merge': return '#909';
          default: return '#999';
        }
      });
    
    const node = svg.append('g')
      .selectAll('.node')
      .data(data.nodes)
      .enter().append('g')
      .attr('class', 'node')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));
    
    node.append('circle')
      .attr('r', d => d.confidence ? 10 + (d.confidence / 10) : 10)
      .attr('class', d => d.type);
    
    node.append('text')
      .attr('dx', 12)
      .attr('dy', '.35em')
      .text(d => d.label);
    
    node.on('click', showNodeDetails);
    
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      
      node
        .attr('transform', d => \`translate(\${d.x},\${d.y})\`);
    });
    
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    
    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }
    
    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
    
    function showNodeDetails(event, d) {
      const detailsPanel = document.getElementById('node-details');
      const thought = d.data;
      
      let html = \`<h3>\${d.label}</h3>\`;
      html += \`<p><strong>Type:</strong> \${d.type}</p>\`;
      html += \`<p><strong>Thought:</strong> \${thought.thought}</p>\`;
      
      if (thought.confidenceLevel !== undefined) {
        html += \`<p><strong>Confidence:</strong> \${thought.confidenceLevel}%</p>\`;
      }
      
      if (thought.branchId) {
        html += \`<p><strong>Branch ID:</strong> \${thought.branchId}</p>\`;
      }
      
      if (thought.isRevision && thought.revisesThought) {
        html += \`<p><strong>Revises Thought:</strong> \${thought.revisesThought}</p>\`;
      }
      
      if (thought.branchFromThought) {
        html += \`<p><strong>Branches From:</strong> \${thought.branchFromThought}</p>\`;
      }
      
      if (thought.validationStatus) {
        html += \`<p><strong>Validation Status:</strong> \${thought.validationStatus}</p>\`;
      }
      
      if (thought.validationReason) {
        html += \`<p><strong>Validation Reason:</strong> \${thought.validationReason}</p>\`;
      }
      
      detailsPanel.innerHTML = html;
    }
  </script>
</body>
</html>`;
}
