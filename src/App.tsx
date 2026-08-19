import { useEffect, useState, FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  LayoutDashboard,
  Instagram as InstagramIcon,
  Users,
  Mail,
  Settings,
  LogOut,
  Moon,
  Sun,
  Loader2,
} from 'lucide-react';

import { supabase } from './lib/supabase';
import { useRoute, navigateToApp } from './lib/router';
import { showToast } from './lib/toast';
import Instagram from './components/Instagram';

interface NavItem {
  view: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { view: 'instagram', label: 'Instagram', icon: InstagramIcon },
  { view: 'contacts', label: 'Contacts', icon: Users },
  { view: 'emails', label: 'Emails', icon: Mail },
  { view: 'settings', label: 'Settings', icon: Settings },
];

const DARK_MODE_KEY = 'theme';

function useDarkMode(): [boolean, () => void] {
  const [enabled, setEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem(DARK_MODE_KEY);
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', enabled);
    localStorage.setItem(DARK_MODE_KEY, enabled ? 'dark' : 'light');
  }, [enabled]);

  return [enabled, () => setEnabled((prev) => !prev)];
}

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        showToast(error.message, 'error');
      } else {
        showToast('Signed in successfully', 'success');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sign in';
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg dark:bg-gray-800">
        <div className="mb-6 flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-pink-500 to-fuchsia-600" />
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            App
          </span>
        </div>

        <h1 className="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
          Welcome back
        </h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          Sign in to your account
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-500/30 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-500/30 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-pink-500 to-fuchsia-600 px-4 py-2 text-sm font-semibold text-white transition hover:from-pink-600 hover:to-fuchsia-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

interface SidebarProps {
  activeView: string;
  darkMode: boolean;
  onToggleDark: () => void;
  onSignOut: () => void;
}

function Sidebar({ activeView, darkMode, onToggleDark, onSignOut }: SidebarProps) {
  return (
    <aside className="flex h-screen w-60 flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-pink-500 to-fuchsia-600" />
        <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          App
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.view === activeView;
          return (
            <button
              key={item.view}
              onClick={() => navigateToApp(item.view)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? 'bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-400'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-gray-200 p-3 dark:border-gray-700">
        <button
          onClick={onToggleDark}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          {darkMode ? 'Light mode' : 'Dark mode'}
        </button>
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <LogOut className="h-5 w-5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

function PlaceholderView({ view }: { view: string }) {
  const title = view.charAt(0).toUpperCase() + view.slice(1);
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        This view is under construction.
      </p>
    </div>
  );
}

function MainContent({ view }: { view: string }) {
  switch (view) {
    case 'instagram':
      return <Instagram />;
    default:
      return <PlaceholderView view={view} />;
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const route = useRoute();
  const [darkMode, toggleDarkMode] = useDarkMode();

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) {
          setSession(data.session);
          setAuthLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setAuthLoading(false);
      });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast('Signed out', 'info');
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar
        activeView={route.view}
        darkMode={darkMode}
        onToggleDark={toggleDarkMode}
        onSignOut={handleSignOut}
      />
      <main className="flex-1 overflow-y-auto">
        <MainContent view={route.view} />
      </main>
    </div>
  );
}
