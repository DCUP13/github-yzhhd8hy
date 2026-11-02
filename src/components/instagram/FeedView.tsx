import { useState, useEffect, useCallback, useMemo } from "react";
import { Image as ImageIcon, Video as VideoIcon, Trash2, X, RefreshCw, Loader2, Send, MessageSquare, CheckCheck, ChevronDown, ChevronRight, ChevronLeft, Reply, Bot, Heart } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { toast } from "../../lib/toast";

export interface CommentEvent {
  id: string;
  event_type: string;
  sender_id: string | null;
  sender_username: string | null;
  sender_name: string | null;
  sender_profile_url: string | null;
  message_text: string | null;
  media_id: string | null;
  media_type: string | null;
  media_permalink: string | null;
  media_caption: string | null;
  media_image_url: string | null;
  comment_id: string | null;
  parent_comment_id: string | null;
  created_at: string;
  direction: string;
  reply_text: string | null;
  replied_at: string | null;
}

export interface SnapshotData {
  id: string;
  posts_data: Array<{ media_id: string; caption?: string; media_type?: string; permalink?: string; thumbnail_url?: string; carousel_urls?: string[] | null; timestamp?: string; like_count?: number; comments_count?: number }>;
  created_at: string;
}

interface FeedViewProps {
  userId: string;
  commentEvents: CommentEvent[];
  selectedAccount?: { id: string; owner_profile_id: string | null; page_scoped_id: string | null } | null;
  snapshots: SnapshotData[];
  onSynced?: () => void;
}

