import React from 'react';

const Sidebar = ({ generateMCPCode }) => {
  return (
    <div className="sidebar">
      <h2>Available Nodes</h2>
      <div className="node-list">
        {/* List of available nodes and tools */}
      </div>
      <button onClick={generateMCPCode}>Generate MCP Code</button>
    </div>
  );
};

export default Sidebar;
