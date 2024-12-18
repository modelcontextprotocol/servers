import { Node, Edge } from 'reactflow';

export interface NodeSpecification {
  id: string;
  type: string;
  data: {
    label: string;
    inputs: string[];
    outputs: string[];
  };
  position: { x: number; y: number };
}

export const initialNodes: Node[] = [
  {
    id: '1',
    type: 'default',
    data: { label: 'Node 1', inputs: ['input1'], outputs: ['output1'] },
    position: { x: 250, y: 5 },
  },
  {
    id: '2',
    type: 'default',
    data: { label: 'Node 2', inputs: ['input2'], outputs: ['output2'] },
    position: { x: 100, y: 100 },
  },
];

export const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', type: 'default' },
];

export const nodeTypes = {
  default: Node,
};
