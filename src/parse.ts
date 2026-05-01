import YAML from 'yaml';
import mergeWith from 'lodash.mergewith';

const extensionCategories: Record<string, string[]> = {
  image: ['jpg', 'jpeg', 'apng', 'png', 'gif', 'svg', 'ico', 'avif', 'bmp', 'tif', 'tiff', 'webp'],
  document: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'vxls', 'xlsx', 'txt', 'rtf'],
  video: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mpeg', 'webm', 'ogv', 'ts', '3gp', '3g2'],
  audio: ['mp3', 'wav', 'aac', 'ogg', 'flac', 'weba', 'oga', 'opus', 'mid', 'midi'],
  compressed: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz', 'bz2'],
  code: ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'scss', 'json', 'xml', 'yaml', 'yml', 'md', 'py', 'rb'],
  font: ['ttf', 'otf', 'woff', 'woff2', 'eot'],
  spreadsheet: ['csv', 'tsv', 'ods'],
};

function getFileExtension(path: string): string {
  const filename = path.split('/').pop() ?? '';
  if (filename.startsWith('.') && !filename.includes('.', 1)) return '';
  const m = /(?:\.([^.]+))?$/.exec(filename);
  return m?.[1] ?? '';
}

export function parseConfig(content: string) {
  const document = YAML.parseDocument(content, { strict: false, prettyErrors: false });
  const errors = document.errors.map((error) => ({
    severity: 'error' as const,
    from: error.pos ? error.pos[0] : null,
    to: error.pos ? error.pos[1] : null,
    message: error.message,
  }));
  return { document, errors };
}

export function normalizeConfig(configObject: any): any {
  if (!configObject) return {};

  const cfg = JSON.parse(JSON.stringify(configObject));

  // Normalise legacy root toggles into settings
  if (cfg.settings === false) {
    cfg.settings = { config: false };
  } else if (typeof cfg.settings !== 'object' || cfg.settings == null) {
    cfg.settings = {};
  }
  if (typeof cfg.cache === 'boolean' && cfg.settings.cache == null) {
    cfg.settings.cache = cfg.cache;
  }
  if (typeof cfg.hide === 'boolean' && cfg.settings.config == null) {
    cfg.settings.config = !cfg.hide;
  }
  delete cfg.cache;
  delete cfg.hide;

  // Resolve component references within components map itself
  if (cfg.components && typeof cfg.components === 'object') {
    for (const key of Object.keys(cfg.components)) {
      cfg.components[key] = resolveComponent(cfg.components[key], cfg.components);
    }
  }

  // Normalise media
  if (cfg.media) {
    if (typeof cfg.media === 'string') {
      const rel = cfg.media.replace(/^\/|\/$/g, '');
      cfg.media = [{ name: 'default', label: 'Media', input: rel, output: `/${rel}` }];
    } else if (typeof cfg.media === 'object' && !Array.isArray(cfg.media)) {
      cfg.media = [{ name: 'default', label: 'Media', ...cfg.media }];
    }
    cfg.media = cfg.media.map((m: any) => {
      if (m.input != null) m.input = m.input.replace(/^\/|\/$/g, '');
      if (m.output != null && m.output !== '/') m.output = m.output.replace(/\/$/, '');
      if (m.categories != null && m.extensions == null && Array.isArray(m.categories)) {
        m.extensions = m.categories.flatMap((c: string) => extensionCategories[c] ?? []);
        delete m.categories;
      } else if (m.categories != null) {
        delete m.categories;
      }
      return m;
    });
  }

  // Normalise content
  if (Array.isArray(cfg.content) && cfg.content.length > 0) {
    const result = normalizeContentEntries(cfg.content, cfg.components ?? {});
    cfg.content = result.items;
  }

  // Normalise settings
  if (cfg.settings && typeof cfg.settings === 'object') {
    if (typeof cfg.settings.hide === 'boolean' && cfg.settings.config == null) {
      cfg.settings.config = !cfg.settings.hide;
    }
    delete cfg.settings.hide;
  }

  return cfg;
}

function normalizeContentEntries(
  entries: any[],
  componentsMap: Record<string, any>,
): { items: any[]; navigation: any[] } {
  const items: any[] = [];
  const navigation: any[] = [];

  for (const entry of entries) {
    if (entry?.type === 'group') {
      const nested = normalizeContentEntries(entry.items ?? [], componentsMap);
      navigation.push({ type: 'group', name: entry.name, label: entry.label ?? entry.name, items: nested.navigation });
      items.push(...nested.items);
      continue;
    }
    const norm = normalizeContentEntry(entry, componentsMap);
    items.push(norm);
    navigation.push({ type: norm.type, name: norm.name, label: norm.label ?? norm.name });
  }

  return { items, navigation };
}

function normalizeContentEntry(item: any, componentsMap: Record<string, any>): any {
  if (item.path != null) item.path = item.path.replace(/^\/|\/$/g, '');

  if (item.type === 'collection' && item.filename && typeof item.filename === 'object') {
    if (typeof item.filename.template === 'string') {
      item.filename = item.filename.template;
    }
  }
  if (item.filename == null && item.type === 'collection') {
    item.filename = '{year}-{month}-{day}-{primary}.md';
  }
  if (item.extension == null) {
    const src = item.type === 'file' ? item.path : item.filename;
    item.extension = getFileExtension(src ?? '');
  }
  if (item.format == null) {
    item.format = 'raw';
    if (item.fields?.length > 0) {
      switch (item.extension) {
        case 'json': item.format = 'json'; break;
        case 'toml': item.format = 'toml'; break;
        case 'yaml': case 'yml': item.format = 'yaml'; break;
        default: item.format = 'yaml-frontmatter'; break;
      }
    }
  }

  if (Array.isArray(item.fields)) {
    item.fields = item.fields.map((f: any) => resolveComponent(f, componentsMap));
  }

  return item;
}

function resolveComponent(field: any, componentsMap: Record<string, any>): any {
  let result = JSON.parse(JSON.stringify(field));

  if (result.component && typeof result.component === 'string') {
    const key = result.component;
    const def = componentsMap[key];
    if (def) {
      const defCopy = JSON.parse(JSON.stringify(def));
      const originalName = result.name;
      const componentType = defCopy.type;
      delete result.component;
      result = mergeWith({}, defCopy, result, (obj: any, src: any) => {
        if (Array.isArray(src)) return src;
      });
      result.name = originalName;
      result.type = componentType;
    } else {
      delete result.component;
    }
  }

  if (Array.isArray(result.fields) && result.fields.length > 0 && result.type === undefined) {
    result.type = 'object';
  }

  if (Array.isArray(result.fields)) {
    result.fields = result.fields.map((f: any) => resolveComponent(f, componentsMap));
  }
  if (Array.isArray(result.blocks)) {
    result.blocks = result.blocks.map((b: any) => resolveComponent(b, componentsMap));
  }

  return result;
}
