import React, { useState, useEffect, useRef } from 'react';
import { Mail, Paperclip, Search, RefreshCw, Clock, User, ArrowLeft, Reply, Send, Inbox, Inbox as Outbox, Plus, FileText, ChevronDown, Sparkles, MessageSquare, Eye, MousePointer, CheckCircle, AlertCircle, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ReplyDialog } from './ReplyDialog';
import { ComposeEmailDialog } from './ComposeEmailDialog';
import { AttachmentViewerDialog } from './AttachmentViewerDialog';
import { useEmails } from '../contexts/EmailContext';

interface EmailsInboxProps {
  onSignOut: () => void;
  currentView: string;
}

interface Email {
  id: string;
  sender: string;
  receiver: string[];
  subject: string;
  body: string;
  attachments: any;
  created_at: string;
  reply_to_sent_id?: string | null;
}

interface OutboxEmail {
  id: string;
  to_email: string;
  from_email: string;
  subject: string;
  body: string;
  attachments: any;
  status: 'pending' | 'sending' | 'failed';
  error_message?: string;
  created_at: string;
  updated_at: string;
}

interface SentEmail {
  id: string;
  to_email: string;
  from_email: string;
  subject: string;
  body: string;
  attachments: any;
  sent_at: string;
  created_at: string;
  reply_to_id?: string | null;
  delivery_status?: string;
  delivered_at?: string;
  opened_at?: string;
  clicked_at?: string;
  bounced_at?: string;
  open_count?: number;
  click_count?: number;
}

interface DraftEmail {
  id: string;
  to_email: string;
  from_email: string;
  subject: string;
  body: string;
  campaign_id?: string;
  attachments: any;
  created_at: string;
  updated_at: string;
}

interface EmailEvent {
  id: string;
  event_type: string;
  event_time: string;
  recipient: string;
}

type TabType = 'inbox' | 'outbox' | 'sent' | 'drafts';

const formatReceiverList = (receiver: string | string[]): string => {
  if (Array.isArray(receiver)) {
    return receiver.join(', ');
  }
  return receiver || '';
};

const getFirstReceiver = (receiver: string | string[]): string => {
  if (Array.isArray(receiver)) {
    return receiver[0] || '';
  }
  return receiver || '';
};

