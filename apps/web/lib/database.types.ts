// apps/web/lib/database.types.ts
// Generated-style type definitions for Supabase tables.
// Keep in sync with supabase/migrations/0001_init.sql

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      devices: {
        Row: {
          id: string;
          user_id: string;
          device_name: string;
          browser: string;
          linking_code: string | null;
          linking_code_expires_at: string | null;
          api_key_hash: string | null;
          created_at: string;
          last_synced_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          device_name: string;
          browser: string;
          linking_code?: string | null;
          linking_code_expires_at?: string | null;
          api_key_hash?: string | null;
          created_at?: string;
          last_synced_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["devices"]["Insert"]>;
      };
      bookmarks: {
        Row: {
          id: string;
          user_id: string;
          device_id: string;
          url: string;
          title: string | null;
          description: string | null;
          tags: string[];
          folder_path: string | null;
          browser_bookmark_id: string | null;
          source: "browser" | "bot";
          description_pending: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          device_id: string;
          url: string;
          title?: string | null;
          description?: string | null;
          tags?: string[];
          folder_path?: string | null;
          browser_bookmark_id?: string | null;
          source?: "browser" | "bot";
          description_pending?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["bookmarks"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// Convenience row types
export type Device = Database["public"]["Tables"]["devices"]["Row"];
export type Bookmark = Database["public"]["Tables"]["bookmarks"]["Row"];
