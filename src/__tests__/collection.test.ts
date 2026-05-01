import { describe, it, expect } from 'vitest';
import { collectionToTs } from '../codegen.js';
import type { ContentEntry, ComponentMap, CodegenOpts } from '../types.js';

const opts: CodegenOpts = { imageMode: 'astro' };
const optsString: CodegenOpts = { imageMode: 'string' };

describe('collectionToTs — frontmatter body filtering', () => {
  it('strips body field for yaml-frontmatter collections', () => {
    const entry: ContentEntry = {
      name: 'posts',
      type: 'collection',
      path: 'content/posts',
      format: 'yaml-frontmatter',
      fields: [
        { name: 'title', type: 'string' },
        { name: 'body', type: 'rich-text' },
      ],
    };
    const result = collectionToTs(entry, {}, new Set(), opts);
    expect(result).toContain('title: z.string().optional()');
    expect(result).not.toContain('body:');
  });

  it('strips body field for json-frontmatter collections', () => {
    const entry: ContentEntry = {
      name: 'posts',
      type: 'collection',
      path: 'content/posts',
      format: 'json-frontmatter',
      fields: [
        { name: 'title', type: 'string' },
        { name: 'body', type: 'rich-text' },
      ],
    };
    const result = collectionToTs(entry, {}, new Set(), opts);
    expect(result).not.toContain('body:');
  });

  it('strips body field for toml-frontmatter collections', () => {
    const entry: ContentEntry = {
      name: 'posts',
      type: 'collection',
      path: 'content/posts',
      format: 'toml-frontmatter',
      fields: [
        { name: 'title', type: 'string' },
        { name: 'body', type: 'rich-text' },
      ],
    };
    const result = collectionToTs(entry, {}, new Set(), opts);
    expect(result).not.toContain('body:');
  });

  it('keeps body field for raw format collections', () => {
    const entry: ContentEntry = {
      name: 'posts',
      type: 'collection',
      path: 'content/posts',
      format: 'raw',
      fields: [
        { name: 'title', type: 'string' },
        { name: 'body', type: 'rich-text' },
      ],
    };
    const result = collectionToTs(entry, {}, new Set(), opts);
    expect(result).toContain('body: z.string().optional()');
  });

  it('keeps body field for file entries even with frontmatter format', () => {
    const entry: ContentEntry = {
      name: 'data',
      type: 'file',
      path: 'content/data.json',
      format: 'yaml-frontmatter',
      fields: [
        { name: 'title', type: 'string' },
        { name: 'body', type: 'rich-text' },
      ],
    };
    const result = collectionToTs(entry, {}, new Set(), opts);
    expect(result).toContain('body: z.string().optional()');
  });
});

describe('collectionToTs — file loader', () => {
  it('json file with uuid id inference', () => {
    const entry: ContentEntry = {
      name: 'clients',
      type: 'file',
      path: 'content/clients.json',
      extension: 'json',
      fields: [
        { name: 'uuid', type: 'uuid' },
        { name: 'name', type: 'string' },
      ],
    };
    const result = collectionToTs(entry, {}, new Set(), opts);
    expect(result).toContain('loader: file("./content/clients.json", {');
    expect(result).toContain('id: String((item as any).uuid ?? i)');
  });

  it('json file with id field inference', () => {
    const entry: ContentEntry = {
      name: 'items',
      type: 'file',
      path: 'content/items.json',
      extension: 'json',
      fields: [
        { name: 'id', type: 'string' },
        { name: 'name', type: 'string' },
      ],
    };
    const result = collectionToTs(entry, {}, new Set(), opts);
    expect(result).toContain('id: String((item as any).id ?? i)');
  });

  it('json file with no uuid/id falls back to index', () => {
    const entry: ContentEntry = {
      name: 'items',
      type: 'file',
      path: 'content/items.json',
      extension: 'json',
      fields: [{ name: 'name', type: 'string' }],
    };
    const result = collectionToTs(entry, {}, new Set(), opts);
    expect(result).toContain('id: String(i)');
  });

  it('json file with fileIds override', () => {
    const entry: ContentEntry = {
      name: 'items',
      type: 'file',
      path: 'content/items.json',
      extension: 'json',
      fields: [{ name: 'name', type: 'string' }],
    };
    const result = collectionToTs(entry, {}, new Set(), { ...opts, fileIds: { items: 'slug' } });
    expect(result).toContain('id: String((item as any)["slug"] ?? i)');
  });

  it('non-json file emits simple file loader', () => {
    const entry: ContentEntry = {
      name: 'data',
      type: 'file',
      path: 'content/data.yml',
      extension: 'yml',
      fields: [{ name: 'name', type: 'string' }],
    };
    const result = collectionToTs(entry, {}, new Set(), opts);
    expect(result).toContain('loader: file("./content/data.yml")');
    expect(result).not.toContain('parser:');
  });
});