export function EmailsInbox({ onSignOut, currentView }: EmailsInboxProps) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [outboxEmails, setOutboxEmails] = useState<OutboxEmail[]>([]);
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);
  const [draftEmails, setDraftEmails] = useState<DraftEmail[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabType>('inbox');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showReplyDialog, setShowReplyDialog] = useState(false);
  const [isProcessingEmails, setIsProcessingEmails] = useState(false);
  const [showComposeDialog, setShowComposeDialog] = useState(false);
  const [isReplyAll, setIsReplyAll] = useState(false);
  const [showDraftsDropdown, setShowDraftsDropdown] = useState(false);
  const [isProcessingDrafts, setIsProcessingDrafts] = useState(false);
  const [isGeneratingDrafts, setIsGeneratingDrafts] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState<{ attachment: any; source: 'inbox' | 'template'; emailId?: string } | null>(null);
  const [replyCounts, setReplyCounts] = useState<Record<string, number>>({});
  const [sentEvents, setSentEvents] = useState<Record<string, EmailEvent[]>>({});
  const [selectedEmailReplies, setSelectedEmailReplies] = useState<Email[]>([]);
  const [selectedEmailEvents, setSelectedEmailEvents] = useState<EmailEvent[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAllEmails();
  }, []);

  useEffect(() => {
    if (activeTab === 'inbox') {
      fetchInboxEmails();
    } else if (activeTab === 'outbox') {
      fetchOutboxEmails();
    } else if (activeTab === 'sent') {
      fetchSentEmails();
    } else if (activeTab === 'drafts') {
      fetchDraftEmails();
    }
  }, [activeTab]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDraftsDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const fetchAllEmails = async () => {
    try {
      await Promise.all([
        fetchInboxEmails(),
        fetchOutboxEmails(),
        fetchSentEmails(),
        fetchDraftEmails()
      ]);
    } catch (error) {
      console.error('Error fetching emails:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchInboxEmails = async () => {
    const { data, error } = await supabase
      .from('emails')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    setEmails(data || []);
  };

  const fetchOutboxEmails = async () => {
    const { data, error } = await supabase
      .from('email_outbox')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    setOutboxEmails(data || []);
  };

  const fetchSentEmails = async () => {
    const { data, error } = await supabase
      .from('email_sent')
      .select('*')
      .order('sent_at', { ascending: false });
    if (error) throw error;
    setSentEmails(data || []);

    // Fetch reply counts: count inbox emails where reply_to_sent_id matches each sent email
    if (data && data.length > 0) {
      const sentIds = data.map(e => e.id);
      const { data: replies, error: replyError } = await supabase
        .from('emails')
        .select('reply_to_sent_id')
        .in('reply_to_sent_id', sentIds)
        .not('reply_to_sent_id', 'is', null);

      if (!replyError && replies) {
        const counts: Record<string, number> = {};
        for (const r of replies) {
          if (r.reply_to_sent_id) {
            counts[r.reply_to_sent_id] = (counts[r.reply_to_sent_id] || 0) + 1;
          }
        }
        setReplyCounts(counts);
      }
    }
  };

  const fetchDraftEmails = async () => {
    const { data, error } = await supabase
      .from('email_drafts')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    setDraftEmails(data || []);
  };

  const fetchSentEmailEvents = async (sentEmailId: string) => {
    const { data, error } = await supabase
      .from('email_events')
      .select('id, event_type, event_time, recipient')
      .eq('email_sent_id', sentEmailId)
      .order('event_time', { ascending: true });
    if (error) {
      console.error('Error fetching email events:', error);
      return [];
    }
    return data || [];
  };

  const fetchSentEmailReplies = async (sentEmailId: string) => {
    const { data, error } = await supabase
      .from('emails')
      .select('*')
      .eq('reply_to_sent_id', sentEmailId)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('Error fetching email replies:', error);
      return [];
    }
    return data || [];
  };

  const handleSelectEmail = async (email: any) => {
    setSelectedEmail(email);

    if (activeTab === 'sent') {
      const [events, replies] = await Promise.all([
        fetchSentEmailEvents(email.id),
        fetchSentEmailReplies(email.id),
      ]);
      setSelectedEmailEvents(events);
      setSelectedEmailReplies(replies);
    } else {
      setSelectedEmailEvents([]);
      setSelectedEmailReplies([]);
    }
  };

  const handleSendReply = async (replyData: {
    to: string;
    from: string;
    subject: string;
    body: string;
  }) => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('email_outbox')
        .insert({
          user_id: user.data.user.id,
          to_email: replyData.to,
          from_email: replyData.from,
          subject: replyData.subject,
          body: replyData.body,
          reply_to_id: selectedEmail?.id,
          status: 'pending'
        });

      if (error) throw error;

      setShowReplyDialog(false);
      alert('Reply added to outbox and will be sent shortly.');
      
      if (activeTab === 'outbox') {
        fetchAllEmails();
      }
    } catch (error) {
      console.error('Error sending reply:', error);
      alert('Failed to send reply. Please try again.');
    }
  };

  const handleProcessOutbox = async () => {
    setIsProcessingEmails(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('You must be logged in to process emails');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process emails');
      }

      const result = await response.json();
      
      await fetchAllEmails();
      
      if (result.processed > 0) {
        alert(`Processed ${result.processed} emails. Check the Sent tab for successful sends.`);
      } else {
        alert('No pending emails to process.');
      }
      
    } catch (error) {
      console.error('Error processing emails:', error);
      alert(`Failed to process emails: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessingEmails(false);
    }
  };

  const handleRefresh = () => {
    setIsLoading(true);
    fetchAllEmails();
  };

  const handleDeleteEmail = async (emailId: string, event: React.MouseEvent) => {
    event.stopPropagation();

    try {
      setIsLoading(true);
      let error;

      if (activeTab === 'inbox') {
        ({ error } = await supabase
          .from('emails')
          .delete()
          .eq('id', emailId));
      } else if (activeTab === 'outbox') {
        ({ error } = await supabase
          .from('email_outbox')
          .delete()
          .eq('id', emailId));
      } else if (activeTab === 'sent') {
        ({ error } = await supabase
          .from('email_sent')
          .delete()
          .eq('id', emailId));
      } else if (activeTab === 'drafts') {
        ({ error } = await supabase
          .from('email_drafts')
          .delete()
          .eq('id', emailId));
      }

      if (error) throw error;

      if (activeTab === 'inbox') {
        await fetchInboxEmails();
      } else if (activeTab === 'outbox') {
        await fetchOutboxEmails();
      } else if (activeTab === 'sent') {
        await fetchSentEmails();
      } else {
        await fetchDraftEmails();
      }

      if (selectedEmail?.id === emailId) {
        setSelectedEmail(null);
      }

      alert('Email deleted successfully');
    } catch (error) {
      console.error('Error deleting email:', error);
      alert('Failed to delete email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMoveAllDraftsToOutbox = async () => {
    if (draftEmails.length === 0) {
      alert('No drafts to move to outbox');
      return;
    }

    if (!confirm(`Are you sure you want to move all ${draftEmails.length} drafts to the outbox? They will be queued for sending.`)) {
      return;
    }

    setIsProcessingDrafts(true);
    setShowDraftsDropdown(false);

    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        throw new Error('User not authenticated');
      }

      const outboxEmails = draftEmails.map(draft => ({
        user_id: user.data.user.id,
        campaign_id: draft.campaign_id,
        to_email: draft.to_email,
        from_email: draft.from_email,
        subject: draft.subject,
        body: draft.body,
        attachments: draft.attachments,
        status: 'pending' as const,
      }));

      const { error: insertError } = await supabase
        .from('email_outbox')
        .insert(outboxEmails);

      if (insertError) throw insertError;

      const { error: deleteError } = await supabase
        .from('email_drafts')
        .delete()
        .eq('user_id', user.data.user.id);

      if (deleteError) throw deleteError;

      await fetchAllEmails();
    } catch (error) {
      console.error('Error moving drafts to outbox:', error);
      alert(`Failed to move drafts to outbox: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessingDrafts(false);
    }
  };

  const handleDeleteAllDrafts = async () => {
    if (draftEmails.length === 0) {
      alert('No drafts to delete');
      return;
    }

    const count = draftEmails.length;

    if (!confirm(`Are you sure you want to delete all ${count} drafts? This action cannot be undone.`)) {
      return;
    }

    setShowDraftsDropdown(false);
    setIsProcessingDrafts(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('You must be logged in to delete drafts');
      }

      const { error } = await supabase
        .from('email_drafts')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;

      setSelectedEmail(null);
      await fetchDraftEmails();
    } catch (error) {
      console.error('Error deleting all drafts:', error);
      alert(`Failed to delete drafts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessingDrafts(false);
    }
  };

  const handleGenerateDrafts = async () => {
    setIsGeneratingDrafts(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('You must be logged in to generate drafts');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-drafts`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: user.id,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate drafts');
      }

      const result = await response.json();

      await fetchDraftEmails();

      if (result.drafts_created > 0) {
        alert(`Successfully generated ${result.drafts_created} draft emails from your contacts and campaigns.`);
        setActiveTab('drafts');
      } else {
        alert(result.message || 'No drafts were created. Make sure you have campaigns with test mode enabled, templates, and contacts.');
      }

    } catch (error) {
      console.error('Error generating drafts:', error);
      alert(`Failed to generate drafts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGeneratingDrafts(false);
    }
  };

  const getFilteredEmails = () => {
    if (activeTab === 'inbox') {
      return emails.filter(email => {
        const receiverText = formatReceiverList(email.receiver);
        return email.sender.toLowerCase().includes(searchQuery.toLowerCase()) ||
               email.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
               receiverText.toLowerCase().includes(searchQuery.toLowerCase());
      });
    } else if (activeTab === 'outbox') {
      return outboxEmails.filter(email =>
        email.to_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        email.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        email.from_email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    } else if (activeTab === 'sent') {
      return sentEmails.filter(email =>
        email.to_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        email.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        email.from_email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    } else {
      return draftEmails.filter(email =>
        email.to_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        email.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        email.from_email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
  };

  const filteredEmails = getFilteredEmails();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const stripHtml = (html: string): string => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  };

  const truncateText = (text: string, maxLength: number) => {
    if (!text) return '';
    const plain = stripHtml(text);
    return plain.length > maxLength ? plain.substring(0, maxLength) + '...' : plain;
  };

  const hasAttachments = (attachments: any) => {
    if (!attachments) return false;
    if (typeof attachments === 'string') {
      try {
        const parsed = JSON.parse(attachments);
        return Array.isArray(parsed) && parsed.length > 0;
      } catch {
        return false;
      }
    }
    return Array.isArray(attachments) && attachments.length > 0;
  };

  const getAttachments = (attachments: any): any[] => {
    if (!attachments) return [];
    if (typeof attachments === 'string') {
      try {
        const parsed = JSON.parse(attachments);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return Array.isArray(attachments) ? attachments : [];
  };

  const getAttachmentIcon = (contentType: string) => {
    if (contentType.includes('pdf')) {
      return '📄';
    } else if (contentType.includes('word') || contentType.includes('document')) {
      return '📝';
    } else if (contentType.includes('image')) {
      return '🖼️';
    } else if (contentType.includes('excel') || contentType.includes('spreadsheet')) {
      return '📊';
    } else if (contentType.includes('text') || contentType.includes('plain')) {
      return '📃';
    } else if (contentType.includes('zip') || contentType.includes('compressed')) {
      return '🗜️';
    } else if (contentType.includes('video')) {
      return '🎥';
    } else if (contentType.includes('audio')) {
      return '🎵';
    } else if (contentType.includes('presentation') || contentType.includes('powerpoint')) {
      return '📊';
    } else {
      return '📎';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDownloadAttachment = async (attachment: any) => {
    try {
      if (!selectedEmail) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('You must be logged in to download attachments');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/download-attachment?s3_url=${encodeURIComponent(attachment.s3_url)}&email_id=${selectedEmail.id}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate download URL');
      }

      const { downloadUrl, filename } = await response.json();
      
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (error) {
      console.error('Error downloading attachment:', error);
      alert(`Failed to download attachment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Count total replies across all sent emails
  const totalReplyCount = Object.values(replyCounts).reduce((sum, count) => sum + count, 0);
  const inboxReplyCount = emails.filter(e => e.reply_to_sent_id).length;

  if (isLoading) {
    return (
      <div className="p-8 bg-white dark:bg-gray-900 min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Render event indicators for a sent email
  const renderEventIndicators = (email: SentEmail) => {
    const indicators: React.ReactNode[] = [];

    if (email.bounced_at) {
      indicators.push(
        <span key="bounced" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" title="Bounced">
          <AlertCircle className="w-3 h-3" />
        </span>
      );
    }

    if (email.delivered_at || email.delivery_status === 'delivered') {
      indicators.push(
        <span key="delivered" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" title="Delivered">
          <CheckCircle className="w-3 h-3" />
        </span>
      );
    }

    if (email.opened_at || (email.open_count ?? 0) > 0) {
      const openCount = email.open_count ?? 0;
      indicators.push(
        <span key="opened" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" title={`Opened ${openCount} time${openCount !== 1 ? 's' : ''}`}>
          <Eye className="w-3 h-3" />
          {openCount > 1 && <span>{openCount}</span>}
        </span>
      );
    }

    if (email.clicked_at || (email.click_count ?? 0) > 0) {
      const clickCount = email.click_count ?? 0;
      indicators.push(
        <span key="clicked" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" title={`Clicked ${clickCount} time${clickCount !== 1 ? 's' : ''}`}>
          <MousePointer className="w-3 h-3" />
          {clickCount > 1 && <span>{clickCount}</span>}
        </span>
      );
    }

    const replyCount = replyCounts[email.id] || 0;
    if (replyCount > 0) {
      indicators.push(
        <span key="replies" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" title={`${replyCount} repl${replyCount !== 1 ? 'ies' : 'y'}`}>
          <MessageSquare className="w-3 h-3" />
          {replyCount}
        </span>
      );
    }

    return indicators.length > 0 ? (
      <div className="flex items-center gap-1">{indicators}</div>
    ) : null;
  };

  // Render the event timeline for a selected sent email
  const renderEventTimeline = () => {
    if (selectedEmailEvents.length === 0) {
      return (
        <div className="text-sm text-gray-500 dark:text-gray-400 italic">
          No tracking events recorded yet for this email.
        </div>
      );
    }

    const eventConfig: Record<string, { icon: any; color: string; label: string }> = {
      delivery: { icon: CheckCircle, color: 'text-green-500', label: 'Delivered' },
      open: { icon: Eye, color: 'text-blue-500', label: 'Opened' },
      click: { icon: MousePointer, color: 'text-purple-500', label: 'Clicked' },
      bounce: { icon: AlertCircle, color: 'text-red-500', label: 'Bounced' },
      complaint: { icon: AlertCircle, color: 'text-orange-500', label: 'Complaint' },
      reply: { icon: MessageSquare, color: 'text-amber-500', label: 'Reply received' },
    };

    return (
      <div className="space-y-2">
        {selectedEmailEvents.map((event, index) => {
          const config = eventConfig[event.event_type] || { icon: Mail, color: 'text-gray-500', label: event.event_type };
          const Icon = config.icon;
          return (
            <div key={event.id} className="flex items-center gap-3">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full ${config.color} bg-opacity-10`}>
                <Icon className={`w-4 h-4 ${config.color}`} />
              </div>
              <div className="flex-1">
                <span className="text-sm text-gray-700 dark:text-gray-300">{config.label}</span>
                {event.recipient && (
                  <span className="text-xs text-gray-400 ml-2">{event.recipient}</span>
                )}
              </div>
              <span className="text-xs text-gray-400">
                {new Date(event.event_time).toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  // Render the reply thread for a selected sent email
  const renderReplyThread = () => {
    if (selectedEmailReplies.length === 0) return null;

    return (
      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-amber-500" />
          Replies ({selectedEmailReplies.length})
        </h3>
        <div className="space-y-3">
          {selectedEmailReplies.map((reply) => (
            <div key={reply.id} className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-100 dark:border-amber-800/30">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">{reply.sender}</span>
                <span className="text-xs text-gray-400">
                  {new Date(reply.created_at).toLocaleString()}
                </span>
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-300">
                {reply.body ? (
                  <div dangerouslySetInnerHTML={{ __html: reply.body }} />
                ) : (
                  <span className="italic text-gray-400">No content</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="p-8 bg-white dark:bg-gray-900 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {!selectedEmail ? (
          <>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Mail className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Emails</h1>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleGenerateDrafts}
                  disabled={isGeneratingDrafts}
                  className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white ${
                    isGeneratingDrafts
                      ? 'bg-green-400 cursor-wait'
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {isGeneratingDrafts ? (
                    <>
                      <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate Drafts
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowComposeDialog(true)}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New Email
                </button>
                <button
                  onClick={handleRefresh}
                  disabled={isProcessingEmails}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg shadow-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </button>
                {activeTab === 'outbox' && (
                  <button
                    onClick={handleProcessOutbox}
                    disabled={isProcessingEmails}
                    className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white ${
                      isProcessingEmails
                        ? 'bg-blue-400 cursor-wait'
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {isProcessingEmails ? (
                      <>
                        <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send Emails
                      </>
                    )}
                  </button>
                )}
                {activeTab === 'drafts' && (
                  <div className="relative" ref={dropdownRef}>
                    <button
                      onClick={() => setShowDraftsDropdown(!showDraftsDropdown)}
                      disabled={isProcessingDrafts}
                      className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white ${
                        isProcessingDrafts
                          ? 'bg-blue-400 cursor-wait'
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {isProcessingDrafts ? (
                        <>
                          <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          Actions
                          <ChevronDown className="w-4 h-4 ml-2" />
                        </>
                      )}
                    </button>
                    {showDraftsDropdown && !isProcessingDrafts && (
                      <div className="absolute right-0 mt-2 w-48 rounded-lg shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 z-10">
                        <div className="py-1">
                          <button
                            onClick={handleMoveAllDraftsToOutbox}
                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          >
                            <Send className="w-4 h-4 mr-2" />
                            Move to Outbox
                          </button>
                          <button
                            onClick={handleDeleteAllDrafts}
                            className="flex items-center w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            <Mail className="w-4 h-4 mr-2" />
                            Delete All
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="mb-6">
              <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="flex space-x-8">
                  <button
                    onClick={() => {
                      setActiveTab('inbox');
                      setSelectedEmail(null);
                    }}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'inbox'
                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Inbox className="w-4 h-4" />
                      Inbox ({emails.length})
                      {inboxReplyCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                          <MessageSquare className="w-3 h-3" />
                          {inboxReplyCount}
                        </span>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab('outbox');
                      setSelectedEmail(null);
                    }}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'outbox'
                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Send className="w-4 h-4" />
                      Outbox ({outboxEmails.length})
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab('sent');
                      setSelectedEmail(null);
                    }}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'sent'
                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      Sent ({sentEmails.length})
                      {totalReplyCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                          <MessageSquare className="w-3 h-3" />
                          {totalReplyCount}
                        </span>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab('drafts');
                      setSelectedEmail(null);
                    }}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'drafts'
                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Drafts ({draftEmails.length})
                    </div>
                  </button>
                </nav>
              </div>
            </div>

            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search emails..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
              {filteredEmails.length === 0 ? (
                <div className="text-center py-12">
                  <Mail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    {filteredEmails.length === 0 ? `No ${activeTab} emails yet` : 'No emails found'}
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400">
                    {filteredEmails.length === 0
                      ? `${activeTab === 'inbox' ? 'Received emails' : activeTab === 'outbox' ? 'Outgoing emails' : activeTab === 'sent' ? 'Sent emails' : 'Draft emails'} will appear here`
                      : 'Try adjusting your search criteria'
                    }
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredEmails.map((email) => (
                    <div
                      key={email.id}
                      onClick={() => handleSelectEmail(email)}
                      className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-gray-400" />
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {activeTab === 'inbox' ? (email as Email).sender :
                                 activeTab === 'outbox' ? (email as OutboxEmail).from_email :
                                 activeTab === 'sent' ? (email as SentEmail).from_email :
                                 (email as DraftEmail).from_email}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                              <span>to</span>
                              <span>
                                {activeTab === 'inbox' ? formatReceiverList((email as Email).receiver) :
                                 activeTab === 'outbox' ? (email as OutboxEmail).to_email :
                                 activeTab === 'sent' ? (email as SentEmail).to_email :
                                 (email as DraftEmail).to_email}
                              </span>
                            </div>
                            {activeTab === 'outbox' && (
                              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  (email as OutboxEmail).status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' :
                                  (email as OutboxEmail).status === 'sending' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' :
                                  'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                                }`}>
                                  {(email as OutboxEmail).status}
                                </span>
                              </div>
                            )}
                            {activeTab === 'drafts' && (
                              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                                  draft
                                </span>
                              </div>
                            )}
                            {((activeTab === 'inbox' && hasAttachments((email as Email).attachments)) ||
                              (activeTab === 'drafts' && hasAttachments((email as DraftEmail).attachments)) ||
                              (activeTab === 'outbox' && hasAttachments((email as OutboxEmail).attachments)) ||
                              (activeTab === 'sent' && hasAttachments((email as SentEmail).attachments))) && (
                              <Paperclip className="w-4 h-4 text-gray-400" />
                            )}
                            {activeTab === 'sent' && renderEventIndicators(email as SentEmail)}
                          </div>
                          <div className="mb-1">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {email.subject || '(No Subject)'}
                            </span>
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {truncateText(email.body, 100)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <Clock className="w-3 h-3" />
                            {formatDate(
                              activeTab === 'sent' ? (email as SentEmail).sent_at : email.created_at
                            )}
                          </div>
                          <button
                            onClick={(e) => handleDeleteEmail(email.id, e)}
                            className="inline-flex items-center px-2 py-1 text-xs font-medium text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setSelectedEmail(null)}
                  className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to {activeTab}
                </button>
                <div className="flex items-center gap-4">
                  {activeTab === 'inbox' && (
                    <>
                      <button
                        onClick={() => {
                          setIsReplyAll(false);
                          setShowReplyDialog(true);
                        }}
                        className="inline-flex items-center px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      >
                        <Reply className="w-4 h-4 mr-2" />
                        Reply
                      </button>
                      <button
                        onClick={() => {
                          setIsReplyAll(true);
                          setShowReplyDialog(true);
                        }}
                        className="inline-flex items-center px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      >
                        <Reply className="w-4 h-4 mr-2" />
                        Reply All
                      </button>
                    </>
                  )}
                  <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                    <Clock className="w-4 h-4" />
                    {new Date(
                      activeTab === 'sent' && 'sent_at' in selectedEmail 
                        ? (selectedEmail as any).sent_at 
                        : selectedEmail.created_at
                    ).toLocaleString()}
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {selectedEmail.subject || '(No Subject)'}
                  </h1>
                  {activeTab === 'sent' && renderEventIndicators(selectedEmail as SentEmail)}
                </div>
                
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 dark:text-gray-400">From:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {activeTab === 'inbox' ? (selectedEmail as Email).sender : 
                       'from_email' in selectedEmail ? (selectedEmail as any).from_email : 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 dark:text-gray-400">To:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {activeTab === 'inbox' ? formatReceiverList((selectedEmail as Email).receiver) : 
                       'to_email' in selectedEmail ? (selectedEmail as any).to_email : 'Unknown'}
                    </span>
                  </div>
                </div>

                {((activeTab === 'inbox' && hasAttachments((selectedEmail as Email).attachments)) ||
                  (activeTab === 'drafts' && hasAttachments((selectedEmail as DraftEmail).attachments)) ||
                  (activeTab === 'outbox' && hasAttachments((selectedEmail as OutboxEmail).attachments)) ||
                  (activeTab === 'sent' && hasAttachments((selectedEmail as SentEmail).attachments))) && (
                  <div className="flex items-center gap-2 text-sm">
                    <Paperclip className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-500 dark:text-gray-400">
                      {activeTab === 'inbox'
                        ? getAttachments((selectedEmail as Email).attachments).length
                        : activeTab === 'drafts'
                        ? getAttachments((selectedEmail as DraftEmail).attachments).length
                        : activeTab === 'outbox'
                        ? getAttachments((selectedEmail as OutboxEmail).attachments).length
                        : getAttachments((selectedEmail as SentEmail).attachments).length} attachment{
                        (activeTab === 'inbox'
                          ? getAttachments((selectedEmail as Email).attachments).length
                          : activeTab === 'drafts'
                          ? getAttachments((selectedEmail as DraftEmail).attachments).length
                          : activeTab === 'outbox'
                          ? getAttachments((selectedEmail as OutboxEmail).attachments).length
                          : getAttachments((selectedEmail as SentEmail).attachments).length) !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6">
              <div className="prose dark:prose-invert max-w-none">
                {selectedEmail.body ? (
                  <div
                    className="text-gray-900 dark:text-white"
                    dangerouslySetInnerHTML={{ __html: selectedEmail.body }}
                  />
                ) : (
                  <div className="text-gray-900 dark:text-white">No content available</div>
                )}
              </div>

              {/* Event timeline for sent emails */}
              {activeTab === 'sent' && (
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-500" />
                    Tracking Timeline
                  </h3>
                  {renderEventTimeline()}
                </div>
              )}

              {/* Reply thread for sent emails */}
              {activeTab === 'sent' && renderReplyThread()}

              {activeTab === 'inbox' && hasAttachments((selectedEmail as Email).attachments) && (
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                    Attachments ({getAttachments((selectedEmail as Email).attachments).length})
                  </h3>
                  <div className="space-y-2">
                    {getAttachments((selectedEmail as Email).attachments).map((attachment: any, index: number) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setViewingAttachment({ attachment, source: 'inbox', emailId: selectedEmail.id })}
                        className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-transparent hover:border-blue-200 dark:hover:border-blue-800 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">
                            {getAttachmentIcon(attachment.contentType)}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {attachment.filename}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {formatFileSize(attachment.size)} • {attachment.contentType.split('/')[1]?.toUpperCase() || attachment.contentType.toUpperCase()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-blue-600 dark:text-blue-400">View</span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); handleDownloadAttachment(attachment); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); handleDownloadAttachment(attachment); } }}
                            className="inline-flex items-center px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                          >
                            Download
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'drafts' && hasAttachments((selectedEmail as DraftEmail).attachments) && (
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                    Attachments ({getAttachments((selectedEmail as DraftEmail).attachments).length})
                  </h3>
                  <div className="space-y-2">
                    {getAttachments((selectedEmail as DraftEmail).attachments).map((attachment: any, index: number) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setViewingAttachment({ attachment, source: 'template' })}
                        className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-transparent hover:border-blue-200 dark:hover:border-blue-800 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">
                            {attachment.format === 'docx' ? 'DOC' : attachment.format === 'pdf' ? 'PDF' : 'FILE'}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {attachment.name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {attachment.format?.toUpperCase()} • {(attachment.content?.length || 0) > 0 ? 'Content included' : 'Empty'}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-medium text-blue-600 dark:text-blue-400">View</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'outbox' && hasAttachments((selectedEmail as OutboxEmail).attachments) && (
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                    Attachments ({getAttachments((selectedEmail as OutboxEmail).attachments).length})
                  </h3>
                  <div className="space-y-2">
                    {getAttachments((selectedEmail as OutboxEmail).attachments).map((attachment: any, index: number) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setViewingAttachment({ attachment, source: 'template' })}
                        className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-transparent hover:border-blue-200 dark:hover:border-blue-800 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">
                            {attachment.format === 'docx' ? 'DOC' : attachment.format === 'pdf' ? 'PDF' : 'FILE'}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {attachment.name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {attachment.format?.toUpperCase()} • {(attachment.content?.length || 0) > 0 ? 'Content included' : 'Empty'}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-medium text-blue-600 dark:text-blue-400">View</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'sent' && hasAttachments((selectedEmail as SentEmail).attachments) && (
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                    Attachments ({getAttachments((selectedEmail as SentEmail).attachments).length})
                  </h3>
                  <div className="space-y-2">
                    {getAttachments((selectedEmail as SentEmail).attachments).map((attachment: any, index: number) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setViewingAttachment({ attachment, source: 'template' })}
                        className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-transparent hover:border-blue-200 dark:hover:border-blue-800 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">
                            {attachment.format === 'docx' ? 'DOC' : attachment.format === 'pdf' ? 'PDF' : 'FILE'}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {attachment.name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {attachment.format?.toUpperCase()} • {(attachment.content?.length || 0) > 0 ? 'Content included' : 'Empty'}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-medium text-blue-600 dark:text-blue-400">View</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {showReplyDialog && selectedEmail && (
          <ReplyDialog
            originalEmail={selectedEmail as Email}
            isReplyAll={isReplyAll}
            onSend={handleSendReply}
            onClose={() => {
              setShowReplyDialog(false);
              setIsReplyAll(false);
            }}
          />
        )}
      </div>

      {showComposeDialog && (
        <ComposeEmailDialog
          onClose={() => setShowComposeDialog(false)}
          onSend={() => {
            fetchAllEmails();
          }}
        />
      )}

      {viewingAttachment && (
        <AttachmentViewerDialog
          attachment={viewingAttachment.attachment}
          source={viewingAttachment.source}
          emailId={viewingAttachment.emailId}
          onClose={() => setViewingAttachment(null)}
        />
      )}
    </div>
  );
}
