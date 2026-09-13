import { useMemo, useState } from 'react';
import { MessageSquare, Send, CheckCheck, Image as ImageIcon, Film } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface WebhookEvent {
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
  comment_id: string | null;
  parent_comment_id: string | null;
  created_at: string;
  processed: boolean;
  direction: string;
  reply_text: string | null;
  replied_at: string | null;
}

interface IgAccount {
  id: string;
  ig_user_id: string | null;
  username: string | null;
  profile_picture_url: string | null;
  user_id: string;
  owner_profile_id?: string | null;
  page_scoped_id?: string | null;
}

interface CommentsFeedTabProps {
  events: WebhookEvent[];
  selectedAccount: IgAccount;
}

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function CommentsFeedTab({ events, selectedAccount }: CommentsFeedTabProps) {
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [sendingFor, setSendingFor] = useState<string | null>(null);

  // Group comment events by media_id (post level), then by commenter (user level)
  const postsWithComments = useMemo(() => {
    const postMap = new Map<string, {
      mediaId: string;
      mediaType: string | null;
      mediaPermalink: string | null;
      mediaCaption: string | null;
      events: WebhookEvent[];
    }>();

    for (const event of events) {
      const mediaKey = event.media_id ?? event.id;
      const existing = postMap.get(mediaKey);
      if (existing) {
        existing.events.push(event);
      } else {
        postMap.set(mediaKey, {
          mediaId: mediaKey,
          mediaType: event.media_type,
          mediaPermalink: event.media_permalink,
          mediaCaption: event.media_caption,
          events: [event],
        });
      }
    }

    // Sort posts by most recent activity
    return Array.from(postMap.values()).sort((a, b) => {
      const aLast = a.events.reduce((max, e) => e.created_at > max ? e.created_at : max, '');
      const bLast = b.events.reduce((max, e) => e.created_at > max ? e.created_at : max, '');
      return bLast.localeCompare(aLast);
    });
  }, [events]);

  // Group events within a post by commenter (sender_id), threaded by parent_comment_id
  function buildThread(postEvents: WebhookEvent[]) {
    // Sort chronologically
    const sorted = postEvents.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
    // Top-level comments (no parent_comment_id) and replies
    const topLevel = sorted.filter(e => !e.parent_comment_id);
    const replies = sorted.filter(e => !!e.parent_comment_id);

    // Group replies by parent_comment_id
    const repliesByParent = new Map<string, WebhookEvent[]>();
    for (const reply of replies) {
      const parent = reply.parent_comment_id!;
      const arr = repliesByParent.get(parent) ?? [];
      arr.push(reply);
      repliesByParent.set(parent, arr);
    }

    return { topLevel, repliesByParent };
  }

  const handleSendCommentReply = async (commentId: string, text: string) => {
    if (!text.trim()) return;
    setSendingFor(commentId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/instagram-send-reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
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
        alert(err.error || 'Failed to send reply');
        return;
      }

      setReplyTexts(prev => ({ ...prev, [commentId]: '' }));
    } catch (error) {
      console.error('Error sending comment reply:', error);
      alert('Failed to send reply');
    } finally {
      setSendingFor(null);
    }
  };

  if (events.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
        <div className="text-center py-12">
          <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No comments yet</h3>
          <p className="text-gray-500 dark:text-gray-400">
            Comments on your posts and reels will appear here automatically in real time, threaded by user with reply history.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {postsWithComments.map((post) => {
        const { topLevel, repliesByParent } = buildThread(post.events);
        return (
          <div key={post.mediaId} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
            {/* Post header */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">
              <div className="flex items-center gap-2">
                {post.mediaType === 'REEL' ? (
                  <Film className="w-4 h-4 text-pink-500" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-pink-500" />
                )}
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {post.mediaType === 'REEL' ? 'Reel' : 'Post'}
                </span>
                {post.mediaPermalink && (
                  <a href={post.mediaPermalink} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-pink-500 hover:underline">
                    View on Instagram
                  </a>
                )}
              </div>
              {post.mediaCaption && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">{post.mediaCaption}</p>
              )}
              <p className="text-xs text-gray-400 mt-0.5">{post.events.length} comment{post.events.length !== 1 ? 's' : ''}</p>
            </div>

            {/* Comment threads */}
            <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {topLevel.map((comment) => {
                const commentReplies = repliesByParent.get(comment.comment_id ?? '') ?? [];
                const allInThread = [comment, ...commentReplies];
                const lastReplyId = allInThread.length > 0 ? allInThread[allInThread.length - 1].comment_id : comment.comment_id;

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
                        <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(comment.created_at)}</p>
                      </div>
                    </div>

                    {/* Threaded replies */}
                    {commentReplies.length > 0 && (
                      <div className="ml-10 mt-2 space-y-2 border-l-2 border-gray-100 dark:border-gray-700 pl-3">
                        {commentReplies.map((reply) => (
                          <div key={reply.id} className="flex items-start gap-2">
                            <div className={`max-w-[80%] ${reply.direction === 'outgoing' ? 'ml-auto' : ''}`}>
                              <div className={`rounded-xl px-3 py-2 ${
                                reply.direction === 'outgoing'
                                  ? 'bg-pink-500 text-white'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                              }`}>
                                {reply.direction === 'outgoing' && (
                                  <p className="text-[10px] font-medium text-pink-100 mb-0.5">You replied</p>
                                )}
                                <p className="text-sm whitespace-pre-wrap break-words">{reply.message_text}</p>
                              </div>
                              <div className={`flex items-center gap-1 mt-0.5 ${reply.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}>
                                <span className="text-[10px] text-gray-400">{formatTime(reply.created_at)}</span>
                                {reply.direction === 'outgoing' && reply.replied_at && (
                                  <CheckCheck className="w-3 h-3 text-pink-400" />
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reply box */}
                    <div className="ml-10 mt-2 flex items-center gap-2">
                      <input
                        type="text"
                        value={replyTexts[comment.comment_id ?? ''] ?? ''}
                        onChange={(e) => setReplyTexts(prev => ({ ...prev, [comment.comment_id ?? '']: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendCommentReply(lastReplyId ?? comment.comment_id ?? '', replyTexts[comment.comment_id ?? ''] ?? '');
                          }
                        }}
                        placeholder="Reply to comment..."
                        className="flex-1 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:ring-1 focus:ring-pink-500 focus:border-pink-500"
                        disabled={sendingFor === (lastReplyId ?? comment.comment_id)}
                      />
                      <button
                        onClick={() => handleSendCommentReply(lastReplyId ?? comment.comment_id ?? '', replyTexts[comment.comment_id ?? ''] ?? '')}
                        disabled={!(replyTexts[comment.comment_id ?? ''] ?? '').trim() || sendingFor === (lastReplyId ?? comment.comment_id)}
                        className="p-1.5 rounded-full bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
