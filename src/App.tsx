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
import { TeamView as TeamPage } from './components/TeamPage';
import { SupportPage } from './components/SupportPage';
import { useUnreadChatCount } from './lib/useUnreadChatCount';
import { toast } from './lib/toast';
import { EmailProvider } from './contexts/EmailContext';
import { OrganizationProvider } from './contexts/OrganizationContext';
import { supabase } from './lib/supabase';
import type { Template } from './features/templates/types';
import { DashboardProvider } from './contexts/DashboardContext';
import { useRouter, useAppRouter, type PublicRoute, type AppView } from './lib/router';
import { HomePage } from './components/public/HomePage';
import { FeaturesPage } from './components/public/FeaturesPage';
import { AboutPage } from './components/public/AboutPage';
import { PricingPage } from './components/public/PricingPage';
import { QuizPage } from './components/public/QuizPage';
import { SecurityPage } from './components/public/SecurityPage';
import { ContactPage } from './components/public/ContactPage';
import { AuthPage } from './components/public/AuthPage';
import { PrivacyPolicy, TermsOfService, CookiePolicy, DataProcessingAgreement, RefundPolicy, AcceptableUsePolicy, AccessibilityADA } from './components/public/LegalPages';
import { NotFoundPage } from './components/public/NotFoundPage';
import { Lock as LockIcon, Menu } from 'lucide-react';

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

export type FeatureFlags = { instagram: boolean; linkedin: boolean };

export const FeatureFlagsContext = createContext<FeatureFlags>({
  instagram: false,
  linkedin: false,
});

