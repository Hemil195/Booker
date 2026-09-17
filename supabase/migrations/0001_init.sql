-- ============================================================
-- Bookar — Initial Schema
-- Migration: 0001_init.sql
-- ============================================================

-- users table is handled by Supabase Auth automatically (auth.users)

-- ============================================================
-- devices table
-- Stores every linked browser/device. Each gets a long-lived
-- API key (stored hashed) after the 6-digit linking-code flow.
-- ============================================================
create table public.devices (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        references auth.users(id) not null,
  device_name     text        not null,       -- e.g. "Vicky's Laptop"
  browser         text        not null,       -- e.g. "Brave", "Chrome", "Edge"
  linking_code    text,                       -- temporary 6-digit code for pairing
  linking_code_expires_at timestamptz,        -- expires in 10 minutes
  api_key_hash    text unique,                -- HMAC-SHA256 hash of the raw key
  created_at      timestamptz default now(),
  last_synced_at  timestamptz
);

-- ============================================================
-- bookmarks table
-- Soft-delete via deleted_at. LLM description stored here.
-- source = 'browser' | 'bot'
-- ============================================================
create table public.bookmarks (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        references auth.users(id) not null,
  device_id            uuid        references public.devices(id) not null,
  url                  text        not null,
  title                text,
  description          text,               -- LLM-generated
  tags                 text[]      default '{}',
  folder_path          text,               -- e.g. "Work/Design Tools"
  browser_bookmark_id  text,               -- original ID from chrome.bookmarks API
  source               text        default 'browser',  -- 'browser' | 'bot'
  description_pending  boolean     default false, -- true if LLM call failed/rate-limited
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  deleted_at           timestamptz         -- soft delete (NULL = active)
);

-- ============================================================
-- Indexes
-- ============================================================
create index bookmarks_user_id_idx on public.bookmarks(user_id);

-- Full-text search index on title + description
create index bookmarks_search_idx on public.bookmarks
  using gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));

-- For extension sync: fast lookup by device + browser_bookmark_id
create index bookmarks_device_browser_id_idx
  on public.bookmarks(device_id, browser_bookmark_id);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.bookmarks enable row level security;
alter table public.devices   enable row level security;

-- Users can only read/write their own bookmarks
create policy "Users can only see their own bookmarks"
  on public.bookmarks for all
  using (auth.uid() = user_id);

-- Users can only read/write their own devices
create policy "Users can only see their own devices"
  on public.devices for all
  using (auth.uid() = user_id);

-- ============================================================
-- updated_at trigger
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger bookmarks_set_updated_at
  before update on public.bookmarks
  for each row execute procedure public.set_updated_at();
