import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, AtSign, CalendarDays, CalendarRange, CheckCircle2, LayoutGrid, Link2, Loader2, Mic, Newspaper, Plus, RefreshCw, Tags, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { showConfirm } from '../lib/confirm';
import type { AppView } from '../lib/router';
import { useRealtimeRefresh } from '../lib/useRealtimeRefresh';
import { startThreadsConnect } from './threads/api';
import { ContentEngine, type EngineTab } from './threads/ContentEngine';
import type { IgAccountLite, ThreadsAccount } from './threads/types';

const TABS: { id: EngineTab; label: string; icon: typeof AtSign }[] = [
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'posts', label: 'Posts', icon: Newspaper },
  { id: 'plans', label: 'Prompt Plans', icon: LayoutGrid },
  { id: 'timeline', label: 'Timeline', icon: CalendarRange },
  { id: 'voice', label: 'Voice Library', icon: Mic },
  { id: 'topics', label: 'Topics', icon: Tags },
  { id: 'links', label: 'Links', icon: Link2 },
];

const ACCOUNT_COLUMNS = 'id, username, name, profile_picture_url, followers_count, connected, token_expired, token_expires_at';

interface ThreadsProps {
  onSignOut: () => void;
  currentView: AppView;
  queryParams: Record<string, string>;
  navigateToApp: (view: AppView, params?: Record<string, string>) => void;
}

export function Threads({ queryParams, navigateToApp }: ThreadsProps) {
  const [accounts, setAccounts] = useState<ThreadsAccount[]>([]);
  const [igAccounts, setIgAccounts] = useState<IgAccountLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [tab, setTab] = useState<EngineTab>('calendar');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadAccounts = useCallback(async () => {
    const [threads, ig] = await Promise.all([
      supabase.from('threads_accounts').select(ACCOUNT_COLUMNS).order('created_at'),
      supabase.from('instagram_accounts').select('id, username, profile_picture_url').eq('connected', true).order('created_at'),
    ]);
    setLoading(false);
    if (threads.error) { setLoadError(true); return; }
    setLoadError(false);
    setAccounts((threads.data || []) as ThreadsAccount[]);
    setIgAccounts((ig.data || []) as IgAccountLite[]);
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  useRealtimeRefresh('threads_accounts', ['threads_accounts'], () => loadAccounts());

  useEffect(() => {
    if (queryParams.threads_connected) {
      setNotice({ type: 'success', text: `Connected @${queryParams.threads_connected} to Threads.` });
      navigateToApp('threads');
    } else if (queryParams.threads_error) {
      setNotice({ type: 'error', text: `Threads connection failed: ${queryParams.threads_error}` });
      navigateToApp('threads');
    }
  }, [queryParams.threads_connected, queryParams.threads_error, navigateToApp]);

  const connect = async () => {
    setConnecting(true);
    try {
      // Threads blocks being shown inside an embedded frame, so sign-in opens in a new tab.
      window.open(await startThreadsConnect(), '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start the Threads connection');
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async (a: ThreadsAccount) => {
    const ok = await showConfirm({
      message: `Disconnect @${a.username ?? 'this profile'}? Scheduled posts will no longer go to it. Posts already on Threads stay there.`,
      variant: 'danger',
      confirmText: 'Disconnect',
    });
    if (!ok) return;
    const { error } = await supabase.from('threads_accounts').delete().eq('id', a.id);
    if (error) { toast.error('Could not disconnect'); return; }
    toast.success('Disconnected');
    loadAccounts();
  };

  if (loading) {
    return (
      <div className="flex-1 p-8 bg-white dark:bg-gray-900 flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const connected = accounts.filter((a) => a.connected);

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-white dark:bg-gray-900 min-h-screen overflow-x-hidden">
      <div className="max-w-7xl mx-auto w-full min-w-0 space-y-6">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-gray-900 dark:bg-white flex items-center justify-center">
            <AtSign className="w-5 h-5 text-white dark:text-gray-900" />
          </span>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Threads</h1>
        </div>

        {notice && (
          <div className={`flex items-start gap-3 p-4 rounded-lg border ${notice.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
            {notice.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />}
            <p className={`text-sm flex-1 ${notice.type === 'success' ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>{notice.text}</p>
            <button onClick={() => setNotice(null)} aria-label="Dismiss"><X className="w-4 h-4 text-gray-400 hover:text-gray-600" /></button>
          </div>
        )}

        {loadError && (
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
            Could not load your Threads profiles. <button onClick={loadAccounts} className="underline font-medium">Try again</button>
          </div>
        )}

        {accounts.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-center py-12 px-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-900 dark:bg-white flex items-center justify-center">
              <AtSign className="w-8 h-8 text-white dark:text-gray-900" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Connect your Threads profile</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto leading-relaxed">
              Schedule text posts, add photos from your content library when you want them, and track views and likes. You can also send the same post to Instagram.
            </p>
            <button onClick={connect} disabled={connecting} className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gray-900 text-white font-medium hover:bg-black dark:bg-white dark:text-gray-900 disabled:opacity-50 transition-colors">
              {connecting ? <Loader2 className="w-5 h-5 animate-spin" /> : <AtSign className="w-5 h-5" />} Connect Threads
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex flex-wrap items-center gap-3">
            {accounts.map((a) => {
              const needsReconnect = !a.connected || a.token_expired;
              return (
                <div key={a.id} className="flex items-center gap-3 rounded-xl bg-gray-50 dark:bg-gray-900/40 pl-2 pr-1 py-1.5">
                  {a.profile_picture_url ? <img src={a.profile_picture_url} alt="" className="w-9 h-9 rounded-full object-cover" /> : <span className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-900 to-gray-600" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">@{a.username ?? 'threads'}</p>
                    <p className={`text-xs ${needsReconnect ? 'text-amber-600' : 'text-gray-500'}`}>
                      {needsReconnect ? 'Needs reconnecting' : a.followers_count != null ? `${a.followers_count.toLocaleString()} followers` : 'Connected'}
                    </p>
                  </div>
                  {needsReconnect && (
                    <button onClick={connect} disabled={connecting} className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20" aria-label="Reconnect" title="Reconnect">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => disconnect(a)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label="Disconnect" title="Disconnect">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
            <button onClick={connect} disabled={connecting} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">
              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add profile
            </button>
          </div>
        )}

        {connected.length > 0 && (
          <>
            <nav className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-3">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition-colors ${tab === t.id ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                  <t.icon className="w-4 h-4" /> {t.label}
                </button>
              ))}
            </nav>
            <ContentEngine tab={tab} accounts={accounts} igAccounts={igAccounts} />
          </>
        )}
      </div>
    </div>
  );
}
