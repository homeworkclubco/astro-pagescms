export interface Field {
  name: string;
  type?: string;
  label?: string;
  required?: boolean;
  default?: unknown;
  list?: boolean | { min?: number; max?: number; [key: string]: unknown };
  fields?: Field[];
  blocks?: Block[];
  blockKey?: string;
  component?: string;
  options?: {
    values?: Array<string | number | { value?: unknown; name?: unknown; label?: string }>;
    multiple?: boolean;
    min?: number;
    max?: number;
    [key: string]: unknown;
  };
  multiple?: boolean;
  [key: string]: unknown;
}

export interface Block {
  name: string;
  label?: string;
  fields?: Field[];
}

export interface ContentEntry {
  name: string;
  label?: string;
  type: 'collection' | 'file';
  path: string;
  format?: string;
  extension?: string;
  fields?: Field[];
  list?: boolean;
}

export type ComponentMap = Record<string, Field>;

export interface CodegenOpts {
  imageMode: 'astro' | 'string';
  fileIds?: Record<string, string>;
  /** true when inside a glob-loaded (type:collection) context */
  isGlob?: boolean;
}

export interface PagesCMSOptions {
  config?: string;
  output?: string;
  imageMode?: 'astro' | 'string';
  fileIds?: Record<string, string>;
  watch?: boolean;
}
