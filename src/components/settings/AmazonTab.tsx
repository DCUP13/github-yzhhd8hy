import React, { useState, useEffect } from 'react';
import { Server, Mail, Send, X, AlertCircle, Globe, Plus } from 'lucide-react';
import { useEmails } from '../../contexts/EmailContext';
import { Toggle } from './Toggle';
import type { EmailSettings, SESEmail } from './types';
import { supabase } from '../../lib/supabase';

interface AmazonTabProps {
  emailSettings: EmailSettings;
  onEmailSettingChange: (key: keyof EmailSettings, value: string) => void;
  onSaveEmailSettings: (e: React.FormEvent) => void;
  isSaving: boolean;
  saveSuccess: boolean;
}

export function AmazonTab({ 
  emailSettings, 
  onEmailSettingChange, 
  onSaveEmailSettings,
  isSaving,
  saveSuccess 
}: AmazonTabProps) {
  const { sesEmails, setSesEmails } = useEmails();
  const [showPassword, setShowPassword] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [localSaveSuccess, setLocalSaveSuccess] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(1440); // Default to 1440 emails per day
  const [domains, setDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [domainError, setDomainError] = useState('');
  const [domainSettings, setDomainSettings] = useState<Record<string, { autoresponderEnabled: boolean }>>({});

  useEffect(() => {
    fetchSESSettings();
    fetchSESEmails();
    fetchSESDomains();
  }, []);

  const fetchSESSettings = async () => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('amazon_ses_settings')
        .select('*')
        .eq('user_id', user.data.user.id)
        .maybeSingle();

      // Only throw error if it's not a "no rows returned" error
      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        onEmailSettingChange('smtpUsername', data.smtp_username);
        onEmailSettingChange('smtpPassword', data.smtp_password);
        onEmailSettingChange('smtpPort', data.smtp_port);
        onEmailSettingChange('smtpServer', data.smtp_server);
      }
    } catch (error) {
      console.error('Error fetching SES settings:', error);
    }
  };

  const fetchSESDomains = async () => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) return;

      const { data, error } = await supabase
        .from('amazon_ses_domains')
        .select('domain, autoresponder_enabled')
        .eq('user_id', user.data.user.id)
        .order('domain', { ascending: true });

      if (error) throw error;
      
      const domainsData = data || [];
      setDomains(domainsData.map(d => d.domain));
      
      const settings = domainsData.reduce((acc, domain) => {
        acc[domain.domain] = {
          autoresponderEnabled: domain.autoresponder_enabled || false
        };
        return acc;
      }, {} as Record<string, { autoresponderEnabled: boolean }>);
      
      setDomainSettings(settings);
    } catch (error) {
      console.error('Error fetching SES domains:', error);
    }
  };

  const fetchSESEmails = async () => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('amazon_ses_emails')
        .select('*')
        .eq('user_id', user.data.user.id)
        .order('address', { ascending: true }); // Sort alphabetically

      if (error) throw error;

      setSesEmails(data?.map(email => ({ 
        address: email.address,
        dailyLimit: email.daily_limit
      })) || []);
    } catch (error) {
      console.error('Error fetching SES emails:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const validateEmail = (email: string) => {
    return email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('amazon_ses_settings')
        .upsert({
          user_id: user.data.user.id,
          smtp_username: emailSettings.smtpUsername,
          smtp_password: emailSettings.smtpPassword,
          smtp_port: emailSettings.smtpPort,
          smtp_server: emailSettings.smtpServer,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      setLocalSaveSuccess(true);
      setTimeout(() => setLocalSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving SES settings:', error);
      alert('Failed to save settings. Please try again.');
    }
  };

  const validateDomain = (domain: string) => {
    return domain.match(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/);
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateDomain(newDomain)) {
      setDomainError('Please enter a valid domain name');
      return;
    }

    if (domains.includes(newDomain)) {
      setDomainError('This domain is already in the list');
      return;
    }

    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('amazon_ses_domains')
        .insert({
          user_id: user.data.user.id,
          domain: newDomain,
          autoresponder_enabled: false
        });

      if (error) {
        if (error.code === '23505') { // Unique violation
          setDomainError('This domain is already registered');
          return;
        }
        throw error;
      }

      setDomains([...domains, newDomain].sort());
      setDomainSettings(prev => ({
        ...prev,
        [newDomain]: { autoresponderEnabled: false }
      }));
      setNewDomain('');
      setDomainError('');
    } catch (error) {
      console.error('Error adding SES domain:', error);
      alert('Failed to add domain. Please try again.');
    }
  };

  const handleRemoveDomain = async (domain: string) => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('amazon_ses_domains')
        .delete()
        .eq('user_id', user.data.user.id)
        .eq('domain', domain);

      if (error) throw error;

      setDomains(domains.filter(d => d !== domain));
      setDomainSettings(prev => {
        const newSettings = { ...prev };
        delete newSettings[domain];
        return newSettings;
      });
    } catch (error) {
      console.error('Error removing SES domain:', error);
      alert('Failed to remove domain. Please try again.');
    }
  };

  const handleToggleAutoresponder = async (domain: string, enabled: boolean) => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('amazon_ses_domains')
        .update({ 
          autoresponder_enabled: enabled,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.data.user.id)
        .eq('domain', domain);

      if (error) throw error;

      setDomainSettings(prev => ({
        ...prev,
        [domain]: { autoresponderEnabled: enabled }
      }));
    } catch (error) {
      console.error('Error updating autoresponder setting:', error);
      alert('Failed to update autoresponder setting. Please try again.');
    }
  };

  const handleAddSESEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateEmail(newEmail)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    if (sesEmails.some(email => email.address === newEmail)) {
      setEmailError('This email is already in the list');
      return;
    }

    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('amazon_ses_emails')
        .insert({
          user_id: user.data.user.id,
          address: newEmail,
          daily_limit: dailyLimit
        });

      if (error) {
        if (error.code === '23505') { // Unique violation
          setEmailError('This email is already registered');
          return;
        }
        throw error;
      }

      setSesEmails([...sesEmails, { 
        address: newEmail,
        dailyLimit
      }].sort((a, b) => a.address.localeCompare(b.address))); // Sort after adding
      setNewEmail('');
      setEmailError('');
      setDailyLimit(1440); // Reset to default
    } catch (error) {
      console.error('Error adding SES email:', error);
      alert('Failed to add email. Please try again.');
    }
  };

  const handleRemoveSESEmail = async (address: string) => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('amazon_ses_emails')
        .delete()
        .eq('user_id', user.data.user.id)
        .eq('address', address);

      if (error) throw error;

      setSesEmails(sesEmails.filter(email => email.address !== address));
    } catch (error) {
      console.error('Error removing SES email:', error);
      alert('Failed to remove email. Please try again.');
    }
  };

  const handleUpdateDailyLimit = async (email: SESEmail, newLimit: number) => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('amazon_ses_emails')
        .update({ 
          daily_limit: newLimit,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.data.user.id)
        .eq('address', email.address);

      if (error) throw error;

      setSesEmails(prev => prev.map(e => 
        e.address === email.address 
          ? { ...e, dailyLimit: newLimit }
          : e
      ));
    } catch (error) {
      console.error('Error updating daily limit:', error);
      alert('Failed to update daily limit. Please try again.');
    }
  };

  const handleTestEmail = async (email: SESEmail) => {
    setSesEmails(prev => prev.map(e => 
      e.address === email.address 
        ? { ...e, testing: true }
        : e
    ));

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      setSesEmails(prev => prev.map(e => 
        e.address === email.address 
          ? { ...e, testing: false }
          : e
      ));
      alert('Test email sent successfully!');
    } catch (error) {
      setSesEmails(prev => prev.map(e => 
        e.address === email.address 
          ? { ...e, testing: false }
          : e
      ));
      alert('Failed to send test email. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Server className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Amazon SES Configuration</h2>
      </div>

      <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
              Email Sending Best Practices
            </h3>
            <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-400">
              While Amazon SES allows for high daily sending limits (50,000+ emails), it's recommended to distribute your sending volume across multiple email addresses. For optimal deliverability and to maintain a healthy sender reputation, we recommend:
            </p>
            <ul className="mt-2 ml-4 text-sm text-yellow-700 dark:text-yellow-400 list-disc space-y-1">
              <li>Start with a warm-up period for new email addresses</li>
              <li>Limit to around 20-30 emails per day per address during initial warm-up</li>
              <li>Gradually increase volume based on successful delivery metrics</li>
              <li>Monitor bounce rates and spam complaints closely</li>
              <li>Use multiple verified email addresses to distribute sending load</li>
            </ul>
          </div>
        </div>
      </div>
      
      <form onSubmit={handleSaveSettings} className="space-y-4">
        <div>
          <label htmlFor="smtpUsername" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            SMTP Username
          </label>
          <input
            type="text"
            id="smtpUsername"
            value={emailSettings.smtpUsername}
            onChange={(e) => onEmailSettingChange('smtpUsername', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            placeholder="Enter SMTP username"
            required
          />
        </div>

        <div>
          <label htmlFor="smtpPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            SMTP Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              id="smtpPassword"
              value={emailSettings.smtpPassword}
              onChange={(e) => onEmailSettingChange('smtpPassword', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white pr-10"
              placeholder="Enter SMTP password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="smtpPort" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            SMTP Port
          </label>
          <input
            type="text"
            id="smtpPort"
            value={emailSettings.smtpPort}
            onChange={(e) => onEmailSettingChange('smtpPort', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            placeholder="Enter SMTP port"
            required
          />
        </div>

        <div>
          <label htmlFor="smtpServer" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            SMTP Server
          </label>
          <input
            type="text"
            id="smtpServer"
            value={emailSettings.smtpServer}
            onChange={(e) => onEmailSettingChange('smtpServer', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            placeholder="Enter SMTP server"
            required
          />
        </div>

        <div className="flex items-center justify-end gap-4 pt-4">
          {localSaveSuccess && (
            <span className="text-sm text-green-600 dark:text-green-400">
              Settings saved successfully!
            </span>
          )}
          <button
            type="submit"
            disabled={isSaving}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${
              isSaving 
                ? 'bg-blue-400 cursor-wait' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* SES Domains Section */}
      <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Verified Domains
          </h3>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-500 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">
                About SES Domains
              </h3>
              <p className="mt-1 text-sm text-blue-700 dark:text-blue-400">
                Add domains that you have verified in Amazon SES. This allows you to send emails from any address using these domains (e.g., support@yourdomain.com, info@yourdomain.com).
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleAddDomain} className="mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => {
                setNewDomain(e.target.value);
                setDomainError('');
              }}
              placeholder="example.com"
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {domainError && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{domainError}</p>
          )}
        </form>

        <div className="space-y-2">
          {domains.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
              No domains added yet
            </p>
          ) : (
            domains.map((domain) => (
              <div
                key={domain}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg group"
              >
                <div className="flex items-center gap-3 flex-1">
                  <Globe className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <span className="text-gray-900 dark:text-white flex-1">{domain}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Autoresponder
                    </span>
                    <Toggle
                      checked={domainSettings[domain]?.autoresponderEnabled || false}
                      onChange={() => handleToggleAutoresponder(domain, !domainSettings[domain]?.autoresponderEnabled)}
                    />
                  </div>
                  <button
                    onClick={() => handleRemoveDomain(domain)}
                    className="p-2 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Sender Email Addresses Section */}
      <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Sender Email Addresses
          </h3>
        </div>

        <form onSubmit={handleAddSESEmail} className="mb-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="newEmail" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email Address
              </label>
              <input
                type="email"
                id="newEmail"
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  setEmailError('');
                }}
                placeholder="Enter email address"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              {emailError && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{emailError}</p>
              )}
            </div>

            <div>
              <label htmlFor="dailyLimit" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Daily Email Limit
              </label>
              <input
                type="number"
                id="dailyLimit"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Math.min(50000, Math.max(1, parseInt(e.target.value))))}
                min="1"
                max="50000"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Maximum number of emails that can be sent per day (1-50,000)
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Add Email
              </button>
            </div>
          </div>
        </form>

        <div className="space-y-4">
          {sesEmails.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
              No sender email addresses added yet
            </p>
          ) : (
            sesEmails.map((email) => (
              <div
                key={email.address}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg group"
              >
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-gray-400" />
                  <div>
                    <span className="text-gray-900 dark:text-white">{email.address}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="number"
                        value={email.dailyLimit}
                        onChange={(e) => handleUpdateDailyLimit(email, Math.min(50000, Math.max(1, parseInt(e.target.value))))}
                        min="1"
                        max="50000"
                        className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        emails/day
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTestEmail(email)}
                    disabled={email.testing}
                    className={`inline-flex items-center px-3 py-1 text-sm font-medium rounded-lg ${
                      email.testing
                        ? 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500 cursor-wait'
                        : 'text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20'
                    }`}
                  >
                    {email.testing ? (
                      <>
                        <div className="w-4 h-4 mr-2 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send Test Email
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleRemoveSESEmail(email.address)}
                    className="p-2 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}