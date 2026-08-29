import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Image as ImageIcon,
  Video as VideoIcon,
  Upload,
  Trash2,
  Plus,
  Check,
  X,
  RefreshCw,
  Clock,
  Calendar,
  Shuffle,
  Eye,
  Play,
  FileText,
  AlertCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock3,
  Send,
  Wand2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';

interface MediaAsset {
  id: string;
  file_name: string;
  s3_key: string;
  cloudfront_url: string;
  file_type: 'image' | 'video';
  file_size: number;
  mime_type: string | null;
  duration_seconds: number | null;
  transcript: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

interface IgAccount {
  id: string;
  ig_user_id: string | null;
  username: string | null;
  profile_picture_url: string | null;
  user_id: string;
}

interface PostVariation {
  id: string;
  batch_id: string;
  account_id: string;
  cloudfront_url: string;
  s3_key: string;
  caption: string;
  hashtags: string[];
  font_used: string | null;
  status: string;
  scheduled_for: string | null;
  ig_media_id: string | null;
  permalink: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

interface PostBatch {
  id: string;
  base_caption: string;
  hashtags: string[];
  content_type: string;
  selected_asset_ids: string[];
  variation_settings: Record<string, boolean>;
  randomize_content: boolean;
  preview_count: number;
  prompt_id: string | null;
  carousel_size: number;
  status: string;
  created_at: string;
}

interface PostingSchedule {
  id: string;
  account_id: string;
  auto_posting_enabled: boolean;
  posts_per_day: number;
  start_time: string;
  end_time: string;
  active_days: number[];
  min_gap_minutes: number;
  carousel_size: number;
}

interface PostsAutoTabProps {
  accounts: IgAccount[];
  userId: string;
}

type SubView = 'library' | 'create' | 'staging' | 'schedules';

export function PostsAutoTab({ accounts, userId }: PostsAutoTabProps) {
  const [subView, setSubView] = useState<SubView>('library');
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [uploadingFiles, setUploadingFiles] = useState<Array<{ name: string; progress: number; error?: string }>>([]);
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Batch creation state
  const [baseCaption, setBaseCaption] = useState('');
  const [hashtagsText, setHashtagsText] = useState('');
  const [contentType, setContentType] = useState<'post' | 'reel'>('post');
  const [previewCount, setPreviewCount] = useState(3);
  const [randomizeContent, setRandomizeContent] = useState(true);
  const [varyCaption, setVaryCaption] = useState(true);
  const [varyHashtags, setVaryHashtags] = useState(true);
  const [varyFont, setVaryFont] = useState(true);
  const [selectedPromptId, setSelectedPromptId] = useState<string>('');
  const [availablePrompts, setAvailablePrompts] = useState<Array<{ id: string; title: string }>>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Staging state
  const [batches, setBatches] = useState<PostBatch[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [variations, setVariations] = useState<PostVariation[]>([]);
  const [isLoadingVariations, setIsLoadingVariations] = useState(false);

  // Schedules state
  const [schedules, setSchedules] = useState<PostingSchedule[]>([]);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAssets = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('media_assets')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAssets(data || []);
    } catch (error) {
      console.error('Error fetching media assets:', error);
    } finally {
      setIsLoadingAssets(false);
    }
  }, [userId]);

