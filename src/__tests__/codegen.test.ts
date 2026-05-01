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
    ['uuid', 'z.string().uuid().optional()'],
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

describe('fieldToZod — select edge cases', () => {
  it('empty values array falls back to z.string()', () => {
    const f: Field = { name: 'empty', type: 'select', options: { values: [] } };
    expect(fieldToZod(f, opts)).toBe('z.string().optional()');
  });

  it('missing values falls back to z.string()', () => {
    const f: Field = { name: 'missing', type: 'select', options: {} };
    expect(fieldToZod(f, opts)).toBe('z.string().optional()');
  });

  it('mixed-type values → z.union with literals', () => {
    const f: Field = { name: 'mixed', type: 'select', options: { values: ['a', 1] } };
    expect(fieldToZod(f, opts)).toBe('z.union([z.literal("a"), z.literal(1)]).optional()');
  });

  it('multiple with max constraint', () => {
    const f: Field = { name: 'tags', type: 'select', options: { multiple: true, min: 1, max: 3, values: ['a', 'b', 'c'] } };
    expect(fieldToZod(f, opts)).toBe('z.array(z.enum(["a", "b", "c"])).min(1).max(3).optional()');
  });

  it('object values using name key', () => {
    const f: Field = {
      name: 'named',
      type: 'select',
      options: { values: [{ name: 'x', label: 'X' }, { name: 'y', label: 'Y' }] },
    };
    expect(fieldToZod(f, opts)).toBe('z.enum(["x", "y"]).optional()');
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

  it('reference with default', () => {
    expect(fieldToZod({ name: 'ref', type: 'reference', default: 'foo' }, opts)).toBe('z.string().default("foo")');
  });

  it('required single reference', () => {
    expect(fieldToZod({ name: 'ref', type: 'reference', required: true }, opts)).toBe('z.string()');
  });
});

describe('fieldToZod — reference edge cases', () => {
  it('options.multiple: true → z.array', () => {
    const f: Field = { name: 'refs', type: 'reference', options: { multiple: true } };
    expect(fieldToZod(f, opts)).toBe('z.array(z.string()).default([])');
  });

  it('options.multiple with min and max', () => {
    const f: Field = { name: 'refs', type: 'reference', options: { multiple: true, min: 1, max: 5 } };
    expect(fieldToZod(f, opts)).toBe('z.array(z.string()).min(1).max(5).default([])');
  });

  it('options.multiple: true with required', () => {
    const f: Field = { name: 'refs', type: 'reference', options: { multiple: true }, required: true };
    expect(fieldToZod(f, opts)).toBe('z.array(z.string()).default([])');
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

  it('list with explicit default array', () => {
    expect(fieldToZod({ name: 'items', type: 'string', list: true, default: ['a', 'b'] }, opts))
      .toBe('z.array(z.string()).default(["a","b"])');
  });
});

describe('fieldToZod — defaults on all scalars', () => {
  it.each([
    [{ name: 'x', type: 'string', default: '' } as Field, 'z.string().default("")'],
    [{ name: 'x', type: 'text', default: 'hello' } as Field, 'z.string().default("hello")'],
    [{ name: 'x', type: 'rich-text', default: 'hello' } as Field, 'z.string().default("hello")'],
    [{ name: 'x', type: 'code', default: 'const x = 1;' } as Field, 'z.string().default("const x = 1;")'],
    [{ name: 'x', type: 'number', default: 0 } as Field, 'z.number().default(0)'],
    [{ name: 'x', type: 'boolean', default: false } as Field, 'z.boolean().default(false)'],
    [{ name: 'x', type: 'boolean', default: true } as Field, 'z.boolean().default(true)'],
    [{ name: 'x', type: 'date', default: '' } as Field, 'z.string().default("")'],
    [{ name: 'x', type: 'date', default: '2025-01-01' } as Field, 'z.string().default("2025-01-01")'],
    [{ name: 'x', type: 'file', default: '' } as Field, 'z.string().default("")'],
    [{ name: 'x', type: 'uuid', default: '' } as Field, 'z.string().uuid().default("")'],
  ])('field %o → %s', (field, expected) => {
    expect(fieldToZod(field, opts)).toBe(expected);
  });
});

describe('fieldToZod — object', () => {
  it('basic object with nested fields', () => {
    const f: Field = {
      name: 'seo',
      type: 'object',
      fields: [
        { name: 'title', type: 'string' },
        { name: 'description', type: 'text' },
      ],
    };
    expect(fieldToZod(f, opts)).toBe(
      'z.object({\n  title: z.string().optional(),\n  description: z.string().optional(),\n}).optional()',
    );
  });

  it('empty fields → z.object({})', () => {
    const f: Field = { name: 'empty', type: 'object', fields: [] };
    expect(fieldToZod(f, opts)).toBe('z.object({}).optional()');
  });

  it('required object', () => {
    const f: Field = {
      name: 'seo',
      type: 'object',
      required: true,
      fields: [{ name: 'title', type: 'string' }],
    };
    expect(fieldToZod(f, opts)).toBe('z.object({\n  title: z.string().optional(),\n})');
  });

  it('object with default', () => {
    const f: Field = {
      name: 'seo',
      type: 'object',
      default: { title: 'Home' },
      fields: [{ name: 'title', type: 'string' }],
    };
    expect(fieldToZod(f, opts)).toBe('z.object({\n  title: z.string().optional(),\n}).default({"title":"Home"})');
  });
});

describe('fieldToZod — block', () => {
  it('0 blocks → z.array(z.object({})).default([])', () => {
    const f: Field = { name: 'sections', type: 'block', blocks: [] };
    expect(fieldToZod(f, opts)).toBe('z.array(z.object({})).default([])');
  });

  it('1 block → z.array with single object', () => {
    const f: Field = {
      name: 'sections',
      type: 'block',
      blocks: [{ name: 'hero', fields: [{ name: 'heading', type: 'string' }] }],
    };
    expect(fieldToZod(f, opts)).toBe(
      'z.array(\nz.object({\n  _block: z.literal("hero"),\n  heading: z.string().optional(),\n})\n).default([])',
    );
  });

  it('2+ blocks → discriminated union inside array', () => {
    const f: Field = {
      name: 'sections',
      type: 'block',
      blockKey: 'type',
      blocks: [
        { name: 'hero', fields: [{ name: 'heading', type: 'string' }] },
        { name: 'text', fields: [{ name: 'body', type: 'rich-text' }] },
      ],
    };
    const result = fieldToZod(f, opts);
    expect(result).toContain('z.discriminatedUnion("type"');
    expect(result).toContain('z.literal("hero")');
    expect(result).toContain('z.literal("text")');
    expect(result).toContain('.default([])');
  });

  it('block with custom blockKey', () => {
    const f: Field = {
      name: 'sections',
      type: 'block',
      blockKey: 'component',
      blocks: [{ name: 'hero', fields: [] }],
    };
    const result = fieldToZod(f, opts);
    expect(result).toContain('component: z.literal("hero")');
  });
});

describe('fieldToZod — options no-ops', () => {
  it.each([
    [{ name: 'x', type: 'string', options: { minlength: 3, maxlength: 80 } } as Field, 'z.string().optional()'],
    [{ name: 'x', type: 'text', options: { minlength: 20, maxlength: 280 } } as Field, 'z.string().optional()'],
    [{ name: 'x', type: 'code', options: { format: 'javascript', minlength: 10, maxlength: 500 } } as Field, 'z.string().optional()'],
    [{ name: 'x', type: 'number', options: { min: 0, max: 100, step: 1 } } as Field, 'z.number().optional()'],
    [{ name: 'x', type: 'date', options: { time: true, format: 'yyyy-MM-dd', min: '2025-01-01', max: '2025-12-31', step: 60 } } as Field, 'z.string().optional()'],
    [{ name: 'x', type: 'rich-text', options: { format: 'html', switcher: false, media: 'images', path: 'blog', extensions: ['png'], categories: ['image'], rename: 'safe' } } as Field, 'z.string().optional()'],
    [{ name: 'x', type: 'file', options: { media: 'docs', path: 'public/files', multiple: { max: 5 }, extensions: ['pdf'], categories: ['document'], unique: true, rename: 'random' } } as Field, 'z.string().optional()'],
    [{ name: 'x', type: 'uuid', options: { editable: false, generate: false } } as Field, 'z.string().uuid().optional()'],
  ])('field %o → %s', (field, expected) => {
    expect(fieldToZod(field, opts)).toBe(expected);
  });

  it('image with media options still emits image schema', () => {
    const f: Field = {
      name: 'img',
      type: 'image',
      options: { media: 'images', path: 'public/images', multiple: { max: 6 }, extensions: ['jpg'], categories: ['image'], unique: true, rename: 'safe' },
    };
    expect(fieldToZod(f, opts)).toBe('image().or(z.string()).optional()');
  });

  it('image with media options in file mode emits image()', () => {
    const f: Field = {
      name: 'img',
      type: 'image',
      options: { media: 'images' },
    };
    expect(fieldToZod(f, optsFile)).toBe('image().optional()');
  });
});

describe('fieldToZod — edge cases', () => {
  it('unknown field type falls back to z.string()', () => {
    expect(fieldToZod({ name: 'x', type: 'unknown' } as Field, opts)).toBe('z.string().optional()');
  });

  it('missing field type falls back to z.string()', () => {
    expect(fieldToZod({ name: 'x' } as Field, opts)).toBe('z.string().optional()');
  });

  it('default on multiple reference is ignored', () => {
    const f: Field = { name: 'refs', type: 'reference', list: true, default: ['a'] };
    expect(fieldToZod(f, opts)).toBe('z.array(z.string()).default([])');
  });

  it('default on block is ignored', () => {
    const f: Field = { name: 'sections', type: 'block', blocks: [{ name: 'hero', fields: [] }], default: [] };
    expect(fieldToZod(f, opts)).toBe('z.array(\nz.object({\n  _block: z.literal("hero"),\n})\n).default([])');
  });

  it('select object value missing both name and value becomes undefined', () => {
    const f: Field = { name: 's', type: 'select', options: { values: [{ label: 'X' }] } };
    expect(fieldToZod(f, opts)).toBe('z.union([z.literal(undefined)]).optional()');
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

  it('empty fields → z.object({})', () => {
    expect(fieldsToZodObject([], opts)).toBe('z.object({})');
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

  it('0 blocks → z.array(z.object({})).default([])', () => {
    const field: Field = { name: 'empty', type: 'block', blocks: [] };
    expect(blockToDiscriminatedUnion(field, opts)).toBe('z.array(z.object({})).default([])');
  });

  it('1 block → z.array with single object', () => {
    const field: Field = {
      name: 'content',
      type: 'block',
      blocks: [{ name: 'item', fields: [{ name: 'title', type: 'string' }] }],
    };
    const result = blockToDiscriminatedUnion(field, opts);
    expect(result).toBe(
      'z.array(\nz.object({\n  _block: z.literal("item"),\n  title: z.string().optional(),\n})\n).default([])',
    );
  });
});
