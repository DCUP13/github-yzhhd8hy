import React, { useState, useEffect, useRef } from 'react';
import { X, Send, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useEmails } from '../contexts/EmailContext';
import { RichTextEditor, type RichTextEditorRef } from '../features/templates/components/RichTextEditor';

interface Email {
  id: string;
  sender: string;
  receiver: string;
  subject: string;
  body: string;
  created_at: string;
}

interface ReplyDialogProps {
  originalEmail: Email;
  isReplyAll: boolean;
  onSend: (replyData: {
    to: string;
    from: string;
    subject: string;
    body: string;
  }) => void;
  onClose: () => void;
}

export function ReplyDialog({ originalEmail, isReplyAll, onSend, onClose }: ReplyDialogProps) {
  const { sesEmails, googleEmails, sesDomains } = useEmails();
  const editorRef = useRef<RichTextEditorRef>(null);
  
  // Form state
  const [fromEmail, setFromEmail] = useState('');
  const [toEmails, setToEmails] = useState<string[]>([]);
  const [newToEmail, setNewToEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [initialBody, setInitialBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [customFromEmail, setCustomFromEmail] = useState('');
  const [showCustomFrom, setShowCustomFrom] = useState(false);
  const [toEmailError, setToEmailError] = useState('');

  // Email options
  const configuredEmails = [
    ...sesEmails.map(email => ({ address: email.address, provider: 'Amazon SES' })),
    ...googleEmails.map(email => ({ address: email.address, provider: 'Gmail' }))
  ];

  const domainEmails = sesDomains.flatMap(domain => [
    { address: `info@${domain}`, provider: 'SES Domain', isDomain: true },
    { address: `support@${domain}`, provider: 'SES Domain', isDomain: true },
    { address: `noreply@${domain}`, provider: 'SES Domain', isDomain: true }
  ]);

  // Add the first recipient email to the options if it's not already there
  const firstRecipient = Array.isArray(originalEmail.receiver) 
    ? originalEmail.receiver[0]?.trim()
    : typeof originalEmail.receiver === 'string' 
      ? originalEmail.receiver.split(',')[0]?.trim()
      : '';

  const recipientEmailOption = firstRecipient ? [{ 
    address: firstRecipient, 
    provider: 'Recipient Email',
    isRecipient: true 
  }] : [];

  const allEmailOptions = [...recipientEmailOption, ...configuredEmails, ...domainEmails];

  // Initialize form data
  useEffect(() => {
    // Parse the receiver field to get the recipient email addresses
    const originalRecipients = Array.isArray(originalEmail.receiver) 
      ? originalEmail.receiver 
      : typeof originalEmail.receiver === 'string' 
        ? originalEmail.receiver.split(',').map(email => email.trim())
        : [];
    
    // Always use the first recipient email as the From address for both Reply and Reply All
    const firstRecipient = originalRecipients[0]?.trim();
    if (firstRecipient) {
      setFromEmail(firstRecipient);
    } else if (allEmailOptions.length > 0) {
      setFromEmail(allEmailOptions[0].address);
    }

    if (isReplyAll) {
      // Include sender and all original recipients
      const allRecipients = [originalEmail.sender];
      allRecipients.push(...originalRecipients);
      
      // Remove duplicates and exclude the first recipient (which is now the From address)
      const uniqueRecipients = [...new Set(allRecipients)].filter(email => 
        email.toLowerCase().trim() !== firstRecipient?.toLowerCase()
      );
      setToEmails(uniqueRecipients);
    } else {
      // Just reply to sender
      setToEmails([originalEmail.sender]);
    }
    
    const replySubject = originalEmail.subject?.startsWith('Re: ') 
      ? originalEmail.subject 
      : `Re: ${originalEmail.subject || '(No Subject)'}`;
    setSubject(replySubject);

    const originalDate = new Date(originalEmail.created_at).toLocaleString();
    const replyBody = `<br><br><br><br><br><br>--- Original Message ---<br><br>From: ${originalEmail.sender}<br><br>Date: ${originalDate}<br><br>Subject: ${originalEmail.subject || '(No Subject)'}<br><br>${originalEmail.body || ''}`;
    setInitialBody(replyBody);
  }, [originalEmail, isReplyAll, allEmailOptions.length]);

  // Email validation
  const validateEmail = (email: string) => {
    return email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  };

  // Handle adding email addresses
  const addToEmail = () => {
    const email = newToEmail.trim();
    
    if (!email) {
      setToEmailError('Please enter an email address');
      return;
    }
    
    if (!validateEmail(email)) {
      setToEmailError('Please enter a valid email address');
      return;
    }
    
    if (toEmails.includes(email)) {
      setToEmailError('This email is already in the list');
      return;
    }
    
    setToEmails([...toEmails, email]);
    setNewToEmail('');
    setToEmailError('');
  };

  const removeToEmail = (email: string) => {
    setToEmails(toEmails.filter(e => e !== email));
  };

  // Handle keyboard events
  const handleToEmailKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addToEmail();
    }
  };

  // Handle blur event to auto-add valid emails
  const handleToEmailBlur = () => {
    if (newToEmail.trim() && validateEmail(newToEmail.trim())) {
      addToEmail();
    }
  };

  // Handle from email selection
  const handleFromEmailChange = (value: string) => {
    if (value === 'custom') {
      setShowCustomFrom(true);
      setFromEmail('');
      setCustomFromEmail('');
    } else if (value.includes('custom@')) {
      setShowCustomFrom(true);
      const domain = value.split('@')[1];
      setCustomFromEmail(`@${domain}`);
      setFromEmail('');
    } else {
      setShowCustomFrom(false);
      setFromEmail(value);
      setCustomFromEmail('');
    }
  };

  // Handle form submission
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const body = editorRef.current?.getContent() || '';
    const finalFromEmail = showCustomFrom ? customFromEmail : fromEmail;
    
    if (!finalFromEmail || !body.trim() || toEmails.length === 0) {
      alert('Please select a sender email, add at least one recipient, and enter a message.');
      return;
    }

    if (showCustomFrom && !customFromEmail.includes('@')) {
      alert('Please enter a valid email address.');
      return;
    }

    setIsSending(true);
    
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        throw new Error('User not authenticated');
      }

      // Create a single email with multiple recipients (comma-separated)
      const { data: outboxEmail, error: outboxError } = await supabase
        .from('email_outbox')
        .insert({
          user_id: user.data.user.id,
          to_email: toEmails.join(', '), // Join all recipients with comma
          from_email: finalFromEmail,
          subject: subject.trim(),
          body: body.trim(),
          reply_to_id: originalEmail.id,
          status: 'pending'
        })
        .select()
        .single();

      if (outboxError) throw outboxError;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      // Send the single email with multiple recipients
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              emailId: outboxEmail.id
            })
          }
        );

        if (response.ok) {
          alert(`Reply sent successfully to ${toEmails.length} recipient${toEmails.length > 1 ? 's' : ''}!`);
        } else {
          alert('Email added to outbox but failed to send immediately. Check the outbox for details.');
        }
      } catch {
        alert('Email added to outbox but failed to send immediately. Check the outbox for details.');
      }
      
      onClose();
      
    } catch (error) {
      console.error('Error sending reply:', error);
      alert(`Failed to send reply: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSending(false);
    }
  };

  // Show error if no email options available
  if (allEmailOptions.length === 0) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 w-full max-w-md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Reply</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="text-center py-8">
            <div className="text-gray-500 dark:text-gray-400 mb-4">
              No sender email addresses configured
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Please configure Amazon SES or Gmail SMTP settings in the Settings page before sending emails.
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center p-4 z-50 overflow-y-auto">
      <div className="w-full max-w-5xl my-4 flex flex-col" style={{ maxHeight: 'calc(100vh - 2rem)' }}>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Reply</h3>
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 mt-1">
                <User className="w-4 h-4" />
                <span>Replying to: {originalEmail.sender}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Form */}
          <form onSubmit={handleSend} className="flex-1 flex flex-col">
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden flex-1 flex flex-col m-4">
              {/* Header Fields */}
              <div className="p-4 space-y-4 flex-shrink-0 bg-gray-50 dark:bg-gray-700/30">
                <div className="grid grid-cols-2 gap-4">
                  {/* From Field */}
                  <div>
                    <label htmlFor="fromEmail" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      From
                    </label>
                    {showCustomFrom ? (
                      <div className="flex gap-2">
                        <input
                          type="email"
                          value={customFromEmail}
                          onChange={(e) => setCustomFromEmail(e.target.value)}
                          placeholder="your-email@domain.com"
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setShowCustomFrom(false);
                            setCustomFromEmail('');
                            setFromEmail('');
                          }}
                          className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <select
                        id="fromEmail"
                        value={fromEmail}
                        onChange={(e) => handleFromEmailChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        required
                      >
                        <option value="">Select sender email</option>
                        {recipientEmailOption.map((email) => (
                          <option key={email.address} value={email.address}>
                            {email.address} ({email.provider})
                          </option>
                        ))}
                        {configuredEmails.map((email) => (
                          <option key={email.address} value={email.address}>
                            {email.address} ({email.provider})
                          </option>
                        ))}
                        {sesDomains.length > 0 && (
                          <optgroup label="SES Domains">
                            {domainEmails.map((email) => (
                              <option key={email.address} value={email.address}>
                                {email.address}
                              </option>
                            ))}
                            {sesDomains.map(domain => (
                              <option key={`custom@${domain}`} value={`custom@${domain}`}>
                                Custom address @{domain}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    )}
                  </div>
                  
                  {/* To Field */}
                  <div>
                    <label htmlFor="toEmails" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      To
                    </label>
                    <div className="min-h-[42px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 bg-white dark:bg-gray-700 flex flex-wrap items-center gap-1">
                      {toEmails.map((email, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-sm"
                        >
                          {email}
                          <button
                            type="button"
                            onClick={() => removeToEmail(email)}
                            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      <input
                        type="email"
                        value={newToEmail}
                        onChange={(e) => {
                          setNewToEmail(e.target.value);
                          setToEmailError('');
                        }}
                        onKeyPress={handleToEmailKeyPress}
                        onBlur={handleToEmailBlur}
                        placeholder={toEmails.length === 0 ? "Enter email addresses..." : ""}
                        className="flex-1 min-w-[200px] outline-none bg-transparent text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Press Enter to add more recipients
                    </p>
                    {toEmailError && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">{toEmailError}</p>
                    )}
                  </div>
                </div>

                {/* Subject Field */}
                <div>
                  <label htmlFor="subject" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Subject
                  </label>
                  <input
                    id="subject"
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Reply subject"
                  />
                </div>
              </div>

              {/* Message Body */}
              <div className="flex-1 p-4 flex flex-col min-h-0 border-t border-gray-300 dark:border-gray-600">
                <label htmlFor="body" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Message
                </label>
                <div className="flex-1 min-h-0">
                  <RichTextEditor
                    ref={editorRef}
                    content={initialBody}
                    className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-0"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 p-4 flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSending}
                className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white ${
                  isSending 
                    ? 'bg-blue-400 cursor-wait' 
                    : 'bg-blue-600 hover:bg-blue-700'
                } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
              >
                {isSending ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send Reply{toEmails.length > 1 ? ` (${toEmails.length})` : ''}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}