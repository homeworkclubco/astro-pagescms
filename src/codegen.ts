import type { Field, ContentEntry, ComponentMap, CodegenOpts } from './types.js';

const FRONTMATTER_FORMATS = new Set(['yaml-frontmatter', 'json-frontmatter', 'toml-frontmatter', 'frontmatter']);

// ─── Field → Zod string ──────────────────────────────────────────────────────

export function fieldToZod(field: Field, opts: CodegenOpts): string {
  const base = baseSchema(field, opts);
  const withList = applyList(base, field);
  return applyOptionalOrDefault(withList, field);
}

function baseSchema(field: Field, opts: CodegenOpts): string {
  const type = field.type ?? 'string';

  switch (type) {
    case 'string':
    case 'text':
    case 'rich-text':
    case 'code':
      return 'z.string()';

    case 'number':
      return 'z.number()';

    case 'boolean':
      return 'z.boolean()';

    case 'uuid':
      return 'z.uuid()';

    case 'date':
      return 'z.string()';

    case 'file':
      return 'z.string()';

    case 'reference': {
      const isMultiple =
        field.multiple === true ||
        (typeof field.list === 'boolean' && field.list) ||
        (typeof field.list === 'object' && field.list !== null);
      if (isMultiple) return 'z.array(z.string()).default([])';
      return 'z.string()';
    }

    case 'image':
      return imageSchema(opts);

    case 'select':
      return selectSchema(field);

    case 'object':
      return objectSchema(field, opts);

    case 'block':
      return blockSchema(field, opts);

    default:
      return 'z.string()';
  }
}

function imageSchema(opts: CodegenOpts): string {
  if (opts.imageMode === 'string') return 'z.string()';
  if (opts.isGlob) return 'image().or(z.string())';
  return 'image()';
}

function selectSchema(field: Field): string {
  const values = field.options?.values;
  if (!values || !Array.isArray(values) || values.length === 0) return 'z.string()';

  // Normalise to scalar values
  const scalars = values.map((v) => {
    if (v !== null && typeof v === 'object') {
      return (v as any).name ?? (v as any).value;
    }
    return v;
  });

  const allStrings = scalars.every((v) => typeof v === 'string');
  const allNumbers = scalars.every((v) => typeof v === 'number');

  const isMultiple = field.options?.multiple === true;
  let schema: string;

  if (allStrings) {
    const list = scalars.map((v) => JSON.stringify(v)).join(', ');
    schema = `z.enum([${list}])`;
  } else if (allNumbers) {
    const list = scalars.map((v) => `z.literal(${v})`).join(', ');
    schema = `z.union([${list}])`;
  } else {
    const list = scalars.map((v) => `z.literal(${JSON.stringify(v)})`).join(', ');
    schema = `z.union([${list}])`;
  }

  if (isMultiple) {
    const min = field.options?.min;
    schema = `z.array(${schema})${min != null ? `.min(${min})` : ''}`;
  }

  return schema;
}

function objectSchema(field: Field, opts: CodegenOpts): string {
  const fields = field.fields ?? [];
  return fieldsToZodObject(fields, opts);
}

export function fieldsToZodObject(fields: Field[], opts: CodegenOpts): string {
  if (fields.length === 0) return 'z.object({})';
  const entries = fields.map((f) => {
    const zodStr = fieldToZod(f, opts);
    return `  ${f.name}: ${zodStr}`;
  });
  return `z.object({\n${entries.join(',\n')},\n})`;
}

function blockSchema(field: Field, opts: CodegenOpts): string {
  return blockToDiscriminatedUnion(field, opts);
}

export function blockToDiscriminatedUnion(field: Field, opts: CodegenOpts): string {
  const blockKey = (field.blockKey as string | undefined) ?? '_block';
  const blocks = field.blocks ?? [];

  const variants = blocks.map((block) => {
    const blockFields: Field[] = [
      { name: blockKey, type: 'string', required: true, _literal: block.name } as any,
      ...(block.fields ?? []),
    ];
    const entries = blockFields.map((f) => {
      if ((f as any)._literal) {
        return `  ${f.name}: z.literal(${JSON.stringify((f as any)._literal)})`;
      }
      return `  ${f.name}: ${fieldToZod(f, opts)}`;
    });
    return `z.object({\n${entries.join(',\n')},\n})`;
  });

  if (variants.length === 0) return 'z.array(z.object({})).default([])';
  if (variants.length === 1) {
    return `z.array(\n${variants[0]}\n).default([])`;
  }

  const union = `z.discriminatedUnion(${JSON.stringify(blockKey)}, [\n${variants.join(',\n')},\n])`;
  return `z.array(\n${union}\n).default([])`;
}

function applyList(schema: string, field: Field): string {
  const list = field.list;
  if (!list) return schema;
  // reference with list is already handled in baseSchema
  if (field.type === 'reference') return schema;
  // block is already an array
  if (field.type === 'block') return schema;

  let arraySchema = `z.array(${schema})`;

  if (typeof list === 'object' && list !== null) {
    if (list.min != null) arraySchema += `.min(${list.min})`;
    if (list.max != null) arraySchema += `.max(${list.max})`;
  }

  return arraySchema;
}

