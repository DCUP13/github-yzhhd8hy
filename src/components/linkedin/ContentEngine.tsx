import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ContentCalendar } from './ContentCalendar';
import { PromptPlans } from './PromptPlans';
import { Timeline } from './Timeline';
import { TopicLibrary } from './TopicLibrary';
import { VoiceLibrary } from './VoiceLibrary';
import { useContentData } from './useContentData';

export type EngineTab = 'calendar' | 'plans' | 'timeline' | 'voice' | 'topics';

export function ContentEngine({ tab }: { tab: EngineTab }) {
  const { data, loading, error, reload, postsVersion: livePostsVersion } = useContentData();
  const [postsVersion, setPostsVersion] = useState(0);
  const postsKey = postsVersion + livePostsVersion;

  if (loading) {
    return <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#0A66C2]" /></div>;
  }
  if (error) {
    return (
      <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
        {error} <button onClick={reload} className="underline font-medium">Try again</button>
      </div>
    );
  }

  switch (tab) {
    case 'calendar':
      return <ContentCalendar skipDates={data.skipDates} leadDays={data.settings.research_lead_days} refreshKey={postsKey} />;
    case 'plans':
      return <PromptPlans plans={data.plans} slots={data.slots} topics={data.topics} samples={data.samples} onChange={reload} />;
    case 'timeline':
      return (
        <Timeline
          plans={data.plans}
          assignments={data.assignments}
          skipDates={data.skipDates}
          settings={data.settings}
          onChange={reload}
          refreshKey={postsKey}
          onPostsChanged={() => setPostsVersion((v) => v + 1)}
        />
      );
    case 'voice':
      return <VoiceLibrary samples={data.samples} onChange={reload} />;
    case 'topics':
      return <TopicLibrary topics={data.topics} onChange={reload} />;
  }
}