  const fetchBatches = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('instagram_post_batches')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBatches(data || []);
    } catch (error) {
      console.error('Error fetching batches:', error);
    }
  }, [userId]);

  const fetchSchedules = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('instagram_posting_schedules')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;

      if (data && data.length > 0) {
        setSchedules(data);
      } else if (accounts.length > 0) {
        // Create default schedules for accounts that don't have one
        for (const account of accounts) {
          await supabase
            .from('instagram_posting_schedules')
            .upsert({
              user_id: userId,
              account_id: account.id,
              auto_posting_enabled: false,
              posts_per_day: 1,
              start_time: '09:00',
              end_time: '21:00',
              active_days: [0, 1, 2, 3, 4, 5, 6],
              min_gap_minutes: 60,
              carousel_size: 1,
            }, { onConflict: 'user_id,account_id' });
        }
        const { data: newSchedules } = await supabase
          .from('instagram_posting_schedules')
          .select('*')
          .eq('user_id', userId);
        setSchedules(newSchedules || []);
      }
    } catch (error) {
      console.error('Error fetching schedules:', error);
    } finally {
      setIsLoadingSchedules(false);
    }
  }, [userId, accounts]);

  const fetchVariations = useCallback(async (batchId: string) => {
    setIsLoadingVariations(true);
    try {
      const { data, error } = await supabase
        .from('instagram_post_variations')
        .select('*')
        .eq('batch_id', batchId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setVariations(data || []);
    } catch (error) {
      console.error('Error fetching variations:', error);
    } finally {
      setIsLoadingVariations(false);
    }
  }, []);

  useEffect(() => {
    fetchAssets();
    fetchBatches();
    fetchSchedules();
  }, [fetchAssets, fetchBatches, fetchSchedules]);

  useEffect(() => {
    // Fetch available prompts for caption variation
    const fetchPrompts = async () => {
      const { data } = await supabase
        .from('prompts')
        .select('id, title')
        .eq('user_id', userId)
        .order('title');
      setAvailablePrompts(data || []);
    };
    fetchPrompts();
  }, [userId]);

  // Realtime subscription for assets
  useEffect(() => {
    const channel = supabase
      .channel(`media_assets_rt_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'media_assets', filter: `user_id=eq.${userId}` }, () => fetchAssets())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchAssets]);

  const handleFileUpload = async (files: FileList) => {
    const fileList = Array.from(files);
    setUploadingFiles(fileList.map(f => ({ name: f.name, progress: 0 })));

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const isVideo = file.type.startsWith('video/');
      const contentType = file.type || (isVideo ? 'video/mp4' : 'image/jpeg');

      try {
        // Send the file to the edge function, which uploads to S3 server-side.
        // This avoids browser CORS issues with direct S3 uploads.
        const formData = new FormData();
        formData.append('file', file);
        formData.append('file_name', file.name);
        formData.append('content_type', contentType);
        formData.append('folder', 'library');

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-s3-upload-url`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: formData,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || `Upload failed (${response.status})`);
        }

        const { s3_key, cloudfront_url } = await response.json();

        // Save metadata to database
        const { error: insertError } = await supabase
          .from('media_assets')
          .insert({
            user_id: userId,
            file_name: file.name,
            s3_key: s3_key,
            cloudfront_url: cloudfront_url,
            file_type: isVideo ? 'video' : 'image',
            file_size: file.size,
            mime_type: contentType,
          });

        if (insertError) throw insertError;

        setUploadingFiles(prev => prev.map((f, idx) => idx === i ? { ...f, progress: 100 } : f));
      } catch (error) {
        console.error(`Upload failed for ${file.name}:`, error);
        setUploadingFiles(prev => prev.map((f, idx) => idx === i ? { ...f, error: error.message } : f));
        toast.error(`Failed to upload ${file.name}: ${error.message}`);
      }
    }

    // Clear upload list after a delay
    setTimeout(() => setUploadingFiles([]), 3000);
    fetchAssets();
  };

  const handleDeleteAsset = async (assetId: string) => {
    try {
      const { error } = await supabase
        .from('media_assets')
        .delete()
        .eq('id', assetId)
        .eq('user_id', userId);

      if (error) throw error;
      setAssets(prev => prev.filter(a => a.id !== assetId));
      setSelectedAssets(prev => { const n = new Set(prev); n.delete(assetId); return n; });
      toast.success('Asset deleted');
    } catch (error) {
      console.error('Error deleting asset:', error);
      toast.error('Failed to delete asset');
    }
  };

  const handleTranscribe = async (assetId: string) => {
    try {
      toast.success('Transcribing video... this may take a moment.');
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ asset_id: assetId }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Transcription failed');
      }

      const { transcript } = await response.json();
      setAssets(prev => prev.map(a => a.id === assetId ? { ...a, transcript } : a));
      toast.success('Transcription complete');
    } catch (error) {
      console.error('Transcription error:', error);
      toast.error(`Transcription failed: ${error.message}`);
    }
  };

  const handleCreateBatch = async () => {
    if (selectedAssets.size === 0) {
      toast.error('Select at least one library asset');
      return;
    }
    if (accounts.length === 0) {
      toast.error('Connect an Instagram account first');
      return;
    }
    if (!baseCaption.trim()) {
      toast.error('Enter a base caption');
      return;
    }

    setIsGenerating(true);
    try {
      const hashtags = hashtagsText
        .split(/[,\n\s]+/)
        .map(h => h.trim().replace(/^#/, ''))
        .filter(h => h.length > 0)
        .map(h => `#${h}`);

      const { data: batch, error } = await supabase
        .from('instagram_post_batches')
        .insert({
          user_id: userId,
          base_caption: baseCaption,
          hashtags: hashtags,
          content_type: contentType,
          selected_asset_ids: Array.from(selectedAssets),
          variation_settings: {
            caption: varyCaption,
            hashtags: varyHashtags,
            font: varyFont,
          },
          randomize_content: randomizeContent,
          preview_count: previewCount,
          prompt_id: selectedPromptId || null,
          carousel_size: 1,
          status: 'draft',
        })
        .select()
        .single();

      if (error) throw error;

      // Call the generate-post-variations edge function
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-post-variations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ batch_id: batch.id }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Variation generation failed');
      }

      toast.success('Variations generated! Review them in Staging.');
      setBaseCaption('');
      setHashtagsText('');
      setSelectedAssets(new Set());
      fetchBatches();
      setActiveBatchId(batch.id);
      setSubView('staging');
      fetchVariations(batch.id);
    } catch (error) {
      console.error('Error creating batch:', error);
      toast.error(`Failed to create batch: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApproveVariation = async (variationId: string) => {
    try {
      const { error } = await supabase
        .from('instagram_post_variations')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', variationId);

      if (error) throw error;
      setVariations(prev => prev.map(v => v.id === variationId ? { ...v, status: 'approved' } : v));
      toast.success('Variation approved');
    } catch (error) {
      console.error('Error approving variation:', error);
      toast.error('Failed to approve');
    }
  };

  const handleRejectVariation = async (variationId: string) => {
    try {
      const { error } = await supabase
        .from('instagram_post_variations')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', variationId);

      if (error) throw error;
      setVariations(prev => prev.map(v => v.id === variationId ? { ...v, status: 'rejected' } : v));
      toast.success('Variation rejected');
    } catch (error) {
      console.error('Error rejecting variation:', error);
      toast.error('Failed to reject');
    }
  };

  const handleScheduleApproved = async () => {
    const approved = variations.filter(v => v.status === 'approved');
    if (approved.length === 0) {
      toast.error('No approved variations to schedule');
      return;
    }

    try {
      // Calculate scheduled times spread across the next few days
      const now = new Date();
      for (let i = 0; i < approved.length; i++) {
        const variation = approved[i];
        const scheduleTime = new Date(now.getTime() + (i + 1) * 3 * 60 * 60 * 1000); // 3 hours apart

        // Move content to scheduled folder and set status
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/publish-instagram-post`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            variation_id: variation.id,
            action: 'schedule',
          }),
        });

        await supabase
          .from('instagram_post_variations')
          .update({
            scheduled_for: scheduleTime.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', variation.id);
      }

      toast.success(`${approved.length} posts scheduled! They will be published automatically.`);
      fetchVariations(activeBatchId!);
    } catch (error) {
      console.error('Error scheduling:', error);
      toast.error('Failed to schedule posts');
    }
  };

  const handleRetryVariation = async (variationId: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/publish-instagram-post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ variation_id: variationId, action: 'publish' }),
      });

      if (response.ok) {
        toast.success('Post published successfully!');
      } else {
        const err = await response.json().catch(() => ({}));
        toast.error(`Publish failed: ${err.error || 'Unknown error'}`);
      }
      fetchVariations(activeBatchId!);
    } catch (error) {
      console.error('Retry error:', error);
      toast.error('Retry failed');
    }
  };

  const handleScheduleUpdate = async (scheduleId: string, updates: Partial<PostingSchedule>) => {
    try {
      const { error } = await supabase
        .from('instagram_posting_schedules')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', scheduleId);

      if (error) throw error;
      setSchedules(prev => prev.map(s => s.id === scheduleId ? { ...s, ...updates } : s));
    } catch (error) {
      console.error('Error updating schedule:', error);
      toast.error('Failed to update schedule');
    }
  };

  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssets(prev => {
      const n = new Set(prev);
      if (n.has(assetId)) n.delete(assetId);
      else n.add(assetId);
      return n;
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString([], {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      staged: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
      approved: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
      rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
      scheduled: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
      publishing: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
      published: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
      failed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
      generating: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    };
    return styles[status] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
  };

  const filteredAssets = assets.filter(a => {
    if (filterType !== 'all' && a.file_type !== filterType) return false;
    if (searchQuery && !a.file_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const subTabs: Array<{ id: SubView; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'library', label: 'Content Library', icon: ImageIcon },
    { id: 'create', label: 'Create Batch', icon: Wand2 },
    { id: 'staging', label: 'Staging', icon: Eye },
    { id: 'schedules', label: 'Schedules', icon: Clock },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-tab navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-1 overflow-x-auto">
          {subTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setSubView(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                subView === tab.id
                  ? 'border-pink-500 text-pink-600 dark:text-pink-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.id === 'staging' && batches.filter(b => b.status === 'ready').length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-pink-500 text-white rounded-full">
                  {batches.filter(b => b.status === 'ready').length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Content Library */}
      {subView === 'library' && (
        <div>
          {/* Upload zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files); }}
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:border-pink-400 dark:hover:border-pink-500 transition-colors cursor-pointer mb-6"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files && e.target.files.length > 0) handleFileUpload(e.target.files); }}
            />
            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Drag and drop images and videos here, or click to browse
            </p>
            <p className="text-xs text-gray-400 mt-1">Files upload to your S3 bucket at instagram/library/</p>
          </div>

          {/* Upload progress */}
          {uploadingFiles.length > 0 && (
            <div className="mb-6 space-y-2">
              {uploadingFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-lg p-3">
                  {f.error ? (
                    <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  ) : f.progress === 100 ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                  ) : (
                    <Loader2 className="w-5 h-5 text-pink-500 animate-spin flex-shrink-0" />
                  )}
                  <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{f.name}</span>
                  {f.error && <span className="text-xs text-red-500">{f.error}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Filter and search */}
          {assets.length > 0 && (
            <div className="flex items-center gap-3 mb-4">
              <div className="flex gap-1">
                {(['all', 'image', 'video'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={`px-3 py-1.5 text-sm rounded-lg capitalize ${
                      filterType === type
                        ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300'
                        : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    {type}s
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by filename..."
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          )}

          {/* Asset grid */}
          {isLoadingAssets ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-pink-500 animate-spin" />
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="text-center py-12">
              <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No content yet</h3>
              <p className="text-gray-500 dark:text-gray-400">Upload images and videos to build your content library.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredAssets.map(asset => (
                <div
                  key={asset.id}
                  className={`relative group bg-white dark:bg-gray-800 rounded-xl overflow-hidden border-2 transition-all ${
                    selectedAssets.has(asset.id) ? 'border-pink-500' : 'border-transparent'
                  }`}
                >
                  <div
                    className="aspect-square cursor-pointer relative"
                    onClick={() => toggleAssetSelection(asset.id)}
                  >
                    {asset.file_type === 'video' ? (
                      <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                        <video src={asset.cloudfront_url} className="w-full h-full object-cover" preload="metadata" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <Play className="w-8 h-8 text-white" />
                        </div>
                      </div>
                    ) : (
                      <img src={asset.cloudfront_url} alt={asset.file_name} className="w-full h-full object-cover" loading="lazy" />
                    )}
                    {selectedAssets.has(asset.id) && (
                      <div className="absolute top-2 right-2 bg-pink-500 rounded-full p-1">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                    <div className="absolute top-2 left-2">
                      {asset.file_type === 'video' ? (
                        <VideoIcon className="w-4 h-4 text-white drop-shadow-lg" />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-white drop-shadow-lg" />
                      )}
                    </div>
                  </div>
                  <div className="p-2">
                    <p className="text-xs text-gray-700 dark:text-gray-300 truncate">{asset.file_name}</p>
                    <p className="text-[10px] text-gray-400">{formatFileSize(asset.file_size)}</p>
                    {asset.transcript && (
                      <p className="text-[10px] text-green-500 flex items-center gap-1 mt-0.5">
                        <FileText className="w-3 h-3" /> Transcript ready
                      </p>
                    )}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                    {asset.file_type === 'video' && !asset.transcript && (
                      <button
                        onClick={() => handleTranscribe(asset.id)}
                        className="text-xs text-white bg-blue-500/80 hover:bg-blue-500 rounded px-2 py-1 flex items-center gap-1"
                      >
                        <FileText className="w-3 h-3" /> Transcribe
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteAsset(asset.id)}
                      className="text-xs text-white bg-red-500/80 hover:bg-red-500 rounded px-2 py-1 flex items-center gap-1 ml-auto"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Batch */}
      {subView === 'create' && (
        <div className="max-w-2xl space-y-6">
          {assets.length === 0 ? (
            <div className="text-center py-12">
              <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">Upload content to your library first, then create a batch.</p>
              <button onClick={() => setSubView('library')} className="mt-4 px-4 py-2 text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg">
                Go to Library
              </button>
            </div>
          ) : (
            <>
              {/* Selected assets preview */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Selected Content ({selectedAssets.size})
                </label>
                {selectedAssets.size === 0 ? (
                  <button
                    onClick={() => setSubView('library')}
                    className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center text-sm text-gray-500 hover:border-pink-400 transition-colors"
                  >
                    Select content from your library
                  </button>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {assets.filter(a => selectedAssets.has(a.id)).map(asset => (
                      <div key={asset.id} className="relative w-16 h-16 rounded-lg overflow-hidden">
                        {asset.file_type === 'video' ? (
                          <video src={asset.cloudfront_url} className="w-full h-full object-cover" preload="metadata" />
                        ) : (
                          <img src={asset.cloudfront_url} alt="" className="w-full h-full object-cover" />
                        )}
                        <button
                          onClick={() => toggleAssetSelection(asset.id)}
                          className="absolute top-0 right-0 bg-black/60 text-white p-0.5 rounded-bl"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Content type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Content Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setContentType('post')}
                    className={`px-4 py-2 text-sm rounded-lg ${contentType === 'post' ? 'bg-pink-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
                  >
                    Post (Image)
                  </button>
                  <button
                    onClick={() => setContentType('reel')}
                    className={`px-4 py-2 text-sm rounded-lg ${contentType === 'reel' ? 'bg-pink-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
                  >
                    Reel (Video)
                  </button>
                </div>
              </div>

              {/* Base caption */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Base Caption</label>
                <textarea
                  value={baseCaption}
                  onChange={(e) => setBaseCaption(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Write the base caption for your posts..."
                />
              </div>

              {/* Hashtags */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hashtags</label>
                <input
                  type="text"
                  value={hashtagsText}
                  onChange={(e) => setHashtagsText(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="#realestate #luxury #home"
                />
                <p className="mt-1 text-xs text-gray-500">Separate with spaces or commas</p>
              </div>

              {/* Preview count */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Number of Posts to Preview: {previewCount}
                </label>
                <input
                  type="range"
                  min="1"
                  max={Math.max(1, accounts.length)}
                  value={previewCount}
                  onChange={(e) => setPreviewCount(parseInt(e.target.value))}
                  className="w-full accent-pink-500"
                />
                <p className="text-xs text-gray-500">One variation per account (max {accounts.length})</p>
              </div>

              {/* Variation settings */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">What to Vary</h4>
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <input type="checkbox" checked={varyCaption} onChange={(e) => setVaryCaption(e.target.checked)} className="rounded border-gray-300 text-pink-600" />
                  Caption wording (AI rephrasing)
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <input type="checkbox" checked={varyHashtags} onChange={(e) => setVaryHashtags(e.target.checked)} className="rounded border-gray-300 text-pink-600" />
                  Hashtag order (shuffle)
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <input type="checkbox" checked={varyFont} onChange={(e) => setVaryFont(e.target.checked)} className="rounded border-gray-300 text-pink-600" />
                  On-image text font (random per account)
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <input type="checkbox" checked={randomizeContent} onChange={(e) => setRandomizeContent(e.target.checked)} className="rounded border-gray-300 text-pink-600" />
                  Randomize content to each account
                </label>
              </div>

              {/* Prompt selector */}
              {varyCaption && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Caption Variation Prompt (optional)
                  </label>
                  <select
                    value={selectedPromptId}
                    onChange={(e) => setSelectedPromptId(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">No AI prompt (use mechanical variation only)</option>
                    {availablePrompts.map(p => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">Select a prompt from your Prompts page to control how captions are rephrased</p>
                </div>
              )}

              {/* Generate button */}
              <button
                onClick={handleCreateBatch}
                disabled={isGenerating || selectedAssets.size === 0 || !baseCaption.trim()}
                className="w-full px-6 py-3 text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Generating Variations...</>
                ) : (
                  <><Wand2 className="w-4 h-4" /> Generate Variations</>
                )}
              </button>
            </>
          )}
        </div>
      )}

      {/* Staging */}
      {subView === 'staging' && (
        <div>
          {/* Batch selector */}
          {batches.length > 1 && (
            <div className="mb-4">
              <select
                value={activeBatchId || ''}
                onChange={(e) => { setActiveBatchId(e.target.value); fetchVariations(e.target.value); }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {batches.map(b => (
                  <option key={b.id} value={b.id}>
                    Batch: {b.base_caption.slice(0, 30)}... ({b.status})
                  </option>
                ))}
              </select>
            </div>
          )}

          {batches.length === 0 ? (
            <div className="text-center py-12">
              <Eye className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No batches yet</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">Create a batch to generate and preview post variations.</p>
              <button onClick={() => setSubView('create')} className="px-4 py-2 text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg">
                Create a Batch
              </button>
            </div>
          ) : isLoadingVariations ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-pink-500 animate-spin" />
            </div>
          ) : (
            <>
              {/* Bulk actions */}
              {variations.some(v => v.status === 'approved') && (
                <div className="flex justify-end mb-4">
                  <button
                    onClick={handleScheduleApproved}
                    className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg flex items-center gap-2"
                  >
                    <Calendar className="w-4 h-4" />
                    Schedule All Approved ({variations.filter(v => v.status === 'approved').length})
                  </button>
                </div>
              )}

              {/* Variation cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {variations.map(variation => {
                  const account = accounts.find(a => a.id === variation.account_id);
                  return (
                    <div key={variation.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                      {/* Account header */}
                      <div className="flex items-center gap-2 p-3 border-b border-gray-100 dark:border-gray-700">
                        {account?.profile_picture_url ? (
                          <img src={account.profile_picture_url} alt="" className="w-8 h-8 rounded-full" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                            <ImageIcon className="w-4 h-4 text-gray-400" />
                          </div>
                        )}
                        <span className="text-sm font-medium text-gray-900 dark:text-white">@{account?.username || 'Unknown'}</span>
                        <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBadge(variation.status)}`}>
                          {variation.status}
                        </span>
                      </div>

                      {/* Media preview */}
                      <div className="aspect-square bg-gray-100 dark:bg-gray-900 relative">
                        {variation.s3_key.endsWith('.mp4') || variation.s3_key.endsWith('.mov') ? (
                          <video src={variation.cloudfront_url} className="w-full h-full object-cover" controls preload="metadata" />
                        ) : (
                          <img src={variation.cloudfront_url} alt="" className="w-full h-full object-cover" />
                        )}
                      </div>

                      {/* Caption */}
                      <div className="p-3">
                        <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">{variation.caption}</p>
                        {variation.hashtags.length > 0 && (
                          <p className="text-xs text-blue-500 mt-1 line-clamp-1">{variation.hashtags.join(' ')}</p>
                        )}
                        {variation.font_used && (
                          <p className="text-[10px] text-gray-400 mt-1">Font: {variation.font_used}</p>
                        )}

                        {/* Scheduled time */}
                        {variation.scheduled_for && (
                          <p className="text-xs text-purple-500 mt-1 flex items-center gap-1">
                            <Clock3 className="w-3 h-3" /> {formatDate(variation.scheduled_for)}
                          </p>
                        )}

                        {/* Error message */}
                        {variation.error_message && (
                          <p className="text-xs text-red-500 mt-1 flex items-start gap-1">
                            <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" /> {variation.error_message}
                          </p>
                        )}

                        {/* Permalink */}
                        {variation.permalink && (
                          <a href={variation.permalink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline mt-1 inline-block">
                            View on Instagram
                          </a>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 mt-3">
                          {(variation.status === 'staged' || variation.status === 'rejected') && (
                            <>
                              <button
                                onClick={() => handleApproveVariation(variation.id)}
                                className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg flex items-center justify-center gap-1"
                              >
                                <Check className="w-3 h-3" /> Approve
                              </button>
                              <button
                                onClick={() => handleRejectVariation(variation.id)}
                                className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg flex items-center justify-center gap-1"
                              >
                                <X className="w-3 h-3" /> Reject
                              </button>
                            </>
                          )}
                          {variation.status === 'failed' && (
                            <button
                              onClick={() => handleRetryVariation(variation.id)}
                              className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg flex items-center justify-center gap-1"
                            >
                              <RefreshCw className="w-3 h-3" /> Retry
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Schedules */}
      {subView === 'schedules' && (
        <div>
          {isLoadingSchedules ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-pink-500 animate-spin" />
            </div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No schedules yet</h3>
              <p className="text-gray-500 dark:text-gray-400">Connect an Instagram account to set up posting schedules.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {schedules.map(schedule => {
                const account = accounts.find(a => a.id === schedule.account_id);
                return (
                  <div key={schedule.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
                    <div className="flex items-center gap-3 mb-4">
                      {account?.profile_picture_url ? (
                        <img src={account.profile_picture_url} alt="" className="w-10 h-10 rounded-full" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">@{account?.username || 'Unknown'}</p>
                        <p className="text-xs text-gray-400">Posting schedule</p>
                      </div>
                      <button
                        onClick={() => handleScheduleUpdate(schedule.id, { auto_posting_enabled: !schedule.auto_posting_enabled })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${schedule.auto_posting_enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${schedule.auto_posting_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Posts per day</label>
                        <input
                          type="number"
                          min="0.5"
                          step="0.5"
                          value={schedule.posts_per_day}
                          onChange={(e) => handleScheduleUpdate(schedule.id, { posts_per_day: parseFloat(e.target.value) })}
                          className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Min gap (minutes)</label>
                        <input
                          type="number"
                          min="15"
                          value={schedule.min_gap_minutes}
                          onChange={(e) => handleScheduleUpdate(schedule.id, { min_gap_minutes: parseInt(e.target.value) })}
                          className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Start time</label>
                        <input
                          type="time"
                          value={schedule.start_time}
                          onChange={(e) => handleScheduleUpdate(schedule.id, { start_time: e.target.value })}
                          className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">End time</label>
                        <input
                          type="time"
                          value={schedule.end_time}
                          onChange={(e) => handleScheduleUpdate(schedule.id, { end_time: e.target.value })}
                          className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                    </div>

                    {/* Active days */}
                    <div className="mt-3">
                      <label className="block text-xs text-gray-500 mb-2">Active days</label>
                      <div className="flex gap-1">
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              const days = schedule.active_days.includes(idx)
                                ? schedule.active_days.filter(d => d !== idx)
                                : [...schedule.active_days, idx].sort();
                              handleScheduleUpdate(schedule.id, { active_days: days });
                            }}
                            className={`w-8 h-8 text-xs rounded-lg ${schedule.active_days.includes(idx)
                              ? 'bg-pink-600 text-white'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
