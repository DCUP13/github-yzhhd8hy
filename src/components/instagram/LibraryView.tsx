import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Image as ImageIcon, Video as VideoIcon, Upload, Trash2, Loader2, Send, Zap, Play, FileText,
  XCircle, CheckCircle2, X, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { showConfirm } from '../../lib/confirm';

interface MediaAsset {
  id: string;
  file_name: string;
  s3_key: string;
  cloudfront_url: string;
  file_type: 'image' | 'video';
  file_size: number;
  mime_type: string | null;
  transcript: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface LibraryAccount {
  id: string;
  ig_user_id: string | null;
  username: string | null;
  profile_picture_url: string | null;
  user_id: string;
}

type ThumbSize = 'small' | 'medium' | 'large';
const THUMB_KEY = 'ig_library_thumb_size';
const GRID: Record<ThumbSize, string> = {
  small: 'grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2',
  medium: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3',
  large: 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4',
};

function readThumbSize(): ThumbSize {
  const v = localStorage.getItem(THUMB_KEY);
  return v === 'medium' || v === 'large' ? v : 'small';
}

interface Props {
  accounts: LibraryAccount[];
  userId: string;
}

export function LibraryView({ accounts, userId }: Props) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [uploadingFiles, setUploadingFiles] = useState<Array<{ name: string; progress: number; error?: string }>>([]);
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  // Test post state
  const [testPostAssetId, setTestPostAssetId] = useState<string | null>(null);
  const [testPostAccountIds, setTestPostAccountIds] = useState<string[]>([]);
  const [testPostCaption, setTestPostCaption] = useState<string>('');
  const [isPostingTest, setIsPostingTest] = useState(false);
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
    } catch (error: any) {
      console.error('Error fetching media assets:', error);
    } finally {
      setIsLoadingAssets(false);
    }
  }, [userId]);
  const [thumbSize, setThumbSize] = useState<ThumbSize>(readThumbSize);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const changeThumbSize = (size: ThumbSize) => {
    setThumbSize(size);
    localStorage.setItem(THUMB_KEY, size);
  };

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

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

        const { error: insertError } = await supabase
          .from('media_assets')
          .insert({
            user_id: userId, file_name: file.name, s3_key, cloudfront_url,
            file_type: isVideo ? 'video' : 'image', file_size: file.size, mime_type: contentType,
          });

        if (insertError) throw insertError;

        setUploadingFiles(prev => prev.map((f, idx) => idx === i ? { ...f, progress: 100 } : f));
      } catch (error: any) {
        console.error(`Upload failed for ${file.name}:`, error);
        setUploadingFiles(prev => prev.map((f, idx) => idx === i ? { ...f, error: error.message } : f));
        toast.error(`Failed to upload ${file.name}: ${error.message}`);
      }
    }

    setTimeout(() => setUploadingFiles([]), 3000);
    fetchAssets();
  };

  const handleDeleteAsset = async (assetId: string) => {
    const ok = await showConfirm({ message: 'Delete this file from your content library?', variant: 'danger', confirmText: 'Delete' });
    if (!ok) return;
    try {
      const { error } = await supabase.from('media_assets').delete().eq('id', assetId).eq('user_id', userId);
      if (error) throw error;
      setAssets(prev => prev.filter(a => a.id !== assetId));
      toast.success('Asset deleted');
    } catch (error: any) {
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
    } catch (error: any) {
      console.error('Transcription error:', error);
      toast.error(`Transcription failed: ${error.message}`);
    }
  };
  const handleTestPost = async () => {
    if (!testPostAssetId || testPostAccountIds.length === 0) {
      toast.error('Select an asset and at least one account for the test post');
      return;
    }

    setIsPostingTest(true);
    try {
      let successCount = 0;
      let failCount = 0;
      for (const accId of testPostAccountIds) {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/publish-instagram-post`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            action: 'test_post',
            asset_id: testPostAssetId,
            account_id: accId,
            caption: testPostCaption,
          }),
        });

        if (response.ok) {
          successCount++;
        } else {
          failCount++;
          const err = await response.json().catch(() => ({}));
          console.error(`Test post failed for account ${accId}:`, err.error);
        }
      }

      if (failCount === 0) {
        toast.success(`${successCount} test post${successCount !== 1 ? 's' : ''} published!`);
      } else if (successCount === 0) {
        toast.error('All test posts failed');
      } else {
        toast.error(`${successCount} succeeded, ${failCount} failed`);
      }
      setTestPostAssetId(null);
      setTestPostAccountIds([]);
      setTestPostCaption('');
    } catch (error: any) {
      console.error('Test post error:', error);
      toast.error(`Test post failed: ${error.message}`);
    } finally {
      setIsPostingTest(false);
    }
  };
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  const filteredAssets = assets.filter(a => {
    if (filterType !== 'all' && a.file_type !== filterType) return false;
    if (searchQuery && !a.file_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const viewerAsset = viewerIndex !== null ? filteredAssets[viewerIndex] : null;
  const stepViewer = useCallback((dir: number) => {
    setViewerIndex(i => (i === null || filteredAssets.length === 0 ? i : (i + dir + filteredAssets.length) % filteredAssets.length));
  }, [filteredAssets.length]);

  useEffect(() => {
    if (viewerIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewerIndex(null);
      else if (e.key === 'ArrowRight') stepViewer(1);
      else if (e.key === 'ArrowLeft') stepViewer(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewerIndex, stepViewer]);

  useEffect(() => {
    if (viewerIndex !== null && viewerIndex >= filteredAssets.length) setViewerIndex(null);
  }, [viewerIndex, filteredAssets.length]);

  const small = thumbSize === 'small';

  return (
        <div>
          {/* Upload zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files); }}
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-4 sm:p-6 lg:p-8 text-center hover:border-pink-400 dark:hover:border-pink-500 transition-colors cursor-pointer mb-6"
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
            <p className="text-xs text-gray-400 mt-1">
              Files get a new unique filename and upload to instagram/library/
            </p>
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
            <div className="flex flex-wrap items-center gap-3 mb-4">
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
                className="flex-1 min-w-[160px] px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5" role="group" aria-label="Thumbnail size">
                {(['small', 'medium', 'large'] as const).map(size => (
                  <button
                    key={size}
                    onClick={() => changeThumbSize(size)}
                    title={`${size[0].toUpperCase()}${size.slice(1)} thumbnails`}
                    className={`w-8 h-7 text-xs font-medium rounded-md transition-colors ${
                      thumbSize === size
                        ? 'bg-white dark:bg-gray-700 text-pink-600 dark:text-pink-300 shadow-sm'
                        : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                  >
                    {size[0].toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Test post section */}
          {assets.length > 0 && accounts.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300">Test Post (out of schedule)</h3>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
                Select a photo from your library and an account to post it immediately as a test, bypassing the schedule.
              </p>
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <select
                    value={testPostAssetId || ''}
                    onChange={(e) => setTestPostAssetId(e.target.value)}
                    className="flex-1 px-3 py-2.5 text-sm border border-amber-300 dark:border-amber-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">Select a photo...</option>
                    {assets.filter(a => a.file_type === 'image').map(a => (
                      <option key={a.id} value={a.id}>{a.file_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">Select accounts to test post to:</p>
                  <div className="flex flex-wrap gap-2">
                    {accounts.map(a => (
                      <label key={a.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                        testPostAccountIds.includes(a.id)
                          ? 'border-amber-500 bg-amber-100 dark:bg-amber-900/30'
                          : 'border-amber-300 dark:border-amber-600 bg-white dark:bg-gray-700'
                      }`}>
                        <input
                          type="checkbox"
                          checked={testPostAccountIds.includes(a.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setTestPostAccountIds(prev => [...prev, a.id]);
                            } else {
                              setTestPostAccountIds(prev => prev.filter(id => id !== a.id));
                            }
                          }}
                          className="rounded border-amber-300 text-amber-600"
                        />
                        {a.profile_picture_url ? (
                          <img src={a.profile_picture_url} alt="" className="w-5 h-5 rounded-full" />
                        ) : null}
                        <span className="text-sm text-gray-700 dark:text-gray-300">@{a.username || 'Unknown'}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <textarea
                  value={testPostCaption}
                  onChange={(e) => setTestPostCaption(e.target.value)}
                  rows={3}
                  placeholder="Caption (optional)..."
                  className="w-full px-3 py-2.5 text-sm border border-amber-300 dark:border-amber-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                />
                <button
                  onClick={handleTestPost}
                  disabled={!testPostAssetId || testPostAccountIds.length === 0 || isPostingTest}
                  className="px-4 py-2.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                >
                  {isPostingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Post Test ({testPostAccountIds.length} account{testPostAccountIds.length !== 1 ? 's' : ''})
                </button>
              </div>
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
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                {assets.length === 0 ? 'No content yet' : 'Nothing matches your filter'}
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {assets.length === 0
                  ? 'Upload images and videos to build your content library. Your plans pick photos from here.'
                  : 'Try a different filter or search.'}
              </p>
            </div>
          ) : (
            <div className={GRID[thumbSize]}>
              {filteredAssets.map((asset, index) => (
                <div
                  key={asset.id}
                  className="relative group bg-white dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-100 dark:border-gray-700 hover:border-pink-300 dark:hover:border-pink-600 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => setViewerIndex(index)}
                    className="block w-full aspect-square relative focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                    aria-label={`View ${asset.file_name}`}
                  >
                    {asset.file_type === 'video' ? (
                      <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                        <video src={asset.cloudfront_url} className="w-full h-full object-cover" preload="metadata" muted />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <Play className={small ? 'w-5 h-5 text-white' : 'w-8 h-8 text-white'} />
                        </div>
                      </div>
                    ) : (
                      <img src={asset.cloudfront_url} alt={asset.file_name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
                    )}
                    <span className="absolute top-1.5 left-1.5">
                      {asset.file_type === 'video' ? (
                        <VideoIcon className="w-3.5 h-3.5 text-white drop-shadow-lg" />
                      ) : (
                        <ImageIcon className="w-3.5 h-3.5 text-white drop-shadow-lg" />
                      )}
                    </span>
                    {small && asset.transcript && (
                      <span className="absolute top-1.5 right-1.5 bg-green-500 rounded-full p-0.5" title="Transcript ready">
                        <FileText className="w-2.5 h-2.5 text-white" />
                      </span>
                    )}
                  </button>
                  {!small && (
                    <div className="p-2">
                      <p className="text-xs text-gray-700 dark:text-gray-300 truncate">{asset.file_name}</p>
                      <p className="text-[10px] text-gray-400">{formatFileSize(asset.file_size)}</p>
                      {asset.transcript && (
                        <p className="text-[10px] text-green-500 flex items-center gap-1 mt-0.5">
                          <FileText className="w-3 h-3" /> Transcript ready
                        </p>
                      )}
                    </div>
                  )}
                  <div className={`absolute top-1 right-1 flex items-center gap-1 transition-opacity opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 ${small && asset.transcript ? 'mt-5' : ''}`}>
                    {asset.file_type === 'video' && !asset.transcript && !small && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleTranscribe(asset.id); }}
                        className="text-[10px] text-white bg-blue-500/90 hover:bg-blue-500 rounded px-1.5 py-1 flex items-center gap-1"
                      >
                        <FileText className="w-3 h-3" /> Transcribe
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteAsset(asset.id); }}
                      className="text-white bg-red-500/90 hover:bg-red-600 rounded p-1"
                      aria-label="Delete file"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {viewerAsset && (
            <div
              className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 animate-[fadeIn_150ms_ease-out]"
              onClick={() => setViewerIndex(null)}
              role="dialog"
              aria-modal="true"
            >
              <button
                onClick={() => setViewerIndex(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
              {filteredAssets.length > 1 && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); stepViewer(-1); }}
                    className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                    aria-label="Previous"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); stepViewer(1); }}
                    className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                    aria-label="Next"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}
              <div className="flex flex-col items-center max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
                {viewerAsset.file_type === 'video' ? (
                  <video key={viewerAsset.id} src={viewerAsset.cloudfront_url} controls autoPlay className="max-w-[90vw] max-h-[80vh] rounded-lg" />
                ) : (
                  <img key={viewerAsset.id} src={viewerAsset.cloudfront_url} alt={viewerAsset.file_name} className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg" />
                )}
                <div className="mt-3 text-center">
                  <p className="text-sm text-white truncate max-w-[80vw]">{viewerAsset.file_name}</p>
                  <p className="text-xs text-gray-400">
                    {formatFileSize(viewerAsset.file_size)}
                    {viewerAsset.width && viewerAsset.height ? ` · ${viewerAsset.width} x ${viewerAsset.height}` : ''}
                    {filteredAssets.length > 1 ? ` · ${viewerIndex! + 1} of ${filteredAssets.length}` : ''}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
  );
}
