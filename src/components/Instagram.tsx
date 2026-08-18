import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Instagram as InstagramIcon, MessageSquare, Send, Plus, Trash2, RefreshCw, Zap, Clock, User, Image as ImageIcon, Share2, Users, X, BarChart3, TrendingUp, Heart, Eye, Bookmark, Play, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { AppView } from '../lib/router';

interface InstagramProps {
  onSignOut: () => void;
  currentView: AppView;
  queryParams: Record<string, string>;
  navigateToApp: (view: AppView, params?: Record<string, string>) => void;
}

interface WebhookEvent {
  id: string;
  event_type: string;
  sender_id: string | null;
  sender_username: string | null;
  message_text: string | null;
  media_id: string | null;
  comment_id: string | null;
  created_at: string;
  processed: boolean;
}

interface AutoRule {
  id: string;
  media_id: string | null;
  trigger_keyword: string;
  reply_text: string;
  active: boolean;
  created_at: string;
}

interface IgPost {
  id: string;
  ig_media_id: string | null;
  caption: string;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  created_at: string;
}

interface IgAccount {
  id: string;
  ig_user_id: string | null;
  username: string | null;
  connected: boolean;
  profile_picture_url: string | null;
  followers_count: number | null;
  follows_count: number | null;
  media_count: number | null;
  token_expired: boolean;
  auth_method: string;
  user_id: string;
}

interface Snapshot {
  id: string;
  followers_count: number | null;
  follows_count: number | null;
  media_count: number | null;
  account_reach: number | null;
  account_impressions: number | null;
  engagement_rate: number | null;
  posts_data: any[];
  created_at: string;
}

type TabType = 'inbox' | 'posts' | 'rules' | 'stats' | 'sharing';

