ALTER TABLE public.bookmarks
  ADD COLUMN last_visited_at timestamptz,
  ADD COLUMN visit_count integer NOT NULL DEFAULT 0
    CHECK (visit_count >= 0);

CREATE INDEX bookmarks_user_visit_count_idx
  ON public.bookmarks (user_id, visit_count DESC, last_visited_at DESC)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.record_bookmark_visit(
  p_user_id uuid,
  p_url text,
  p_visited_at timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_rows integer;
BEGIN
  UPDATE public.bookmarks
  SET visit_count = visit_count + 1,
      last_visited_at = GREATEST(last_visited_at, p_visited_at)
  WHERE user_id = p_user_id
    AND url = p_url
    AND deleted_at IS NULL;

  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RETURN updated_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.record_bookmark_visit(uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_bookmark_visit(uuid, text, timestamptz)
  TO service_role;
