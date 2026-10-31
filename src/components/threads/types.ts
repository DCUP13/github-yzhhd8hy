export type GenerationStatus = 'none' | 'pending' | 'generating' | 'done' | 'failed';
export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'partial' | 'failed' | 'deleted';
export type PhotoMode = 'none' | 'library' | 'upload';

export const MAX_CHARS = 500;
export const MAX_PHOTOS = 10;

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
  instagram_account_ids: string[];
  created_at: string;
}

export interface PlanSlot {
  id: string;
  plan_id: string;
  day_of_week: number;
  position: number;
  post_time: string;
  prompt_id: string | null;
  thread_prompt: string;
  extra_instructions: string;
  topic_id: string | null;
  voice_sample_id: string | null;
  link_id: string | null;
  photo_mode: PhotoMode;
  photo_count: number;
  photo_urls: string[];
  also_instagram: boolean;
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
  username: string | null;
  ok: boolean;
  media_id?: string;
  permalink?: string;
  error?: string;
  deleted?: boolean;
}

export interface ScheduledPost {
  id: string;
  plan_id: string | null;
  slot_id: string | null;
  prompt_id: string | null;
  thread_prompt: string | null;
  topic_id: string | null;
  topic_name: string | null;
  voice_sample_id: string | null;
  slot_date: string | null;
  scheduled_for: string | null;
  content_text: string;
  link_id: string | null;
  photo_mode: PhotoMode;
  photo_count: number;
  media_urls: string[];
  media_asset_ids: string[];
  account_ids: string[];
  also_instagram: boolean;
  instagram_account_ids: string[];
  instagram_post_id: string | null;
  status: PostStatus;
  generation_status: GenerationStatus;
  generation_error: string | null;
  publish_error: string | null;
  publish_results: PublishResult[];
  published_at: string | null;
  views: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  shares: number;
  insights_synced_at: string | null;
  created_at: string;
}

export interface ThreadsAccount {
  id: string;
  username: string | null;
  name: string | null;
  profile_picture_url: string | null;
  followers_count: number | null;
  connected: boolean;
  token_expired: boolean;
  token_expires_at: string | null;
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
}

export interface ThreadsPrompt {
  id: string;
  title: string;
  content: string;
}

export const THREADS_PROMPT_CATEGORY = 'Threads';

export const THEME = {
  input:
    'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-shadow',
  primary:
    'inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-gray-900 text-white hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
};

export const POST_COLUMNS = '*';

export function fullText(text: string, link: string): string {
  return [text.trim(), link.trim()].filter(Boolean).join('\n\n');
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
