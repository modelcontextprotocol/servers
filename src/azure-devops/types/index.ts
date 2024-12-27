export interface WorkItem {
  id: number;
  title: string;
  state: string;
  type: string;
  description?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
}

export interface Repository {
  id: string;
  name: string;
  defaultBranch: string;
  url: string;
}