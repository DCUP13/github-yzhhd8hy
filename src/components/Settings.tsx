import React, { useState, useEffect } from 'react';
import { Server, BarChart3, Instagram as InstagramIcon, Key, ArrowLeft, Cloud } from 'lucide-react';
import { GeneralTab } from './settings/GeneralTab';
import { AmazonTab } from './settings/AmazonTab';
import { RapidAPITab } from './settings/RapidAPITab';
import { DataQualityTab } from './settings/DataQualityTab';
import { InstagramTab } from './settings/InstagramTab';
import { UserTab } from './settings/UserTab';
import { ContentStorageTab } from './settings/ContentStorageTab';
import type { GeneralSettings } from './settings/types';
import { supabase } from '../lib/supabase';

interface SettingsProps {
  onSignOut: () => void;
  currentView: string;
  memberUserId?: string;
  onBackToTeam?: () => void;
}

type SettingsTab = 'user' | 'general' | 'amazon' | 'rapid-api' | 'data-quality' | 'instagram' | 'content-storage';

export function Settings({ onSignOut: _onSignOut, currentView: _currentView, memberUserId, onBackToTeam }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [userEmail, setUserEmail] = useState('');
  const [orgName, setOrgName] = useState('');
  const [userRole, setUserRole] = useState('member');
  const isManagingMember = !!memberUserId;

  const [settings, setSettings] = useState<GeneralSettings>({
    notifications: true,
    twoFactorAuth: false,
    newsletter: false,
    publicProfile: true,
    debugging: false,
    cleanUpLoi: false
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
    fetchUserProfile();
  }, [memberUserId]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let active = true;

    (async () => {
      let targetUserId = memberUserId;
      if (!targetUserId) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user || !active) return;
        targetUserId = session.user.id;
      }
      if (!targetUserId || !active) return;

      channel = supabase
        .channel(`user_settings_rt_${targetUserId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_settings', filter: `user_id=eq.${targetUserId}` },
          (payload) => {
            const d = payload.new as Record<string, unknown>;
            setSettings({
              notifications: Boolean(d.notifications),
              twoFactorAuth: Boolean(d.two_factor_auth),
              newsletter: Boolean(d.newsletter),
              publicProfile: Boolean(d.public_profile),
              debugging: Boolean(d.debugging),
              cleanUpLoi: Boolean(d.clean_up_loi),
            });
          }
        )
        .subscribe();
    })();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [memberUserId]);

  const fetchUserProfile = async () => {
    try {
      if (isManagingMember) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email, role')
          .eq('id', memberUserId)
          .maybeSingle();

        if (profile) {
          setUserEmail(profile.email || '');
          setUserRole(profile.role || 'member');
        }

        const { data: memberData } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', memberUserId)
          .eq('status', 'active')
          .maybeSingle();

        if (memberData) {
          const { data: orgData } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', memberData.organization_id)
            .maybeSingle();
          if (orgData) setOrgName(orgData.name);
        }
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      setUserEmail(session.user.email || '');

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profile) setUserRole(profile.role || 'member');

      const { data: orgData } = await supabase
        .from('organizations')
        .select('name')
        .maybeSingle();

      if (orgData) setOrgName(orgData.name);
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  };

  const createDefaultSettings = async () => {
    try {
      let targetUserId = memberUserId;
      if (!targetUserId) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        targetUserId = session.user.id;
      }

      const { error } = await supabase
        .from('user_settings')
        .insert({
          user_id: targetUserId,
          notifications: true,
          two_factor_auth: false,
          newsletter: false,
          public_profile: true,
          debugging: false,
          clean_up_loi: false
        });

      if (error) throw error;
      await fetchSettings();
    } catch (error) {
      console.error('Error creating default settings:', error);
    }
  };

  const fetchSettings = async () => {
    try {
      let targetUserId = memberUserId;
      if (!targetUserId) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          throw new Error('User not authenticated');
        }
        targetUserId = session.user.id;
      }

      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({
          notifications: data.notifications,
          twoFactorAuth: data.two_factor_auth,
          newsletter: data.newsletter,
          publicProfile: data.public_profile,
          debugging: data.debugging,
          cleanUpLoi: data.clean_up_loi || false
        });
      } else if (!isManagingMember) {
        await createDefaultSettings();
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (setting: keyof GeneralSettings) => {
    try {
      let targetUserId = memberUserId;
      if (!targetUserId) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          throw new Error('User not authenticated');
        }
        targetUserId = session.user.id;
      }

      const newSettings = {
        ...settings,
        [setting]: !settings[setting]
      };

      const dbSettings = {
        notifications: newSettings.notifications,
        two_factor_auth: newSettings.twoFactorAuth,
        newsletter: newSettings.newsletter,
        public_profile: newSettings.publicProfile,
        debugging: newSettings.debugging,
        clean_up_loi: newSettings.cleanUpLoi,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('user_settings')
        .update(dbSettings)
        .eq('user_id', targetUserId);

      if (error) throw error;

      setSettings(newSettings);
    } catch (error) {
      console.error('Error updating settings:', error);
      alert('Failed to update settings. Please try again.');
    }
  };

  const tabs = [
    ...(isManagingMember ? [] : [{ id: 'user' as const, label: 'User', icon: Key }]),
    { id: 'general' as const, label: 'General', icon: Server },
    { id: 'data-quality' as const, label: 'Data Quality', icon: BarChart3 },
    { id: 'amazon' as const, label: 'Amazon SES', icon: Server },
    { id: 'rapid-api' as const, label: 'Rapid API', icon: Server },
    { id: 'instagram' as const, label: 'Instagram', icon: InstagramIcon },
    { id: 'content-storage' as const, label: 'Content Storage', icon: Cloud }
  ];

  if (isLoading) {
    return (
      <div className="p-8 bg-gray-50 dark:bg-gray-900 min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-2xl mx-auto">
        {isManagingMember && onBackToTeam && (
          <button
            onClick={onBackToTeam}
            className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Team
          </button>
        )}

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {isManagingMember ? `Manage ${userEmail}` : 'Settings'}
        </h1>
        {isManagingMember && orgName && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{orgName}</p>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex overflow-x-auto">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as SettingsTab)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'user' && (
              <UserTab
                userEmail={userEmail}
                orgName={orgName}
                userRole={userRole}
              />
            )}

            {activeTab === 'general' && (
              <GeneralTab
                settings={settings}
                onToggle={handleToggle}
              />
            )}

            {activeTab === 'data-quality' && <DataQualityTab />}

            {activeTab === 'amazon' && (
              <AmazonTab userId={memberUserId} />
            )}

            {activeTab === 'rapid-api' && <RapidAPITab userId={memberUserId} />}

            {activeTab === 'instagram' && <InstagramTab userId={memberUserId} />}

            {activeTab === 'content-storage' && <ContentStorageTab userId={memberUserId} />}
          </div>
        </div>

        <div className="mt-6 text-sm text-gray-500 dark:text-gray-400 text-center">
          {isManagingMember
            ? 'Changes are saved automatically'
            : 'Settings are automatically saved when you toggle them'}
        </div>
      </div>
    </div>
  );
}
