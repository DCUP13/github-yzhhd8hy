import React, { useState, useEffect } from 'react';
import { Share2, X, Globe, Building2, Loader2, AlertCircle, CheckCircle2, Trash2, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  itemType: 'campaign' | 'contact' | 'template';
  itemId: string;
  itemName: string;
}

interface SharedItem {
  id: string;
  shared_with_type: string;
  shared_with_org_id: string | null;
  created_at: string;
  organizations: { name: string } | null;
}

interface Organization {
  id: string;
  name: string;
}

export function ShareDialog({ isOpen, onClose, itemType, itemId, itemName }: ShareDialogProps) {
  const [sharedWith, setSharedWith] = useState<SharedItem[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [shareType, setShareType] = useState<'all' | 'organization'>('all');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    loadSharedWith();
    loadOrganizations();
  }, [isOpen, itemId, itemType]);

  const loadSharedWith = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from('shared_items')
        .select(`
          id, shared_with_type, shared_with_org_id, created_at,
          organizations!left(name)
        `)
        .eq('item_type', itemType)
        .eq('item_id', itemId);

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.role !== 'super_admin') {
        query = query.eq('shared_by', user.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      setSharedWith((data || []).map((s: any) => ({
        id: s.id,
        shared_with_type: s.shared_with_type,
        shared_with_org_id: s.shared_with_org_id,
        created_at: s.created_at,
        organizations: s.organizations,
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sharing data');
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrganizations = async () => {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name')
        .order('name', { ascending: true });

      if (error) throw error;
      setOrgs(data || []);
    } catch (err) {
      // organizations may not be visible to non-admin users
    }
  };

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSharing(true);
    setError('');
    setSuccess('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (shareType === 'organization' && !selectedOrgId) {
        setError('Please select an organization to share with.');
        setIsSharing(false);
        return;
      }

      const { error } = await supabase.from('shared_items').insert({
        item_type: itemType,
        item_id: itemId,
        shared_by: user.id,
        shared_with_type: shareType,
        shared_with_org_id: shareType === 'organization' ? selectedOrgId : null,
      });

      if (error) {
        if (error.code === '23505') {
          throw new Error('This item is already shared with this target.');
        }
        throw error;
      }

      setSuccess('Item shared successfully.');
      setShareType('all');
      setSelectedOrgId('');
      loadSharedWith();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share item');
    } finally {
      setIsSharing(false);
    }
  };

  const handleUnshare = async (shareId: string) => {
    setError('');
    setSuccess('');

    try {
      const { error } = await supabase
        .from('shared_items')
        .delete()
        .eq('id', shareId);

      if (error) throw error;

      setSuccess('Sharing removed.');
      loadSharedWith();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove sharing');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Share "{itemName}"</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3 text-sm text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400 rounded-lg border border-green-200 dark:border-green-800">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <p>{success}</p>
            </div>
          )}

          {/* Current sharing */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Currently Shared With</h3>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading...
              </div>
            ) : sharedWith.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Not shared with anyone yet.</p>
            ) : (
              <div className="space-y-2">
                {sharedWith.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-750 rounded-lg">
                    <div className="flex items-center gap-2">
                      {item.shared_with_type === 'all' ? (
                        <>
                          <Globe className="w-4 h-4 text-blue-500" />
                          <span className="text-sm text-gray-900 dark:text-white">Everyone</span>
                        </>
                      ) : (
                        <>
                          <Building2 className="w-4 h-4 text-green-500" />
                          <span className="text-sm text-gray-900 dark:text-white">
                            {item.organizations?.name || 'Unknown organization'}
                          </span>
                        </>
                      )}
                    </div>
                    <button
                      onClick={() => handleUnshare(item.id)}
                      className="text-red-400 hover:text-red-500 transition-colors"
                      title="Remove sharing"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add new sharing */}
          <form onSubmit={handleShare} className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Share With New Target</h3>
            <div className="space-y-3">
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="shareType"
                    value="all"
                    checked={shareType === 'all'}
                    onChange={() => setShareType('all')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-900 dark:text-white">Everyone</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="shareType"
                    value="organization"
                    checked={shareType === 'organization'}
                    onChange={() => setShareType('organization')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-900 dark:text-white">Specific Organization</span>
                </label>
              </div>

              {shareType === 'organization' && (
                <select
                  value={selectedOrgId}
                  onChange={(e) => setSelectedOrgId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
                >
                  <option value="">Select an organization...</option>
                  {orgs.map((org) => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              )}

              <button
                type="submit"
                disabled={isSharing}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {isSharing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Sharing...</>
                ) : (
                  <><Plus className="w-4 h-4" /> Share</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
