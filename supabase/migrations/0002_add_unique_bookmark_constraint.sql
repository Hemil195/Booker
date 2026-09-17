-- ============================================================
-- Bookar Migration: 0002_add_unique_bookmark_constraint.sql
-- Safely cleans up duplicate (user_id, url) rows and adds UNIQUE constraint
-- ============================================================

-- 1. Remove duplicate (user_id, url) rows, keeping the most recently updated row
DELETE FROM public.bookmarks a
USING public.bookmarks b
WHERE a.created_at < b.created_at
  AND a.user_id = b.user_id
  AND a.url = b.url;

-- 2. Drop constraint if it already exists (prevents duplicate constraint error on re-run)
ALTER TABLE public.bookmarks DROP CONSTRAINT IF EXISTS bookmarks_user_id_url_key;

-- 3. Add unique constraint on (user_id, url)
ALTER TABLE public.bookmarks
  ADD CONSTRAINT bookmarks_user_id_url_key UNIQUE (user_id, url);