export function FeedView({ userId, commentEvents, selectedAccount, snapshots, onSynced }: FeedViewProps) {
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [feedSendingFor, setFeedSendingFor] = useState<string | null>(null);
  const [replyDialogCommentId, setReplyDialogCommentId] = useState<string | null>(null);
  const [replyDialogText, setReplyDialogText] = useState('');
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [publishedPosts, setPublishedPosts] = useState<Array<{ id: string; ig_media_id: string | null; permalink: string | null; caption: string; cloudfront_url: string | null; carousel_urls: string[] | null; account_id: string; created_at: string; is_test_post: boolean; media_image_url: string | null; media_type: string | null }>>([]);
  const [feedSortMode, setFeedSortMode] = useState<'recent' | 'comments' | 'no-comments'>('recent');
  const [isSyncingFeed, setIsSyncingFeed] = useState(false);
  const [feedCarouselIndex, setFeedCarouselIndex] = useState<Record<string, number>>({});

  const fetchPublishedPosts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('instagram_post_variations')
        .select('id, ig_media_id, permalink, caption, cloudfront_url, carousel_urls, account_id, created_at, is_test_post, media_image_url, media_type')
        .eq('user_id', userId)
        .eq('status', 'published')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPublishedPosts(data || []);
    } catch (error) {
      console.error('Error fetching published posts:', error);
    }
  }, [userId]);

  useEffect(() => { fetchPublishedPosts(); }, [fetchPublishedPosts]);

  const handleDeleteFeedPost = async (mediaId: string) => {
    if (!confirm('Remove this post from your feed? This deletes it from the database.')) return;
    try {
      const { error } = await supabase
        .from('instagram_post_variations')
        .delete()
        .eq('user_id', userId)
        .or(`ig_media_id.eq.${mediaId},id.eq.${mediaId}`);
      if (error) throw error;
      setPublishedPosts(prev => prev.filter(p => (p.ig_media_id || p.id) !== mediaId));
      toast.success('Post removed from feed');
    } catch (error) {
      console.error('Error deleting feed post:', error);
      toast.error('Failed to remove post');
    }
  };

  // Feed: seed from latest Instagram snapshot (all posts on Instagram), merge with
  // published variations and comment events. Only posts present in the snapshot appear.
  const feedPosts = useMemo(() => {
    const postMap = new Map<string, { mediaId: string; mediaType: string | null; mediaPermalink: string | null; mediaCaption: string | null; mediaImageUrl: string | null; carouselUrls: string[] | null; events: CommentEvent[]; hasComments: boolean; igCommentCount: number; likeCount: number; publishedAt: string | null }>();

    // Seed with ALL posts from the latest Instagram snapshot (same data as stats tab)
    const latestSnapshot = snapshots[0] || null;
    if (latestSnapshot?.posts_data) {
      for (const p of latestSnapshot.posts_data) {
        if (!p.media_id) continue;
        const igCommentCount = typeof p.comments_count === 'number' ? p.comments_count : 0;
        postMap.set(p.media_id, {
          mediaId: p.media_id,
          mediaType: p.media_type ?? null,
          mediaPermalink: p.permalink ?? null,
          mediaCaption: (p.caption ?? '').substring(0, 500) || null,
          mediaImageUrl: p.thumbnail_url ?? null,
          carouselUrls: p.carousel_urls ?? null,
          events: [],
          hasComments: igCommentCount > 0,
          igCommentCount,
          likeCount: typeof p.like_count === 'number' ? p.like_count : 0,
          publishedAt: p.timestamp ?? latestSnapshot.created_at,
        });
      }
    }

    // Merge in published variations (for posts made via the app — enriches feed)
    for (const pub of publishedPosts) {
      const key = pub.ig_media_id || pub.id;
      const existing = postMap.get(key);
      if (existing) {
        // Enrich with variation data if snapshot was missing fields
        if (!existing.mediaImageUrl) {
          const urls = pub.carousel_urls && pub.carousel_urls.length > 0 ? pub.carousel_urls : (pub.cloudfront_url ? [pub.cloudfront_url] : []);
          existing.mediaImageUrl = pub.media_image_url || urls[0] || null;
        }
        if (!existing.carouselUrls && pub.carousel_urls && pub.carousel_urls.length > 0) {
          existing.carouselUrls = pub.carousel_urls;
        }
        if (!existing.mediaType) existing.mediaType = pub.media_type || null;
        if (!existing.mediaPermalink) existing.mediaPermalink = pub.permalink;
        if (!existing.mediaCaption) existing.mediaCaption = pub.caption;
      } else {
        // Not in snapshot — include as extra post
        const urls = pub.carousel_urls && pub.carousel_urls.length > 0 ? pub.carousel_urls : (pub.cloudfront_url ? [pub.cloudfront_url] : []);
        const igImageUrl = pub.media_image_url || urls[0] || null;
        postMap.set(key, {
          mediaId: key,
          mediaType: pub.media_type || null,
          mediaPermalink: pub.permalink,
          mediaCaption: pub.caption,
          mediaImageUrl: igImageUrl,
          carouselUrls: pub.carousel_urls ?? null,
          events: [],
          hasComments: false,
          igCommentCount: 0,
          likeCount: 0,
          publishedAt: pub.created_at,
        });
      }
    }

    // Merge in comment events — always show posts that have comments, even if
    // the post is no longer in the snapshot (it may have been deleted from
    // Instagram, or the snapshot may be incomplete due to API limitations)
    for (const event of commentEvents) {
      const key = event.media_id ?? event.id;
      if (!key) continue;
      const existing = postMap.get(key);
      if (existing) {
        existing.events.push(event);
        existing.hasComments = true;
        if (event.media_image_url && !existing.mediaImageUrl) existing.mediaImageUrl = event.media_image_url;
        if (event.media_type && !existing.mediaType) existing.mediaType = event.media_type;
        if (event.media_permalink && !existing.mediaPermalink) existing.mediaPermalink = event.media_permalink;
        if (event.media_caption && !existing.mediaCaption) existing.mediaCaption = event.media_caption;
      } else {
        // Post not in snapshot but has comments — show it anyway
        postMap.set(key, { mediaId: key, mediaType: event.media_type, mediaPermalink: event.media_permalink, mediaCaption: event.media_caption, mediaImageUrl: event.media_image_url, carouselUrls: null, events: [event], hasComments: true, igCommentCount: 0, likeCount: 0, publishedAt: null });
      }
    }

    const posts = Array.from(postMap.values());
    // Sort based on mode — all posts stay visible, just reordered
    if (feedSortMode === 'comments') {
      posts.sort((a, b) => {
        const aTotal = a.igCommentCount || a.events.length;
        const bTotal = b.igCommentCount || b.events.length;
        if ((aTotal > 0) !== (bTotal > 0)) return aTotal > 0 ? -1 : 1;
        return bTotal - aTotal;
      });
    } else if (feedSortMode === 'no-comments') {
      posts.sort((a, b) => {
        const aTotal = a.igCommentCount || a.events.length;
        const bTotal = b.igCommentCount || b.events.length;
        if ((aTotal > 0) !== (bTotal > 0)) return aTotal > 0 ? 1 : -1;
        const aDate = a.publishedAt || a.events[0]?.created_at || '';
        const bDate = b.publishedAt || b.events[0]?.created_at || '';
        return bDate.localeCompare(aDate);
      });
    } else {
      posts.sort((a, b) => {
        const aDate = a.publishedAt || '';
        const bDate = b.publishedAt || '';
        return bDate.localeCompare(aDate);
      });
    }
    return posts;
  }, [commentEvents, publishedPosts, feedSortMode, snapshots]);

  function buildCommentThread(postEvents: CommentEvent[]) {
    const sorted = postEvents.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
    const topLevel = sorted.filter(e => !e.parent_comment_id);
    const replies = sorted.filter(e => !!e.parent_comment_id);

    // Build a lookup from comment_id → event so we can walk the parent chain
    const byCommentId = new Map<string, CommentEvent>();
    for (const e of sorted) {
      if (e.comment_id) byCommentId.set(e.comment_id, e);
    }

    // Resolve each reply's parent_comment_id up to the root top-level comment,
    // so replies-to-replies also appear indented under the top-level comment.
    const repliesByParent = new Map<string, CommentEvent[]>();
    for (const reply of replies) {
      let rootId = reply.parent_comment_id!;
      let guard = 0;
      while (guard < 20) {
        const parent = byCommentId.get(rootId);
        if (!parent || !parent.parent_comment_id) break;
        rootId = parent.parent_comment_id;
        guard++;
      }
      const arr = repliesByParent.get(rootId) ?? [];
      arr.push(reply);
      repliesByParent.set(rootId, arr);
    }
    return { topLevel, repliesByParent };
  }

  const openReplyDialog = (commentId: string) => {
    setReplyDialogCommentId(commentId);
    setReplyDialogText('');
    setReplyDialogOpen(true);
  };

  const handleFeedReply = async () => {
    const commentId = replyDialogCommentId;
    const text = replyDialogText;
    if (!text.trim() || !selectedAccount || !commentId) return;
    setFeedSendingFor(commentId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/instagram-send-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          account_id: selectedAccount.id,
          recipient_id: selectedAccount.owner_profile_id ?? selectedAccount.page_scoped_id,
          message_text: text.trim(),
          reply_type: 'comment',
          comment_id: commentId,
          parent_comment_id: commentId,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        toast.error(err.error || 'Failed to send reply');
        return;
      }
      setReplyDialogOpen(false);
      setReplyDialogText('');
      setReplyDialogCommentId(null);
      toast.success('Reply sent');
    } catch {
      toast.error('Failed to send reply');
    } finally {
      setFeedSendingFor(null);
    }
  };

  const handleSyncFeed = async () => {
    if (!selectedAccount) {
      toast.error('Select an account to sync');
      return;
    }
    setIsSyncingFeed(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/instagram-sync-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ account_id: selectedAccount.id }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        toast.error(err.error || 'Failed to sync with Instagram');
        return;
      }
      const data = await response.json();
      await fetchPublishedPosts();
      if (onSynced) onSynced();
      const synced = data.feed_sync;
      const commentsSynced = synced?.comments_synced ?? 0;
      const commentsRemoved = synced?.comments_removed ?? 0;
      const commentInfo = [
        commentsSynced > 0 ? `${commentsSynced} new comments pulled` : null,
        commentsRemoved > 0 ? `${commentsRemoved} stale comments removed` : null,
      ].filter(Boolean).join(', ');
      if (synced && synced.removed > 0) {
        toast.success(`Synced with Instagram — ${synced.updated} posts updated, ${synced.removed} removed${commentInfo ? `, ${commentInfo}` : ''}`);
      } else {
        toast.success(`Synced with Instagram — ${synced?.updated ?? 0} posts updated${commentInfo ? `, ${commentInfo}` : ''}`);
      }
    } catch {
      toast.error('Failed to sync with Instagram');
    } finally {
      setIsSyncingFeed(false);
    }
  };

  return (
    <>
      {(
        <div>
          {feedPosts.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No published posts yet</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Posts you publish through the auto-posting system will appear here, along with any comments they receive.
              </p>
              {selectedAccount && (
                <button
                  onClick={handleSyncFeed}
                  disabled={isSyncingFeed}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-pink-500 hover:bg-pink-600 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {isSyncingFeed ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Sync Now
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Sort:</span>
                  {([['recent', 'Most recent'], ['comments', 'With comments'], ['no-comments', 'No comments']] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      onClick={() => setFeedSortMode(mode)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        feedSortMode === mode
                          ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300'
                          : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {selectedAccount && (
                  <button
                    onClick={handleSyncFeed}
                    disabled={isSyncingFeed}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-900/20 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {isSyncingFeed ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Sync Now
                  </button>
                )}
              </div>
              <div className="space-y-4 max-w-full overflow-x-hidden">
              {feedPosts.map((post) => {
                const isExpanded = expandedPostId === post.mediaId;
                const { topLevel, repliesByParent } = buildCommentThread(post.events);
                return (
                  <div key={post.mediaId} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden min-w-0">
                    {/* Post header — click to expand */}
                    <button
                      onClick={() => setExpandedPostId(isExpanded ? null : post.mediaId)}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-lg bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                        {post.mediaImageUrl ? (
                          post.mediaType === 'REEL' || post.mediaType === 'VIDEO' ? (
                            <video src={post.mediaImageUrl} className="w-full h-full object-cover" preload="metadata" muted />
                          ) : (
                            <img src={post.mediaImageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                          )
                        ) : post.mediaType === 'REEL' ? (
                          <VideoIcon className="w-5 h-5 text-pink-500" />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-pink-500" />
                        )}
                        {post.carouselUrls && post.carouselUrls.length > 1 && (
                          <span className="absolute top-0 right-0 bg-black/60 text-white text-[8px] font-bold px-1 rounded-bl leading-tight">
                            {post.carouselUrls.length}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {post.mediaType === 'REEL' ? 'Reel' : 'Post'}
                          </span>
                          {post.igCommentCount > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/30 px-2 py-0.5 rounded-full">
                              <MessageSquare className="w-3 h-3" />
                              {post.igCommentCount} comment{post.igCommentCount !== 1 ? 's' : ''}
                            </span>
                          ) : post.hasComments ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/30 px-2 py-0.5 rounded-full">
                              <MessageSquare className="w-3 h-3" />
                              {post.events.length} comment{post.events.length !== 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full">No comments</span>
                          )}
                          {post.likeCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                              <Heart className="w-3 h-3" /> {post.likeCount}
                            </span>
                          )}
                        </div>
                        {post.mediaCaption && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{post.mediaCaption}</p>
                        )}
                      </div>
                      {post.mediaPermalink && (
                        <a
                          href={post.mediaPermalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-pink-500 hover:underline flex-shrink-0"
                        >
                          View on Instagram
                        </a>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFeedPost(post.mediaId);
                        }}
                        className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0 p-1"
                        title="Remove from feed"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      )}
                    </button>

                    {/* Expanded comment threads */}
                    {isExpanded && (
                      <div className="border-t border-gray-200 dark:border-gray-700">
                        {/* Post image/video — full size with carousel support */}
                        {(() => {
                          const carousel = post.carouselUrls && post.carouselUrls.length > 0 ? post.carouselUrls : (post.mediaImageUrl ? [post.mediaImageUrl] : []);
                          if (carousel.length === 0) return null;
                          const currentIdx = feedCarouselIndex[post.mediaId] ?? 0;
                          const currentUrl = carousel[Math.min(currentIdx, carousel.length - 1)];
                          const isVideo = post.mediaType === 'REEL' || post.mediaType === 'VIDEO';
                          return (
                            <div className="px-4 pt-3 pb-2 max-w-full overflow-x-hidden">
                              <div className="relative rounded-lg overflow-hidden bg-black w-full">
                                {isVideo ? (
                                  <video
                                    src={currentUrl}
                                    className="w-full max-w-full h-auto max-h-[600px] object-contain block"
                                    controls
                                    preload="metadata"
                                  />
                                ) : (
                                  <img
                                    src={currentUrl}
                                    alt=""
                                    className="w-full max-w-full h-auto max-h-[600px] object-contain block"
                                    loading="lazy"
                                  />
                                )}
                                {carousel.length > 1 && (
                                  <>
                                    {/* Always-visible navigation arrows */}
                                    <button
                                      onClick={() => setFeedCarouselIndex(prev => ({ ...prev, [post.mediaId]: currentIdx === 0 ? carousel.length - 1 : currentIdx - 1 }))}
                                      className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 dark:bg-gray-800/90 flex items-center justify-center shadow-lg hover:bg-white dark:hover:bg-gray-700 hover:scale-110 active:scale-95 transition-all z-10"
                                    >
                                      <ChevronLeft className="w-6 h-6 text-gray-700 dark:text-gray-200" />
                                    </button>
                                    <button
                                      onClick={() => setFeedCarouselIndex(prev => ({ ...prev, [post.mediaId]: currentIdx === carousel.length - 1 ? 0 : currentIdx + 1 }))}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 dark:bg-gray-800/90 flex items-center justify-center shadow-lg hover:bg-white dark:hover:bg-gray-700 hover:scale-110 active:scale-95 transition-all z-10"
                                    >
                                      <ChevronRight className="w-6 h-6 text-gray-700 dark:text-gray-200" />
                                    </button>
                                    {/* Slide counter */}
                                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 text-white text-xs font-medium">
                                      {currentIdx + 1} / {carousel.length}
                                    </div>
                                  </>
                                )}
                              </div>
                              {/* Thumbnail strip for carousels */}
                              {carousel.length > 1 && (
                                <div className="flex justify-center gap-2 mt-2 overflow-x-auto pb-1">
                                  {carousel.map((url, idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => setFeedCarouselIndex(prev => ({ ...prev, [post.mediaId]: idx }))}
                                      className={`flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${idx === currentIdx ? 'border-pink-500 opacity-100 scale-105' : 'border-transparent opacity-50 hover:opacity-80'}`}
                                    >
                                      {post.mediaType === 'REEL' || post.mediaType === 'VIDEO' ? (
                                        <video src={url} className="w-full h-full object-cover" preload="metadata" muted />
                                      ) : (
                                        <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                                      )}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        {post.events.length === 0 ? (
                          <div className="px-4 py-6 text-center">
                            {post.igCommentCount > 0 ? (
                              <p className="text-sm text-gray-400">Instagram reports {post.igCommentCount} comment{post.igCommentCount !== 1 ? 's' : ''} on this post. Click "Sync with Instagram" above to pull them into the feed.</p>
                            ) : (
                              <p className="text-sm text-gray-400">No comments on this post yet.</p>
                            )}
                          </div>
                        ) : (
                        <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                        {topLevel.map((comment) => {
                          const commentReplies = repliesByParent.get(comment.comment_id ?? '') ?? [];
                          const lastReplyId = commentReplies.length > 0
                            ? commentReplies[commentReplies.length - 1].comment_id
                            : comment.comment_id;

                          return (
                            <div key={comment.id} className="px-4 py-3">
                              {/* Top-level comment */}
                              <div className="flex items-start gap-2.5">
                                {comment.sender_profile_url ? (
                                  <img src={comment.sender_profile_url} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center flex-shrink-0">
                                    <MessageSquare className="w-3.5 h-3.5 text-pink-500" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                    @{comment.sender_username || 'unknown'}
                                  </p>
                                  <p className="text-sm text-gray-900 dark:text-white mt-0.5">{comment.message_text}</p>
                                  <p className="text-[10px] text-gray-400 mt-0.5">
                                    {new Date(comment.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>
                              </div>

                              {/* Threaded replies — indented */}
                              {commentReplies.length > 0 && (
                                <div className="ml-10 mt-2 space-y-2 border-l-2 border-gray-100 dark:border-gray-700 pl-3">
                                  {commentReplies.map((reply) => (
                                    <div key={reply.id} className="flex items-start gap-2">
                                      {reply.sender_profile_url ? (
                                        <img src={reply.sender_profile_url} alt="" className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5" />
                                      ) : (
                                        <div className="w-6 h-6 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                                          {reply.direction === 'outgoing' ? (
                                            <Bot className="w-3 h-3 text-pink-500" />
                                          ) : (
                                            <MessageSquare className="w-3 h-3 text-pink-500" />
                                          )}
                                        </div>
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          {reply.direction === 'outgoing' ? (
                                            <span className="text-[10px] font-medium text-pink-600 dark:text-pink-400">You</span>
                                          ) : (
                                            <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">@{reply.sender_username || 'unknown'}</span>
                                          )}
                                          <span className="text-[10px] text-gray-400">
                                            {new Date(reply.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                          </span>
                                          {reply.direction === 'outgoing' && reply.replied_at && (
                                            <CheckCheck className="w-3 h-3 text-pink-400" />
                                          )}
                                        </div>
                                        <div className={`rounded-xl px-3 py-2 mt-0.5 inline-block ${
                                          reply.direction === 'outgoing'
                                            ? 'bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800 text-gray-900 dark:text-white'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                                        }`}>
                                          <p className="text-sm whitespace-pre-wrap break-words">{reply.message_text}</p>
                                        </div>
                                        <div className="mt-0.5">
                                          <button
                                            onClick={() => openReplyDialog(reply.comment_id ?? comment.comment_id ?? '')}
                                            className="inline-flex items-center gap-0.5 text-[10px] font-medium text-gray-400 hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
                                          >
                                            <Reply className="w-3 h-3" />
                                            Reply
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Reply button */}
                              <div className="ml-10 mt-2">
                                <button
                                  onClick={() => openReplyDialog(lastReplyId ?? comment.comment_id ?? '')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-pink-600 dark:text-gray-400 dark:hover:text-pink-400 transition-colors"
                                >
                                  <Reply className="w-3.5 h-3.5" />
                                  Reply
                                </button>
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
              })}
              </div>
            </>
          )}
        </div>
      )}
      {/* Reply dialog */}
      {replyDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => { setReplyDialogOpen(false); setReplyDialogText(''); setReplyDialogCommentId(null); }}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Reply to comment</h3>
              <button
                onClick={() => { setReplyDialogOpen(false); setReplyDialogText(''); setReplyDialogCommentId(null); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <textarea
                value={replyDialogText}
                onChange={(e) => setReplyDialogText(e.target.value)}
                autoFocus
                rows={4}
                placeholder="Type your reply..."
                className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleFeedReply();
                  }
                }}
              />
              <p className="text-[11px] text-gray-400 mt-1.5">Press Cmd/Ctrl + Enter to send</p>
              <div className="flex items-center justify-end gap-2 mt-4">
                <button
                  onClick={() => { setReplyDialogOpen(false); setReplyDialogText(''); setReplyDialogCommentId(null); }}
                  className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleFeedReply}
                  disabled={!replyDialogText.trim() || feedSendingFor === replyDialogCommentId}
                  className="px-4 py-2 text-sm font-medium text-white bg-pink-500 hover:bg-pink-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {feedSendingFor === replyDialogCommentId ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Send Reply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
