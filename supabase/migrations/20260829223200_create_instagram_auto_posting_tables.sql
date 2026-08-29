/*
# Instagram Auto-Posting: S3 Content Storage, Media Library, and Post Variations

## Overview
This migration creates the database schema for the Instagram auto-posting system.
It adds tables for S3 content storage configuration, a media library for uploaded
images and videos, post batches and AI-generated variations, and per-account
posting schedules. All tables use owner-scoped Row Level Security.

## New Tables

### 1. media_storage_config
Stores the CloudFront distribution domain and S3 bucket name per user so the
app knows where to serve and store Instagram content.
- user_id (uuid, owner, defaults to auth.uid())
- cloudfront_domain (text, e.g. "d292js7mlprar.cloudfront.net")
- bucket_name (text, the S3 bucket name)
- bucket_region (text, optional AWS region for the bucket)
- created_at, updated_at (timestamps)

### 2. media_assets
Tracks every file uploaded to the user's content library in S3.
- user_id (uuid, owner, defaults to auth.uid())
- file_name (text, original uploaded filename)
- s3_key (text, full S3 path, e.g. "instagram/library/{user_id}/photo.jpg")
- cloudfront_url (text, full CloudFront URL for public access)
- file_type (text, "image" or "video")
- file_size (bigint, bytes)
- mime_type (text, e.g. "image/jpeg")
- duration_seconds (integer, for videos only, nullable)
- transcript (text, for videos after Whisper transcription, nullable)
- width, height (integer, image/video dimensions, nullable)
- created_at (timestamp)

### 3. instagram_post_batches
Stores the configuration for a batch of auto-generated post variations.
- user_id (uuid, owner, defaults to auth.uid())
- base_caption (text, the original caption to vary)
- hashtags (text array, hashtags to shuffle/reorder)
- content_type (text, "post" or "reel")
- selected_asset_ids (uuid array, library assets selected for this batch)
- variation_settings (jsonb, what to vary: caption, hashtags, font, filename, time)
- randomize_content (boolean, shuffle which assets go to which account)
- preview_count (integer, how many variations to generate for preview)
- prompt_id (uuid, the Instagram Post Variations prompt for AI caption generation, nullable)
- carousel_size (integer, default number of images per carousel post)
- status (text, "draft", "generating", "ready", "scheduled")
- created_at, updated_at (timestamps)

### 4. instagram_post_variations
Each generated variation for a specific Instagram account within a batch.
- batch_id (uuid, FK to instagram_post_batches)
- user_id (uuid, owner, defaults to auth.uid())
- account_id (uuid, FK to instagram_accounts)
- cloudfront_url (text, URL of the edited content served via CloudFront)
- s3_key (text, current S3 path)
- caption (text, the AI-generated or shuffled caption)
- hashtags (text array, reordered hashtags)
- font_used (text, which font was used for on-image text, nullable)
- status (text: "generating", "staged", "approved", "rejected", "scheduled", "publishing", "published", "failed")
- scheduled_for (timestamptz, when the post should go live, nullable)
- ig_media_id (text, Instagram media ID after publishing, nullable)
- permalink (text, Instagram permalink after publishing, nullable)
- error_message (text, failure details, nullable)
- retry_count (integer, default 0)
- created_at, updated_at (timestamps)

### 5. instagram_posting_schedules
Per-account posting schedule settings.
- user_id (uuid, owner, defaults to auth.uid())
- account_id (uuid, FK to instagram_accounts)
- auto_posting_enabled (boolean, default false)
- posts_per_day (numeric, default 1)
- start_time (time, default 09:00)
- end_time (time, default 21:00)
- active_days (integer array, 0=Sun..6=Sat, default all days)
- min_gap_minutes (integer, minimum minutes between posts, default 60)
- carousel_size (integer, default number of images per post, default 1)
- created_at, updated_at (timestamps)
- UNIQUE constraint on (user_id, account_id)

## Security
- RLS enabled on all tables.
- Owner-scoped CRUD policies (select, insert, update, delete) using auth.uid() = user_id.
- All owner columns default to auth.uid() so inserts from the frontend work without
  explicitly passing user_id.

## Indexes
- media_assets: user_id for library queries
- instagram_post_batches: user_id for listing batches
- instagram_post_variations: batch_id for listing variations in a batch,
  account_id for per-account views, status for queue processing,
  scheduled_for for the queue processor
- instagram_posting_schedules: account_id for lookups
*/