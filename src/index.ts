import type { AstroIntegration } from 'astro';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { parseConfig, normalizeConfig } from './parse.js';
import { assembleFile } from './collect.js';
import type { PagesCMSOptions, ContentEntry, ComponentMap } from './types.js';

export default function pagesCMS(userOpts: PagesCMSOptions = {}): AstroIntegration {
  const {
    config: configPath = '.pages.yml',
    output: outputPath = 'src/content.config.ts',
    imageMode = 'astro',
    fileIds = {},
    watch = true,
  } = userOpts;

  function generate(root: string) {
    const absConfig = resolve(root, configPath);
    const absOutput = resolve(root, outputPath);

    const raw = readFileSync(absConfig, 'utf8');
    const { document } = parseConfig(raw);
    const normalized = normalizeConfig(document.toJSON());

    // Tag each top-level field with its originating component name so
    // shared-component detection can work after normalizeConfig inlines them.
    tagComponentFields(normalized);

    const content: ContentEntry[] = (normalized.content ?? []).filter(
      (e: any) => e.type === 'collection' || e.type === 'file',
    );
    const components: ComponentMap = normalized.components ?? {};

    const opts = { imageMode, fileIds };
    const source = assembleFile(content, components, opts);

    writeFileSync(absOutput, source, 'utf8');
  }

  return {
    name: 'astro-pagescms',
    hooks: {
      'astro:config:setup': ({ config, addWatchFile, logger }) => {
        const root = config.root ? config.root.pathname : process.cwd();

        try {
          generate(root);
          logger.info(`Generated ${outputPath}`);
        } catch (err) {
          logger.error(`Failed to generate ${outputPath}: ${(err as Error).message}`);
          throw err;
        }

        if (watch) {
          addWatchFile(resolve(root, configPath));
        }
      },
    },
  };
}

/**
 * Before normalizeConfig inlines component refs, the original YAML has
 * `component: seo` on a field. After normalization the `component` key is
 * removed and the fields are merged in. We need to re-tag them so that
 * collect.ts can detect shared component usage.
 *
 * We do this by running a second pass over the *raw* config and cross-
 * referencing with the normalized one by position.
 */
function tagComponentFields(normalized: any): void {
  if (!Array.isArray(normalized.content)) return;

  // We parse the original YAML again is not feasible here since we only have
  // the normalized object. Instead, we stored the component key before merging:
  // normalizeConfig calls resolveComponent which calls mergeWith. The original
  // component name is lost. So we tag by comparing field structure to components.
  //
  // Simpler approach: re-run over the original (pre-normalize) JSON to find
  // which fields had `component:` and tag the corresponding normalized fields.
  // But we don't have the pre-normalized object here.
  //
  // Instead: tag fields whose name matches a component key AND whose fields
  // match that component's fields (structural heuristic is good enough).
  const components: Record<string, any> = normalized.components ?? {};

  for (const entry of normalized.content) {
    if (!Array.isArray(entry.fields)) continue;
    for (const field of entry.fields) {
      if ((field as any)._component) continue;
      for (const [compName, compDef] of Object.entries(components)) {
        if (fieldMatchesComponent(field, compDef)) {
          (field as any)._component = compName;
          break;
        }
      }
    }
  }
}

function fieldMatchesComponent(field: any, compDef: any): boolean {
  if (!compDef || typeof compDef !== 'object') return false;
  if (field.type !== compDef.type) return false;

  const fieldFields: string[] = (field.fields ?? []).map((f: any) => f.name).sort();
  const compFields: string[] = (compDef.fields ?? []).map((f: any) => f.name).sort();

  if (fieldFields.length !== compFields.length) return false;
  return fieldFields.every((name, i) => name === compFields[i]);
}
