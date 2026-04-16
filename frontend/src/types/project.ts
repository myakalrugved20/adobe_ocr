export interface Span {
  text: string;
  font: string;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline?: boolean;
  subscript?: boolean;
  superscript?: boolean;
  bbox: number[];
}

export interface Line {
  spans: Span[];
  bbox: number[];
}

export interface Block {
  id: string;
  bbox: number[];
  lines: Line[];
  opacity?: number;
  align?: 'left' | 'center' | 'right' | 'justify';
}

export interface ImageData {
  id: string;
  path: string;
  bbox: number[];
}

export interface Page {
  page: number;
  width: number;
  height: number;
  background_image: string;
  blocks: Block[];
  images: ImageData[];
}

export interface Project {
  project_id: string;
  pdf_filename: string;
  pages: Page[];
}
