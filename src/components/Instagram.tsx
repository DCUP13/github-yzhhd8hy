import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useRoute, navigateToApp } from '../lib/router';
import {
  Instagram as InstagramIcon,
  MessageSquare,
  Send,
  Plus,
  Trash2,
  RefreshCw,
  Zap,
  Clock,
  User,
  Image as ImageIcon,
  Users,
  X,
  BarChart3,
  TrendingUp,
  Heart,
  Eye,
  Bookmark,
  Play,
  ChevronDown,
  Film,
  ArrowLeft,
  CheckCheck,
  HelpCircle,
  Info,
  Bot,
  Loader2,
} from 'lucide-react';

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

interface WebhookEvent {
  id: string;
  event_id: string | null;
  event_type: string;
  ig_user_id: string | null;
  sender_id: string | null;
  sender_username: string | null;
  sender_name: string | null;
  sender_profile_url: string | null;
  media_id: string | null;
  comment_id: string | null;
  message_text: string | null;
  raw_event: any;
  created_at: string;
  recipient_id: string | null;
  direction: string;
  media_type: string | null;
  media_permalink: string | null;
  media_caption: string | null;
  reply_text: string | null;
  replied_at: string | null;
  auto_replied: boolean | null;
}

interface AutoRule {
  id: string;
  trigger_keyword: string;
  reply_text: string;
  media_id: string | null;
  active: boolean;
}

interface Prompt {
  id: string;
  title: string;
  content: string | null;
  reply_mode: string;
}

interface AutoresponderSettings {
  id: string;
  enabled: boolean;
  prompt_id: string | null;
  cooldown_minutes: number;
}

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

type TabType = 'inbox' | 'posts' | 'rules' | 'stats';

