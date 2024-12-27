export interface Notebook {
  id: string;
  name: string;
  createdTime: string;
  lastModifiedTime: string;
  sectionsUrl: string;
}

export interface Section {
  id: string;
  name: string;
  createdTime: string;
  lastModifiedTime: string;
  pagesUrl: string;
}

export interface Page {
  id: string;
  title: string;
  createdTime: string;
  lastModifiedTime: string;
  content?: string;
  contentUrl: string;
}

export interface NotebookCreateOptions {
  name: string;
  sectionName?: string;
}

export interface SectionCreateOptions {
  name: string;
  notebookId: string;
}

export interface PageCreateOptions {
  title: string;
  content: string;
  sectionId: string;
}

export interface SearchOptions {
  query: string;
  notebookId?: string;
  sectionId?: string;
  type?: 'pages' | 'notebooks' | 'sections';
}