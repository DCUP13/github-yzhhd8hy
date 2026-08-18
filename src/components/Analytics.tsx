import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BarChart3, Send, CheckCircle, Eye, MousePointer, MessageSquare, AlertCircle, TrendingUp, Calendar, Filter, Instagram as InstagramIcon, Users, Image as ImageIcon, Heart, Bookmark, Play, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { AppView } from '../lib/router';

interface AnalyticsProps {
  onSignOut: () => void;
  currentView: string;
  queryParams: Record<string, string>;
  navigateToApp: (view: AppView, params?: Record<string, string>) => void;
}

interface SentEmailRow {
  id: string;
  to_email: string;
  from_email: string;
  subject: string;
  sent_at: string;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  open_count: number;
  click_count: number;
  failed_at: string | null;
  complained_at: string | null;
}

interface IgAccountRow {
  id: string;
  ig_user_id: string | null;
  username: string | null;
  connected: boolean;
  profile_picture_url: string | null;
  followers_count: number | null;
  follows_count: number | null;
  media_count: number | null;
  token_expired: boolean;
}

interface IgSnapshot {
  id: string;
  account_id: string;
  followers_count: number | null;
  follows_count: number | null;
  media_count: number | null;
  account_reach: number | null;
  account_impressions: number | null;
  engagement_rate: number | null;
  posts_data: any[];
  created_at: string;
}

type Period = 'today' | '7d' | '30d';

