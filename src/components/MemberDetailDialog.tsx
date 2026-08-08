import React, { useState, useEffect } from 'react';
import { X, Mail, Globe, Settings as SettingsIcon, BarChart3, Server, Plus, Trash2, Send, Crown, Shield, User as UserIcon, Clock, KeyRound, Instagram as InstagramIcon, Bell, Moon, Lock, Bug, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { Toggle } from './settings/Toggle';
import { RapidAPITab } from './settings/RapidAPITab';
import { InstagramTab } from './settings/InstagramTab';

interface MemberDetailDialogProps {
  memberId: string;
  memberName: string;
  memberEmail: string;
  organizationId?: string;
  onClose: () => void;
}

type Tab = 'emails' | 'domains' | 'settings' | 'rapid-api' | 'instagram' | 'stats';

interface SESEmailRow { id: string; address: string; daily_limit: number; }
interface DomainRow { id: string; domain: string; autoresponder_enabled: boolean; }

interface MemberSettings {
  notifications: boolean;
  two_factor_auth: boolean;
  newsletter: boolean;
  public_profile: boolean;
  debugging: boolean;
  clean_up_loi: boolean;
}

const DEFAULT_SETTINGS: MemberSettings = {
  notifications: true,
  two_factor_auth: false,
  newsletter: false,
  public_profile: true,
  debugging: false,
  clean_up_loi: false,
};

const SETTING_ROWS: { key: keyof MemberSettings; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'notifications', label: 'Push Notifications', description: 'Receive notifications about important updates', icon: Bell },
  { key: 'two_factor_auth', label: 'Two-Factor Authentication', description: 'Add an extra layer of security', icon: Lock },
  { key: 'public_profile', label: 'Public Profile', description: 'Make profile visible to other users', icon: Globe },
  { key: 'newsletter', label: 'Newsletter', description: 'Receive newsletter with updates', icon: Mail },
  { key: 'debugging', label: 'Debugging', description: 'Enable additional logging and debugging', icon: Bug },
  { key: 'clean_up_loi', label: 'Clean Up Attachments', description: 'Delete local attachment files during campaigns', icon: FileText },
];

