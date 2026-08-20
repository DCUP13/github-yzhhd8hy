import React, { useState, useEffect, useCallback } from 'react';
import { Share2, X, Check, RefreshCw, Link2, Link2Off } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface IgAccount {
  id: string;
  username: string | null;
  profile_picture_url: string | null;
  user_id: string;
}

interface Subscription {
  account_id: string;
  synced: boolean;
}

interface ShareSettingsDialogProps {
  settingType: 'flow' | 'rule' | 'autoresponder';
  settingId: string;
  settingName: string;
  settingAccountId: string;
  ownerUserId: string;
  allAccounts: IgAccount[];
  onClose: () => void;
  onShared: () => void;
}

export function ShareSettingsDialog({
  settingType,
  settingId,
  settingName,
  settingAccountId,
  ownerUserId,
  allAccounts,
  onClose,
  onShared,
}: ShareSettingsDialogProps) {
  const [groupId, setGroupId] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<Map<string, boolean>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Other accounts (exclude the one this setting currently belongs to)
  const otherAccounts = allAccounts.filter(a => a.id !== settingAccountId);

  const tableMap = {
    flow: 'instagram_conversation_flows',
    rule: 'instagram_auto_rules',
    autoresponder: 'instagram_autoresponder_settings',
  } as const;

  const fetchState = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: setting } = await supabase
        .from(tableMap[settingType])
        .select('settings_group_id, is_synced_copy')
        .eq('id', settingId)
        .maybeSingle();

      if (!setting) { setIsLoading(false); return; }

      if (setting.settings_group_id) {
        setGroupId(setting.settings_group_id);
        const { data: subs } = await supabase
          .from('instagram_settings_subscriptions')
          .select('account_id, synced')
          .eq('group_id', setting.settings_group_id);
        const map = new Map<string, boolean>();
        for (const s of (subs || [])) {
          map.set(s.account_id, s.synced);
        }
        setSubscriptions(map);
      }
    } catch (err) {
      console.error('Error fetching share state:', err);
    } finally {
      setIsLoading(false);
    }
  }, [settingId, settingType]);

  useEffect(() => { fetchState(); }, [fetchState]);

  const ensureGroup = async (): Promise<string> => {
    if (groupId) return groupId;
    const { data, error } = await supabase
      .from('instagram_settings_groups')
      .insert({
        owner_user_id: ownerUserId,
        setting_type: settingType,
        name: settingName,
      })
      .select('id')
      .single();
    if (error) throw error;
    const newGroupId = data.id;
    setGroupId(newGroupId);
    // Link the source setting to the group
    await supabase
      .from(tableMap[settingType])
      .update({ settings_group_id: newGroupId, is_synced_copy: true })
      .eq('id', settingId);
    // Create subscription for the source account
    await supabase
      .from('instagram_settings_subscriptions')
      .insert({ group_id: newGroupId, account_id: settingAccountId, synced: true });
    setSubscriptions(prev => { const m = new Map(prev); m.set(settingAccountId, true); return m; });
    return newGroupId;
  };

  const handleShareToAccount = async (accountId: string) => {
    setIsApplying(true);
    setError('');
    try {
      const gid = await ensureGroup();
      const { error: rpcError } = await supabase.rpc('apply_settings_group_to_account', {
        p_group_id: gid,
        p_account_id: accountId,
      });
      if (rpcError) throw rpcError;
      setSubscriptions(prev => { const m = new Map(prev); m.set(accountId, true); return m; });
      showToast(`Shared to ${allAccounts.find(a => a.id === accountId)?.username || 'account'}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as any)?.message || 'Failed to share';
      setError(msg);
    } finally {
      setIsApplying(false);
    }
  };

  const handleToggleSync = async (accountId: string, currentSynced: boolean) => {
    if (!groupId) return;
    setIsApplying(true);
    setError('');
    try {
      if (currentSynced) {
        // Unsubscribe — make independent
        const { error: rpcError } = await supabase.rpc('unsubscribe_account_from_group', {
          p_group_id: groupId,
          p_account_id: accountId,
        });
        if (rpcError) throw rpcError;
        setSubscriptions(prev => { const m = new Map(prev); m.set(accountId, false); return m; });
        showToast('Account is now independent — edits stay local');
      } else {
        // Re-subscribe — overwrite with group version
        const { error: rpcError } = await supabase.rpc('resubscribe_account_to_group', {
          p_group_id: groupId,
          p_account_id: accountId,
        });
        if (rpcError) throw rpcError;
        setSubscriptions(prev => { const m = new Map(prev); m.set(accountId, true); return m; });
        showToast('Account re-synced — edits will propagate');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as any)?.message || 'Failed to toggle sync';
      setError(msg);
    } finally {
      setIsApplying(false);
    }
  };

  const handleShareAll = async () => {
    setIsApplying(true);
    setError('');
    try {
      const gid = await ensureGroup();
      for (const account of otherAccounts) {
        if (!subscriptions.has(account.id)) {
          const { error: rpcError } = await supabase.rpc('apply_settings_group_to_account', {
            p_group_id: gid,
            p_account_id: account.id,
          });
          if (rpcError) {
            console.error('Share error for', account.username, rpcError);
            const msg = rpcError.message || 'Unknown error';
            setError(`Failed to share to ${account.username || 'account'}: ${msg}`);
            continue;
          }
          setSubscriptions(prev => { const m = new Map(prev); m.set(account.id, true); return m; });
        }
      }
      showToast('Shared to all accounts');
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as any)?.message || 'Failed to share to all';
      setError(msg);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-pink-500" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Share {settingType === 'flow' ? 'Flow' : settingType === 'rule' ? 'Rule' : 'Autoresponder'}
            </h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Share "<span className="font-medium text-gray-700 dark:text-gray-300">{settingName}</span>" to your other linked accounts. Synced accounts stay in sync — editing any copy updates all others.
        </p>

        {otherAccounts.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
            You only have one Instagram account. Link more accounts to share settings across them.
          </p>
        )}

        {otherAccounts.length > 0 && !isLoading && (
          <>
            <div className="flex justify-end mb-3">
              <button
                onClick={handleShareAll}
                disabled={isApplying}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg disabled:opacity-50"
              >
                <Share2 className="w-3.5 h-3.5 mr-1.5" />
                Share to All
              </button>
            </div>

            <div className="space-y-2">
              {otherAccounts.map(account => {
                const isShared = subscriptions.has(account.id);
                const isSynced = subscriptions.get(account.id) === true;
                return (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-center gap-3">
                      {account.profile_picture_url ? (
                        <img src={account.profile_picture_url} alt="" className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-xs font-medium">
                          {(account.username || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{account.username || 'Unknown'}</p>
                        {isShared ? (
                          <p className={`text-xs ${isSynced ? 'text-green-500' : 'text-amber-500'}`}>
                            {isSynced ? 'Synced — edits propagate' : 'Independent — edits are local'}
                          </p>
                        ) : (
                          <p className="text-xs text-gray-400">Not shared</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isShared ? (
                        <button
                          onClick={() => handleShareToAccount(account.id)}
                          disabled={isApplying}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg disabled:opacity-50"
                        >
                          <Share2 className="w-3 h-3 mr-1" /> Share
                        </button>
                      ) : (
                        <button
                          onClick={() => handleToggleSync(account.id, isSynced)}
                          disabled={isApplying}
                          className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg ${
                            isSynced
                              ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 border border-amber-300 dark:border-amber-700'
                              : 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 border border-green-300 dark:border-green-700'
                          } disabled:opacity-50`}
                        >
                          {isSynced ? (
                            <><Link2Off className="w-3 h-3 mr-1" /> Unsync</>
                          ) : (
                            <><Link2 className="w-3 h-3 mr-1" /> Re-sync</>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Source account indicator */}
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-400">
                Source: {allAccounts.find(a => a.id === settingAccountId)?.username || 'this account'}
                {subscriptions.get(settingAccountId) === true && ' (synced)'}
                {subscriptions.has(settingAccountId) && subscriptions.get(settingAccountId) === false && ' (independent)'}
              </p>
            </div>
          </>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-5 h-5 text-pink-500 animate-spin" />
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={() => { onShared(); onClose(); }} className="px-4 py-2 text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg">
            Done
          </button>
        </div>

        {toast && (
          <div className="fixed bottom-6 right-6 z-50 bg-gray-900 dark:bg-gray-700 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
            <Check className="w-4 h-4 text-green-400" />
            <span className="text-sm">{toast}</span>
          </div>
        )}
      </div>
    </div>
  );
}
