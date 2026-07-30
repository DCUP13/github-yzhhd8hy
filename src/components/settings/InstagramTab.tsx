import React, { useState, useEffect } from 'react';
import { Instagram as InstagramIcon, Check, AlertCircle, Link2, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export function InstagramTab() {
  const [igUserId, setIgUserId] = useState('');
  const [username, setUsername] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [connected, setConnected] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetchAccount();
  }, []);

  const fetchAccount = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('instagram_accounts')
        .select('*')
        .eq('user_id', user.id)
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
      }
    } catch (error) {
      console.error('Error fetching Instagram account:', error);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const payload = {
        user_id: user.id,
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
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving Instagram account:', error);
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
    } catch (error) {
      console.error('Error disconnecting:', error);
      alert('Failed to disconnect');
    }
  };

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

      {/* Webhook URL info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <Link2 className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Webhook URL</h4>
            <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
              Paste this URL into your Meta App dashboard under Products &gt; Webhooks. When Meta verifies it, your function will respond to the verification challenge automatically.
            </p>
            <code className="block text-xs bg-white dark:bg-gray-800 rounded px-3 py-2 text-blue-600 dark:text-blue-400 break-all">
              {import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-webhook
            </code>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              The verify token is set as a secret on your edge function. When Meta asks for a Verify Token during webhook setup, enter: <code className="px-1 bg-white dark:bg-gray-800 rounded">bolt_instagram_verify</code>
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
          <textarea
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
            placeholder="Paste your long-lived access token from Meta"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Generate a long-lived token in your Meta App dashboard. This is used to publish posts and reply to comments.
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
          <li>Add the webhook URL shown above and use the verify token provided.</li>
          <li>Subscribe to the fields: comments, messages, and mentions.</li>
          <li>Generate a long-lived access token and paste it above.</li>
        </ol>
      </div>
    </div>
  );
}