export function MemberDetailDialog({ memberId, memberName, memberEmail, organizationId, onClose }: MemberDetailDialogProps) {
  const [activeTab, setActiveTab] = useState<Tab>('emails');
  const [memberRole, setMemberRole] = useState<string>('member');
  const [joinedAt, setJoinedAt] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // SES emails
  const [sesEmails, setSesEmails] = useState<SESEmailRow[]>([]);
  const [newSesEmail, setNewSesEmail] = useState('');
  const [newSesLimit, setNewSesLimit] = useState(1440);
  const [sesError, setSesError] = useState('');

  // Domains
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [domainError, setDomainError] = useState('');

  // Settings
  const [settings, setSettings] = useState<MemberSettings>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(false);

  // Stats
  const [stats, setStats] = useState<{ totalSent: number; totalOpens: number; totalReplies: number; campaignsRun: number } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    loadMemberData();
  }, [memberId]);

  useEffect(() => {
    if (activeTab === 'emails' && sesEmails.length === 0) {
      loadEmails();
    }
    if (activeTab === 'domains' && domains.length === 0) {
      loadDomains();
    }
    if (activeTab === 'settings') {
      loadSettings();
    }
    if (activeTab === 'stats' && !stats) {
      loadStats();
    }
  }, [activeTab]);

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
    } catch (err) {
      console.error('Error loading member data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadEmails() {
    const { data } = await supabase.from('amazon_ses_emails').select('id, address, daily_limit').eq('user_id', memberId).order('address', { ascending: true });
    if (data) setSesEmails(data);
  }

  async function loadDomains() {
    const { data } = await supabase
      .from('amazon_ses_domains')
      .select('id, domain, autoresponder_enabled')
      .eq('user_id', memberId)
      .order('domain', { ascending: true });
    setDomains(data || []);
  }

  async function loadSettings() {
    setSettingsLoading(true);
    const { data } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', memberId)
      .maybeSingle();
    if (data) {
      setSettings({
        notifications: data.notifications ?? DEFAULT_SETTINGS.notifications,
        two_factor_auth: data.two_factor_auth ?? DEFAULT_SETTINGS.two_factor_auth,
        newsletter: data.newsletter ?? DEFAULT_SETTINGS.newsletter,
        public_profile: data.public_profile ?? DEFAULT_SETTINGS.public_profile,
        debugging: data.debugging ?? DEFAULT_SETTINGS.debugging,
        clean_up_loi: data.clean_up_loi ?? DEFAULT_SETTINGS.clean_up_loi,
      });
    }
    setSettingsLoading(false);
  }

  async function handleSettingToggle(key: keyof MemberSettings, checked: boolean) {
    setSettings(prev => ({ ...prev, [key]: checked }));
    const { error } = await supabase
      .from('user_settings')
      .update({ [key]: checked, updated_at: new Date().toISOString() })
      .eq('user_id', memberId);
    if (error) {
      setSettings(prev => ({ ...prev, [key]: !checked }));
      toast.error('Failed to update setting');
    }
  }

  async function loadStats() {
    setStatsLoading(true);
    try {
      const { data, error } = await supabase
        .rpc('get_member_statistics', { p_member_id: memberId });
      if (error) throw error;
      const r = (data && data[0]) || { total_sent: 0, total_opens: 0, total_replies: 0, campaigns_run: 0 };
      setStats({
        totalSent: Number(r.total_sent) || 0,
        totalOpens: Number(r.total_opens) || 0,
        totalReplies: Number(r.total_replies) || 0,
        campaignsRun: Number(r.campaigns_run) || 0,
      });
    } catch (err) {
      console.error('Error loading stats:', err);
      setStats({ totalSent: 0, totalOpens: 0, totalReplies: 0, campaignsRun: 0 });
    } finally {
      setStatsLoading(false);
    }
  }

  // SES email handlers
  async function handleAddSesEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!newSesEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setSesError('Please enter a valid email address');
      return;
    }
    const { error } = await supabase.from('amazon_ses_emails').insert({
      user_id: memberId, address: newSesEmail, daily_limit: newSesLimit,
    });
    if (error) {
      setSesError(error.code === '23505' ? 'This email is already registered' : error.message);
      return;
    }
    setNewSesEmail(''); setSesError('');
    loadEmails();
  }

  async function handleRemoveSesEmail(id: string) {
    await supabase.from('amazon_ses_emails').delete().eq('id', id);
    setSesEmails(prev => prev.filter(e => e.id !== id));
  }

  async function handleUpdateSesLimit(id: string, limit: number) {
    await supabase.from('amazon_ses_emails').update({ daily_limit: limit, updated_at: new Date().toISOString() }).eq('id', id);
    setSesEmails(prev => prev.map(e => e.id === id ? { ...e, daily_limit: limit } : e));
  }

  // Domain handlers
  async function handleAddDomain(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newDomain.trim().toLowerCase();
    if (!trimmed.match(/^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/)) {
      setDomainError('Please enter a valid domain');
      return;
    }
    const { error } = await supabase.from('amazon_ses_domains').insert({
      user_id: memberId, domain: trimmed, autoresponder_enabled: false,
    });
    if (error) {
      setDomainError(error.code === '23505' ? 'This domain is already registered' : error.message);
      return;
    }
    setNewDomain(''); setDomainError('');
    loadDomains();
  }

  async function handleRemoveDomain(id: string) {
    await supabase.from('amazon_ses_domains').delete().eq('id', id);
    setDomains(prev => prev.filter(d => d.id !== id));
  }

  async function handleToggleAutoresponder(id: string, enabled: boolean) {
    await supabase.from('amazon_ses_domains').update({ autoresponder_enabled: enabled, updated_at: new Date().toISOString() }).eq('id', id);
    setDomains(prev => prev.map(d => d.id === id ? { ...d, autoresponder_enabled: enabled } : d));
  }

  const RoleIcon = memberRole === 'owner' ? Crown : memberRole === 'manager' ? Shield : UserIcon;
  const roleColor = memberRole === 'owner' ? 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/20' : memberRole === 'manager' ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/20' : 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700';

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'emails', label: 'Email Accounts', icon: Mail },
    { key: 'domains', label: 'Domains', icon: Globe },
    { key: 'settings', label: 'Settings', icon: SettingsIcon },
    { key: 'rapid-api', label: 'Rapid API', icon: KeyRound },
    { key: 'instagram', label: 'Instagram', icon: InstagramIcon },
    { key: 'stats', label: 'Statistics', icon: BarChart3 },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${roleColor}`}>
              <RoleIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{memberName || memberEmail}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">{memberRole}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-6 flex-shrink-0 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Email Accounts Tab */}
              {activeTab === 'emails' && (
                <div className="space-y-6">
                  {/* SES Emails */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Server className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Amazon SES Emails</h4>
                    </div>
                    <form onSubmit={handleAddSesEmail} className="space-y-3 mb-4">
                      <div className="flex gap-2">
                        <input
                          type="email"
                          value={newSesEmail}
                          onChange={e => { setNewSesEmail(e.target.value); setSesError(''); }}
                          placeholder="sender@example.com"
                          className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <input
                          type="number"
                          value={newSesLimit}
                          onChange={e => setNewSesLimit(Math.min(50000, Math.max(1, parseInt(e.target.value) || 1)))}
                          min="1" max="50000"
                          className="w-24 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          title="Daily limit"
                        />
                        <button type="submit" className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center gap-1 flex-shrink-0">
                          <Plus className="w-4 h-4" /> Add
                        </button>
                      </div>
                      {sesError && <p className="text-sm text-red-600 dark:text-red-400">{sesError}</p>}
                    </form>
                    <div className="space-y-2">
                      {sesEmails.length === 0 ? (
                        <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-4">No SES emails configured</p>
                      ) : sesEmails.map(email => (
                        <div key={email.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg group">
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="text-sm text-gray-900 dark:text-white">{email.address}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={email.daily_limit}
                              onChange={e => handleUpdateSesLimit(email.id, Math.min(50000, Math.max(1, parseInt(e.target.value) || 1)))}
                              min="1" max="50000"
                              className="w-20 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            <span className="text-xs text-gray-400">/day</span>
                            <button onClick={() => handleRemoveSesEmail(email.id)} className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}

              {/* Domains Tab */}
              {activeTab === 'domains' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Globe className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">SES Sending Domains</h4>
                  </div>
                  <form onSubmit={handleAddDomain} className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={newDomain}
                      onChange={e => { setNewDomain(e.target.value); setDomainError(''); }}
                      placeholder="example.com"
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button type="submit" className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center gap-1 flex-shrink-0">
                      <Plus className="w-4 h-4" /> Add
                    </button>
                  </form>
                  {domainError && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{domainError}</p>}
                  <div className="space-y-2">
                    {domains.length === 0 ? (
                      <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-4">No domains configured</p>
                    ) : domains.map(domain => (
                      <div key={domain.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg group">
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="text-sm text-gray-900 dark:text-white">{domain.domain}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 dark:text-gray-400">Autoresponder</span>
                            <Toggle checked={domain.autoresponder_enabled} onChange={(checked) => handleToggleAutoresponder(domain.id, checked)} />
                          </div>
                          <button onClick={() => handleRemoveDomain(domain.id)} className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Settings Tab */}
              {activeTab === 'settings' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-3">
                    <SettingsIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">User Settings</h4>
                  </div>
                  {settingsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {SETTING_ROWS.map(({ key, label, description, icon: Icon }) => (
                        <div key={key} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                          <div className="flex items-start gap-3">
                            <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
                            </div>
                          </div>
                          <Toggle
                            checked={settings[key]}
                            onChange={(checked) => handleSettingToggle(key, checked)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Rapid API Tab */}
              {activeTab === 'rapid-api' && (
                <RapidAPITab userId={memberId} />
              )}

              {/* Instagram Tab */}
              {activeTab === 'instagram' && (
                <InstagramTab userId={memberId} />
              )}

              {/* Statistics Tab */}
              {activeTab === 'stats' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Activity Statistics</h4>
                  </div>
                  {statsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : stats ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-2 mb-1">
                          <Send className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Emails Sent</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalSent}</p>
                      </div>
                      <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                        <div className="flex items-center gap-2 mb-1">
                          <Mail className="w-4 h-4 text-green-600 dark:text-green-400" />
                          <span className="text-xs font-medium text-green-700 dark:text-green-300">Email Opens</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalOpens}</p>
                      </div>
                      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                        <div className="flex items-center gap-2 mb-1">
                          <Mail className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Replies</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalReplies}</p>
                      </div>
                      <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2 mb-1">
                          <BarChart3 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Campaigns Run</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.campaignsRun}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-4">No statistics available</p>
                  )}
                  {joinedAt && (
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 pt-2">
                      <Clock className="w-4 h-4" />
                      Joined {new Date(joinedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default MemberDetailDialog;
