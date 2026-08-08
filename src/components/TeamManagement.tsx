import React, { useState, useEffect } from 'react';
import { Users, Plus, Mail, Trash2, AlertCircle, CheckCircle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { showConfirm } from '../lib/confirm';

interface TeamManagementProps {
  onSignOut: () => void;
}

interface Member {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  email?: string;
  name?: string;
}

interface Invitation {
  id: string;
  email: string;
  role?: string;
  status: string;
  created_at: string;
  expires_at: string;
}

export function TeamManagement({ onSignOut }: TeamManagementProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'manager'>('member');
  const [tempPassword, setTempPassword] = useState('');
  const [inviteType, setInviteType] = useState<'invitation' | 'direct'>('invitation');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  useEffect(() => {
    loadTeamData();
  }, []);

  const loadTeamData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: memberData } = await supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!memberData || !['owner', 'manager'].includes(memberData.role)) {
        setStatus({ type: 'error', message: 'You do not have permission to manage the team.' });
        return;
      }

      setOrganizationId(memberData.organization_id);

      const { data: membersData, error: membersError } = await supabase
        .from('organization_members_with_emails')
        .select('*')
        .eq('organization_id', memberData.organization_id)
        .order('joined_at', { ascending: false });

      if (membersError) throw membersError;

      setMembers(membersData || []);

      const { data: invitationsData, error: invitationsError } = await supabase
        .from('member_invitations')
        .select('*')
        .eq('organization_id', memberData.organization_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (invitationsError) throw invitationsError;
      setInvitations(invitationsData || []);

    } catch (error) {
      console.error('Error loading team data:', error);
      setStatus({ type: 'error', message: 'Failed to load team data' });
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !organizationId) return;
    if (inviteType === 'direct' && !tempPassword) {
      setStatus({ type: 'error', message: 'Please provide a temporary password' });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (inviteType === 'direct') {
        const response = await fetch(`${supabaseUrl}/functions/v1/create-team-member`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: inviteEmail,
            password: tempPassword,
            organization_id: organizationId,
            role: inviteRole
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to create team member');
        }

        setStatus({ type: 'success', message: `Team member created successfully. Email: ${inviteEmail}, Password: ${tempPassword}` });
      } else {
        const response = await fetch(`${supabaseUrl}/functions/v1/invite-team-member`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: inviteEmail,
            organization_id: organizationId,
            invited_by: user.id,
            role: inviteRole
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to send invitation');
        }

        if (result.email_sent === false) {
          const parts = [result.error || 'The invitation was created but the email could not be sent.'];
          if (result.warnings?.length) parts.push(...result.warnings);
          throw new Error(parts.join(' '));
        }

        setStatus({ type: 'success', message: `Invitation sent to ${inviteEmail}` });
      }

      setInviteEmail('');
      setTempPassword('');
      setInviteRole('member');
      setShowInviteDialog(false);
      loadTeamData();

    } catch (error) {
      console.error('Error inviting member:', error);
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to send invitation'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!await showConfirm({ message: 'Are you sure you want to remove this team member?', variant: 'danger', confirmText: 'Remove' })) return;

    try {
      const { error } = await supabase
        .from('organization_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      setStatus({ type: 'success', message: 'Team member removed successfully' });
      loadTeamData();

    } catch (error) {
      console.error('Error removing member:', error);
      setStatus({ type: 'error', message: 'Failed to remove team member' });
    }
  };

  const handleDeleteInvitation = async (invitationId: string) => {
    if (!await showConfirm({ message: 'Are you sure you want to delete this invitation?', variant: 'danger', confirmText: 'Delete' })) return;

    try {
      const { error } = await supabase
        .from('member_invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw error;

      setStatus({ type: 'success', message: 'Invitation deleted successfully' });
      loadTeamData();

    } catch (error) {
      console.error('Error deleting invitation:', error);
      setStatus({ type: 'error', message: 'Failed to delete invitation' });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto p-4 md:p-8">
        <div className="flex items-center justify-between mb-8 gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Users className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 flex-shrink-0" />
            <h1 className="text-lg sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-white truncate">Team Management</h1>
          </div>
          <button
            onClick={() => setShowInviteDialog(true)}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden xs:inline sm:inline">Invite Member</span>
            <span className="xs:hidden sm:hidden">Invite</span>
          </button>
        </div>

        {status && (
          <div className={`flex items-center gap-2 p-4 rounded-lg mb-6 ${
            status.type === 'success'
              ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400'
              : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400'
          }`}>
            {status.type === 'success' ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            <p>{status.message}</p>
          </div>
        )}

        <div className="grid gap-6">
          <div className="app-card rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Team Members</h2>
            <div className="space-y-3">
              {members.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">No team members yet</p>
              ) : (
                members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-start sm:items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-blue-600 dark:text-blue-400 font-semibold text-sm sm:text-base">
                          {member.name?.charAt(0).toUpperCase() || '?'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate">{member.name || 'Unknown'}</p>
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        member.role === 'owner'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-400'
                          : member.role === 'manager'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-300'
                      }`}>
                        {member.role}
                      </span>
                      {member.role !== 'owner' && (
                        <button
                          onClick={() => handleRemoveMember(member.id)}
                          className="p-1.5 sm:p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="app-card rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Pending Invitations</h2>
            <div className="space-y-3">
              {invitations.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">No pending invitations</p>
              ) : (
                invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <Mail className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white break-all text-sm sm:text-base">{invitation.email}</p>
                          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                            Invited {new Date(invitation.created_at).toLocaleDateString()}
                          </p>
                          {invitation.role && (
                            <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              invitation.role === 'manager'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-400'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-300'
                            }`}>
                              {invitation.role}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteInvitation(invitation.id)}
                        className="p-1.5 sm:p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {showInviteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="app-card rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Invite Team Member</h3>
              <button
                onClick={() => setShowInviteDialog(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleInviteMember} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Invite Method
                </label>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setInviteType('invitation')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                      inviteType === 'invitation'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    Send Invitation
                  </button>
                  <button
                    type="button"
                    onClick={() => setInviteType('direct')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                      inviteType === 'direct'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    Create Account
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {inviteType === 'invitation'
                    ? 'Send an email invitation for them to create their own account'
                    : 'Create an account directly with a temporary password'}
                </p>
              </div>
              <div>
                <label htmlFor="invite-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email Address
                </label>
                <input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="member@example.com"
                  required
                />
              </div>
              {inviteType === 'direct' && (
                <div>
                  <label htmlFor="temp-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Temporary Password
                  </label>
                  <input
                    id="temp-password"
                    type="text"
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="Enter temporary password"
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    The user can change this password after logging in
                  </p>
                </div>
              )}
              <div>
                <label htmlFor="invite-role" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Role
                </label>
                <select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'member' | 'manager')}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  required
                >
                  <option value="member">Member</option>
                  <option value="manager">Manager</option>
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Members can only access the member view. Managers can access both views.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowInviteDialog(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (inviteType === 'direct' ? 'Creating...' : 'Sending...') : (inviteType === 'direct' ? 'Create Account' : 'Send Invite')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeamManagement;
