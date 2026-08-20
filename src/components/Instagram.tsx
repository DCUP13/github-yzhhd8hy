import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Instagram as InstagramIcon, MessageSquare, Send, Plus, Trash2, RefreshCw, Zap, Clock, User, Image as ImageIcon, Share2, Users, X, BarChart3, TrendingUp, Heart, Eye, Bookmark, Play, ChevronDown, Film, ArrowLeft, CheckCheck, HelpCircle, Info, Bot, GitBranch, Link as LinkIcon, FileText, CreditCard as Edit2, Save, Link2, Link2Off } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { AppView } from '../lib/router';
import { FlowBuilder } from './FlowBuilder';


interface InstagramProps {
  onSignOut: () => void;
  currentView: AppView;
  queryParams: Record<string, string>;
  navigateToApp: (view: AppView, params?: Record<string, string>) => void;
}

interface WebhookEvent {
  id: string;
  event_type: string;
  ig_user_id: string | null;
  sender_id: string | null;
  sender_username: string | null;
  sender_name: string | null;
  sender_profile_url: string | null;
  message_text: string | null;
  media_id: string | null;
  media_type: string | null;
  media_permalink: string | null;
  media_caption: string | null;
  comment_id: string | null;
  created_at: string;
  processed: boolean;
  direction: string;
  recipient_id: string | null;
  reply_text: string | null;
  replied_at: string | null;
}

interface AutoRule {
  id: string;
  media_id: string | null;
  trigger_keyword: string;
  reply_text: string;
  active: boolean;
  created_at: string;
  action_type: string;
  dm_message: string | null;
  link_url: string | null;
  media_url: string | null;
  media_type: string | null;
  send_once_per_user: boolean;
  account_id?: string | null;
  settings_group_id?: string | null;
  is_synced_copy?: boolean;
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
  owner_profile_id?: string | null;
  page_scoped_id?: string | null;
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

type TabType = 'inbox' | 'posts' | 'rules' | 'flows' | 'autoresponder' | 'stats' | 'sharing';

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
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [showPostModal, setShowPostModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const [autoresponderSettingId, setAutoresponderSettingId] = useState<string>('');
  const [settingsGroups, setSettingsGroups] = useState<Array<{ id: string; setting_type: string; name: string; group_subscriptions: Array<{ account_id: string; synced: boolean }> }>>([]);
  const [newRule, setNewRule] = useState({
    trigger_keyword: '',
    reply_text: '',
    media_id: '',
    action_type: 'comment' as 'comment' | 'dm' | 'both',
    dm_message: '',
    link_url: '',
    media_url: '',
    media_type: '' as '',
    send_once_per_user: true,
  });
  const [newPost, setNewPost] = useState({ caption: '', scheduled_for: '' });
  const [shares, setShares] = useState<Array<{ id: string; shared_with_user_id: string; permissions: Record<string, boolean>; created_at: string; profile?: { email: string } | null }>>([]);
  const [orgMembers, setOrgMembers] = useState<Array<{ user_id: string; email: string; role: string }>>([]);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [newEventCount, setNewEventCount] = useState(0);
  const prevEventCountRef = useRef(0);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [inboxFilter, setInboxFilter] = useState<'all' | 'messages' | 'comments'>('all');
  const [autoresponderSettings, setAutoresponderSettings] = useState<{ enabled: boolean; prompt_id: string | null; response_delay_seconds: number } | null>(null);
  const [availablePrompts, setAvailablePrompts] = useState<Array<{ id: string; title: string; reply_mode: string }>>([]);
  const [isSavingAutoresponder, setIsSavingAutoresponder] = useState(false);

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
    // Fetch events for this specific account — filter by user_id (RLS) and
    // ig_user_id (which stores the page_scoped_id of the receiving account)
    // so only messages belonging to the selected account are shown.
    const [eventsRes, rulesRes, postsRes, snapshotsRes] = await Promise.all([
      supabase.from('instagram_webhook_events')
        .select('*')
        .eq('user_id', account.user_id)
        .eq('ig_user_id', account.page_scoped_id)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('instagram_auto_rules')
        .select('*')
        .eq('user_id', account.user_id)
        .eq('account_id', account.id)
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

    if (eventsRes.error) console.error('[Instagram] Error fetching webhook events:', eventsRes.error);
    if (!eventsRes.error) setEvents(eventsRes.data || []);
    if (rulesRes.error) console.error('[Instagram] Error fetching rules:', rulesRes.error);
    if (!rulesRes.error) setRules(rulesRes.data || []);
    if (postsRes.error) console.error('[Instagram] Error fetching posts:', postsRes.error);
    if (!postsRes.error) setPosts(postsRes.data || []);
    if (snapshotsRes.error) console.error('[Instagram] Error fetching snapshots:', snapshotsRes.error);
    if (!snapshotsRes.error) setSnapshots(snapshotsRes.data || []);

    // Fetch autoresponder settings for this account
    const { data: arSettings } = await supabase
      .from('instagram_autoresponder_settings')
      .select('id, enabled, prompt_id, response_delay_seconds')
      .eq('account_id', account.id)
      .maybeSingle();
    setAutoresponderSettings(arSettings || null);
    setAutoresponderSettingId(arSettings?.id || '');

    // Fetch prompts for this user (for the prompt selector)
    const { data: promptsData } = await supabase
      .from('prompts')
      .select('id, title, reply_mode, category')
      .eq('user_id', account.user_id)
      .eq('category', 'Instagram')
      .order('updated_at', { ascending: false });
    setAvailablePrompts(promptsData || []);

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
          // Only show events for the selected account (ig_user_id = page_scoped_id)
          if (newEvent.ig_user_id !== selectedAccount.page_scoped_id) return;
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
    if (!newRule.trigger_keyword) {
      alert('Please fill in the trigger keyword');
      return;
    }
    if (newRule.action_type === 'comment' && !newRule.reply_text) {
      alert('Please fill in the reply text for the public comment');
      return;
    }
    if ((newRule.action_type === 'dm' || newRule.action_type === 'both') && !newRule.dm_message && !newRule.reply_text) {
      alert('Please fill in the DM message text');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const ruleData = {
        user_id: user.id,
        account_id: selectedAccount?.id || null,
        trigger_keyword: newRule.trigger_keyword,
        reply_text: newRule.reply_text,
        media_id: newRule.media_id || null,
        action_type: newRule.action_type,
        dm_message: newRule.dm_message || null,
        link_url: newRule.link_url || null,
        media_url: newRule.media_url || null,
        media_type: newRule.media_type || null,
        send_once_per_user: newRule.send_once_per_user,
      };

      if (editingRuleId) {
        const { error } = await supabase
          .from('instagram_auto_rules')
          .update({ ...ruleData, updated_at: new Date().toISOString() })
          .eq('id', editingRuleId);
        if (error) throw error;
        // Sync to other accounts if this rule is part of a synced group
        const editedRule = rules.find(r => r.id === editingRuleId);
        if (editedRule?.is_synced_copy && editedRule?.settings_group_id) {
          const { data: session } = await supabase.auth.getSession();
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/share-settings`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session?.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ action: 'sync_rule', p_rule_id: editingRuleId }),
          });
        }
      } else {
        const { error } = await supabase
          .from('instagram_auto_rules')
          .insert({ ...ruleData, active: true });
        if (error) throw error;

        // Auto-sync to any accounts that are synced to this account
        const { data: subs } = await supabase
          .from('instagram_settings_subscriptions')
          .select('account_id')
          .eq('synced', true)
          .neq('account_id', selectedAccount?.id || '');
        if (subs && subs.length > 0) {
          const { data: session2 } = await supabase.auth.getSession();
          for (const sub of subs) {
            await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/share-settings`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session2?.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
              },
              body: JSON.stringify({
                action: 'sync_account',
                p_source_account_id: selectedAccount?.id,
                p_account_id: sub.account_id,
                p_user_id: user.id,
              }),
            });
          }
        }
      }

