import React, { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, Mail, Trash2, Crown, Shield, User as UserIcon, Loader2, AlertCircle, CheckCircle2, Building2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface TeamMember {
  id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
  profiles: { email: string } | null;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
}

interface TeamPageProps {
  onSignOut: () => void;
  currentView: string;
}

export function TeamPage({ onSignOut: _onSignOut, currentView: _currentView }: TeamPageProps) {
  const [orgName, setOrgName] = useState<string>('');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('id, name')
        .maybeSingle();

      if (orgError) throw orgError;
      if (!orgData) {
        setError('You are not part of an organization yet. Contact your administrator.');
        setIsLoading(false);
        return;
      }

      setOrgName(orgData.name);

      const { data: memberData, error: memberError } = await supabase
        .from('organization_members')
        .select(`
          id,
          user_id,
          role,
          status,
          created_at,
          profiles!inner(email)
        `)
        .eq('organization_id', orgData.id)
        .order('created_at', { ascending: true });

      if (memberError) throw memberError;

      setMembers((memberData || []).map((m: any) => ({
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        status: m.status,
        created_at: m.created_at,
        profiles: m.profiles,
      })));

      const { data: inviteData } = await supabase
        .from('invitations')
        .select('id, email, role, status, created_at, expires_at')
        .eq('organization_id', orgData.id)
        .order('created_at', { ascending: false });

      setInvitations((inviteData || []).map((i: any) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        status: i.status,
        created_at: i.created_at,
        expires_at: i.expires_at,
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return Crown;
      case 'manager': return Shield;
      default: return UserIcon;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'owner': return 'text-amber-500 bg-amber-100 dark:bg-amber-900/20';
      case 'manager': return 'text-blue-500 bg-blue-100 dark:bg-blue-900/20';
      default: return 'text-gray-500 bg-gray-100 dark:bg-gray-700';
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
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/20">
            <Users className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Team</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {orgName && (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  {orgName}
                </span>
              )}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 p-4 text-sm text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
            Members ({members.length})
          </h2>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {members.length === 0 ? (
              <p className="p-6 text-sm text-gray-500 dark:text-gray-400 text-center">
                No members yet.
              </p>
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
                            {member.profiles?.email || 'Unknown email'}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                            {member.role} · {member.status}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {invitations.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
              Pending Invitations ({invitations.filter(i => i.status === 'pending').length})
            </h2>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {invitations.filter(i => i.status === 'pending').map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between p-4 hover:bg-white dark:hover:bg-gray-750 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/20">
                        <Mail className="w-4 h-4 text-yellow-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {invite.email}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                          {invite.role} · Pending
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700 dark:text-blue-400">
              New team members are added by the platform owner. If you need someone added to your team, please contact support.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
