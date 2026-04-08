import React, { useState, createContext, useContext, useEffect } from 'react';
import { Login } from './components/Login';
import { Register } from './components/Register';
import { Dashboard } from './components/Dashboard';
import { AppPage } from './components/AppPage';
import { Sidebar } from './components/Sidebar';
import { Settings } from './components/Settings';
import { TemplatesPage } from './features/templates/TemplatesPage';
import { Addresses } from './components/Emails';
import { EmailsInbox } from './components/EmailsInbox';
import { Prompts } from './components/Prompts';
import { Contacts } from './components/Contacts';
import { EmailProvider } from './contexts/EmailContext';
import { supabase } from './lib/supabase';
import type { Template } from './features/templates/types';
import { DashboardProvider } from './contexts/DashboardContext';

type View = 'login' | 'register' | 'dashboard' | 'app' | 'settings' | 'templates' | 'emails' | 'addresses' | 'prompts' | 'contacts';

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
  const [view, setView] = useState<View>('login');
  const [darkMode, setDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);

  const fetchUserSettings = async () => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) return;

      const { data, error } = await supabase
        .from('user_settings')
        .select('dark_mode')
        .eq('user_id', user.data.user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user settings:', error);
        return;
      }

      if (data) {
        setDarkMode(data.dark_mode || false);
      }
    } catch (error) {
      console.error('Error fetching user settings:', error);
    }
  };

  useEffect(() => {
    let mounted = true;
    let authInitialized = false;

    // Check for existing session
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (!mounted) return;

        if (error) {
          console.error('Session error:', error);
          setView('login');
          setIsLoading(false);
          authInitialized = true;
          return;
        }

        if (session) {
          setView('dashboard');
          await fetchUserSettings();
        } else {
          setView('login');
        }

        setIsLoading(false);
        authInitialized = true;
      } catch (error) {
        console.error('Auth initialization failed:', error);
        if (mounted) {
          setView('login');
          setIsLoading(false);
          authInitialized = true;
        }
      }
    };

    initializeAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted || !authInitialized) return;

      // Ignore INITIAL_SESSION event to prevent double-firing
      if (event === 'INITIAL_SESSION') return;

      try {
        if (event === 'SIGNED_IN' && session) {
          setView('dashboard');
          await fetchUserSettings();
        } else if (event === 'SIGNED_OUT') {
          setView('login');
          setDarkMode(false);
        }
      } catch (error) {
        console.error('Auth state change error:', error);
      }
    });

    return () => {
      mounted = false;
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
    if (view !== 'login' && view !== 'register') {
      fetchTemplates();
    }
  }, [view]);

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

  const handleLogin = () => {
    // Don't manually change view - let onAuthStateChange handle it
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setView('login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
      <TemplatesContext.Provider value={{ templates, fetchTemplates }}>
        <EmailProvider>
          <DashboardProvider>
            <div className={darkMode ? 'dark' : ''}>
              {view === 'dashboard' || view === 'app' || view === 'settings' || view === 'templates' || view === 'emails' || view === 'addresses' || view === 'prompts' || view === 'contacts' ? (
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
                    />
                  </div>
                  <div className="flex-1 ml-64">
                    {view === 'dashboard' && (
                      <Dashboard onSignOut={handleSignOut} currentView={view} />
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
                  </div>
                </div>
              ) : (
                <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 w-full max-w-md">
                    {view === 'login' ? (
                      <Login 
                        onRegisterClick={() => setView('register')}
                        onLoginSuccess={handleLogin}
                      />
                    ) : (
                      <Register onLoginClick={() => setView('login')} />
                    )}
                  </div>
                </div>
              )}
            </div>
          </DashboardProvider>
        </EmailProvider>
      </TemplatesContext.Provider>
    </ThemeContext.Provider>
  );
}