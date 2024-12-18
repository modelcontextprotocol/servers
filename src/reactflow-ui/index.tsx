import React, { useState, useCallback } from 'react';
import ReactFlow, { addEdge, Background, Controls, MiniMap, ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import './styles.css';
import Sidebar from './Sidebar';
import Node from './Node';
import { nodeTypes, initialNodes, initialEdges } from './NodeSpecification';

const ReactFlowUI = () => {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);

  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    []
  );

  const generateMCPCode = () => {
    // Logic to generate MCP server code based on nodes and edges
    console.log('Generating MCP code...');
  };

  return (
    <div className="reactflow-ui">
      <ReactFlowProvider>
        <div className="reactflow-wrapper">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
          >
            <MiniMap />
            <Controls />
            <Background />
          </ReactFlow>
        </div>
        <Sidebar generateMCPCode={generateMCPCode} />
      </ReactFlowProvider>
    </div>
  );
};

export default ReactFlowUI;
