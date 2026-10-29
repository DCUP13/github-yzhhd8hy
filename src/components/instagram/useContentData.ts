import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh';
import type { ContentSettings, InstagramPrompt, PlanAssignment, PlanSlot, PromptPlan, SavedLink, SkipDate, Topic, VoiceSample } from './types';

export interface ContentData {
  samples: VoiceSample[];
  topics: Topic[];
  plans: PromptPlan[];
  slots: PlanSlot[];
  assignments: PlanAssignment[];
  skipDates: SkipDate[];
  settings: ContentSettings;
  prompts: InstagramPrompt[];
  links: SavedLink[];
}

const EMPTY: ContentData = {
  samples: [],
  topics: [],
  plans: [],
  slots: [],
  assignments: [],
  skipDates: [],
  settings: { timezone: 'UTC' },
  prompts: [],
  links: [],
};

const LIBRARY_TABLES = [
  'instagram_voice_samples',
  'instagram_topics',
  'instagram_prompt_plans',
  'instagram_plan_slots',
  'instagram_plan_assignments',
  'instagram_skip_dates',
  'instagram_content_settings',
  'instagram_links',
];
const POST_TABLES = ['instagram_scheduled_posts', 'instagram_generation_jobs'];
const ALL_TABLES = [...LIBRARY_TABLES, ...POST_TABLES];

export function useContentData() {
  const [data, setData] = useState<ContentData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [postsVersion, setPostsVersion] = useState(0);

  const reload = useCallback(async () => {
    const [samples, topics, plans, slots, assignments, skips, settings, prompts, links] = await Promise.all([
      supabase.from('instagram_voice_samples').select('id, name, content, created_at').order('created_at'),
      supabase.from('instagram_topics').select('id, name, is_hidden, sort_order').order('sort_order'),
      supabase.from('instagram_prompt_plans').select('id, name, description, active_days, account_ids, created_at').order('created_at'),
      supabase.from('instagram_plan_slots').select('*').order('post_time').order('position'),
      supabase.from('instagram_plan_assignments').select('id, plan_id, start_week').order('start_week'),
      supabase.from('instagram_skip_dates').select('id, skip_date, note').order('skip_date'),
      supabase.from('instagram_content_settings').select('timezone').maybeSingle(),
      supabase.from('prompts').select('id, title, content').eq('category', 'Instagram').order('title'),
      supabase.from('instagram_links').select('id, name, url, created_at').order('name'),
    ]);
    const failed = [samples, topics, plans, slots, assignments, skips, settings, prompts, links].find((r) => r.error);
    if (failed) {
      setError('Could not load your Instagram content library. Please refresh.');
      return;
    }
    setError(null);
    setData({
      samples: (samples.data || []) as VoiceSample[],
      topics: (topics.data || []) as Topic[],
      plans: (plans.data || []) as PromptPlan[],
      slots: (slots.data || []) as PlanSlot[],
      assignments: (assignments.data || []) as PlanAssignment[],
      skipDates: (skips.data || []) as SkipDate[],
      settings: (settings.data as ContentSettings | null) || EMPTY.settings,
      prompts: ((prompts.data || []) as InstagramPrompt[]).filter((p) => p.content?.trim()),
      links: (links.data || []) as SavedLink[],
    });
  }, []);

  useEffect(() => {
    (async () => {
      await supabase.rpc('instagram_seed_default_topics');
      const { data: existing } = await supabase.from('instagram_content_settings').select('user_id').maybeSingle();
      if (!existing) {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        await supabase.from('instagram_content_settings').insert({ timezone });
      }
      await reload();
      setLoading(false);
    })();
  }, [reload]);

  useRealtimeRefresh('instagram_content', ALL_TABLES, (table) => {
    if (POST_TABLES.includes(table)) setPostsVersion((v) => v + 1);
    else reload();
  });

  return { data, loading, error, reload, postsVersion };
}
