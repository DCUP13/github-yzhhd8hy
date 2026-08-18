import { Home, LayoutGrid as Layout, Settings as SettingsIcon, LogOut, FileText, Mail, Inbox, MessageSquare, Users, BarChart3, Instagram, Headphones, X } from 'lucide-react';
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
  unreadChatCount?: number;
  onNavigate?: () => void;
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
  featureFlags,
  unreadChatCount = 0,
  onNavigate,
}: SidebarProps) {
  const navButtonClass = "w-full flex items-center gap-3 px-3 sm:px-4 py-2 text-sm rounded-lg hover:bg-blue-700 dark:hover:bg-gray-700 transition-colors";

  const handleNav = (fn: () => void) => {
    fn();
    onNavigate?.();
  };

  return (
    <div className="h-full w-64 bg-blue-800 dark:bg-gray-800 text-white flex flex-col">
      {/* Header — fixed at top */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
        <h2 className="text-lg font-bold text-white">Dashboard</h2>
        {onNavigate && (
          <button onClick={onNavigate} className="lg:hidden p-1 hover:bg-blue-700 dark:hover:bg-gray-700 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav — scrollable, fills remaining space */}
      <nav className="flex-1 overflow-y-auto sidebar-scroll px-3 sm:px-6 pb-4 space-y-2">
        <button onClick={() => handleNav(onHomeClick)} className={navButtonClass}>
          <Home className="w-4 h-4 flex-shrink-0" /> Home
        </button>
        <button onClick={() => handleNav(onAppClick)} className={navButtonClass}>
          <Layout className="w-4 h-4 flex-shrink-0" /> Campaigns
        </button>
        <button onClick={() => handleNav(onTemplatesClick)} className={navButtonClass}>
          <FileText className="w-4 h-4 flex-shrink-0" /> Templates
        </button>
        <button onClick={() => handleNav(onEmailsClick)} className={navButtonClass}>
          <Inbox className="w-4 h-4 flex-shrink-0" /> Emails
        </button>
        <button onClick={() => handleNav(onAddressesClick)} className={navButtonClass}>
          <Mail className="w-4 h-4 flex-shrink-0" /> Addresses
        </button>
        <button onClick={() => handleNav(onPromptsClick)} className={navButtonClass}>
          <MessageSquare className="w-4 h-4 flex-shrink-0" /> Prompts
        </button>
        <button onClick={() => handleNav(onContactsClick)} className={navButtonClass}>
          <Users className="w-4 h-4 flex-shrink-0" /> Contacts
        </button>
        <button onClick={() => handleNav(onTeamClick)} className={navButtonClass}>
          <Users className="w-4 h-4 flex-shrink-0" /> Team
          {unreadChatCount > 0 && (
            <span className="ml-auto flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-semibold text-white bg-red-500 rounded-full">
              {unreadChatCount > 99 ? '99+' : unreadChatCount}
            </span>
          )}
        </button>
        {(featureFlags?.instagram || isSuperAdmin) && (
          <button onClick={() => handleNav(onInstagramClick)} className={navButtonClass}>
            <Instagram className="w-4 h-4 flex-shrink-0" /> Instagram
          </button>
        )}
        <button onClick={() => handleNav(onAnalyticsClick)} className={navButtonClass}>
          <BarChart3 className="w-4 h-4 flex-shrink-0" /> Analytics
        </button>
        <button onClick={() => handleNav(onSettingsClick)} className={navButtonClass}>
          <SettingsIcon className="w-4 h-4 flex-shrink-0" /> Settings
        </button>
      </nav>

      {/* Footer — always visible, pinned at bottom */}
      <div className="flex-shrink-0 space-y-2 px-3 sm:px-6 pt-4 pb-6 border-t border-blue-700 dark:border-gray-700">
        <button onClick={() => handleNav(onSupportClick)} className={navButtonClass}>
          <Headphones className="w-4 h-4 flex-shrink-0" /> {isSuperAdmin ? 'Support Admin' : 'Support'}
        </button>
        <button onClick={() => handleNav(onSignOut)} className="w-full flex items-center gap-3 px-3 sm:px-4 py-2 text-sm rounded-lg hover:bg-blue-700 dark:hover:bg-gray-700 transition-colors text-red-300 hover:text-red-200">
          <LogOut className="w-4 h-4 flex-shrink-0" /> Sign out
        </button>
      </div>
    </div>
  );
}
