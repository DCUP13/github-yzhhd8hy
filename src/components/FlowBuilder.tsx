import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, ArrowRight, ArrowDown, MessageSquare, Link as LinkIcon,
  FileText, Image as ImageIcon, GitBranch, Clock, Save, X, Copy,
  Play, ChevronUp, ChevronDown, Zap, AlertCircle, CheckCircle2,
  Link2, Link2Off,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export interface Flow {
  id: string;
  user_id: string;
  account_id: string;
  name: string;
  trigger_type: 'comment_keyword' | 'dm_keyword';
  trigger_keyword: string;
  trigger_media_id: string | null;
  active: boolean;
  first_step_id: string | null;
  created_at: string;
  updated_at: string;
  settings_group_id?: string | null;
  is_synced_copy?: boolean;
}

interface LocalStep {
  tempId: string;
  dbId: string | null;
  step_order: number;
  message_text: string;
  link_url: string;
  media_url: string;
  media_type: string;
  wait_for_reply: boolean;
  wait_timeout_minutes: number;
  branch_type: 'none' | 'keyword' | 'any_reply';
  branch_conditions: Array<{ keyword: string; next_step_id: string }>;
  next_step_id: string;
}

export interface FlowSession {
  id: string;
  flow_id: string;
  sender_id: string;
  sender_username: string | null;
  status: 'active' | 'waiting_reply' | 'completed' | 'expired' | 'cancelled';
  window_expires_at: string | null;
  started_at: string;
}

interface IgAccount {
  id: string;
  username: string | null;
  profile_picture_url: string | null;
  user_id: string;
}

interface FlowBuilderProps {
  accountId: string;
  userId: string;
  allAccounts?: IgAccount[];
}

let tempIdCounter = 0;
function makeTempId(): string {
  tempIdCounter += 1;
  return `temp_${Date.now()}_${tempIdCounter}`;
}

function dbStepToLocal(s: any): LocalStep {
  return {
    tempId: s.id,
    dbId: s.id,
    step_order: s.step_order,
    message_text: s.message_text || '',
    link_url: s.link_url || '',
    media_url: s.media_url || '',
    media_type: s.media_type || '',
    wait_for_reply: s.wait_for_reply ?? false,
    wait_timeout_minutes: s.wait_timeout_minutes ?? 1440,
    branch_type: (s.branch_type || 'none') as 'none' | 'keyword' | 'any_reply',
    branch_conditions: Array.isArray(s.branch_conditions) ? s.branch_conditions : [],
    next_step_id: s.next_step_id || '',
  };
}

