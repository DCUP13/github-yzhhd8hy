import { Loader2 } from 'lucide-react';
import { ContentCalendar } from './ContentCalendar';
import { PromptPlans } from './PromptPlans';
import { Timeline } from './Timeline';
import { TopicLibrary } from './TopicLibrary';
import { LinkLibrary } from './LinkLibrary';
import { VoiceLibrary } from './VoiceLibrary';
import { PostsList } from './PostsList';
import { useContentData } from './useContentData';
import type { IgAccountLite, ThreadsAccount } from './types';

export type EngineTab = 'calendar' | 'posts' | 'plans' | 'timeline' | 'voice' | 'topics' | 'links';

interface Props {
  tab: EngineTab;
  accounts: ThreadsAccount[];
  igAccounts: IgAccountLite[];
}

export function ContentEngine({ tab, accounts, igAccounts }: Props) {
  const { data, loading, error, reload, postsVersion } = useContentData();

  if (loading) {
    return <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-sky-500" /></div>;
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
      return <ContentCalendar data={data} accounts={accounts} igAccounts={igAccounts} refreshKey={postsVersion} onLibraryChanged={reload} />;
    case 'posts':
      return <PostsList data={data} accounts={accounts} igAccounts={igAccounts} refreshKey={postsVersion} onLibraryChanged={reload} />;
    case 'plans':
      return <PromptPlans plans={data.plans} slots={data.slots} topics={data.topics} samples={data.samples} prompts={data.prompts} links={data.links} accounts={accounts} igAccounts={igAccounts} onChange={reload} />;
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
