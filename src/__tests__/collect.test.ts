import { describe, it, expect } from 'vitest';
import { findSharedComponents, assembleFile } from '../collect.js';
import { fieldUsesImage } from '../codegen.js';
import type { ContentEntry, ComponentMap, Field, CodegenOpts } from '../types.js';

const opts: CodegenOpts = { imageMode: 'astro' };

describe('findSharedComponents', () => {
  it('returns empty set when no components reused', () => {
    const content: ContentEntry[] = [
      {
        name: 'posts',
        type: 'collection',
        path: 'content/posts',
        fields: [{ name: 'title', type: 'string' }],
      },
    ];
    expect(findSharedComponents(content, {})).toEqual(new Set());
  });

  it('returns component name when reused across 2 collections', () => {
    const content: ContentEntry[] = [
      {
        name: 'posts',
        type: 'collection',
        path: 'content/posts',
        fields: [{ name: 'seo', type: 'object', _component: 'seo' } as Field],
      },
      {
        name: 'pages',
        type: 'collection',
        path: 'content/pages',
        fields: [{ name: 'seo', type: 'object', _component: 'seo' } as Field],
      },
    ];
    expect(findSharedComponents(content, {})).toEqual(new Set(['seo']));
  });

  it('ignores components used in only 1 collection', () => {
    const content: ContentEntry[] = [
      {
        name: 'posts',
        type: 'collection',
        path: 'content/posts',
        fields: [
          { name: 'seo', type: 'object', _component: 'seo' } as Field,
          { name: 'hero', type: 'object', _component: 'hero' } as Field,
        ],
      },
      {
        name: 'pages',
        type: 'collection',
        path: 'content/pages',
        fields: [{ name: 'seo', type: 'object', _component: 'seo' } as Field],
      },
    ];
    expect(findSharedComponents(content, {})).toEqual(new Set(['seo']));
  });

  it('counts reuse only once per collection', () => {
    const content: ContentEntry[] = [
      {
        name: 'posts',
        type: 'collection',
        path: 'content/posts',
        fields: [
          { name: 'seo', type: 'object', _component: 'seo' } as Field,
          { name: 'seo2', type: 'object', _component: 'seo' } as Field,
        ],
      },
      {
        name: 'pages',
        type: 'collection',
        path: 'content/pages',
        fields: [{ name: 'seo', type: 'object', _component: 'seo' } as Field],
      },
    ];
    expect(findSharedComponents(content, {})).toEqual(new Set(['seo']));
  });
});

describe('assembleFile — shared components', () => {
  it('emits shared object schema with image parameter', () => {
    const content: ContentEntry[] = [
      {
        name: 'posts',
        type: 'collection',
        path: 'content/posts',
        fields: [{ name: 'cover', type: 'object', fields: [{ name: 'src', type: 'image' }], _component: 'cover' } as Field],
      },
      {
        name: 'pages',
        type: 'collection',
        path: 'content/pages',
        fields: [{ name: 'cover', type: 'object', fields: [{ name: 'src', type: 'image' }], _component: 'cover' } as Field],
      },
    ];
    const components: ComponentMap = {
      cover: {
        name: 'cover',
        type: 'object',
        fields: [{ name: 'src', type: 'image' }],
      },
    };
    const result = assembleFile(content, components, opts);
    expect(result).toContain('const coverSchema = (image: SchemaContext[\'image\']) =>');
    expect(result).toContain('coverSchema(image)');
  });

  it('emits shared object schema without image parameter', () => {
    const content: ContentEntry[] = [
      {
        name: 'posts',
        type: 'collection',
        path: 'content/posts',
        fields: [{ name: 'meta', type: 'object', _component: 'meta' } as Field],
      },
      {
        name: 'pages',
        type: 'collection',
        path: 'content/pages',
        fields: [{ name: 'meta', type: 'object', _component: 'meta' } as Field],
      },
    ];
    const components: ComponentMap = {
      meta: {
        name: 'meta',
        type: 'object',
        fields: [{ name: 'title', type: 'string' }],
      },
    };
    const result = assembleFile(content, components, opts);
    expect(result).toContain('const metaSchema = ');
    expect(result).not.toContain('metaSchema = (image:');
    expect(result).toContain('metaSchema()');
  });

  it('emits shared block schema', () => {
    const content: ContentEntry[] = [
      {
        name: 'posts',
        type: 'collection',
        path: 'content/posts',
        fields: [{ name: 'sections', type: 'block', _component: 'sections' } as Field],
      },
      {
        name: 'pages',
        type: 'collection',
        path: 'content/pages',
        fields: [{ name: 'sections', type: 'block', _component: 'sections' } as Field],
      },
    ];
    const components: ComponentMap = {
      sections: {
        name: 'sections',
        type: 'block',
        blocks: [
          { name: 'hero', fields: [{ name: 'heading', type: 'string' }] },
          { name: 'text', fields: [{ name: 'body', type: 'rich-text' }] },
        ],
      },
    };
    const result = assembleFile(content, components, opts);
    expect(result).toContain('const sectionsSchema = ');
    expect(result).toContain('z.discriminatedUnion');
    expect(result).toContain('z.literal("hero")');
    expect(result).toContain('z.literal("text")');
  });

  it('does not emit shared schema when component is used once', () => {
    const content: ContentEntry[] = [
      {
        name: 'posts',
        type: 'collection',
        path: 'content/posts',
        fields: [{ name: 'seo', type: 'object', _component: 'seo' } as Field],
      },
    ];
    const components: ComponentMap = {
      seo: { name: 'seo', type: 'object', fields: [{ name: 'title', type: 'string' }] },
    };
    const result = assembleFile(content, components, opts);
    expect(result).not.toContain('seoSchema');
  });
});

describe('fieldUsesImage', () => {
  it('returns true for direct image field', () => {
    expect(fieldUsesImage({ name: 'img', type: 'image' })).toBe(true);
  });

  it('returns false for non-image field', () => {
    expect(fieldUsesImage({ name: 'title', type: 'string' })).toBe(false);
  });

  it('returns true for image nested inside object.fields', () => {
    const field: Field = {
      name: 'seo',
      type: 'object',
      fields: [{ name: 'cover', type: 'image' }],
    };
    expect(fieldUsesImage(field)).toBe(true);
  });

  it('returns true for image nested inside block.blocks[].fields', () => {
    const field: Field = {
      name: 'sections',
      type: 'block',
      blocks: [{ name: 'hero', fields: [{ name: 'cover', type: 'image' }] }],
    };
    expect(fieldUsesImage(field)).toBe(true);
  });

  it('returns false when object has no image fields', () => {
    const field: Field = {
      name: 'seo',
      type: 'object',
      fields: [{ name: 'title', type: 'string' }],
    };
    expect(fieldUsesImage(field)).toBe(false);
  });

  it('returns false for empty object', () => {
    const field: Field = { name: 'empty', type: 'object', fields: [] };
    expect(fieldUsesImage(field)).toBe(false);
  });
});
