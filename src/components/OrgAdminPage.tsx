import React, { useState, useEffect, useCallback } from 'react';
import { Building2, Plus, Users, Trash2, Loader2, AlertCircle, CheckCircle2, Mail, Shield, User as UserIcon, ChevronRight, ChevronDown, Send } from 'lucide-react';
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
  profiles: { email: string } | null;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

interface OrgAdminPageProps {
  onSignOut: () => void;
  currentView: string;
}

export function OrgAdminPage({ onSignOut: _onSignOut, currentView: _currentView }: OrgAdminPageProps) {
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
  const [isInviting, setIsInviting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

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

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  const loadOrgDetails = useCallback(async (org: Organization) => {
    setSelectedOrg(org);
    setMembers([]);
    setInvitations([]);

    try {
      const { data: memberData } = await supabase
        .from('organization_members')
        .select(`
          id, user_id, role, status,
          profiles!inner(email)
        `)
        .eq('organization_id', org.id)
        .order('created_at', { ascending: true });

      setMembers((memberData || []).map((m: any) => ({
        id: m.id, user_id: m.user_id, role: m.role, status: m.status,
        profiles: m.profiles,
      })));

      const { data: inviteData } = await supabase
        .from('invitations')
        .select('id, email, role, status, created_at')
        .eq('organization_id', org.id)
        .order('created_at', { ascending: false });

      setInvitations((inviteData || []).map((i: any) => ({
        id: i.id, email: i.email, role: i.role, status: i.status, created_at: i.created_at,
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load organization details');
    }
  }, []);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setIsCreating(true);
    setError('');
    setSuccess('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('organizations')
        .insert({ name: newOrgName.trim(), created_by: user.id })
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
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send invitation');
      }

      setSuccess(`Invitation sent to ${inviteEmail.trim()}. ${result.message || ''}`);
      setInviteEmail('');
      loadOrgDetails(selectedOrg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setIsInviting(false);
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
    if (!confirm(`Revoke invitation for ${inviteEmail}?`)) return;
    setError('');
    setSuccess('');

    try {
      const { error } = await supabase
        .from('invitations')
        .update({ status: 'revoked' })
        .eq('id', inviteId);

      if (error) throw error;

      setSuccess(`Invitation for ${inviteEmail} has been revoked.`);
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
      case 'owner': return Shield;
      case 'manager': return Shield;
      default: return UserIcon;
    }
  };

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
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/20">
            <Building2 className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Organizations</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Manage organizations, members, and invitations</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 p-4 text-sm text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 flex items-center gap-2 p-4 text-sm text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400 rounded-lg border border-green-200 dark:border-green-800">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <p>{success}</p>
          </div>
        )}

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
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedOrg.name}</h2>
                  <button
                    onClick={() => handleDeleteOrg(selectedOrg.id, selectedOrg.name)}
                    className="text-xs text-red-500 hover:text-red-600 font-medium"
                  >
                    Delete Organization
                  </button>
                </div>

                {/* Invite form */}
                <form onSubmit={handleInvite} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
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
                      <option value="manager">Manager</option>
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
                </form>

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
                          return (
                            <div key={member.id} className="flex items-center justify-between p-4 hover:bg-white dark:hover:bg-gray-750 transition-colors">
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/20">
                                  <RoleIcon className="w-4 h-4 text-blue-500" />
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
                              {member.role !== 'owner' && (
                                <button
                                  onClick={() => handleRemoveMember(member.id, member.profiles?.email || 'this member')}
                                  className="text-red-400 hover:text-red-500 transition-colors"
                                  title="Remove member"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Pending invitations */}
                {invitations.filter(i => i.status === 'pending').length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                      Pending Invitations
                    </h3>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        {invitations.filter(i => i.status === 'pending').map((invite) => (
                          <div key={invite.id} className="flex items-center justify-between p-4 hover:bg-white dark:hover:bg-gray-750 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/20">
                                <Mail className="w-4 h-4 text-yellow-600" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">{invite.email}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{invite.role} · Pending</p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleRevokeInvite(invite.id, invite.email)}
                              className="text-red-400 hover:text-red-500 transition-colors text-xs font-medium"
                            >
                              Revoke
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
