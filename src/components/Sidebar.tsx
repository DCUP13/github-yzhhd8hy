import { Home, LayoutGrid as Layout, Settings as SettingsIcon, LogOut, FileText, Mail, Inbox, MessageSquare, Users, BarChart3, Instagram, Headphones, X } from 'lucide-react';
import type { FeatureFlags } from '../App';
import type { AppView } from '../lib/router';

interface SidebarProps {
  onSignOut: () => void;
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  isSuperAdmin?: boolean;
  featureFlags?: FeatureFlags;
  unreadChatCount?: number;
}

export function Sidebar({
  onSignOut,
  currentView,
  onNavigate,
  isSuperAdmin,
  featureFlags,
  unreadChatCount = 0,
}: SidebarProps) {
  const navButtonClass = (isActive: boolean) =>
    `w-full flex items-center gap-3 px-3 sm:px-4 py-2 text-sm rounded-lg transition-colors ${
      isActive
        ? 'bg-blue-700 dark:bg-gray-700 text-white'
        : 'text-blue-100 hover:bg-blue-700 dark:hover:bg-gray-700'
    }`;

  return (
    <div className="h-full w-64 bg-blue-800 dark:bg-gray-800 text-white flex flex-col">
      {/* Header — fixed at top */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
        <h2 className="text-lg font-bold text-white">Dashboard</h2>
        <button onClick={() => onNavigate(currentView)} className="lg:hidden p-1 hover:bg-blue-700 dark:hover:bg-gray-700 rounded-lg">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav — scrollable, fills remaining space */}
      <nav className="flex-1 overflow-y-auto sidebar-scroll px-3 sm:px-6 pb-4 space-y-2">
        <button onClick={() => onNavigate('dashboard')} className={navButtonClass(currentView === 'dashboard')}>
          <Home className="w-4 h-4 flex-shrink-0" /> Home
        </button>
        <button onClick={() => onNavigate('app')} className={navButtonClass(currentView === 'app')}>
          <Layout className="w-4 h-4 flex-shrink-0" /> Campaigns
        </button>
        <button onClick={() => onNavigate('templates')} className={navButtonClass(currentView === 'templates')}>
          <FileText className="w-4 h-4 flex-shrink-0" /> Templates
        </button>
        <button onClick={() => onNavigate('emails')} className={navButtonClass(currentView === 'emails')}>
          <Inbox className="w-4 h-4 flex-shrink-0" /> Emails
        </button>
        <button onClick={() => onNavigate('addresses')} className={navButtonClass(currentView === 'addresses')}>
          <Mail className="w-4 h-4 flex-shrink-0" /> Addresses
        </button>
        <button onClick={() => onNavigate('prompts')} className={navButtonClass(currentView === 'prompts')}>
          <MessageSquare className="w-4 h-4 flex-shrink-0" /> Prompts
        </button>
        <button onClick={() => onNavigate('contacts')} className={navButtonClass(currentView === 'contacts')}>
          <Users className="w-4 h-4 flex-shrink-0" /> Contacts
        </button>
        <button onClick={() => onNavigate('team')} className={navButtonClass(currentView === 'team')}>
          <Users className="w-4 h-4 flex-shrink-0" /> Team
          {unreadChatCount > 0 && (
            <span className="ml-auto flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-semibold text-white bg-red-500 rounded-full">
              {unreadChatCount > 99 ? '99+' : unreadChatCount}
            </span>
          )}
        </button>
        {(featureFlags?.instagram || isSuperAdmin) && (
          <button onClick={() => onNavigate('instagram')} className={navButtonClass(currentView === 'instagram')}>
            <Instagram className="w-4 h-4 flex-shrink-0" /> Instagram
          </button>
        )}
        <button onClick={() => onNavigate('analytics')} className={navButtonClass(currentView === 'analytics')}>
          <BarChart3 className="w-4 h-4 flex-shrink-0" /> Analytics
        </button>
        <button onClick={() => onNavigate('settings')} className={navButtonClass(currentView === 'settings')}>
          <SettingsIcon className="w-4 h-4 flex-shrink-0" /> Settings
        </button>
      </nav>

      {/* Footer — always visible, pinned at bottom */}
      <div className="flex-shrink-0 space-y-2 px-3 sm:px-6 pt-4 pb-6 border-t border-blue-700 dark:border-gray-700">
        <button onClick={() => onNavigate('support')} className={navButtonClass(currentView === 'support')}>
          <Headphones className="w-4 h-4 flex-shrink-0" /> {isSuperAdmin ? 'Support Admin' : 'Support'}
        </button>
        <button onClick={onSignOut} className="w-full flex items-center gap-3 px-3 sm:px-4 py-2 text-sm rounded-lg hover:bg-blue-700 dark:hover:bg-gray-700 transition-colors text-red-300 hover:text-red-200">
          <LogOut className="w-4 h-4 flex-shrink-0" /> Sign out
        </button>
      </div>
    </div>
  );
}
