import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  MessageSquare, Send, Loader2, Search, Crown, Shield, User as UserIcon,
  X, AlertCircle, Headphones
} from 'lucide-react';
import { supabase } from '../lib/supabase';

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

interface SupportPageProps {
  onSignOut: () => void;
  currentView: string;
  isSuperAdmin: boolean;
}

export function SupportPage({ onSignOut: _onSignOut, currentView: _currentView, isSuperAdmin }: SupportPageProps) {
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; role: string } | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [isInitializing, setIsInitializing] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      } catch (err) {
        console.error('Error loading user:', err);
      } finally {
        setIsInitializing(false);
      }
    };
    initUser();
  }, []);

  const loadConversations = useCallback(async () => {
    if (!currentUser) return;
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
  }, [currentUser, isSuperAdmin]);

  const loadMessages = useCallback(async (otherUserId: string) => {
    if (!currentUser) return;
    setIsLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from('support_messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUser.id},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${currentUser.id})`)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setMessages(data || []);

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
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) loadConversations();
  }, [currentUser, loadConversations]);

  useEffect(() => {
    if (!currentUser) return;
    const subscription = supabase
      .channel('support_page_messages')
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
  }, [currentUser, selectedUserId, loadConversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUserId || !currentUser) return;

    try {
      const { data: orgMember } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', currentUser.id)
        .eq('status', 'active')
        .maybeSingle();

      const { error } = await supabase
        .from('support_messages')
        .insert({
          sender_id: currentUser.id,
          recipient_id: selectedUserId,
          body: newMessage.trim(),
          organization_id: orgMember?.organization_id || null
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

  const handleContactSupport = async () => {
    try {
      const { data: ownerProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'super_admin')
        .maybeSingle();
      if (ownerProfile) {
        handleStartConversation(ownerProfile.id);
      }
    } catch (err) {
      console.error('Error finding owner:', err);
    }
  };

  if (isInitializing) {
    return (
      <div className="p-8 bg-white dark:bg-gray-900 min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!currentUser) return null;

  const filteredConversations = conversations.filter(c =>
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedConv = conversations.find(c => c.userId === selectedUserId);

  return (
    <div className="p-8 bg-white dark:bg-gray-900 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/20">
            <Headphones className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {isSuperAdmin ? 'Support Admin' : 'Support'}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isSuperAdmin
                ? 'Manage support conversations with all users'
                : 'Get help from the platform owner'}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 p-4 text-sm text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

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
                <div className="p-6 text-center">
                  <MessageSquare className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    {isSuperAdmin ? 'No conversations yet' : 'No support conversations yet'}
                  </p>
                  {!isSuperAdmin && (
                    <button
                      onClick={handleContactSupport}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                    >
                      <Send className="w-4 h-4" />
                      Contact Support
                    </button>
                  )}
                </div>
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
          {selectedUserId && (
            <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                {!isSuperAdmin && (
                  <button
                    onClick={() => setSelectedUserId(null)}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/20">
                  <UserIcon className="w-4 h-4 text-blue-500" />
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {isSuperAdmin ? (selectedConv?.email || 'Unknown') : 'Support'}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {isLoadingMessages ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                    {isSuperAdmin ? 'No messages yet. Say hello!' : 'Send a message to support and we\'ll get back to you.'}
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
      </div>
    </div>
  );
}
