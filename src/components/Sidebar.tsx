import React, { useState, useEffect, useRef } from 'react';
import { Home, LayoutGrid as Layout, Settings as SettingsIcon, LogOut, FileText, Mail, Inbox, MessageSquare, Users, BarChart3, Instagram, Headphones, Building2, ChevronDown, Plus, CheckCircle } from 'lucide-react';
import type { FeatureFlags } from '../App';
import { useOrganization } from '../contexts/OrganizationContext';
import { supabase } from '../lib/supabase';
import type { OrgInfo } from '../contexts/OrganizationContext';

interface SidebarProps {
  onSignOut: () => void;
  onHomeClick: () => void;
  onAppClick: () => void;
  onSettingsClick: () => void;
  onTemplatesClick: () => void;
  onAddressesClick: () => void;
  onEmailsClick: () => void;
  onPromptsClick: () => void;
  onContactsClick: () => void;
  onAnalyticsClick: () => void;
  onInstagramClick: () => void;
  onTeamClick: () => void;
  onSupportClick: () => void;
  isSuperAdmin?: boolean;
  featureFlags?: FeatureFlags;
}

function CreateOrgModal({ userId, onClose, onCreated }: { userId: string; onClose: () => void; onCreated: (org: OrgInfo) => void }) {
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Create Organization</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <LogOut className="w-4 h-4 text-gray-500 dark:text-gray-400 rotate-180" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-lg text-sm">
              {error}
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
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Use any name — a company, a team, or a single client's name.</p>
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
            <button type="button" onClick={onClose} disabled={loading}
              className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading || !name.trim()}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition-colors flex items-center justify-center gap-2">
              {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Plus className="w-4 h-4" />Create Organization</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function Sidebar({
  onSignOut,
  onHomeClick,
  onAppClick,
  onSettingsClick,
  onTemplatesClick,
  onAddressesClick,
  onEmailsClick,
  onPromptsClick,
  onContactsClick,
  onAnalyticsClick,
  onInstagramClick,
  onTeamClick,
  onSupportClick,
  isSuperAdmin,
  featureFlags
}: SidebarProps) {
  const { orgs, selectedOrg, selectedOrgId, showSwitcher, setShowSwitcher, switchOrg, showCreateOrg, setShowCreateOrg, handleOrgCreated, loading: orgLoading } = useOrganization();
  const switcherRef = useRef<HTMLDivElement>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);

  useEffect(() => {
    setIsOwner(orgs.some(o => o.role === 'owner'));
  }, [orgs]);

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

  const navButtonClass = "w-full flex items-center gap-3 px-4 py-2 text-sm rounded-lg hover:bg-blue-700 dark:hover:bg-gray-700 transition-colors";

  return (
    <div className="h-screen w-64 bg-blue-800 dark:bg-gray-800 text-white p-6 flex flex-col">
      {/* Organization switcher / title */}
      <div className="mb-6 relative" ref={switcherRef}>
        {orgLoading ? (
          <div className="flex items-center gap-2 h-8">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        ) : orgs.length === 0 ? (
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-300" />
            <h2 className="text-lg font-bold text-white">No Organization</h2>
          </div>
        ) : (
          <>
            <button
              onClick={() => setShowSwitcher(!showSwitcher)}
              className="w-full flex items-center gap-2 text-left group"
            >
              <div className="p-1.5 bg-blue-700 dark:bg-gray-700 rounded-lg flex-shrink-0 group-hover:bg-blue-600 dark:group-hover:bg-gray-600 transition-colors">
                <Building2 className="w-4 h-4 text-blue-200 dark:text-gray-300" />
              </div>
              <span className="text-lg font-bold text-white truncate flex-1">
                {selectedOrg?.name || 'Select Org'}
              </span>
              <ChevronDown className={`w-4 h-4 text-blue-300 dark:text-gray-400 flex-shrink-0 transition-transform duration-200 ${showSwitcher ? 'rotate-180' : ''}`} />
            </button>

            {showSwitcher && (
              <div className="absolute left-0 top-full mt-2 w-full bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden min-w-[220px]">
                <div className="py-1">
                  {orgs.map(org => (
                    <button
                      key={org.id}
                      onClick={() => switchOrg(org.id)}
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
          </>
        )}
      </div>

      <nav className="space-y-2 flex-1">
        <button onClick={onHomeClick} className={navButtonClass}>
          <Home className="w-4 h-4" /> Home
        </button>
        <button onClick={onAppClick} className={navButtonClass}>
          <Layout className="w-4 h-4" /> Campaigns
        </button>
        <button onClick={onTemplatesClick} className={navButtonClass}>
          <FileText className="w-4 h-4" /> Templates
        </button>
        <button onClick={onEmailsClick} className={navButtonClass}>
          <Inbox className="w-4 h-4" /> Emails
        </button>
        <button onClick={onAddressesClick} className={navButtonClass}>
          <Mail className="w-4 h-4" /> Addresses
        </button>
        <button onClick={onPromptsClick} className={navButtonClass}>
          <MessageSquare className="w-4 h-4" /> Prompts
        </button>
        <button onClick={onContactsClick} className={navButtonClass}>
          <Users className="w-4 h-4" /> Contacts
        </button>
        <button onClick={onTeamClick} className={navButtonClass}>
          <Users className="w-4 h-4" /> Team
        </button>
        {(featureFlags?.instagram || isSuperAdmin) && (
          <button onClick={onInstagramClick} className={navButtonClass}>
            <Instagram className="w-4 h-4" /> Instagram
          </button>
        )}
        <button onClick={onAnalyticsClick} className={navButtonClass}>
          <BarChart3 className="w-4 h-4" /> Analytics
        </button>
        <button onClick={onSettingsClick} className={navButtonClass}>
          <SettingsIcon className="w-4 h-4" /> Settings
        </button>
      </nav>

      <div className="space-y-2 pt-4 border-t border-blue-700 dark:border-gray-700">
        <button onClick={onSupportClick} className={navButtonClass}>
          <Headphones className="w-4 h-4" /> {isSuperAdmin ? 'Support Admin' : 'Support'}
        </button>
        <button onClick={onSignOut} className="w-full flex items-center gap-3 px-4 py-2 text-sm rounded-lg hover:bg-blue-700 dark:hover:bg-gray-700 transition-colors text-red-300 hover:text-red-200">
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>

      {showCreateOrg && currentUserId && (
        <CreateOrgModal userId={currentUserId} onClose={() => setShowCreateOrg(false)} onCreated={handleOrgCreated} />
      )}
    </div>
  );
}
