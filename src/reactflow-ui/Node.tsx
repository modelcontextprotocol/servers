import React from 'react';
import { Handle, Position } from 'reactflow';

const Node = ({ data }) => {
  return (
    <div className="node">
      <div className="node-label">{data.label}</div>
      {data.inputs.map((input, index) => (
        <Handle
          key={`input-${index}`}
          type="target"
          position={Position.Top}
          id={`input-${index}`}
          style={{ top: 10 + index * 20 }}
        />
      ))}
      {data.outputs.map((output, index) => (
        <Handle
          key={`output-${index}`}
          type="source"
          position={Position.Bottom}
          id={`output-${index}`}
          style={{ bottom: 10 + index * 20 }}
        />
      ))}
    </div>
  );
};

export default Node;
