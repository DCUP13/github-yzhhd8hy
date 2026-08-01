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
import { useRouter, type PublicRoute } from './lib/router';
import { HomePage } from './components/public/HomePage';
import { FeaturesPage } from './components/public/FeaturesPage';
import { AboutPage } from './components/public/AboutPage';
import { PricingPage } from './components/public/PricingPage';
import { QuizPage } from './components/public/QuizPage';
import { SecurityPage } from './components/public/SecurityPage';
import { ContactPage } from './components/public/ContactPage';
import { AuthPage } from './components/public/AuthPage';
import { PrivacyPolicy, TermsOfService, CookiePolicy, DataProcessingAgreement, RefundPolicy, AcceptableUsePolicy, AccessibilityADA } from './components/public/LegalPages';

type AppView = 'dashboard' | 'app' | 'settings' | 'templates' | 'emails' | 'addresses' | 'prompts' | 'contacts' | 'analytics' | 'instagram';

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
  const { route: publicRoute, navigate } = useRouter();
  const [appView, setAppView] = useState<AppView | null>(null);
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
        const { data: { session }, error } = await supabase.auth.getSession();

        if (!mounted) return;

        if (error) {
          console.error('Session error:', error);
          setIsLoading(false);
          return;
        }

        if (session) {
          setAppView('dashboard');
          await fetchUserSettings(session.user.id);
        }

        setIsLoading(false);
      } catch (error) {
        console.error('Auth initialization failed:', error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    const timeout = setTimeout(() => {
      if (mounted) {
        setIsLoading(false);
      }
    }, 3000);

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'INITIAL_SESSION') return;

      if (event === 'SIGNED_IN' && session) {
        setAppView('dashboard');
        (async () => {
          try {
            await fetchUserSettings(session.user.id);
          } catch (error) {
            console.error('Auth state change error:', error);
          }
        })();
      } else if (event === 'SIGNED_OUT') {
        setAppView(null);
        setDarkMode(false);
        navigate('home');
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
    if (appView) {
      fetchTemplates();
    }
  }, [appView]);

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
    setAppView(null);
    navigate('home');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-om-cream flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-om-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Signed-in app
  if (appView) {
    return (
      <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
        <TemplatesContext.Provider value={{ templates, fetchTemplates }}>
          <EmailProvider>
            <DashboardProvider>
              <div className="flex min-h-screen bg-white dark:bg-gray-900">
                <div className="fixed inset-y-0 left-0 w-64">
                  <Sidebar
                    onSignOut={handleSignOut}
                    onHomeClick={() => setAppView('dashboard')}
                    onAppClick={() => setAppView('app')}
                    onSettingsClick={() => setAppView('settings')}
                    onTemplatesClick={() => setAppView('templates')}
                    onEmailsClick={() => setAppView('emails')}
                    onAddressesClick={() => setAppView('addresses')}
                    onPromptsClick={() => setAppView('prompts')}
                    onContactsClick={() => setAppView('contacts')}
                    onAnalyticsClick={() => setAppView('analytics')}
                    onInstagramClick={() => setAppView('instagram')}
                  />
                </div>
                <div className="flex-1 ml-64">
                  {appView === 'dashboard' && (
                    <Dashboard onSignOut={handleSignOut} currentView={appView} onNavigateAnalytics={() => setAppView('analytics')} />
                  )}
                  {appView === 'app' && (
                    <AppPage onSignOut={handleSignOut} currentView={appView} />
                  )}
                  {appView === 'settings' && (
                    <Settings onSignOut={handleSignOut} currentView={appView} />
                  )}
                  {appView === 'templates' && (
                    <TemplatesPage onSignOut={handleSignOut} currentView={appView} />
                  )}
                  {appView === 'emails' && (
                    <EmailsInbox onSignOut={handleSignOut} currentView={appView} />
                  )}
                  {appView === 'addresses' && (
                    <Addresses onSignOut={handleSignOut} currentView={appView} />
                  )}
                  {appView === 'prompts' && (
                    <Prompts onSignOut={handleSignOut} currentView={appView} />
                  )}
                  {appView === 'contacts' && (
                    <Contacts onSignOut={handleSignOut} currentView={appView} />
                  )}
                  {appView === 'analytics' && (
                    <Analytics onSignOut={handleSignOut} currentView={appView} />
                  )}
                  {appView === 'instagram' && (
                    <Instagram onSignOut={handleSignOut} currentView={appView} />
                  )}
                </div>
              </div>
            </DashboardProvider>
          </EmailProvider>
        </TemplatesContext.Provider>
      </ThemeContext.Provider>
    );
  }

  // Public marketing site with URL routing
  const renderPublicPage = () => {
    switch (publicRoute) {
      case 'home': return <HomePage currentRoute={publicRoute} onNavigate={navigate} />;
      case 'features': return <FeaturesPage currentRoute={publicRoute} onNavigate={navigate} />;
      case 'pricing': return <PricingPage currentRoute={publicRoute} onNavigate={navigate} />;
      case 'quiz': return <QuizPage currentRoute={publicRoute} onNavigate={navigate} />;
      case 'about': return <AboutPage currentRoute={publicRoute} onNavigate={navigate} />;
      case 'security': return <SecurityPage currentRoute={publicRoute} onNavigate={navigate} />;
      case 'contact': return <ContactPage currentRoute={publicRoute} onNavigate={navigate} />;
      case 'login': return <AuthPage mode="login" currentRoute={publicRoute} onNavigate={navigate} />;
      case 'register': return <AuthPage mode="register" currentRoute={publicRoute} onNavigate={navigate} />;
      case 'privacy': return <PrivacyPolicy currentRoute={publicRoute} onNavigate={navigate} />;
      case 'terms': return <TermsOfService currentRoute={publicRoute} onNavigate={navigate} />;
      case 'cookies': return <CookiePolicy currentRoute={publicRoute} onNavigate={navigate} />;
      case 'ada': return <AccessibilityADA currentRoute={publicRoute} onNavigate={navigate} />;
      default: return <HomePage currentRoute={publicRoute} onNavigate={navigate} />;
    }
  };

  return renderPublicPage();
}
