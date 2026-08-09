import React, { useState, useEffect } from 'react';
import { Instagram as InstagramIcon, Check, AlertCircle, Link2, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface InstagramTabProps {
  userId?: string;
}

export function InstagramTab({ userId }: InstagramTabProps = {}) {
  const [igUserId, setIgUserId] = useState('');
  const [username, setUsername] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [connected, setConnected] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [hasExistingToken, setHasExistingToken] = useState(false);

  useEffect(() => {
    fetchAccount();
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let active = true;

    (async () => {
      const currentUserId = await getCurrentUserId();
      if (!currentUserId || !active) return;

      channel = supabase
        .channel(`instagram_rt_${currentUserId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'instagram_accounts', filter: `user_id=eq.${currentUserId}` },
          (payload) => {
            const d = payload.new as Record<string, unknown>;
            setIgUserId(String(d.ig_user_id || ''));
            setUsername(String(d.username || ''));
            setAccessToken(String(d.access_token || ''));
            setConnected(Boolean(d.connected));
            setHasExistingToken(!!d.access_token);
            if (d.id) setAccountId(String(d.id));
          }
        )
        .subscribe();
    })();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId]);

  const getCurrentUserId = async (): Promise<string | null> => {
    if (userId) return userId;
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  };

  const fetchAccount = async () => {
    try {
      const currentUserId = await getCurrentUserId();
      if (!currentUserId) return;

      const { data, error } = await supabase
        .from('instagram_accounts')
        .select('*')
        .eq('user_id', currentUserId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching Instagram account:', error);
        return;
      }

      if (data) {
        setAccountId(data.id);
        setIgUserId(data.ig_user_id || '');
        setUsername(data.username || '');
        setAccessToken(data.access_token || '');
        setConnected(data.connected || false);
        setHasExistingToken(!!data.access_token);
      }
    } catch (error) {
      console.error('Error fetching Instagram account:', error);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const currentUserId = await getCurrentUserId();
      if (!currentUserId) throw new Error('User not authenticated');

      const payload = {
        user_id: currentUserId,
        ig_user_id: igUserId || null,
        username: username || null,
        access_token: accessToken || null,
        connected: !!(igUserId && accessToken),
        updated_at: new Date().toISOString(),
      };

      if (accountId) {
        const { error } = await supabase
          .from('instagram_accounts')
          .update(payload)
          .eq('id', accountId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('instagram_accounts')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        if (data) setAccountId(data.id);
      }

      setConnected(!!(igUserId && accessToken));
      setHasExistingToken(!!accessToken);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving Instagram settings:', error);
      alert('Failed to save Instagram settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect your Instagram account?')) return;
    try {
      if (accountId) {
        const { error } = await supabase
          .from('instagram_accounts')
          .update({ connected: false, access_token: null, updated_at: new Date().toISOString() })
          .eq('id', accountId);
        if (error) throw error;
      }
      setConnected(false);
      setAccessToken('');
      setHasExistingToken(false);
    } catch (error) {
      console.error('Error disconnecting:', error);
      alert('Failed to disconnect');
    }
  };

  const displayToken = hasExistingToken && !showToken ? '••••••••••••••••' : accessToken;

  return (
    <div className="space-y-6">
      {/* Connection status */}
      <div className={`rounded-lg p-4 ${connected ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'}`}>
        <div className="flex items-center gap-3">
          {connected ? (
            <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
          ) : (
            <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          )}
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {connected ? `Connected as @${username || 'unknown'}` : 'Not connected'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {connected
                ? 'Your Instagram account is linked and ready to receive webhook events.'
                : 'Enter your Instagram account details below to connect.'}
            </p>
          </div>
        </div>
      </div>

      {/* Webhook info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <Link2 className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Webhook Setup</h4>
            <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
              Your webhook URL and verification token are configured on the server side. Contact your platform administrator if you need the webhook address for your Meta App dashboard.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Once your webhook is verified by Meta, incoming comments, messages, and mentions will appear in your Instagram inbox automatically.
            </p>
          </div>
        </div>
      </div>

      {/* Account form */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Instagram User ID
          </label>
          <input
            type="text"
            value={igUserId}
            onChange={(e) => setIgUserId(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            placeholder="Your Instagram-scoped user ID from Meta"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Found in your Meta App dashboard after connecting your Instagram Business/Creator account.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            placeholder="@your_instagram_username"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Long-Lived Access Token
          </label>
          <div className="relative">
            <textarea
              value={displayToken}
              onChange={(e) => {
                setAccessToken(e.target.value);
                setHasExistingToken(false);
              }}
              rows={3}
              className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
              placeholder="Paste your long-lived access token from Meta"
            />
            {hasExistingToken && (
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                title={showToken ? 'Hide token' : 'Show token'}
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Generate a long-lived token in your Meta App dashboard. This is used to publish posts and reply to comments. For security, the token is hidden once saved.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg shadow-sm text-white ${
            isSaving ? 'bg-pink-400 cursor-wait' : 'bg-pink-600 hover:bg-pink-700'
          }`}
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
        {connected && (
          <button
            onClick={handleDisconnect}
            className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Disconnect
          </button>
        )}
        {saveSuccess && (
          <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
            <Check className="w-4 h-4" /> Saved
          </span>
        )}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Meta App Setup Guide</h4>
        <ol className="space-y-1 text-xs text-gray-500 dark:text-gray-400 list-decimal list-inside">
          <li>Create a Meta app at developers.facebook.com and add the Instagram Graph API product.</li>
          <li>Subscribe your Instagram Business or Creator account to the app.</li>
          <li>Configure the webhook in your Meta App dashboard using the server-side verify token.</li>
          <li>Subscribe to the fields: comments, messages, and mentions.</li>
          <li>Generate a long-lived access token and paste it above.</li>
        </ol>
      </div>
    </div>
  );
}
