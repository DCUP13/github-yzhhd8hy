import React, { useState, useEffect, useCallback } from 'react';
import { Linkedin, ArrowLeft, Image as ImageIcon, Link as LinkIcon, Sparkles, Send, Clock, Trash2, CheckCircle2, XCircle, AlertCircle, Globe, Users, Loader2, X, Video as VideoIcon, FileText, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { AppView } from '../lib/router';

interface LinkedInProps {
  onSignOut: () => void;
  currentView: AppView;
  queryParams: Record<string, string>;
  navigateToApp: (view: AppView, params?: Record<string, string>) => void;
}

interface LinkedInAccount {
  id: string;
  user_id: string;
  person_urn: string;
  member_name: string;
  member_email: string | null;
  profile_picture_url: string | null;
  connected: boolean;
  token_expired: boolean;
}

interface LinkedInPost {
  id: string;
  content_text: string;
  article_url: string | null;
  article_title: string | null;
  article_description: string | null;
  image_url: string | null;
  image_asset_id: string | null;
  video_url: string | null;
  video_asset_id: string | null;
  document_url: string | null;
  document_asset_id: string | null;
  visibility: string;
  status: string;
  scheduled_for: string | null;
  linkedin_post_urn: string | null;
  permalink: string | null;
  error_message: string | null;
  created_at: string;
}

type PostType = 'text' | 'article' | 'image' | 'video' | 'document';

export function LinkedIn({ queryParams, navigateToApp }: LinkedInProps) {
  const [account, setAccount] = useState<LinkedInAccount | null>(null);
  const [posts, setPosts] = useState<LinkedInPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [oauthMessage, setOauthMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Composer state
  const [contentText, setContentText] = useState('');
  const [postType, setPostType] = useState<PostType>('text');
  const [articleUrl, setArticleUrl] = useState('');
  const [articleTitle, setArticleTitle] = useState('');
  const [articleDescription, setArticleDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageAssetId, setImageAssetId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<'PUBLIC' | 'CONNECTIONS'>('PUBLIC');
  const [scheduledFor, setScheduledFor] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoAssetId, setVideoAssetId] = useState<string | null>(null);
  const [documentUrl, setDocumentUrl] = useState('');
  const [documentAssetId, setDocumentAssetId] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [isDeletingFromLinkedIn, setIsDeletingFromLinkedIn] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const fetchAccount = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('linkedin_accounts')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching LinkedIn account:', error);
      return null;
    }
    return data as LinkedInAccount | null;
  }, []);

  const fetchPosts = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('linkedin_posts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching LinkedIn posts:', error);
      return [];
    }
    return (data || []) as LinkedInPost[];
  }, []);

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [acct, userPosts] = await Promise.all([
        fetchAccount(user.id),
        fetchPosts(user.id),
      ]);

      setAccount(acct);
      setPosts(userPosts);

      // Check OAuth callback params
      if (queryParams.oauth === 'success') {
        setOauthMessage({ type: 'success', text: 'LinkedIn connected successfully!' });
      } else if (queryParams.oauth_error) {
        const errorMessages: Record<string, string> = {
          invalid_state: 'Invalid state parameter. Please try connecting again.',
          no_user: 'No user found. Please try again.',
          missing_params: 'Missing required parameters from LinkedIn.',
          not_configured: 'LinkedIn OAuth is not configured. Add your LinkedIn app credentials.',
          token_exchange_failed: 'Failed to exchange authorization code for access token.',
          profile_fetch_failed: 'Failed to fetch your LinkedIn profile.',
          no_person_id: 'Could not retrieve your LinkedIn person ID.',
        };
        setOauthMessage({
          type: 'error',
          text: errorMessages[queryParams.oauth_error] || `Connection error: ${queryParams.oauth_error}`,
        });
      }
    } catch (error) {
      console.error('Error loading LinkedIn data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [queryParams, fetchAccount, fetchPosts]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Poll for status updates on scheduled/publishing posts
  useEffect(() => {
    if (posts.some(p => p.status === 'publishing' || p.status === 'scheduled')) {
      const interval = setInterval(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const updated = await fetchPosts(user.id);
          setPosts(updated);
        }
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [posts, fetchPosts]);

  const handleConnect = async () => {
    setIsConnecting(true);
    setOauthMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setOauthMessage({ type: 'error', text: 'Not authenticated. Please sign in again.' });
        setIsConnecting(false);
        return;
      }

      const appOrigin = window.location.origin;
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/linkedin-oauth-start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ app_origin: appOrigin }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to start OAuth flow');
      }

      const { auth_url } = await response.json();
      // Open LinkedIn login in a new tab — LinkedIn blocks iframe embedding,
      // so it can't load inside the dev environment's iframe. The Supabase callback
      // will redirect back to the app after the exchange completes.
      window.open(auth_url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('LinkedIn connect error:', error);
      setOauthMessage({ type: 'error', text: error.message || 'Failed to connect to LinkedIn.' });
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!account) return;
    if (!window.confirm('Disconnect your LinkedIn account? Scheduled posts will not be published.')) return;

    try {
      await supabase
        .from('linkedin_accounts')
        .delete()
        .eq('id', account.id);

      setAccount(null);
      setOauthMessage(null);
    } catch (error) {
      console.error('Error disconnecting LinkedIn:', error);
      setOauthMessage({ type: 'error', text: 'Failed to disconnect account.' });
    }
  };

  const handleImageUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-s3-upload-url`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_name: file.name,
          file_type: file.type,
          prefix: 'linkedin/posts',
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to get upload URL');
      }

      const { upload_url, public_url, asset_id } = await response.json();

      const uploadRes = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error('Failed to upload image');
      }

      setImageUrl(public_url);
      setImageAssetId(asset_id || null);
      setPostType('image');
    } catch (error) {
      console.error('Image upload error:', error);
      setOauthMessage({ type: 'error', text: error.message || 'Failed to upload image.' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleVideoUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-s3-upload-url`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_name: file.name,
          file_type: file.type,
          prefix: 'linkedin/videos',
        }),
      });

      if (!response.ok) throw new Error('Failed to get upload URL');
      const { upload_url, public_url, asset_id } = await response.json();

      const uploadRes = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadRes.ok) throw new Error('Failed to upload video');

      setVideoUrl(public_url);
      setVideoAssetId(asset_id || null);
      setPostType('video');
    } catch (error) {
      console.error('Video upload error:', error);
      setOauthMessage({ type: 'error', text: error.message || 'Failed to upload video.' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDocumentUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-s3-upload-url`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_name: file.name,
          file_type: file.type,
          prefix: 'linkedin/documents',
        }),
      });

      if (!response.ok) throw new Error('Failed to get upload URL');
      const { upload_url, public_url, asset_id } = await response.json();

      const uploadRes = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadRes.ok) throw new Error('Failed to upload document');

      setDocumentUrl(public_url);
      setDocumentAssetId(asset_id || null);
      setPostType('document');
    } catch (error) {
      console.error('Document upload error:', error);
      setOauthMessage({ type: 'error', text: error.message || 'Failed to upload document.' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-prompt`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: `Write a professional LinkedIn post about: ${aiPrompt}. Make it engaging, informative, and suitable for a professional audience. Include relevant hashtags.`,
          context: 'linkedin_post',
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate content');
      }

      const data = await response.json();
      const generatedText = data.response || data.content || data.text || '';
      if (generatedText) {
        setContentText(generatedText);
        setShowAiPanel(false);
        setAiPrompt('');
      } else {
        throw new Error('No content returned from AI');
      }
    } catch (error) {
      console.error('AI generate error:', error);
      setOauthMessage({ type: 'error', text: error.message || 'Failed to generate AI content.' });
    } finally {
      setIsGenerating(false);
    }
  };

  const resetComposer = () => {
    setContentText('');
    setArticleUrl('');
    setArticleTitle('');
    setArticleDescription('');
    setImageUrl('');
    setImageAssetId(null);
    setVideoUrl('');
    setVideoAssetId(null);
    setDocumentUrl('');
    setDocumentAssetId(null);
    setVisibility('PUBLIC');
    setScheduledFor('');
    setPostType('text');
    setEditingPostId(null);
  };

  const handleSavePost = async (schedule: boolean) => {
    if (!contentText.trim() && !articleUrl.trim()) {
      setOauthMessage({ type: 'error', text: 'Please add some content or a URL before saving.' });
      return;
    }

    if (schedule && !scheduledFor) {
      setOauthMessage({ type: 'error', text: 'Please select a date and time to schedule.' });
      return;
    }

    setIsSaving(true);
    try {
      if (editingPostId) {
        const { error: updateError } = await supabase
          .from('linkedin_posts')
          .update({
            content_text: contentText,
            article_url: postType === 'article' ? articleUrl : null,
            article_title: articleTitle || null,
            article_description: articleDescription || null,
            image_url: postType === 'image' ? imageUrl : null,
            image_asset_id: imageAssetId,
            video_url: postType === 'video' ? videoUrl : null,
            video_asset_id: videoAssetId,
            document_url: postType === 'document' ? documentUrl : null,
            document_asset_id: documentAssetId,
            visibility,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingPostId);

        if (updateError) throw updateError;

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const editRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/publish-linkedin-post`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ post_id: editingPostId, action: 'edit' }),
          });
          if (!editRes.ok) {
            const errData = await editRes.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to edit post on LinkedIn');
          }
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const updated = await fetchPosts(user.id);
          setPosts(updated);
        }

        resetComposer();
        setOauthMessage({ type: 'success', text: 'Post updated successfully!' });
      } else {
        const postData: Record<string, unknown> = {
          content_text: contentText,
          article_url: postType === 'article' ? articleUrl : (articleUrl || null),
          article_title: articleTitle || null,
          article_description: articleDescription || null,
          image_url: postType === 'image' ? imageUrl : (imageUrl || null),
          image_asset_id: imageAssetId,
          video_url: postType === 'video' ? videoUrl : (videoUrl || null),
          video_asset_id: videoAssetId,
          document_url: postType === 'document' ? documentUrl : (documentUrl || null),
          document_asset_id: documentAssetId,
          visibility,
          status: schedule ? 'scheduled' : 'draft',
          scheduled_for: schedule ? new Date(scheduledFor).toISOString() : null,
        };

        const { data, error } = await supabase
          .from('linkedin_posts')
          .insert(postData)
          .select()
          .single();

        if (error) throw error;

        if (!schedule) {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Not authenticated');

          const publishRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/publish-linkedin-post`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ post_id: data.id }),
          });

          if (!publishRes.ok) {
            const errData = await publishRes.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to publish post');
          }
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const updated = await fetchPosts(user.id);
          setPosts(updated);
        }

        resetComposer();
        setOauthMessage(schedule
          ? { type: 'success', text: 'Post scheduled successfully!' }
          : { type: 'success', text: 'Post published to LinkedIn!' });
      }
    } catch (error) {
      console.error('Error saving LinkedIn post:', error);
      setOauthMessage({ type: 'error', text: error.message || 'Failed to save post.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePost = async (post: LinkedInPost) => {
    const isPublished = post.status === 'published' && post.linkedin_post_urn;
    const confirmMsg = isPublished
      ? 'Delete this post? It will also be removed from LinkedIn.'
      : 'Delete this post?';
    if (!window.confirm(confirmMsg)) return;

    if (isPublished) {
      setIsDeletingFromLinkedIn(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const deleteRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/publish-linkedin-post`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ post_id: post.id, action: 'delete' }),
        });

        if (!deleteRes.ok) {
          const errData = await deleteRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to delete from LinkedIn');
        }
      } catch (error) {
        console.error('LinkedIn delete error:', error);
        setOauthMessage({ type: 'error', text: error.message || 'Failed to delete from LinkedIn.' });
        setIsDeletingFromLinkedIn(false);
        return;
      }
      setIsDeletingFromLinkedIn(false);
    }

    try {
      await supabase.from('linkedin_posts').delete().eq('id', post.id);
      setPosts(posts.filter(p => p.id !== post.id));
    } catch (error) {
      console.error('Error deleting post:', error);
    }
  };

  const handleEditPost = (post: LinkedInPost) => {
    setEditingPostId(post.id);
    setContentText(post.content_text || '');
    setArticleUrl(post.article_url || '');
    setArticleTitle(post.article_title || '');
    setArticleDescription(post.article_description || '');
    setImageUrl(post.image_url || '');
    setImageAssetId(post.image_asset_id || null);
    setVideoUrl(post.video_url || '');
    setVideoAssetId(post.video_asset_id || null);
    setDocumentUrl(post.document_url || '');
    setDocumentAssetId(post.document_asset_id || null);
    setVisibility((post.visibility as 'PUBLIC' | 'CONNECTIONS') || 'PUBLIC');
    if (post.video_url) setPostType('video');
    else if (post.document_url) setPostType('document');
    else if (post.image_url) setPostType('image');
    else if (post.article_url) setPostType('article');
    else setPostType('text');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRetryPost = async (postId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await supabase.from('linkedin_posts')
        .update({ status: 'publishing', error_message: null, updated_at: new Date().toISOString() })
        .eq('id', postId);

      const publishRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/publish-linkedin-post`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ post_id: postId }),
      });

      if (!publishRes.ok) {
        const errData = await publishRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to publish');
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const updated = await fetchPosts(user.id);
        setPosts(updated);
      }
    } catch (error) {
      console.error('Error retrying post:', error);
      setOauthMessage({ type: 'error', text: error.message || 'Failed to retry post.' });
    }
  };

  const charCount = contentText.length;
  const maxChars = 3000;

  const statusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"><CheckCircle2 className="w-3 h-3" /> Published</span>;
      case 'scheduled':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"><Clock className="w-3 h-3" /> Scheduled</span>;
      case 'publishing':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"><Loader2 className="w-3 h-3 animate-spin" /> Publishing</span>;
      case 'failed':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"><XCircle className="w-3 h-3" /> Failed</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">Draft</span>;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-8 bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigateToApp('dashboard')}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Linkedin className="w-7 h-7 text-[#0A66C2]" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">LinkedIn</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* OAuth message */}
        {oauthMessage && (
          <div className={`flex items-start gap-3 p-4 rounded-lg ${oauthMessage.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
            {oauthMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            )}
            <p className={`text-sm flex-1 ${oauthMessage.type === 'success' ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>{oauthMessage.text}</p>
            <button onClick={() => setOauthMessage(null)} className="flex-shrink-0">
              <X className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
            </button>
          </div>
        )}

        {/* Account connection status */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          {account && account.connected ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {account.profile_picture_url ? (
                  <img src={account.profile_picture_url} alt={account.member_name} className="w-12 h-12 rounded-full" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[#0A66C2] flex items-center justify-center text-white font-semibold">
                    {account.member_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{account.member_name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {account.token_expired ? 'Token expired — please reconnect' : 'Connected to LinkedIn'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleDisconnect}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" /> Disconnect
              </button>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#0A66C2]/10 flex items-center justify-center">
                <Linkedin className="w-8 h-8 text-[#0A66C2]" />
              </div>
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Connect your LinkedIn account</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
                Connect to create and schedule LinkedIn posts. You can write content manually or generate it with AI, then publish immediately or schedule for later.
              </p>
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#0A66C2] text-white font-medium rounded-lg hover:bg-[#004182] transition-colors disabled:opacity-50"
              >
                {isConnecting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Connecting...</>
                ) : (
                  <><Linkedin className="w-5 h-5" /> Connect LinkedIn</>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Composer — only show when connected */}
        {account && account.connected && (
          <>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">{editingPostId ? 'Edit Post' : 'Create Post'}</h2>
                {editingPostId && (
                  <button
                    onClick={() => resetComposer()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <X className="w-4 h-4" /> Cancel edit
                  </button>
                )}
              </div>

              {/* Post type tabs */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => setPostType('text')}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${postType === 'text' ? 'bg-[#0A66C2] text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                  <span className="w-4 h-4 flex items-center justify-center">Aa</span> Text
                </button>
                <button
                  onClick={() => setPostType('article')}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${postType === 'article' ? 'bg-[#0A66C2] text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                  <LinkIcon className="w-4 h-4" /> Link
                </button>
                <button
                  onClick={() => setPostType('image')}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${postType === 'image' ? 'bg-[#0A66C2] text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                  <ImageIcon className="w-4 h-4" /> Image
                </button>
                <button
                  onClick={() => setPostType('video')}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${postType === 'video' ? 'bg-[#0A66C2] text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                  <VideoIcon className="w-4 h-4" /> Video
                </button>
                <button
                  onClick={() => setPostType('document')}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${postType === 'document' ? 'bg-[#0A66C2] text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                  <FileText className="w-4 h-4" /> Document
                </button>
              </div>

              {/* AI Generate panel */}
              {showAiPanel && (
                <div className="mb-4 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span className="text-sm font-medium text-purple-800 dark:text-purple-300">AI Content Generator</span>
                    <button onClick={() => setShowAiPanel(false)} className="ml-auto">
                      <X className="w-4 h-4 text-purple-400 hover:text-purple-600" />
                    </button>
                  </div>
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Describe what you want to post about (e.g., 'Our company just launched a new product line for sustainable packaging')"
                    rows={3}
                    className="w-full px-3 py-2 border border-purple-300 dark:border-purple-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                  <button
                    onClick={handleAiGenerate}
                    disabled={isGenerating || !aiPrompt.trim()}
                    className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                  >
                    {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><Sparkles className="w-4 h-4" /> Generate</>}
                  </button>
                </div>
              )}

              {/* Main text area */}
              <div className="mb-4">
                <textarea
                  value={contentText}
                  onChange={(e) => setContentText(e.target.value)}
                  placeholder="What do you want to share with your network?"
                  rows={6}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2] resize-y"
                />
                <div className="flex items-center justify-between mt-2">
                  <button
                    onClick={() => setShowAiPanel(true)}
                    className="inline-flex items-center gap-1.5 text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
                  >
                    <Sparkles className="w-4 h-4" /> Generate with AI
                  </button>
                  <span className={`text-xs ${charCount > maxChars ? 'text-red-500' : 'text-gray-400'}`}>
                    {charCount} / {maxChars}
                  </span>
                </div>
              </div>

              {/* Article fields */}
              {postType === 'article' && (
                <div className="mb-4 space-y-3 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Article URL</label>
                    <input
                      type="url"
                      value={articleUrl}
                      onChange={(e) => setArticleUrl(e.target.value)}
                      placeholder="https://example.com/article"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2]"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Custom title (optional)</label>
                      <input
                        type="text"
                        value={articleTitle}
                        onChange={(e) => setArticleTitle(e.target.value)}
                        placeholder="Link preview title"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Custom description (optional)</label>
                      <input
                        type="text"
                        value={articleDescription}
                        onChange={(e) => setArticleDescription(e.target.value)}
                        placeholder="Link preview description"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Video upload */}
              {postType === 'video' && (
                <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                  {videoUrl ? (
                    <div className="relative">
                      <video src={videoUrl} controls className="w-full max-h-64 rounded-lg" />
                      <button
                        onClick={() => { setVideoUrl(''); setVideoAssetId(null); }}
                        className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black/80"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-[#0A66C2] transition-colors">
                      {isUploading ? (
                        <><Loader2 className="w-8 h-8 text-gray-400 animate-spin mb-2" /><span className="text-sm text-gray-500">Uploading...</span></>
                      ) : (
                        <><VideoIcon className="w-8 h-8 text-gray-400 mb-2" /><span className="text-sm text-gray-500 dark:text-gray-400">Click to upload a video</span><span className="text-xs text-gray-400 mt-1">MP4 up to 200MB</span></>
                      )}
                      <input
                        type="file"
                        accept="video/mp4,video/quicktime"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleVideoUpload(file);
                        }}
                        disabled={isUploading}
                      />
                    </label>
                  )}
                </div>
              )}

              {/* Document upload */}
              {postType === 'document' && (
                <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                  {documentUrl ? (
                    <div className="relative flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                      <FileText className="w-8 h-8 text-[#0A66C2] flex-shrink-0" />
                      <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">{documentUrl.split('/').pop()}</span>
                      <button
                        onClick={() => { setDocumentUrl(''); setDocumentAssetId(null); }}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-[#0A66C2] transition-colors">
                      {isUploading ? (
                        <><Loader2 className="w-8 h-8 text-gray-400 animate-spin mb-2" /><span className="text-sm text-gray-500">Uploading...</span></>
                      ) : (
                        <><FileText className="w-8 h-8 text-gray-400 mb-2" /><span className="text-sm text-gray-500 dark:text-gray-400">Click to upload a PDF</span><span className="text-xs text-gray-400 mt-1">PDF up to 100MB</span></>
                      )}
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleDocumentUpload(file);
                        }}
                        disabled={isUploading}
                      />
                    </label>
                  )}
                </div>
              )}

              {/* Image upload */}
              {postType === 'image' && (
                <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                  {imageUrl ? (
                    <div className="relative">
                      <img src={imageUrl} alt="Upload preview" className="w-full max-h-64 object-cover rounded-lg" />
                      <button
                        onClick={() => { setImageUrl(''); setImageAssetId(null); }}
                        className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black/80"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-[#0A66C2] transition-colors">
                      {isUploading ? (
                        <><Loader2 className="w-8 h-8 text-gray-400 animate-spin mb-2" /><span className="text-sm text-gray-500">Uploading...</span></>
                      ) : (
                        <><ImageIcon className="w-8 h-8 text-gray-400 mb-2" /><span className="text-sm text-gray-500 dark:text-gray-400">Click to upload an image</span><span className="text-xs text-gray-400 mt-1">PNG, JPG up to 10MB</span></>
                      )}
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(file);
                        }}
                        disabled={isUploading}
                      />
                    </label>
                  )}
                </div>
              )}

              {/* Visibility and Scheduling */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Visibility</label>
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as 'PUBLIC' | 'CONNECTIONS')}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2]"
                  >
                    <option value="PUBLIC"><Globe className="w-4 h-4 inline mr-1" /> Public — Anyone on LinkedIn</option>
                    <option value="CONNECTIONS"><Users className="w-4 h-4 inline mr-1" /> Connections only</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Schedule (optional)</label>
                  <input
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2]"
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => handleSavePost(false)}
                  disabled={isSaving || (!contentText.trim() && !articleUrl.trim() && !imageUrl && !videoUrl && !documentUrl)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0A66C2] text-white text-sm font-medium rounded-lg hover:bg-[#004182] transition-colors disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {editingPostId ? 'Save Changes' : 'Post Now'}
                </button>
                {editingPostId ? null : (
                <button
                  onClick={() => handleSavePost(true)}
                  disabled={isSaving || !scheduledFor || (!contentText.trim() && !articleUrl.trim() && !imageUrl && !videoUrl && !documentUrl)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                  Schedule Post
                </button>
                )}
              </div>
            </div>

            {/* Live Preview */}
            {contentText && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Preview</h3>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    {account.profile_picture_url ? (
                      <img src={account.profile_picture_url} alt="" className="w-12 h-12 rounded-full flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[#0A66C2] flex items-center justify-center text-white font-semibold flex-shrink-0">
                        {account.member_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white text-sm">{account.member_name}</p>
                      <p className="text-xs text-gray-400">Just now</p>
                      <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{contentText}</p>
                      {postType === 'article' && articleUrl && (
                        <div className="mt-3 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                          <div className="p-3">
                            {articleTitle && <p className="font-medium text-gray-900 dark:text-white text-sm">{articleTitle}</p>}
                            {articleDescription && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{articleDescription}</p>}
                            <p className="text-xs text-[#0A66C2] mt-2 truncate">{articleUrl}</p>
                          </div>
                        </div>
                      )}
                      {postType === 'image' && imageUrl && (
                        <img src={imageUrl} alt="Preview" className="mt-3 w-full max-h-80 object-cover rounded-lg" />
                      )}
                      {postType === 'video' && videoUrl && (
                        <video src={videoUrl} controls className="mt-3 w-full max-h-80 rounded-lg" />
                      )}
                      {postType === 'document' && documentUrl && (
                        <div className="mt-3 flex items-center gap-2 p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                          <FileText className="w-5 h-5 text-[#0A66C2]" />
                          <span className="text-xs text-gray-600 dark:text-gray-400">{documentUrl.split('/').pop()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Posts list */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Your Posts</h2>
              {posts.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 dark:text-gray-400">No posts yet. Create your first post above!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {posts.map((post) => (
                    <div
                      key={post.id}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {statusBadge(post.status)}
                          {post.scheduled_for && post.status === 'scheduled' && (
                            <span className="text-xs text-gray-400">{formatDate(post.scheduled_for)}</span>
                          )}
                          {post.status === 'published' && post.permalink && (
                            <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="text-xs text-[#0A66C2] hover:underline">View on LinkedIn</a>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {post.status === 'failed' && (
                            <button
                              onClick={() => handleRetryPost(post.id)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded"
                              title="Retry publishing"
                            >
                              <Loader2 className="w-4 h-4" />
                            </button>
                          )}
                          {post.status === 'published' && (
                            <button
                              onClick={() => handleEditPost(post)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded"
                              title="Edit post"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeletePost(post)}
                            disabled={isDeletingFromLinkedIn}
                            className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded disabled:opacity-50"
                            title="Delete post"
                          >
                            {isDeletingFromLinkedIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap line-clamp-4">
                        {post.content_text || '(no text)'}
                      </p>

                      {post.article_url && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-[#0A66C2]">
                          <LinkIcon className="w-3 h-3" />
                          <span className="truncate">{post.article_url}</span>
                        </div>
                      )}

                      {post.image_url && (
                        <img src={post.image_url} alt="" className="mt-2 w-full max-h-48 object-cover rounded-lg" />
                      )}

                      {post.video_url && (
                        <video src={post.video_url} controls className="mt-2 w-full max-h-48 rounded-lg" />
                      )}

                      {post.document_url && (
                        <div className="mt-2 flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                          <FileText className="w-5 h-5 text-[#0A66C2]" />
                          <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{post.document_url.split('/').pop()}</span>
                        </div>
                      )}

                      <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
                        <span>Visibility: {post.visibility === 'PUBLIC' ? 'Public' : 'Connections'}</span>
                        <span>Created: {formatDate(post.created_at)}</span>
                      </div>

                      {post.status === 'failed' && post.error_message && (
                        <div className="mt-2 flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          <span>{post.error_message}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
