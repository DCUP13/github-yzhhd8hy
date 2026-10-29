export type MediaType = 'single' | 'carousel';
export type OverlayMode = 'none' | 'ai' | 'fixed';
export type GenerationStatus = 'none' | 'pending' | 'generating' | 'done' | 'failed';
export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'partial' | 'failed';

export interface VoiceSample {
  id: string;
  name: string;
  content: string;
  created_at: string;
}

export interface Topic {
  id: string;
  name: string;
  is_hidden: boolean;
  sort_order: number;
}

export interface PromptPlan {
  id: string;
  name: string;
  description: string;
  active_days: number[];
  account_ids: string[];
  created_at: string;
}

export interface PlanSlot {
  id: string;
  plan_id: string;
  day_of_week: number;
  position: number;
  post_time: string;
  prompt_id: string | null;
  extra_instructions: string;
  topic_id: string | null;
  voice_sample_id: string | null;
  media_type: MediaType;
  carousel_size: number;
  overlay_mode: OverlayMode;
  overlay_text: string;
  link_id: string | null;
}

export interface SavedLink {
  id: string;
  name: string;
  url: string;
  created_at: string;
}

export interface PlanAssignment {
  id: string;
  plan_id: string;
  start_week: string;
}

export interface SkipDate {
  id: string;
  skip_date: string;
  note: string;
}

export interface ContentSettings {
  timezone: string;
}

export interface PublishResult {
  account_id: string;
  status: string;
  permalink: string | null;
  error: string | null;
}

export interface ScheduledPost {
  id: string;
  plan_id: string | null;
  slot_id: string | null;
  generation_job_id: string | null;
  prompt_id: string | null;
  topic_id: string | null;
  topic_name: string | null;
  voice_sample_id: string | null;
  slot_date: string | null;
  scheduled_for: string;
  caption: string;
  hashtags: string[];
  media_type: MediaType;
  carousel_size: number;
  media_asset_ids: string[];
  media_urls: string[];
  overlay_mode: OverlayMode;
  overlay_text: string;
  account_ids: string[];
  link_id: string | null;
  status: PostStatus;
  generation_status: GenerationStatus;
  generation_error: string | null;
  publish_error: string | null;
  publish_results: PublishResult[];
  published_at: string | null;
}

export interface IgAccountLite {
  id: string;
  username: string | null;
  profile_picture_url: string | null;
}

export interface LibraryAsset {
  id: string;
  cloudfront_url: string;
  file_name: string;
  file_type: 'image' | 'video';
}

export interface InstagramPrompt {
  id: string;
  title: string;
  content: string;
}

export const PINK = {
  input:
    'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500/40 focus:border-pink-500 transition-shadow',
  primary:
    'inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-pink-600 text-white hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
};

export function fullCaption(caption: string, hashtags: string[], link: string): string {
  return [caption.trim(), link.trim(), hashtags.join(' ')].filter(Boolean).join('\n\n');
}

export function isValidLink(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export function linkLabel(link: SavedLink): string {
  return link.name.trim() && link.name.trim() !== link.url ? `${link.name} - ${link.url}` : link.url;
}