export function Instagram({ onSignOut, currentView, queryParams, navigateToApp }: InstagramProps) {
  const initialTab = (queryParams.tab as TabType) || 'inbox';
  const initialAccountId = queryParams.account || '';

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(initialAccountId);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [rules, setRules] = useState<AutoRule[]>([]);
  const [posts, setPosts] = useState<IgPost[]>([]);
  const [accounts, setAccounts] = useState<IgAccount[]>([]);
  const [sharedAccounts, setSharedAccounts] = useState<IgAccount[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [newRule, setNewRule] = useState({ trigger_keyword: '', reply_text: '', media_id: '' });
  const [newPost, setNewPost] = useState({ caption: '', scheduled_for: '' });
  const [shares, setShares] = useState<Array<{ id: string; shared_with_user_id: string; permissions: Record<string, boolean>; created_at: string; profile?: { email: string } | null }>>([]);
  const [orgMembers, setOrgMembers] = useState<Array<{ user_id: string; email: string; role: string }>>([]);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [newEventCount, setNewEventCount] = useState(0);
  const prevEventCountRef = useRef(0);
  const [toast, setToast] = useState<string | null>(null);

  const allAccounts = [...accounts, ...sharedAccounts];
  const selectedAccount = allAccounts.find(a => a.id === selectedAccountId) || allAccounts[0] || null;

  // Update URL when tab or account changes
  const updateUrl = useCallback((tab: TabType, accountId: string) => {
    const params: Record<string, string> = { tab };
    if (accountId) params.account = accountId;
    navigateToApp('instagram', params);
  }, [navigateToApp]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setNewEventCount(0);
    if (selectedAccount) {
      updateUrl(tab, selectedAccount.id);
    } else {
      updateUrl(tab, '');
    }
  };

  const handleAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId);
    setShowAccountDropdown(false);
    updateUrl(activeTab, accountId);
  };

  const fetchData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch all accounts for this user
      const { data: ownAccounts } = await supabase
        .from('instagram_accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      setAccounts(ownAccounts || []);

      // Fetch shared accounts
      const { data: sharedWithMe } = await supabase
        .from('instagram_account_shares')
        .select('account_id')
        .eq('shared_with_user_id', user.id);

      let sharedAccts: IgAccount[] = [];
      if (sharedWithMe && sharedWithMe.length > 0) {
        const accountIds = sharedWithMe.map(s => s.account_id);
        const { data: sharedData } = await supabase
          .from('instagram_accounts')
          .select('*')
          .in('id', accountIds);
        sharedAccts = (sharedData || []) as IgAccount[];
      }
      setSharedAccounts(sharedAccts);

      // Determine which account to use
      const allAccts = [...(ownAccounts || []), ...sharedAccts] as IgAccount[];
      let currentAccount: IgAccount | null = null;
      if (selectedAccountId && allAccts.find(a => a.id === selectedAccountId)) {
        currentAccount = allAccts.find(a => a.id === selectedAccountId)!;
      } else if (allAccts.length > 0) {
        currentAccount = allAccts[0];
        setSelectedAccountId(allAccts[0].id);
      }

      if (currentAccount) {
        await fetchAccountData(currentAccount, user.id);
      }

      // Fetch refresh settings for last sync
      const { data: settings } = await supabase
        .from('instagram_refresh_settings')
        .select('last_refresh_at')
        .eq('user_id', user.id)
        .maybeSingle();
      if (settings?.last_refresh_at) {
        setLastSync(settings.last_refresh_at);
      }

      // Fetch org members for sharing
      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (membership) {
        const { data: members } = await supabase
          .from('organization_members')
          .select('user_id, role, profiles!inner(email)')
          .eq('organization_id', membership.organization_id)
          .eq('status', 'active')
          .neq('user_id', user.id);

        if (members) {
          setOrgMembers(members.map((m: any) => ({ user_id: m.user_id, email: m.profiles?.email || 'Unknown', role: m.role })));
        }
      }
    } catch (error) {
      console.error('Error fetching Instagram data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedAccountId]);

  const fetchAccountData = async (account: IgAccount, userId: string) => {
    // Fetch events for this account's owner
    const [eventsRes, rulesRes, postsRes, snapshotsRes] = await Promise.all([
      supabase.from('instagram_webhook_events')
        .select('*')
        .eq('user_id', account.user_id)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('instagram_auto_rules')
        .select('*')
        .eq('user_id', account.user_id)
        .order('created_at', { ascending: false }),
      supabase.from('instagram_posts')
        .select('*')
        .eq('user_id', account.user_id)
        .order('created_at', { ascending: false }),
      supabase.from('instagram_insights_snapshots')
        .select('*')
        .eq('account_id', account.id)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    if (!eventsRes.error) setEvents(eventsRes.data || []);
    if (!rulesRes.error) setRules(rulesRes.data || []);
    if (!postsRes.error) setPosts(postsRes.data || []);
    if (!snapshotsRes.error) setSnapshots(snapshotsRes.data || []);

    // Fetch shares if this is own account
    const isOwn = accounts.some(a => a.id === account.id);
    if (isOwn) {
      const { data: sharesData } = await supabase
        .from('instagram_account_shares')
        .select('id, shared_with_user_id, permissions, created_at')
        .eq('account_id', account.id);

      if (sharesData) {
        const memberIds = sharesData.map(s => s.shared_with_user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email')
          .in('id', memberIds);
        const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.email]));
        setShares(sharesData.map(s => ({ ...s, profile: { email: profileMap.get(s.shared_with_user_id) || 'Unknown' } })));
      }
    } else {
      setShares([]);
    }

    // Suppress unused var warning
    void userId;
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription for new webhook events
  useEffect(() => {
    if (!selectedAccount) return;

    const channel = supabase
      .channel(`ig_events_${selectedAccount.id}`)
      .on('postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'instagram_webhook_events',
          filter: `user_id=eq.${selectedAccount.user_id}`,
        },
        (payload) => {
          const newEvent = payload.new as WebhookEvent;
          setEvents(prev => [newEvent, ...prev].slice(0, 100));
          if (activeTab !== 'inbox') {
            setNewEventCount(prev => prev + 1);
            setToast(`New ${newEvent.event_type} from @${newEvent.sender_username || 'unknown'}`);
            setTimeout(() => setToast(null), 4000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedAccount?.id, activeTab]);

  // Track event count for toast notifications
  useEffect(() => {
    if (events.length > prevEventCountRef.current && prevEventCountRef.current > 0 && activeTab !== 'inbox') {
      const diff = events.length - prevEventCountRef.current;
      setNewEventCount(prev => prev + diff);
    }
    prevEventCountRef.current = events.length;
  }, [events.length, activeTab]);

  // Realtime subscription for snapshots (sync updates)
  useEffect(() => {
    if (!selectedAccount) return;

    const channel = supabase
      .channel(`ig_snapshots_${selectedAccount.id}`)
      .on('postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'instagram_insights_snapshots',
          filter: `account_id=eq.${selectedAccount.id}`,
        },
        (payload) => {
          const newSnapshot = payload.new as Snapshot;
          setSnapshots(prev => [newSnapshot, ...prev].slice(0, 30));
          setLastSync(newSnapshot.created_at);
          setIsRefreshing(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedAccount?.id]);

  const handleSyncNow = async () => {
    if (!selectedAccount) return;
    setIsRefreshing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/instagram-sync-insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ account_id: selectedAccount.id }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (err.token_expired) {
          await fetchData();
        }
        alert(err.error || 'Failed to sync insights');
        setIsRefreshing(false);
        return;
      }

      // The realtime subscription will update the UI when the snapshot is saved
      // But also refresh to be safe
      setTimeout(() => {
        fetchData();
        setIsRefreshing(false);
      }, 2000);
    } catch (error) {
      console.error('Error syncing:', error);
      setIsRefreshing(false);
    }
  };

  const handleSaveRule = async () => {
    if (!newRule.trigger_keyword || !newRule.reply_text) {
      alert('Please fill in the trigger keyword and reply text');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from('instagram_auto_rules').insert({
        user_id: user.id,
        trigger_keyword: newRule.trigger_keyword,
        reply_text: newRule.reply_text,
        media_id: newRule.media_id || null,
        active: true,
      });

      if (error) throw error;
      setNewRule({ trigger_keyword: '', reply_text: '', media_id: '' });
      setShowRuleModal(false);
      await fetchData();
    } catch (error) {
      console.error('Error saving rule:', error);
      alert('Failed to save rule');
    }
  };

  const handleToggleRule = async (rule: AutoRule) => {
    try {
      const { error } = await supabase
        .from('instagram_auto_rules')
        .update({ active: !rule.active, updated_at: new Date().toISOString() })
        .eq('id', rule.id);
      if (error) throw error;
      await fetchData();
    } catch (error) {
      console.error('Error toggling rule:', error);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Delete this auto-comment rule?')) return;
    try {
      const { error } = await supabase.from('instagram_auto_rules').delete().eq('id', id);
      if (error) throw error;
      await fetchData();
    } catch (error) {
      console.error('Error deleting rule:', error);
    }
  };

  const handleSavePost = async () => {
    if (!newPost.caption) {
      alert('Please enter a caption');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const status = newPost.scheduled_for ? 'scheduled' : 'draft';
      const { error } = await supabase.from('instagram_posts').insert({
        user_id: user.id,
        caption: newPost.caption,
        status,
        scheduled_for: newPost.scheduled_for || null,
      });

      if (error) throw error;
      setNewPost({ caption: '', scheduled_for: '' });
      setShowPostModal(false);
      await fetchData();
    } catch (error) {
      console.error('Error saving post:', error);
      alert('Failed to save post');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString([], {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const eventBadgeColor = (type: string) => {
    switch (type) {
      case 'comment': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
      case 'message': return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300';
      case 'mention': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300';
      case 'share': return 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300';
      case 'repost': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 bg-white dark:bg-gray-900 min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (allAccounts.length === 0) {
    return (
      <div className="p-8 bg-white dark:bg-gray-900 min-h-screen">
        <div className="max-w-3xl mx-auto text-center py-16">
          <InstagramIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">No Instagram Accounts Connected</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">Go to Settings to connect your Instagram Business or Creator account.</p>
          <button
            onClick={() => navigateToApp('settings')}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg"
          >
            Go to Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-white dark:bg-gray-900 min-h-screen">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <InstagramIcon className="w-6 h-6 text-pink-600 dark:text-pink-400" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Instagram</h1>
          </div>
          <div className="flex items-center gap-3">
            {lastSync && (
              <span className="text-xs text-gray-400 hidden sm:inline">
                Last sync: {formatDate(lastSync)}
              </span>
            )}
            <button
              onClick={handleSyncNow}
              disabled={isRefreshing || !selectedAccount}
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg shadow-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        </div>

        {/* Account selector */}
        <div className="mb-6 relative">
          <button
            onClick={() => setShowAccountDropdown(!showAccountDropdown)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700/50"
          >
            <div className="flex items-center gap-3">
              {selectedAccount?.profile_picture_url ? (
                <img src={selectedAccount.profile_picture_url} alt="" className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                  <InstagramIcon className="w-4 h-4 text-pink-500" />
                </div>
              )}
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900 dark:text-white">@{selectedAccount?.username || 'unknown'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedAccount && sharedAccounts.some(a => a.id === selectedAccount.id) ? 'Shared with you' : 'Your account'}
                  {selectedAccount?.followers_count != null && ` · ${selectedAccount.followers_count.toLocaleString()} followers`}
                </p>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>

          {showAccountDropdown && (
            <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {accounts.map(acct => (
                <button
                  key={acct.id}
                  onClick={() => handleAccountChange(acct.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${selectedAccountId === acct.id ? 'bg-pink-50 dark:bg-pink-900/20' : ''}`}
                >
                  {acct.profile_picture_url ? (
                    <img src={acct.profile_picture_url} alt="" className="w-7 h-7 rounded-full" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                      <InstagramIcon className="w-3.5 h-3.5 text-pink-500" />
                    </div>
                  )}
                  <div className="text-left">
                    <p className="text-sm text-gray-900 dark:text-white">@{acct.username || 'unknown'}</p>
                    <p className="text-xs text-gray-400">Your account</p>
                  </div>
                  {acct.token_expired && <span className="ml-auto text-xs text-red-500">Expired</span>}
                </button>
              ))}
              {sharedAccounts.map(acct => (
                <button
                  key={acct.id}
                  onClick={() => handleAccountChange(acct.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${selectedAccountId === acct.id ? 'bg-pink-50 dark:bg-pink-900/20' : ''}`}
                >
                  {acct.profile_picture_url ? (
                    <img src={acct.profile_picture_url} alt="" className="w-7 h-7 rounded-full" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                      <InstagramIcon className="w-3.5 h-3.5 text-pink-500" />
                    </div>
                  )}
                  <div className="text-left">
                    <p className="text-sm text-gray-900 dark:text-white">@{acct.username || 'unknown'}</p>
                    <p className="text-xs text-gray-400">Shared with you</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Token expired warning */}
        {selectedAccount?.token_expired && (
          <div className="rounded-xl p-4 mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Access token expired for @{selectedAccount.username}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Go to Settings to reconnect this account or update the access token.</p>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex space-x-8 overflow-x-auto">
              <button
                onClick={() => handleTabChange('inbox')}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'inbox' ? 'border-pink-500 text-pink-600 dark:text-pink-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Inbox ({events.length})
                  {newEventCount > 0 && activeTab !== 'inbox' && (
                    <span className="flex items-center justify-center min-w-[18px] h-4 px-1 text-xs font-semibold text-white bg-red-500 rounded-full">{newEventCount}</span>
                  )}
                </div>
              </button>
              <button
                onClick={() => handleTabChange('posts')}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'posts' ? 'border-pink-500 text-pink-600 dark:text-pink-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
              >
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  Posts ({posts.length})
                </div>
              </button>
              <button
                onClick={() => handleTabChange('stats')}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'stats' ? 'border-pink-500 text-pink-600 dark:text-pink-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Stats
                </div>
              </button>
              <button
                onClick={() => handleTabChange('rules')}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'rules' ? 'border-pink-500 text-pink-600 dark:text-pink-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Auto Rules ({rules.length})
                </div>
              </button>
              {accounts.some(a => a.id === selectedAccountId) && (
                <button
                  onClick={() => handleTabChange('sharing')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'sharing' ? 'border-pink-500 text-pink-600 dark:text-pink-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
                >
                  <div className="flex items-center gap-2">
                    <Share2 className="w-4 h-4" />
                    Sharing
                  </div>
                </button>
              )}
            </nav>
          </div>
        </div>

        {/* Inbox tab */}
        {activeTab === 'inbox' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
            {events.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No events yet</h3>
                <p className="text-gray-500 dark:text-gray-400">
                  Incoming comments, messages, mentions, shares, and reposts will appear here automatically.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {events.map((event) => (
                  <div key={event.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${eventBadgeColor(event.event_type)}`}>
                            {event.event_type}
                          </span>
                          {event.sender_username && (
                            <span className="text-sm font-medium text-gray-900 dark:text-white">@{event.sender_username}</span>
                          )}
                          {event.processed && (
                            <span className="text-xs text-green-500">processed</span>
                          )}
                        </div>
                        {event.message_text && (
                          <p className="text-sm text-gray-700 dark:text-gray-300">{event.message_text}</p>
                        )}
                        {event.media_id && (
                          <p className="text-xs text-gray-400 mt-1">Media: {event.media_id}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="w-3 h-3" />
                        {formatDate(event.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Stats tab */}
        {activeTab === 'stats' && (
          <StatsTab
            selectedAccount={selectedAccount}
            snapshots={snapshots}
            isRefreshing={isRefreshing}
            lastSync={lastSync}
            onSync={handleSyncNow}
          />
        )}

        {/* Posts tab */}
        {activeTab === 'posts' && (
          <div>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setShowPostModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-pink-600 hover:bg-pink-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Post
              </button>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
              {posts.length === 0 ? (
                <div className="text-center py-12">
                  <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No posts yet</h3>
                  <p className="text-gray-500 dark:text-gray-400">Create a post to publish or schedule it for later.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {posts.map((post) => (
                    <div key={post.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">{post.caption}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              post.status === 'published' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                              post.status === 'scheduled' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                              post.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                              'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                            }`}>
                              {post.status}
                            </span>
                            {post.scheduled_for && (
                              <span className="text-xs text-gray-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDate(post.scheduled_for)}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-gray-400 ml-4">{formatDate(post.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Rules tab */}
        {activeTab === 'rules' && (
          <div>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setShowRuleModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-pink-600 hover:bg-pink-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Rule
              </button>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
              {rules.length === 0 ? (
                <div className="text-center py-12">
                  <Zap className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No auto-comment rules yet</h3>
                  <p className="text-gray-500 dark:text-gray-400">Set up rules to automatically reply to comments that match a keyword.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {rules.map((rule) => (
                    <div key={rule.id} className="p-4 flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">"{rule.trigger_keyword}"</span>
                          <span className="text-gray-400">→</span>
                          <span className="text-sm text-gray-600 dark:text-gray-300 line-clamp-1">{rule.reply_text}</span>
                        </div>
                        {rule.media_id && (
                          <p className="text-xs text-gray-400">Applies to post: {rule.media_id}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">{rule.active ? 'Active' : 'Paused'}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => handleToggleRule(rule)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${rule.active ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${rule.active ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sharing tab */}
        {activeTab === 'sharing' && selectedAccount && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-pink-500" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Share with Teammates</h3>
                </div>
                {orgMembers.length > 0 && (
                  <button
                    onClick={() => setShowShareModal(true)}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Add Share
                  </button>
                )}
              </div>
              {orgMembers.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  You need to be part of an organization with other members to share your Instagram account.
                </p>
              ) : shares.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  You haven't shared this Instagram account with anyone yet. Click "Add Share" to let teammates view your inbox, collaborate on replies, and help manage posts.
                </p>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {shares.map((share) => (
                    <div key={share.id} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/20">
                          <User className="w-4 h-4 text-blue-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{share.profile?.email || 'Unknown'}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {share.permissions?.reply ? 'Can reply' : 'View only'}
                            {share.permissions?.post ? ' · Can post' : ''}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          await supabase.from('instagram_account_shares').delete().eq('id', share.id);
                          await fetchData();
                        }}
                        className="p-1.5 text-red-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="Revoke access"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Share Modal */}
        {showShareModal && selectedAccount && (
          <ShareModal
            accountId={selectedAccount.id}
            orgMembers={orgMembers}
            onClose={() => setShowShareModal(false)}
            onShared={() => { setShowShareModal(false); fetchData(); }}
          />
        )}

        {/* New Rule Modal */}
        {showRuleModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">New Auto-Comment Rule</h3>
                <button onClick={() => setShowRuleModal(false)} className="text-gray-400 hover:text-gray-500">×</button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Trigger Keyword</label>
                  <input
                    type="text"
                    value={newRule.trigger_keyword}
                    onChange={(e) => setNewRule(prev => ({ ...prev, trigger_keyword: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="e.g., price, info, details"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reply Text</label>
                  <textarea
                    value={newRule.reply_text}
                    onChange={(e) => setNewRule(prev => ({ ...prev, reply_text: e.target.value }))}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="The automatic reply message"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Media ID (optional)</label>
                  <input
                    type="text"
                    value={newRule.media_id}
                    onChange={(e) => setNewRule(prev => ({ ...prev, media_id: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Leave blank to apply to all posts"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setShowRuleModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
                <button onClick={handleSaveRule} className="px-4 py-2 text-sm font-medium rounded-lg text-white bg-pink-600 hover:bg-pink-700">Save Rule</button>
              </div>
            </div>
          </div>
        )}

        {/* New Post Modal */}
        {showPostModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">New Post</h3>
                <button onClick={() => setShowPostModal(false)} className="text-gray-400 hover:text-gray-500">×</button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Caption</label>
                  <textarea
                    value={newPost.caption}
                    onChange={(e) => setNewPost(prev => ({ ...prev, caption: e.target.value }))}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Write your post caption..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Schedule for (optional)</label>
                  <input
                    type="datetime-local"
                    value={newPost.scheduled_for}
                    onChange={(e) => setNewPost(prev => ({ ...prev, scheduled_for: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setShowPostModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
                <button onClick={handleSavePost} className="px-4 py-2 text-sm font-medium rounded-lg text-white bg-pink-600 hover:bg-pink-700">Save Post</button>
              </div>
            </div>
          </div>
        )}

        {/* Toast notification */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 bg-gray-900 dark:bg-gray-700 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in">
            <MessageSquare className="w-4 h-4 text-pink-400" />
            <span className="text-sm">{toast}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Stats Tab component
function StatsTab({ selectedAccount, snapshots, isRefreshing, lastSync, onSync }: {
  selectedAccount: IgAccount | null;
  snapshots: Snapshot[];
  isRefreshing: boolean;
  lastSync: string | null;
  onSync: () => void;
}) {
  const latestSnapshot = snapshots[0] || null;
  const posts: any[] = latestSnapshot?.posts_data ?? [];

  const fmt = (n: number | null | undefined) => n != null ? n.toLocaleString() : '—';
  const pct = (n: number | null | undefined) => n != null ? `${n.toFixed(1)}%` : '—';

  // Build follower growth trend
  const trendData = snapshots.slice().reverse().map(s => ({
    date: new Date(s.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }),
    followers: s.followers_count ?? 0,
  }));

  const maxFollowers = Math.max(...trendData.map(d => d.followers), 1);

  // Sort posts by engagement (likes + comments)
  const sortedPosts = [...posts].sort((a, b) => {
    const aEng = (a.like_count ?? 0) + (a.comments_count ?? 0);
    const bEng = (b.like_count ?? 0) + (b.comments_count ?? 0);
    return bEng - aEng;
  });

  return (
    <div className="space-y-6">
      {/* Sync status bar */}
      <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Clock className="w-4 h-4" />
          {lastSync ? `Last synced: ${new Date(lastSync).toLocaleString()}` : 'Never synced'}
        </div>
        <button
          onClick={onSync}
          disabled={isRefreshing}
          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-900/20 rounded-lg disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      {/* Overview stat cards */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Followers" value={fmt(latestSnapshot?.followers_count ?? selectedAccount?.followers_count)} icon={Users} color="text-pink-500" bg="bg-pink-100 dark:bg-pink-900/20" />
          <StatCard title="Following" value={fmt(latestSnapshot?.follows_count ?? selectedAccount?.follows_count)} icon={User} color="text-blue-500" bg="bg-blue-100 dark:bg-blue-900/20" />
          <StatCard title="Total Posts" value={fmt(latestSnapshot?.media_count ?? selectedAccount?.media_count)} icon={ImageIcon} color="text-green-500" bg="bg-green-100 dark:bg-green-900/20" />
          <StatCard title="Engagement Rate" value={pct(latestSnapshot?.engagement_rate)} icon={TrendingUp} color="text-amber-500" bg="bg-amber-100 dark:bg-amber-900/20" />
        </div>
      </div>

      {/* Reach & impressions */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Reach & Impressions</h2>
        <div className="grid grid-cols-2 gap-4">
          <StatCard title="Total Reach" value={fmt(latestSnapshot?.account_reach)} icon={Eye} color="text-cyan-500" bg="bg-cyan-100 dark:bg-cyan-900/20" />
          <StatCard title="Total Impressions" value={fmt(latestSnapshot?.account_impressions)} icon={BarChart3} color="text-teal-500" bg="bg-teal-100 dark:bg-teal-900/20" />
        </div>
      </div>

      {/* Follower growth trend */}
      {trendData.length > 1 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Follower Growth Trend</h2>
          </div>
          <div className="flex items-end gap-2 h-40">
            {trendData.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div
                  className="w-full max-w-[32px] bg-pink-400 rounded-t transition-all hover:bg-pink-500"
                  style={{ height: `${(d.followers / maxFollowers) * 80}%`, minHeight: '4px' }}
                  title={`${d.followers.toLocaleString()} followers`}
                />
                <span className="text-[10px] text-gray-400">{d.date}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent posts performance */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Post Performance</h2>
        </div>
        {sortedPosts.length === 0 ? (
          <div className="text-center py-12">
            <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              No post insights yet. Click "Sync Now" to pull data from Instagram.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {sortedPosts.map((post, i) => (
              <div key={i} className="p-4">
                <div className="flex items-start gap-3">
                  {post.thumbnail_url ? (
                    <img src={post.thumbnail_url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                      <ImageIcon className="w-5 h-5 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-1">{post.caption || '(no caption)'}</p>
                    {post.permalink && (
                      <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">View on Instagram</a>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {fmt(post.like_count)}</span>
                      <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {fmt(post.comments_count)}</span>
                      {post.reach != null && <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {fmt(post.reach)}</span>}
                      {post.impressions != null && <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" /> {fmt(post.impressions)}</span>}
                      {post.saved != null && <span className="flex items-center gap-1"><Bookmark className="w-3 h-3" /> {fmt(post.saved)}</span>}
                      {post.video_views != null && <span className="flex items-center gap-1"><Play className="w-3 h-3" /> {fmt(post.video_views)}</span>}
                    </div>
                  </div>
                  {post.timestamp && (
                    <span className="text-xs text-gray-400 flex-shrink-0">{new Date(post.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, bg }: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
      <div className={`inline-flex p-2 rounded-lg ${bg} mb-3`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <p className="text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{title}</p>
    </div>
  );
}

function ShareModal({ accountId, orgMembers, onClose, onShared }: {
  accountId: string;
  orgMembers: Array<{ user_id: string; email: string; role: string }>;
  onClose: () => void;
  onShared: () => void;
}) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [permissions, setPermissions] = useState({ view: true, reply: false, post: false });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleShare = async () => {
    if (!selectedUserId) {
      setError('Select a teammate to share with');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (!membership) throw new Error('Not part of an organization');

      const { error: insertError } = await supabase
        .from('instagram_account_shares')
        .insert({
          account_id: accountId,
          shared_with_user_id: selectedUserId,
          shared_by_user_id: user.id,
          organization_id: membership.organization_id,
          permissions,
        });

      if (insertError) {
        if (insertError.code === '23505') {
          throw new Error('This account is already shared with this teammate');
        }
        throw insertError;
      }

      onShared();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share account');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Share Instagram Account</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teammate</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">Select a teammate...</option>
              {orgMembers.map(m => (
                <option key={m.user_id} value={m.user_id}>{m.email} ({m.role})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Permissions</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={permissions.view} disabled className="rounded border-gray-300 text-pink-600" />
                View inbox and posts
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={permissions.reply}
                  onChange={(e) => setPermissions(prev => ({ ...prev, reply: e.target.checked }))}
                  className="rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                />
                Reply to messages and comments
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={permissions.post}
                  onChange={(e) => setPermissions(prev => ({ ...prev, post: e.target.checked }))}
                  className="rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                />
                Create and publish posts
              </label>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
          <button
            onClick={handleShare}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium rounded-lg text-white bg-pink-600 hover:bg-pink-700 disabled:opacity-50"
          >
            {isSaving ? 'Sharing...' : 'Share'}
          </button>
        </div>
      </div>
    </div>
  );
}
