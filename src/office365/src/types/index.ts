export interface WordDocument {
  id: string;
  name: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  webUrl: string;
  content?: string;
}

export interface ExcelWorkbook {
  id: string;
  name: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  webUrl: string;
}

export interface PowerPointPresentation {
  id: string;
  name: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  webUrl: string;
}

export interface SharePointSite {
  id: string;
  name: string;
  webUrl: string;
  description?: string;
}

export interface DocumentTemplate {
  id: string;
  name: string;
  type: 'word' | 'excel' | 'powerpoint';
  description?: string;
}