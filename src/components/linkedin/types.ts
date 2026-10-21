export type Category = 'mindset' | 'topical' | 'research';
export type GuideMode = 'none' | 'ai' | 'upload';
export type GuideLength = 'short' | 'medium' | 'long';
export type GenerationStatus = 'none' | 'pending' | 'generating' | 'done' | 'failed';

export interface VoiceSample {
  id: string;
  name: string;
  content: string;
  created_at: string;
}

export interface Topic {
  id: string;
  category: Category;
  name: string;
  is_hidden: boolean;
  sort_order: number;
}

export interface PromptPlan {
  id: string;
  name: string;
  description: string;
  active_days: number[];
  created_at: string;
}

export interface PlanSlot {
  id: string;
  plan_id: string;
  day_of_week: number;
  position: number;
  post_time: string;
  category: Category;
  topic_id: string | null;
  voice_sample_id: string | null;
  prompt: string;
  guide_mode: GuideMode;
  guide_length: GuideLength;
  guide_prompt: string;
  upload_document_url: string | null;
  upload_document_name: string | null;
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
  research_lead_days: number;
}

export interface ResearchSource {
  title: string;
  subreddit: string;
  score: number;
  num_comments: number;
  url: string;
  excerpt: string;
  top_comments: string[];
}

export interface EnginePost {
  id: string;
  content_text: string;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  error_message: string | null;
  plan_id: string | null;
  slot_id: string | null;
  generation_job_id: string | null;
  category: Category | null;
  topic_id: string | null;
  topic_name: string | null;
  voice_sample_id: string | null;
  week_start: string | null;
  slot_date: string | null;
  generation_status: GenerationStatus;
  generation_error: string | null;
  generation_prompt: string | null;
  guide_mode: GuideMode;
  guide_length: GuideLength;
  guide_prompt: string | null;
  needs_review: boolean;
  reviewed_at: string | null;
  research_summary: string | null;
  research_sources: ResearchSource[];
  research_subreddits: string[];
  document_url: string | null;
  document_name: string | null;
  article_title: string | null;
  post_type: string;
}

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'mindset', label: 'Mindset' },
  { value: 'topical', label: 'Topical' },
  { value: 'research', label: 'Research' },
];

export const CATEGORY_STYLES: Record<Category, { dot: string; chip: string; bar: string }> = {
  mindset: {
    dot: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
    bar: 'border-l-amber-500',
  },
  topical: {
    dot: 'bg-sky-500',
    chip: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800',
    bar: 'border-l-sky-500',
  },
  research: {
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
    bar: 'border-l-emerald-500',
  },
};

export const GUIDE_LENGTHS: { value: GuideLength; label: string }[] = [
  { value: 'short', label: 'Short (3-5 pages)' },
  { value: 'medium', label: 'Medium (6-10 pages)' },
  { value: 'long', label: 'Long (11-15 pages)' },
];

// Display order Monday-first; values match JavaScript getDay() (0 = Sunday).
export const WEEK_DAYS: { value: number; short: string; long: string }[] = [
  { value: 1, short: 'Mon', long: 'Monday' },
  { value: 2, short: 'Tue', long: 'Tuesday' },
  { value: 3, short: 'Wed', long: 'Wednesday' },
  { value: 4, short: 'Thu', long: 'Thursday' },
  { value: 5, short: 'Fri', long: 'Friday' },
  { value: 6, short: 'Sat', long: 'Saturday' },
  { value: 0, short: 'Sun', long: 'Sunday' },
];
