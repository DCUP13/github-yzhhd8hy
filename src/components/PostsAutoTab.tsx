import { useState, type ComponentType } from 'react';
import {
  CalendarDays, ListChecks, GanttChartSquare, Mic, Tags, Link2, Image as ImageIcon, MessageSquare,
} from 'lucide-react';
import { ContentEngine, type EngineTab } from './instagram/ContentEngine';
import { LibraryView, type LibraryAccount } from './instagram/LibraryView';
import { FeedView, type CommentEvent, type SnapshotData } from './instagram/FeedView';

interface PostsAutoTabProps {
  accounts: LibraryAccount[];
  userId: string;
  commentEvents?: CommentEvent[];
  selectedAccount?: { id: string; owner_profile_id: string | null; page_scoped_id: string | null } | null;
  snapshots?: SnapshotData[];
  onSynced?: () => void;
}

type SubView = EngineTab | 'library' | 'feed';

const SUB_TABS: Array<{ id: SubView; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'plans', label: 'Plans', icon: ListChecks },
  { id: 'timeline', label: 'Timeline', icon: GanttChartSquare },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'topics', label: 'Topics', icon: Tags },
  { id: 'links', label: 'Links', icon: Link2 },
  { id: 'library', label: 'Content Library', icon: ImageIcon },
  { id: 'feed', label: 'Feed', icon: MessageSquare },
];

export function PostsAutoTab({ accounts, userId, commentEvents = [], selectedAccount, snapshots = [], onSynced }: PostsAutoTabProps) {
  const [subView, setSubView] = useState<SubView>('calendar');
  const liteAccounts = accounts.map(a => ({ id: a.id, username: a.username, profile_picture_url: a.profile_picture_url }));

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      <nav className="flex flex-wrap gap-2 mb-4">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubView(tab.id)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
              subView === tab.id
                ? 'bg-pink-500 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </nav>

      {subView === 'library' ? (
        <LibraryView accounts={accounts} userId={userId} />
      ) : subView === 'feed' ? (
        <FeedView
          userId={userId}
          commentEvents={commentEvents}
          selectedAccount={selectedAccount}
          snapshots={snapshots}
          onSynced={onSynced}
        />
      ) : (
        <ContentEngine tab={subView} accounts={liteAccounts} />
      )}
    </div>
  );
}