export default function Instagram() {
  const route = useRoute();
  const initialTab = (route.params.tab as TabType) || 'inbox';
  const initialAccountId = route.params.account || '';

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(initialAccountId);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [rules, setRules] = useState<AutoRule[]>([]);
  const [accounts, setAccounts] = useState<IgAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [newRule, setNewRule] = useState({ trigger_keyword: '', reply_text: '', media_id: '' });
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [inboxFilter, setInboxFilter] = useState<'all' | 'messages' | 'comments'>('all');
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [autoresponderSettings, setAutoresponderSettings] = useState<AutoresponderSettings | null>(null);
  const [savingAutoresponder, setSavingAutoresponder] = useState(false);

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) || accounts[0] || null;

  const updateUrl = useCallback((tab: TabType, accountId: string) => {
    const params: Record<string, string> = { tab };
    if (accountId) params.account = accountId;
    navigateToApp('instagram', params);
  }, []);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (selectedAccount) {
      updateUrl(tab, selectedAccount.id);
    } else {
      updateUrl(tab, '');
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: ownAccounts } = await supabase
        .from('instagram_accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      setAccounts(ownAccounts || []);

      let currentAccount: IgAccount | null = null;
      if (selectedAccountId && (ownAccounts || []).find(a => a.id === selectedAccountId)) {
        currentAccount = (ownAccounts || []).find(a => a.id === selectedAccountId)!;
      } else if ((ownAccounts || []).length > 0) {
        currentAccount = (ownAccounts || [])[0];
        setSelectedAccountId((ownAccounts || [])[0].id);
      }

      if (currentAccount) {
        await fetchAccountData(currentAccount, user.id);
      }

      // Fetch prompts for autoresponder
      const { data: promptData } = await supabase
        .from('prompts')
        .select('id, title, content, reply_mode')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      setPrompts(promptData || []);

      // Fetch autoresponder settings
      if (currentAccount) {
        const { data: arSettings } = await supabase
          .from('instagram_autoresponder_settings')
          .select('*')
          .eq('account_id', currentAccount.id)
          .maybeSingle();
        setAutoresponderSettings(arSettings as AutoresponderSettings | null);
      }
    } catch (error) {
      console.error('Error fetching Instagram data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedAccountId]);

  const fetchAccountData = async (account: IgAccount, userId: string) => {
    const [eventsRes, rulesRes] = await Promise.all([
      supabase.from('instagram_webhook_events')
        .select('*')
        .or(`user_id.eq.${account.user_id},ig_user_id.eq.${account.ig_user_id}`)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('instagram_auto_rules')
        .select('*')
        .eq('user_id', account.user_id)
        .order('created_at', { ascending: false }),
    ]);

    if (!eventsRes.error) setEvents(eventsRes.data || []);
    if (!rulesRes.error) setRules(rulesRes.data || []);
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
          setEvents(prev => [newEvent, ...prev].slice(0, 200));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedAccount?.id]);

  const conversations = useMemo((): Conversation[] => {
    const convos = new Map<string, Conversation>();

    for (const event of events) {
      let convoId: string;
      let otherPartyId: string | null = null;
      let otherPartyName = 'Instagram User';
      let otherPartyUsername: string | null = null;
      let otherPartyAvatar: string | null = null;

      if (event.event_type === 'message') {
        if (event.direction === 'incoming') {
          otherPartyId = event.sender_id;
          otherPartyName = event.sender_name || event.sender_username || 'Instagram User';
          otherPartyUsername = event.sender_username;
          otherPartyAvatar = event.sender_profile_url;
        } else {
          otherPartyId = event.recipient_id;
          otherPartyName = 'Instagram User';
        }
        convoId = `dm_${otherPartyId}`;
      } else {
        const mediaId = event.media_id || 'unknown';
        convoId = `media_${mediaId}`;
        otherPartyName = event.sender_username || 'Instagram User';
        otherPartyUsername = event.sender_username;
      }

      if (!convos.has(convoId)) {
        convos.set(convoId, {
          id: convoId,
          type: event.event_type === 'message' ? 'dm' : 'media',
          events: [],
          otherPartyId,
          otherPartyName,
          otherPartyUsername,
          otherPartyAvatar,
          lastMessageAt: event.created_at,
          lastMessageText: event.message_text,
          lastIncomingAt: event.direction === 'incoming' ? event.created_at : null,
          unreadCount: 0,
          mediaType: event.media_type,
          mediaPermalink: event.media_permalink,
          mediaCaption: event.media_caption,
          isSelfChat: false,
        });
      }

      const conv = convos.get(convoId)!;
      conv.events.push(event);

      if (event.created_at > conv.lastMessageAt) {
        conv.lastMessageAt = event.created_at;
        conv.lastMessageText = event.message_text;
      }

      if (event.direction === 'incoming') {
        if (!conv.lastIncomingAt || event.created_at > conv.lastIncomingAt) {
          conv.lastIncomingAt = event.created_at;
        }
        if (!conv.otherPartyAvatar && event.sender_profile_url) {
          conv.otherPartyAvatar = event.sender_profile_url;
        }
        if (conv.otherPartyName === 'Instagram User' && event.sender_name) {
          conv.otherPartyName = event.sender_name;
        }
        if (!conv.otherPartyUsername && event.sender_username) {
          conv.otherPartyUsername = event.sender_username;
        }
      }

      if (event.direction === 'incoming' && !event.replied_at) {
        conv.unreadCount++;
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

    return Array.from(convos.values()).sort((a, b) =>
      b.lastMessageAt.localeCompare(a.lastMessageAt)
    );
  }, [events, selectedAccount]);

  const filteredConversations = useMemo(() => {
    if (inboxFilter === 'messages') return conversations.filter(c => c.type === 'dm');
    if (inboxFilter === 'comments') return conversations.filter(c => c.type === 'media');
    return conversations;
  }, [conversations, inboxFilter]);

  const selectedConversation = conversations.find(c => c.id === selectedConversationId) || null;

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedConversation || !selectedAccount) return;
    setIsSendingReply(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

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
        throw new Error(err.error || `Failed to send (${response.status})`);
      }

      setReplyText('');
      await fetchData();
    } catch (error) {
      console.error('Error sending reply:', error);
      alert(`Failed to send reply: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleDeleteConversation = async (conv: Conversation) => {
    if (!confirm(`Delete this conversation with ${conv.otherPartyName}? This cannot be undone.`)) return;
    try {
      if (conv.type === 'dm' && conv.otherPartyId) {
        const { error: err1 } = await supabase
          .from('instagram_webhook_events')
          .delete()
          .eq('event_type', 'message')
          .eq('direction', 'incoming')
          .eq('sender_id', conv.otherPartyId);
        const { error: err2 } = await supabase
          .from('instagram_webhook_events')
          .delete()
          .eq('event_type', 'message')
          .eq('direction', 'outgoing')
          .eq('recipient_id', conv.otherPartyId);
        if (err1 || err2) throw err1 || err2;
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
      alert('Failed to delete conversation.');
    }
  };

  const handleSaveRule = async () => {
    if (!newRule.trigger_keyword || !newRule.reply_text || !selectedAccount) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from('instagram_auto_rules').insert({
        trigger_keyword: newRule.trigger_keyword,
        reply_text: newRule.reply_text,
        media_id: newRule.media_id || null,
        active: true,
        user_id: user.id,
      });

      if (error) throw error;
      setNewRule({ trigger_keyword: '', reply_text: '', media_id: '' });
      setShowRuleModal(false);
      await fetchData();
    } catch (error) {
      console.error('Error saving rule:', error);
      alert('Failed to save rule.');
    }
  };

  const handleToggleRule = async (rule: AutoRule) => {
    try {
      const { error } = await supabase
        .from('instagram_auto_rules')
        .update({ active: !rule.active })
        .eq('id', rule.id);
      if (error) throw error;
      await fetchData();
    } catch (error) {
      console.error('Error toggling rule:', error);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      const { error } = await supabase
        .from('instagram_auto_rules')
        .delete()
        .eq('id', ruleId);
      if (error) throw error;
      await fetchData();
    } catch (error) {
      console.error('Error deleting rule:', error);
    }
  };

  const handleSaveAutoresponder = async (settings: {
    enabled: boolean;
    prompt_id: string | null;
    cooldown_minutes: number;
  }) => {
    if (!selectedAccount) return;
    setSavingAutoresponder(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (autoresponderSettings) {
        const { error } = await supabase
          .from('instagram_autoresponder_settings')
          .update({
            enabled: settings.enabled,
            prompt_id: settings.prompt_id,
            cooldown_minutes: settings.cooldown_minutes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', autoresponderSettings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('instagram_autoresponder_settings')
          .insert({
            account_id: selectedAccount.id,
            user_id: user.id,
            enabled: settings.enabled,
            prompt_id: settings.prompt_id,
            cooldown_minutes: settings.cooldown_minutes,
          });
        if (error) throw error;
      }
      await fetchData();
    } catch (error) {
      console.error('Error saving autoresponder:', error);
      alert('Failed to save autoresponder settings.');
    } finally {
      setSavingAutoresponder(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 3600000;
    if (diff < 24) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (diff < 168) return d.toLocaleDateString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 3600000;
    if (diff < 1) return 'now';
    if (diff < 24) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (diff < 168) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const eventBadgeColor = (type: string) => {
    switch (type) {
      case 'comment': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
      case 'mention': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
      case 'share': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
      case 'repost': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  // Check if a message was sent from the phone (is_echo = true in raw_event)
  const isPhoneMessage = (event: WebhookEvent): boolean => {
    if (event.direction !== 'outgoing') return false;
    const raw = event.raw_event;
    if (raw?.message?.is_echo === true) return true;
    if (raw?.auto_reply === true) return false;
    if (raw?.manual_reply === true) return false;
    // Check raw_event for is_echo field
    return false;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-center py-16">
          <InstagramIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No Instagram account connected</h2>
          <p className="text-gray-500 dark:text-gray-400">Connect your Instagram account to start managing your DMs and comments.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {selectedAccount?.profile_picture_url ? (
            <img src={selectedAccount.profile_picture_url} alt="" className="w-10 h-10 rounded-full" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-fuchsia-600 flex items-center justify-center">
              <InstagramIcon className="w-5 h-5 text-white" />
            </div>
          )}
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              {selectedAccount?.username || 'Instagram'}
            </h1>
            <p className="text-xs text-gray-400">
              {selectedAccount?.followers_count?.toLocaleString() || 0} followers
              {selectedAccount?.token_expired && ' · Token expired'}
            </p>
          </div>
        </div>

        {/* Account dropdown */}
        {accounts.length > 1 && (
          <div className="relative">
            <button
              onClick={() => setShowAccountDropdown(!showAccountDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              Switch account
              <ChevronDown className="w-4 h-4" />
            </button>
            {showAccountDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20">
                {accounts.map(acct => (
                  <button
                    key={acct.id}
                    onClick={() => {
                      setSelectedAccountId(acct.id);
                      setShowAccountDropdown(false);
                      updateUrl(activeTab, acct.id);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg ${
                      acct.id === selectedAccountId ? 'text-pink-600 font-medium' : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {acct.profile_picture_url ? (
                      <img src={acct.profile_picture_url} alt="" className="w-6 h-6 rounded-full" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-pink-100 flex items-center justify-center">
                        <User className="w-3 h-3 text-pink-500" />
                      </div>
                    )}
                    {acct.username}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700 mb-6">
        {([
          { key: 'inbox', label: 'Inbox', icon: MessageSquare },
          { key: 'rules', label: 'Auto Rules', icon: Zap },
          { key: 'stats', label: 'Stats', icon: BarChart3 },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? 'border-pink-500 text-pink-600 dark:text-pink-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Inbox tab */}
      {activeTab === 'inbox' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
          {selectedConversation ? (
            <div className="flex flex-col h-[calc(100vh-280px)] min-h-[450px] max-h-[700px]">
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

              {/* Messages list */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 dark:bg-gray-900/30 min-h-0">
                {selectedConversation.events
                  .slice()
                  .reverse()
                  .map((event) => {
                    // For self-chat: phone messages (is_echo) on left, app messages on right
                    // For normal conversations: outgoing on right, incoming on left
                    const isOutgoing = event.direction === 'outgoing';
                    const isFromPhone = isPhoneMessage(event);
                    const showOnRight = selectedConversation.isSelfChat ? !isFromPhone : isOutgoing;
                    return (
                      <div key={event.id} className={`flex ${showOnRight ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] ${showOnRight ? 'order-2' : 'order-1'}`}>
                          <div className={`rounded-2xl px-4 py-2.5 ${
                            showOnRight
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
                          <div className={`flex items-center gap-1 mt-1 ${showOnRight ? 'justify-end' : 'justify-start'}`}>
                            {event.event_type !== 'message' && (
                              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${eventBadgeColor(event.event_type)}`}>
                                {event.event_type}
                              </span>
                            )}
                            {selectedConversation.isSelfChat && isFromPhone && (
                              <span className="text-[10px] text-gray-400">From phone</span>
                            )}
                            {selectedConversation.isSelfChat && !isFromPhone && isOutgoing && (
                              <span className="text-[10px] text-gray-400">From app</span>
                            )}
                            {event.auto_replied && (
                              <span className="text-[10px] text-blue-400 flex items-center gap-0.5">
                                <Bot className="w-2.5 h-2.5" /> AI
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
                      ? `The 24-hour messaging window has closed. Instagram only allows replies within 24 hours of a user's last message.`
                      : `Only ${Math.round(hoursLeft)}h left to reply.`
                    }
                  </div>
                );
              })()}

              {/* Reply box */}
              {selectedConversation.type === 'dm' && (
                <div className="border-t border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-800 flex-shrink-0">
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
                        {isSendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
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

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {conv.otherPartyName}
                            </p>
                            {conv.isSelfChat && (
                              <span className="text-xs text-pink-500">(You)</span>
                            )}
                            {conv.otherPartyUsername && !conv.isSelfChat && (
                              <span className="text-xs text-gray-400 truncate">@{conv.otherPartyUsername}</span>
                            )}
                          </div>
                          <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(conv.lastMessageAt)}</span>
                        </div>

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
                          </div>
                        )}

                        <p className={`text-sm truncate ${conv.unreadCount > 0 ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                          {conv.events[0].direction === 'outgoing' && conv.type === 'dm' && (
                            <span className="text-gray-400">You: </span>
                          )}
                          {conv.lastMessageText || '(no text)'}
                        </p>

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

      {/* Rules tab */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          {/* AI Autoresponder section */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <Bot className="w-5 h-5 text-pink-500" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">AI Autoresponder</h3>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  When someone sends you a direct message, AI automatically generates a reply using your selected prompt.
                  You can use single-step or two-step prompts (like the email autoresponder). Replies are sent within
                  Instagram's 24-hour messaging window. The cooldown prevents replying to the same person too frequently.
                </p>
              </div>
            </div>

            {selectedAccount && (
              <div className="space-y-4">
                {/* Enable toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Enable AI autoresponder</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Automatically reply to incoming DMs with AI</p>
                  </div>
                  <button
                    onClick={() => handleSaveAutoresponder({
                      enabled: !autoresponderSettings?.enabled,
                      prompt_id: autoresponderSettings?.prompt_id || null,
                      cooldown_minutes: autoresponderSettings?.cooldown_minutes || 30,
                    })}
                    disabled={savingAutoresponder}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      autoresponderSettings?.enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      autoresponderSettings?.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

                {/* Prompt selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Prompt
                  </label>
                  {prompts.length === 0 ? (
                    <p className="text-xs text-gray-400">
                      No prompts yet. Create a prompt first to use with the autoresponder.
                    </p>
                  ) : (
                    <select
                      value={autoresponderSettings?.prompt_id || ''}
                      onChange={(e) => handleSaveAutoresponder({
                        enabled: autoresponderSettings?.enabled || false,
                        prompt_id: e.target.value || null,
                        cooldown_minutes: autoresponderSettings?.cooldown_minutes || 30,
                      })}
                      disabled={savingAutoresponder}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                    >
                      <option value="">Select a prompt...</option>
                      {prompts.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.title} ({p.reply_mode === 'two_step' ? 'two-step' : 'single'})
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Available placeholders: {'{{message}}'}, {'{{conversation}}'}, {'{{sender_name}}'}, {'{{business_data}}'}
                  </p>
                </div>

                {/* Cooldown */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Cooldown (minutes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={autoresponderSettings?.cooldown_minutes || 30}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 30;
                      setAutoresponderSettings(prev => prev ? { ...prev, cooldown_minutes: val } : prev);
                    }}
                    onBlur={(e) => handleSaveAutoresponder({
                      enabled: autoresponderSettings?.enabled || false,
                      prompt_id: autoresponderSettings?.prompt_id || null,
                      cooldown_minutes: parseInt(e.target.value) || 30,
                    })}
                    disabled={savingAutoresponder}
                    className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Minimum minutes between auto-replies to the same person
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Auto Rules info banner */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <HelpCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">How Auto Rules Work</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Auto rules watch incoming comments on your posts. When someone comments with a keyword you specify,
                    Instagram automatically replies with your pre-written message. Great for answering common questions
                    like pricing, hours, or link requests.
                  </p>
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3">
                    <p className="text-xs font-semibold text-gray-900 dark:text-white mb-1">1. Pick a keyword</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Choose a word that triggers the rule. When someone comments with that word, the rule fires.</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3">
                    <p className="text-xs font-semibold text-gray-900 dark:text-white mb-1">2. Write a reply</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Set the automatic reply message that gets posted as a comment response.</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3">
                    <p className="text-xs font-semibold text-gray-900 dark:text-white mb-1">3. Toggle on/off</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Pause or activate rules anytime. You can also limit a rule to a specific post.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Info className="w-3.5 h-3.5 text-blue-400" />
                  <p className="text-xs text-gray-500 dark:text-gray-400">Example: Keyword "price" with reply "Send us a DM for pricing!" automatically responds to anyone asking about price.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Rules list */}
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
                <p className="text-gray-500 dark:text-gray-400 mb-4">Set up rules to automatically reply to comments that match a keyword.</p>
                <button
                  onClick={() => setShowRuleModal(true)}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create your first rule
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {rules.map((rule) => (
                  <div key={rule.id} className="p-4 flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">"{rule.trigger_keyword}"</span>
                        <span className="text-gray-400">&rarr;</span>
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

      {/* Stats tab */}
      {activeTab === 'stats' && selectedAccount && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-pink-500" />
                <span className="text-xs text-gray-400">Followers</span>
              </div>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                {selectedAccount.followers_count?.toLocaleString() || '0'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-4 h-4 text-pink-500" />
                <span className="text-xs text-gray-400">Following</span>
              </div>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                {selectedAccount.follows_count?.toLocaleString() || '0'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <ImageIcon className="w-4 h-4 text-pink-500" />
                <span className="text-xs text-gray-400">Posts</span>
              </div>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                {selectedAccount.media_count?.toLocaleString() || '0'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-pink-500" />
                <span className="text-xs text-gray-400">Conversations</span>
              </div>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                {conversations.length}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* New Rule Modal */}
      {showRuleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">New Auto-Comment Rule</h3>
              <button onClick={() => setShowRuleModal(false)} className="text-gray-400 hover:text-gray-500">
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
    </div>
  );
}