function FeatureNotEnabled({ featureName }: { featureName: string }) {
  return (
    <div className="flex-1 p-8 bg-white dark:bg-gray-900 flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="p-4 rounded-full bg-gray-100 dark:bg-gray-800 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
          <LockIcon className="w-8 h-8 text-gray-400" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          {featureName} is not enabled
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          This feature hasn't been enabled for your account. Please contact your account owner to request access.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const { route: publicRoute, navigate } = useRouter();
  const { appView, queryParams, navigateToApp } = useAppRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [igExchangeStatus, setIgExchangeStatus] = useState<'idle' | 'exchanging' | 'done'>('idle');

  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({ instagram: false, linkedin: false });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const unreadChatCount = useUnreadChatCount();

  // Handle Instagram OAuth code when Instagram redirects back to the app
  useEffect(() => {
    if (!isAuthenticated || igExchangeStatus !== 'idle') return;

    const params = new URLSearchParams(window.location.search);
    const igCode = params.get('code');
    const igState = params.get('state');
    const igError = params.get('error');

    // Only process if this looks like an Instagram OAuth redirect (has code or error, plus state)
    if (!igCode && !igError) return;
    if (!igState && !igError) return;

    setIgExchangeStatus('exchanging');

    (async () => {
      try {
        if (igError) {
          const errorDesc = params.get('error_description') ?? igError;
          throw new Error(errorDesc === 'user_denied' ? 'You cancelled the Instagram authorization.' : errorDesc);
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const redirectUri = window.location.origin;

        const response = await fetch(`${supabaseUrl}/functions/v1/instagram-oauth-exchange`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ code: igCode, state: igState, redirect_uri: redirectUri }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to connect Instagram account');
        }

        const data = await response.json();
        toast.success(`Instagram account @${data.username || 'connected'} linked successfully.`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        toast.error(`Instagram connection failed: ${msg}`);
      } finally {
        // Clean the URL and navigate to settings
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
        setIgExchangeStatus('done');
        navigateToApp('settings');
      }
    })();
  }, [isAuthenticated, igExchangeStatus, navigateToApp]);

  const fetchUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role, feature_flags')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user role:', error);
        return;
      }

      if (data?.role === 'super_admin') {
        setIsSuperAdmin(true);
        setFeatureFlags({ instagram: true, linkedin: true });
      } else {
        const flags = data?.feature_flags as Record<string, boolean> | null;
        setFeatureFlags({
          instagram: !!flags?.instagram,
          linkedin: !!flags?.linkedin,
        });
      }
    } catch (error) {
      console.error('Error fetching user role:', error);
    }
  };

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
          setIsAuthenticated(true);
          await fetchUserSettings(session.user.id);
          await fetchUserRole(session.user.id);
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
        setIsAuthenticated(true);
        // If we're on a public page (e.g. /login), go to dashboard
        // Otherwise stay on the current app page
        const currentPath = window.location.pathname;
        if (!currentPath.startsWith('/app/')) {
          navigateToApp('dashboard');
        }
        (async () => {
          try {
            // Mark any pending invitation for this user's email as accepted
            await supabase
              .from('member_invitations')
              .update({ status: 'accepted' })
              .eq('email', session.user.email?.toLowerCase() ?? '')
              .eq('status', 'pending');

            await fetchUserSettings(session.user.id);
            await fetchUserRole(session.user.id);
          } catch (error) {
            console.error('Auth state change error:', error);
          }
        })();
      } else if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        setDarkMode(false);
        setIsSuperAdmin(false);
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
    if (isAuthenticated) {
      fetchTemplates();
    }
  }, [isAuthenticated]);

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
      console.error('Error updating dark mode setting:', error);
      alert('Failed to update dark mode setting. Please try again.');
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
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
  if (isAuthenticated && appView) {
    const sidebarProps = {
      onSignOut: handleSignOut,
      currentView: appView,
      onNavigate: (view: AppView) => {
        navigateToApp(view);
        setSidebarOpen(false);
      },
      isSuperAdmin,
      featureFlags,
      unreadChatCount,
    };

    return (
      <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
        <TemplatesContext.Provider value={{ templates, fetchTemplates }}>
          <FeatureFlagsContext.Provider value={featureFlags}>
          <EmailProvider>
            <DashboardProvider>
          <OrganizationProvider>
              <div className="flex min-h-screen bg-white dark:bg-gray-900">
                {/* Desktop sidebar — fixed */}
                <div className="hidden lg:block fixed inset-y-0 left-0 w-64 flex-shrink-0">
                  <Sidebar {...sidebarProps} />
                </div>

                {/* Mobile sidebar — slide-in drawer */}
                {sidebarOpen && (
                  <div className="lg:hidden fixed inset-0 z-50">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
                    <div className="absolute inset-y-0 left-0 w-64 bg-blue-800 dark:bg-gray-800 shadow-xl">
                      <Sidebar {...sidebarProps} onNavigate={(view: AppView) => {
                        navigateToApp(view);
                        setSidebarOpen(false);
                      }} />
                    </div>
                  </div>
                )}

                {/* Mobile top bar */}
                <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-blue-800 dark:bg-gray-800 text-white px-4 py-3 flex items-center gap-3 flex-shrink-0">
                  <button onClick={() => setSidebarOpen(true)} className="p-1.5 hover:bg-blue-700 dark:hover:bg-gray-700 rounded-lg">
                    <Menu className="w-5 h-5" />
                  </button>
                  <h2 className="text-base font-bold">Dashboard</h2>
                </div>

                <div className="flex-1 lg:ml-64 pt-12 lg:pt-0">
                  {appView === 'dashboard' && (
                    <Dashboard onSignOut={handleSignOut} currentView={appView} onNavigateAnalytics={() => navigateToApp('analytics')} />
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
                    <Analytics onSignOut={handleSignOut} currentView={appView} queryParams={queryParams} navigateToApp={navigateToApp} />
                  )}
                  {appView === 'instagram' && (
                    isSuperAdmin || featureFlags.instagram ? (
                      <Instagram onSignOut={handleSignOut} currentView={appView} queryParams={queryParams} navigateToApp={navigateToApp} />
                    ) : (
                      <FeatureNotEnabled featureName="Instagram" />
                    )
                  )}
                  {appView === 'team' && (
                    <TeamPage onSignOut={handleSignOut} />
                  )}
                  {appView === 'support' && (
                    <SupportPage onSignOut={handleSignOut} currentView={appView} isSuperAdmin={isSuperAdmin} />
                  )}
                </div>
              </div>
          </OrganizationProvider>
            </DashboardProvider>
          </EmailProvider>
          </FeatureFlagsContext.Provider>
        </TemplatesContext.Provider>
      </ThemeContext.Provider>
    );
  }

  // If authenticated but no app view in URL, redirect to dashboard
  if (isAuthenticated && !appView) {
    navigateToApp('dashboard');
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
      case 'login': return <AuthPage currentRoute={publicRoute} onNavigate={navigate} />;
      case 'privacy': return <PrivacyPolicy currentRoute={publicRoute} onNavigate={navigate} />;
      case 'terms': return <TermsOfService currentRoute={publicRoute} onNavigate={navigate} />;
      case 'cookies': return <CookiePolicy currentRoute={publicRoute} onNavigate={navigate} />;
      case 'ada': return <AccessibilityADA currentRoute={publicRoute} onNavigate={navigate} />;
      case 'not-found': return <NotFoundPage currentRoute={publicRoute} onNavigate={navigate} />;
      default: return <NotFoundPage currentRoute={publicRoute} onNavigate={navigate} />;
    }
  };

  return renderPublicPage();
}
