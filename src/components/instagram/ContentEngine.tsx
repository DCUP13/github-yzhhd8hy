import { Loader2 } from 'lucide-react';
import { ContentCalendar } from './ContentCalendar';
import { PromptPlans } from './PromptPlans';
import { Timeline } from './Timeline';
import { TopicLibrary } from './TopicLibrary';
import { LinkLibrary } from './LinkLibrary';
import { VoiceLibrary } from './VoiceLibrary';
import { useContentData } from './useContentData';
import type { IgAccountLite } from './types';

export type EngineTab = 'calendar' | 'plans' | 'timeline' | 'voice' | 'topics' | 'links';

export function ContentEngine({ tab, accounts }: { tab: EngineTab; accounts: IgAccountLite[] }) {
  const { data, loading, error, reload, postsVersion } = useContentData();

  if (loading) {
    return <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-pink-500" /></div>;
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
      return <ContentCalendar skipDates={data.skipDates} links={data.links} accounts={accounts} refreshKey={postsVersion} />;
    case 'plans':
      return <PromptPlans plans={data.plans} slots={data.slots} topics={data.topics} samples={data.samples} prompts={data.prompts} imageTextPrompts={data.imageTextPrompts} links={data.links} accounts={accounts} onChange={reload} />;
    case 'timeline':
      return <Timeline plans={data.plans} assignments={data.assignments} skipDates={data.skipDates} settings={data.settings} onChange={reload} refreshKey={postsVersion} />;
    case 'voice':
      return <VoiceLibrary samples={data.samples} onChange={reload} />;
    case 'topics':
      return <TopicLibrary topics={data.topics} onChange={reload} />;
    case 'links':
      return <LinkLibrary links={data.links} slots={data.slots} onChange={reload} />;
  }
}
