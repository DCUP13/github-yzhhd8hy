import React, { useState, useEffect, useRef } from 'react';
import type { OrgInfo } from '../contexts/OrganizationContext';
import {
  Users, Send, Search, ChevronLeft, MessageSquare,
  Plus, Trash2, Mail, Building2, Globe, MapPin, Briefcase,
  UserPlus, CheckCircle, AlertCircle, X, Settings, Clock, MessageCircle,
  ChevronDown, RefreshCw, ArrowUpDown,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { showConfirm } from '../lib/confirm';
import MemberDetailDialog from './MemberDetailDialog';
import OrganizationSettings from './OrganizationSettings';
import { useOrganization } from '../contexts/OrganizationContext';

// ── Shared helpers ───────────────────────────────────────────────────

interface TeamMember { user_id: string; email: string; name: string; role: string; conversationId?: string; lastMessageAt?: string | null; lastReadAt?: string | null; clearedAt?: string | null; otherLastReadAt?: string | null; }
interface TeamMessage { id: string; conversation_id: string; sender_id: string; body: string; created_at: string; }
interface OrgMember { id: string; user_id: string; email: string; name: string; role: string; joined_at: string; }
interface Invitation { id: string; email: string; role?: string; status: string; created_at: string; expires_at: string; }
interface OrgDetails { id: string; name: string; description: string; logo_url: string; industry: string; company_size: string; website: string; location: string; }

const AVATAR_COLORS = ['from-blue-500 to-blue-700','from-emerald-500 to-emerald-700','from-violet-500 to-violet-700','from-orange-500 to-orange-700','from-rose-500 to-rose-700','from-teal-500 to-teal-700'];
function avatarGradient(id: string) { const n = id.charCodeAt(0) + id.charCodeAt(id.length - 1); return AVATAR_COLORS[n % AVATAR_COLORS.length]; }
function roleStyle(role: string) { return role === 'owner' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : role === 'manager' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'; }
function relTime(iso: string) { const d = Date.now() - new Date(iso).getTime(), m = Math.floor(d/60000), h = Math.floor(d/3600000), dy = Math.floor(d/86400000); if (m<1) return 'now'; if (m<60) return `${m}m`; if (h<24) return `${h}h`; if (dy<7) return `${dy}d`; return new Date(iso).toLocaleDateString(); }
function initials(name: string, email: string) { return (name || email).charAt(0).toUpperCase(); }
function sortChatMembers(list: TeamMember[]): TeamMember[] { return [...list].sort((a,b) => { if (a.lastMessageAt && b.lastMessageAt) return new Date(b.lastMessageAt).getTime()-new Date(a.lastMessageAt).getTime(); if (a.lastMessageAt) return -1; if (b.lastMessageAt) return 1; return (a.name||a.email).localeCompare(b.name||b.email); }); }
function computeHasUnread(lastMessageAt: string | null, lastReadAt: string | null, clearedAt: string | null): boolean {
  if (!lastMessageAt) return false;
  const since = lastReadAt && clearedAt ? (lastReadAt > clearedAt ? lastReadAt : clearedAt) : (lastReadAt || clearedAt);
  return since ? lastMessageAt > since : true;
}

// ── Main export ──────────────────────────────────────────────────────

interface TeamViewProps { onSignOut: () => void; }

export function TeamView({ onSignOut }: TeamViewProps) {
  const [tab, setTab] = useState<'chat' | 'organization'>('chat');
  const [pendingChatId, setPendingChatId] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const switcherRef = useRef<HTMLDivElement>(null);

  const { orgs, selectedOrg, selectedOrgId, showSwitcher, setShowSwitcher, switchOrg, showCreateOrg, setShowCreateOrg, handleOrgCreated, handleOrgDeleted, loading } = useOrganization();

  const orgId = selectedOrgId;
  const currentRole = selectedOrg?.role ?? 'member';
  const orgName = selectedOrg?.name ?? '';
  const isOwner = orgs.some(o => o.role === 'owner');

  useEffect(() => { setMemberCount(0); }, [selectedOrgId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);

  useEffect(() => {
    if (!showSwitcher) return;
    function handle(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setShowSwitcher(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showSwitcher, setShowSwitcher]);

  function handleStartChat(memberId: string) {
    setPendingChatId(memberId);
    setTab('chat');
  }

  function handleSwitchOrg(id: string) {
    switchOrg(id);
    setTab('chat');
    setPendingChatId(null);
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (orgs.length === 0) return (
    <div className="flex items-center justify-center py-24 px-4">
      <div className="text-center">
        <Building2 className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">You are not part of any organization yet.</p>
        {currentUserId && (
          <>
            <button
              onClick={() => setShowCreateOrg(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Organization
            </button>
            {showCreateOrg && (
              <CreateOrgModal userId={currentUserId} onClose={() => setShowCreateOrg(false)} onCreated={handleOrgCreated} />
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col app-bg overflow-hidden h-[calc(100dvh-48px)] md:h-screen">
      {/* Header */}
      <div className="px-4 md:px-8 pt-4 md:pt-5 border-b border-gray-200 dark:border-gray-700 app-card flex-shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex-shrink-0">
            <Users className="w-5 h-5 md:w-6 md:h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="relative" ref={switcherRef}>
              <button
                onClick={() => setShowSwitcher(!showSwitcher)}
                className="flex items-center gap-1.5 text-xl md:text-2xl font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors max-w-full"
              >
                <span className="truncate max-w-[200px] md:max-w-xs">{orgName}</span>
                <ChevronDown className={`w-5 h-5 flex-shrink-0 transition-transform duration-200 ${showSwitcher ? 'rotate-180' : ''}`} />
              </button>
              {showSwitcher && (
                <div className="absolute left-0 top-full mt-2 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                  <div className="py-1">
                    {orgs.map(org => (
                      <button
                        key={org.id}
                        onClick={() => handleSwitchOrg(org.id)}
                        className={`w-full text-left px-4 py-3 transition-colors flex items-center gap-3 ${org.id === selectedOrgId ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${org.id === selectedOrgId ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-gray-100 dark:bg-gray-700'}`}>
                          <Building2 className={`w-4 h-4 ${org.id === selectedOrgId ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${org.id === selectedOrgId ? 'text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-200'}`}>{org.name}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 capitalize mt-0.5">{org.role}</p>
                        </div>
                        {org.id === selectedOrgId && <CheckCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                  {isOwner && (
                    <>
                      <div className="border-t border-gray-200 dark:border-gray-700" />
                      <button
                        onClick={() => { setShowSwitcher(false); setShowCreateOrg(true); }}
                        className="w-full text-left px-4 py-3 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-3 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-lg border-2 border-dashed border-blue-300 dark:border-blue-700 flex items-center justify-center flex-shrink-0">
                          <Plus className="w-4 h-4" />
                        </div>
                        <span className="font-medium">New Organization</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-0.5">{memberCount} member{memberCount !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0">
          {([
            { key: 'chat', label: 'Chat' },
            { key: 'organization', label: 'Organization' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {orgId && currentUserId ? (
        tab === 'chat' ? (
          <ChatTab key={orgId} orgId={orgId} currentUserId={currentUserId} initialSelectedId={pendingChatId} onInitialSelectedConsumed={() => setPendingChatId(null)} />
        ) : (
          <OrgTab key={orgId} orgId={orgId} currentUserId={currentUserId} currentRole={currentRole} onMemberCountChange={setMemberCount} onStartChat={handleStartChat} onOrgDeleted={handleOrgDeleted} />
        )
      ) : null}

      {showCreateOrg && currentUserId && (
        <CreateOrgModal userId={currentUserId} onClose={() => setShowCreateOrg(false)} onCreated={handleOrgCreated} />
      )}
    </div>
  );
}

// ── Chat tab ─────────────────────────────────────────────────────────

interface ChatTabProps {
  orgId: string;
  currentUserId: string;
  initialSelectedId: string | null;
  onInitialSelectedConsumed: () => void;
}

function ChatTab({ orgId, currentUserId, initialSelectedId, onInitialSelectedConsumed }: ChatTabProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messageCutoff, setMessageCutoff] = useState<string | null>(null);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ memberId: string; convId: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const msgChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const convChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  useEffect(() => { conversationIdRef.current = conversationId; }, [conversationId]);

  useEffect(() => {
    loadChatData();
    return () => {
      if (convChannelRef.current) supabase.removeChannel(convChannelRef.current);
      if (msgChannelRef.current) supabase.removeChannel(msgChannelRef.current);
    };
  }, []);

  useEffect(() => {
    if (!loading && initialSelectedId) {
      setSelectedId(initialSelectedId);
      onInitialSelectedConsumed();
    }
  }, [loading, initialSelectedId]);

  useEffect(() => {
    setConversationId(null);
    setMessages([]);
    setMessageCutoff(null);
    if (msgChannelRef.current) { supabase.removeChannel(msgChannelRef.current); msgChannelRef.current = null; }
    if (selectedId) openConversation(selectedId);
  }, [selectedId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Mark conversation as read whenever a new message from the other person arrives while viewing it
  useEffect(() => {
    if (!conversationId || !selectedId || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.sender_id === currentUserId) return;
    markRead(conversationId, selectedId);
  }, [messages.length, conversationId]);

  async function markRead(convId: string, memberId: string) {
    const now = new Date().toISOString();
    setMembers(prev => prev.map(m => m.user_id === memberId ? { ...m, lastReadAt: now } : m));
    await supabase.rpc('mark_conversation_read', { conv_id: convId });
  }

  async function loadChatData() {
    setLoading(true);
    const [{ data: memberRows }, { data: convRows }] = await Promise.all([
      supabase.from('organization_members_with_emails').select('user_id, email, name, role').eq('organization_id', orgId).neq('user_id', currentUserId),
      supabase.from('team_conversations')
        .select('id, participant_1, participant_2, last_message_at, hidden_for_p1, hidden_for_p2, last_read_at_p1, last_read_at_p2, cleared_at_p1, cleared_at_p2')
        .or(`participant_1.eq.${currentUserId},participant_2.eq.${currentUserId}`),
    ]);

    const activeConvs = (convRows ?? []).filter(c =>
      c.participant_1 === currentUserId ? !c.hidden_for_p1 : !c.hidden_for_p2
    );

    const enriched: TeamMember[] = (memberRows ?? []).map(m => {
      const c = activeConvs.find(c => c.participant_1 === m.user_id || c.participant_2 === m.user_id);
      if (!c) return { ...m };
      const isP1 = c.participant_1 === currentUserId;
      return {
        ...m,
        conversationId: c.id,
        lastMessageAt: c.last_message_at,
        lastReadAt: isP1 ? c.last_read_at_p1 : c.last_read_at_p2,
        clearedAt: isP1 ? c.cleared_at_p1 : c.cleared_at_p2,
        otherLastReadAt: isP1 ? c.last_read_at_p2 : c.last_read_at_p1,
      };
    });
    setMembers(sortChatMembers(enriched));
    setLoading(false);
    subscribeConvUpdates();
  }

  function subscribeConvUpdates() {
    if (convChannelRef.current) supabase.removeChannel(convChannelRef.current);
    convChannelRef.current = supabase.channel('chat-conv-list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_conversations' }, (p) => {
        const c = p.new as { id: string; participant_1: string; participant_2: string; last_message_at: string };
        const other = c.participant_1 === currentUserId ? c.participant_2 : c.participant_1;
        setMembers(prev => sortChatMembers(prev.map(m =>
          m.user_id === other ? { ...m, conversationId: c.id, lastMessageAt: c.last_message_at, lastReadAt: null } : m
        )));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'team_conversations' }, (p) => {
        const c = p.new as {
          id: string; participant_1: string; participant_2: string; last_message_at: string;
          hidden_for_p1: boolean; hidden_for_p2: boolean;
          last_read_at_p1: string | null; last_read_at_p2: string | null;
          cleared_at_p1: string | null; cleared_at_p2: string | null;
        };
        const isP1 = c.participant_1 === currentUserId;
        const myHidden = isP1 ? c.hidden_for_p1 : c.hidden_for_p2;
        const myLastRead = isP1 ? c.last_read_at_p1 : c.last_read_at_p2;
        const myCleared = isP1 ? c.cleared_at_p1 : c.cleared_at_p2;
        const otherLastRead = isP1 ? c.last_read_at_p2 : c.last_read_at_p1;
        const other = isP1 ? c.participant_2 : c.participant_1;

        setMembers(prev => sortChatMembers(prev.map(m => {
          if (m.user_id !== other) return m;
          if (myHidden) return { ...m, conversationId: undefined, lastMessageAt: undefined, lastReadAt: undefined, clearedAt: undefined, otherLastReadAt: undefined };
          return { ...m, conversationId: c.id, lastMessageAt: c.last_message_at, lastReadAt: myLastRead, clearedAt: myCleared, otherLastReadAt: otherLastRead };
        })));

        if (myHidden && conversationIdRef.current === c.id) {
          setSelectedId(null);
          setConversationId(null);
          setMessages([]);
          setMessageCutoff(null);
        }
      })
      .subscribe();
  }

  async function openConversation(memberId: string) {
    const [p1, p2] = [currentUserId, memberId].sort();
    const { data: conv } = await supabase.from('team_conversations')
      .select('id, participant_1, cleared_at_p1, cleared_at_p2, last_read_at_p1, last_read_at_p2, hidden_for_p1, hidden_for_p2')
      .eq('participant_1', p1).eq('participant_2', p2).maybeSingle();

    if (!conv) return;

    const isP1 = conv.participant_1 === currentUserId;
    if (isP1 ? conv.hidden_for_p1 : conv.hidden_for_p2) return;

    const cutoff = isP1 ? conv.cleared_at_p1 : conv.cleared_at_p2;
    const otherLastReadAt = isP1 ? conv.last_read_at_p2 : conv.last_read_at_p1;
    setConversationId(conv.id);
    setMessageCutoff(cutoff ?? null);

    const now = new Date().toISOString();
    setMembers(prev => prev.map(m => m.user_id === memberId ? { ...m, lastReadAt: now, otherLastReadAt } : m));
    await supabase.rpc('mark_conversation_read', { conv_id: conv.id });

    let query = supabase.from('team_messages').select('*').eq('conversation_id', conv.id).order('created_at', { ascending: true });
    if (cutoff) query = query.gt('created_at', cutoff);
    const { data } = await query;
    setMessages(data ?? []);
    subscribeMessages(conv.id, memberId, cutoff ?? null);
  }

  function subscribeMessages(convId: string, memberId: string, cutoff: string | null) {
    if (msgChannelRef.current) supabase.removeChannel(msgChannelRef.current);
    msgChannelRef.current = supabase.channel(`chat-msgs-${convId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_messages', filter: `conversation_id=eq.${convId}` }, (p) => {
        const msg = p.new as TeamMessage;
        if (cutoff && msg.created_at <= cutoff) return;
        setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
        if (msg.sender_id !== currentUserId) {
          markRead(convId, memberId);
        }
      }).subscribe();
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !selectedId) return;
    setSending(true);
    try {
      let convId = conversationId;
      if (!convId) {
        const [p1, p2] = [currentUserId, selectedId].sort();
        const { data: existing } = await supabase.from('team_conversations')
          .select('id').eq('participant_1', p1).eq('participant_2', p2).maybeSingle();
        if (existing) {
          convId = existing.id;
        } else {
          const { data: nc, error } = await supabase.from('team_conversations')
            .insert({ organization_id: orgId, participant_1: p1, participant_2: p2 })
            .select('id').single();
          if (error) throw error;
          convId = nc.id;
        }
        setConversationId(convId);
        subscribeMessages(convId, selectedId, null);
      }

      const { data: msg, error: me } = await supabase.from('team_messages')
        .insert({ conversation_id: convId, sender_id: currentUserId, body }).select().single();
      if (me) throw me;

      setMessages(prev => [...prev, msg]);
      setText('');

      const now = new Date().toISOString();
      const isP1 = currentUserId < selectedId;
      const readField = isP1 ? { last_read_at_p1: now } : { last_read_at_p2: now };
      await supabase.from('team_conversations').update({
        last_message_at: now,
        hidden_for_p1: false,
        hidden_for_p2: false,
        ...readField,
      }).eq('id', convId);

      setMembers(prev => sortChatMembers(prev.map(m =>
        m.user_id === selectedId ? { ...m, conversationId: convId!, lastMessageAt: now, lastReadAt: now } : m
      )));
    } catch (err) { console.error(err); } finally { setSending(false); }
  }

  async function handleDeleteConversation(memberId: string, convId: string) {
    setDeleteTarget({ memberId, convId });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { memberId, convId } = deleteTarget;
    setDeleteTarget(null);
    const isP1 = currentUserId < memberId;
    const clearFields = isP1
      ? { hidden_for_p1: true, cleared_at_p1: new Date().toISOString() }
      : { hidden_for_p2: true, cleared_at_p2: new Date().toISOString() };

    await supabase.from('team_conversations').update(clearFields).eq('id', convId);

    setMembers(prev => sortChatMembers(prev.map(m =>
      m.user_id === memberId ? { ...m, conversationId: undefined, lastMessageAt: undefined, lastReadAt: undefined, clearedAt: undefined } : m
    )));

    if (selectedId === memberId) {
      setSelectedId(null);
      setConversationId(null);
      setMessages([]);
      setMessageCutoff(null);
    }
  }

  const selected = members.find(m => m.user_id === selectedId);
  const q = search.toLowerCase().trim();
  const filtered = members.filter(m => {
    if (q) return m.email.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
    return !!m.conversationId;
  });

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-1 overflow-hidden min-h-0">
      {/* Delete conversation confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Delete conversation?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">This will be removed from your chat list. Previous messages won't be visible if you start chatting again.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors">Cancel</button>
              <button onClick={confirmDelete} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
      {/* Left: chat list */}
      <div className={`flex flex-col flex-shrink-0 border-r border-gray-200 dark:border-gray-700 md:w-72 ${selectedId ? 'hidden md:flex' : 'flex w-full'}`}>
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 app-card flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people..." style={{ fontSize: 16 }}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {filtered.length === 0 && (
            <div className="text-center py-12 px-4 text-gray-400 dark:text-gray-500">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">{q ? 'No results.' : 'No conversations yet.'}</p>
              {!q && <p className="text-xs mt-1">Search for a team member to start chatting.</p>}
            </div>
          )}
          {filtered.map(m => {
            const isOpen = selectedId === m.user_id;
            const hasUnread = !isOpen && computeHasUnread(m.lastMessageAt ?? null, m.lastReadAt ?? null, m.clearedAt ?? null);
            return (
            <div key={m.user_id} className={`relative group border-b border-gray-100 dark:border-gray-800 ${isOpen ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-600' : ''}`}>
              <button onClick={() => setSelectedId(m.user_id)}
                className="w-full text-left px-4 py-3.5 pr-12 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <div className="flex items-center gap-3">
                  <div className="relative flex-shrink-0">
                    <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(m.user_id)} flex items-center justify-center text-white text-sm font-bold`}>{initials(m.name, m.email)}</div>
                    {hasUnread && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-blue-600 border-2 border-white dark:border-gray-900" />}</div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${hasUnread ? 'font-semibold text-gray-900 dark:text-white' : 'font-medium text-gray-900 dark:text-white'}`}>{m.name || m.email}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${roleStyle(m.role)}`}>{m.role}</span>
                      {m.lastMessageAt && <span className={`text-xs ${hasUnread ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>{relTime(m.lastMessageAt)}</span>}
                    </div>
                  </div>
                </div>
              </button>
              {m.conversationId && (
                <button
                  onClick={() => handleDeleteConversation(m.user_id, m.conversationId!)}
                  title="Delete conversation"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            );
          })}
        </div>
      </div>

      {/* Right: chat panel */}
      <div className={`flex flex-col flex-1 min-w-0 min-h-0 ${selectedId ? 'flex' : 'hidden md:flex'}`}>
        {selected ? (
          <>
            <div className="px-4 md:px-6 py-3 border-b border-gray-200 dark:border-gray-700 app-card flex items-center gap-3 flex-shrink-0">
              <button onClick={() => setSelectedId(null)} className="md:hidden flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 py-1 pr-2 flex-shrink-0">
                <ChevronLeft className="w-4 h-4" />Back
              </button>
              <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(selected.user_id)} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>{initials(selected.name, selected.email)}</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white truncate">{selected.name || selected.email}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{selected.email}</p>
              </div>
              <span className={`flex-shrink-0 text-xs px-2 py-1 rounded-full font-medium ${roleStyle(selected.role)}`}>{selected.role}</span>
              {conversationId && (
                <button onClick={() => handleDeleteConversation(selected.user_id, conversationId)} title="Delete conversation"
                  className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 px-4 md:px-6 py-4 space-y-3">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 py-16">
                  <MessageSquare className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm font-medium">No messages yet</p>
                  <p className="text-xs mt-1">Say hello to {selected.name || selected.email}</p>
                </div>
              )}
              {messages.map((msg, idx) => {
                const isMe = msg.sender_id === currentUserId;
                const otherRead = selected.otherLastReadAt;
                const isLastReadByOther = isMe && otherRead && msg.created_at <= otherRead &&
                  !messages.slice(idx + 1).some(m => m.sender_id === currentUserId && m.created_at <= otherRead);
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'} w-full`}>
                      {!isMe && <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${avatarGradient(selected.user_id)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mb-0.5`}>{initials(selected.name, selected.email)}</div>}
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${isMe ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-bl-sm'}`}>
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                        <p className={`text-xs mt-1 ${isMe ? 'text-blue-200' : 'text-gray-400 dark:text-gray-500'}`}>{new Date(msg.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</p>
                      </div>
                    </div>
                    {isLastReadByOther && (
                      <div className="flex items-center gap-1 mt-0.5 mr-0.5">
                        <div className={`w-4 h-4 rounded-full bg-gradient-to-br ${avatarGradient(selected.user_id)} flex items-center justify-center text-white flex-shrink-0`} style={{fontSize: '8px', fontWeight: 700}}>{initials(selected.name, selected.email)}</div>
                        <span className="text-xs text-gray-400 dark:text-gray-500">Read</span>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            <div className="px-4 md:px-6 py-3 md:py-4 border-t border-gray-200 dark:border-gray-700 app-card flex-shrink-0">
              <form onSubmit={handleSend} className="flex gap-2">
                <input value={text} onChange={e => setText(e.target.value)} placeholder={`Message ${selected.name || selected.email}...`} style={{ fontSize: 16 }} autoComplete="off" disabled={sending}
                  className="flex-1 px-3 md:px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white" />
                <button type="submit" disabled={sending || !text.trim()} className="px-3 md:px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"><Send className="w-4 h-4" /></button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Select a conversation</p>
              <p className="text-xs mt-1">or search to start a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Organization tab ──────────────────────────────────────────────────

interface OrgTabProps {
  orgId: string;
  currentUserId: string;
  currentRole: string;
  onMemberCountChange: (n: number) => void;
  onStartChat: (memberId: string) => void;
  onOrgDeleted: () => void;
}

function OrgTab({ orgId, currentUserId, currentRole, onMemberCountChange, onStartChat, onOrgDeleted }: OrgTabProps) {
  const [orgDetails, setOrgDetails] = useState<OrgDetails | null>(null);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<OrgMember | null>(null);
  const [showOrgSettings, setShowOrgSettings] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isManager = currentRole === 'owner' || currentRole === 'manager';

  useEffect(() => { loadOrgData(); }, []);

  async function loadOrgData() {
    setLoading(true);
    const [{ data: org }, { data: members }, { data: invs }] = await Promise.all([
      supabase.from('organizations').select('id, name, description, logo_url, industry, company_size, website, location').eq('id', orgId).maybeSingle(),
      supabase.from('organization_members_with_emails').select('id, user_id, email, name, role, joined_at').eq('organization_id', orgId).order('joined_at', { ascending: false }),
      isManager ? supabase.from('member_invitations').select('*').eq('organization_id', orgId).eq('status', 'pending').order('created_at', { ascending: false }) : { data: [] },
    ]);
    if (org) setOrgDetails(org);
    setOrgMembers(members ?? []);
    setInvitations(invs ?? []);
    onMemberCountChange((members ?? []).length);
    setLoading(false);
  }

  async function handleRemoveMember(memberId: string) {
    if (!await showConfirm({ message: 'Remove this team member?', variant: 'danger', confirmText: 'Remove' })) return;
    const { error } = await supabase.from('organization_members').delete().eq('id', memberId);
    if (error) { setStatus({ type: 'error', message: 'Failed to remove member' }); return; }
    setStatus({ type: 'success', message: 'Member removed' });
    loadOrgData();
    setTimeout(() => setStatus(null), 3000);
  }

  async function handleDeleteInvitation(invId: string) {
    if (!await showConfirm({ message: 'Revoke this invitation?', variant: 'danger', confirmText: 'Revoke' })) return;
    await supabase.from('member_invitations').delete().eq('id', invId);
    setInvitations(prev => prev.filter(i => i.id !== invId));
  }

  async function handleDeleteOrg() {
    if (!orgDetails) return;
    const confirmed = await showConfirm({ message: `Delete "${orgDetails.name}"?\n\nThis will permanently remove the organization, all its members, and all chat history. This cannot be undone.`, variant: 'danger', confirmText: 'Delete' });
    if (!confirmed) return;
    const { error } = await supabase.from('organizations').delete().eq('id', orgId);
    if (error) {
      setStatus({ type: 'error', message: 'Failed to delete organization: ' + error.message });
      return;
    }
    onOrgDeleted();
  }

  async function handleResendInvitation(inv: Invitation) {
    if (!await showConfirm({ message: `Resend invitation to ${inv.email}?`, confirmText: 'Resend' })) return;
    await supabase.from('member_invitations').delete().eq('id', inv.id);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const res = await fetch(`${supabaseUrl}/functions/v1/invite-team-member`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inv.email, organization_id: orgId, invited_by: currentUserId, role: inv.role || 'member' }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus({ type: 'error', message: data.error || 'Failed to resend invitation' });
      return;
    }
    setStatus({ type: 'success', message: `Invitation resent to ${inv.email}` });
    loadOrgData();
    setTimeout(() => setStatus(null), 4000);
  }

  async function handleChangeRole(memberId: string, newRole: 'member' | 'manager') {
    setOrgMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));

    const { error } = await supabase.rpc('change_member_role', {
      p_member_id: memberId,
      p_new_role: newRole,
    });

    if (error) {
      loadOrgData();
      setStatus({ type: 'error', message: error.message || 'Failed to change role' });
      return;
    }
    setStatus({ type: 'success', message: `Role changed to ${newRole}` });
    setTimeout(() => setStatus(null), 3000);
  }

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 space-y-8">

        {status && (
          <div className={`p-3 rounded-lg flex items-center gap-2 text-sm ${status.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'}`}>
            {status.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            {status.message}
            <button onClick={() => setStatus(null)} className="ml-auto p-0.5 hover:opacity-70"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {orgDetails && (
          <div className="app-card rounded-xl border border-gray-200 dark:border-gray-700 p-5 md:p-6">
            <div className="flex items-start gap-4">
              {orgDetails.logo_url ? (
                <img src={orgDetails.logo_url} alt="Logo" className="w-16 h-16 rounded-xl object-cover flex-shrink-0 border border-gray-200 dark:border-gray-700" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">{orgDetails.name}</h2>
                  {isManager && (
                    <button onClick={() => setShowOrgSettings(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex-shrink-0">
                      <Settings className="w-3.5 h-3.5" />Edit
                    </button>
                  )}
                </div>
                {orgDetails.description && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{orgDetails.description}</p>}
                <div className="flex flex-wrap gap-2 mt-3">
                  {orgDetails.industry && <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full"><Briefcase className="w-3 h-3" />{orgDetails.industry}</span>}
                  {orgDetails.company_size && <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full"><Users className="w-3 h-3" />{orgDetails.company_size}</span>}
                  {orgDetails.location && <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full"><MapPin className="w-3 h-3" />{orgDetails.location}</span>}
                  {orgDetails.website && <a href={orgDetails.website.startsWith('http') ? orgDetails.website : `https://${orgDetails.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-full hover:underline"><Globe className="w-3 h-3" />{orgDetails.website}</a>}
                </div>
              </div>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Members <span className="text-sm font-normal text-gray-400 dark:text-gray-500 ml-1">({orgMembers.length})</span></h3>
            {isManager && (
              <button onClick={() => setShowInviteModal(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors">
                <UserPlus className="w-4 h-4" /><span className="hidden sm:inline">Add Member</span>
              </button>
            )}
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {orgMembers.map(m => {
              const isCurrentUser = m.user_id === currentUserId;
              const isOwner = m.role === 'owner';
              return (
                <div key={m.user_id} className="app-card rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm transition-all">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarGradient(m.user_id)} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>{initials(m.name, m.email)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{m.name || m.email}</p>
                        {isCurrentUser && <span className="text-xs text-gray-400 dark:text-gray-500">(you)</span>}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{m.email}</p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${roleStyle(m.role)}`}>{m.role}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-0.5"><Clock className="w-3 h-3" />{new Date(m.joined_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    {!isCurrentUser && (
                      <button onClick={() => onStartChat(m.user_id)} title="Start chat"
                        className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                        <MessageCircle className="w-4 h-4" />
                      </button>
                    )}
                    {isManager && (
                      <button onClick={() => setSelectedMember(m)} className="flex-1 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                        View Details
                      </button>
                    )}
                    {currentRole === 'owner' && !isCurrentUser && !isOwner && (
                      <button
                        onClick={() => handleChangeRole(m.id, m.role === 'manager' ? 'member' : 'manager')}
                        className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        title={m.role === 'manager' ? 'Demote to member' : 'Promote to manager'}
                      >
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {isManager && !isCurrentUser && !isOwner && (currentRole === 'owner' || m.role === 'member') && (
                      <button onClick={() => handleRemoveMember(m.id)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Remove member">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {isManager && invitations.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Pending Invitations <span className="text-sm font-normal text-gray-400 dark:text-gray-500">({invitations.length})</span></h3>
            <div className="space-y-2">
              {invitations.map(inv => (
                <div key={inv.id} className="app-card rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{inv.email}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {inv.role && <span className={`inline-block mr-2 px-1.5 py-0.5 rounded-full text-xs font-medium ${roleStyle(inv.role)}`}>{inv.role}</span>}
                      Expires {new Date(inv.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="flex-shrink-0 text-xs px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full font-medium">Pending</span>
                  <button onClick={() => handleResendInvitation(inv)} className="flex-shrink-0 p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Resend invitation">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDeleteInvitation(inv.id)} className="flex-shrink-0 p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Revoke">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentRole === 'owner' && (
          <div className="border border-red-200 dark:border-red-900/50 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-900/50">
              <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">Danger Zone</h3>
            </div>
            <div className="px-5 py-4 app-card flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Delete this organization</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Permanently removes all members, invitations, and chat history. Cannot be undone.</p>
              </div>
              <button
                onClick={handleDeleteOrg}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete Organization
              </button>
            </div>
          </div>
        )}

      </div>

      {selectedMember && (
        <MemberDetailDialog memberId={selectedMember.user_id} memberName={selectedMember.name} memberEmail={selectedMember.email} organizationId={orgId ?? undefined} onClose={() => setSelectedMember(null)} />
      )}
      {showOrgSettings && <OrganizationSettings orgId={orgId} onClose={() => { setShowOrgSettings(false); loadOrgData(); }} />}
      {showInviteModal && (
        <InviteModal orgId={orgId} currentUserId={currentUserId} currentRole={currentRole} onClose={() => setShowInviteModal(false)}
          onSuccess={() => {
            loadOrgData();
            setStatus({ type: 'success', message: 'Invitation sent successfully' });
            setTimeout(() => setStatus(null), 4000);
          }} />
      )}
    </div>
  );
}

// ── Invite modal ──────────────────────────────────────────────────────

interface InviteModalProps { orgId: string; currentUserId: string; currentRole: string; onClose: () => void; onSuccess: () => void; }

function InviteModal({ orgId, currentUserId, currentRole, onClose, onSuccess }: InviteModalProps) {
  const [inviteType, setInviteType] = useState<'invitation' | 'direct'>('invitation');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'manager'>('member');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    if (inviteType === 'direct' && !password.trim()) { setError('Please enter a temporary password'); return; }
    setLoading(true); setError(''); setSuccessMsg('');
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (inviteType === 'direct') {
        const res = await fetch(`${supabaseUrl}/functions/v1/create-team-member`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password: password.trim(), organization_id: orgId, role }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create account');
        setSuccessMsg(`Account created — email: ${email}, password: ${password}`);
      } else {
        const res = await fetch(`${supabaseUrl}/functions/v1/invite-team-member`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), organization_id: orgId, invited_by: currentUserId, role }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to send invitation');
        setSuccessMsg(`Invitation sent to ${email}`);
      }
      setEmail(''); setPassword(''); setRole('member');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="app-card rounded-xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Add Member</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><X className="w-4 h-4 text-gray-500 dark:text-gray-400" /></button>
        </div>
        <div className="px-6 pt-4">
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg mb-4">
            {(['invitation', 'direct'] as const).map(val => (
              <button key={val} onClick={() => setInviteType(val)} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${inviteType === val ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                {val === 'invitation' ? 'Send Invitation' : 'Create Account'}
              </button>
            ))}
          </div>
          {successMsg ? (
            <div className="py-4 text-center">
              <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-gray-700 dark:text-gray-300">{successMsg}</p>
              <button onClick={onClose} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">Done</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 pb-4">
              {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-lg text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email <span className="text-red-500">*</span></label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@example.com" style={{ fontSize: 16 }} required disabled={loading}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white" />
              </div>
              {inviteType === 'direct' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Temporary Password <span className="text-red-500">*</span></label>
                  <input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="Temporary password" style={{ fontSize: 16 }} disabled={loading}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                <div className="flex gap-2">
                  {(['member', ...(currentRole === 'owner' ? ['manager'] : [])] as const).map(r => (
                    <button key={r} type="button" onClick={() => setRole(r as 'member' | 'manager')} className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors capitalize ${role === r ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>{r}</button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                  {role === 'manager' ? 'Managers can add members and view all org emails.' : 'Members can message and view the organization.'}
                </p>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose} disabled={loading} className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors">Cancel</button>
                <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition-colors flex items-center justify-center gap-2">
                  {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <>{inviteType === 'direct' ? <Plus className="w-4 h-4" /> : <Mail className="w-4 h-4" />}{inviteType === 'direct' ? 'Create Account' : 'Send Invitation'}</>}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Create organization modal ────────────────────────────────────────

interface CreateOrgModalProps {
  userId: string;
  onClose: () => void;
  onCreated: (org: OrgInfo) => void;
}

function CreateOrgModal({ userId, onClose, onCreated }: CreateOrgModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setLoading(true);
    setError('');
    try {
      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .insert({ name: trimmedName, description: description.trim() || null, owner_id: userId })
        .select('id, name')
        .single();
      if (orgErr) throw orgErr;

      const { error: memberErr } = await supabase
        .from('organization_members')
        .insert({ organization_id: org.id, user_id: userId, role: 'owner', status: 'active' });
      if (memberErr) throw memberErr;

      onCreated({ id: org.id, name: org.name, role: 'owner' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="app-card rounded-xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Create Organization</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-lg text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Organization Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Acme Corp, North Team, or John Smith"
              style={{ fontSize: 16 }}
              required
              autoFocus
              disabled={loading}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Use any name — a company, a team, or a single client's name for one-off clients.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description"
              style={{ fontSize: 16 }}
              disabled={loading}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Create Organization
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
