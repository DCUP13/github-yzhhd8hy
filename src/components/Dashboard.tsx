import React, { useState } from 'react';
import { Mail, FileText, Send, Users, LayoutGrid as Layout, Globe, Eye, MousePointer, MessageSquare, CheckCircle, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { useDashboard, type EmailAnalytics } from '../contexts/DashboardContext';

interface DashboardProps {
  onSignOut: () => void;
  currentView: string;
  onNavigateAnalytics?: () => void;
}

interface CardData {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  details: { label: string; value: string }[];
}

export function Dashboard({ onSignOut, currentView, onNavigateAnalytics }: DashboardProps) {
  const { stats, emailAnalytics } = useDashboard();
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);

  const fmt = (n: number) => n.toLocaleString();
  const pct = (n: number) => `${n.toFixed(1)}%`;

  const existingCards: CardData[] = [
    {
      title: 'Emails Remaining',
      value: fmt(stats.totalEmailsRemaining),
      icon: Mail,
      color: 'text-blue-500',
      bgColor: 'bg-blue-100 dark:bg-blue-900/20',
      details: [
        { label: 'Email accounts', value: fmt(stats.totalEmailAccounts) },
        { label: 'Sent today', value: fmt(stats.totalEmailsSentToday) },
      ],
    },
    {
      title: 'Email Accounts',
      value: fmt(stats.totalEmailAccounts),
      icon: Users,
      color: 'text-green-500',
      bgColor: 'bg-green-100 dark:bg-green-900/20',
      details: [
        { label: 'Domains', value: fmt(stats.totalDomains) },
        { label: 'Remaining', value: fmt(stats.totalEmailsRemaining) },
      ],
    },
    {
      title: 'Emails Sent Today',
      value: fmt(stats.totalEmailsSentToday),
      icon: Send,
      color: 'text-blue-500',
      bgColor: 'bg-blue-100 dark:bg-blue-900/20',
      details: [
        { label: 'Total sent', value: emailAnalytics ? fmt(emailAnalytics.totalSent) : '0' },
        { label: 'Delivery rate', value: emailAnalytics ? pct(emailAnalytics.deliveryRate) : '0%' },
      ],
    },
    {
      title: 'Total Templates',
      value: fmt(stats.totalTemplates),
      icon: FileText,
      color: 'text-orange-500',
      bgColor: 'bg-orange-100 dark:bg-orange-900/20',
      details: [
        { label: 'Campaigns', value: fmt(stats.totalCampaigns) },
      ],
    },
    {
      title: 'Total Campaigns',
      value: fmt(stats.totalCampaigns),
      icon: Layout,
      color: 'text-blue-500',
      bgColor: 'bg-blue-100 dark:bg-blue-900/20',
      details: [
        { label: 'Templates', value: fmt(stats.totalTemplates) },
        { label: 'Emails sent today', value: fmt(stats.totalEmailsSentToday) },
      ],
    },
    {
      title: 'Total Domains',
      value: fmt(stats.totalDomains),
      icon: Globe,
      color: 'text-teal-500',
      bgColor: 'bg-teal-100 dark:bg-teal-900/20',
      details: [
        { label: 'Email accounts', value: fmt(stats.totalEmailAccounts) },
      ],
    },
  ];

  const analyticsCards: CardData[] = emailAnalytics ? [
    {
      title: 'Delivery Rate',
      value: pct(emailAnalytics.deliveryRate),
      icon: CheckCircle,
      color: 'text-green-500',
      bgColor: 'bg-green-100 dark:bg-green-900/20',
      details: [
        { label: 'Total sent', value: fmt(emailAnalytics.totalSent) },
        { label: 'Delivered', value: fmt(emailAnalytics.totalDelivered) },
        { label: 'Bounced', value: fmt(emailAnalytics.totalBounced) },
        { label: 'Failed', value: fmt(emailAnalytics.failedCount) },
      ],
    },
    {
      title: 'Open Rate',
      value: pct(emailAnalytics.openRate),
      icon: Eye,
      color: 'text-blue-500',
      bgColor: 'bg-blue-100 dark:bg-blue-900/20',
      details: [
        { label: 'Unique opens', value: fmt(emailAnalytics.uniqueOpens) },
        { label: 'Total open events', value: fmt(emailAnalytics.totalOpenEvents) },
        { label: 'Last open', value: emailAnalytics.lastOpenTime ? new Date(emailAnalytics.lastOpenTime).toLocaleString() : 'N/A' },
      ],
    },
    {
      title: 'Click Rate',
      value: pct(emailAnalytics.clickRate),
      icon: MousePointer,
      color: 'text-purple-500',
      bgColor: 'bg-purple-100 dark:bg-purple-900/20',
      details: [
        { label: 'Total clicked', value: fmt(emailAnalytics.totalClicked) },
        { label: 'Last click', value: emailAnalytics.lastClickTime ? new Date(emailAnalytics.lastClickTime).toLocaleString() : 'N/A' },
      ],
    },
    {
      title: 'Reply Rate',
      value: pct(emailAnalytics.replyRate),
      icon: MessageSquare,
      color: 'text-amber-500',
      bgColor: 'bg-amber-100 dark:bg-amber-900/20',
      details: [
        { label: 'Total replies', value: fmt(emailAnalytics.totalReplies) },
        { label: 'Last reply', value: emailAnalytics.lastReplyTime ? new Date(emailAnalytics.lastReplyTime).toLocaleString() : 'N/A' },
      ],
    },
    {
      title: 'Bounce Rate',
      value: pct(emailAnalytics.bounceRate),
      icon: AlertCircle,
      color: 'text-red-500',
      bgColor: 'bg-red-100 dark:bg-red-900/20',
      details: [
        { label: 'Total bounced', value: fmt(emailAnalytics.totalBounced) },
        { label: 'Complaints', value: fmt(emailAnalytics.complainedCount) },
      ],
    },
  ] : [];

  const renderCard = (card: CardData, index: number, isAnalytics: boolean) => {
    const Icon = card.icon;
    return (
      <div
        key={index}
        className="relative bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 transition-all duration-200 hover:shadow-md"
        onMouseEnter={() => setHoveredCard(index + (isAnalytics ? 100 : 0))}
        onMouseLeave={() => setHoveredCard(null)}
      >
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-lg ${card.bgColor}`}>
            <Icon className={`w-6 h-6 ${card.color}`} />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {card.title}
            </h3>
            <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
              {card.value}
            </p>
          </div>
        </div>

        {/* Hover dropdown */}
        {hoveredCard === (index + (isAnalytics ? 100 : 0)) && (
          <div className="absolute left-0 right-0 top-full mt-2 z-20 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 animate-fadeIn">
            <div className="space-y-2">
              {card.details.map((detail, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">{detail.label}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{detail.value}</span>
                </div>
              ))}
            </div>
            {isAnalytics && onNavigateAnalytics && (
              <button
                onClick={onNavigateAnalytics}
                className="mt-3 w-full text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 flex items-center justify-center gap-1"
              >
                View full analytics
                <TrendingUp className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-8 bg-white dark:bg-gray-900 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard Overview</h1>
          {onNavigateAnalytics && (
            <button
              onClick={onNavigateAnalytics}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              View Analytics
            </button>
          )}
        </div>

        <div className="mb-2">
          <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Overview</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
          {existingCards.map((card, index) => renderCard(card, index, false))}
        </div>

        {analyticsCards.length > 0 && (
          <>
            <div className="mb-2">
              <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Email Performance</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {analyticsCards.map((card, index) => renderCard(card, index, true))}
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.15s ease-out;
        }
      `}</style>
    </div>
  );
}
