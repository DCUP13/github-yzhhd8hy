import React, { useState, createContext, useContext, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { AppPage } from './components/AppPage';
import { Sidebar } from './components/Sidebar';
import { Settings } from './components/Settings';
import { TemplatesPage } from './features/templates/TemplatesPage';
import { Addresses } from './components/Emails';
import { EmailsInbox } from './components/EmailsInbox';
import { Prompts } from './components/Prompts';
import { Contacts } from './components/Contacts';
import { Analytics } from './components/Analytics';
import { Instagram } from './components/Instagram';
import { EmailProvider } from './contexts/EmailContext';
import { supabase } from './lib/supabase';
import type { Template } from './features/templates/types';
import { DashboardProvider } from './contexts/DashboardContext';
import { HomePage } from './components/public/HomePage';
import { FeaturesPage } from './components/public/FeaturesPage';
import { AboutPage } from './components/public/AboutPage';
import { PricingPage } from './components/public/PricingPage';
import { ContactPage } from './components/public/ContactPage';
import { AuthPage } from './components/public/AuthPage';
import { PrivacyPolicy, TermsOfService, CookiePolicy, DataProcessingAgreement, RefundPolicy, AcceptableUsePolicy } from './components/public/LegalPages';

type View = 'home' | 'features' | 'about' | 'pricing' | 'contact' | 'login' | 'register' | 'dashboard' | 'app' | 'settings' | 'templates' | 'emails' | 'addresses' | 'prompts' | 'contacts' | 'analytics' | 'instagram' | 'privacy' | 'terms' | 'cookies' | 'dpa' | 'refund' | 'aup';

const PUBLIC_VIEWS: View[] = ['home', 'features', 'about', 'pricing', 'contact', 'login', 'register', 'privacy', 'terms', 'cookies', 'dpa', 'refund', 'aup'];
const APP_VIEWS: View[] = ['dashboard', 'app', 'settings', 'templates', 'emails', 'addresses', 'prompts', 'contacts', 'analytics', 'instagram'];

interface ThemeContextType {
  darkMode: boolean;
  toggleDarkMode: () => Promise<void>;
}

export const ThemeContext = createContext<ThemeContextType>({
  darkMode: false,
  toggleDarkMode: async () => {},
});

export const TemplatesContext = createContext<{
  templates: Template[];
  fetchTemplates: () => Promise<void>;
}>({
  templates: [],
  fetchTemplates: async () => {},
});

export default function App() {
  const [view, setView] = useState<View>('home');
  const [darkMode, setDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);

  const fetchUserSettings = async (userId?: string) => {
    try {
      let uid = userId;
      if (!uid) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        uid = session.user.id;
      }

      const { data, error } = await supabase
        .from('user_settings')
        .select('dark_mode')
        .eq('user_id', uid)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user settings:', error);
        return;
      }

      if (data && data.dark_mode !== null) {
        setDarkMode(data.dark_mode);
      }
    } catch (error) {
      console.error('Error fetching user settings:', error);
    }
  };

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        console.log('Initializing auth...');
        const { data: { session }, error } = await supabase.auth.getSession();

        if (!mounted) return;

        if (error) {
          console.error('Session error:', error);
          setView('home');
          setIsLoading(false);
          return;
        }

        if (session) {
          setView('dashboard');
          await fetchUserSettings(session.user.id);
        } else {
          setView('home');
        }

        setIsLoading(false);
      } catch (error) {
        console.error('Auth initialization failed:', error);
        if (mounted) {
          setView('login');
          setIsLoading(false);
        }
      }
    };

    const timeout = setTimeout(() => {
      if (mounted) {
        setView('home');
        setIsLoading(false);
      }
    }, 3000);

    initializeAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      // Ignore INITIAL_SESSION event to prevent double-firing
      if (event === 'INITIAL_SESSION') return;

      console.log('Auth state change:', event);

      if (event === 'SIGNED_IN' && session) {
        setView('dashboard');
        (async () => {
          try {
            await fetchUserSettings(session.user.id);
          } catch (error) {
            console.error('Auth state change error:', error);
          }
        })();
      } else if (event === 'SIGNED_OUT') {
        setView('home');
        setDarkMode(false);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      setTemplates(data.map(template => ({
        ...template,
        lastModified: template.updated_at
      })));
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  useEffect(() => {
    if (APP_VIEWS.includes(view)) {
      fetchTemplates();
    }
  }, [view]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = async () => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        throw new Error('User not authenticated');
      }

      const newDarkMode = !darkMode;

      const { error } = await supabase
        .from('user_settings')
        .update({
          dark_mode: newDarkMode,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.data.user.id);

      if (error) throw error;
      setDarkMode(newDarkMode);
    } catch (error) {
      console.error('Error updating dark mode:', error);
      alert('Failed to update dark mode setting. Please try again.');
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setView('home');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
      <TemplatesContext.Provider value={{ templates, fetchTemplates }}>
        <EmailProvider>
          <DashboardProvider>
            <>
              {APP_VIEWS.includes(view) ? (
                <div className="flex min-h-screen bg-white dark:bg-gray-900">
                  <div className="fixed inset-y-0 left-0 w-64">
                    <Sidebar
                      onSignOut={handleSignOut}
                      onHomeClick={() => setView('dashboard')}
                      onAppClick={() => setView('app')}
                      onSettingsClick={() => setView('settings')}
                      onTemplatesClick={() => setView('templates')}
                      onEmailsClick={() => setView('emails')}
                      onAddressesClick={() => setView('addresses')}
                      onPromptsClick={() => setView('prompts')}
                      onContactsClick={() => setView('contacts')}
                      onAnalyticsClick={() => setView('analytics')}
                      onInstagramClick={() => setView('instagram')}
                    />
                  </div>
                  <div className="flex-1 ml-64">
                    {view === 'dashboard' && (
                      <Dashboard onSignOut={handleSignOut} currentView={view} onNavigateAnalytics={() => setView('analytics')} />
                    )}
                    {view === 'app' && (
                      <AppPage onSignOut={handleSignOut} currentView={view} />
                    )}
                    {view === 'settings' && (
                      <Settings onSignOut={handleSignOut} currentView={view} />
                    )}
                    {view === 'templates' && (
                      <TemplatesPage onSignOut={handleSignOut} currentView={view} />
                    )}
                    {view === 'emails' && (
                      <EmailsInbox onSignOut={handleSignOut} currentView={view} />
                    )}
                    {view === 'addresses' && (
                      <Addresses onSignOut={handleSignOut} currentView={view} />
                    )}
                    {view === 'prompts' && (
                      <Prompts onSignOut={handleSignOut} currentView={view} />
                    )}
                    {view === 'contacts' && (
                      <Contacts onSignOut={handleSignOut} currentView={view} />
                    )}
                    {view === 'analytics' && (
                      <Analytics onSignOut={handleSignOut} currentView={view} />
                    )}
                    {view === 'instagram' && (
                      <Instagram onSignOut={handleSignOut} currentView={view} />
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {view === 'home' && <HomePage currentPage={view} onNavigate={(p) => setView(p as View)} />}
                  {view === 'features' && <FeaturesPage currentPage={view} onNavigate={(p) => setView(p as View)} />}
                  {view === 'about' && <AboutPage currentPage={view} onNavigate={(p) => setView(p as View)} />}
                  {view === 'pricing' && <PricingPage currentPage={view} onNavigate={(p) => setView(p as View)} />}
                  {view === 'contact' && <ContactPage currentPage={view} onNavigate={(p) => setView(p as View)} />}
                  {view === 'login' && <AuthPage mode="login" currentPage={view} onNavigate={(p) => setView(p as View)} />}
                  {view === 'register' && <AuthPage mode="register" currentPage={view} onNavigate={(p) => setView(p as View)} />}
                  {view === 'privacy' && <PrivacyPolicy currentPage={view} onNavigate={(p) => setView(p as View)} />}
                  {view === 'terms' && <TermsOfService currentPage={view} onNavigate={(p) => setView(p as View)} />}
                  {view === 'cookies' && <CookiePolicy currentPage={view} onNavigate={(p) => setView(p as View)} />}
                  {view === 'dpa' && <DataProcessingAgreement currentPage={view} onNavigate={(p) => setView(p as View)} />}
                  {view === 'refund' && <RefundPolicy currentPage={view} onNavigate={(p) => setView(p as View)} />}
                  {view === 'aup' && <AcceptableUsePolicy currentPage={view} onNavigate={(p) => setView(p as View)} />}
                </>
              )}
            </>
          </DashboardProvider>
        </EmailProvider>
      </TemplatesContext.Provider>
    </ThemeContext.Provider>
  );
}