export function FlowBuilder({ accountId, userId, allAccounts = [] }: FlowBuilderProps) {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null);
  const [localSteps, setLocalSteps] = useState<LocalStep[]>([]);
  const [sessions, setSessions] = useState<FlowSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowTrigger, setNewFlowTrigger] = useState<'comment_keyword' | 'dm_keyword'>('comment_keyword');
  const [newFlowKeyword, setNewFlowKeyword] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [syncStatuses, setSyncStatuses] = useState<Map<string, { shared: boolean; synced: boolean; count: number }>>(new Map());

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchFlows = useCallback(async () => {
    const { data } = await supabase
      .from('instagram_conversation_flows')
      .select('*')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
    setFlows((data || []) as Flow[]);
    setIsLoading(false);
  }, [userId, accountId]);

  useEffect(() => { fetchFlows(); }, [fetchFlows]);

  const loadFlow = useCallback(async (flowId: string) => {
    // Fetch the flow directly from DB — don't rely on the in-memory `flows` array,
    // which may be stale (e.g. right after creating a flow the array hasn't updated yet).
    const { data: flowRow, error: flowErr } = await supabase
      .from('instagram_conversation_flows')
      .select('*')
      .eq('id', flowId)
      .maybeSingle();
    if (flowErr || !flowRow) {
      console.error('Failed to load flow:', flowErr);
      showToast('Could not load this flow');
      setSelectedFlowId(null);
      return;
    }
    setSelectedFlow(flowRow as Flow);
    const { data: dbSteps } = await supabase
      .from('instagram_flow_steps')
      .select('*')
      .eq('flow_id', flowId)
      .order('step_order', { ascending: true });
    setLocalSteps((dbSteps || []).map(dbStepToLocal));
    const { data: sess } = await supabase
      .from('instagram_flow_sessions')
      .select('*')
      .eq('flow_id', flowId)
      .order('started_at', { ascending: false })
      .limit(50);
    setSessions((sess || []) as FlowSession[]);
    setHasUnsavedChanges(false);
  }, []);

  useEffect(() => {
    if (selectedFlowId) {
      loadFlow(selectedFlowId);
    } else {
      setSelectedFlow(null);
      setLocalSteps([]);
      setSessions([]);
      setHasUnsavedChanges(false);
    }
  }, [selectedFlowId, loadFlow]);

  // === Step editing (local only, no DB calls until Save) ===

  const updateStep = (tempId: string, patch: Partial<LocalStep>) => {
    setLocalSteps(prev => prev.map(s => s.tempId === tempId ? { ...s, ...patch } : s));
    setHasUnsavedChanges(true);
  };

  const addStep = () => {
    const nextOrder = localSteps.length > 0 ? Math.max(...localSteps.map(s => s.step_order)) + 1 : 0;
    const newStep: LocalStep = {
      tempId: makeTempId(),
      dbId: null,
      step_order: nextOrder,
      message_text: '',
      link_url: '',
      media_url: '',
      media_type: '',
      wait_for_reply: false,
      wait_timeout_minutes: 1440,
      branch_type: 'none',
      branch_conditions: [],
      next_step_id: '',
    };
    setLocalSteps(prev => [...prev, newStep]);
    setHasUnsavedChanges(true);
  };

  const removeStep = (tempId: string) => {
    setLocalSteps(prev => prev.filter(s => s.tempId !== tempId)
      .map((s, i) => ({ ...s, step_order: i })));
    setHasUnsavedChanges(true);
  };

  const moveStep = (tempId: string, dir: 'up' | 'down') => {
    setLocalSteps(prev => {
      const idx = prev.findIndex(s => s.tempId === tempId);
      if (idx === -1) return prev;
      const newIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      arr.forEach((s, i) => { s.step_order = i; });
      return arr;
    });
    setHasUnsavedChanges(true);
  };

  // === Flow CRUD ===

  // Auto-sync new settings to any accounts that are synced to this account
  const autoSyncToCheckedAccounts = async () => {
    try {
      const { data: subs } = await supabase
        .from('instagram_settings_subscriptions')
        .select('account_id')
        .eq('synced', true)
        .neq('account_id', accountId);

      if (!subs || subs.length === 0) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/share-settings`;
      const { data: session } = await supabase.auth.getSession();
      for (const sub of subs) {
        await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            action: 'sync_account',
            p_source_account_id: accountId,
            p_account_id: sub.account_id,
            p_user_id: user.id,
          }),
        });
      }
    } catch (err) {
      console.error('Auto-sync failed:', err);
    }
  };

  const handleCreateFlow = async () => {
    if (!newFlowName || !newFlowKeyword) {
      alert('Please enter a flow name and trigger keyword');
      return;
    }
    setIsSaving(true);
    try {
      const { data, error } = await supabase
        .from('instagram_conversation_flows')
        .insert({
          user_id: userId, account_id: accountId,
          name: newFlowName, trigger_type: newFlowTrigger,
          trigger_keyword: newFlowKeyword, active: true,
        })
        .select('id')
        .single();
      if (error) throw error;
      setShowCreateModal(false);
      setNewFlowName('');
      setNewFlowKeyword('');
      await fetchFlows();
      setSelectedFlowId(data.id);
      showToast('Flow created');

      // Auto-sync to any accounts that are synced to this account
      await autoSyncToCheckedAccounts();
    } catch (err) {
      console.error('Error creating flow:', err);
      alert('Failed to create flow');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleFlow = async (flow: Flow) => {
    await supabase
      .from('instagram_conversation_flows')
      .update({ active: !flow.active, updated_at: new Date().toISOString() })
      .eq('id', flow.id);
    await fetchFlows();
    if (selectedFlowId === flow.id) {
      setSelectedFlow({ ...flow, active: !flow.active });
    }
  };

  const handleDeleteFlow = async (flowId: string) => {
    const flow = flows.find(f => f.id === flowId);
    const isShared = flow?.settings_group_id;
    const confirmMsg = isShared
      ? 'Delete this flow? It will be removed from ALL synced accounts as well.'
      : 'Delete this entire flow? All steps and session data will be removed.';
    if (!confirm(confirmMsg)) return;

    setIsSaving(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/share-settings`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ action: 'delete_flow', p_flow_id: flowId }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }

      setSelectedFlowId(null);
      await fetchFlows();
      showToast(isShared ? 'Flow deleted from all synced accounts' : 'Flow deleted');
    } catch (err) {
      console.error('Error deleting flow:', err);
      alert('Failed to delete flow');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicateFlow = async (flow: Flow) => {
    setIsSaving(true);
    try {
      const { data: newFlow } = await supabase
        .from('instagram_conversation_flows')
        .insert({
          user_id: userId, account_id: accountId,
          name: `${flow.name} (copy)`,
          trigger_type: flow.trigger_type, trigger_keyword: flow.trigger_keyword,
          active: false,
        })
        .select('id')
        .single();
      if (!newFlow) return;
      const { data: oldSteps } = await supabase
        .from('instagram_flow_steps')
        .select('*')
        .eq('flow_id', flow.id)
        .order('step_order', { ascending: true });
      if (oldSteps && oldSteps.length > 0) {
        const stepIdMap = new Map<string, string>();
        for (const step of oldSteps) {
          const { data: newStep } = await supabase
            .from('instagram_flow_steps')
            .insert({
              flow_id: newFlow.id, user_id: userId,
              step_order: step.step_order,
              message_text: step.message_text, link_url: step.link_url,
              media_url: step.media_url, media_type: step.media_type,
              wait_for_reply: step.wait_for_reply,
              wait_timeout_minutes: step.wait_timeout_minutes,
              branch_type: step.branch_type, branch_conditions: step.branch_conditions,
            })
            .select('id')
            .single();
          if (newStep) stepIdMap.set(step.id, newStep.id);
        }
        if (oldSteps[0] && stepIdMap.has(oldSteps[0].id)) {
          await supabase
            .from('instagram_conversation_flows')
            .update({ first_step_id: stepIdMap.get(oldSteps[0].id) })
            .eq('id', newFlow.id);
        }
      }
      await fetchFlows();
      showToast('Flow duplicated');
    } catch (err) {
      console.error('Error duplicating flow:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // === Save all steps at once ===

  const handleSaveAll = async () => {
    if (!selectedFlow) return;
    setIsSaving(true);
    try {
      // Map temp IDs to real DB IDs as they're created
      const idMap = new Map<string, string>(); // tempId -> dbId

      // First pass: insert new steps (dbId === null) to get real IDs
      for (const step of localSteps) {
        if (step.dbId) {
          idMap.set(step.tempId, step.dbId);
        } else {
          const { data: inserted, error } = await supabase
            .from('instagram_flow_steps')
            .insert({
              flow_id: selectedFlow.id, user_id: userId,
              step_order: step.step_order,
              message_text: step.message_text || null,
              link_url: step.link_url || null,
              media_url: step.media_url || null,
              media_type: step.media_type || null,
              wait_for_reply: step.wait_for_reply,
              wait_timeout_minutes: step.wait_timeout_minutes,
              branch_type: step.branch_type,
              branch_conditions: step.branch_type === 'keyword'
                ? step.branch_conditions.filter(b => b.keyword && b.next_step_id)
                : null,
              next_step_id: null, // set in second pass after all IDs exist
            })
            .select('id')
            .single();
          if (error) { console.error('Insert step error:', error); continue; }
          idMap.set(step.tempId, inserted.id);
        }
      }

      // Second pass: update all steps with next_step_id and branch_conditions (now that all IDs exist)
      for (const step of localSteps) {
        const realId = idMap.get(step.tempId);
        if (!realId) continue;

        const resolvedNext = step.next_step_id ? (idMap.get(step.next_step_id) || step.next_step_id) : null;
        const resolvedBranches = step.branch_type === 'keyword'
          ? step.branch_conditions
              .filter(b => b.keyword && b.next_step_id)
              .map(b => ({
                keyword: b.keyword,
                next_step_id: idMap.get(b.next_step_id) || b.next_step_id,
              }))
          : null;

        const { error } = await supabase
          .from('instagram_flow_steps')
          .update({
            step_order: step.step_order,
            message_text: step.message_text || null,
            link_url: step.link_url || null,
            media_url: step.media_url || null,
            media_type: step.media_type || null,
            wait_for_reply: step.wait_for_reply,
            wait_timeout_minutes: step.wait_timeout_minutes,
            branch_type: step.branch_type,
            branch_conditions: resolvedBranches,
            next_step_id: resolvedNext,
            updated_at: new Date().toISOString(),
          })
          .eq('id', realId);
        if (error) console.error('Update step error:', error);
      }

      // Set first_step_id to the first step (by order) and verify it was saved
      if (localSteps.length > 0) {
        const firstStep = [...localSteps].sort((a, b) => a.step_order - b.step_order)[0];
        const firstRealId = idMap.get(firstStep.tempId);
        if (firstRealId) {
          const { error: fsError } = await supabase
            .from('instagram_conversation_flows')
            .update({ first_step_id: firstRealId, updated_at: new Date().toISOString() })
            .eq('id', selectedFlow.id);
          if (fsError) {
            console.error('Failed to set first_step_id:', fsError);
            // Retry once — the FK constraint may have been missing in older schemas
            const { error: retryError } = await supabase
              .from('instagram_conversation_flows')
              .update({ first_step_id: firstRealId, updated_at: new Date().toISOString() })
              .eq('id', selectedFlow.id);
            if (retryError) console.error('Retry also failed for first_step_id:', retryError);
          }
        }
      } else {
        await supabase
          .from('instagram_conversation_flows')
          .update({ first_step_id: null, updated_at: new Date().toISOString() })
          .eq('id', selectedFlow.id);
      }

      // Delete steps that were removed (in DB but no longer in local list)
      const currentDbIds = new Set([...idMap.values()]);
      for (const oldStep of localSteps) {
        // Already handled
      }
      // Fetch all DB steps for this flow and delete any not in currentDbIds
      const { data: allDbSteps } = await supabase
        .from('instagram_flow_steps')
        .select('id')
        .eq('flow_id', selectedFlow.id);
      if (allDbSteps) {
        for (const s of allDbSteps) {
          if (!currentDbIds.has(s.id)) {
            await supabase.from('instagram_flow_steps').delete().eq('id', s.id);
          }
        }
      }

      // Sync to other accounts if this flow is part of a synced group
      if (selectedFlow.is_synced_copy && selectedFlow.settings_group_id) {
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/share-settings`;
        const { data: session } = await supabase.auth.getSession();
        await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ action: 'sync_flow', p_flow_id: selectedFlow.id }),
        });
      }

      // Reload from DB
      await loadFlow(selectedFlow.id);
      await fetchFlows();
      showToast('Flow saved');
    } catch (err) {
      console.error('Error saving flow:', err);
      alert('Failed to save flow');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackToList = () => {
    if (hasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Leave without saving?')) return;
    }
    setSelectedFlowId(null);
  };

  const formatDate = (ds: string) => new Date(ds).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const fetchSyncStatuses = useCallback(async () => {
    if (flows.length === 0) return;
    const groupIds = flows.filter(f => f.settings_group_id).map(f => f.settings_group_id);
    if (groupIds.length === 0) return;
    const { data: subs } = await supabase
      .from('instagram_settings_subscriptions')
      .select('group_id, account_id, synced')
      .in('group_id', groupIds);
    const map = new Map<string, { shared: boolean; synced: boolean; count: number }>();
    for (const f of flows) {
      if (!f.settings_group_id) { map.set(f.id, { shared: false, synced: false, count: 0 }); continue; }
      const flowSubs = (subs || []).filter(s => s.group_id === f.settings_group_id);
      const syncedCount = flowSubs.filter(s => s.synced).length;
      const isSynced = f.is_synced_copy ?? false;
      map.set(f.id, { shared: flowSubs.length > 1, synced: isSynced, count: flowSubs.length });
    }
    setSyncStatuses(map);
  }, [flows]);

  useEffect(() => { fetchSyncStatuses(); }, [fetchSyncStatuses]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ===== Flow list view =====
  if (!selectedFlowId) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-br from-pink-50 to-amber-50 dark:from-pink-900/20 dark:to-amber-900/20 border border-pink-200 dark:border-pink-800 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <GitBranch className="w-5 h-5 text-pink-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Conversation Flows</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Build automated multi-step DM conversations like ManyChat. When someone comments or DMs a keyword,
                the flow sends a sequence of messages, waits for replies, and branches based on what they say.
                The entire flow is built in one screen — add steps, write messages, and connect them all at once.
              </p>
              <div className="flex items-start gap-2 pt-1">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Instagram's 24-hour rule applies: after the first DM, follow-up messages can only be sent
                  within 24 hours of the person's last reply.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-pink-600 hover:bg-pink-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Flow
          </button>
        </div>

        {flows.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
            <div className="text-center py-12">
              <GitBranch className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No conversation flows yet</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">Create a flow to automate multi-step DM conversations triggered by comments or messages.</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create your first flow
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {flows.map((flow) => (
                <div key={flow.id} className="p-4 flex items-start justify-between">
                  <div className="flex-1 cursor-pointer" onClick={() => setSelectedFlowId(flow.id)}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{flow.name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${flow.active ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                        {flow.active ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        {flow.trigger_type === 'comment_keyword' ? <MessageSquare className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                        {flow.trigger_type === 'comment_keyword' ? 'Comment' : 'DM'} keyword: <span className="font-medium text-gray-700 dark:text-gray-300">"{flow.trigger_keyword}"</span>
                      </span>
                      <span>Created {formatDate(flow.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleToggleFlow(flow)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${flow.active ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                      title={flow.active ? 'Pause flow' : 'Activate flow'}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${flow.active ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                    {(() => {
                      const status = syncStatuses.get(flow.id);
                      return status && status.shared ? (
                        <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${status.synced ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>
                          {status.synced ? <Link2 className="w-2.5 h-2.5" /> : <Link2Off className="w-2.5 h-2.5" />}
                          {status.synced ? `Synced (${status.count})` : `Independent (${status.count})`}
                        </span>
                      ) : null;
                    })()}
                    <button
                      onClick={() => handleDuplicateFlow(flow)}
                      className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      title="Duplicate flow"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setSelectedFlowId(flow.id)}
                      className="px-3 py-1.5 text-xs font-medium text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-900/20 rounded-lg"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => handleDeleteFlow(flow.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                      title="Delete flow"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">New Conversation Flow</h3>
                <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-500">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Flow Name</label>
                  <input
                    type="text"
                    value={newFlowName}
                    onChange={(e) => setNewFlowName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="e.g., Pricing Inquiry Flow"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Trigger Type</label>
                  <select
                    value={newFlowTrigger}
                    onChange={(e) => setNewFlowTrigger(e.target.value as 'comment_keyword' | 'dm_keyword')}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="comment_keyword">When someone comments a keyword</option>
                    <option value="dm_keyword">When someone sends a DM with a keyword</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Trigger Keyword</label>
                  <input
                    type="text"
                    value={newFlowKeyword}
                    onChange={(e) => setNewFlowKeyword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="e.g., price, info, demo"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">The flow starts when this word appears in a comment or DM.</p>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
                <button
                  onClick={handleCreateFlow}
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-medium rounded-lg text-white bg-pink-600 hover:bg-pink-700 disabled:opacity-50"
                >
                  {isSaving ? 'Creating...' : 'Create Flow'}
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div className="fixed bottom-6 right-6 z-50 bg-gray-900 dark:bg-gray-700 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-sm">{toast}</span>
          </div>
        )}
      </div>
    );
  }

  // ===== Single-screen flow editor =====
  if (!selectedFlow) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl shadow-sm px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackToList}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <X className="w-4 h-4" /> Back
          </button>
          <div className="h-4 w-px bg-gray-200 dark:bg-gray-600" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{selectedFlow.name}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {selectedFlow.trigger_type === 'comment_keyword' ? 'Comment' : 'DM'} trigger: "{selectedFlow.trigger_keyword}"
            </p>
          </div>
          {hasUnsavedChanges && (
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Unsaved changes</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedFlow.is_synced_copy && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
              <Link2 className="w-2.5 h-2.5" /> Synced — edits propagate
            </span>
          )}
          {selectedFlow.settings_group_id && !selectedFlow.is_synced_copy && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              <Link2Off className="w-2.5 h-2.5" /> Independent — edits are local
            </span>
          )}
          <button
            onClick={() => handleToggleFlow(selectedFlow)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${selectedFlow.active ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
            title={selectedFlow.active ? 'Pause flow' : 'Activate flow'}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${selectedFlow.active ? 'translate-x-5' : 'translate-x-1'}`} />
          </button>
          <button
            onClick={() => handleDeleteFlow(selectedFlow.id)}
            className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
            title="Delete flow"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Flow steps — all visible and editable inline */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        {localSteps.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No steps yet. Add your first step to start building the conversation.</p>
            <button
              onClick={addStep}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add First Step
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {localSteps.map((step, idx) => (
              <div key={step.tempId}>
                {idx > 0 && (
                  <div className="flex justify-center py-1">
                    <ArrowDown className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                  </div>
                )}
                <InlineStepEditor
                  step={step}
                  stepIndex={idx}
                  totalSteps={localSteps.length}
                  allSteps={localSteps}
                  isFirst={idx === 0}
                  onChange={(patch) => updateStep(step.tempId, patch)}
                  onRemove={() => removeStep(step.tempId)}
                  onMoveUp={() => moveStep(step.tempId, 'up')}
                  onMoveDown={() => moveStep(step.tempId, 'down')}
                />
              </div>
            ))}

            {/* Add step button at the bottom */}
            <div className="flex justify-center pt-2">
              <button
                onClick={addStep}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-pink-600 dark:text-pink-400 border border-pink-300 dark:border-pink-700 rounded-lg hover:bg-pink-50 dark:hover:bg-pink-900/20"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Step
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Save bar */}
      {localSteps.length > 0 && (
        <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl shadow-sm px-4 py-3 sticky bottom-4 z-10 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {localSteps.length} step{localSteps.length !== 1 ? 's' : ''} in this flow
            {hasUnsavedChanges && <span className="text-amber-600 dark:text-amber-400 ml-2">— unsaved changes</span>}
          </p>
          <button
            onClick={handleSaveAll}
            disabled={isSaving || !hasUnsavedChanges}
            className="inline-flex items-center px-5 py-2 text-sm font-medium rounded-lg text-white bg-pink-600 hover:bg-pink-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSaving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save Flow</>}
          </button>
        </div>
      )}

      {/* Active sessions */}
      {sessions.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Active Conversations ({sessions.length})</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">People currently in this flow</p>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-64 overflow-y-auto">
            {sessions.map((s) => (
              <div key={s.id} className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {s.sender_username || `User ${s.sender_id.slice(-8)}`}
                  </p>
                  <p className="text-xs text-gray-400">Started {formatDate(s.started_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    s.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                    s.status === 'waiting_reply' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                    s.status === 'completed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                    s.status === 'expired' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                    'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                  }`}>
                    {s.status.replace('_', ' ')}
                  </span>
                  {s.window_expires_at && (s.status === 'active' || s.status === 'waiting_reply') && (
                    <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                      <Clock className="w-3 h-3" />
                      {new Date(s.window_expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 dark:bg-gray-700 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          <span className="text-sm">{toast}</span>
        </div>
      )}
    </div>
  );
}

// ===== Inline Step Editor (all fields visible in the card) =====
function InlineStepEditor({
  step, stepIndex, totalSteps, allSteps, isFirst,
  onChange, onRemove, onMoveUp, onMoveDown,
}: {
  step: LocalStep;
  stepIndex: number;
  totalSteps: number;
  allSteps: LocalStep[];
  isFirst: boolean;
  onChange: (patch: Partial<LocalStep>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const otherSteps = allSteps.filter(s => s.tempId !== step.tempId);

  return (
    <div className={`border rounded-lg p-4 ${isFirst ? 'border-pink-300 dark:border-pink-700 bg-pink-50/30 dark:bg-pink-900/5' : 'border-gray-200 dark:border-gray-700'}`}>
      {/* Step header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 text-xs font-semibold">
            {stepIndex + 1}
          </span>
          {isFirst && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300">
              <Play className="w-2.5 h-2.5" /> First Step
            </span>
          )}
          {step.wait_for_reply && (
            <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              <Clock className="w-3 h-3" /> Waits for reply
            </span>
          )}
          {step.branch_type === 'keyword' && (
            <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              <GitBranch className="w-3 h-3" /> Branches
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onMoveUp}
            disabled={stepIndex === 0}
            className="p-1 text-gray-300 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 rounded"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={stepIndex === totalSteps - 1}
            className="p-1 text-gray-300 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 rounded"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            onClick={onRemove}
            className="p-1 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
            title="Delete step"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Message text */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Message Text</label>
        <textarea
          value={step.message_text}
          onChange={(e) => onChange({ message_text: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          placeholder="What message should this step send as a DM?"
        />
      </div>

      {/* Link + Media in a row */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            <span className="flex items-center gap-1"><LinkIcon className="w-3 h-3" /> Link URL</span>
          </label>
          <input
            type="url"
            value={step.link_url}
            onChange={(e) => onChange({ link_url: e.target.value })}
            className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            placeholder="https://..."
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> Media URL</span>
          </label>
          <div className="flex gap-1">
            <input
              type="url"
              value={step.media_url}
              onChange={(e) => onChange({ media_url: e.target.value })}
              className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="https://..."
            />
            <select
              value={step.media_type}
              onChange={(e) => onChange({ media_type: e.target.value })}
              className="w-20 px-1 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">-</option>
              <option value="image">Img</option>
              <option value="file">File</option>
              <option value="video">Vid</option>
            </select>
          </div>
        </div>
      </div>

      {/* Wait for reply toggle */}
      <div className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg mb-3">
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Wait for reply?</label>
          <p className="text-xs text-gray-500 dark:text-gray-400">If on, the flow pauses until the person sends a DM back.</p>
        </div>
        <button
          onClick={() => onChange({ wait_for_reply: !step.wait_for_reply })}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${step.wait_for_reply ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${step.wait_for_reply ? 'translate-x-5' : 'translate-x-1'}`} />
        </button>
      </div>

      {/* Branching — only shown when wait_for_reply is on */}
      {step.wait_for_reply && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg space-y-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">After reply, how to proceed?</label>
            <select
              value={step.branch_type}
              onChange={(e) => onChange({ branch_type: e.target.value as 'none' | 'keyword' | 'any_reply' })}
              className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="none">Go to next step automatically</option>
              <option value="any_reply">Any reply proceeds to next step</option>
              <option value="keyword">Branch based on what they say</option>
            </select>
          </div>

          {step.branch_type === 'keyword' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">If their reply contains a keyword, go to that step:</p>
              {step.branch_conditions.map((cond, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={cond.keyword}
                    onChange={(e) => {
                      const updated = [...step.branch_conditions];
                      updated[i] = { ...updated[i], keyword: e.target.value };
                      onChange({ branch_conditions: updated });
                    }}
                    className="w-24 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    placeholder="keyword"
                  />
                  <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <select
                    value={cond.next_step_id}
                    onChange={(e) => {
                      const updated = [...step.branch_conditions];
                      updated[i] = { ...updated[i], next_step_id: e.target.value };
                      onChange({ branch_conditions: updated });
                    }}
                    className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="">Select step...</option>
                    {otherSteps.map((s, si) => (
                      <option key={s.tempId} value={s.tempId}>Step {allSteps.indexOf(s) + 1}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => onChange({ branch_conditions: step.branch_conditions.filter((_, idx) => idx !== i) })}
                    className="p-1 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => onChange({ branch_conditions: [...step.branch_conditions, { keyword: '', next_step_id: '' }] })}
                className="text-xs text-pink-600 dark:text-pink-400 hover:underline"
              >
                + Add branch
              </button>
            </div>
          )}
        </div>
      )}

      {/* Next step selector — always visible */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {step.wait_for_reply ? 'Default next:' : 'Then go to:'}
        </label>
        <select
          value={step.next_step_id}
          onChange={(e) => onChange({ next_step_id: e.target.value })}
          className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          <option value="">End of flow</option>
          {otherSteps.map((s) => (
            <option key={s.tempId} value={s.tempId}>Step {allSteps.indexOf(s) + 1}</option>
          ))}
        </select>
      </div>
    </div>
  );
}