      setNewRule({
        trigger_keyword: '', reply_text: '', media_id: '',
        action_type: 'comment', dm_message: '', link_url: '', media_url: '', media_type: '', send_once_per_user: true,
      });
      setEditingRuleId(null);
      setShowRuleModal(false);
      await fetchData();
    } catch (error) {
      console.error('Error saving rule:', error);
      alert('Failed to save rule');
    }
  };

  const handleEditRule = (rule: AutoRule) => {
    setEditingRuleId(rule.id);
    setNewRule({
      trigger_keyword: rule.trigger_keyword,
      reply_text: rule.reply_text,
      media_id: rule.media_id || '',
      action_type: (rule.action_type || 'comment') as 'comment' | 'dm' | 'both',
      dm_message: rule.dm_message || '',
      link_url: rule.link_url || '',
      media_url: rule.media_url || '',
      media_type: (rule.media_type || '') as '',
      send_once_per_user: rule.send_once_per_user ?? true,
    });
    setShowRuleModal(true);
  };

  const handleNewRule = () => {
    setEditingRuleId(null);
    setNewRule({
      trigger_keyword: '', reply_text: '', media_id: '',
      action_type: 'comment', dm_message: '', link_url: '', media_url: '', media_type: '', send_once_per_user: true,
    });
    setShowRuleModal(true);
  };

  const handleToggleRule = async (rule: AutoRule) => {
    try {
      const { error } = await supabase
        .from('instagram_auto_rules')
        .update({ active: !rule.active, updated_at: new Date().toISOString() })
        .eq('id', rule.id);
      if (error) throw error;
      if (rule.is_synced_copy && rule.settings_group_id) {
        const { data: session } = await supabase.auth.getSession();
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/share-settings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ action: 'sync_rule', p_rule_id: rule.id }),
        });
      }
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

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit',
    });
  };

  // Group events into conversations
  // DMs are grouped by the "other party" ID (sender for incoming, recipient for outgoing)
  // Comments/mentions/etc are grouped by media_id (so all comments on a reel/post are together)
  interface Conversation {
    id: string;
    type: 'dm' | 'media';
    events: WebhookEvent[];
    otherPartyId: string | null;
    otherPartyName: string;
    otherPartyUsername: string | null;
    otherPartyAvatar: string | null;
    lastMessageAt: string;
    lastMessageText: string | null;
    lastIncomingAt: string | null;
    unreadCount: number;
    mediaType: string | null;
    mediaPermalink: string | null;
    mediaCaption: string | null;
    isSelfChat: boolean;
  }

  const conversations = useMemo((): Conversation[] => {
    const convos = new Map<string, Conversation>();

    for (const event of events) {
      let convId: string;
      let type: 'dm' | 'media';

      if (event.event_type === 'message') {
        const isSelf = (event as any).raw_event?.message?.is_self === true ||
          (event as any).raw_event?.sent_from_autoresponder === true && event.recipient_id === selectedAccount?.owner_profile_id;
        if (isSelf && selectedAccount?.owner_profile_id) {
          convId = `dm_${selectedAccount.owner_profile_id}`;
          type = 'dm';
        } else {
          // For DMs: group by the other party
          // Incoming: other party is sender_id. Outgoing (echo): other party is recipient_id.
          // Fall back to raw_event recipient/sender if the column is null (old events).
          let otherId: string | null = null;
          if (event.direction === 'outgoing') {
            otherId = event.recipient_id
              ?? (event as any).raw_event?.recipient?.id
              ?? null;
          } else {
            otherId = event.sender_id
              ?? (event as any).raw_event?.sender?.id
              ?? null;
          }
          // Skip events with no identifiable other party — they can't be grouped
          if (!otherId) continue;
          convId = `dm_${otherId}`;
          type = 'dm';
        }
      } else {
        // Comments, mentions, shares, reposts: group by media_id
        convId = `media_${event.media_id ?? event.id}`;
        type = 'media';
      }

      // Determine the other party ID for this event
      const isSelfEvent = (event as any).raw_event?.message?.is_self === true ||
        ((event as any).raw_event?.sent_from_autoresponder === true && event.recipient_id === selectedAccount?.owner_profile_id);
      const eventOtherPartyId = type === 'dm'
        ? (isSelfEvent && selectedAccount?.owner_profile_id
          ? selectedAccount.owner_profile_id
          : (event.direction === 'outgoing'
            ? (event.recipient_id ?? (event as any).raw_event?.recipient?.id ?? null)
            : (event.sender_id ?? (event as any).raw_event?.sender?.id ?? null)))
        : event.sender_id;

      const existing = convos.get(convId);
      const isUnread = event.event_type === 'message'
        ? event.direction === 'incoming' && !event.processed
        : !event.processed;

      const isIncoming = event.direction === 'incoming';

      // For DMs, only use sender info from incoming messages to identify the other party.
      // Outgoing message sender is the account owner, not the other person.
      // For self-chats, the other party is the account owner.
      const partyName = isSelfEvent
        ? (selectedAccount?.username || null)
        : (isIncoming
          ? (event.sender_name || event.sender_username || null)
          : null);
      const partyUsername = isSelfEvent
        ? (selectedAccount?.username || null)
        : (isIncoming ? (event.sender_username || null) : null);
      const partyAvatar = isSelfEvent
        ? (selectedAccount?.profile_picture_url || null)
        : (isIncoming ? (event.sender_profile_url || null) : null);

      if (!existing) {
        convos.set(convId, {
          id: convId,
          type,
          events: [event],
          otherPartyId: eventOtherPartyId,
          otherPartyName: partyName || (type === 'dm' ? 'Instagram User' : 'Unknown'),
          otherPartyUsername: partyUsername,
          otherPartyAvatar: partyAvatar,
          lastMessageAt: event.created_at,
          lastMessageText: event.message_text,
          lastIncomingAt: isIncoming ? event.created_at : null,
          unreadCount: isUnread ? 1 : 0,
          mediaType: event.media_type,
          mediaPermalink: event.media_permalink,
          mediaCaption: event.media_caption,
          isSelfChat: isSelfEvent,
        });
      } else {
        existing.events.push(event);
        if (event.created_at > existing.lastMessageAt) {
          existing.lastMessageAt = event.created_at;
          existing.lastMessageText = event.message_text;
        }
        if (isIncoming && (!existing.lastIncomingAt || event.created_at > existing.lastIncomingAt)) {
          existing.lastIncomingAt = event.created_at;
        }
        if (isUnread) existing.unreadCount++;
        if (!existing.otherPartyId && eventOtherPartyId) {
          existing.otherPartyId = eventOtherPartyId;
        }
        if (partyUsername && (!existing.otherPartyUsername || existing.otherPartyName === 'Instagram User')) {
          existing.otherPartyUsername = partyUsername;
          existing.otherPartyName = partyName || partyUsername;
        }
        if (partyAvatar && !existing.otherPartyAvatar) {
          existing.otherPartyAvatar = partyAvatar;
        }
        if (event.media_type && !existing.mediaType) existing.mediaType = event.media_type;
        if (event.media_permalink && !existing.mediaPermalink) existing.mediaPermalink = event.media_permalink;
        if (event.media_caption && !existing.mediaCaption) existing.mediaCaption = event.media_caption;
      }
    }

    // Detect self-chats: only when the recipient is the account owner's own profile
    const ownerId = selectedAccount?.owner_profile_id;
    for (const conv of convos.values()) {
      if (conv.type !== 'dm') continue;
      if (!conv.otherPartyId || !ownerId) continue;
      if (conv.otherPartyId === ownerId) {
        conv.isSelfChat = true;
        conv.otherPartyName = selectedAccount?.username || 'You';
        conv.otherPartyUsername = selectedAccount?.username || null;
        conv.otherPartyAvatar = selectedAccount?.profile_picture_url || null;
      }
    }

    // Sort conversations by most recent message
    return Array.from(convos.values()).sort((a, b) =>
      b.lastMessageAt.localeCompare(a.lastMessageAt)
    );
  }, [events, accounts, selectedAccount]);

  const filteredConversations = useMemo(() => {
    if (inboxFilter === 'messages') return conversations.filter(c => c.type === 'dm');
    if (inboxFilter === 'comments') return conversations.filter(c => c.type === 'media');
    return conversations;
  }, [conversations, inboxFilter]);

  const selectedConversation = filteredConversations.find(c => c.id === selectedConversationId) || null;

  const handleSendReply = async () => {
    if (!selectedConversation || !replyText.trim() || !selectedAccount) return;
    if (!selectedConversation.otherPartyId) {
      alert('Cannot reply to this conversation — the recipient could not be identified.');
      return;
    }
    setIsSendingReply(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/instagram-send-reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          account_id: selectedAccount.id,
          recipient_id: selectedConversation.otherPartyId,
          message_text: replyText.trim(),
          reply_to_event_id: selectedConversation.events.find(e => e.direction === 'incoming')?.id,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        alert(err.error || 'Failed to send reply');
        return;
      }

      setReplyText('');
      // The realtime subscription or a refetch will pick up the new outgoing message
      await fetchData();
    } catch (error) {
      console.error('Error sending reply:', error);
      alert('Failed to send reply');
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleDeleteConversation = async (conv: Conversation) => {
    if (!confirm(`Delete this conversation with ${conv.otherPartyName}? This cannot be undone.`)) return;
    try {
      if (conv.type === 'dm' && conv.otherPartyId) {
        // For self-chats, events may have different sender_id/recipient_id values
        const eventIds = conv.events.map(e => e.id);
        const { error: delErr } = await supabase
          .from('instagram_webhook_events')
          .delete()
          .in('id', eventIds);
        if (delErr) throw delErr;
      } else if (conv.type === 'media') {
        const mediaId = conv.events[0]?.media_id;
        if (mediaId) {
          const { error } = await supabase
            .from('instagram_webhook_events')
            .delete()
            .eq('media_id', mediaId);
          if (error) throw error;
        }
      }
      setSelectedConversationId(null);
      await fetchData();
    } catch (error) {
      console.error('Error deleting conversation:', error);
      alert('Failed to delete conversation. You may not have permission to delete some messages.');
    }
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
                  onClick={() => handleTabChange('flows')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'flows' ? 'border-pink-500 text-pink-600 dark:text-pink-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
                >
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4" />
                    Flows
                  </div>
                </button>
              )}
              {accounts.some(a => a.id === selectedAccountId) && (
                <button
                  onClick={() => handleTabChange('autoresponder')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'autoresponder' ? 'border-pink-500 text-pink-600 dark:text-pink-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
                >
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4" />
                    AI Autoresponder
                  </div>
                </button>
              )}
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

        {/* Inbox tab — two-pane conversation view */}
        {activeTab === 'inbox' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
            {events.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No messages yet</h3>
                <p className="text-gray-500 dark:text-gray-400">
                  Incoming DMs, comments, mentions, shares, and reposts will appear here automatically in real time.
                </p>
              </div>
            ) : selectedConversation ? (
              /* Conversation detail view */
              <div className="flex flex-col">
                {/* Conversation header */}
                <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                  <button
                    onClick={() => setSelectedConversationId(null)}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDeleteConversation(selectedConversation)}
                    className="p-1 text-gray-400 hover:text-red-500 rounded-lg ml-auto"
                    title="Delete conversation"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {selectedConversation.otherPartyAvatar ? (
                    <img src={selectedConversation.otherPartyAvatar} alt="" className="w-10 h-10 rounded-full" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                      {selectedConversation.type === 'dm' ? (
                        <User className="w-5 h-5 text-pink-500" />
                      ) : selectedConversation.mediaType === 'REEL' ? (
                        <Film className="w-5 h-5 text-pink-500" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-pink-500" />
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {selectedConversation.otherPartyName}
                      {selectedConversation.isSelfChat && (
                        <span className="text-xs text-pink-500 font-normal ml-1">(You)</span>
                      )}
                      {selectedConversation.otherPartyUsername && !selectedConversation.isSelfChat && (
                        <span className="text-gray-400 font-normal"> @{selectedConversation.otherPartyUsername}</span>
                      )}
                    </p>
                    {selectedConversation.type === 'media' && (
                      <p className="text-xs text-gray-400">
                        {selectedConversation.mediaType === 'REEL' ? 'Reel' : 'Post'} comment thread
                        {selectedConversation.mediaPermalink && (
                          <a href={selectedConversation.mediaPermalink} target="_blank" rel="noopener noreferrer" className="ml-1 text-pink-500 hover:underline">View on Instagram</a>
                        )}
                      </p>
                    )}
                    {selectedConversation.type === 'dm' && (
                      <p className="text-xs text-gray-400">Direct message</p>
                    )}
                  </div>
                </div>

                {/* Messages list — scrolls independently */}
                <div className="overflow-y-auto p-4 space-y-3 bg-gray-50 dark:bg-gray-900/30 max-h-[45vh]">
                  {selectedConversation.events
                    .slice()
                    .reverse()
                    .map((event) => {
                      const isOutgoing = event.direction === 'outgoing';
                      return (
                        <div key={event.id} className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[75%] ${isOutgoing ? 'order-2' : 'order-1'}`}>
                            <div className={`rounded-2xl px-4 py-2.5 ${
                              isOutgoing
                                ? 'bg-pink-500 text-white rounded-br-sm'
                                : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-sm border border-gray-200 dark:border-gray-700'
                            }`}>
                              {event.message_text && (
                                <p className="text-sm whitespace-pre-wrap break-words">{event.message_text}</p>
                              )}
                              {!event.message_text && event.event_type !== 'message' && (
                                <p className="text-sm italic text-gray-400">{event.event_type} (no text)</p>
                              )}
                            </div>
                            <div className={`flex items-center gap-1 mt-1 ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
                              {event.event_type !== 'message' && (
                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${eventBadgeColor(event.event_type)}`}>
                                  {event.event_type}
                                </span>
                              )}
                              <span className="text-[10px] text-gray-400">{formatTime(event.created_at)}</span>
                              {isOutgoing && event.replied_at && (
                                <CheckCheck className="w-3 h-3 text-pink-400" />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* 24-hour window warning */}
                {selectedConversation.type === 'dm' && (() => {
                  const lastIncoming = selectedConversation.lastIncomingAt;
                  if (!lastIncoming) return null;
                  const hoursSince = (Date.now() - new Date(lastIncoming).getTime()) / 3600000;
                  const windowClosed = hoursSince > 24;
                  const hoursLeft = Math.max(0, 24 - hoursSince);
                  if (!windowClosed && hoursLeft > 4) return null;
                  return (
                    <div className={`px-4 py-2 text-xs flex items-center gap-2 flex-shrink-0 ${
                      windowClosed
                        ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                        : 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
                    }`}>
                      <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                      {windowClosed
                        ? `The 24-hour messaging window has closed (last message was ${Math.round(hoursSince)}h ago). Instagram only allows replies within 24 hours of a user's last message. Standard replies will be rejected.`
                        : `Only ${Math.round(hoursLeft)}h left to reply — Instagram closes the messaging window 24 hours after the user's last message.`
                      }
                    </div>
                  );
                })()}

                {/* Reply box — always visible at the bottom, never scrolls */}
                {selectedConversation.type === 'dm' && (
                  <div className="sticky bottom-0 border-t border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-800 z-10">
                    {selectedConversation.otherPartyId ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                          placeholder="Type a reply..."
                          className="flex-1 px-4 py-2.5 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                          disabled={isSendingReply}
                        />
                        <button
                          onClick={handleSendReply}
                          disabled={!replyText.trim() || isSendingReply}
                          className="p-2.5 rounded-full bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 text-center py-2">
                        This conversation doesn't have a valid recipient ID to reply to.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Conversation list view */
              <div>
                {/* Filter tabs */}
                <div className="flex items-center gap-1 px-4 pt-3 pb-2 border-b border-gray-200 dark:border-gray-700">
                  {(['all', 'messages', 'comments'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setInboxFilter(filter)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        inboxFilter === filter
                          ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300'
                          : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      {filter === 'all' ? 'All' : filter === 'messages' ? 'Messages' : 'Comments & Reels'}
                    </button>
                  ))}
                </div>

                {filteredConversations.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">
                      {inboxFilter === 'messages' ? 'No direct messages yet.' : inboxFilter === 'comments' ? 'No comments or reel interactions yet.' : 'No conversations yet.'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredConversations.map((conv) => (
                      <div
                        key={conv.id}
                        onClick={() => setSelectedConversationId(conv.id)}
                        className="w-full p-4 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 text-left transition-colors cursor-pointer"
                      >
                        {/* Avatar */}
                        {conv.otherPartyAvatar ? (
                          <img src={conv.otherPartyAvatar} alt="" className="w-11 h-11 rounded-full flex-shrink-0" />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center flex-shrink-0">
                            {conv.type === 'dm' ? (
                              <User className="w-5 h-5 text-pink-500" />
                            ) : conv.mediaType === 'REEL' ? (
                              <Film className="w-5 h-5 text-pink-500" />
                            ) : (
                              <ImageIcon className="w-5 h-5 text-pink-500" />
                            )}
                          </div>
                        )}

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {conv.otherPartyName}
                              </p>
                              {conv.otherPartyUsername && (
                                <span className="text-xs text-gray-400 truncate">@{conv.otherPartyUsername}</span>
                              )}
                            </div>
                            <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(conv.lastMessageAt)}</span>
                          </div>

                          {/* Media type badge for comments */}
                          {conv.type === 'media' && (
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${eventBadgeColor(conv.events[0].event_type)}`}>
                                {conv.events[0].event_type}
                              </span>
                              {conv.mediaType === 'REEL' && (
                                <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                                  <Film className="w-3 h-3" /> Reel
                                </span>
                              )}
                              {conv.mediaType && conv.mediaType !== 'REEL' && (
                                <span className="text-[10px] text-gray-400">{conv.mediaType}</span>
                              )}
                            </div>
                          )}

                          {/* Last message preview */}
                          <p className={`text-sm truncate ${conv.unreadCount > 0 ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                            {conv.events[0].direction === 'outgoing' && conv.type === 'dm' && (
                              <span className="text-gray-400">You: </span>
                            )}
                            {conv.lastMessageText || '(no text)'}
                          </p>

                          {/* Media caption snippet for comment threads */}
                          {conv.type === 'media' && conv.mediaCaption && (
                            <p className="text-xs text-gray-400 truncate mt-0.5">On: {conv.mediaCaption}</p>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {conv.unreadCount > 0 && (
                            <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-semibold text-white bg-pink-500 rounded-full">
                              {conv.unreadCount}
                            </span>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv); }}
                            className="p-1 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                            title="Delete conversation"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
          <div className="space-y-6">
            {/* Info banner */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <HelpCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">How Auto Rules Work</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Auto rules watch incoming comments on your posts. When someone comments with a keyword you specify, you can automatically reply with a public comment, send a private DM, or both. You can include links and file attachments in DMs. Toggle rules on or off anytime.
                    </p>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-3">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white mb-1">1. Pick a keyword</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Choose a word or phrase that triggers the rule. When someone comments with that word, the rule fires.</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-3">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white mb-1">2. Write a reply</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Set the automatic reply message that gets posted as a comment response.</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-3">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white mb-1">3. Toggle on/off</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Pause or activate rules anytime with the toggle switch. You can also limit a rule to a specific post.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Info className="w-3.5 h-3.5 text-blue-400" />
                    <p className="text-xs text-gray-500 dark:text-gray-400">Example: Keyword "price" with reply "Send us a DM for pricing!" automatically responds to anyone asking about price.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end mb-4">
              <button
                onClick={handleNewRule}
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
                  <p className="text-gray-500 dark:text-gray-400 mb-4">Set up rules to automatically reply to comments or send DMs when someone comments a keyword.</p>
                  <button
                    onClick={handleNewRule}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create your first rule
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {rules.map((rule) => {
                    const actionLabel = rule.action_type === 'dm' ? 'Sends DM' : rule.action_type === 'both' ? 'Comment + DM' : 'Public comment';
                    const actionColor = rule.action_type === 'dm' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : rule.action_type === 'both' ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
                    return (
                      <div key={rule.id} className="p-4 flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">"{rule.trigger_keyword}"</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${actionColor}`}>{actionLabel}</span>
                            {rule.active ? (
                              <span className="text-[10px] text-green-600 dark:text-green-400">Active</span>
                            ) : (
                              <span className="text-[10px] text-gray-400">Paused</span>
                            )}
                          </div>
                          {(rule.action_type === 'comment' || rule.action_type === 'both') && rule.reply_text && (
                            <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-1 mb-0.5">
                              <span className="text-xs text-gray-400">Comment:</span> {rule.reply_text}
                            </p>
                          )}
                          {(rule.action_type === 'dm' || rule.action_type === 'both') && (rule.dm_message || rule.reply_text) && (
                            <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-1 mb-0.5">
                              <span className="text-xs text-gray-400">DM:</span> {rule.dm_message || rule.reply_text}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            {rule.link_url && (
                              <span className="flex items-center gap-1 text-xs text-gray-400">
                                <LinkIcon className="w-3 h-3" /> Link
                              </span>
                            )}
                            {rule.media_url && (
                              <span className="flex items-center gap-1 text-xs text-gray-400">
                                {rule.media_type === 'image' ? <ImageIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                                {rule.media_type || 'File'}
                              </span>
                            )}
                            {rule.media_id && (
                              <span className="text-xs text-gray-400">Post: {rule.media_id.slice(0, 12)}...</span>
                            )}
                            {rule.send_once_per_user && (
                              <span className="text-xs text-gray-400">Once per user</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          {rule.is_synced_copy && (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                              <Link2 className="w-2.5 h-2.5" /> Synced
                            </span>
                          )}
                          {rule.settings_group_id && !rule.is_synced_copy && (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                              <Link2Off className="w-2.5 h-2.5" /> Independent
                            </span>
                          )}
                          <button
                            onClick={() => handleEditRule(rule)}
                            className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            title="Edit rule"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
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
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Flows tab */}
        {activeTab === 'flows' && selectedAccount && (
          <FlowBuilder
            accountId={selectedAccount.id}
            userId={selectedAccount.user_id}
            allAccounts={allAccounts.map(a => ({ id: a.id, username: a.username, profile_picture_url: a.profile_picture_url, user_id: a.user_id }))}
          />
        )}

        {/* AI Autoresponder tab */}
        {activeTab === 'autoresponder' && selectedAccount && (
          <AutoresponderTab
            accountId={selectedAccount.id}
            settings={autoresponderSettings}
            prompts={availablePrompts}
            isSaving={isSavingAutoresponder}
            allAccounts={allAccounts.map(a => ({ id: a.id, username: a.username, profile_picture_url: a.profile_picture_url, user_id: a.user_id }))}
            userId={selectedAccount.user_id}
            onSave={async (newSettings) => {
              setIsSavingAutoresponder(true);
              try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                // Fetch the existing settings record to get the id and group info
                const { data: existing } = await supabase
                  .from('instagram_autoresponder_settings')
                  .select('id, settings_group_id, is_synced_copy')
                  .eq('account_id', selectedAccount.id)
                  .maybeSingle();

                const { error } = await supabase
                  .from('instagram_autoresponder_settings')
                  .upsert({
                    id: existing?.id,
                    account_id: selectedAccount.id,
                    user_id: user.id,
                    enabled: newSettings.enabled,
                    prompt_id: newSettings.prompt_id || null,
                    response_delay_seconds: newSettings.response_delay_seconds,
                    updated_at: new Date().toISOString(),
                  }, { onConflict: 'account_id' });

                if (error) throw error;
                setAutoresponderSettings(newSettings);

                // Sync to other accounts if this is a synced copy
                if (existing?.is_synced_copy && existing?.settings_group_id && existing?.id) {
                  const { data: session } = await supabase.auth.getSession();
                  await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/share-settings`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${session?.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                    },
                    body: JSON.stringify({ action: 'sync_autoresponder', p_settings_id: existing.id }),
                  });
                }
              } catch (error) {
                console.error('Error saving autoresponder settings:', error);
                alert('Failed to save autoresponder settings');
              } finally {
                setIsSavingAutoresponder(false);
              }
            }}
          />
        )}

        {/* Sharing tab — central control panel */}
        {activeTab === 'sharing' && selectedAccount && (
          <SharingControlPanel
            accounts={accounts}
            selectedAccount={selectedAccount}
            userId={selectedAccount.user_id}
            orgMembers={orgMembers}
            shares={shares}
            showShareModal={showShareModal}
            setShowShareModal={setShowShareModal}
            onRefresh={fetchData}
          />
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

        {/* New/Edit Rule Modal */}
        {showRuleModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  {editingRuleId ? 'Edit Auto Rule' : 'New Auto Rule'}
                </h3>
                <button onClick={() => { setShowRuleModal(false); setEditingRuleId(null); }} className="text-gray-400 hover:text-gray-500">
                  <X className="w-5 h-5" />
                </button>
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
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">When someone comments with this word, the rule fires.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Action Type</label>
                  <select
                    value={newRule.action_type}
                    onChange={(e) => setNewRule(prev => ({ ...prev, action_type: e.target.value as 'comment' | 'dm' | 'both' }))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="comment">Reply as public comment</option>
                    <option value="dm">Send a private DM</option>
                    <option value="both">Reply as comment AND send DM</option>
                  </select>
                </div>

                {(newRule.action_type === 'comment' || newRule.action_type === 'both') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Comment Reply Text</label>
                    <textarea
                      value={newRule.reply_text}
                      onChange={(e) => setNewRule(prev => ({ ...prev, reply_text: e.target.value }))}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="The public comment reply message"
                    />
                  </div>
                )}

                {(newRule.action_type === 'dm' || newRule.action_type === 'both') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">DM Message Text</label>
                    <textarea
                      value={newRule.dm_message}
                      onChange={(e) => setNewRule(prev => ({ ...prev, dm_message: e.target.value }))}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="The private DM message to send"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      If left empty, the comment reply text will be used for the DM.
                    </p>
                    <div className="flex items-center gap-2 mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                      <input
                        type="checkbox"
                        id="send_once"
                        checked={newRule.send_once_per_user}
                        onChange={(e) => setNewRule(prev => ({ ...prev, send_once_per_user: e.target.checked }))}
                        className="rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                      />
                      <label htmlFor="send_once" className="text-xs text-gray-600 dark:text-gray-400">
                        Only DM each person once per rule (recommended — Instagram limits DMs)
                      </label>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Link URL (optional)</label>
                  <input
                    type="url"
                    value={newRule.link_url}
                    onChange={(e) => setNewRule(prev => ({ ...prev, link_url: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="https://example.com/offer"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">The link will be appended to the reply or DM message.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Media Attachment (optional)</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={newRule.media_url}
                      onChange={(e) => setNewRule(prev => ({ ...prev, media_url: e.target.value }))}
                      className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="https://example.com/file.pdf"
                    />
                    <select
                      value={newRule.media_type}
                      onChange={(e) => setNewRule(prev => ({ ...prev, media_type: e.target.value as '' }))}
                      className="w-28 px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="">Type</option>
                      <option value="image">Image</option>
                      <option value="file">File</option>
                      <option value="video">Video</option>
                    </select>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">A publicly accessible URL to a file or image to attach to the DM.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Post ID (optional)</label>
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
                <button onClick={() => { setShowRuleModal(false); setEditingRuleId(null); }} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
                <button
                  onClick={handleSaveRule}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-pink-600 hover:bg-pink-700"
                >
                  {editingRuleId ? <><Save className="w-4 h-4 mr-2" />Update Rule</> : 'Save Rule'}
                </button>
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

function AutoresponderTab({ accountId, settings, prompts, isSaving, onSave, allAccounts, userId }: {
  accountId: string;
  settings: { enabled: boolean; prompt_id: string | null; response_delay_seconds: number } | null;
  prompts: Array<{ id: string; title: string; reply_mode: string; category: string }>;
  isSaving: boolean;
  allAccounts: Array<{ id: string; username: string | null; profile_picture_url: string | null; user_id: string }>;
  userId: string;
  onSave: (settings: { enabled: boolean; prompt_id: string | null; response_delay_seconds: number }) => void;
}) {
  const [enabled, setEnabled] = useState(settings?.enabled ?? false);
  const [promptId, setPromptId] = useState(settings?.prompt_id ?? '');
  const [delaySeconds, setDelaySeconds] = useState(settings?.response_delay_seconds ?? 15);
  const [hasChanges, setHasChanges] = useState(false);
  const [syncInfo, setSyncInfo] = useState<{ shared: boolean; syncedCount: number; totalCount: number } | null>(null);

  useEffect(() => {
    setEnabled(settings?.enabled ?? false);
    setPromptId(settings?.prompt_id ?? '');
    setDelaySeconds(settings?.response_delay_seconds ?? 15);
    setHasChanges(false);
  }, [settings, accountId]);

  // Fetch sync status for this autoresponder
  useEffect(() => {
    const fetchSyncInfo = async () => {
      const { data: ars } = await supabase
        .from('instagram_autoresponder_settings')
        .select('id, settings_group_id, is_synced_copy')
        .eq('account_id', accountId)
        .maybeSingle();
      if (!ars?.settings_group_id) { setSyncInfo(null); return; }
      const { data: subs } = await supabase
        .from('instagram_settings_subscriptions')
        .select('account_id, synced')
        .eq('group_id', ars.settings_group_id);
      const total = (subs || []).length;
      const synced = (subs || []).filter(s => s.synced).length;
      setSyncInfo({ shared: total > 1, syncedCount: synced, totalCount: total });
    };
    fetchSyncInfo();
  }, [accountId, isSaving]);

  const changes = { enabled, prompt_id: promptId, response_delay_seconds: delaySeconds };
  void changes;

  const handleSave = () => {
    onSave({
      enabled,
      prompt_id: promptId || null,
      response_delay_seconds: delaySeconds,
    });
    setHasChanges(false);
  };

  const twoStepPrompts = prompts.filter(p => p.reply_mode === 'two_step');
  const singleStepPrompts = prompts.filter(p => p.reply_mode !== 'two_step');

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="bg-gradient-to-br from-pink-50 to-purple-50 dark:from-pink-900/20 dark:to-purple-900/20 border border-pink-200 dark:border-pink-800 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <Bot className="w-5 h-5 text-pink-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">AI Autoresponder for Instagram DMs</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              When enabled, incoming direct messages are automatically answered using your chosen prompt and the OpenAI API. The AI reads the incoming message and your conversation history, then generates a contextually appropriate reply — just like the email autoresponder.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <Info className="w-3.5 h-3.5 text-pink-400" />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Supports both single-step and two-step prompts. Two-step prompts run Step 1 first, then feed the result into Step 2 for a more refined reply.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 space-y-6">
        {/* Sync status */}
        <div className="flex items-center gap-2 pb-3 border-b border-gray-100 dark:border-gray-700">
          {syncInfo && syncInfo.shared ? (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium ${syncInfo.syncedCount > 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>
              {syncInfo.syncedCount > 0 ? <Link2 className="w-2.5 h-2.5" /> : <Link2Off className="w-2.5 h-2.5" />}
              {syncInfo.syncedCount > 0 ? `Synced to ${syncInfo.syncedCount} account${syncInfo.syncedCount !== 1 ? 's' : ''}` : 'Independent'}
            </span>
          ) : (
            <span className="text-xs text-gray-400">Not shared</span>
          )}
        </div>

        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Enable AI Autoresponder</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Automatically reply to incoming DMs using AI</p>
          </div>
          <button
            onClick={() => { setEnabled(!enabled); setHasChanges(true); }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
          >
            <span className="inline-block transform rounded-full bg-white transition-transform" style={{ width: '18px', height: '18px', transform: enabled ? 'translateX(24px)' : 'translateX(4px)' }} />
          </button>
        </div>

        {/* Prompt selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Prompt</label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Choose a prompt from your Prompts library. Prompts marked as "2-Step" will run two AI calls in sequence.
          </p>
          <select
            value={promptId}
            onChange={(e) => { setPromptId(e.target.value); setHasChanges(true); }}
            disabled={!enabled}
            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
          >
            <option value="">Select a prompt...</option>
            {twoStepPrompts.length > 0 && (
              <optgroup label="Two-Step Prompts">
                {twoStepPrompts.map(p => (
                  <option key={p.id} value={p.id}>{p.title} (2-Step)</option>
                ))}
              </optgroup>
            )}
            {singleStepPrompts.length > 0 && (
              <optgroup label="Single-Step Prompts">
                {singleStepPrompts.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </optgroup>
            )}
          </select>
          {prompts.length === 0 && (
            <p className="text-xs text-amber-500 mt-2">
              No prompts found. Create prompts in the Prompts page first.
            </p>
          )}
        </div>

        {/* Response delay setting */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Response Delay (seconds)</label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            When a message arrives, the AI waits this many seconds before responding. If multiple messages come in during this window, they are combined into a single AI response — so quick back-to-back messages get one reply instead of several.
          </p>
          <input
            type="number"
            min={5}
            max={300}
            value={delaySeconds}
            onChange={(e) => { setDelaySeconds(parseInt(e.target.value) || 15); setHasChanges(true); }}
            disabled={!enabled}
            className="w-32 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
          />
        </div>

        {/* 24-hour window notice */}
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
          <Clock className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Instagram only allows replies within 24 hours of a user's last message. Auto-replies won't be sent after the 24-hour window closes.
          </p>
        </div>

        {/* Save button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="inline-flex items-center px-5 py-2.5 text-sm font-medium rounded-lg text-white bg-pink-600 hover:bg-pink-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function SharingControlPanel({ accounts, selectedAccount, userId, orgMembers, shares, showShareModal, setShowShareModal, onRefresh }: {
  accounts: IgAccount[];
  selectedAccount: IgAccount;
  userId: string;
  orgMembers: Array<{ user_id: string; email: string; role: string }>;
  shares: Array<{ id: string; shared_with_user_id: string; permissions: Record<string, boolean>; created_at: string; profile?: { email: string } | null }>;
  showShareModal: boolean;
  setShowShareModal: (v: boolean) => void;
  onRefresh: () => void;
}) {
  const [syncedAccounts, setSyncedAccounts] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [isResyncing, setIsResyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const otherAccounts = accounts.filter(a => a.id !== selectedAccount.id);

  const fetchSyncState = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: subs } = await supabase
        .from('instagram_settings_subscriptions')
        .select('account_id, synced')
        .eq('synced', true);

      const syncedSet = new Set<string>();
      for (const s of (subs || [])) {
        if (s.account_id !== selectedAccount.id) {
          syncedSet.add(s.account_id);
        }
      }
      setSyncedAccounts(syncedSet);
    } catch (err) {
      console.error('Error fetching sync state:', err);
      setError('Failed to load sharing status');
    } finally {
      setIsLoading(false);
    }
  }, [selectedAccount.id]);

  useEffect(() => { fetchSyncState(); }, [fetchSyncState]);

  const callShareApi = async (body: Record<string, unknown>): Promise<{ error: string | null }> => {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/share-settings`;
    const { data: session } = await supabase.auth.getSession();
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({ error: 'Request failed' }));
      return { error: errData.error || `Request failed (${response.status})` };
    }
    const json = await response.json();
    return { error: json.error ?? null };
  };

  const handleToggleAccount = async (accountId: string, isChecked: boolean) => {
    setBusyAccountId(accountId);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (isChecked) {
        const { error: apiError } = await callShareApi({
          action: 'sync_account',
          p_source_account_id: selectedAccount.id,
          p_account_id: accountId,
          p_user_id: user.id,
        });
        if (apiError) throw new Error(apiError);
        setSyncedAccounts(prev => new Set(prev).add(accountId));
        showToast(`Synced to ${accounts.find(a => a.id === accountId)?.username || 'account'}`);
      } else {
        const { error: apiError } = await callShareApi({
          action: 'unsync_account',
          p_account_id: accountId,
        });
        if (apiError) throw new Error(apiError);
        setSyncedAccounts(prev => { const s = new Set(prev); s.delete(accountId); return s; });
        showToast(`${accounts.find(a => a.id === accountId)?.username || 'Account'} is now independent`);
      }
      onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update sharing';
      setError(msg);
      showToast(msg);
    } finally {
      setBusyAccountId(null);
    }
  };

  const handleResyncAll = async () => {
    if (syncedAccounts.size === 0) {
      showToast('No accounts to re-sync');
      return;
    }
    setIsResyncing(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      for (const accountId of syncedAccounts) {
        const { error: apiError } = await callShareApi({
          action: 'resync_account',
          p_source_account_id: selectedAccount.id,
          p_account_id: accountId,
          p_user_id: user.id,
        });
        if (apiError) {
          console.error('Re-sync failed for', accountId, apiError);
          setError(`Re-sync failed for ${accounts.find(a => a.id === accountId)?.username || 'an account'}: ${apiError}`);
        }
      }
      showToast('All accounts re-synced');
      onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to re-sync';
      setError(msg);
      showToast(msg);
    } finally {
      setIsResyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Account Sync Checkboxes */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-pink-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Sync Settings Across Accounts</h3>
          </div>
          {syncedAccounts.size > 0 && !isLoading && (
            <button
              onClick={handleResyncAll}
              disabled={isResyncing}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-900/20 border border-pink-300 dark:border-pink-700 rounded-lg disabled:opacity-50"
            >
              {isResyncing ? (
                <><div className="w-3 h-3 border-2 border-pink-500 border-t-transparent rounded-full animate-spin mr-1.5" /> Re-syncing...</>
              ) : (
                <><RefreshCw className="w-3 h-3 mr-1.5" /> Re-sync All</>
              )}
            </button>
          )}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Check the box next to each account to share all flows, rules, and autoresponder settings from <span className="font-medium text-gray-700 dark:text-gray-300">{selectedAccount.username}</span>. Edits to any synced account automatically update all others.
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : otherAccounts.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            You only have one Instagram account. Link more accounts to share settings across them.
          </p>
        ) : (
          <div className="space-y-2">
            {otherAccounts.map(account => {
              const isSynced = syncedAccounts.has(account.id);
              const isBusy = busyAccountId === account.id;
              return (
                <label
                  key={account.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    isSynced
                      ? 'border-pink-300 dark:border-pink-700 bg-pink-50 dark:bg-pink-900/10'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  } ${isBusy ? 'opacity-60 pointer-events-none' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={isSynced}
                    onChange={(e) => handleToggleAccount(account.id, e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                  />
                  {account.profile_picture_url ? (
                    <img src={account.profile_picture_url} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-xs font-medium">
                      {(account.username || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{account.username || 'Unknown'}</p>
                    {isSynced ? (
                      <p className="text-xs text-green-500 flex items-center gap-1">
                        <Link2 className="w-3 h-3" /> Synced — edits propagate
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400">Not synced</p>
                    )}
                  </div>
                  {isBusy && (
                    <div className="w-4 h-4 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                  )}
                </label>
              );
            })}
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}
      </div>

      {/* Teammate sharing section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-pink-500" />
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
                    onRefresh();
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

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 dark:bg-gray-700 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
          <span className="text-sm">{toast}</span>
        </div>
      )}
    </div>
  );
}
