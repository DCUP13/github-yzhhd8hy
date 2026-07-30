import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface DashboardStats {
  totalEmailsRemaining: number;
  totalEmailAccounts: number;
  totalEmailsSentToday: number;
  totalTemplates: number;
  totalCampaigns: number;
  totalDomains: number;
}

export interface EmailAnalytics {
  totalSent: number;
  totalDelivered: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
  totalReplies: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
  uniqueOpens: number;
  totalOpenEvents: number;
  lastOpenTime: string | null;
  lastClickTime: string | null;
  lastReplyTime: string | null;
  failedCount: number;
  complainedCount: number;
}

interface DashboardContextType {
  stats: DashboardStats;
  emailAnalytics: EmailAnalytics | null;
  refreshStats: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}

const emptyAnalytics: EmailAnalytics = {
  totalSent: 0,
  totalDelivered: 0,
  totalOpened: 0,
  totalClicked: 0,
  totalBounced: 0,
  totalReplies: 0,
  deliveryRate: 0,
  openRate: 0,
  clickRate: 0,
  replyRate: 0,
  bounceRate: 0,
  uniqueOpens: 0,
  totalOpenEvents: 0,
  lastOpenTime: null,
  lastClickTime: null,
  lastReplyTime: null,
  failedCount: 0,
  complainedCount: 0,
};

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [stats, setStats] = useState<DashboardStats>({
    totalEmailsRemaining: 0,
    totalEmailAccounts: 0,
    totalEmailsSentToday: 0,
    totalTemplates: 0,
    totalCampaigns: 0,
    totalDomains: 0
  });
  const [emailAnalytics, setEmailAnalytics] = useState<EmailAnalytics | null>(null);

  const fetchStats = async () => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) return;

      const { data, error } = await supabase
        .from('dashboard_statistics')
        .select('*')
        .eq('user_id', user.data.user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setStats({
          totalEmailsRemaining: data.total_emails_remaining,
          totalEmailAccounts: data.total_email_accounts,
          totalEmailsSentToday: data.total_emails_sent_today,
          totalTemplates: data.total_templates,
          totalCampaigns: data.total_campaigns,
          totalDomains: data.total_domains || 0
        });
      }
    } catch (error) {
      console.error('Error fetching dashboard statistics:', error);
    }
  };

  const fetchEmailAnalytics = async () => {
    try {
      const { data: sentEmails, error } = await supabase
        .from('email_sent')
        .select('id, delivered_at, opened_at, clicked_at, bounced_at, open_count, click_count, failed_at, complained_at');

      if (error) throw error;

      if (!sentEmails || sentEmails.length === 0) {
        setEmailAnalytics(emptyAnalytics);
        return;
      }

      const totalSent = sentEmails.length;
      const totalDelivered = sentEmails.filter(e => e.delivered_at || (e as any).delivery_status === 'delivered').length;
      const totalOpened = sentEmails.filter(e => e.opened_at || (e.open_count ?? 0) > 0).length;
      const totalClicked = sentEmails.filter(e => e.clicked_at || (e.click_count ?? 0) > 0).length;
      const totalBounced = sentEmails.filter(e => e.bounced_at).length;
      const failedCount = sentEmails.filter(e => (e as any).failed_at).length;
      const complainedCount = sentEmails.filter(e => (e as any).complained_at).length;
      const totalOpenEvents = sentEmails.reduce((sum, e) => sum + (e.open_count ?? 0), 0);

      // Fetch reply counts
      const sentIds = sentEmails.map(e => e.id);
      const { count: replyCount } = await supabase
        .from('emails')
        .select('id', { count: 'exact', head: true })
        .in('reply_to_sent_id', sentIds);

      const totalReplies = replyCount ?? 0;

      // Get latest event times from email_events
      const { data: recentOpens } = await supabase
        .from('email_events')
        .select('event_time')
        .eq('event_type', 'open')
        .order('event_time', { ascending: false })
        .limit(1);

      const { data: recentClicks } = await supabase
        .from('email_events')
        .select('event_time')
        .eq('event_type', 'click')
        .order('event_time', { ascending: false })
        .limit(1);

      const { data: recentReplies } = await supabase
        .from('emails')
        .select('created_at')
        .in('reply_to_sent_id', sentIds)
        .order('created_at', { ascending: false })
        .limit(1);

      setEmailAnalytics({
        totalSent,
        totalDelivered,
        totalOpened,
        totalClicked,
        totalBounced,
        totalReplies,
        deliveryRate: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0,
        openRate: totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0,
        clickRate: totalDelivered > 0 ? (totalClicked / totalDelivered) * 100 : 0,
        replyRate: totalDelivered > 0 ? (totalReplies / totalDelivered) * 100 : 0,
        bounceRate: totalSent > 0 ? (totalBounced / totalSent) * 100 : 0,
        uniqueOpens: totalOpened,
        totalOpenEvents,
        lastOpenTime: recentOpens?.[0]?.event_time ?? null,
        lastClickTime: recentClicks?.[0]?.event_time ?? null,
        lastReplyTime: recentReplies?.[0]?.created_at ?? null,
        failedCount,
        complainedCount,
      });
    } catch (error) {
      console.error('Error fetching email analytics:', error);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchEmailAnalytics();

    const channel = supabase.channel('dashboard_stats')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dashboard_statistics'
        },
        (payload) => {
          if (payload.new) {
            setStats({
              totalEmailsRemaining: payload.new.total_emails_remaining,
              totalEmailAccounts: payload.new.total_email_accounts,
              totalEmailsSentToday: payload.new.total_emails_sent_today,
              totalTemplates: payload.new.total_templates,
              totalCampaigns: payload.new.total_campaigns,
            totalDomains: payload.new.total_domains ?? 0
            });
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  const value = {
    stats,
    emailAnalytics,
    refreshStats: async () => {
      await fetchStats();
      await fetchEmailAnalytics();
    }
  };

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}
