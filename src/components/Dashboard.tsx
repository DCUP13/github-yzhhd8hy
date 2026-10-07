import React, { useState } from 'react';
import { Mail, FileText, Send, Users, LayoutGrid as Layout, Globe, Eye, MousePointer, MessageSquare, CheckCircle, AlertCircle, TrendingUp, ChevronDown, Instagram as InstagramIcon, Linkedin as LinkedinIcon, ThumbsUp, Share2, BarChart3 } from 'lucide-react';
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
  const { stats, emailAnalytics, instagramSummary, linkedinSummary } = useDashboard();
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

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

  const toggleCard = (id: string) => {
    setExpandedCard(prev => prev === id ? null : id);
  };

  const renderCard = (card: CardData, index: number, isAnalytics: boolean, section = '') => {
    const Icon = card.icon;
    const cardId = `${isAnalytics ? 'a' : 'o'}-${section}-${index}`;
    const isExpanded = expandedCard === cardId;

    return (
      <div
        key={cardId}
        className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm transition-all duration-200 hover:shadow-md cursor-pointer select-none ${
          isExpanded ? 'ring-2 ring-blue-300 dark:ring-blue-600 shadow-md' : ''
        }`}
        onClick={() => toggleCard(cardId)}
      >
        <div className="p-4 sm:p-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className={`p-2.5 sm:p-3 rounded-lg ${card.bgColor} flex-shrink-0`}>
              <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${card.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {card.title}
              </h3>
              <p className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white mt-1">
                {card.value}
              </p>
            </div>
            {card.details.length > 0 && (
              <ChevronDown className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${
                isExpanded ? 'rotate-180' : ''
              }`} />
            )}
          </div>

          <div
            className={`grid transition-all duration-200 ease-out ${
              isExpanded ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0'
            }`}
          >
            <div className="overflow-hidden">
              <div className="border-t border-gray-100 dark:border-gray-700 pt-3 space-y-2">
                {card.details.map((detail, i) => (
                  <div key={i} className="flex items-center justify-between text-sm gap-2">
                    <span className="text-gray-500 dark:text-gray-400">{detail.label}</span>
                    <span className="font-medium text-gray-900 dark:text-white text-right">{detail.value}</span>
                  </div>
                ))}
              </div>
              {isAnalytics && onNavigateAnalytics && (
                <button
                  onClick={(e) => { e.stopPropagation(); onNavigateAnalytics(); }}
                  className="mt-3 w-full text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 flex items-center justify-center gap-1 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  View full analytics
                  <TrendingUp className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-white dark:bg-gray-900 min-h-screen overflow-x-hidden">
      <div className="max-w-5xl mx-auto w-full min-w-0">
        <div className="flex items-center justify-between mb-6 sm:mb-8 flex-wrap gap-3">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Dashboard Overview</h1>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-10">
          {existingCards.map((card, index) => renderCard(card, index, false))}
        </div>

        {analyticsCards.length > 0 && (
          <>
            <div className="mb-2">
              <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Email Performance</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {analyticsCards.map((card, index) => renderCard(card, index, true))}
            </div>
          </>
        )}

        {/* Instagram Summary */}
        {instagramSummary && instagramSummary.accountCount > 0 && (
          <>
            <div className="mb-2 mt-8 sm:mt-10">
              <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <InstagramIcon className="w-4 h-4 text-pink-500" /> Instagram
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {[
                { title: 'IG Accounts', value: fmt(instagramSummary.accountCount), icon: InstagramIcon, color: 'text-pink-500', bgColor: 'bg-pink-100 dark:bg-pink-900/20', details: [] as { label: string; value: string }[] },
                { title: 'IG Followers', value: fmt(instagramSummary.totalFollowers), icon: Users, color: 'text-pink-500', bgColor: 'bg-pink-100 dark:bg-pink-900/20', details: [{ label: 'Accounts', value: fmt(instagramSummary.accountCount) }] },
                { title: 'IG Reach', value: fmt(instagramSummary.totalReach), icon: Eye, color: 'text-cyan-500', bgColor: 'bg-cyan-100 dark:bg-cyan-900/20', details: [{ label: 'Impressions', value: fmt(instagramSummary.totalImpressions) }] },
                { title: 'IG Engagement', value: pct(instagramSummary.avgEngagement), icon: TrendingUp, color: 'text-amber-500', bgColor: 'bg-amber-100 dark:bg-amber-900/20', details: [{ label: 'Accounts', value: fmt(instagramSummary.accountCount) }] },
              ].map((card, index) => renderCard(card, index, true, 'ig'))}
            </div>
          </>
        )}

        {/* LinkedIn Summary */}
        {linkedinSummary && linkedinSummary.accountCount > 0 && (
          <>
            <div className="mb-2 mt-8 sm:mt-10">
              <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <LinkedinIcon className="w-4 h-4 text-[#0A66C2]" /> LinkedIn
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {[
                { title: 'LI Impressions', value: fmt(linkedinSummary.totalImpressions), icon: Eye, color: 'text-[#0A66C2]', bgColor: 'bg-blue-100 dark:bg-blue-900/20', details: [{ label: 'Unique views', value: fmt(linkedinSummary.totalUniqueImpressions) }, { label: 'Posts tracked', value: fmt(linkedinSummary.postCount) }] },
                { title: 'LI Reactions', value: fmt(linkedinSummary.totalReactions), icon: ThumbsUp, color: 'text-amber-500', bgColor: 'bg-amber-100 dark:bg-amber-900/20', details: [{ label: 'Comments', value: fmt(linkedinSummary.totalComments) }] },
                { title: 'LI Shares & Clicks', value: fmt(linkedinSummary.totalShares + linkedinSummary.totalClicks), icon: Share2, color: 'text-green-500', bgColor: 'bg-green-100 dark:bg-green-900/20', details: [{ label: 'Shares', value: fmt(linkedinSummary.totalShares) }, { label: 'Clicks', value: fmt(linkedinSummary.totalClicks) }] },
                { title: 'LI Engagement', value: pct(linkedinSummary.avgEngagement), icon: BarChart3, color: 'text-[#0A66C2]', bgColor: 'bg-blue-100 dark:bg-blue-900/20', details: [{ label: 'Posts tracked', value: fmt(linkedinSummary.postCount) }] },
              ].map((card, index) => renderCard(card, index, true, 'li'))}
            </div>
          </>
        )}
      </div>

      <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">
        Tap any card to see more details
      </p>
    </div>
  );
}
