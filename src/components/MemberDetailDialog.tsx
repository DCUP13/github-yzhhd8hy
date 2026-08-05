import React, { useState, useEffect } from 'react';
import { X, Mail, Clock, Crown, Shield, User as UserIcon, Instagram as InstagramIcon, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';

interface MemberDetailDialogProps {
  memberId: string;
  memberName: string;
  memberEmail: string;
  organizationId?: string;
  onClose: () => void;
}

export function MemberDetailDialog({ memberId, memberName, memberEmail, organizationId, onClose }: MemberDetailDialogProps) {
  const [memberRole, setMemberRole] = useState<string>('member');
  const [joinedAt, setJoinedAt] = useState<string>('');
  const [instagramEnabled, setInstagramEnabled] = useState(false);
  const [linkedinEnabled, setLinkedinEnabled] = useState(false);
  const [igConnected, setIgConnected] = useState(false);
  const [igUsername, setIgUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    loadMemberData();
  }, [memberId]);

  async function loadMemberData() {
    setLoading(true);
    try {
      const { data: member } = await supabase
        .from('organization_members_with_emails')
        .select('role, joined_at')
        .eq('user_id', memberId)
        .eq('organization_id', organizationId || '')
        .maybeSingle();

      if (member) {
        setMemberRole(member.role);
        setJoinedAt(member.joined_at);
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('feature_flags')
        .eq('id', memberId)
        .maybeSingle();

      if (profile?.feature_flags) {
        const flags = profile.feature_flags as Record<string, boolean>;
        setInstagramEnabled(!!flags.instagram);
        setLinkedinEnabled(!!flags.linkedin);
      }

      const { data: ig } = await supabase
        .from('instagram_accounts')
        .select('username, connected')
        .eq('user_id', memberId)
        .maybeSingle();

      if (ig) {
        setIgConnected(ig.connected);
        setIgUsername(ig.username);
      }
    } catch (err) {
      console.error('Error loading member data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function toggleFeature(feature: 'instagram' | 'linkedin', enabled: boolean) {
    setToggling(feature);
    try {
      const { error } = await supabase.rpc('set_user_feature_flags', {
        p_target_user: memberId,
        p_flags: { [feature]: enabled },
      });
      if (error) throw error;
      if (feature === 'instagram') setInstagramEnabled(enabled);
      if (feature === 'linkedin') setLinkedinEnabled(enabled);
      toast.success(`${feature === 'instagram' ? 'Instagram' : 'LinkedIn'} ${enabled ? 'enabled' : 'disabled'} for ${memberName || memberEmail}`);
    } catch (err) {
      console.error('Error toggling feature:', err);
      toast.error('Failed to update feature access');
    } finally {
      setToggling(null);
    }
  }

  const RoleIcon = memberRole === 'owner' ? Crown : memberRole === 'manager' ? Shield : UserIcon;
  const roleColor = memberRole === 'owner' ? 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/20' : memberRole === 'manager' ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/20' : 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${roleColor}`}>
              <RoleIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{memberName || memberEmail}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">{memberRole}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Email</span>
                  <span className="text-gray-900 dark:text-white font-medium">{memberEmail}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Role</span>
                  <span className="text-gray-900 dark:text-white font-medium capitalize">{memberRole}</span>
                </div>
                {joinedAt && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Joined</span>
                    <span className="text-gray-900 dark:text-white font-medium">{new Date(joinedAt).toLocaleDateString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Instagram connected</span>
                  <span className={`font-medium ${igConnected ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                    {igConnected ? `@${igUsername || 'yes'}` : 'No'}
                  </span>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Integration Access</h4>
                <div className="space-y-3">
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-pink-100 dark:bg-pink-900/20">
                          <InstagramIcon className="w-4 h-4 text-pink-500" />
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-900 dark:text-white">Instagram</h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {igConnected ? `Connected as @${igUsername || 'unknown'}` : 'Not connected'}
                          </p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={instagramEnabled}
                          onChange={(e) => toggleFeature('instagram', e.target.checked)}
                          disabled={toggling === 'instagram'}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-500"></div>
                      </label>
                    </div>
                  </div>

                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/20">
                          <UserIcon className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-900 dark:text-white">LinkedIn</h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Feature toggle</p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={linkedinEnabled}
                          onChange={(e) => toggleFeature('linkedin', e.target.checked)}
                          disabled={toggling === 'linkedin'}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default MemberDetailDialog;
