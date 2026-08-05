import React, { useState, useEffect, useCallback } from 'react';
import { Instagram as InstagramIcon, MessageSquare, Send, Plus, Trash2, RefreshCw, Zap, Clock, User, Image as ImageIcon, Share2, Users, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface InstagramProps {
  onSignOut: () => void;
  currentView: string;
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
}

type TabType = 'inbox' | 'posts' | 'rules' | 'sharing';

export function Instagram({ onSignOut, currentView }: InstagramProps) {
  const [activeTab, setActiveTab] = useState<TabType>('inbox');
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [rules, setRules] = useState<AutoRule[]>([]);
  const [posts, setPosts] = useState<IgPost[]>([]);
  const [account, setAccount] = useState<IgAccount | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [newRule, setNewRule] = useState({ trigger_keyword: '', reply_text: '', media_id: '' });
  const [newPost, setNewPost] = useState({ caption: '', scheduled_for: '' });
  const [shares, setShares] = useState<Array<{ id: string; shared_with_user_id: string; permissions: Record<string, boolean>; created_at: string; profile?: { email: string } | null }>>([]);
  const [sharedAccounts, setSharedAccounts] = useState<Array<{ id: string; username: string | null; user_id: string; ownerEmail?: string }>>([]);
  const [orgMembers, setOrgMembers] = useState<Array<{ user_id: string; email: string; role: string }>>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [eventsRes, rulesRes, postsRes, accountRes] = await Promise.all([
        supabase.from('instagram_webhook_events').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('instagram_auto_rules').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('instagram_posts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('instagram_accounts').select('*').eq('user_id', user.id).maybeSingle(),
      ]);

      if (!eventsRes.error) setEvents(eventsRes.data || []);
      if (!rulesRes.error) setRules(rulesRes.data || []);
      if (!postsRes.error) setPosts(postsRes.data || []);
      if (!accountRes.error) setAccount(accountRes.data || null);

      // Fetch shares for this account
      if (accountRes.data) {
        const { data: sharesData } = await supabase
          .from('instagram_account_shares')
          .select('id, shared_with_user_id, permissions, created_at')
          .eq('account_id', accountRes.data.id);

        if (sharesData) {
          const memberIds = sharesData.map(s => s.shared_with_user_id);
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, email')
            .in('id', memberIds);
          const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.email]));
          setShares(sharesData.map(s => ({ ...s, profile: { email: profileMap.get(s.shared_with_user_id) || 'Unknown' } })));
        }
      }

      // Fetch accounts shared WITH me
      const { data: sharedWithMe } = await supabase
        .from('instagram_account_shares')
        .select('account_id')
        .eq('shared_with_user_id', user.id);

      if (sharedWithMe && sharedWithMe.length > 0) {
        const accountIds = sharedWithMe.map(s => s.account_id);
        const { data: sharedAccts } = await supabase
          .from('instagram_accounts')
          .select('id, username, user_id')
          .in('id', accountIds);

        if (sharedAccts) {
          const ownerIds = sharedAccts.map(a => a.user_id);
          const { data: ownerProfiles } = await supabase
            .from('profiles')
            .select('id, email')
            .in('id', ownerIds);
          const ownerMap = new Map((ownerProfiles || []).map((p: any) => [p.id, p.email]));
          setSharedAccounts(sharedAccts.map(a => ({ ...a, ownerEmail: ownerMap.get(a.user_id) || 'Unknown' })));
        }
      }

      // Fetch org members for sharing dropdown
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

  if (isLoading) {
    return (
      <div className="p-8 bg-white dark:bg-gray-900 min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 bg-white dark:bg-gray-900 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <InstagramIcon className="w-6 h-6 text-pink-600 dark:text-pink-400" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Instagram</h1>
          </div>
          <button
            onClick={fetchData}
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg shadow-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
        </div>

        {/* Account status */}
        <div className={`rounded-xl p-4 mb-6 ${account?.connected ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${account?.connected ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {account?.connected ? `Connected as @${account.username || 'unknown'}` : 'Instagram account not connected'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {account?.connected
                  ? 'Your account is linked. Webhook events will appear in the Inbox tab.'
                  : 'Go to Settings > Instagram to connect your account and enter your Meta verify token.'}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex space-x-8">
              <button
                onClick={() => setActiveTab('inbox')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'inbox' ? 'border-pink-500 text-pink-600 dark:text-pink-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Inbox ({events.length})
                </div>
              </button>
              <button
                onClick={() => setActiveTab('posts')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'posts' ? 'border-pink-500 text-pink-600 dark:text-pink-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
              >
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  Posts ({posts.length})
                </div>
              </button>
              <button
                onClick={() => setActiveTab('rules')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'rules' ? 'border-pink-500 text-pink-600 dark:text-pink-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Auto Rules ({rules.length})
                </div>
              </button>
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
                  Incoming comments and messages from your Instagram webhook will appear here once Meta starts sending events.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {events.map((event) => (
                  <div key={event.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            event.event_type === 'comment' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                            event.event_type === 'message' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                            'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                          }`}>
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
        {activeTab === 'sharing' && account?.connected && (
          <div className="space-y-6">
            {/* Share with teammate */}
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
                  You haven't shared your Instagram account with anyone yet. Click "Add Share" to let teammates view your inbox, collaborate on replies, and help manage posts.
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

            {/* Accounts shared with me */}
            {sharedAccounts.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="w-5 h-5 text-blue-500" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Shared With You</h3>
                </div>
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {sharedAccounts.map((acct) => (
                    <div key={acct.id} className="flex items-center gap-3 py-3">
                      <div className="p-2 rounded-lg bg-pink-100 dark:bg-pink-900/20">
                        <InstagramIcon className="w-4 h-4 text-pink-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">@{acct.username || 'unknown'}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Shared by {acct.ownerEmail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Share Modal */}
        {showShareModal && (
          <ShareModal
            accountId={account?.id || ''}
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
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">When a comment contains this keyword, the reply is posted automatically.</p>
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
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Leave blank to save as a draft. Publishing requires your Instagram account to be connected.</p>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setShowPostModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
                <button onClick={handleSavePost} className="px-4 py-2 text-sm font-medium rounded-lg text-white bg-pink-600 hover:bg-pink-700">Save Post</button>
              </div>
            </div>
          </div>
        )}
      </div>
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
