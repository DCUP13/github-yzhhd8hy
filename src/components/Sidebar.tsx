import { Home, LayoutGrid as Layout, Settings as SettingsIcon, LogOut, FileText, Mail, Inbox, MessageSquare, Users, BarChart3, Instagram, Headphones } from 'lucide-react';
import type { FeatureFlags } from '../App';

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
  const navButtonClass = "w-full flex items-center gap-3 px-4 py-2 text-sm rounded-lg hover:bg-blue-700 dark:hover:bg-gray-700 transition-colors";

  return (
    <div className="h-screen w-64 bg-blue-800 dark:bg-gray-800 text-white p-6 flex flex-col">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-white">Dashboard</h2>
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
    </div>
  );
}
