import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh';
import { THREADS_PROMPT_CATEGORY } from './types';
import type { ContentSettings, ThreadsPrompt, PlanAssignment, PlanSlot, PromptPlan, SavedLink, SkipDate, Topic, VoiceSample } from './types';

export interface ContentData {
  samples: VoiceSample[];
  topics: Topic[];
  plans: PromptPlan[];
  slots: PlanSlot[];
  assignments: PlanAssignment[];
  skipDates: SkipDate[];
  settings: ContentSettings;
  prompts: ThreadsPrompt[];
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
  'threads_voice_samples',
  'threads_topics',
  'threads_prompt_plans',
  'threads_plan_slots',
  'threads_plan_assignments',
  'threads_skip_dates',
  'threads_content_settings',
  'threads_links',
];
const POST_TABLES = ['threads_posts', 'threads_generation_jobs'];
const ALL_TABLES = [...LIBRARY_TABLES, ...POST_TABLES];

export function useContentData() {
  const [data, setData] = useState<ContentData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [postsVersion, setPostsVersion] = useState(0);

  const reload = useCallback(async () => {
    const [samples, topics, plans, slots, assignments, skips, settings, prompts, links] = await Promise.all([
      supabase.from('threads_voice_samples').select('id, name, content, created_at').order('created_at'),
      supabase.from('threads_topics').select('id, name, is_hidden, sort_order').order('sort_order'),
      supabase.from('threads_prompt_plans').select('id, name, description, active_days, account_ids, instagram_account_ids, created_at').order('created_at'),
      supabase.from('threads_plan_slots').select('*').order('post_time').order('position'),
      supabase.from('threads_plan_assignments').select('id, plan_id, start_week').order('start_week'),
      supabase.from('threads_skip_dates').select('id, skip_date, note').order('skip_date'),
      supabase.from('threads_content_settings').select('timezone').maybeSingle(),
      supabase.from('prompts').select('id, title, content').eq('category', THREADS_PROMPT_CATEGORY).order('title'),
      supabase.from('threads_links').select('id, name, url, created_at').order('name'),
    ]);
    const failed = [samples, topics, plans, slots, assignments, skips, settings, prompts, links].find((r) => r.error);
    if (failed) {
      setError('Could not load your Threads content library. Please refresh.');
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
      prompts: ((prompts.data || []) as ThreadsPrompt[]).filter((p) => p.content?.trim()),
      links: (links.data || []) as SavedLink[],
    });
  }, []);

  useEffect(() => {
    (async () => {
      await supabase.rpc('threads_seed_default_topics');
      const { data: existing } = await supabase.from('threads_content_settings').select('user_id').maybeSingle();
      if (!existing) {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        await supabase.from('threads_content_settings').insert({ timezone });
      }
      await reload();
      setLoading(false);
    })();
  }, [reload]);

  useRealtimeRefresh('threads_content', ALL_TABLES, (table) => {
    if (POST_TABLES.includes(table)) setPostsVersion((v) => v + 1);
    else reload();
  });

  return { data, loading, error, reload, postsVersion };
}
