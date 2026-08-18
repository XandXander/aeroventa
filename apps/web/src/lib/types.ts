export type ContentType = 'page' | 'service' | 'article' | 'project' | 'news' | 'landing' | 'legal';

export type BusinessRole =
  | 'PRIMARY_BRAND_HOME'
  | 'PRIMARY_COMMERCIAL'
  | 'CORE_SERVICE_HUB'
  | 'CORE_VENTILATION'
  | 'CORE_VENTILATION_CASE'
  | 'CORE_VENTILATION_CASE_HUB'
  | 'CORE_TRUST'
  | 'CORE_TRUST_CASE_HUB'
  | 'VENTILATION_AUTHORITY'
  | 'VENTILATION_CONTENT_HUB'
  | 'CONTENT_HUB'
  | 'SUPPORTING_CONTENT'
  | 'LEGACY_ACQUISITION';

export type LeadIntent = 'VENTILATION_PROJECT' | 'DRILLING_PARTNER' | string;

export interface ContentRecord {
  path: string;
  title: string;
  h1: string;
  content_type: ContentType;
  business_role: BusinessRole | string;
  status: string;
  robots_index: boolean;
  robots_follow?: boolean;
  sitemap_include?: boolean;
  knowledge_allowed?: boolean;
  ai_origin?: boolean;
  seo_title: string;
  seo_description: string;
  canonical_override?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image?: string | null;
  published_at?: string | null;
  updated_at_public?: string | null;
  schema_type?: string | null;
  schema_json_extra?: Record<string, unknown> | null;
  excerpt: string;
  body_html: string;
  body_html_safety_status?: 'fixture' | 'reviewed_safe' | 'not_applicable' | string | null;
  lead_intent?: LeadIntent | null;
  owner_approved_at: string | null;
}
