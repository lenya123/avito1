export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: unknown
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_sales_corrections: {
        Row: {
          ai_analysis: string | null
          ai_detected_type: string | null
          corrected_text: string
          correction_type: string | null
          created_at: string | null
          draft_id: string
          id: string
          original_text: string
          used_in_version_id: string | null
          user_id: string
        }
        Insert: {
          ai_analysis?: string | null
          ai_detected_type?: string | null
          corrected_text: string
          correction_type?: string | null
          created_at?: string | null
          draft_id: string
          id?: string
          original_text: string
          used_in_version_id?: string | null
          user_id: string
        }
        Update: {
          ai_analysis?: string | null
          ai_detected_type?: string | null
          corrected_text?: string
          correction_type?: string | null
          created_at?: string | null
          draft_id?: string
          id?: string
          original_text?: string
          used_in_version_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_sales_corrections_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "ai_sales_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_sales_corrections_used_in_version_id_fkey"
            columns: ["used_in_version_id"]
            isOneToOne: false
            referencedRelation: "ai_sales_prompt_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_sales_corrections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_sales_daily_stats: {
        Row: {
          approval_rate: number | null
          avg_generation_time_ms: number | null
          avg_response_time_sec: number | null
          avg_review_time_sec: number | null
          chats_with_deal: number | null
          chats_with_response: number | null
          correction_rate: number | null
          created_at: string | null
          date: string
          estimated_cost_usd: number | null
          id: string
          total_approved: number | null
          total_auto_sent: number | null
          total_drafts: number | null
          total_edited: number | null
          total_expired: number | null
          total_incoming: number | null
          total_rejected: number | null
          total_tokens: number | null
          user_id: string
        }
        Insert: {
          approval_rate?: number | null
          avg_generation_time_ms?: number | null
          avg_response_time_sec?: number | null
          avg_review_time_sec?: number | null
          chats_with_deal?: number | null
          chats_with_response?: number | null
          correction_rate?: number | null
          created_at?: string | null
          date: string
          estimated_cost_usd?: number | null
          id?: string
          total_approved?: number | null
          total_auto_sent?: number | null
          total_drafts?: number | null
          total_edited?: number | null
          total_expired?: number | null
          total_incoming?: number | null
          total_rejected?: number | null
          total_tokens?: number | null
          user_id: string
        }
        Update: {
          approval_rate?: number | null
          avg_generation_time_ms?: number | null
          avg_response_time_sec?: number | null
          avg_review_time_sec?: number | null
          chats_with_deal?: number | null
          chats_with_response?: number | null
          correction_rate?: number | null
          created_at?: string | null
          date?: string
          estimated_cost_usd?: number | null
          id?: string
          total_approved?: number | null
          total_auto_sent?: number | null
          total_drafts?: number | null
          total_edited?: number | null
          total_expired?: number | null
          total_incoming?: number | null
          total_rejected?: number | null
          total_tokens?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_sales_daily_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_sales_drafts: {
        Row: {
          avito_chat_id: string
          avito_message_id: string | null
          buyer_message: string
          chat_history: Json | null
          confidence: number | null
          created_at: string | null
          edited_draft: string | null
          expired_at: string | null
          generated_at: string | null
          generation_time_ms: number | null
          id: string
          item_context: Json | null
          original_draft: string
          product_context: Json | null
          prompt_version_id: string | null
          reasoning: string | null
          reviewed_at: string | null
          sent_at: string | null
          sent_avito_message_id: string | null
          status: string
          tokens_used: number | null
          user_id: string
        }
        Insert: {
          avito_chat_id: string
          avito_message_id?: string | null
          buyer_message: string
          chat_history?: Json | null
          confidence?: number | null
          created_at?: string | null
          edited_draft?: string | null
          expired_at?: string | null
          generated_at?: string | null
          generation_time_ms?: number | null
          id?: string
          item_context?: Json | null
          original_draft: string
          product_context?: Json | null
          prompt_version_id?: string | null
          reasoning?: string | null
          reviewed_at?: string | null
          sent_at?: string | null
          sent_avito_message_id?: string | null
          status?: string
          tokens_used?: number | null
          user_id: string
        }
        Update: {
          avito_chat_id?: string
          avito_message_id?: string | null
          buyer_message?: string
          chat_history?: Json | null
          confidence?: number | null
          created_at?: string | null
          edited_draft?: string | null
          expired_at?: string | null
          generated_at?: string | null
          generation_time_ms?: number | null
          id?: string
          item_context?: Json | null
          original_draft?: string
          product_context?: Json | null
          prompt_version_id?: string | null
          reasoning?: string | null
          reviewed_at?: string | null
          sent_at?: string | null
          sent_avito_message_id?: string | null
          status?: string
          tokens_used?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_sales_drafts_avito_chat_id_fkey"
            columns: ["avito_chat_id"]
            isOneToOne: false
            referencedRelation: "avito_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_sales_drafts_avito_message_id_fkey"
            columns: ["avito_message_id"]
            isOneToOne: false
            referencedRelation: "avito_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_sales_drafts_prompt_version_id_fkey"
            columns: ["prompt_version_id"]
            isOneToOne: false
            referencedRelation: "ai_sales_prompt_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_sales_drafts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_sales_prompt_versions: {
        Row: {
          accuracy_at_creation: number | null
          correction_count: number | null
          created_at: string | null
          few_shot_examples: Json | null
          id: string
          is_active: boolean | null
          learned_rules: Json | null
          system_prompt: string
          user_id: string
          version: number
        }
        Insert: {
          accuracy_at_creation?: number | null
          correction_count?: number | null
          created_at?: string | null
          few_shot_examples?: Json | null
          id?: string
          is_active?: boolean | null
          learned_rules?: Json | null
          system_prompt: string
          user_id: string
          version?: number
        }
        Update: {
          accuracy_at_creation?: number | null
          correction_count?: number | null
          created_at?: string | null
          few_shot_examples?: Json | null
          id?: string
          is_active?: boolean | null
          learned_rules?: Json | null
          system_prompt?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_sales_prompt_versions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_sales_settings: {
        Row: {
          confidence_threshold: number | null
          created_at: string | null
          id: string
          is_enabled: boolean | null
          max_auto_sends_per_day: number | null
          max_drafts_per_day: number | null
          max_response_delay: number | null
          min_response_delay: number | null
          mode: string
          notify_daily_summary: boolean | null
          notify_on_draft: boolean | null
          notify_on_low_confidence: boolean | null
          timezone: string | null
          updated_at: string | null
          user_id: string
          work_hours_end: number | null
          work_hours_start: number | null
        }
        Insert: {
          confidence_threshold?: number | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          max_auto_sends_per_day?: number | null
          max_drafts_per_day?: number | null
          max_response_delay?: number | null
          min_response_delay?: number | null
          mode?: string
          notify_daily_summary?: boolean | null
          notify_on_draft?: boolean | null
          notify_on_low_confidence?: boolean | null
          timezone?: string | null
          updated_at?: string | null
          user_id: string
          work_hours_end?: number | null
          work_hours_start?: number | null
        }
        Update: {
          confidence_threshold?: number | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          max_auto_sends_per_day?: number | null
          max_drafts_per_day?: number | null
          max_response_delay?: number | null
          min_response_delay?: number | null
          mode?: string
          notify_daily_summary?: boolean | null
          notify_on_draft?: boolean | null
          notify_on_low_confidence?: boolean | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string
          work_hours_end?: number | null
          work_hours_start?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_sales_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_ai_cache: {
        Row: {
          created_at: string
          expires_at: string
          insights: Json
          period_key: string
          summary: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          insights?: Json
          period_key: string
          summary: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          insights?: Json
          period_key?: string
          summary?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_ai_cache_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      avito_ai_gen_counters: {
        Row: {
          category: string
          created_at: string
          gen_date: string
          id: string
          product_id: string
          used_count: number
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          gen_date: string
          id?: string
          product_id: string
          used_count?: number
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          gen_date?: string
          id?: string
          product_id?: string
          used_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avito_ai_gen_counters_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avito_ai_gen_counters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      avito_ai_generations: {
        Row: {
          approved_preset_id: string | null
          attempt: number
          category: string
          created_at: string
          id: string
          product_id: string
          prompt: string | null
          public_url: string | null
          reference_preset_id: string | null
          source_photoset_set_key: string | null
          status: string
          storage_path: string
          tg_chat_id: number | null
          tg_message_id: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_preset_id?: string | null
          attempt?: number
          category: string
          created_at?: string
          id?: string
          product_id: string
          prompt?: string | null
          public_url?: string | null
          reference_preset_id?: string | null
          source_photoset_set_key?: string | null
          status?: string
          storage_path: string
          tg_chat_id?: number | null
          tg_message_id?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_preset_id?: string | null
          attempt?: number
          category?: string
          created_at?: string
          id?: string
          product_id?: string
          prompt?: string | null
          public_url?: string | null
          reference_preset_id?: string | null
          source_photoset_set_key?: string | null
          status?: string
          storage_path?: string
          tg_chat_id?: number | null
          tg_message_id?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avito_ai_generations_approved_preset_id_fkey"
            columns: ["approved_preset_id"]
            isOneToOne: false
            referencedRelation: "avito_media_presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avito_ai_generations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avito_ai_generations_reference_preset_id_fkey"
            columns: ["reference_preset_id"]
            isOneToOne: false
            referencedRelation: "avito_media_presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avito_ai_generations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      avito_browser_sessions: {
        Row: {
          account_index: number
          ad_balance: number | null
          api_key: string | null
          avito_client_id: string | null
          avito_client_secret: string | null
          avito_login: string | null
          avito_password_enc: string | null
          avito_user_id: number | null
          balance_bonus: number | null
          balance_real: number | null
          balance_synced_at: string | null
          browser_fingerprint: Json | null
          cookies: Json
          created_at: string
          display_name: string | null
          error_message: string | null
          id: string
          last_login_at: string | null
          last_sync_at: string | null
          proxy_url: string | null
          rating: number | null
          rating_count: number | null
          shop_name: string | null
          sms_code: string | null
          status: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          account_index?: number
          ad_balance?: number | null
          api_key?: string | null
          avito_client_id?: string | null
          avito_client_secret?: string | null
          avito_login?: string | null
          avito_password_enc?: string | null
          avito_user_id?: number | null
          balance_bonus?: number | null
          balance_real?: number | null
          balance_synced_at?: string | null
          browser_fingerprint?: Json | null
          cookies?: Json
          created_at?: string
          display_name?: string | null
          error_message?: string | null
          id?: string
          last_login_at?: string | null
          last_sync_at?: string | null
          proxy_url?: string | null
          rating?: number | null
          rating_count?: number | null
          shop_name?: string | null
          sms_code?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          account_index?: number
          ad_balance?: number | null
          api_key?: string | null
          avito_client_id?: string | null
          avito_client_secret?: string | null
          avito_login?: string | null
          avito_password_enc?: string | null
          avito_user_id?: number | null
          balance_bonus?: number | null
          balance_real?: number | null
          balance_synced_at?: string | null
          browser_fingerprint?: Json | null
          cookies?: Json
          created_at?: string
          display_name?: string | null
          error_message?: string | null
          id?: string
          last_login_at?: string | null
          last_sync_at?: string | null
          proxy_url?: string | null
          rating?: number | null
          rating_count?: number | null
          shop_name?: string | null
          sms_code?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avito_browser_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      avito_chats: {
        Row: {
          avito_chat_id: string
          buyer_avito_id: number | null
          buyer_name: string | null
          created_at: string | null
          id: string
          item_id: number | null
          item_image_url: string | null
          item_price: number | null
          item_title: string | null
          item_url: string | null
          last_message: string | null
          last_message_at: string | null
          last_message_direction: string | null
          session_id: string | null
          synced_at: string | null
          unread_count: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avito_chat_id: string
          buyer_avito_id?: number | null
          buyer_name?: string | null
          created_at?: string | null
          id?: string
          item_id?: number | null
          item_image_url?: string | null
          item_price?: number | null
          item_title?: string | null
          item_url?: string | null
          last_message?: string | null
          last_message_at?: string | null
          last_message_direction?: string | null
          session_id?: string | null
          synced_at?: string | null
          unread_count?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avito_chat_id?: string
          buyer_avito_id?: number | null
          buyer_name?: string | null
          created_at?: string | null
          id?: string
          item_id?: number | null
          item_image_url?: string | null
          item_price?: number | null
          item_title?: string | null
          item_url?: string | null
          last_message?: string | null
          last_message_at?: string | null
          last_message_direction?: string | null
          session_id?: string | null
          synced_at?: string | null
          unread_count?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avito_chats_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "avito_browser_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avito_chats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      avito_cover_presets: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          id: string
          photo_url: string
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          photo_url: string
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          photo_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "avito_cover_presets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      avito_item_product_mapping: {
        Row: {
          avito_item_id: number
          created_at: string | null
          id: string
          match_confidence: number | null
          match_type: string | null
          product_id: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          avito_item_id: number
          created_at?: string | null
          id?: string
          match_confidence?: number | null
          match_type?: string | null
          product_id: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          avito_item_id?: number
          created_at?: string | null
          id?: string
          match_confidence?: number | null
          match_type?: string | null
          product_id?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avito_item_product_mapping_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avito_item_product_mapping_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "avito_browser_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avito_item_product_mapping_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      avito_item_stats_daily: {
        Row: {
          avito_item_id: string
          contacts: number
          date: string
          favorites: number
          id: string
          orders: number
          session_id: string
          synced_at: string
          user_id: string
          views: number
        }
        Insert: {
          avito_item_id: string
          contacts?: number
          date: string
          favorites?: number
          id?: string
          orders?: number
          session_id: string
          synced_at?: string
          user_id: string
          views?: number
        }
        Update: {
          avito_item_id?: string
          contacts?: number
          date?: string
          favorites?: number
          id?: string
          orders?: number
          session_id?: string
          synced_at?: string
          user_id?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "avito_item_stats_daily_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "avito_browser_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avito_item_stats_daily_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      avito_items: {
        Row: {
          address: string | null
          avito_item_id: number
          category_name: string | null
          contacts: number | null
          contacts_today: number | null
          created_at: string | null
          favorites: number | null
          favorites_today: number | null
          id: string
          image_url: string | null
          orders_count: number
          orders_today: number
          price: number | null
          product_id: string | null
          session_id: string | null
          status: string | null
          synced_at: string | null
          title: string
          updated_at: string | null
          url: string | null
          user_id: string
          views: number | null
          views_today: number | null
        }
        Insert: {
          address?: string | null
          avito_item_id: number
          category_name?: string | null
          contacts?: number | null
          contacts_today?: number | null
          created_at?: string | null
          favorites?: number | null
          favorites_today?: number | null
          id?: string
          image_url?: string | null
          orders_count?: number
          orders_today?: number
          price?: number | null
          product_id?: string | null
          session_id?: string | null
          status?: string | null
          synced_at?: string | null
          title: string
          updated_at?: string | null
          url?: string | null
          user_id: string
          views?: number | null
          views_today?: number | null
        }
        Update: {
          address?: string | null
          avito_item_id?: number
          category_name?: string | null
          contacts?: number | null
          contacts_today?: number | null
          created_at?: string | null
          favorites?: number | null
          favorites_today?: number | null
          id?: string
          image_url?: string | null
          orders_count?: number
          orders_today?: number
          price?: number | null
          product_id?: string | null
          session_id?: string | null
          status?: string | null
          synced_at?: string | null
          title?: string
          updated_at?: string | null
          url?: string | null
          user_id?: string
          views?: number | null
          views_today?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "avito_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avito_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "avito_browser_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avito_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      avito_media_presets: {
        Row: {
          created_at: string
          gen_category: string | null
          id: string
          is_active: boolean
          kind: string
          last_used_at: string | null
          product_id: string | null
          public_url: string | null
          published_phashes: Json
          set_key: string | null
          sort_order: number
          source: string
          storage_path: string
          updated_at: string
          usage_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          gen_category?: string | null
          id?: string
          is_active?: boolean
          kind: string
          last_used_at?: string | null
          product_id?: string | null
          public_url?: string | null
          published_phashes?: Json
          set_key?: string | null
          sort_order?: number
          source?: string
          storage_path: string
          updated_at?: string
          usage_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          gen_category?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          last_used_at?: string | null
          product_id?: string | null
          public_url?: string | null
          published_phashes?: Json
          set_key?: string | null
          sort_order?: number
          source?: string
          storage_path?: string
          updated_at?: string
          usage_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avito_media_presets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avito_media_presets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      avito_messages: {
        Row: {
          author_id: number | null
          avito_created_at: string | null
          avito_message_id: string
          chat_id: string
          content_image_url: string | null
          content_text: string | null
          created_at: string | null
          direction: string
          id: string
          is_ai_generated: boolean
          message_type: string | null
          parsed_size: string | null
          user_id: string
        }
        Insert: {
          author_id?: number | null
          avito_created_at?: string | null
          avito_message_id: string
          chat_id: string
          content_image_url?: string | null
          content_text?: string | null
          created_at?: string | null
          direction: string
          id?: string
          is_ai_generated?: boolean
          message_type?: string | null
          parsed_size?: string | null
          user_id: string
        }
        Update: {
          author_id?: number | null
          avito_created_at?: string | null
          avito_message_id?: string
          chat_id?: string
          content_image_url?: string | null
          content_text?: string | null
          created_at?: string | null
          direction?: string
          id?: string
          is_ai_generated?: boolean
          message_type?: string | null
          parsed_size?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avito_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "avito_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avito_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      avito_orders: {
        Row: {
          avito_item_id: string | null
          avito_order_id: string
          channel_id: string | null
          cost_total: number | null
          created_at_avito: string | null
          delivery_details: Json | null
          id: string
          item_img_url: string | null
          item_title: string | null
          provider: string | null
          provider_label: string | null
          required_action: boolean
          return_code: string | null
          service_key: string | null
          session_id: string | null
          source_tag: string
          status: string | null
          status_label: string | null
          synced_at: string
          tracking_number: string | null
          updated_at_avito: string | null
          user_id: string
        }
        Insert: {
          avito_item_id?: string | null
          avito_order_id: string
          channel_id?: string | null
          cost_total?: number | null
          created_at_avito?: string | null
          delivery_details?: Json | null
          id?: string
          item_img_url?: string | null
          item_title?: string | null
          provider?: string | null
          provider_label?: string | null
          required_action?: boolean
          return_code?: string | null
          service_key?: string | null
          session_id?: string | null
          source_tag?: string
          status?: string | null
          status_label?: string | null
          synced_at?: string
          tracking_number?: string | null
          updated_at_avito?: string | null
          user_id: string
        }
        Update: {
          avito_item_id?: string | null
          avito_order_id?: string
          channel_id?: string | null
          cost_total?: number | null
          created_at_avito?: string | null
          delivery_details?: Json | null
          id?: string
          item_img_url?: string | null
          item_title?: string | null
          provider?: string | null
          provider_label?: string | null
          required_action?: boolean
          return_code?: string | null
          service_key?: string | null
          session_id?: string | null
          source_tag?: string
          status?: string | null
          status_label?: string | null
          synced_at?: string
          tracking_number?: string | null
          updated_at_avito?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avito_orders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "avito_browser_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avito_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      avito_photoset_presets: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          photo_urls: string[]
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          photo_urls?: string[]
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          photo_urls?: string[]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avito_photoset_presets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      avito_photoset_sets: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          last_used_at: string | null
          photo_count: number
          product_id: string | null
          set_key: string
          title: string | null
          usage_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          photo_count?: number
          product_id?: string | null
          set_key: string
          title?: string | null
          usage_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          photo_count?: number
          product_id?: string | null
          set_key?: string
          title?: string | null
          usage_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avito_photoset_sets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avito_photoset_sets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      avito_post_jobs: {
        Row: {
          attempts: number
          avito_item_id: string | null
          avito_item_url: string | null
          city: string
          created_at: string
          description: string | null
          error_message: string | null
          id: string
          manual_cover_preset_id: string | null
          manual_set_key: string | null
          metro: string | null
          photo_plan: Json
          prepared_images: Json | null
          price: number
          product_id: string | null
          published_at: string | null
          session_id: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          avito_item_id?: string | null
          avito_item_url?: string | null
          city?: string
          created_at?: string
          description?: string | null
          error_message?: string | null
          id?: string
          manual_cover_preset_id?: string | null
          manual_set_key?: string | null
          metro?: string | null
          photo_plan?: Json
          prepared_images?: Json | null
          price: number
          product_id?: string | null
          published_at?: string | null
          session_id: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          avito_item_id?: string | null
          avito_item_url?: string | null
          city?: string
          created_at?: string
          description?: string | null
          error_message?: string | null
          id?: string
          manual_cover_preset_id?: string | null
          manual_set_key?: string | null
          metro?: string | null
          photo_plan?: Json
          prepared_images?: Json | null
          price?: number
          product_id?: string | null
          published_at?: string | null
          session_id?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avito_post_jobs_manual_cover_preset_id_fkey"
            columns: ["manual_cover_preset_id"]
            isOneToOne: false
            referencedRelation: "avito_media_presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avito_post_jobs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avito_post_jobs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "avito_browser_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avito_post_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      avito_promotion_daily: {
        Row: {
          amount: number
          date: string
          id: string
          session_id: string
          synced_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          date: string
          id?: string
          session_id: string
          synced_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          date?: string
          id?: string
          session_id?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avito_promotion_daily_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "avito_browser_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avito_promotion_daily_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      avito_proxies: {
        Row: {
          assigned_to: string | null
          created_at: string
          id: string
          is_active: boolean
          proxy_url: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          proxy_url: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          proxy_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      business_settings: {
        Row: {
          avito_size_request_timeout_hours: number
          business_name: string | null
          catalog_channel_id: string | null
          director_digest_step_hours: number
          director_invite_token: string | null
          director_linked_at: string | null
          director_notify_window_end: string
          director_notify_window_start: string
          director_tg_user_id: number | null
          director_tg_username: string | null
          id: string
          last_shipper_pool_digest_date: string | null
          licence_expires_at: string | null
          notification_routes: Json
          orders_topic_id: number | null
          partner_digest_step_hours: number
          partner_notify_window_end: string
          partner_notify_window_start: string
          payment_requisites_message: string | null
          pickup_by_max_days: number
          returns_topic_id: number | null
          send_by_max_days: number
          send_by_today_cutoff: string
          support_telegram_username: string | null
          trumpet_notify_window_end: string
          trumpet_notify_window_start: string
          updated_at: string
          vibe_credit_default_limit: number
          vibe_manual_threshold: number
          vibe_receipt_confirm_threshold: number | null
        }
        Insert: {
          avito_size_request_timeout_hours?: number
          business_name?: string | null
          catalog_channel_id?: string | null
          director_digest_step_hours?: number
          director_invite_token?: string | null
          director_linked_at?: string | null
          director_notify_window_end?: string
          director_notify_window_start?: string
          director_tg_user_id?: number | null
          director_tg_username?: string | null
          id?: string
          last_shipper_pool_digest_date?: string | null
          licence_expires_at?: string | null
          notification_routes?: Json
          orders_topic_id?: number | null
          partner_digest_step_hours?: number
          partner_notify_window_end?: string
          partner_notify_window_start?: string
          payment_requisites_message?: string | null
          pickup_by_max_days?: number
          returns_topic_id?: number | null
          send_by_max_days?: number
          send_by_today_cutoff?: string
          support_telegram_username?: string | null
          trumpet_notify_window_end?: string
          trumpet_notify_window_start?: string
          updated_at?: string
          vibe_credit_default_limit?: number
          vibe_manual_threshold?: number
          vibe_receipt_confirm_threshold?: number | null
        }
        Update: {
          avito_size_request_timeout_hours?: number
          business_name?: string | null
          catalog_channel_id?: string | null
          director_digest_step_hours?: number
          director_invite_token?: string | null
          director_linked_at?: string | null
          director_notify_window_end?: string
          director_notify_window_start?: string
          director_tg_user_id?: number | null
          director_tg_username?: string | null
          id?: string
          last_shipper_pool_digest_date?: string | null
          licence_expires_at?: string | null
          notification_routes?: Json
          orders_topic_id?: number | null
          partner_digest_step_hours?: number
          partner_notify_window_end?: string
          partner_notify_window_start?: string
          payment_requisites_message?: string | null
          pickup_by_max_days?: number
          returns_topic_id?: number | null
          send_by_max_days?: number
          send_by_today_cutoff?: string
          support_telegram_username?: string | null
          trumpet_notify_window_end?: string
          trumpet_notify_window_start?: string
          updated_at?: string
          vibe_credit_default_limit?: number
          vibe_manual_threshold?: number
          vibe_receipt_confirm_threshold?: number | null
        }
        Relationships: []
      }
      customer_balance_history: {
        Row: {
          actor_user_id: string | null
          balance_after: number
          created_at: string
          customer_id: string
          delta: number
          id: string
          note: string | null
          order_id: string | null
          reason: string
          withdrawal_request_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          balance_after: number
          created_at?: string
          customer_id: string
          delta: number
          id?: string
          note?: string | null
          order_id?: string | null
          reason: string
          withdrawal_request_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          balance_after?: number
          created_at?: string
          customer_id?: string
          delta?: number
          id?: string
          note?: string | null
          order_id?: string | null
          reason?: string
          withdrawal_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_balance_history_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_balance_history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance_integrity_view"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_balance_history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_risk_profile"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_balance_history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_vibe_debt"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_balance_history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_balance_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_balance_history_withdrawal_fk"
            columns: ["withdrawal_request_id"]
            isOneToOne: false
            referencedRelation: "withdrawal_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_conversations: {
        Row: {
          content: string
          created_at: string
          customer_id: string
          id: string
          metadata: Json | null
          role: string
          tg_chat_id: number
        }
        Insert: {
          content: string
          created_at?: string
          customer_id: string
          id?: string
          metadata?: Json | null
          role: string
          tg_chat_id: number
        }
        Update: {
          content?: string
          created_at?: string
          customer_id?: string
          id?: string
          metadata?: Json | null
          role?: string
          tg_chat_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance_integrity_view"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_risk_profile"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_vibe_debt"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          blocked_reason: string | null
          created_at: string
          customer_balance: number
          frozen_at: string | null
          frozen_debt_snapshot: number | null
          frozen_reason: string | null
          id: string
          is_blocked: boolean
          is_frozen: boolean
          name: string | null
          notes: string | null
          phone: string | null
          required_payment_amount: number | null
          telegram_username: string | null
          tg_user_id: number
          updated_at: string
          vibe_credit_limit_override: number | null
          vibe_enabled: boolean
        }
        Insert: {
          blocked_reason?: string | null
          created_at?: string
          customer_balance?: number
          frozen_at?: string | null
          frozen_debt_snapshot?: number | null
          frozen_reason?: string | null
          id?: string
          is_blocked?: boolean
          is_frozen?: boolean
          name?: string | null
          notes?: string | null
          phone?: string | null
          required_payment_amount?: number | null
          telegram_username?: string | null
          tg_user_id: number
          updated_at?: string
          vibe_credit_limit_override?: number | null
          vibe_enabled?: boolean
        }
        Update: {
          blocked_reason?: string | null
          created_at?: string
          customer_balance?: number
          frozen_at?: string | null
          frozen_debt_snapshot?: number | null
          frozen_reason?: string | null
          id?: string
          is_blocked?: boolean
          is_frozen?: boolean
          name?: string | null
          notes?: string | null
          phone?: string | null
          required_payment_amount?: number | null
          telegram_username?: string | null
          tg_user_id?: number
          updated_at?: string
          vibe_credit_limit_override?: number | null
          vibe_enabled?: boolean
        }
        Relationships: []
      }
      data_imports: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_log: Json | null
          failed_rows: number
          id: string
          kind: string
          processed_rows: number
          source_file_url: string | null
          source_format: string | null
          started_at: string | null
          status: string
          success_rows: number
          total_rows: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_log?: Json | null
          failed_rows?: number
          id?: string
          kind: string
          processed_rows?: number
          source_file_url?: string | null
          source_format?: string | null
          started_at?: string | null
          status?: string
          success_rows?: number
          total_rows?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_log?: Json | null
          failed_rows?: number
          id?: string
          kind?: string
          processed_rows?: number
          source_file_url?: string | null
          source_format?: string | null
          started_at?: string | null
          status?: string
          success_rows?: number
          total_rows?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "data_imports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          expense_date: string | null
          id: string
          product_id: string | null
          supplier_id: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          expense_date?: string | null
          id?: string
          product_id?: string | null
          supplier_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          expense_date?: string | null
          id?: string
          product_id?: string | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string | null
          id: string
          product_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_alerts: {
        Row: {
          alert_type: string
          created_at: string | null
          customer_id: string | null
          details: Json | null
          id: string
          is_resolved: boolean | null
          notified_at: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string | null
          status: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string | null
          customer_id?: string | null
          details?: Json | null
          id?: string
          is_resolved?: boolean | null
          notified_at?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          status?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          customer_id?: string | null
          details?: Json | null
          id?: string
          is_resolved?: boolean | null
          notified_at?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fraud_alerts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance_integrity_view"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "fraud_alerts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_risk_profile"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "fraud_alerts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_vibe_debt"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "fraud_alerts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      location_pickup_points: {
        Row: {
          city: string
          created_at: string | null
          id: string
          pickup_point_id: string
        }
        Insert: {
          city: string
          created_at?: string | null
          id?: string
          pickup_point_id: string
        }
        Update: {
          city?: string
          created_at?: string | null
          id?: string
          pickup_point_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_pickup_points_pickup_point_id_fkey"
            columns: ["pickup_point_id"]
            isOneToOne: false
            referencedRelation: "pickup_points"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          data: Json | null
          id: string
          is_read: boolean | null
          message: string
          sent_at: string | null
          sent_to_telegram: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message: string
          sent_at?: string | null
          sent_to_telegram?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message?: string
          sent_at?: string | null
          sent_to_telegram?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      order_messages: {
        Row: {
          body: string | null
          created_at: string
          direction: string
          id: string
          kind: string
          metadata: Json | null
          order_id: string
          tg_chat_id: number
          tg_message_id: number
          tg_thread_id: number | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          direction: string
          id?: string
          kind: string
          metadata?: Json | null
          order_id: string
          tg_chat_id: number
          tg_message_id: number
          tg_thread_id?: number | null
        }
        Update: {
          body?: string | null
          created_at?: string
          direction?: string
          id?: string
          kind?: string
          metadata?: Json | null
          order_id?: string
          tg_chat_id?: number
          tg_message_id?: number
          tg_thread_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          applied_balance: number
          avito_buyer_name: string | null
          avito_delivery_address: string | null
          avito_fee_snapshot: number | null
          avito_marketing_snapshot: number | null
          avito_order_id: string | null
          barcode_image_url: string | null
          barcode_printed: boolean | null
          barcode_printed_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          claimed_at: string | null
          claimed_by: string | null
          client_comment: string | null
          client_price: number
          client_profit: number | null
          completed_at: string | null
          confirmed_by: string | null
          created_at: string | null
          customer_id: string | null
          customer_name_snapshot: string | null
          customer_tg_username_snapshot: string | null
          delivered_at: string | null
          delivery_service: string
          dispatch_city: string | null
          disposed_at: string | null
          dispute_photos: Json | null
          dispute_reason: string | null
          expected_return_date: string | null
          fault_party: string | null
          fault_reason: string | null
          id: string
          idempotency_key: string | null
          is_paid: boolean | null
          linked_return_order_id: string | null
          order_number: number
          paid_at: string | null
          partner_commission_paid_at: string | null
          partner_commission_snapshot: number | null
          partner_id: string | null
          partner_payment_received_at: string | null
          partner_requisites_text: string | null
          payment_id: string | null
          payment_method: string | null
          payment_method_id: string | null
          pickup_by: string
          pickup_point_address_snapshot: string | null
          pickup_point_id: string | null
          pickup_point_label_snapshot: string | null
          problem_type: string | null
          product_id: string | null
          product_size_id: string | null
          purchase_price: number
          receipt_storage_path: string | null
          return_arrived_at: string | null
          return_attempts_count: number
          return_barcode_image_url: string | null
          return_code: string | null
          return_code_updated_at: string | null
          return_completed_at: string | null
          return_completed_by: string | null
          return_initiated_at: string | null
          return_pickup_address: string | null
          return_tracking_number: string | null
          return_window_days: number | null
          sale_price: number | null
          send_by: string
          shipped_at: string | null
          shipped_by: string | null
          shipper_rate_snapshot: number | null
          size: string | null
          source: string | null
          source_binding_id: string | null
          source_kind: string | null
          source_partner_id: string | null
          source_warehouse: string | null
          status: string | null
          status_history: Json | null
          system_comment: string | null
          tracking_number: string | null
          trash_at: string | null
          trash_deadline: string | null
          updated_at: string | null
          urgent_alert_sent_at: string | null
          vision_amount: number | null
          vision_operation_id: string | null
          vision_raw_text: string | null
          vision_recipient_card_last4: string | null
          vision_recipient_ip_name: string | null
          vision_recipient_phone: string | null
        }
        Insert: {
          applied_balance?: number
          avito_buyer_name?: string | null
          avito_delivery_address?: string | null
          avito_fee_snapshot?: number | null
          avito_marketing_snapshot?: number | null
          avito_order_id?: string | null
          barcode_image_url?: string | null
          barcode_printed?: boolean | null
          barcode_printed_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          client_comment?: string | null
          client_price: number
          client_profit?: number | null
          completed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_name_snapshot?: string | null
          customer_tg_username_snapshot?: string | null
          delivered_at?: string | null
          delivery_service: string
          dispatch_city?: string | null
          disposed_at?: string | null
          dispute_photos?: Json | null
          dispute_reason?: string | null
          expected_return_date?: string | null
          fault_party?: string | null
          fault_reason?: string | null
          id?: string
          idempotency_key?: string | null
          is_paid?: boolean | null
          linked_return_order_id?: string | null
          order_number?: number
          paid_at?: string | null
          partner_commission_paid_at?: string | null
          partner_commission_snapshot?: number | null
          partner_id?: string | null
          partner_payment_received_at?: string | null
          partner_requisites_text?: string | null
          payment_id?: string | null
          payment_method?: string | null
          payment_method_id?: string | null
          pickup_by: string
          pickup_point_address_snapshot?: string | null
          pickup_point_id?: string | null
          pickup_point_label_snapshot?: string | null
          problem_type?: string | null
          product_id?: string | null
          product_size_id?: string | null
          purchase_price: number
          receipt_storage_path?: string | null
          return_arrived_at?: string | null
          return_attempts_count?: number
          return_barcode_image_url?: string | null
          return_code?: string | null
          return_code_updated_at?: string | null
          return_completed_at?: string | null
          return_completed_by?: string | null
          return_initiated_at?: string | null
          return_pickup_address?: string | null
          return_tracking_number?: string | null
          return_window_days?: number | null
          sale_price?: number | null
          send_by: string
          shipped_at?: string | null
          shipped_by?: string | null
          shipper_rate_snapshot?: number | null
          size?: string | null
          source?: string | null
          source_binding_id?: string | null
          source_kind?: string | null
          source_partner_id?: string | null
          source_warehouse?: string | null
          status?: string | null
          status_history?: Json | null
          system_comment?: string | null
          tracking_number?: string | null
          trash_at?: string | null
          trash_deadline?: string | null
          updated_at?: string | null
          urgent_alert_sent_at?: string | null
          vision_amount?: number | null
          vision_operation_id?: string | null
          vision_raw_text?: string | null
          vision_recipient_card_last4?: string | null
          vision_recipient_ip_name?: string | null
          vision_recipient_phone?: string | null
        }
        Update: {
          applied_balance?: number
          avito_buyer_name?: string | null
          avito_delivery_address?: string | null
          avito_fee_snapshot?: number | null
          avito_marketing_snapshot?: number | null
          avito_order_id?: string | null
          barcode_image_url?: string | null
          barcode_printed?: boolean | null
          barcode_printed_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          client_comment?: string | null
          client_price?: number
          client_profit?: number | null
          completed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_name_snapshot?: string | null
          customer_tg_username_snapshot?: string | null
          delivered_at?: string | null
          delivery_service?: string
          dispatch_city?: string | null
          disposed_at?: string | null
          dispute_photos?: Json | null
          dispute_reason?: string | null
          expected_return_date?: string | null
          fault_party?: string | null
          fault_reason?: string | null
          id?: string
          idempotency_key?: string | null
          is_paid?: boolean | null
          linked_return_order_id?: string | null
          order_number?: number
          paid_at?: string | null
          partner_commission_paid_at?: string | null
          partner_commission_snapshot?: number | null
          partner_id?: string | null
          partner_payment_received_at?: string | null
          partner_requisites_text?: string | null
          payment_id?: string | null
          payment_method?: string | null
          payment_method_id?: string | null
          pickup_by?: string
          pickup_point_address_snapshot?: string | null
          pickup_point_id?: string | null
          pickup_point_label_snapshot?: string | null
          problem_type?: string | null
          product_id?: string | null
          product_size_id?: string | null
          purchase_price?: number
          receipt_storage_path?: string | null
          return_arrived_at?: string | null
          return_attempts_count?: number
          return_barcode_image_url?: string | null
          return_code?: string | null
          return_code_updated_at?: string | null
          return_completed_at?: string | null
          return_completed_by?: string | null
          return_initiated_at?: string | null
          return_pickup_address?: string | null
          return_tracking_number?: string | null
          return_window_days?: number | null
          sale_price?: number | null
          send_by?: string
          shipped_at?: string | null
          shipped_by?: string | null
          shipper_rate_snapshot?: number | null
          size?: string | null
          source?: string | null
          source_binding_id?: string | null
          source_kind?: string | null
          source_partner_id?: string | null
          source_warehouse?: string | null
          status?: string | null
          status_history?: Json | null
          system_comment?: string | null
          tracking_number?: string | null
          trash_at?: string | null
          trash_deadline?: string | null
          updated_at?: string | null
          urgent_alert_sent_at?: string | null
          vision_amount?: number | null
          vision_operation_id?: string | null
          vision_raw_text?: string | null
          vision_recipient_card_last4?: string | null
          vision_recipient_ip_name?: string | null
          vision_recipient_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance_integrity_view"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_risk_profile"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_vibe_debt"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_linked_return_order_id_fkey"
            columns: ["linked_return_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_commission_debt"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "orders_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_product_size_id_fkey"
            columns: ["product_size_id"]
            isOneToOne: false
            referencedRelation: "product_sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_return_completed_by_fkey"
            columns: ["return_completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shipped_by_fkey"
            columns: ["shipped_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_source_binding_id_fkey"
            columns: ["source_binding_id"]
            isOneToOne: false
            referencedRelation: "product_partner_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_source_partner_id_fkey"
            columns: ["source_partner_id"]
            isOneToOne: false
            referencedRelation: "partner_commission_debt"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "orders_source_partner_id_fkey"
            columns: ["source_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_owner_debts: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_id: string | null
          partner_id: string
          pending_id: string | null
          reason: string
          settled_at: string | null
          settled_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          order_id?: string | null
          partner_id: string
          pending_id?: string | null
          reason: string
          settled_at?: string | null
          settled_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_id?: string | null
          partner_id?: string
          pending_id?: string | null
          reason?: string
          settled_at?: string | null
          settled_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_owner_debts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_owner_debts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_commission_debt"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_owner_debts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          accepts_vibe_debt: boolean
          created_at: string
          id: string
          invite_token: string
          is_active: boolean
          name: string
          notes: string | null
          payment_requisites: Json | null
          tg_user_id: number | null
          tg_username: string | null
          updated_at: string
          warehouse_city: string
        }
        Insert: {
          accepts_vibe_debt?: boolean
          created_at?: string
          id?: string
          invite_token?: string
          is_active?: boolean
          name: string
          notes?: string | null
          payment_requisites?: Json | null
          tg_user_id?: number | null
          tg_username?: string | null
          updated_at?: string
          warehouse_city: string
        }
        Update: {
          accepts_vibe_debt?: boolean
          created_at?: string
          id?: string
          invite_token?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          payment_requisites?: Json | null
          tg_user_id?: number | null
          tg_username?: string | null
          updated_at?: string
          warehouse_city?: string
        }
        Relationships: []
      }
      payment_method_month_stats: {
        Row: {
          amount_used: number
          payment_method_id: string
          updated_at: string
          year_month: string
        }
        Insert: {
          amount_used?: number
          payment_method_id: string
          updated_at?: string
          year_month: string
        }
        Update: {
          amount_used?: number
          payment_method_id?: string
          updated_at?: string
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_method_month_stats_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          bank_name: string | null
          card_number_full: string | null
          card_number_last4: string | null
          created_at: string
          holder_name: string | null
          id: string
          ip_name: string | null
          is_active: boolean
          kind: string
          label: string
          monthly_limit: number | null
          qr_storage_path: string | null
          sbp_phone: string | null
          sort_order: number
          tier: number
          updated_at: string
        }
        Insert: {
          bank_name?: string | null
          card_number_full?: string | null
          card_number_last4?: string | null
          created_at?: string
          holder_name?: string | null
          id?: string
          ip_name?: string | null
          is_active?: boolean
          kind: string
          label: string
          monthly_limit?: number | null
          qr_storage_path?: string | null
          sbp_phone?: string | null
          sort_order?: number
          tier?: number
          updated_at?: string
        }
        Update: {
          bank_name?: string | null
          card_number_full?: string | null
          card_number_last4?: string | null
          created_at?: string
          holder_name?: string | null
          id?: string
          ip_name?: string | null
          is_active?: boolean
          kind?: string
          label?: string
          monthly_limit?: number | null
          qr_storage_path?: string | null
          sbp_phone?: string | null
          sort_order?: number
          tier?: number
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          completed_at: string | null
          created_at: string | null
          external_payment_id: string | null
          id: string
          metadata: Json | null
          order_ids: string[] | null
          payment_system: string
          payment_url: string | null
          refunded_at: string | null
          status: string | null
          subscription_tier: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          completed_at?: string | null
          created_at?: string | null
          external_payment_id?: string | null
          id?: string
          metadata?: Json | null
          order_ids?: string[] | null
          payment_system: string
          payment_url?: string | null
          refunded_at?: string | null
          status?: string | null
          subscription_tier?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          completed_at?: string | null
          created_at?: string | null
          external_payment_id?: string | null
          id?: string
          metadata?: Json | null
          order_ids?: string[] | null
          payment_system?: string
          payment_url?: string | null
          refunded_at?: string | null
          status?: string | null
          subscription_tier?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_orders: {
        Row: {
          applied_balance: number
          client_price: number
          created_at: string
          customer_id: string
          delivery_service: string
          dispatch_city: string | null
          expires_at: string | null
          id: string
          is_vibe_debt: boolean
          order_number: number
          partner_id: string | null
          partner_payment_received_at: string | null
          payment_method_id: string | null
          product_id: string
          product_size_id: string
          receipt_attempts: number
          receipt_file_id: string | null
          receipt_received_at: string | null
          receipt_storage_path: string | null
          send_by: string
          source_binding_id: string | null
          source_kind: string | null
          source_partner_id: string | null
          source_warehouse: string | null
          tracking_number: string
          updated_at: string
          vision_amount: number | null
          vision_datetime: string | null
          vision_is_proper_receipt: boolean | null
          vision_operation_id: string | null
          vision_raw_text: string | null
          vision_recipient_bank: string | null
          vision_recipient_card_last4: string | null
          vision_recipient_ip_name: string | null
          vision_recipient_name: string | null
          vision_recipient_phone: string | null
        }
        Insert: {
          applied_balance?: number
          client_price: number
          created_at?: string
          customer_id: string
          delivery_service: string
          dispatch_city?: string | null
          expires_at?: string | null
          id?: string
          is_vibe_debt?: boolean
          order_number?: number
          partner_id?: string | null
          partner_payment_received_at?: string | null
          payment_method_id?: string | null
          product_id: string
          product_size_id: string
          receipt_attempts?: number
          receipt_file_id?: string | null
          receipt_received_at?: string | null
          receipt_storage_path?: string | null
          send_by: string
          source_binding_id?: string | null
          source_kind?: string | null
          source_partner_id?: string | null
          source_warehouse?: string | null
          tracking_number: string
          updated_at?: string
          vision_amount?: number | null
          vision_datetime?: string | null
          vision_is_proper_receipt?: boolean | null
          vision_operation_id?: string | null
          vision_raw_text?: string | null
          vision_recipient_bank?: string | null
          vision_recipient_card_last4?: string | null
          vision_recipient_ip_name?: string | null
          vision_recipient_name?: string | null
          vision_recipient_phone?: string | null
        }
        Update: {
          applied_balance?: number
          client_price?: number
          created_at?: string
          customer_id?: string
          delivery_service?: string
          dispatch_city?: string | null
          expires_at?: string | null
          id?: string
          is_vibe_debt?: boolean
          order_number?: number
          partner_id?: string | null
          partner_payment_received_at?: string | null
          payment_method_id?: string | null
          product_id?: string
          product_size_id?: string
          receipt_attempts?: number
          receipt_file_id?: string | null
          receipt_received_at?: string | null
          receipt_storage_path?: string | null
          send_by?: string
          source_binding_id?: string | null
          source_kind?: string | null
          source_partner_id?: string | null
          source_warehouse?: string | null
          tracking_number?: string
          updated_at?: string
          vision_amount?: number | null
          vision_datetime?: string | null
          vision_is_proper_receipt?: boolean | null
          vision_operation_id?: string | null
          vision_raw_text?: string | null
          vision_recipient_bank?: string | null
          vision_recipient_card_last4?: string | null
          vision_recipient_ip_name?: string | null
          vision_recipient_name?: string | null
          vision_recipient_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance_integrity_view"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "pending_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_risk_profile"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "pending_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_vibe_debt"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "pending_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_orders_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_commission_debt"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "pending_orders_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_orders_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_orders_product_size_id_fkey"
            columns: ["product_size_id"]
            isOneToOne: false
            referencedRelation: "product_sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_orders_source_binding_id_fkey"
            columns: ["source_binding_id"]
            isOneToOne: false
            referencedRelation: "product_partner_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_orders_source_partner_id_fkey"
            columns: ["source_partner_id"]
            isOneToOne: false
            referencedRelation: "partner_commission_debt"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "pending_orders_source_partner_id_fkey"
            columns: ["source_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_points: {
        Row: {
          address: string
          city: string | null
          created_at: string | null
          delivery_service: string
          id: string
          is_active: boolean | null
        }
        Insert: {
          address: string
          city?: string | null
          created_at?: string | null
          delivery_service: string
          id?: string
          is_active?: boolean | null
        }
        Update: {
          address?: string
          city?: string | null
          created_at?: string | null
          delivery_service?: string
          id?: string
          is_active?: boolean | null
        }
        Relationships: []
      }
      product_batches: {
        Row: {
          batch_number: number
          created_at: string
          id: string
          product_id: string
          purchase_price: number
          sizes: Json
        }
        Insert: {
          batch_number: number
          created_at?: string
          id?: string
          product_id: string
          purchase_price?: number
          sizes?: Json
        }
        Update: {
          batch_number?: number
          created_at?: string
          id?: string
          product_id?: string
          purchase_price?: number
          sizes?: Json
        }
        Relationships: [
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_notifications: {
        Row: {
          created_at: string | null
          id: string
          notified: boolean | null
          notified_at: string | null
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          notified?: boolean | null
          notified_at?: string | null
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          notified?: boolean | null
          notified_at?: string | null
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_notifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      product_partner_bindings: {
        Row: {
          commission: number
          created_at: string
          deleted_at: string | null
          id: string
          partner_id: string
          priority: number
          product_id: string
          updated_at: string
          warehouse_kind: string
        }
        Insert: {
          commission?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          partner_id: string
          priority: number
          product_id: string
          updated_at?: string
          warehouse_kind: string
        }
        Update: {
          commission?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          partner_id?: string
          priority?: number
          product_id?: string
          updated_at?: string
          warehouse_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_partner_bindings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_commission_debt"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "product_partner_bindings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_partner_bindings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_partner_size_stock: {
        Row: {
          binding_id: string
          created_at: string
          current_quantity: number
          id: string
          reserved_quantity: number
          size: string
          updated_at: string
        }
        Insert: {
          binding_id: string
          created_at?: string
          current_quantity?: number
          id?: string
          reserved_quantity?: number
          size: string
          updated_at?: string
        }
        Update: {
          binding_id?: string
          created_at?: string
          current_quantity?: number
          id?: string
          reserved_quantity?: number
          size?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_partner_size_stock_binding_id_fkey"
            columns: ["binding_id"]
            isOneToOne: false
            referencedRelation: "product_partner_bindings"
            referencedColumns: ["id"]
          },
        ]
      }
      product_sizes: {
        Row: {
          actual_quantity: number | null
          current_quantity: number
          id: string
          initial_quantity: number
          measurements: Json | null
          product_id: string | null
          reserved_quantity: number | null
          size: string
        }
        Insert: {
          actual_quantity?: number | null
          current_quantity: number
          id?: string
          initial_quantity: number
          measurements?: Json | null
          product_id?: string | null
          reserved_quantity?: number | null
          size: string
        }
        Update: {
          actual_quantity?: number | null
          current_quantity?: number
          id?: string
          initial_quantity?: number
          measurements?: Json | null
          product_id?: string | null
          reserved_quantity?: number | null
          size?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_sizes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          actual_quantity: number | null
          auto_covers_enabled: boolean
          category: string | null
          city: string
          cover_tg_chat_id: number | null
          created_at: string | null
          current_quantity: number | null
          deleted_at: string | null
          description: string | null
          drop_price: number
          expected_arrival_date: string | null
          id: string
          is_active: boolean | null
          is_in_stock: boolean | null
          is_premium: boolean | null
          location_city: string
          name: string
          photo_main_index: number | null
          photo_urls: string[] | null
          purchase_date: string | null
          purchase_price: number
          purchase_quantity: number | null
          recommended_price: number | null
          reserved_quantity: number | null
          supplier_id: string | null
          updated_at: string | null
        }
        Insert: {
          actual_quantity?: number | null
          auto_covers_enabled?: boolean
          category?: string | null
          city?: string
          cover_tg_chat_id?: number | null
          created_at?: string | null
          current_quantity?: number | null
          deleted_at?: string | null
          description?: string | null
          drop_price: number
          expected_arrival_date?: string | null
          id?: string
          is_active?: boolean | null
          is_in_stock?: boolean | null
          is_premium?: boolean | null
          location_city: string
          name: string
          photo_main_index?: number | null
          photo_urls?: string[] | null
          purchase_date?: string | null
          purchase_price: number
          purchase_quantity?: number | null
          recommended_price?: number | null
          reserved_quantity?: number | null
          supplier_id?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_quantity?: number | null
          auto_covers_enabled?: boolean
          category?: string | null
          city?: string
          cover_tg_chat_id?: number | null
          created_at?: string | null
          current_quantity?: number | null
          deleted_at?: string | null
          description?: string | null
          drop_price?: number
          expected_arrival_date?: string | null
          id?: string
          is_active?: boolean | null
          is_in_stock?: boolean | null
          is_premium?: boolean | null
          location_city?: string
          name?: string
          photo_main_index?: number | null
          photo_urls?: string[] | null
          purchase_date?: string | null
          purchase_price?: number
          purchase_quantity?: number | null
          recommended_price?: number | null
          reserved_quantity?: number | null
          supplier_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      return_pickup_attempts: {
        Row: {
          attempt_date: string
          attempted_at: string
          attempted_by: string | null
          id: string
          note: string | null
          order_id: string
          result: string | null
          trumpet_session_id: string | null
        }
        Insert: {
          attempt_date?: string
          attempted_at?: string
          attempted_by?: string | null
          id?: string
          note?: string | null
          order_id: string
          result?: string | null
          trumpet_session_id?: string | null
        }
        Update: {
          attempt_date?: string
          attempted_at?: string
          attempted_by?: string | null
          id?: string
          note?: string | null
          order_id?: string
          result?: string | null
          trumpet_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "return_pickup_attempts_attempted_by_fkey"
            columns: ["attempted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_pickup_attempts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_pickup_attempts_trumpet_session_id_fkey"
            columns: ["trumpet_session_id"]
            isOneToOne: false
            referencedRelation: "trumpet_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      security_snapshots: {
        Row: {
          blocked_users: number
          cancel_rate: number
          created_at: string | null
          health_score: number
          id: string
          return_rate: number
          snapshot_date: string
          total_clients: number
          unresolved_alerts: number
        }
        Insert: {
          blocked_users?: number
          cancel_rate?: number
          created_at?: string | null
          health_score: number
          id?: string
          return_rate?: number
          snapshot_date: string
          total_clients?: number
          unresolved_alerts?: number
        }
        Update: {
          blocked_users?: number
          cancel_rate?: number
          created_at?: string | null
          health_score?: number
          id?: string
          return_rate?: number
          snapshot_date?: string
          total_clients?: number
          unresolved_alerts?: number
        }
        Relationships: []
      }
      settings: {
        Row: {
          daily_goal: number | null
          daily_goal_bonus: number | null
          default_location_city: string | null
          first_order_discount: number | null
          id: string
          min_work_days: number | null
          monthly_profit_target: number | null
          owner_telegram_username: string | null
          payout_cadence: string
          payout_reserve_days: number
          payout_weekday: number
          pendulum_avg_window_days: number | null
          pendulum_rate_base: number | null
          pendulum_rate_max: number | null
          pendulum_rate_min: number | null
          pendulum_speed_target_hours: number | null
          reservation_timeout_minutes: number | null
          return_to_trash_days: number | null
          shipper_fixed_rate: number | null
          shipper_payment_mode: string | null
          shipper_penalty_rate: number | null
          shipper_rate: number | null
          stats_window_days: number | null
          streak_keep_threshold: number | null
          streak_multiplier_3: number | null
          streak_multiplier_7: number | null
          support_telegram_username: string | null
          trash_to_disposed_days: number | null
          updated_at: string | null
        }
        Insert: {
          daily_goal?: number | null
          daily_goal_bonus?: number | null
          default_location_city?: string | null
          first_order_discount?: number | null
          id?: string
          min_work_days?: number | null
          monthly_profit_target?: number | null
          owner_telegram_username?: string | null
          payout_cadence?: string
          payout_reserve_days?: number
          payout_weekday?: number
          pendulum_avg_window_days?: number | null
          pendulum_rate_base?: number | null
          pendulum_rate_max?: number | null
          pendulum_rate_min?: number | null
          pendulum_speed_target_hours?: number | null
          reservation_timeout_minutes?: number | null
          return_to_trash_days?: number | null
          shipper_fixed_rate?: number | null
          shipper_payment_mode?: string | null
          shipper_penalty_rate?: number | null
          shipper_rate?: number | null
          stats_window_days?: number | null
          streak_keep_threshold?: number | null
          streak_multiplier_3?: number | null
          streak_multiplier_7?: number | null
          support_telegram_username?: string | null
          trash_to_disposed_days?: number | null
          updated_at?: string | null
        }
        Update: {
          daily_goal?: number | null
          daily_goal_bonus?: number | null
          default_location_city?: string | null
          first_order_discount?: number | null
          id?: string
          min_work_days?: number | null
          monthly_profit_target?: number | null
          owner_telegram_username?: string | null
          payout_cadence?: string
          payout_reserve_days?: number
          payout_weekday?: number
          pendulum_avg_window_days?: number | null
          pendulum_rate_base?: number | null
          pendulum_rate_max?: number | null
          pendulum_rate_min?: number | null
          pendulum_speed_target_hours?: number | null
          reservation_timeout_minutes?: number | null
          return_to_trash_days?: number | null
          shipper_fixed_rate?: number | null
          shipper_payment_mode?: string | null
          shipper_penalty_rate?: number | null
          shipper_rate?: number | null
          stats_window_days?: number | null
          streak_keep_threshold?: number | null
          streak_multiplier_3?: number | null
          streak_multiplier_7?: number | null
          support_telegram_username?: string | null
          trash_to_disposed_days?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      shipper_payouts: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          note: string | null
          shipper_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          note?: string | null
          shipper_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          note?: string | null
          shipper_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipper_payouts_shipper_id_fkey"
            columns: ["shipper_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      shipper_rate_tiers: {
        Row: {
          created_at: string | null
          id: string
          min_orders: number
          rate: number
          sort_order: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          min_orders: number
          rate: number
          sort_order?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          min_orders?: number
          rate?: number
          sort_order?: number
        }
        Relationships: []
      }
      shipper_stats: {
        Row: {
          daily_bonus: number | null
          daily_goal_met: boolean | null
          date: string
          earnings: number | null
          id: string
          orders_available: number | null
          orders_shipped: number | null
          orders_taken: number
          rate_applied: number | null
          returns_collected: number | null
          shipper_id: string
          streak_kept: boolean | null
        }
        Insert: {
          daily_bonus?: number | null
          daily_goal_met?: boolean | null
          date: string
          earnings?: number | null
          id?: string
          orders_available?: number | null
          orders_shipped?: number | null
          orders_taken?: number
          rate_applied?: number | null
          returns_collected?: number | null
          shipper_id: string
          streak_kept?: boolean | null
        }
        Update: {
          daily_bonus?: number | null
          daily_goal_met?: boolean | null
          date?: string
          earnings?: number | null
          id?: string
          orders_available?: number | null
          orders_shipped?: number | null
          orders_taken?: number
          rate_applied?: number | null
          returns_collected?: number | null
          shipper_id?: string
          streak_kept?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "shipper_stats_shipper_id_fkey"
            columns: ["shipper_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      size_reservations: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          product_id: string | null
          product_size_id: string | null
          session_id: string
          size_text: string | null
          source_binding_id: string | null
          source_kind: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          product_id?: string | null
          product_size_id?: string | null
          session_id: string
          size_text?: string | null
          source_binding_id?: string | null
          source_kind?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          product_id?: string | null
          product_size_id?: string | null
          session_id?: string
          size_text?: string | null
          source_binding_id?: string | null
          source_kind?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "size_reservations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "size_reservations_product_size_id_fkey"
            columns: ["product_size_id"]
            isOneToOne: false
            referencedRelation: "product_sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "size_reservations_source_binding_id_fkey"
            columns: ["source_binding_id"]
            isOneToOne: false
            referencedRelation: "product_partner_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "size_reservations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_reconciliations: {
        Row: {
          counted: number
          created_at: string
          delta: number
          id: string
          product_id: string
          product_size_id: string | null
          purchase_price_snapshot: number
          reconciled_by: string | null
          size: string | null
          system_before: number
        }
        Insert: {
          counted: number
          created_at?: string
          delta: number
          id?: string
          product_id: string
          product_size_id?: string | null
          purchase_price_snapshot?: number
          reconciled_by?: string | null
          size?: string | null
          system_before: number
        }
        Update: {
          counted?: number
          created_at?: string
          delta?: number
          id?: string
          product_id?: string
          product_size_id?: string | null
          purchase_price_snapshot?: number
          reconciled_by?: string | null
          size?: string | null
          system_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_reconciliations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reconciliations_product_size_id_fkey"
            columns: ["product_size_id"]
            isOneToOne: false
            referencedRelation: "product_sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reconciliations_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          telegram_id: number | null
          telegram_username: string | null
          total_items: number | null
          total_purchases: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          telegram_id?: number | null
          telegram_username?: string | null
          total_items?: number | null
          total_purchases?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          telegram_id?: number | null
          telegram_username?: string | null
          total_items?: number | null
          total_purchases?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      trumpet_sessions: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          id: string
          partner_id: string | null
          triggered_at: string
          triggered_by: string | null
          trumpet_date: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          id?: string
          partner_id?: string | null
          triggered_at?: string
          triggered_by?: string | null
          trumpet_date?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          id?: string
          partner_id?: string | null
          triggered_at?: string
          triggered_by?: string | null
          trumpet_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "trumpet_sessions_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trumpet_sessions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_commission_debt"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "trumpet_sessions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trumpet_sessions_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_fingerprints: {
        Row: {
          created_at: string | null
          fingerprint_hash: string
          id: string
          ip_address: unknown
          last_seen_at: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          fingerprint_hash: string
          id?: string
          ip_address?: unknown
          last_seen_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          fingerprint_hash?: string
          id?: string
          ip_address?: unknown
          last_seen_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_fingerprints_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          avito_account_limit: number
          avito_client_id: string | null
          avito_client_secret: string | null
          avito_profile_id: string | null
          avito_user_id: number | null
          blocked_reason: string | null
          created_at: string | null
          email: string | null
          id: string
          is_blocked: boolean | null
          name: string | null
          password_hash: string | null
          payout_account: string | null
          payout_bik: string | null
          payout_inn: string | null
          payout_ogrn: string | null
          phone: string | null
          role: string
          session_epoch: number
          shipper_login: string | null
          shipper_password_hash: string | null
          shipper_score: number | null
          site_key: string | null
          telegram_id: number
          telegram_username: string | null
          updated_at: string | null
          vibe_plus_granted_at: string | null
          vibe_plus_granted_by: string | null
          work_days: number[] | null
          work_hour_end: number | null
          work_hour_start: number | null
        }
        Insert: {
          avatar_url?: string | null
          avito_account_limit?: number
          avito_client_id?: string | null
          avito_client_secret?: string | null
          avito_profile_id?: string | null
          avito_user_id?: number | null
          blocked_reason?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_blocked?: boolean | null
          name?: string | null
          password_hash?: string | null
          payout_account?: string | null
          payout_bik?: string | null
          payout_inn?: string | null
          payout_ogrn?: string | null
          phone?: string | null
          role: string
          session_epoch?: number
          shipper_login?: string | null
          shipper_password_hash?: string | null
          shipper_score?: number | null
          site_key?: string | null
          telegram_id: number
          telegram_username?: string | null
          updated_at?: string | null
          vibe_plus_granted_at?: string | null
          vibe_plus_granted_by?: string | null
          work_days?: number[] | null
          work_hour_end?: number | null
          work_hour_start?: number | null
        }
        Update: {
          avatar_url?: string | null
          avito_account_limit?: number
          avito_client_id?: string | null
          avito_client_secret?: string | null
          avito_profile_id?: string | null
          avito_user_id?: number | null
          blocked_reason?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_blocked?: boolean | null
          name?: string | null
          password_hash?: string | null
          payout_account?: string | null
          payout_bik?: string | null
          payout_inn?: string | null
          payout_ogrn?: string | null
          phone?: string | null
          role?: string
          session_epoch?: number
          shipper_login?: string | null
          shipper_password_hash?: string | null
          shipper_score?: number | null
          site_key?: string | null
          telegram_id?: number
          telegram_username?: string | null
          updated_at?: string | null
          vibe_plus_granted_at?: string | null
          vibe_plus_granted_by?: string | null
          work_days?: number[] | null
          work_hour_end?: number | null
          work_hour_start?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "users_vibe_plus_granted_by_fkey"
            columns: ["vibe_plus_granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      vibe_payment_orders: {
        Row: {
          order_id: string
          vibe_payment_id: string
        }
        Insert: {
          order_id: string
          vibe_payment_id: string
        }
        Update: {
          order_id?: string
          vibe_payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vibe_payment_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vibe_payment_orders_vibe_payment_id_fkey"
            columns: ["vibe_payment_id"]
            isOneToOne: false
            referencedRelation: "vibe_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      vibe_payments: {
        Row: {
          amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          customer_id: string
          id: string
          operation_id: string | null
          payment_method_id: string | null
          receipt_file_url: string | null
          receipt_raw_response: Json | null
          receipt_recognized_text: string | null
          received_at: string
          rejected_at: string | null
        }
        Insert: {
          amount: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          customer_id: string
          id?: string
          operation_id?: string | null
          payment_method_id?: string | null
          receipt_file_url?: string | null
          receipt_raw_response?: Json | null
          receipt_recognized_text?: string | null
          received_at?: string
          rejected_at?: string | null
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          operation_id?: string | null
          payment_method_id?: string | null
          receipt_file_url?: string | null
          receipt_raw_response?: Json | null
          receipt_recognized_text?: string | null
          received_at?: string
          rejected_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vibe_payments_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vibe_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance_integrity_view"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "vibe_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_risk_profile"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "vibe_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_vibe_debt"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "vibe_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vibe_payments_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawal_requests: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          id: string
          note: string | null
          processed_at: string | null
          processed_by: string | null
          status: string
          withdrawal_number: number
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id: string
          id?: string
          note?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          withdrawal_number?: number
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          id?: string
          note?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          withdrawal_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance_integrity_view"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "withdrawal_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_risk_profile"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "withdrawal_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_vibe_debt"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "withdrawal_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawal_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      customer_balance_integrity_view: {
        Row: {
          current_balance: number | null
          customer_id: string | null
          drift: number | null
          history_sum: number | null
        }
        Relationships: []
      }
      customer_risk_profile: {
        Row: {
          cancel_count: number | null
          cancel_rate_pct: number | null
          current_debt: number | null
          customer_id: string | null
          is_blocked: boolean | null
          is_frozen: boolean | null
          last_order_at: string | null
          name: string | null
          open_alerts_count: number | null
          return_count: number | null
          return_rate_pct: number | null
          telegram_username: string | null
          total_orders: number | null
          vibe_limit: number | null
        }
        Relationships: []
      }
      customer_vibe_debt: {
        Row: {
          customer_id: string | null
          debt: number | null
        }
        Relationships: []
      }
      partner_commission_debt: {
        Row: {
          debt: number | null
          partner_id: string | null
          partner_name: string | null
          unpaid_orders_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _recompute_product_from_batches: {
        Args: { p_product_id: string }
        Returns: undefined
      }
      add_product_batch: {
        Args: { p_price: number; p_product_id: string; p_sizes: Json }
        Returns: Json
      }
      adjust_actual_quantity: {
        Args: { delta: number; target_size_id: string }
        Returns: undefined
      }
      adjust_product_actual_quantity: {
        Args: { delta: number; target_product_id: string }
        Returns: undefined
      }
      append_status_history: {
        Args: {
          p_actor_id?: string
          p_actor_role?: string
          p_order_id: string
          p_reason?: string
          p_status: string
        }
        Returns: undefined
      }
      apply_manual_balance_adjustment: {
        Args: {
          p_actor_user_id: string
          p_customer_id: string
          p_delta: number
          p_note: string
        }
        Returns: number
      }
      apply_overpayment_atomic: {
        Args: { p_amount: number; p_customer_id: string; p_order_id?: string }
        Returns: {
          credit_to_balance: number
          debt_paid: number
          new_balance: number
        }[]
      }
      approve_withdrawal_request: {
        Args: { p_processed_by: string; p_request_id: string }
        Returns: {
          out_amount: number
          out_balance_after: number
          out_customer_id: string
          out_number: number
        }[]
      }
      avito_confirm_size_and_reserve: {
        Args: { p_order_id: string; p_product_size_id: string; p_size: string }
        Returns: Json
      }
      cancel_pending_order_atomic: {
        Args: {
          p_credit_full_to_balance?: boolean
          p_partner_debt_reason?: string
          p_pending_order_id: string
          p_record_partner_debt?: boolean
          p_zero_out_source?: boolean
        }
        Returns: boolean
      }
      cancel_withdrawal_atomic: {
        Args: { p_customer_id: string; p_request_id: string }
        Returns: {
          out_amount: number
          out_balance_after: number
          out_number: number
        }[]
      }
      claim_ai_gen_slot: {
        Args: {
          p_cap: number
          p_category: string
          p_date: string
          p_product_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      claim_avito_proxy: { Args: { p_user_id: string }; Returns: string }
      confirm_pending_order_atomic: {
        Args: {
          p_confirmed_by?: string
          p_payment_method?: string
          p_pending_order_id: string
        }
        Returns: string
      }
      correct_product_size_quantity: {
        Args: { p_product_id: string; p_qty: number; p_size_id: string }
        Returns: undefined
      }
      create_first_batch: {
        Args: { p_price: number; p_product_id: string }
        Returns: undefined
      }
      create_pending_order_atomic: {
        Args: {
          p_client_price: number
          p_customer_id: string
          p_delivery_service: string
          p_is_vibe_debt?: boolean
          p_product_id: string
          p_product_size_id: string
          p_send_by: string
          p_size?: string
          p_source_binding_id?: string
          p_source_kind: string
          p_tracking_number: string
          p_ttl_minutes?: number
        }
        Returns: {
          applied_balance: number
          fully_paid_by_balance: boolean
          pending_id: string
        }[]
      }
      create_product_with_sizes: {
        Args: { p_product: Json; p_sizes?: Json }
        Returns: string
      }
      credit_customer_for_order: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_order_id: string
          p_reason: string
        }
        Returns: number
      }
      decrement_reserved_quantity:
        | { Args: { size_id: string }; Returns: undefined }
        | { Args: { amount?: number; size_id: string }; Returns: undefined }
      decrement_reserved_quantity_safe: {
        Args: { target_product_id?: string; target_size_id?: string }
        Returns: undefined
      }
      delete_product_batch: { Args: { p_batch_id: string }; Returns: undefined }
      detect_frequent_cancellation: { Args: never; Returns: number }
      detect_high_debt: { Args: never; Returns: number }
      detect_high_return_rate: { Args: never; Returns: number }
      detect_rapid_orders: { Args: never; Returns: number }
      edit_product_batch: {
        Args: { p_batch_id: string; p_price: number; p_sizes: Json }
        Returns: undefined
      }
      get_customer_debt_by_recipient: {
        Args: { p_customer_id: string }
        Returns: {
          debt: number
          partner_id: string
          partner_name: string
          recipient_type: string
        }[]
      }
      get_order_receipts: {
        Args: { p_order_id: string }
        Returns: {
          received_at: string
          source: string
          storage_path: string
          vibe_payment_id: string
        }[]
      }
      get_stock_mismatch_context: {
        Args: { p_product_size_id: string }
        Returns: Json
      }
      get_user_role: { Args: never; Returns: string }
      increment_product_size_quantity: {
        Args: { amount?: number; size_id: string }
        Returns: undefined
      }
      increment_reserved_quantity: {
        Args: { target_product_id?: string; target_size_id?: string }
        Returns: undefined
      }
      increment_shipper_orders_taken: {
        Args: { p_date: string; p_shipper_id: string }
        Returns: undefined
      }
      increment_shipper_stat: {
        Args: {
          p_date: string
          p_delta: number
          p_field: string
          p_shipper_id: string
        }
        Returns: undefined
      }
      increment_user_session_epoch: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      is_shipper: { Args: never; Returns: boolean }
      manual_credit_customer: {
        Args: {
          p_actor_user_id: string
          p_amount: number
          p_customer_id: string
          p_note?: string
          p_order_id?: string
        }
        Returns: number
      }
      move_order_to_trash: {
        Args: { order_id: string }
        Returns: {
          error_message: string
          penalty_applied: number
          success: boolean
        }[]
      }
      next_payment_method: {
        Args: { p_amount: number }
        Returns: {
          bank_name: string | null
          card_number_full: string | null
          card_number_last4: string | null
          created_at: string
          holder_name: string | null
          id: string
          ip_name: string | null
          is_active: boolean
          kind: string
          label: string
          monthly_limit: number | null
          qr_storage_path: string | null
          sbp_phone: string | null
          sort_order: number
          tier: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "payment_methods"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      recompute_product_in_stock: {
        Args: { p_product_id: string }
        Returns: undefined
      }
      reconcile_product_stock: {
        Args: {
          p_by?: string
          p_no_size_count?: number
          p_product_id: string
          p_sizes?: Json
        }
        Returns: Json
      }
      reject_withdrawal_atomic: {
        Args: { p_processed_by: string; p_request_id: string }
        Returns: {
          out_amount: number
          out_balance_after: number
          out_customer_id: string
          out_number: number
        }[]
      }
      release_avito_proxy: { Args: { p_user_id: string }; Returns: undefined }
      release_size_reservation_atomic: {
        Args: { p_product_size_id: string; p_session_id: string }
        Returns: boolean
      }
      reorder_product_bindings: {
        Args: { p_ordered_binding_ids: string[]; p_product_id: string }
        Returns: undefined
      }
      replace_product_sizes: {
        Args: { p_product_id: string; p_sizes: Json }
        Returns: number
      }
      request_withdrawal_atomic: {
        Args: { p_customer_id: string }
        Returns: {
          out_amount: number
          out_balance_after: number
          out_number: number
          out_request_id: string
        }[]
      }
      reserve_size_atomic: {
        Args: {
          p_product_size_id: string
          p_session_id: string
          p_size?: string
          p_source_binding_id?: string
          p_source_kind?: string
          p_ttl_minutes?: number
        }
        Returns: string
      }
      restock_product_size: {
        Args: { p_product_id: string; p_qty: number; p_size_id: string }
        Returns: undefined
      }
      run_fraud_detectors: { Args: never; Returns: number }
      select_size_source: {
        Args: { p_product_id: string; p_size: string }
        Returns: {
          available: number
          source_binding_id: string
          source_kind: string
          source_partner_id: string
          source_warehouse: string
        }[]
      }
      set_product_size_measurements: {
        Args: { p_data: Json; p_product_id: string }
        Returns: undefined
      }
      shipper_current_rate: { Args: { p_shipper_id: string }; Returns: number }
      update_shipper_scores: {
        Args: { p_date: string }
        Returns: {
          delta: number
          new_score: number
          old_score: number
          result: number
          shipper_id: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
