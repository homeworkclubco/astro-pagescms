# astro-pagescms

Astro integration for [Pages CMS](https://pagescms.org). Generates a type-safe `src/content.config.ts` from your `.pages.yml` config so your Astro content collections stay in sync with your CMS schema automatically.

## How it works

On each Astro build (and on `.pages.yml` changes during `astro dev`), the integration:

1. Reads and parses `.pages.yml`
2. Resolves component references and normalises the config
3. Generates Zod schemas for each collection or file entry
4. Writes the result to `src/content.config.ts`

You don't edit `src/content.config.ts` manually — it's overwritten on every run.

## Installation

```bash
npm install astro-pagescms
```

## Setup

Add the integration to `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';
import pagesCMS from 'astro-pagescms';

export default defineConfig({
  integrations: [pagesCMS()],
});
```

Make sure `.pages.yml` exists at your project root. On the next `astro dev` or `astro build`, `src/content.config.ts` will be generated.

## Configuration

```js
pagesCMS({
  config: '.pages.yml',           // Path to Pages CMS config. Default: '.pages.yml'
  output: 'src/content.config.ts', // Where to write the generated file. Default: 'src/content.config.ts'
  imageMode: 'astro',             // Image handling mode. Default: 'astro'
  fileIds: {},                    // Per-collection ID field overrides. Default: {}
  watch: true,                    // Re-generate when .pages.yml changes in dev. Default: true
})
```

### `imageMode`

Controls how `image` fields are typed in glob-loaded collections.

| Value | Generated schema | Use when |
|-------|-----------------|----------|
| `'astro'` | `image().or(z.string())` | You want Astro image optimisation |
| `'string'` | `z.string()` | You prefer plain string paths |

File-loaded collections always use `z.string()` regardless of this setting.

### `fileIds`

JSON file collections need a unique ID per entry. The integration looks for these fields in order: `uuid` → `id` → array index. Use `fileIds` to override per collection:

```js
pagesCMS({
  fileIds: {
    testimonials: 'uuid',
    clients: 'name',
  },
})
```

## Field types

| Pages CMS type | Generated Zod schema |
|---------------|---------------------|
| `string` | `z.string()` |
| `text` | `z.string()` |
| `rich-text` | `z.string()` |
| `code` | `z.string()` |
| `number` | `z.number()` |
| `boolean` | `z.boolean()` |
| `uuid` | `z.string().uuid()` |
| `date` | `z.string()` |
| `file` | `z.string()` |
| `image` | `image().or(z.string())` or `z.string()` (see `imageMode`) |
| `select` | `z.enum([...])` or `z.union([...])` |
| `reference` | `z.string()` (single) or `z.array(z.string()).default([])` (list/multiple) |
| `object` | `z.object({ ... })` (recursive) |
| `block` | `z.array(z.discriminatedUnion(...))` |

### Required, optional, and defaults

- Fields with `required: true` have no optional modifier.
- Fields without a default are marked `.optional()`.
- Fields with a `default` value use `.default(value)`.
- `list` fields become `z.array(...)`. If `list` has `min`/`max` constraints they are applied to the array.

### Select fields

Values are typed from their YAML type — no string inference. If all values are strings, `z.enum()` is used. Mixed types produce `z.union([z.literal(...), ...])`. Object-style values (with a `label` and `value`) use the `value` property as the stored type.

### Block fields

Block fields generate a discriminated union. Each block variant automatically gets a `type` discriminator field injected:

```ts
z.array(z.discriminatedUnion('type', [
  z.object({ type: z.literal('imageHeroBlock'), image: image().or(z.string()), ... }),
  z.object({ type: z.literal('textBlock'), body: z.string(), ... }),
]))
```

The discriminator key defaults to `type`. You can override it with `blockKey` on the field.

## Collections vs. file entries

### Collections (`type: collection`)

Uses Astro's `glob()` loader. The pattern is inferred from `path` and `extension`:

```ts
defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/pages' }),
  schema: ({ image }) => z.object({ ... }),
})
```

The `body` field is excluded from the schema — Astro exposes it automatically as `entry.body` and `entry.rendered`.

### File entries (`type: file`)

Uses Astro's `file()` loader.

**JSON files** get a custom parser that maps each entry to an ID:

```ts
defineCollection({
  loader: file('src/content/clients.json', {
    parser: (text) => {
      const items = JSON.parse(text);
      return items.map((item, i) => ({ ...item, id: item.uuid ?? item.id ?? String(i) }));
    },
  }),
  schema: z.object({ ... }),
})
```

**Non-JSON files** use the plain `file()` loader without a custom parser.

## Component references

Components defined in `.pages.yml` under `components:` are inlined wherever they are referenced with `component: name`. No action needed — the integration resolves all references before generating schemas.

If a component is referenced in two or more collections, it is hoisted to a named schema at the top of the generated file and shared:

```ts
// Shared component schemas
const seoSchema = (image: SchemaContext['image']) =>
  z.object({ title: z.string().optional(), ... }).optional();

// Collections
const pages = defineCollection({
  schema: ({ image }) => z.object({
    seo: seoSchema(image),
    ...
  }),
});
```

Components used in only one collection are inlined directly.

## Generated file

The generated `src/content.config.ts` looks like this:

```ts
// THIS FILE IS AUTO-GENERATED by astro-pagescms
// Source: .pages.yml — do not edit manually, changes will be overwritten on next build

import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';
import type { SchemaContext } from 'astro:content';
import { defineCollection } from 'astro:content';

const seoSchema = (image: SchemaContext['image']) => z.object({ ... }).optional();

const pages = defineCollection({ ... });
const clients = defineCollection({ ... });

export const collections = { pages, clients };
```

Collection variable names are camelCased from the entry `name` in `.pages.yml`.

## Known limitations

- **Custom Zod defaults:** Complex default values (e.g. default objects or arrays) are serialised with `JSON.stringify`. This works for primitives and plain JSON-serialisable values.
- **Reference targets:** `reference` fields type the value as `z.string()`. Cross-collection Astro references (`reference('collectionName')`) are not generated.
- **Groups:** Content groups in `.pages.yml` are flattened into individual collections. The group structure is not reflected in the generated file.
- **Markdown body:** The `body` field is stripped from frontmatter collection schemas because Astro handles it separately. Adding a `body` field to a non-frontmatter collection will include it as a normal schema field.
- **Bidirectional sync:** Changes to `src/content.config.ts` are not written back to `.pages.yml`. The flow is one-way: `.pages.yml` → `src/content.config.ts`.
