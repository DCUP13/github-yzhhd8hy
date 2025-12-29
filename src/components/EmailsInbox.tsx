import React, { useState, useEffect } from 'react';
import { Mail, Paperclip, Search, RefreshCw, Clock, User, ArrowLeft, Reply, Send, Inbox, Inbox as Outbox, Plus, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ReplyDialog } from './ReplyDialog';
import { ComposeEmailDialog } from './ComposeEmailDialog';
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
}

interface OutboxEmail {
  id: string;
  to_email: string;
  from_email: string;
  subject: string;
  body: string;
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
  sent_at: string;
  created_at: string;
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
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('inbox');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showReplyDialog, setShowReplyDialog] = useState(false);
  const [isProcessingEmails, setIsProcessingEmails] = useState(false);
  const [showComposeDialog, setShowComposeDialog] = useState(false);
  const [isReplyAll, setIsReplyAll] = useState(false);

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
  };

  const fetchDraftEmails = async () => {
    const { data, error } = await supabase
      .from('email_drafts')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    setDraftEmails(data || []);
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
      console.log('Email processing result:', result);
      
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
    event.stopPropagation(); // Prevent row click from selecting email

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

      // Refresh the appropriate email list
      if (activeTab === 'inbox') {
        await fetchInboxEmails();
      } else if (activeTab === 'outbox') {
        await fetchOutboxEmails();
      } else if (activeTab === 'sent') {
        await fetchSentEmails();
      } else {
        await fetchDraftEmails();
      }

      // If the deleted email was selected, clear the selection
      if (selectedEmail?.id === emailId) {
        setSelectedEmail(null);
      }

      alert('Email deleted successfully');
    } catch (error) {
      console.error('Error deleting email replacethis:', error);
      alert('Failed to delete email. Please try again.');
    } finally {
      setIsLoading(false);
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

  const truncateText = (text: string, maxLength: number) => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  const hasAttachments = (attachments: any) => {
    return attachments && Array.isArray(attachments) && attachments.length > 0;
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

  if (isLoading) {
    return (
      <div className="p-8 bg-white dark:bg-gray-900 min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 bg-white dark:bg-gray-900 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {!selectedEmail ? (
          <>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Mail className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Emails</h1>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowComposeDialog(true)}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
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
                        ? 'bg-indigo-400 cursor-wait' 
                        : 'bg-indigo-600 hover:bg-indigo-700'
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
                        ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Inbox className="w-4 h-4" />
                      Inbox ({emails.length})
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab('outbox');
                      setSelectedEmail(null);
                    }}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'outbox'
                        ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
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
                        ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      Sent ({sentEmails.length})
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab('drafts');
                      setSelectedEmail(null);
                    }}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'drafts'
                        ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
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
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
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
                      onClick={() => setSelectedEmail(email)}
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
                            {activeTab === 'inbox' && hasAttachments((email as Email).attachments) && (
                              <Paperclip className="w-4 h-4 text-gray-400" />
                            )}
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
                        className="inline-flex items-center px-3 py-1 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                      >
                        <Reply className="w-4 h-4 mr-2" />
                        Reply
                      </button>
                      <button
                        onClick={() => {
                          setIsReplyAll(true);
                          setShowReplyDialog(true);
                        }}
                        className="inline-flex items-center px-3 py-1 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
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
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {selectedEmail.subject || '(No Subject)'}
                </h1>
                
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

                {activeTab === 'inbox' && hasAttachments((selectedEmail as Email).attachments) && (
                  <div className="flex items-center gap-2 text-sm">
                    <Paperclip className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-500 dark:text-gray-400">
                      {(selectedEmail as Email).attachments.length} attachment{(selectedEmail as Email).attachments.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6">
              <div className="prose dark:prose-invert max-w-none">
                <div className="whitespace-pre-wrap text-gray-900 dark:text-white">
                  {selectedEmail.body || 'No content available'}
                </div>
              </div>

              {activeTab === 'inbox' && hasAttachments((selectedEmail as Email).attachments) && (
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                    Attachments ({(selectedEmail as Email).attachments.length})
                  </h3>
                  <div className="space-y-2">
                    {(selectedEmail as Email).attachments.map((attachment: any, index: number) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
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
                              {formatFileSize(attachment.size)} • {attachment.contentType.split('/')[1].toUpperCase()}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDownloadAttachment(attachment)}
                          className="inline-flex items-center px-3 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                        >
                          Download
                        </button>
                      </div>
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
    </div>
  );
}