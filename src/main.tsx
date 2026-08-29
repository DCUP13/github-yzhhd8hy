import React from 'react';
import ReactDOM from 'react-dom/client';
import { PostsAutoTab } from './components/PostsAutoTab';
import { supabase } from './lib/supabase';
import './index.css';

// Minimal stub: in the real app this is reached after auth + routing.
// We stub a demo user + account so the component is functional standalone.
function App() {
  const [userId, setUserId] = React.useState<string>('');
  const accounts = React.useMemo(() => [
    { id: 'demo-account-1', ig_user_id: 'demo-ig-1', username: 'demo_account', profile_picture_url: null, user_id: userId },
  ], [userId]);

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);

  if (!userId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500 dark:text-gray-400">Please sign in to use the Instagram Auto-Poster.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Instagram Auto-Poster</h1>
        <PostsAutoTab accounts={accounts} userId={userId} />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
