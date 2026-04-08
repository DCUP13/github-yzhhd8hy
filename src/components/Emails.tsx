import React from 'react';
import { Mail, AlertCircle, Server, Lock, RotateCcw } from 'lucide-react';
import { useEmails } from '../contexts/EmailContext';
import { supabase } from '../lib/supabase';

interface EmailsProps {
  onSignOut: () => void;
  currentView: string;
}

export interface EmailEntry {
  address: string;
  smtpProvider?: 'amazon' | 'gmail';
  dailyLimit?: number;
  sentEmails?: number;
  isLocked?: boolean;
}

export function Addresses({ onSignOut, currentView }: EmailsProps) {
  const { sesEmails, googleEmails, refreshEmails } = useEmails();
  
  // Combine and sort emails alphabetically by address
  const allEmails = [...sesEmails.map(email => ({ 
    ...email, 
    type: 'ses' as const, 
    id: `ses-${email.address}`,
    smtpProvider: 'amazon' as const
  })),
  ...googleEmails.map(email => ({ 
    ...email, 
    type: 'gmail' as const, 
    id: `gmail-${email.address}`,
    smtpProvider: 'gmail' as const
  }))].sort((a, b) => a.address.localeCompare(b.address));

  const handleResetSentEmails = async (email: typeof allEmails[0]) => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        throw new Error('User not authenticated');
      }

      const table = email.type === 'ses' ? 'amazon_ses_emails' : 'google_smtp_emails';
      const { error } = await supabase
        .from(table)
        .update({ 
          sent_emails: 0,
          is_locked: false,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.data.user.id)
        .eq('address', email.address);

      if (error) throw error;

      await refreshEmails();
    } catch (error) {
      console.error('Error resetting sent emails:', error);
      alert('Failed to reset sent emails count. Please try again.');
    }
  };

  if (allEmails.length === 0) {
    return (
      <div className="p-8 bg-white dark:bg-gray-900 min-h-screen">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Mail className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Email Addresses</h1>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                  No Email Addresses Configured
                </h3>
                <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-400">
                  You haven't added any email addresses yet. Go to Settings to configure your Amazon SES or Gmail SMTP sender emails.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-white dark:bg-gray-900 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Mail className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Email Addresses</h1>
        </div>

        <div className="space-y-6">
          {allEmails.map((email) => {
            const limit = email.dailyLimit || (email.type === 'ses' ? 50000 : 500);
            const sentEmails = email.sentEmails || 0;
            const remaining = limit - sentEmails;
            const usagePercentage = (sentEmails / limit) * 100;
            const isLocked = email.isLocked || sentEmails >= limit;

            return (
              <div
                key={email.id}
                className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 ${
                  isLocked ? 'border-2 border-yellow-400 dark:border-yellow-500' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {email.type === 'ses' ? (
                      <Server className="w-5 h-5 text-orange-500" />
                    ) : (
                      <Mail className="w-5 h-5 text-red-500" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                          {email.address}
                        </h3>
                        {isLocked && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300 rounded-full">
                            <Lock className="w-3 h-3" />
                            Locked
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {email.type === 'ses' ? 'Amazon SES' : 'Gmail SMTP'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleResetSentEmails(email)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                        title="Reset sent emails count"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reset Count
                      </button>
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {remaining.toLocaleString()} emails remaining
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {sentEmails.toLocaleString()} sent today
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      of {limit.toLocaleString()} daily limit
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="relative w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className={`absolute left-0 top-0 h-full rounded-full ${
                        isLocked
                          ? 'bg-yellow-500'
                          : usagePercentage > 90
                          ? 'bg-red-500'
                          : usagePercentage > 75
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                      }`}
                      style={{ width: `${usagePercentage}%` }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>{sentEmails.toLocaleString()} sent</span>
                    <span>{remaining.toLocaleString()} remaining</span>
                  </div>
                </div>

                {isLocked && (
                  <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-500 mt-0.5" />
                      <p className="text-sm text-yellow-700 dark:text-yellow-400">
                        This email has reached its daily sending limit. Click the "Reset Count" button above to manually reset the counter, or wait until midnight UTC for automatic reset.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}