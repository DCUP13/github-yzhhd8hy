import React, { createContext, useContext, useState, useEffect } from 'react';
import type { SESEmail } from '../components/settings/types';
import { supabase } from '../lib/supabase';

interface EmailContextType {
  sesEmails: SESEmail[];
  sesDomains: string[];
  setSesEmails: (emails: SESEmail[]) => void;
  setSesDomains: (domains: string[]) => void;
  refreshEmails: () => Promise<void>;
}

const EmailContext = createContext<EmailContextType | undefined>(undefined);

export function EmailProvider({ children }: { children: React.ReactNode }) {
  const [sesEmails, setSesEmails] = useState<SESEmail[]>([]);
  const [sesDomains, setSesDomains] = useState<string[]>([]);

  const fetchEmails = async () => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) return;

      const { data: sesData, error: sesError } = await supabase
        .from('amazon_ses_emails')
        .select('*')
        .eq('user_id', user.data.user.id)
        .order('address', { ascending: true });

      if (sesError) throw sesError;
      setSesEmails(sesData?.map(email => ({
        address: email.address,
        dailyLimit: email.daily_limit,
        sentEmails: email.sent_emails,
        isLocked: email.sent_emails >= email.daily_limit
      })) || []);

      const { data: domainsData, error: domainsError } = await supabase
        .from('amazon_ses_domains')
        .select('domain')
        .eq('user_id', user.data.user.id)
        .order('domain', { ascending: true });

      if (domainsError) throw domainsError;
      setSesDomains(domainsData?.map(d => d.domain) || []);
    } catch (error) {
      console.error('Error fetching emails:', error);
    }
  };

  useEffect(() => {
    fetchEmails();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        fetchEmails();
      } else if (event === 'SIGNED_OUT') {
        setSesEmails([]);
        setSesDomains([]);
      }
    });

    const sesSubscription = supabase
      .channel('amazon_ses_emails_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'amazon_ses_emails'
      }, () => {
        fetchEmails();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
      sesSubscription.unsubscribe();
    };
  }, []);

  const value = {
    sesEmails,
    sesDomains,
    setSesEmails,
    setSesDomains,
    refreshEmails: fetchEmails
  };

  return (
    <EmailContext.Provider value={value}>
      {children}
    </EmailContext.Provider>
  );
}

export function useEmails() {
  const context = useContext(EmailContext);
  if (context === undefined) {
    throw new Error('useEmails must be used within an EmailProvider');
  }
  return context;
}