describe('collectionToTs — image mode variations', () => {
  it('file collection with image uses image() without .or(z.string())', () => {
    const entry: ContentEntry = {
      name: 'clients',
      type: 'file',
      path: 'content/clients.json',
      extension: 'json',
      fields: [{ name: 'logo', type: 'image' }],
    };
    const result = collectionToTs(entry, {}, new Set(), opts);
    expect(result).toContain('logo: image().optional()');
    expect(result).not.toContain('image().or(z.string())');
  });

  it('glob collection with image uses image().or(z.string())', () => {
    const entry: ContentEntry = {
      name: 'posts',
      type: 'collection',
      path: 'content/posts',
      fields: [{ name: 'cover', type: 'image' }],
    };
    const result = collectionToTs(entry, {}, new Set(), opts);
    expect(result).toContain('cover: image().or(z.string()).optional()');
  });

  it('imageMode:string uses z.string() for images', () => {
    const entry: ContentEntry = {
      name: 'posts',
      type: 'collection',
      path: 'content/posts',
      fields: [{ name: 'cover', type: 'image' }],
    };
    const result = collectionToTs(entry, {}, new Set(), optsString);
    expect(result).toContain('cover: z.string().optional()');
    expect(result).not.toContain('image()');
  });

  it('file collection with imageMode:string uses z.string()', () => {
    const entry: ContentEntry = {
      name: 'clients',
      type: 'file',
      path: 'content/clients.json',
      extension: 'json',
      fields: [{ name: 'logo', type: 'image' }],
    };
    const result = collectionToTs(entry, {}, new Set(), optsString);
    expect(result).toContain('logo: z.string().optional()');
    expect(result).not.toContain('image()');
  });
});

describe('collectionToTs — shared components', () => {
  it('uses shared schema function for shared components', () => {
    const entry: ContentEntry = {
      name: 'posts',
      type: 'collection',
      path: 'content/posts',
      fields: [{ name: 'seo', type: 'object', _component: 'seo' } as any],
    };
    const result = collectionToTs(entry, {}, new Set(['seo']), opts);
    expect(result).toContain('seo: seoSchema()');
  });

  it('inlines non-shared components', () => {
    const entry: ContentEntry = {
      name: 'posts',
      type: 'collection',
      path: 'content/posts',
      fields: [{ name: 'seo', type: 'object', fields: [{ name: 'title', type: 'string' }] }],
    };
    const result = collectionToTs(entry, {}, new Set(), opts);
    expect(result).toContain('seo: z.object({');
    expect(result).not.toContain('seoSchema');
  });
});

describe('collectionToTs — edge cases', () => {
  it('collection with no fields emits empty z.object({})', () => {
    const entry: ContentEntry = {
      name: 'posts',
      type: 'collection',
      path: 'content/posts',
      fields: [],
    };
    const result = collectionToTs(entry, {}, new Set(), opts);
    expect(result).toContain('z.object({})');
  });

  it('file collection with no fields emits empty z.object({})', () => {
    const entry: ContentEntry = {
      name: 'data',
      type: 'file',
      path: 'content/data.json',
      extension: 'json',
      fields: [],
    };
    const result = collectionToTs(entry, {}, new Set(), opts);
    expect(result).toContain('z.object({})');
  });

  it('path gets ./ prefix when missing', () => {
    const entry: ContentEntry = {
      name: 'posts',
      type: 'collection',
      path: 'content/posts',
      fields: [],
    };
    const result = collectionToTs(entry, {}, new Set(), opts);
    expect(result).toContain('base: "./content/posts"');
  });

  it('path keeps existing ./ prefix', () => {
    const entry: ContentEntry = {
      name: 'posts',
      type: 'collection',
      path: './content/posts',
      fields: [],
    };
    const result = collectionToTs(entry, {}, new Set(), opts);
    expect(result).toContain('base: "./content/posts"');
  });
});