function applyOptionalOrDefault(schema: string, field: Field): string {
  // reference with list/multiple already has .default([])
  if (field.type === 'reference') {
    const isMultiple =
      field.multiple === true ||
      (typeof field.list === 'boolean' && field.list) ||
      (typeof field.list === 'object' && field.list !== null);
    if (isMultiple) return schema;
    if (field.required) return schema;
    if ('default' in field && field.default !== undefined) return `${schema}.default(${JSON.stringify(field.default)})`;
    return `${schema}.optional()`;
  }

  // block arrays already have .default([])
  if (field.type === 'block') return schema;

  // list fields
  if (field.list) {
    if (field.required) return schema; // .min(1) already handles required for lists
    if ('default' in field && field.default !== undefined) return `${schema}.default(${JSON.stringify(field.default)})`;
    // only add .default([]) if the list wasn't already given a default
    if (!schema.includes('.default(')) return `${schema}.default([])`;
    return schema;
  }

  if ('default' in field && field.default !== undefined) {
    return `${schema}.default(${JSON.stringify(field.default)})`;
  }
  if (field.required) return schema;
  return `${schema}.optional()`;
}

// ─── Collection → defineCollection() ────────────────────────────────────────

export function collectionToTs(
  entry: ContentEntry,
  components: ComponentMap,
  sharedComponents: Set<string>,
  opts: CodegenOpts,
): string {
  const isGlob = entry.type === 'collection';
  const fieldOpts: CodegenOpts = { ...opts, isGlob };

  const isFrontmatter = isGlob && FRONTMATTER_FORMATS.has(entry.format ?? '');

  const fields = (entry.fields ?? []).filter((f) => {
    if (isFrontmatter && f.name === 'body') return false;
    return true;
  });

  // Build schema string — inline shared component calls or inline object
  const schemaEntries = fields.map((f) => {
    // Check if this field was originally a component reference that is shared
    // (after normalizeConfig, the original component key is gone; we detect via
    //  matching the component name from the *pre-normalized* config — so we
    //  receive sharedComponents as a set and the caller marks field._component)
    const compName = (f as any)._component as string | undefined;
    if (compName && sharedComponents.has(compName)) {
      // Use shared schema function
      const fnName = `${compName}Schema`;
      const needsImage = fieldUsesImage(f);
      const call = needsImage ? `${fnName}(image)` : `${fnName}()`;
      // Apply optional/default on top of the shared schema call
      const withOptional = applyOptionalOrDefault(call, f);
      return `  ${f.name}: ${withOptional}`;
    }
    return `  ${f.name}: ${fieldToZod(f, fieldOpts)}`;
  });

  const schemaBody = `z.object({\n${schemaEntries.join(',\n')},\n})`;

  if (isGlob) {
    const needsImage = opts.imageMode === 'astro' && fields.some((f) => fieldTreeUsesImage(f));
    const schemaArg = needsImage
      ? `({ image }) =>\n    ${schemaBody}`
      : schemaBody;
    const loaderBase = entry.path.startsWith('./') ? entry.path : `./${entry.path}`;
    return `defineCollection({\n  loader: glob({ pattern: "**/*.{md,mdx}", base: "${loaderBase}" }),\n  schema: ${schemaArg},\n})`;
  }

  // file loader
  const path = entry.path.startsWith('./') ? entry.path : `./${entry.path}`;
  const ext = (entry.extension ?? '').toLowerCase();
  const needsImage = fields.some((f) => fieldTreeUsesImage(f));

  let schemaArg: string;
  if (needsImage && opts.imageMode === 'astro') {
    schemaArg = `({ image }) =>\n    ${schemaBody}`;
  } else {
    schemaArg = schemaBody;
  }

  if (ext === 'json') {
    const idOverride = opts.fileIds?.[entry.name];
    let mapExpr: string;
    if (idOverride) {
      mapExpr = `return items.map(item => ({ id: String((item as any)[${JSON.stringify(idOverride)}] ?? i), ...item }));`;
    } else {
      // Check for uuid or id field
      const hasUuid = fields.some((f) => f.name === 'uuid');
      const hasId = fields.some((f) => f.name === 'id');
      if (hasUuid) {
        mapExpr = `return items.map((item, i) => ({ id: String((item as any).uuid ?? i), ...item }));`;
      } else if (hasId) {
        mapExpr = `return items.map((item, i) => ({ id: String((item as any).id ?? i), ...item }));`;
      } else {
        mapExpr = `return items.map((item, i) => ({ id: String(i), ...item }));`;
      }
    }

    return `defineCollection({\n  loader: file(${JSON.stringify(path)}, {\n    parser: (text) => {\n      const items = JSON.parse(text) as Array<Record<string, unknown>>;\n      ${mapExpr}\n    },\n  }),\n  schema: ${schemaArg},\n})`;
  }

  return `defineCollection({\n  loader: file(${JSON.stringify(path)}),\n  schema: ${schemaArg},\n})`;
}

// ─── Image detection helpers ─────────────────────────────────────────────────

export function fieldUsesImage(field: Field): boolean {
  if (field.type === 'image') return true;
  if (field.fields) return field.fields.some(fieldTreeUsesImage);
  if (field.blocks) return field.blocks.some((b) => (b.fields ?? []).some(fieldTreeUsesImage));
  return false;
}

export function fieldTreeUsesImage(field: Field): boolean {
  return fieldUsesImage(field);
}
