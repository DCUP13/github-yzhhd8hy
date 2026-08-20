import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, ArrowRight, ArrowDown, MessageSquare, Link as LinkIcon,
  FileText, Image as ImageIcon, GitBranch, Clock, Save, X, Copy,
  Play, Pause, ChevronDown, ChevronRight, Zap, Bot, AlertCircle, CheckCircle2,
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
}

export interface FlowStep {
  id: string;
  flow_id: string;
  step_order: number;
  message_text: string | null;
  link_url: string | null;
  media_url: string | null;
  media_type: string | null;
  wait_for_reply: boolean;
  wait_timeout_minutes: number;
  branch_type: 'none' | 'keyword' | 'any_reply';
  branch_conditions: Array<{ keyword: string; next_step_id: string }> | null;
  next_step_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlowSession {
  id: string;
  flow_id: string;
  sender_id: string;
  sender_username: string | null;
  current_step_id: string | null;
  status: 'active' | 'waiting_reply' | 'completed' | 'expired' | 'cancelled';
  window_expires_at: string | null;
  started_at: string;
  last_interacted_at: string | null;
  completed_at: string | null;
}

interface FlowBuilderProps {
  accountId: string;
  userId: string;
}

export function FlowBuilder({ accountId, userId }: FlowBuilderProps) {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [sessions, setSessions] = useState<FlowSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [showStepModal, setShowStepModal] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowTrigger, setNewFlowTrigger] = useState<'comment_keyword' | 'dm_keyword'>('comment_keyword');
  const [newFlowKeyword, setNewFlowKeyword] = useState('');
  const [toast, setToast] = useState<string | null>(null);

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

  const fetchSteps = useCallback(async (flowId: string) => {
    const { data } = await supabase
      .from('instagram_flow_steps')
      .select('*')
      .eq('flow_id', flowId)
      .order('step_order', { ascending: true });
    setSteps((data || []) as FlowStep[]);
  }, []);

  const fetchSessions = useCallback(async (flowId: string) => {
    const { data } = await supabase
      .from('instagram_flow_sessions')
      .select('*')
      .eq('flow_id', flowId)
      .order('started_at', { ascending: false })
      .limit(50);
    setSessions((data || []) as FlowSession[]);
  }, []);

  useEffect(() => {
    fetchFlows();
  }, [fetchFlows]);

