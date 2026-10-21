import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { ContentSettings, PlanAssignment, PlanSlot, PromptPlan, SkipDate, Topic, VoiceSample } from './types';

export interface ContentData {
  samples: VoiceSample[];
  topics: Topic[];
  plans: PromptPlan[];
  slots: PlanSlot[];
  assignments: PlanAssignment[];
  skipDates: SkipDate[];
  settings: ContentSettings;
}

const EMPTY: ContentData = {
  samples: [],
  topics: [],
  plans: [],
  slots: [],
  assignments: [],
  skipDates: [],
  settings: { timezone: 'UTC', research_lead_days: 3 },
};

export function useContentData() {
  const [data, setData] = useState<ContentData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [samples, topics, plans, slots, assignments, skips, settings] = await Promise.all([
      supabase.from('linkedin_voice_samples').select('id, name, content, created_at').order('created_at'),
      supabase.from('linkedin_topics').select('id, category, name, is_hidden, sort_order').order('sort_order'),
      supabase.from('linkedin_prompt_plans').select('id, name, description, active_days, created_at').order('created_at'),
      supabase.from('linkedin_plan_slots').select('*').order('post_time').order('position'),
      supabase.from('linkedin_plan_assignments').select('id, plan_id, start_week').order('start_week'),
      supabase.from('linkedin_skip_dates').select('id, skip_date, note').order('skip_date'),
      supabase.from('linkedin_content_settings').select('timezone, research_lead_days').maybeSingle(),
    ]);
    const failed = [samples, topics, plans, slots, assignments, skips, settings].find((r) => r.error);
    if (failed) {
      setError('Could not load your content library. Please refresh.');
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
    });
  }, []);

  useEffect(() => {
    (async () => {
      await supabase.rpc('linkedin_seed_default_topics');
      const { data: existing } = await supabase.from('linkedin_content_settings').select('user_id').maybeSingle();
      if (!existing) {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        await supabase.from('linkedin_content_settings').insert({ timezone });
      }
      await reload();
      setLoading(false);
    })();
  }, [reload]);

  return { data, loading, error, reload };
}
