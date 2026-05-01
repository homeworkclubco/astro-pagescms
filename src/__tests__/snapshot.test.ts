import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseConfig, normalizeConfig } from '../parse.js';
import { assembleFile } from '../collect.js';
import type { ContentEntry, ComponentMap } from '../types.js';

const FIXTURE = resolve(__dirname, '../../fixtures/example-pages-config.yml');

function loadFixture() {
  const raw = readFileSync(FIXTURE, 'utf8');
  const { document } = parseConfig(raw);
  return normalizeConfig(document.toJSON());
}

describe('assembleFile snapshot', () => {
  it('generates expected output from example-pages-config.yml', () => {
    const normalized = loadFixture();
    const content: ContentEntry[] = (normalized.content ?? []).filter(
      (e: any) => e.type === 'collection' || e.type === 'file',
    );
    const components: ComponentMap = normalized.components ?? {};
    const result = assembleFile(content, components, { imageMode: 'astro' });

    // Basic structural checks
    expect(result).toContain("import { file, glob } from 'astro/loaders'");
    expect(result).toContain("import { z } from 'astro/zod'");
    expect(result).toContain("import { defineCollection } from 'astro:content'");
    expect(result).toContain('export const collections =');
    expect(result).toContain('glob({');
    expect(result).toContain('file(');

    // Snapshot
    expect(result).toMatchSnapshot();
  });

  it('imageMode:string uses z.string() for images', () => {
    const normalized = loadFixture();
    const content: ContentEntry[] = (normalized.content ?? []).filter(
      (e: any) => e.type === 'collection' || e.type === 'file',
    );
    const components: ComponentMap = normalized.components ?? {};
    const result = assembleFile(content, components, { imageMode: 'string' });
    expect(result).not.toContain('image()');
    expect(result).not.toContain('({ image })');
    expect(result).toMatchSnapshot();
  });
});
