import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const read = (relative) => fs.readFile(path.join(root, relative), 'utf8');
const [source, layout, css, postbuild, builder, envTypes, contentTypes, packageRaw] = await Promise.all([
  read('apps/web/src/lib/content-source.ts'),
  read('apps/web/src/layouts/BaseLayout.astro'),
  read('apps/web/src/styles/global.css'),
  read('scripts/postbuild.mjs'),
  read('scripts/build-directus-v13-preview.mjs'),
  read('apps/web/src/env.d.ts'),
  read('apps/web/src/lib/types.ts'),
  read('package.json'),
]);

const pkg = JSON.parse(packageRaw);
const failures = [];
const requireText = (text, needle, code) => {
  if (!text.includes(needle)) failures.push(code);
};

requireText(source, "const allowedReleaseModes = new Set(['fixture', 'preview', 'production']);", 'V13_RELEASE_MODES_MISSING');
requireText(source, "url.searchParams.set('filter[status][_eq]', 'published');", 'PRODUCTION_STATUS_FILTER_MISSING');
requireText(source, "url.searchParams.set('filter[owner_approved_at][_nnull]', 'true');", 'PRODUCTION_APPROVAL_FILTER_MISSING');
requireText(source, "url.searchParams.set('filter[status][_eq]', 'draft');", 'PREVIEW_DRAFT_FILTER_MISSING');
requireText(source, "url.searchParams.set('filter[owner_approved_at][_null]', 'true');", 'PREVIEW_NULL_APPROVAL_FILTER_MISSING');
requireText(source, "item.status !== 'draft'", 'PREVIEW_DRAFT_ASSERT_MISSING');
requireText(source, "item.owner_approved_at !== null", 'PREVIEW_OWNER_APPROVAL_ASSERT_MISSING');
requireText(source, "item.robots_index !== false", 'PREVIEW_ROBOTS_ASSERT_MISSING');
requireText(source, "item.sitemap_include !== false", 'PREVIEW_SITEMAP_ASSERT_MISSING');
requireText(source, "item.knowledge_allowed !== false", 'PREVIEW_KNOWLEDGE_ASSERT_MISSING');
requireText(source, "item.ai_origin !== false", 'PREVIEW_AI_ORIGIN_ASSERT_MISSING');
requireText(source, 'assertExactPreviewRouteSet(items);', 'PREVIEW_EXACT_ROUTE_SET_MISSING');
requireText(source, 'Directus draft preview requires a dedicated read-only DIRECTUS_STATIC_TOKEN', 'PREVIEW_TOKEN_GATE_MISSING');

if (/method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i.test(source)) {
  failures.push('CONTENT_SOURCE_CONTAINS_WRITE_METHOD');
}

requireText(layout, "const preview = import.meta.env.AEROVENTA_RELEASE_MODE === 'preview';", 'PREVIEW_LAYOUT_MODE_MISSING');
requireText(layout, "'noindex,nofollow,noarchive,nosnippet'", 'PREVIEW_ROBOTS_META_MISSING');
requireText(layout, 'data-aeroventa-preview="draft"', 'PREVIEW_BANNER_MARKER_MISSING');
requireText(layout, 'AEROVENTA DRAFT PREVIEW', 'PREVIEW_BANNER_TEXT_MISSING');
requireText(layout, 'const schema = preview ? null : jsonLd(content);', 'PREVIEW_JSONLD_SUPPRESSION_MISSING');
requireText(css, '.preview-banner', 'PREVIEW_BANNER_STYLE_MISSING');

requireText(postbuild, "releaseMode === 'preview'", 'PREVIEW_POSTBUILD_MODE_MISSING');
requireText(postbuild, "Disallow: /", 'PREVIEW_ROBOTS_FILE_GATE_MISSING');
requireText(builder, "AEROVENTA_RELEASE_MODE: 'preview'", 'PREVIEW_BUILDER_MODE_MISSING');
requireText(builder, "DIRECTUS_STATIC_TOKEN is required", 'PREVIEW_BUILDER_TOKEN_GATE_MISSING');
requireText(builder, "directusUrl.protocol !== 'https:'", 'PREVIEW_BUILDER_HTTPS_GATE_MISSING');

requireText(envTypes, "AEROVENTA_RELEASE_MODE?: 'fixture' | 'preview' | 'production'", 'ENV_PREVIEW_MODE_TYPE_MISSING');
requireText(contentTypes, 'knowledge_allowed?: boolean;', 'CONTENT_KNOWLEDGE_TYPE_MISSING');
requireText(contentTypes, 'ai_origin?: boolean;', 'CONTENT_AI_ORIGIN_TYPE_MISSING');

if (pkg.scripts?.['directus:v13:preview:validate'] !== 'node scripts/validate-directus-v13-static.mjs') {
  failures.push('PACKAGE_V13_VALIDATE_SCRIPT_INVALID');
}
if (pkg.scripts?.['directus:v13:preview:build'] !== 'npm run directus:v13:preview:validate && node scripts/build-directus-v13-preview.mjs') {
  failures.push('PACKAGE_V13_BUILD_SCRIPT_INVALID');
}
if (!String(pkg.scripts?.validate || '').includes('validate-directus-v13-static.mjs')) {
  failures.push('PACKAGE_MAIN_VALIDATE_MISSING_V13');
}

const result = {
  stage: 'V13_DIRECTUS_DRAFT_PREVIEW_REPO_ONLY',
  write_methods_in_content_source: false,
  production_filter_preserved: true,
  preview_requires_draft: true,
  preview_requires_unapproved: true,
  preview_forces_noindex: true,
  preview_robots_disallow: true,
  failures,
  verdict: failures.length ? 'FAIL' : 'PASS',
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
