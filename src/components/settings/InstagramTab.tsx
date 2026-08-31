import React, { useState, useEffect, useCallback } from 'react';
import { Instagram as InstagramIcon, Check, AlertCircle, Link2, Eye, EyeOff, Plus, Trash2, RefreshCw, Key, Zap, Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';

interface IgAccountRow {
  id: string;
  ig_user_id: string | null;
  username: string | null;
  access_token: string | null;
  connected: boolean;
  auth_method: string;
  profile_picture_url: string | null;
  followers_count: number | null;
  follows_count: number | null;
  media_count: number | null;
  token_expired: boolean;
}

interface RefreshSettings {
  auto_refresh_enabled: boolean;
  refresh_interval_hours: number;
  last_refresh_at: string | null;
  loop_prevention_enabled: boolean;
}

export function InstagramTab() {
  const [accounts, setAccounts] = useState<IgAccountRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showManualForm, setShowManualForm] = useState(false);
  const [useOAuth, setUseOAuth] = useState(true);
  const [manualForm, setManualForm] = useState({ ig_user_id: '', username: '', access_token: '' });
  const [showToken, setShowToken] = useState(false);
  const [editingTokenFor, setEditingTokenFor] = useState<string | null>(null);
  const [tokenValue, setTokenValue] = useState('');
  const [refreshSettings, setRefreshSettings] = useState<RefreshSettings>({
    auto_refresh_enabled: false,
    refresh_interval_hours: 6,
    last_refresh_at: null,
    loop_prevention_enabled: true,
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [oauthStarting, setOauthStarting] = useState(false);
  const [oauthUrl, setOauthUrl] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('instagram_accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching Instagram accounts:', error);
        return;
      }

      setAccounts(data || []);

      const { data: settings } = await supabase
        .from('instagram_refresh_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (settings) {
        setRefreshSettings({
          auto_refresh_enabled: settings.auto_refresh_enabled ?? false,
          refresh_interval_hours: settings.refresh_interval_hours ?? 6,
          last_refresh_at: settings.last_refresh_at ?? null,
          loop_prevention_enabled: settings.loop_prevention_enabled ?? true,
        });
      }
    } catch (error) {
      console.error('Error fetching Instagram accounts:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('instagram_accounts_rt')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'instagram_accounts' },
        () => fetchAccounts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAccounts]);

  // Check for OAuth callback params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get('oauth');
    const oauthError = params.get('oauth_error');

    if (oauthStatus === 'success') {
      setShowManualForm(false);
      toast.success('Instagram connected successfully via OAuth.');
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
      fetchAccounts();
    } else if (oauthError) {
      // Check for no_match_found with discovered usernames
      if (oauthError.startsWith('no_match_found:')) {
        const foundUsernames = oauthError.substring('no_match_found:'.length);
        toast.error(
          `The Facebook account you logged in with manages these Instagram accounts: ${foundUsernames}. None of them match the account you're trying to reconnect. You need to log in with the Facebook account that manages that Instagram page specifically. Disconnect this account and connect it fresh with the correct Facebook login.`
        );
      } else if (oauthError.startsWith('no_pages:')) {
        const detail = oauthError.substring('no_pages:'.length);
        if (detail.startsWith('missing_pages_show_list')) {
          toast.error('Facebook did not grant the "pages_show_list" permission. This usually means your Meta app is in Development mode and your Facebook user is not added as a tester/developer. Go to your Meta App Dashboard → App Roles → add yourself, or switch the app to Live mode.');
        } else {
          toast.error(`No Facebook Pages were found for your account (${detail}). Make sure you are logged in as the admin of the Facebook Page that is linked to your Instagram Business account, and that the Meta app has been granted the pages_show_list and pages_read_engagement permissions.`);
        }
      } else {
        const messages: Record<string, string> = {
          no_ig_account: 'No Instagram Business Account was found linked to your Facebook Pages. Make sure your Instagram account is a Business account connected to a Facebook Page, and you log in with the Facebook account that manages it.',
          no_pages: 'No Facebook Pages found. You need at least one Facebook Page to connect Instagram.',
          token_exchange_failed: 'Failed to exchange the authorization code for an access token.',
          long_lived_failed: 'Failed to get a long-lived access token.',
          not_configured: 'Instagram OAuth is not configured. Contact support.',
          missing_params: 'Missing authorization parameters from Instagram.',
          no_token: 'No access token returned from Instagram.',
          no_long_token: 'No long-lived token returned.',
          pages_failed: 'Failed to fetch your Facebook Pages.',
          invalid_state: 'Invalid state parameter. Please try connecting again.',
          no_user: 'Could not determine which user to connect the account to.',
        };
        toast.error(messages[oauthError] || `OAuth error: ${oauthError}`);
      }
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
      fetchAccounts();
    }
  }, []);

  // Refresh accounts when window regains focus (e.g. returning from OAuth popup tab)
  useEffect(() => {
    const onFocus = () => fetchAccounts();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchAccounts]);

  const handleOAuthConnect = async (reconnectAccountId?: string) => {
    setOauthStarting(true);
    setOauthUrl(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/instagram-oauth-start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ app_origin: window.location.origin, reconnect_account_id: reconnectAccountId }),
      });

      if (!response.ok) {
        let errMsg = `Failed to start OAuth flow (status ${response.status})`;
        try {
          const err = await response.json();
          errMsg = err.error || errMsg;
        } catch { /* response body wasn't JSON */ }
        alert(errMsg);
        return;
      }

      const data = await response.json();
      if (!data.auth_url) {
        alert('No OAuth URL returned from server. Response: ' + JSON.stringify(data));
        return;
      }
      setOauthUrl(data.auth_url);
    } catch (error) {
      console.error('OAuth start error:', error);
      const msg = error instanceof Error ? error.message : String(error);
      alert(`Failed to start OAuth flow: ${msg}`);
    } finally {
      setOauthStarting(false);
    }
  };

  const handleManualSave = async () => {
    if (!manualForm.ig_user_id || !manualForm.access_token) {
      alert('Instagram User ID and Access Token are required');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if this account already exists
      const { data: existing } = await supabase
        .from('instagram_accounts')
        .select('id')
        .eq('user_id', user.id)
        .eq('ig_user_id', manualForm.ig_user_id)
        .maybeSingle();

      const payload = {
        user_id: user.id,
        ig_user_id: manualForm.ig_user_id,
        username: manualForm.username || null,
        access_token: manualForm.access_token,
        connected: true,
        auth_method: 'manual',
        token_expired: false,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await supabase.from('instagram_accounts').update(payload).eq('id', existing.id);
      } else {
        await supabase.from('instagram_accounts').insert(payload);
      }

      setManualForm({ ig_user_id: '', username: '', access_token: '' });
      setShowManualForm(false);
      await fetchAccounts();
    } catch (error) {
      console.error('Error saving manual account:', error);
      alert('Failed to save account');
    }
  };

  const handleDisconnect = async (id: string) => {
    if (!confirm('Disconnect this Instagram account?')) return;
    try {
      await supabase.from('instagram_accounts').delete().eq('id', id);
      await fetchAccounts();
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  };

  const handleSync = async (accountId: string) => {
    setSyncingId(accountId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/instagram-sync-insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ account_id: accountId }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (err.token_expired) {
          await fetchAccounts();
        }
        alert(err.error || 'Failed to sync insights');
        return;
      }

      await fetchAccounts();
    } catch (error) {
      console.error('Error syncing insights:', error);
      alert('Failed to sync insights');
    } finally {
      setSyncingId(null);
    }
  };

  const handleSaveRefreshSettings = async () => {
    setSavingSettings(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('instagram_refresh_settings')
        .upsert({
          user_id: user.id,
          auto_refresh_enabled: refreshSettings.auto_refresh_enabled,
          refresh_interval_hours: refreshSettings.refresh_interval_hours,
          loop_prevention_enabled: refreshSettings.loop_prevention_enabled,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      await fetchAccounts();
    } catch (error) {
      console.error('Error saving refresh settings:', error);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleUpdateToken = async (accountId: string) => {
    if (!tokenValue) {
      alert('Please enter a new access token');
      return;
    }
    try {
      await supabase
        .from('instagram_accounts')
        .update({ access_token: tokenValue, token_expired: false, connected: true, updated_at: new Date().toISOString() })
        .eq('id', accountId);
      setEditingTokenFor(null);
      setTokenValue('');
      await fetchAccounts();
    } catch (error) {
      console.error('Error updating token:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connected accounts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Connected Accounts</h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</span>
        </div>

        {accounts.length === 0 ? (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
              <p className="text-sm text-gray-700 dark:text-gray-300">No Instagram accounts connected yet. Connect one below to get started.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((acct) => (
              <div key={acct.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {acct.profile_picture_url ? (
                      <img src={acct.profile_picture_url} alt="" className="w-10 h-10 rounded-full" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                        <InstagramIcon className="w-5 h-5 text-pink-500" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">@{acct.username || 'unknown'}</p>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          acct.auth_method === 'oauth'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {acct.auth_method === 'oauth' ? 'OAuth' : 'Manual'}
                        </span>
                        {acct.token_expired && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                            Token expired
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {acct.followers_count != null && `${acct.followers_count.toLocaleString()} followers`}
                        {acct.media_count != null && ` · ${acct.media_count.toLocaleString()} posts`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleSync(acct.id)}
                      disabled={syncingId === acct.id}
                      className="p-1.5 text-gray-400 hover:text-pink-500 rounded-lg hover:bg-pink-50 dark:hover:bg-pink-900/20 disabled:opacity-50"
                      title="Sync insights"
                    >
                      <RefreshCw className={`w-4 h-4 ${syncingId === acct.id ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      onClick={() => handleDisconnect(acct.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                      title="Disconnect"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Reconnect via OAuth — show for manual accounts or expired tokens */}
                {(acct.auth_method === 'manual' || acct.token_expired) && (
                  <div className="mt-3 flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {acct.auth_method === 'manual'
                        ? 'Manual tokens may not support posting. Reconnect via Instagram Login to enable posting.'
                        : 'This account\'s token may be invalid or belongs to a different Facebook account. Reconnect to get a fresh token.'}
                    </p>
                    <button
                      onClick={() => handleOAuthConnect(acct.id)}
                      className="ml-auto px-3 py-1 text-xs font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg whitespace-nowrap flex items-center gap-1"
                    >
                      <Link2 className="w-3 h-3" /> Reconnect
                    </button>
                  </div>
                )}

                {/* Token expired — show update token field */}
                {acct.token_expired && editingTokenFor === acct.id && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={tokenValue}
                      onChange={(e) => setTokenValue(e.target.value)}
                      placeholder="New access token"
                      className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <button onClick={() => setShowToken(!showToken)} className="p-1.5 text-gray-400">
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleUpdateToken(acct.id)}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg"
                    >
                      Update
                    </button>
                    <button
                      onClick={() => { setEditingTokenFor(null); setTokenValue(''); }}
                      className="px-3 py-1.5 text-sm text-gray-500"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {acct.token_expired && editingTokenFor !== acct.id && (
                  <button
                    onClick={() => { setEditingTokenFor(acct.id); setTokenValue(''); }}
                    className="mt-2 text-xs text-pink-600 dark:text-pink-400 hover:underline"
                  >
                    Update access token
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Connect new account */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Plus className="w-4 h-4 text-gray-400" />
          <h4 className="text-sm font-medium text-gray-900 dark:text-white">Connect New Account</h4>
        </div>

        {/* Connection method toggle */}
        <div className="flex items-center gap-1 mb-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg p-1">
          <button
            onClick={() => setUseOAuth(true)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              useOAuth ? 'bg-white dark:bg-gray-800 text-pink-600 dark:text-pink-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            <Zap className="w-4 h-4" /> Instagram Login
          </button>
          <button
            onClick={() => setUseOAuth(false)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              !useOAuth ? 'bg-white dark:bg-gray-800 text-pink-600 dark:text-pink-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            <Key className="w-4 h-4" /> Manual
          </button>
        </div>

        {useOAuth ? (
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">
              Click the button below to authorize your Instagram Business or Creator account through Meta's secure login. No need to copy IDs or tokens manually.
            </p>
            {oauthUrl ? (
              <div className="space-y-3">
                <a
                  href={oauthUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg"
                >
                  <InstagramIcon className="w-4 h-4" />
                  Open Facebook Login
                </a>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  A new tab will open for you to authorize your Instagram account. After completing the login, come back here — your account will appear automatically.
                </p>
                <button
                  onClick={() => setOauthUrl(null)}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleOAuthConnect()}
                disabled={oauthStarting}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg disabled:opacity-50"
              >
                <InstagramIcon className="w-4 h-4" />
                {oauthStarting ? 'Preparing...' : 'Connect with Instagram'}
              </button>
            )}
            <p className="mt-2 text-xs text-gray-400">
              Requires INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET in Supabase secrets.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {!showManualForm ? (
              <button
                onClick={() => setShowManualForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg"
              >
                <Plus className="w-4 h-4" /> Add Account Manually
              </button>
            ) : (
              <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Instagram User ID</label>
                  <input
                    type="text"
                    value={manualForm.ig_user_id}
                    onChange={(e) => setManualForm(prev => ({ ...prev, ig_user_id: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Instagram-scoped user ID from Meta"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Username (optional)</label>
                  <input
                    type="text"
                    value={manualForm.username}
                    onChange={(e) => setManualForm(prev => ({ ...prev, username: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="@your_username"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Access Token</label>
                  <div className="relative">
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={manualForm.access_token}
                      onChange={(e) => setManualForm(prev => ({ ...prev, access_token: e.target.value }))}
                      className="w-full px-3 py-2 pr-10 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
                      placeholder="Long-lived access token"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
                    >
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleManualSave}
                    className="px-4 py-2 text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg"
                  >
                    Save Account
                  </button>
                  <button
                    onClick={() => { setShowManualForm(false); setManualForm({ ig_user_id: '', username: '', access_token: '' }); }}
                    className="px-4 py-2 text-sm text-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Auto-refresh settings */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <RefreshCw className="w-4 h-4 text-gray-400" />
          <h4 className="text-sm font-medium text-gray-900 dark:text-white">Auto-Refresh Settings</h4>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4 space-y-3">
          <label className="flex items-center justify-between">
            <span className="text-sm text-gray-700 dark:text-gray-300">Enable auto-refresh</span>
            <button
              onClick={() => setRefreshSettings(prev => ({ ...prev, auto_refresh_enabled: !prev.auto_refresh_enabled }))}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${refreshSettings.auto_refresh_enabled ? 'bg-pink-500' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${refreshSettings.auto_refresh_enabled ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
          </label>
          {refreshSettings.auto_refresh_enabled && (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Refresh frequency</label>
              <select
                value={refreshSettings.refresh_interval_hours}
                onChange={(e) => setRefreshSettings(prev => ({ ...prev, refresh_interval_hours: parseInt(e.target.value) }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value={1}>Every 1 hour</option>
                <option value={6}>Every 6 hours</option>
                <option value={12}>Every 12 hours</option>
                <option value={24}>Every 24 hours</option>
              </select>
            </div>
          )}
          {refreshSettings.last_refresh_at && (
            <p className="text-xs text-gray-400">
              Last sync: {new Date(refreshSettings.last_refresh_at).toLocaleString()}
            </p>
          )}
          <button
            onClick={handleSaveRefreshSettings}
            disabled={savingSettings}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
          >
            {savingSettings ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Loop prevention setting */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-gray-400" />
          <h4 className="text-sm font-medium text-gray-900 dark:text-white">Loop Prevention</h4>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4 space-y-2">
          <label className="flex items-center justify-between">
            <div className="flex-1 pr-4">
              <span className="text-sm text-gray-700 dark:text-gray-300 block">Prevent automated replies from triggering your other accounts</span>
              <span className="text-xs text-gray-400 mt-0.5 block">When enabled, automated messages sent by flows, auto-rules, or the autoresponder won't trigger automations on your other connected accounts. Manual messages still work normally for testing.</span>
            </div>
            <button
              onClick={() => setRefreshSettings(prev => ({ ...prev, loop_prevention_enabled: !prev.loop_prevention_enabled }))}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${refreshSettings.loop_prevention_enabled ? 'bg-pink-500' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${refreshSettings.loop_prevention_enabled ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
          </label>
          <button
            onClick={handleSaveRefreshSettings}
            disabled={savingSettings}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
          >
            {savingSettings ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Webhook info */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <div className="flex items-start gap-3">
          <Link2 className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Webhook Setup</h4>
            <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
              Your webhook URL and verification token are configured on the server side. Incoming comments, messages, mentions, shares, and reposts will appear in your Instagram inbox automatically.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
