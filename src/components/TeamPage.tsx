import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users, UserPlus, Mail, Trash2, Crown, Shield, User as UserIcon,
  Loader2, AlertCircle, CheckCircle2, Building2, Plus, Send,
  ChevronRight, Settings as SettingsIcon, MessageSquare, X, Search, Instagram as InstagramIcon
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Organization {
  id: string;
  name: string;
  created_at: string;
}

interface OrgMember {
  id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
  profiles: { email: string } | null;
  feature_flags?: Record<string, boolean> | null;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
  organization_id: string;
}

interface SupportMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

interface Conversation {
  userId: string;
  email: string;
  role: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

interface TeamPageProps {
  onSignOut: () => void;
  currentView: string;
  isSuperAdmin: boolean;
  onManageMemberSettings: (userId: string) => void;
}

type Tab = 'messages' | 'organization';

export function TeamPage({ onSignOut: _onSignOut, currentView: _currentView, isSuperAdmin, onManageMemberSettings }: TeamPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>('organization');
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; role: string } | null>(null);
  const [userOrgRole, setUserOrgRole] = useState<string | null>(null);
  const [userOrgId, setUserOrgId] = useState<string | null>(null);

  useEffect(() => {
    const initUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('email, role')
          .eq('id', user.id)
          .maybeSingle();

        setCurrentUser({
          id: user.id,
          email: profile?.email || user.email || '',
          role: profile?.role || 'user'
        });

        const { data: membership } = await supabase
          .from('organization_members')
          .select('role, organization_id')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();

        if (membership) {
          setUserOrgRole(membership.role);
          setUserOrgId(membership.organization_id);
        }
      } catch (err) {
        console.error('Error loading user:', err);
      } finally {
        setIsLoading(false);
      }
    };
    initUser();
  }, []);

  if (isLoading) {
    return (
      <div className="p-8 bg-white dark:bg-gray-900 min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-8 bg-white dark:bg-gray-900 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/20">
            <Users className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Team</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isSuperAdmin ? 'Manage organizations, members, and messages' : 'Your organization and support'}
            </p>
          </div>
        </div>

        <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
          <nav className="flex gap-1">
            <button
              onClick={() => setActiveTab('messages')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 ${
                activeTab === 'messages'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              Messages
            </button>
            <button
              onClick={() => setActiveTab('organization')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 ${
                activeTab === 'organization'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Organization
            </button>
          </nav>
        </div>

        {activeTab === 'messages' && currentUser && (
          <MessagesTab
            currentUser={currentUser}
            isSuperAdmin={isSuperAdmin}
            userOrgRole={userOrgRole}
            userOrgId={userOrgId}
          />
        )}

        {activeTab === 'organization' && currentUser && (
          <OrganizationTab
            currentUser={currentUser}
            isSuperAdmin={isSuperAdmin}
            userOrgRole={userOrgRole}
            userOrgId={userOrgId}
            onManageMemberSettings={onManageMemberSettings}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================
// Messages Tab — messenger for owner, ticket-style for others
// ============================================================

function MessagesTab({ currentUser, isSuperAdmin, userOrgRole, userOrgId }: {
  currentUser: { id: string; email: string; role: string };
  isSuperAdmin: boolean;
  userOrgRole: string | null;
  userOrgId: string | null;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      let query = supabase
        .from('support_messages')
        .select('sender_id, recipient_id, body, created_at, read_at');

      if (isSuperAdmin) {
        // Owner sees all messages
      } else {
        query = query.or(`sender_id.eq.${currentUser.id},recipient_id.eq.${currentUser.id}`);
      }

      const { data: msgData, error: msgError } = await query.order('created_at', { ascending: false });

      if (msgError) throw msgError;

      // Build conversation map
      const convMap = new Map<string, Conversation>();
      const otherUserIds = new Set<string>();

      for (const msg of msgData || []) {
        const otherId = msg.sender_id === currentUser.id ? msg.recipient_id : msg.sender_id;
        otherUserIds.add(otherId);

        const existing = convMap.get(otherId);
        const isUnread = msg.recipient_id === currentUser.id && !msg.read_at;

        if (!existing || new Date(msg.created_at) > new Date(existing.lastMessageAt)) {
          convMap.set(otherId, {
            userId: otherId,
            email: '',
            role: '',
            lastMessage: msg.body,
            lastMessageAt: msg.created_at,
            unreadCount: isUnread ? (existing?.unreadCount || 0) + 1 : (existing?.unreadCount || 0)
          });
        } else if (isUnread) {
          existing.unreadCount++;
        }
      }

      // Fetch profiles for all conversation partners
      if (otherUserIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, role')
          .in('id', Array.from(otherUserIds));

        if (profiles) {
          for (const profile of profiles) {
            const conv = convMap.get(profile.id);
            if (conv) {
              conv.email = profile.email;
              conv.role = profile.role;
            }
          }
        }
      }

      setConversations(Array.from(convMap.values()).sort((a, b) =>
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      ));
    } catch (err) {
      console.error('Error loading conversations:', err);
      setError('Failed to load conversations');
    }
  }, [currentUser.id, isSuperAdmin]);

  const loadMessages = useCallback(async (otherUserId: string) => {
    setIsLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from('support_messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUser.id},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${currentUser.id})`)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setMessages(data || []);

      // Mark unread messages as read
      const unreadIds = (data || []).filter(m => m.recipient_id === currentUser.id && !m.read_at).map(m => m.id);
      if (unreadIds.length > 0) {
        await supabase
          .from('support_messages')
          .update({ read_at: new Date().toISOString() })
          .in('id', unreadIds);
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [currentUser.id]);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Realtime subscription for new messages
  useEffect(() => {
    const subscription = supabase
      .channel('support_messages_changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_messages'
      }, (payload) => {
        const newMsg = payload.new as SupportMessage;
        if (newMsg.sender_id === currentUser.id || newMsg.recipient_id === currentUser.id) {
          if (selectedUserId && (newMsg.sender_id === selectedUserId || newMsg.recipient_id === selectedUserId)) {
            setMessages(prev => [...prev, newMsg]);
            if (newMsg.recipient_id === currentUser.id && !newMsg.read_at) {
              supabase
                .from('support_messages')
                .update({ read_at: new Date().toISOString() })
                .eq('id', newMsg.id);
            }
          }
          loadConversations();
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [currentUser.id, selectedUserId, loadConversations]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUserId) return;

    try {
      const { error } = await supabase
        .from('support_messages')
        .insert({
          sender_id: currentUser.id,
          recipient_id: selectedUserId,
          body: newMessage.trim(),
          organization_id: userOrgId
        });

      if (error) throw error;
      setNewMessage('');
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to send message');
    }
  };

  const handleStartConversation = async (targetUserId: string) => {
    setSelectedUserId(targetUserId);
    await loadMessages(targetUserId);
  };

  const filteredConversations = conversations.filter(c =>
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedConv = conversations.find(c => c.userId === selectedUserId);

  // For non-owner users, if no conversations exist yet, show a "Start a support conversation" view
  if (!isSuperAdmin && conversations.length === 0 && !selectedUserId) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
        <MessageSquare className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          You haven't started any support conversations yet.
        </p>
        <button
          onClick={() => {
            // Find the owner's profile and start a conversation
            const findOwner = async () => {
              const { data: ownerProfile } = await supabase
                .from('profiles')
                .select('id')
                .eq('role', 'super_admin')
                .maybeSingle();
              if (ownerProfile) {
                handleStartConversation(ownerProfile.id);
              }
            };
            findOwner();
          }}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          <Send className="w-4 h-4" />
          Contact Support
        </button>
        {error && (
          <p className="mt-4 text-sm text-red-500">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[600px]">
      {/* Conversation list */}
      <div className={`${isSuperAdmin ? 'w-72' : 'w-full'} flex flex-col bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 ${!isSuperAdmin && selectedUserId ? 'hidden' : ''}`}>
        {isSuperAdmin && (
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <p className="p-4 text-sm text-gray-500 dark:text-gray-400 text-center">
              No conversations yet
            </p>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredConversations.map((conv) => (
                <button
                  key={conv.userId}
                  onClick={() => handleStartConversation(conv.userId)}
                  className={`w-full text-left p-3 hover:bg-white dark:hover:bg-gray-750 transition-colors ${
                    selectedUserId === conv.userId ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex-shrink-0">
                        {conv.role === 'super_admin' ? (
                          <Crown className="w-3.5 h-3.5 text-amber-500" />
                        ) : conv.role === 'manager' || conv.role === 'owner' ? (
                          <Shield className="w-3.5 h-3.5 text-blue-500" />
                        ) : (
                          <UserIcon className="w-3.5 h-3.5 text-gray-500" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {conv.email}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {conv.lastMessage}
                        </p>
                      </div>
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="flex-shrink-0 ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-blue-500 rounded-full">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Message thread */}
      {isSuperAdmin && selectedUserId && (
        <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/20">
              <UserIcon className="w-4 h-4 text-blue-500" />
            </div>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {selectedConv?.email || 'Unknown'}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {isLoadingMessages ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                No messages yet. Say hello!
              </p>
            ) : (
              messages.map((msg) => {
                const isOwn = msg.sender_id === currentUser.id;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] px-4 py-2 rounded-lg text-sm ${
                        isOwn
                          ? 'bg-blue-600 text-white'
                          : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white'
                      }`}
                    >
                      <p>{msg.body}</p>
                      <p className={`text-xs mt-1 ${isOwn ? 'text-blue-200' : 'text-gray-400'}`}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-200 dark:border-gray-700 flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
            />
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Non-owner: single conversation view */}
      {!isSuperAdmin && selectedUserId && (
        <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
            <button
              onClick={() => setSelectedUserId(null)}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              Support
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {isLoadingMessages ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                Send a message to support and we'll get back to you.
              </p>
            ) : (
              messages.map((msg) => {
                const isOwn = msg.sender_id === currentUser.id;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] px-4 py-2 rounded-lg text-sm ${
                        isOwn
                          ? 'bg-blue-600 text-white'
                          : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white'
                      }`}
                    >
                      <p>{msg.body}</p>
                      <p className={`text-xs mt-1 ${isOwn ? 'text-blue-200' : 'text-gray-400'}`}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-200 dark:border-gray-700 flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
            />
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Organization Tab — adaptive by role
// ============================================================

function OrganizationTab({ currentUser, isSuperAdmin, userOrgRole, userOrgId, onManageMemberSettings }: {
  currentUser: { id: string; email: string; role: string };
  isSuperAdmin: boolean;
  userOrgRole: string | null;
  userOrgId: string | null;
  onManageMemberSettings: (userId: string) => void;
}) {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'manager' | 'member'>('member');
  const [inviteFlags, setInviteFlags] = useState<Record<string, boolean>>({ instagram: false });
  const [isInviting, setIsInviting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Owner: load all orgs
  useEffect(() => {
    if (isSuperAdmin) {
      loadOrgs();
    } else {
      loadOwnOrg();
    }
  }, [isSuperAdmin]);

  const loadOrgs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrgs(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load organizations');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadOwnOrg = useCallback(async () => {
    try {
      if (!userOrgId) {
        setIsLoading(false);
        return;
      }

      const { data: orgData } = await supabase
        .from('organizations')
        .select('id, name, created_at')
        .eq('id', userOrgId)
        .maybeSingle();

      if (orgData) {
        setSelectedOrg(orgData);
        await loadOrgDetails(orgData);
      }
    } catch (err) {
      setError('Failed to load organization');
    } finally {
      setIsLoading(false);
    }
  }, [userOrgId]);

  const loadOrgDetails = useCallback(async (org: Organization) => {
    setSelectedOrg(org);
    setMembers([]);
    setInvitations([]);

    try {
      const { data: memberData } = await supabase
        .from('organization_members')
        .select(`
          id, user_id, role, status, created_at,
          profiles!inner(email, feature_flags)
        `)
        .eq('organization_id', org.id)
        .order('created_at', { ascending: true });

      setMembers((memberData || []).map((m: any) => ({
        id: m.id, user_id: m.user_id, role: m.role, status: m.status,
        created_at: m.created_at, profiles: m.profiles ? { email: m.profiles.email } : null,
        feature_flags: m.profiles?.feature_flags || {}
      })));

      const { data: inviteData } = await supabase
        .from('invitations')
        .select('id, email, role, status, created_at, expires_at, organization_id')
        .eq('organization_id', org.id)
        .order('created_at', { ascending: false });

      setInvitations((inviteData || []).map((i: any) => ({
        id: i.id, email: i.email, role: i.role, status: i.status,
        created_at: i.created_at, expires_at: i.expires_at,
        organization_id: i.organization_id
      })));
    } catch (err) {
      setError('Failed to load organization details');
    }
  }, []);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setIsCreating(true);
    setError('');
    setSuccess('');

    try {
      const { data, error } = await supabase
        .from('organizations')
        .insert({ name: newOrgName.trim(), created_by: currentUser.id })
        .select('id, name, created_at')
        .single();

      if (error) throw error;

      setOrgs(prev => [data, ...prev]);
      setNewOrgName('');
      setShowCreateForm(false);
      setSuccess(`Organization "${data.name}" created successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization');
    } finally {
      setIsCreating(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !selectedOrg) return;
    setIsInviting(true);
    setError('');
    setSuccess('');

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-member`;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: inviteEmail.trim().toLowerCase(),
          role: inviteRole,
          organization_id: selectedOrg.id,
          feature_flags: inviteFlags,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send invitation');
      }

      setSuccess(`Invitation sent to ${inviteEmail.trim()}. ${result.message || ''}`);
      setInviteEmail('');
      setInviteFlags({ instagram: false });
      loadOrgDetails(selectedOrg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setIsInviting(false);
    }
  };

  const handleToggleFeature = async (userId: string, feature: string, enabled: boolean) => {
    setError('');
    setSuccess('');
    try {
      const { error: rpcError } = await supabase.rpc('set_user_feature_flags', {
        p_target_user: userId,
        p_flags: { [feature]: enabled },
      });
      if (rpcError) throw rpcError;

      setMembers(prev => prev.map(m => m.user_id === userId ? {
        ...m,
        feature_flags: { ...(m.feature_flags || {}), [feature]: enabled }
      } : m));
      setSuccess(`${feature === 'instagram' ? 'Instagram' : feature} ${enabled ? 'enabled' : 'disabled'} for this member.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update feature access');
    }
  };

  const handleRemoveMember = async (memberId: string, memberEmail: string) => {
    if (!confirm(`Remove ${memberEmail} from this organization?`)) return;
    setError('');
    setSuccess('');

    try {
      const { error } = await supabase
        .from('organization_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      setSuccess(`${memberEmail} has been removed from the organization.`);
      if (selectedOrg) loadOrgDetails(selectedOrg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const handleRevokeInvite = async (inviteId: string, inviteEmail: string) => {
    if (!confirm(`Revoke invitation for ${inviteEmail}? This will completely delete their account and invalidate their password.`)) return;
    setError('');
    setSuccess('');

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/revoke-invitation`;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ invitation_id: inviteId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to revoke invitation');
      }

      setSuccess(`Invitation for ${inviteEmail} revoked. Account completely deleted.`);
      if (selectedOrg) loadOrgDetails(selectedOrg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke invitation');
    }
  };

  const handleDeleteOrg = async (orgId: string, orgName: string) => {
    if (!confirm(`Delete organization "${orgName}"? This will remove all members and invitations. This cannot be undone.`)) return;
    setError('');
    setSuccess('');

    try {
      const { error } = await supabase
        .from('organizations')
        .delete()
        .eq('id', orgId);

      if (error) throw error;

      setSuccess(`Organization "${orgName}" has been deleted.`);
      setOrgs(prev => prev.filter(o => o.id !== orgId));
      setSelectedOrg(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete organization');
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return Crown;
      case 'manager': return Shield;
      case 'super_admin': return Crown;
      default: return UserIcon;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'owner': return 'text-amber-500 bg-amber-100 dark:bg-amber-900/20';
      case 'manager': return 'text-blue-500 bg-blue-100 dark:bg-blue-900/20';
      case 'super_admin': return 'text-amber-500 bg-amber-100 dark:bg-amber-900/20';
      default: return 'text-gray-500 bg-gray-100 dark:bg-gray-700';
    }
  };

  const canInvite = isSuperAdmin || userOrgRole === 'manager';
  const canInviteManagers = isSuperAdmin;
  const canManageSettings = isSuperAdmin || userOrgRole === 'manager';
  const canDeleteOrg = isSuperAdmin;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Member view: see own org info only
  if (!isSuperAdmin && userOrgRole === 'member') {
    return (
      <div className="space-y-6">
        {selectedOrg && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/20">
                <Building2 className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Your Organization</p>
                <p className="text-lg font-medium text-gray-900 dark:text-white">{selectedOrg.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/20">
                <Shield className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Your Role</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">{userOrgRole}</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-4 text-sm text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700 dark:text-blue-400">
              Need help? Use the Messages tab above to contact support.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Owner and Manager view
  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-4 text-sm text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-4 text-sm text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400 rounded-lg border border-green-200 dark:border-green-800">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <p>{success}</p>
        </div>
      )}

      {isSuperAdmin ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Org list */}
          <div className="lg:col-span-1">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Organizations
              </h2>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500"
              >
                <Plus className="w-3.5 h-3.5" />
                New
              </button>
            </div>

            {showCreateForm && (
              <form onSubmit={handleCreateOrg} className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="Organization name"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none mb-2"
                  required
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50"
                  >
                    {isCreating ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowCreateForm(false); setNewOrgName(''); }}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-1">
              {orgs.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 p-4 text-center">
                  No organizations yet. Create one to get started.
                </p>
              ) : (
                orgs.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => loadOrgDetails(org)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedOrg?.id === org.id
                        ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{org.name}</span>
                      </div>
                      {selectedOrg?.id === org.id && <ChevronRight className="w-4 h-4 text-blue-500" />}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Org details */}
          <div className="lg:col-span-2">
            {!selectedOrg ? (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
                <Users className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Select an organization to manage its members and invitations.
                </p>
              </div>
            ) : (
              <OrgDetails
                org={selectedOrg}
                members={members}
                invitations={invitations}
                canInvite={canInvite}
                canInviteManagers={canInviteManagers}
                canManageSettings={canManageSettings}
                canDeleteOrg={canDeleteOrg}
                inviteEmail={inviteEmail}
                setInviteEmail={setInviteEmail}
                inviteRole={inviteRole}
                setInviteRole={setInviteRole}
                inviteFlags={inviteFlags}
                setInviteFlags={setInviteFlags}
                isInviting={isInviting}
                onInvite={handleInvite}
                onRemoveMember={handleRemoveMember}
                onRevokeInvite={handleRevokeInvite}
                onDeleteOrg={handleDeleteOrg}
                onManageMemberSettings={onManageMemberSettings}
                onToggleFeature={handleToggleFeature}
                getRoleIcon={getRoleIcon}
                getRoleColor={getRoleColor}
              />
            )}
          </div>
        </div>
      ) : (
        // Manager view: single org
        selectedOrg ? (
          <OrgDetails
            org={selectedOrg}
            members={members}
            invitations={invitations}
            canInvite={canInvite}
            canInviteManagers={canInviteManagers}
            canManageSettings={canManageSettings}
            canDeleteOrg={canDeleteOrg}
            inviteEmail={inviteEmail}
            setInviteEmail={setInviteEmail}
            inviteRole={inviteRole}
            setInviteRole={setInviteRole}
            inviteFlags={inviteFlags}
            setInviteFlags={setInviteFlags}
            isInviting={isInviting}
            onInvite={handleInvite}
            onRemoveMember={handleRemoveMember}
            onRevokeInvite={handleRevokeInvite}
            onDeleteOrg={handleDeleteOrg}
            onManageMemberSettings={onManageMemberSettings}
            onToggleFeature={handleToggleFeature}
            getRoleIcon={getRoleIcon}
          getRoleColor={getRoleColor}
          />
        ) : (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
            <Building2 className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              You are not part of an organization yet.
            </p>
          </div>
        )
      )}
    </div>
  );
}

// ============================================================
// Organization Details (shared between owner and manager views)
// ============================================================

function OrgDetails({
  org, members, invitations, canInvite, canInviteManagers, canManageSettings, canDeleteOrg,
  inviteEmail, setInviteEmail, inviteRole, setInviteRole, inviteFlags, setInviteFlags, isInviting,
  onInvite, onRemoveMember, onRevokeInvite, onDeleteOrg, onManageMemberSettings, onToggleFeature,
  getRoleIcon, getRoleColor
}: {
  org: Organization;
  members: OrgMember[];
  invitations: Invitation[];
  canInvite: boolean;
  canInviteManagers: boolean;
  canManageSettings: boolean;
  canDeleteOrg: boolean;
  inviteEmail: string;
  setInviteEmail: (v: string) => void;
  inviteRole: 'manager' | 'member';
  setInviteRole: (v: 'manager' | 'member') => void;
  inviteFlags: Record<string, boolean>;
  setInviteFlags: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  isInviting: boolean;
  onInvite: (e: React.FormEvent) => void;
  onRemoveMember: (memberId: string, memberEmail: string) => void;
  onRevokeInvite: (inviteId: string, inviteEmail: string) => void;
  onDeleteOrg: (orgId: string, orgName: string) => void;
  onManageMemberSettings: (userId: string) => void;
  onToggleFeature: (userId: string, feature: string, enabled: boolean) => void;
  getRoleIcon: (role: string) => typeof Crown;
  getRoleColor: (role: string) => string;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{org.name}</h2>
        {canDeleteOrg && (
          <button
            onClick={() => onDeleteOrg(org.id, org.name)}
            className="text-xs text-red-500 hover:text-red-600 font-medium"
          >
            Delete Organization
          </button>
        )}
      </div>

      {/* Invite form */}
      {canInvite && (
        <form onSubmit={onInvite} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Invite New Member</h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@example.com"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
              required
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'manager' | 'member')}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
            >
              <option value="member">Member</option>
              {canInviteManagers && <option value="manager">Manager</option>}
            </select>
            <button
              type="submit"
              disabled={isInviting}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50"
            >
              {isInviting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
              ) : (
                <><Send className="w-4 h-4" /> Invite</>
              )}
            </button>
          </div>

          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Feature access</p>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={inviteFlags.instagram || false}
                  onChange={(e) => setInviteFlags(prev => ({ ...prev, instagram: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <InstagramIcon className="w-4 h-4 text-pink-500" />
                Instagram
              </label>
            </div>
          </div>
        </form>
      )}

      {/* Members */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
          Members ({members.length})
        </h3>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {members.length === 0 ? (
            <p className="p-6 text-sm text-gray-500 dark:text-gray-400 text-center">No members yet.</p>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {members.map((member) => {
                const RoleIcon = getRoleIcon(member.role);
                const roleColor = getRoleColor(member.role);
                return (
                  <div key={member.id} className="flex items-center justify-between p-4 hover:bg-white dark:hover:bg-gray-750 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${roleColor}`}>
                        <RoleIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {member.profiles?.email || 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                          {member.role} · {member.status}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {canManageSettings && member.role !== 'owner' && (
                        <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer" title="Toggle Instagram access">
                          <input
                            type="checkbox"
                            checked={member.feature_flags?.instagram || false}
                            onChange={(e) => onToggleFeature(member.user_id, 'instagram', e.target.checked)}
                            className="rounded border-gray-300 text-pink-500 focus:ring-pink-400"
                          />
                          <InstagramIcon className="w-4 h-4 text-pink-500" />
                        </label>
                      )}
                      {canManageSettings && (
                        <button
                          onClick={() => onManageMemberSettings(member.user_id)}
                          className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors"
                          title="Manage settings"
                        >
                          <SettingsIcon className="w-4 h-4" />
                        </button>
                      )}
                      {member.role !== 'owner' && (
                        <button
                          onClick={() => onRemoveMember(member.id, member.profiles?.email || 'this member')}
                          className="p-1.5 text-red-400 hover:text-red-500 transition-colors"
                          title="Remove member"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Pending and revoked invitations */}
      {invitations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
            Invitations ({invitations.filter(i => i.status === 'pending').length} pending)
          </h3>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {invitations.map((invite) => (
                <div
                  key={invite.id}
                  className={`flex items-center justify-between p-4 hover:bg-white dark:hover:bg-gray-750 transition-colors ${
                    invite.status === 'revoked' ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/20">
                      <Mail className="w-4 h-4 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{invite.email}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                        {invite.role} · {invite.status}
                      </p>
                    </div>
                  </div>
                  {invite.status === 'pending' && (
                    <button
                      onClick={() => onRevokeInvite(invite.id, invite.email)}
                      className="text-red-400 hover:text-red-500 transition-colors text-xs font-medium"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}