export function Analytics({ onSignOut, currentView, queryParams, navigateToApp }: AnalyticsProps) {
  const [sentEmails, setSentEmails] = useState<SentEmailRow[]>([]);
  const [replyCount, setReplyCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('30d');

  // Instagram analytics state
  const [igAccounts, setIgAccounts] = useState<IgAccountRow[]>([]);
  const [igSnapshots, setIgSnapshots] = useState<IgSnapshot[]>([]);
  const [selectedIgAccountId, setSelectedIgAccountId] = useState<string>('all');
  const [showIgDropdown, setShowIgDropdown] = useState(false);
  const [igLoading, setIgLoading] = useState(true);

  const fetchAnalytics = async () => {
    try {
      const { data, error } = await supabase
        .from('email_sent')
        .select('id, to_email, from_email, subject, sent_at, delivered_at, opened_at, clicked_at, bounced_at, open_count, click_count, failed_at, complained_at')
        .order('sent_at', { ascending: false });

      if (error) throw error;
      setSentEmails(data || []);

      if (data && data.length > 0) {
        const sentIds = data.map(e => e.id);
        const { count } = await supabase
          .from('emails')
          .select('id', { count: 'exact', head: true })
          .in('reply_to_sent_id', sentIds);
        setReplyCount(count ?? 0);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchInstagramAnalytics = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: accounts } = await supabase
        .from('instagram_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('connected', true)
        .order('created_at', { ascending: true });

      setIgAccounts(accounts || []);

      if (accounts && accounts.length > 0) {
        const accountIds = accounts.map(a => a.id);
        const { data: snapshots } = await supabase
          .from('instagram_insights_snapshots')
          .select('*')
          .in('account_id', accountIds)
          .order('created_at', { ascending: false })
          .limit(100);

        setIgSnapshots(snapshots || []);
      }
    } catch (error) {
      console.error('Error fetching Instagram analytics:', error);
    } finally {
      setIgLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
    fetchInstagramAnalytics();
  }, [fetchInstagramAnalytics]);

  // Filter snapshots by selected account
  const filteredIgSnapshots = useMemo(() => {
    if (selectedIgAccountId === 'all') return igSnapshots;
    return igSnapshots.filter(s => s.account_id === selectedIgAccountId);
  }, [igSnapshots, selectedIgAccountId]);

  // Get latest snapshot per account (for combined view)
  const latestPerAccount = useMemo(() => {
    const seen = new Set<string>();
    const result: IgSnapshot[] = [];
    for (const snap of igSnapshots) {
      if (!seen.has(snap.account_id)) {
        seen.add(snap.account_id);
        result.push(snap);
      }
    }
    return result;
  }, [igSnapshots]);

  const selectedAccountLatest = useMemo(() => {
    if (selectedIgAccountId === 'all') return null;
    return filteredIgSnapshots[0] || null;
  }, [filteredIgSnapshots, selectedIgAccountId]);

  // Combined metrics across all accounts
  const combinedMetrics = useMemo(() => {
    const latestSnaps = selectedIgAccountId === 'all' ? latestPerAccount : (selectedAccountLatest ? [selectedAccountLatest] : []);
    return {
      totalFollowers: latestSnaps.reduce((sum, s) => sum + (s.followers_count ?? 0), 0),
      totalReach: latestSnaps.reduce((sum, s) => sum + (s.account_reach ?? 0), 0),
      totalImpressions: latestSnaps.reduce((sum, s) => sum + (s.account_impressions ?? 0), 0),
      avgEngagement: latestSnaps.length > 0
        ? latestSnaps.reduce((sum, s) => sum + (s.engagement_rate ?? 0), 0) / latestSnaps.length
        : 0,
      accountCount: latestSnaps.length,
    };
  }, [latestPerAccount, selectedAccountLatest, selectedIgAccountId]);

  // Get posts data from latest snapshots
  const igPosts = useMemo(() => {
    const snaps = selectedIgAccountId === 'all' ? latestPerAccount : (selectedAccountLatest ? [selectedAccountLatest] : []);
    const allPosts: any[] = [];
    for (const snap of snaps) {
      const acct = igAccounts.find(a => a.id === snap.account_id);
      for (const post of snap.posts_data ?? []) {
        allPosts.push({ ...post, account_username: acct?.username ?? 'unknown' });
      }
    }
    return allPosts.sort((a, b) => ((b.like_count ?? 0) + (b.comments_count ?? 0)) - ((a.like_count ?? 0) + (a.comments_count ?? 0)));
  }, [latestPerAccount, selectedAccountLatest, selectedIgAccountId, igAccounts]);

  // Email analytics calculations
  const periodFiltered = useMemo(() => {
    const now = new Date();
    let cutoff = new Date();
    if (period === 'today') {
      cutoff.setHours(0, 0, 0, 0);
    } else if (period === '7d') {
      cutoff.setDate(now.getDate() - 7);
    } else {
      cutoff.setDate(now.getDate() - 30);
    }
    return sentEmails.filter(e => new Date(e.sent_at) >= cutoff);
  }, [sentEmails, period]);

  const metrics = useMemo(() => {
    const total = periodFiltered.length;
    const delivered = periodFiltered.filter(e => e.delivered_at).length;
    const opened = periodFiltered.filter(e => e.opened_at || e.open_count > 0).length;
    const clicked = periodFiltered.filter(e => e.clicked_at || e.click_count > 0).length;
    const bounced = periodFiltered.filter(e => e.bounced_at).length;
    const failed = periodFiltered.filter(e => e.failed_at).length;
    const complained = periodFiltered.filter(e => e.complained_at).length;
    const totalOpenEvents = periodFiltered.reduce((sum, e) => sum + (e.open_count || 0), 0);

    return {
      total, delivered, opened, clicked, bounced, failed, complained, totalOpenEvents,
      deliveryRate: total > 0 ? (delivered / total) * 100 : 0,
      openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
      clickRate: delivered > 0 ? (clicked / delivered) * 100 : 0,
      bounceRate: total > 0 ? (bounced / total) * 100 : 0,
      replyRate: delivered > 0 ? (replyCount / delivered) * 100 : 0,
    };
  }, [periodFiltered, replyCount]);

  const bySender = useMemo(() => {
    const groups: Record<string, { sent: number; delivered: number; opened: number; clicked: number; bounced: number }> = {};
    for (const e of periodFiltered) {
      const key = e.from_email || 'Unknown';
      if (!groups[key]) groups[key] = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 };
      groups[key].sent++;
      if (e.delivered_at) groups[key].delivered++;
      if (e.opened_at || e.open_count > 0) groups[key].opened++;
      if (e.clicked_at || e.click_count > 0) groups[key].clicked++;
      if (e.bounced_at) groups[key].bounced++;
    }
    return Object.entries(groups).map(([email, data]) => ({
      email, ...data,
      deliveryRate: data.sent > 0 ? (data.delivered / data.sent) * 100 : 0,
      openRate: data.delivered > 0 ? (data.opened / data.delivered) * 100 : 0,
      clickRate: data.delivered > 0 ? (data.clicked / data.delivered) * 100 : 0,
    })).sort((a, b) => b.sent - a.sent);
  }, [periodFiltered]);

  const trendData = useMemo(() => {
    const days: Record<string, { sent: number; delivered: number; opened: number }> = {};
    const now = new Date();
    const numDays = period === 'today' ? 1 : period === '7d' ? 7 : 30;
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().split('T')[0];
      days[key] = { sent: 0, delivered: 0, opened: 0 };
    }
    for (const e of periodFiltered) {
      const key = new Date(e.sent_at).toISOString().split('T')[0];
      if (days[key]) {
        days[key].sent++;
        if (e.delivered_at) days[key].delivered++;
        if (e.opened_at || e.open_count > 0) days[key].opened++;
      }
    }
    return Object.entries(days).map(([date, data]) => ({ date, ...data }));
  }, [periodFiltered, period]);

  const pct = (n: number) => `${n.toFixed(1)}%`;
  const fmt = (n: number) => n.toLocaleString();

  const statCards = [
    { title: 'Total Sent', value: fmt(metrics.total), icon: Send, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/20' },
    { title: 'Delivered', value: fmt(metrics.delivered), icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/20' },
    { title: 'Opens (Unique)', value: fmt(metrics.opened), icon: Eye, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/20' },
    { title: 'Total Open Events', value: fmt(metrics.totalOpenEvents), icon: TrendingUp, color: 'text-cyan-500', bg: 'bg-cyan-100 dark:bg-cyan-900/20' },
    { title: 'Clicked', value: fmt(metrics.clicked), icon: MousePointer, color: 'text-purple-500', bg: 'bg-purple-100 dark:bg-purple-900/20' },
    { title: 'Replies', value: fmt(replyCount), icon: MessageSquare, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/20' },
    { title: 'Bounced', value: fmt(metrics.bounced), icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-100 dark:bg-amber-900/20' },
    { title: 'Failed', value: fmt(metrics.failed), icon: AlertCircle, color: 'text-orange-500', bg: 'bg-orange-100 dark:bg-orange-900/20' },
  ];

  const rateCards = [
    { title: 'Delivery Rate', value: pct(metrics.deliveryRate), icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/20' },
    { title: 'Open Rate', value: pct(metrics.openRate), icon: Eye, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/20' },
    { title: 'Click Rate', value: pct(metrics.clickRate), icon: MousePointer, color: 'text-purple-500', bg: 'bg-purple-100 dark:bg-purple-900/20' },
    { title: 'Reply Rate', value: pct(metrics.replyRate), icon: MessageSquare, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/20' },
    { title: 'Bounce Rate', value: pct(metrics.bounceRate), icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/20' },
  ];

  if (isLoading) {
    return (
      <div className="p-8 bg-white dark:bg-gray-900 min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const maxTrendSent = Math.max(...trendData.map(d => d.sent), 1);

  // Instagram stat cards
  const igStatCards = [
    { title: 'Followers', value: fmt(combinedMetrics.totalFollowers), icon: Users, color: 'text-pink-500', bg: 'bg-pink-100 dark:bg-pink-900/20' },
    { title: 'Total Reach', value: fmt(combinedMetrics.totalReach), icon: Eye, color: 'text-cyan-500', bg: 'bg-cyan-100 dark:bg-cyan-900/20' },
    { title: 'Total Impressions', value: fmt(combinedMetrics.totalImpressions), icon: BarChart3, color: 'text-teal-500', bg: 'bg-teal-100 dark:bg-teal-900/20' },
    { title: 'Avg Engagement', value: pct(combinedMetrics.avgEngagement), icon: TrendingUp, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/20' },
  ];

  return (
    <div className="p-8 bg-white dark:bg-gray-900 min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Email Analytics Section */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Email Analytics</h1>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            {(['today', '7d', '30d'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  period === p
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {p === 'today' ? 'Today' : p === '7d' ? 'Last 7 days' : 'Last 30 days'}
              </button>
            ))}
          </div>
        </div>

        {/* Volume cards */}
        <div className="mb-2">
          <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Volume</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {statCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
                <div className={`inline-flex p-2 rounded-lg ${card.bg} mb-3`}>
                  <Icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">{card.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{card.title}</p>
              </div>
            );
          })}
        </div>

        {/* Rate cards */}
        <div className="mb-2">
          <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Rates</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {rateCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
                <div className={`inline-flex p-2 rounded-lg ${card.bg} mb-3`}>
                  <Icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">{card.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{card.title}</p>
              </div>
            );
          })}
        </div>

        {/* Trend chart */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Sending & Open Trend</h2>
          </div>
          {trendData.length > 0 ? (
            <div className="flex items-end gap-1 h-40">
              {trendData.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div className="w-full flex flex-col items-center justify-end h-full gap-0.5">
                    <div
                      className="w-full max-w-[24px] bg-blue-400 rounded-t transition-all hover:bg-blue-500"
                      style={{ height: `${(d.sent / maxTrendSent) * 70}%`, minHeight: d.sent > 0 ? '4px' : '0' }}
                      title={`Sent: ${d.sent}`}
                    />
                    <div
                      className="w-full max-w-[24px] bg-green-400 rounded-t transition-all hover:bg-green-500"
                      style={{ height: `${(d.delivered / maxTrendSent) * 50}%`, minHeight: d.delivered > 0 ? '4px' : '0' }}
                      title={`Delivered: ${d.delivered}`}
                    />
                    <div
                      className="w-full max-w-[24px] bg-cyan-400 rounded-t transition-all hover:bg-cyan-500"
                      style={{ height: `${(d.opened / maxTrendSent) * 30}%`, minHeight: d.opened > 0 ? '4px' : '0' }}
                      title={`Opened: ${d.opened}`}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400">
                    {new Date(d.date).toLocaleDateString([], { month: 'numeric', day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">No data for this period</p>
          )}
          <div className="flex items-center gap-4 mt-4 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-400 rounded" /> Sent</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-400 rounded" /> Delivered</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-cyan-400 rounded" /> Opened</span>
          </div>
        </div>

        {/* By sender breakdown */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden mb-10">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Performance by Sender</h2>
          </div>
          {bySender.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No data for this period</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="text-left px-6 py-3 font-medium text-gray-500 dark:text-gray-400">Sender</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Sent</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Delivered</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Delivery Rate</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Opened</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Open Rate</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Click Rate</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-500 dark:text-gray-400">Bounced</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {bySender.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-6 py-3 text-gray-900 dark:text-white font-medium">{row.email}</td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{fmt(row.sent)}</td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{fmt(row.delivered)}</td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{pct(row.deliveryRate)}</td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{fmt(row.opened)}</td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{pct(row.openRate)}</td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{pct(row.clickRate)}</td>
                      <td className="px-6 py-3 text-right text-gray-700 dark:text-gray-300">{fmt(row.bounced)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Instagram Analytics Section */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-8 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <InstagramIcon className="w-6 h-6 text-pink-600 dark:text-pink-400" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Instagram Analytics</h1>
            </div>

            {/* Account selector */}
            {igAccounts.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowIgDropdown(!showIgDropdown)}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  {selectedIgAccountId === 'all' ? 'All Accounts' : `@${igAccounts.find(a => a.id === selectedIgAccountId)?.username || 'unknown'}`}
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                {showIgDropdown && (
                  <div className="absolute right-0 z-10 mt-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
                    <button
                      onClick={() => { setSelectedIgAccountId('all'); setShowIgDropdown(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 ${selectedIgAccountId === 'all' ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400' : 'text-gray-700 dark:text-gray-300'}`}
                    >
                      All Accounts (combined)
                    </button>
                    {igAccounts.map(acct => (
                      <button
                        key={acct.id}
                        onClick={() => { setSelectedIgAccountId(acct.id); setShowIgDropdown(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 ${selectedIgAccountId === acct.id ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400' : 'text-gray-700 dark:text-gray-300'}`}
                      >
                        @{acct.username || 'unknown'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {igLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : igAccounts.length === 0 ? (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-12 text-center">
              <InstagramIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Instagram Accounts Connected</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">Connect an Instagram account in Settings to see analytics here.</p>
              <button
                onClick={() => navigateToApp('settings')}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg"
              >
                Go to Settings
              </button>
            </div>
          ) : filteredIgSnapshots.length === 0 ? (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-12 text-center">
              <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Instagram Data Yet</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">Sync your Instagram account to pull insights data.</p>
              <button
                onClick={() => navigateToApp('instagram', { tab: 'stats' })}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg"
              >
                Go to Instagram
              </button>
            </div>
          ) : (
            <>
              {/* Instagram stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {igStatCards.map((card, i) => {
                  const Icon = card.icon;
                  return (
                    <div key={i} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
                      <div className={`inline-flex p-2 rounded-lg ${card.bg} mb-3`}>
                        <Icon className={`w-5 h-5 ${card.color}`} />
                      </div>
                      <p className="text-2xl font-semibold text-gray-900 dark:text-white">{card.value}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{card.title}</p>
                    </div>
                  );
                })}
              </div>

              {/* Combined view: account comparison table */}
              {selectedIgAccountId === 'all' && latestPerAccount.length > 1 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden mb-6">
                  <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Account Comparison</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                          <th className="text-left px-6 py-3 font-medium text-gray-500 dark:text-gray-400">Account</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Followers</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Posts</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Reach</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Impressions</th>
                          <th className="text-right px-6 py-3 font-medium text-gray-500 dark:text-gray-400">Engagement</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {latestPerAccount.map((snap, i) => {
                          const acct = igAccounts.find(a => a.id === snap.account_id);
                          return (
                            <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                              <td className="px-6 py-3 text-gray-900 dark:text-white font-medium">@{acct?.username || 'unknown'}</td>
                              <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{fmt(snap.followers_count ?? 0)}</td>
                              <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{fmt(snap.media_count ?? 0)}</td>
                              <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{fmt(snap.account_reach ?? 0)}</td>
                              <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{fmt(snap.account_impressions ?? 0)}</td>
                              <td className="px-6 py-3 text-right text-gray-700 dark:text-gray-300">{pct(snap.engagement_rate ?? 0)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Recent posts performance */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Post Performance</h2>
                </div>
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {igPosts.slice(0, 10).map((post, i) => (
                    <div key={i} className="p-4">
                      <div className="flex items-start gap-3">
                        {post.thumbnail_url ? (
                          <img src={post.thumbnail_url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                            <ImageIcon className="w-5 h-5 text-gray-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-1">{post.caption || '(no caption)'}</p>
                            {selectedIgAccountId === 'all' && (
                              <span className="text-xs text-pink-500 flex-shrink-0">@{post.account_username}</span>
                            )}
                          </div>
                          {post.permalink && (
                            <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">View on Instagram</a>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                            <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {fmt(post.like_count ?? 0)}</span>
                            <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {fmt(post.comments_count ?? 0)}</span>
                            {post.reach != null && <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {fmt(post.reach)}</span>}
                            {post.impressions != null && <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" /> {fmt(post.impressions)}</span>}
                            {post.saved != null && <span className="flex items-center gap-1"><Bookmark className="w-3 h-3" /> {fmt(post.saved)}</span>}
                            {post.video_views != null && <span className="flex items-center gap-1"><Play className="w-3 h-3" /> {fmt(post.video_views)}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