  useEffect(() => {
    if (selectedFlowId) {
      fetchSteps(selectedFlowId);
      fetchSessions(selectedFlowId);
    } else {
      setSteps([]);
      setSessions([]);
    }
  }, [selectedFlowId, fetchSteps, fetchSessions]);

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
          user_id: userId,
          account_id: accountId,
          name: newFlowName,
          trigger_type: newFlowTrigger,
          trigger_keyword: newFlowKeyword,
          active: true,
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
  };

  const handleDeleteFlow = async (flowId: string) => {
    if (!confirm('Delete this entire flow? All steps and session data will be removed.')) return;
    await supabase.from('instagram_conversation_flows').delete().eq('id', flowId);
    setSelectedFlowId(null);
    await fetchFlows();
    showToast('Flow deleted');
  };

  const handleDuplicateFlow = async (flow: Flow) => {
    setIsSaving(true);
    try {
      const { data: newFlow } = await supabase
        .from('instagram_conversation_flows')
        .insert({
          user_id: userId,
          account_id: accountId,
          name: `${flow.name} (copy)`,
          trigger_type: flow.trigger_type,
          trigger_keyword: flow.trigger_keyword,
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
              flow_id: newFlow.id,
              user_id: userId,
              step_order: step.step_order,
              message_text: step.message_text,
              link_url: step.link_url,
              media_url: step.media_url,
              media_type: step.media_type,
              wait_for_reply: step.wait_for_reply,
              wait_timeout_minutes: step.wait_timeout_minutes,
              branch_type: step.branch_type,
              branch_conditions: step.branch_conditions,
            })
            .select('id')
            .single();
          if (newStep) stepIdMap.set(step.id, newStep.id);
        }
        // Set first step
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

  const handleAddStep = async () => {
    if (!selectedFlowId) return;
    const nextOrder = steps.length > 0 ? Math.max(...steps.map(s => s.step_order)) + 1 : 0;
    const { data, error } = await supabase
      .from('instagram_flow_steps')
      .insert({
        flow_id: selectedFlowId,
        user_id: userId,
        step_order: nextOrder,
        message_text: '',
        wait_for_reply: false,
        branch_type: 'none',
      })
      .select('*')
      .single();
    if (error) {
      console.error('Error adding step:', error);
      return;
    }
    await fetchSteps(selectedFlowId);
    setEditingStepId(data.id);
    setShowStepModal(true);
  };

  const handleSaveStep = async (stepId: string, updates: Partial<FlowStep>) => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('instagram_flow_steps')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', stepId);
      if (error) throw error;
      await fetchSteps(selectedFlowId!);
      setShowStepModal(false);
      setEditingStepId(null);
      showToast('Step saved');
    } catch (err) {
      console.error('Error saving step:', err);
      alert('Failed to save step');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!confirm('Delete this step?')) return;
    await supabase.from('instagram_flow_steps').delete().eq('id', stepId);
    await fetchSteps(selectedFlowId!);
    showToast('Step deleted');
  };

  const handleSetFirstStep = async (stepId: string) => {
    await supabase
      .from('instagram_conversation_flows')
      .update({ first_step_id: stepId, updated_at: new Date().toISOString() })
      .eq('id', selectedFlowId);
    await fetchFlows();
    showToast('First step set');
  };

  const formatDate = (ds: string) => new Date(ds).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

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
        {/* Info banner */}
        <div className="bg-gradient-to-br from-pink-50 to-amber-50 dark:from-pink-900/20 dark:to-amber-900/20 border border-pink-200 dark:border-pink-800 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <GitBranch className="w-5 h-5 text-pink-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Conversation Flows</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Build automated multi-step DM conversations like ManyChat. When someone comments or DMs a keyword,
                the flow sends a sequence of messages, waits for replies, and branches based on what they say.
              </p>
              <div className="flex items-start gap-2 pt-1">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Instagram's 24-hour rule applies: after the first DM, you can only send follow-up messages
                  within 24 hours of the person's last reply. Steps that "wait for reply" will only proceed
                  if the person responds within that window.
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
                      Edit
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

        {/* Create Flow Modal */}
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

  // ===== Flow editor view =====
  const selectedFlow = flows.find(f => f.id === selectedFlowId);
  if (!selectedFlow) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedFlowId(null)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{selectedFlow.name}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {selectedFlow.trigger_type === 'comment_keyword' ? 'Comment' : 'DM'} trigger: "{selectedFlow.trigger_keyword}"
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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

      {/* Steps list */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Flow Steps</h4>
          <button
            onClick={handleAddStep}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Step
          </button>
        </div>

        {steps.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No steps yet. Add your first step to start building the conversation.</p>
            <button
              onClick={handleAddStep}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add First Step
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {steps.map((step, idx) => (
              <div key={step.id} className="relative">
                {/* Connector arrow */}
                {idx > 0 && (
                  <div className="flex justify-center py-1">
                    <ArrowDown className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                  </div>
                )}
                <StepCard
                  step={step}
                  allSteps={steps}
                  isFirst={idx === 0}
                  isCurrentFirst={selectedFlow.first_step_id === step.id}
                  onEdit={() => { setEditingStepId(step.id); setShowStepModal(true); }}
                  onDelete={() => handleDeleteStep(step.id)}
                  onSetFirst={() => handleSetFirstStep(step.id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

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

      {/* Step Editor Modal */}
      {showStepModal && editingStepId && (
        <StepEditorModal
          step={steps.find(s => s.id === editingStepId) || null}
          allSteps={steps}
          onClose={() => { setShowStepModal(false); setEditingStepId(null); }}
          onSave={(updates) => handleSaveStep(editingStepId, updates)}
          isSaving={isSaving}
        />
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

// ===== Step Card =====
function StepCard({
  step, allSteps, isFirst, isCurrentFirst, onEdit, onDelete, onSetFirst,
}: {
  step: FlowStep;
  allSteps: FlowStep[];
  isFirst: boolean;
  isCurrentFirst: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetFirst: () => void;
}) {
  const nextStep = step.next_step_id ? allSteps.find(s => s.id === step.next_step_id) : null;
  const branches = step.branch_type === 'keyword' && step.branch_conditions
    ? step.branch_conditions
    : [];

  return (
    <div className={`border rounded-lg p-4 ${isCurrentFirst ? 'border-pink-300 dark:border-pink-700 bg-pink-50/50 dark:bg-pink-900/10' : 'border-gray-200 dark:border-gray-700'}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 cursor-pointer" onClick={onEdit}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-gray-400">Step {step.step_order + 1}</span>
            {isCurrentFirst && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300">
                First Step
              </span>
            )}
            {step.wait_for_reply && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                <Clock className="w-3 h-3" /> Waits for reply
              </span>
            )}
            {step.branch_type === 'keyword' && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                <GitBranch className="w-3 h-3" /> Branches
              </span>
            )}
          </div>
          <p className="text-sm text-gray-900 dark:text-white line-clamp-2">
            {step.message_text || <span className="italic text-gray-400">(no message — click to edit)</span>}
          </p>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
            {step.link_url && <span className="flex items-center gap-1"><LinkIcon className="w-3 h-3" /> Link</span>}
            {step.media_url && <span className="flex items-center gap-1">{step.media_type === 'image' ? <ImageIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />} {step.media_type || 'File'}</span>}
            {nextStep && !branches.length && (
              <span className="flex items-center gap-1">
                <ArrowRight className="w-3 h-3" /> → Step {allSteps.findIndex(s => s.id === nextStep.id) + 1 >= 1 ? allSteps.findIndex(s => s.id === nextStep.id) + 1 : '?'}
              </span>
            )}
          </div>
          {branches.length > 0 && (
            <div className="mt-2 space-y-1">
              {branches.map((b, i) => {
                const target = allSteps.find(s => s.id === b.next_step_id);
                return (
                  <div key={i} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium">"{b.keyword}"</span>
                    <ArrowRight className="w-3 h-3" />
                    <span>Step {target ? allSteps.indexOf(target) + 1 : '?'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2">
          {!isCurrentFirst && (
            <button
              onClick={onSetFirst}
              className="p-1 text-gray-300 hover:text-pink-500 rounded-lg hover:bg-pink-50 dark:hover:bg-pink-900/20"
              title="Set as first step"
            >
              <Play className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onEdit}
            className="p-1 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20"
            title="Edit step"
          >
            <span className="text-xs font-medium">Edit</span>
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
            title="Delete step"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Step Editor Modal =====
function StepEditorModal({
  step, allSteps, onClose, onSave, isSaving,
}: {
  step: FlowStep | null;
  allSteps: FlowStep[];
  onClose: () => void;
  onSave: (updates: Partial<FlowStep>) => void;
  isSaving: boolean;
}) {
  const [messageText, setMessageText] = useState(step?.message_text || '');
  const [linkUrl, setLinkUrl] = useState(step?.link_url || '');
  const [mediaUrl, setMediaUrl] = useState(step?.media_url || '');
  const [mediaType, setMediaType] = useState(step?.media_type || '');
  const [waitForReply, setWaitForReply] = useState(step?.wait_for_reply ?? false);
  const [branchType, setBranchType] = useState<'none' | 'keyword' | 'any_reply'>(step?.branch_type || 'none');
  const [branchConditions, setBranchConditions] = useState<Array<{ keyword: string; next_step_id: string }>>(
    step?.branch_conditions || [],
  );
  const [nextStepId, setNextStepId] = useState(step?.next_step_id || '');

  if (!step) return null;

  const otherSteps = allSteps.filter(s => s.id !== step.id);

  const handleSave = () => {
    onSave({
      message_text: messageText || null,
      link_url: linkUrl || null,
      media_url: mediaUrl || null,
      media_type: mediaType || null,
      wait_for_reply: waitForReply,
      branch_type: branchType,
      branch_conditions: branchType === 'keyword' ? branchConditions.filter(b => b.keyword && b.next_step_id) : null,
      next_step_id: nextStepId || null,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Edit Step {step.step_order + 1}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Message text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message Text</label>
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="What message should this step send?"
            />
          </div>

          {/* Link URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Link URL (optional)</label>
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="https://example.com/offer"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">The link will be appended to the message text.</p>
          </div>

          {/* Media attachment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Media URL (optional)</label>
            <div className="flex gap-2">
              <input
                type="url"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="https://example.com/image.jpg"
              />
              <select
                value={mediaType}
                onChange={(e) => setMediaType(e.target.value)}
                className="w-28 px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              >
                <option value="">Type</option>
                <option value="image">Image</option>
                <option value="file">File</option>
                <option value="video">Video</option>
              </select>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">A publicly accessible URL to a file or image.</p>
          </div>

          {/* Wait for reply */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Wait for reply?</label>
              <p className="text-xs text-gray-500 dark:text-gray-400">If on, the flow pauses until the person sends a DM back.</p>
            </div>
            <button
              onClick={() => setWaitForReply(!waitForReply)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${waitForReply ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${waitForReply ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* Branching */}
          {waitForReply && (
            <div className="space-y-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">After reply, how to proceed?</label>
                <select
                  value={branchType}
                  onChange={(e) => setBranchType(e.target.value as 'none' | 'keyword' | 'any_reply')}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="none">Go to next step (no branching)</option>
                  <option value="any_reply">Any reply proceeds to next step</option>
                  <option value="keyword">Branch based on what they say</option>
                </select>
              </div>

              {branchType === 'keyword' && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Add branch conditions. If the person's reply contains a keyword, go to that step.</p>
                  {branchConditions.map((cond, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={cond.keyword}
                        onChange={(e) => {
                          const updated = [...branchConditions];
                          updated[i] = { ...updated[i], keyword: e.target.value };
                          setBranchConditions(updated);
                        }}
                        className="w-28 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        placeholder="keyword"
                      />
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                      <select
                        value={cond.next_step_id}
                        onChange={(e) => {
                          const updated = [...branchConditions];
                          updated[i] = { ...updated[i], next_step_id: e.target.value };
                          setBranchConditions(updated);
                        }}
                        className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      >
                        <option value="">Select step...</option>
                        {otherSteps.map(s => (
                          <option key={s.id} value={s.id}>Step {s.step_order + 1}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => setBranchConditions(branchConditions.filter((_, idx) => idx !== i))}
                        className="p-1 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setBranchConditions([...branchConditions, { keyword: '', next_step_id: '' }])}
                    className="text-xs text-pink-600 dark:text-pink-400 hover:underline"
                  >
                    + Add branch
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Default next step */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Next Step</label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              {waitForReply
                ? 'Where to go if no branch matches (or if branch type is "none"/"any_reply").'
                : 'Where to go after this step sends its message.'}
            </p>
            <select
              value={nextStepId}
              onChange={(e) => setNextStepId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">End of flow (no next step)</option>
              {otherSteps.map(s => (
                <option key={s.id} value={s.id}>Step {s.step_order + 1}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-pink-600 hover:bg-pink-700 disabled:opacity-50"
          >
            {isSaving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save Step</>}
          </button>
        </div>
      </div>
    </div>
  );
}
