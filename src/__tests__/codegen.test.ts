import { describe, it, expect } from 'vitest';
import { fieldToZod, fieldsToZodObject, blockToDiscriminatedUnion } from '../codegen.js';
import type { Field, CodegenOpts } from '../types.js';

const opts: CodegenOpts = { imageMode: 'astro', isGlob: true };
const optsFile: CodegenOpts = { imageMode: 'astro', isGlob: false };
const optsString: CodegenOpts = { imageMode: 'string', isGlob: true };

describe('fieldToZod — scalars', () => {
  it.each([
    ['string', 'z.string().optional()'],
    ['text', 'z.string().optional()'],
    ['rich-text', 'z.string().optional()'],
    ['code', 'z.string().optional()'],
    ['number', 'z.number().optional()'],
    ['boolean', 'z.boolean().optional()'],
    ['uuid', 'z.uuid().optional()'],
    ['date', 'z.string().optional()'],
    ['file', 'z.string().optional()'],
  ])('type: %s → %s', (type, expected) => {
    expect(fieldToZod({ name: 'x', type } as Field, opts)).toBe(expected);
  });

  it('required field has no .optional()', () => {
    expect(fieldToZod({ name: 'x', type: 'string', required: true }, opts)).toBe('z.string()');
  });

  it('field with default uses .default()', () => {
    expect(fieldToZod({ name: 'x', type: 'string', default: 'hello' }, opts)).toBe('z.string().default("hello")');
  });

  it('numeric default', () => {
    expect(fieldToZod({ name: 'x', type: 'number', default: 0 }, opts)).toBe('z.number().default(0)');
  });
});

describe('fieldToZod — image', () => {
  it('glob + astro → image().or(z.string())', () => {
    expect(fieldToZod({ name: 'img', type: 'image' }, opts)).toBe('image().or(z.string()).optional()');
  });

  it('file + astro → image()', () => {
    expect(fieldToZod({ name: 'img', type: 'image' }, optsFile)).toBe('image().optional()');
  });

  it('imageMode:string → z.string()', () => {
    expect(fieldToZod({ name: 'img', type: 'image' }, optsString)).toBe('z.string().optional()');
  });

  it('required image', () => {
    expect(fieldToZod({ name: 'img', type: 'image', required: true }, opts)).toBe('image().or(z.string())');
  });
});

describe('fieldToZod — select', () => {
  it('string values → z.enum', () => {
    const f: Field = { name: 'c', type: 'select', options: { values: ['light', 'dark'] } };
    expect(fieldToZod(f, opts)).toBe('z.enum(["light", "dark"]).optional()');
  });

  it('numeric values → z.union of literals', () => {
    const f: Field = { name: 'n', type: 'select', options: { values: [2, 3] } };
    expect(fieldToZod(f, opts)).toBe('z.union([z.literal(2), z.literal(3)]).optional()');
  });

  it('object values → extract value key', () => {
    const f: Field = {
      name: 's',
      type: 'select',
      options: { values: [{ value: '301', label: '301 Permanent' }, { value: '302', label: '302 Temporary' }] },
    };
    expect(fieldToZod(f, opts)).toBe('z.enum(["301", "302"]).optional()');
  });

  it('multiple: true → z.array', () => {
    const f: Field = { name: 'cats', type: 'select', options: { multiple: true, min: 1, values: ['art', 'music'] } };
    expect(fieldToZod(f, opts)).toBe('z.array(z.enum(["art", "music"])).min(1).optional()');
  });

  it('select with default', () => {
    const f: Field = { name: 's', type: 'select', options: { values: ['301', '302'] }, default: '301' };
    expect(fieldToZod(f, opts)).toBe('z.enum(["301", "302"]).default("301")');
  });
});

describe('fieldToZod — reference', () => {
  it('single reference → z.string().optional()', () => {
    expect(fieldToZod({ name: 'ref', type: 'reference' }, opts)).toBe('z.string().optional()');
  });

  it('list reference → z.array(z.string()).default([])', () => {
    expect(fieldToZod({ name: 'refs', type: 'reference', list: true }, opts)).toBe('z.array(z.string()).default([])');
  });

  it('multiple: true reference → z.array', () => {
    expect(fieldToZod({ name: 'refs', type: 'reference', multiple: true }, opts)).toBe('z.array(z.string()).default([])');
  });
});

describe('fieldToZod — list', () => {
  it('list: true wraps in z.array with .default([])', () => {
    expect(fieldToZod({ name: 'tags', type: 'string', list: true }, opts)).toBe('z.array(z.string()).default([])');
  });

  it('list: { min, max } adds constraints', () => {
    expect(fieldToZod({ name: 'items', type: 'string', list: { min: 1, max: 5 } }, opts))
      .toBe('z.array(z.string()).min(1).max(5).default([])');
  });

  it('list with required uses no .default', () => {
    expect(fieldToZod({ name: 'items', type: 'string', list: true, required: true }, opts))
      .toBe('z.array(z.string())');
  });
});

describe('fieldsToZodObject', () => {
  it('builds z.object from fields', () => {
    const fields: Field[] = [
      { name: 'title', type: 'string', required: true },
      { name: 'desc', type: 'text' },
    ];
    const result = fieldsToZodObject(fields, opts);
    expect(result).toContain('z.object({');
    expect(result).toContain('title: z.string()');
    expect(result).toContain('desc: z.string().optional()');
  });
});

describe('blockToDiscriminatedUnion', () => {
  it('generates discriminated union for blocks', () => {
    const field: Field = {
      name: 'sections',
      type: 'block',
      blockKey: 'type',
      blocks: [
        { name: 'heroBlock', fields: [{ name: 'heading', type: 'string', required: true }] },
        { name: 'textBlock', fields: [{ name: 'body', type: 'rich-text' }] },
      ],
    };
    const result = blockToDiscriminatedUnion(field, opts);
    expect(result).toContain('z.discriminatedUnion("type"');
    expect(result).toContain('z.literal("heroBlock")');
    expect(result).toContain('z.literal("textBlock")');
    expect(result).toContain('.default([])');
  });

  it('uses _block as default blockKey', () => {
    const field: Field = {
      name: 'content',
      type: 'block',
      blocks: [{ name: 'item', fields: [] }],
    };
    const result = blockToDiscriminatedUnion(field, opts);
    expect(result).toContain('_block:');
  });
});
