import React, { useState, useEffect } from 'react';
import { Cloud, AlertCircle, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ContentStorageSettings {
  cloudfrontDomain: string;
  bucketName: string;
  bucketRegion: string;
}

interface ContentStorageTabProps {
  userId?: string;
}

export function ContentStorageTab({ userId }: ContentStorageTabProps = {}) {
  const [settings, setSettings] = useState<ContentStorageSettings>({
    cloudfrontDomain: '',
    bucketName: '',
    bucketRegion: 'us-east-1',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const getCurrentUserId = async (): Promise<string | null> => {
    if (userId) return userId;
    const user = await supabase.auth.getUser();
    return user.data.user?.id || null;
  };

  const fetchSettings = async () => {
    try {
      const currentUserId = await getCurrentUserId();
      if (!currentUserId) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('media_storage_config')
        .select('*')
        .eq('user_id', currentUserId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setSettings({
          cloudfrontDomain: data.cloudfront_domain || '',
          bucketName: data.bucket_name || '',
          bucketRegion: data.bucket_region || 'us-east-1',
        });
      }
    } catch (error) {
      console.error('Error fetching content storage settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings.cloudfrontDomain || !settings.bucketName) return;

    setIsSaving(true);
    try {
      const currentUserId = await getCurrentUserId();
      if (!currentUserId) throw new Error('Not authenticated');

      const domain = settings.cloudfrontDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');

      const { error } = await supabase
        .from('media_storage_config')
        .upsert({
          user_id: currentUserId,
          cloudfront_domain: domain,
          bucket_name: settings.bucketName,
          bucket_region: settings.bucketRegion,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;

      setSettings(prev => ({ ...prev, cloudfrontDomain: domain }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving content storage settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Cloud className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Content Storage</h2>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-500 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">
              S3 Bucket + CloudFront CDN
            </h3>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-400">
              Your uploaded Instagram content (images and videos) is stored in your own S3 bucket
              and served through CloudFront for fast public access. The AWS credentials used for
              uploading are already configured in the backend — you only need to provide the bucket
              name and CloudFront domain below.
            </p>
            <p className="mt-2 text-xs text-blue-600 dark:text-blue-500">
              Bucket structure: instagram/library/&#123;user_id&#125;/ for raw uploads,
              instagram/&#123;user_id&#125;/posts/ and /reels/ for edited content,
              instagram/&#123;user_id&#125;/scheduled/ for approved posts, and
              instagram/&#123;user_id&#125;/posted/ for published content.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label htmlFor="cloudfrontDomain" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            CloudFront Distribution Domain
          </label>
          <input
            type="text"
            id="cloudfrontDomain"
            value={settings.cloudfrontDomain}
            onChange={(e) => setSettings(prev => ({ ...prev, cloudfrontDomain: e.target.value }))}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            placeholder="d292js7mlprar.cloudfront.net"
            required
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Your CloudFront distribution domain name (without https://)
          </p>
        </div>

        <div>
          <label htmlFor="bucketName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            S3 Bucket Name
          </label>
          <input
            type="text"
            id="bucketName"
            value={settings.bucketName}
            onChange={(e) => setSettings(prev => ({ ...prev, bucketName: e.target.value }))}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            placeholder="my-instagram-content-bucket"
            required
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            The name of your S3 bucket where content will be stored
          </p>
        </div>

        <div>
          <label htmlFor="bucketRegion" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Bucket Region
          </label>
          <input
            type="text"
            id="bucketRegion"
            value={settings.bucketRegion}
            onChange={(e) => setSettings(prev => ({ ...prev, bucketRegion: e.target.value }))}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            placeholder="us-east-1"
            required
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            AWS region where the bucket is located
          </p>
        </div>

        <div className="flex items-center justify-end gap-4 pt-4">
          {saveSuccess && (
            <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
              <Check className="w-4 h-4" />
              Settings saved successfully!
            </span>
          )}
          <button
            type="submit"
            disabled={isSaving}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${
              isSaving ? 'bg-blue-400 cursor-wait' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
