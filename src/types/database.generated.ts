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
      avito_browser_sessions: {
        Row: {
          account_index: number
          avito_client_id: string | null
          avito_client_secret: string | null
          avito_login: string | null
          avito_password_enc: string | null
          avito_user_id: number | null
          browser_fingerprint: Json | null
          cookies: Json
          created_at: string
          error_message: string | null
          id: string
          last_login_at: string | null
          last_sync_at: string | null
          proxy_url: string | null
          sms_code: string | null
          status: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          account_index?: number
          avito_client_id?: string | null
          avito_client_secret?: string | null
          avito_login?: string | null
          avito_password_enc?: string | null
          avito_user_id?: number | null
          browser_fingerprint?: Json | null
          cookies?: Json
          created_at?: string
          error_message?: string | null
          id?: string
          last_login_at?: string | null
          last_sync_at?: string | null
          proxy_url?: string | null
          sms_code?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          account_index?: number
          avito_client_id?: string | null
          avito_client_secret?: string | null
          avito_login?: string | null
          avito_password_enc?: string | null
          avito_user_id?: number | null
          browser_fingerprint?: Json | null
          cookies?: Json
          created_at?: string
          error_message?: string | null
          id?: string
          last_login_at?: string | null
          last_sync_at?: string | null
          proxy_url?: string | null
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
          message_type: string | null
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
          message_type?: string | null
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
          message_type?: string | null
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
          avito_order_id: string
          channel_id: string | null
          cost_total: number | null
          created_at_avito: string | null
          id: string
          item_img_url: string | null
          item_title: string | null
          provider: string | null
          provider_label: string | null
          required_action: boolean
          service_key: string | null
          session_id: string | null
          status: string | null
          status_label: string | null
          synced_at: string
          tracking_number: string | null
          updated_at_avito: string | null
          user_id: string
        }
        Insert: {
          avito_order_id: string
          channel_id?: string | null
          cost_total?: number | null
          created_at_avito?: string | null
          id?: string
          item_img_url?: string | null
          item_title?: string | null
          provider?: string | null
          provider_label?: string | null
          required_action?: boolean
          service_key?: string | null
          session_id?: string | null
          status?: string | null
          status_label?: string | null
          synced_at?: string
          tracking_number?: string | null
          updated_at_avito?: string | null
          user_id: string
        }
        Update: {
          avito_order_id?: string
          channel_id?: string | null
          cost_total?: number | null
          created_at_avito?: string | null
          id?: string
          item_img_url?: string | null
          item_title?: string | null
          provider?: string | null
          provider_label?: string | null
          required_action?: boolean
          service_key?: string | null
          session_id?: string | null
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
          details: Json | null
          id: string
          is_resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string | null
          user_id: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string | null
          details?: Json | null
          id?: string
          is_resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          user_id?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          is_resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fraud_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
      orders: {
        Row: {
          avito_buyer_name: string | null
          avito_delivery_address: string | null
          avito_order_id: string | null
          barcode_image_url: string | null
          barcode_printed: boolean | null
          barcode_printed_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          client_comment: string | null
          client_id: string
          client_price: number
          client_profit: number | null
          completed_at: string | null
          created_at: string | null
          delivery_deadline: string
          delivery_service: string
          disposed_at: string | null
          expected_return_date: string | null
          id: string
          idempotency_key: string | null
          is_paid: boolean | null
          linked_return_order_id: string | null
          order_number: number
          paid_at: string | null
          payment_id: string | null
          payment_method: string | null
          pickup_point_id: string | null
          problem_type: string | null
          product_id: string | null
          product_size_id: string | null
          purchase_price: number
          return_barcode_image_url: string | null
          return_code: string | null
          return_code_updated_at: string | null
          return_completed_at: string | null
          return_completed_by: string | null
          return_pickup_address: string | null
          return_tracking_number: string | null
          sale_price: number | null
          shipped_at: string | null
          shipped_by: string | null
          size: string | null
          source: string | null
          status: string | null
          status_history: Json | null
          system_comment: string | null
          tracking_number: string | null
          trash_at: string | null
          trash_deadline: string | null
          updated_at: string | null
        }
        Insert: {
          avito_buyer_name?: string | null
          avito_delivery_address?: string | null
          avito_order_id?: string | null
          barcode_image_url?: string | null
          barcode_printed?: boolean | null
          barcode_printed_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          client_comment?: string | null
          client_id: string
          client_price: number
          client_profit?: number | null
          completed_at?: string | null
          created_at?: string | null
          delivery_deadline: string
          delivery_service: string
          disposed_at?: string | null
          expected_return_date?: string | null
          id?: string
          idempotency_key?: string | null
          is_paid?: boolean | null
          linked_return_order_id?: string | null
          order_number?: number
          paid_at?: string | null
          payment_id?: string | null
          payment_method?: string | null
          pickup_point_id?: string | null
          problem_type?: string | null
          product_id?: string | null
          product_size_id?: string | null
          purchase_price: number
          return_barcode_image_url?: string | null
          return_code?: string | null
          return_code_updated_at?: string | null
          return_completed_at?: string | null
          return_completed_by?: string | null
          return_pickup_address?: string | null
          return_tracking_number?: string | null
          sale_price?: number | null
          shipped_at?: string | null
          shipped_by?: string | null
          size?: string | null
          source?: string | null
          status?: string | null
          status_history?: Json | null
          system_comment?: string | null
          tracking_number?: string | null
          trash_at?: string | null
          trash_deadline?: string | null
          updated_at?: string | null
        }
        Update: {
          avito_buyer_name?: string | null
          avito_delivery_address?: string | null
          avito_order_id?: string | null
          barcode_image_url?: string | null
          barcode_printed?: boolean | null
          barcode_printed_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          client_comment?: string | null
          client_id?: string
          client_price?: number
          client_profit?: number | null
          completed_at?: string | null
          created_at?: string | null
          delivery_deadline?: string
          delivery_service?: string
          disposed_at?: string | null
          expected_return_date?: string | null
          id?: string
          idempotency_key?: string | null
          is_paid?: boolean | null
          linked_return_order_id?: string | null
          order_number?: number
          paid_at?: string | null
          payment_id?: string | null
          payment_method?: string | null
          pickup_point_id?: string | null
          problem_type?: string | null
          product_id?: string | null
          product_size_id?: string | null
          purchase_price?: number
          return_barcode_image_url?: string | null
          return_code?: string | null
          return_code_updated_at?: string | null
          return_completed_at?: string | null
          return_completed_by?: string | null
          return_pickup_address?: string | null
          return_tracking_number?: string | null
          sale_price?: number | null
          shipped_at?: string | null
          shipped_by?: string | null
          size?: string | null
          source?: string | null
          status?: string | null
          status_history?: Json | null
          system_comment?: string | null
          tracking_number?: string | null
          trash_at?: string | null
          trash_deadline?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "users"
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
            foreignKeyName: "orders_pickup_point_id_fkey"
            columns: ["pickup_point_id"]
            isOneToOne: false
            referencedRelation: "pickup_points"
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
        ]
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
      product_sizes: {
        Row: {
          actual_quantity: number | null
          current_quantity: number
          id: string
          initial_quantity: number
          product_id: string | null
          reserved_quantity: number | null
          size: string
        }
        Insert: {
          actual_quantity?: number | null
          current_quantity: number
          id?: string
          initial_quantity: number
          product_id?: string | null
          reserved_quantity?: number | null
          size: string
        }
        Update: {
          actual_quantity?: number | null
          current_quantity?: number
          id?: string
          initial_quantity?: number
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
          brand: string | null
          category: string | null
          created_at: string | null
          created_by: string | null
          current_quantity: number | null
          description: string | null
          drop_price: number
          expected_arrival_date: string | null
          id: string
          is_active: boolean | null
          is_in_stock: boolean | null
          is_premium: boolean | null
          measurements: Json | null
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
          brand?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          current_quantity?: number | null
          description?: string | null
          drop_price: number
          expected_arrival_date?: string | null
          id?: string
          is_active?: boolean | null
          is_in_stock?: boolean | null
          is_premium?: boolean | null
          measurements?: Json | null
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
          brand?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          current_quantity?: number | null
          description?: string | null
          drop_price?: number
          expected_arrival_date?: string | null
          id?: string
          is_active?: boolean | null
          is_in_stock?: boolean | null
          is_premium?: boolean | null
          measurements?: Json | null
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
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_bonuses: {
        Row: {
          bonus_period_ends_at: string | null
          created_at: string | null
          first_order_bonus: number | null
          first_order_bonus_paid: boolean | null
          first_order_bonus_unlocked_at: string | null
          id: string
          is_active: boolean | null
          percent_bonus: number | null
          percent_bonus_cap: number | null
          referral_id: string
          referral_orders_count: number | null
          referral_orders_sum: number | null
          referrer_id: string
        }
        Insert: {
          bonus_period_ends_at?: string | null
          created_at?: string | null
          first_order_bonus?: number | null
          first_order_bonus_paid?: boolean | null
          first_order_bonus_unlocked_at?: string | null
          id?: string
          is_active?: boolean | null
          percent_bonus?: number | null
          percent_bonus_cap?: number | null
          referral_id: string
          referral_orders_count?: number | null
          referral_orders_sum?: number | null
          referrer_id: string
        }
        Update: {
          bonus_period_ends_at?: string | null
          created_at?: string | null
          first_order_bonus?: number | null
          first_order_bonus_paid?: boolean | null
          first_order_bonus_unlocked_at?: string | null
          id?: string
          is_active?: boolean | null
          percent_bonus?: number | null
          percent_bonus_cap?: number | null
          referral_id?: string
          referral_orders_count?: number | null
          referral_orders_sum?: number | null
          referrer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_bonuses_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_bonuses_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          daily_goal: number | null
          daily_goal_bonus: number | null
          first_order_discount: number | null
          id: string
          max_orders_per_day_level_0: number | null
          max_orders_per_day_level_1: number | null
          max_orders_per_day_level_2: number | null
          max_orders_per_day_level_3: number | null
          min_work_days: number | null
          owner_telegram_username: string | null
          pendulum_avg_window_days: number | null
          pendulum_rate_base: number | null
          pendulum_rate_max: number | null
          pendulum_rate_min: number | null
          pendulum_speed_target_hours: number | null
          referral_first_order_bonus: number | null
          referral_percent: number | null
          referral_percent_cap: number | null
          referral_period_days: number | null
          reservation_timeout_minutes: number | null
          return_to_trash_days: number | null
          shipper_fixed_rate: number | null
          shipper_payment_mode: string | null
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
          first_order_discount?: number | null
          id?: string
          max_orders_per_day_level_0?: number | null
          max_orders_per_day_level_1?: number | null
          max_orders_per_day_level_2?: number | null
          max_orders_per_day_level_3?: number | null
          min_work_days?: number | null
          owner_telegram_username?: string | null
          pendulum_avg_window_days?: number | null
          pendulum_rate_base?: number | null
          pendulum_rate_max?: number | null
          pendulum_rate_min?: number | null
          pendulum_speed_target_hours?: number | null
          referral_first_order_bonus?: number | null
          referral_percent?: number | null
          referral_percent_cap?: number | null
          referral_period_days?: number | null
          reservation_timeout_minutes?: number | null
          return_to_trash_days?: number | null
          shipper_fixed_rate?: number | null
          shipper_payment_mode?: string | null
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
          first_order_discount?: number | null
          id?: string
          max_orders_per_day_level_0?: number | null
          max_orders_per_day_level_1?: number | null
          max_orders_per_day_level_2?: number | null
          max_orders_per_day_level_3?: number | null
          min_work_days?: number | null
          owner_telegram_username?: string | null
          pendulum_avg_window_days?: number | null
          pendulum_rate_base?: number | null
          pendulum_rate_max?: number | null
          pendulum_rate_min?: number | null
          pendulum_speed_target_hours?: number | null
          referral_first_order_bonus?: number | null
          referral_percent?: number | null
          referral_percent_cap?: number | null
          referral_period_days?: number | null
          reservation_timeout_minutes?: number | null
          return_to_trash_days?: number | null
          shipper_fixed_rate?: number | null
          shipper_payment_mode?: string | null
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
          orders_shipped: number | null
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
          orders_shipped?: number | null
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
          orders_shipped?: number | null
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
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          product_id?: string | null
          product_size_id?: string | null
          session_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          product_id?: string | null
          product_size_id?: string | null
          session_id?: string
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
            foreignKeyName: "size_reservations_user_id_fkey"
            columns: ["user_id"]
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
          deposit: number | null
          deposit_limit: number | null
          discount_percent: number | null
          email: string | null
          first_order_discount_used: boolean | null
          id: string
          is_blocked: boolean | null
          is_onboarding_completed: boolean | null
          is_vibe_plus: boolean | null
          level: number | null
          name: string | null
          notification_new_products: boolean | null
          notification_order_status: boolean | null
          notification_promotions: boolean | null
          password_hash: string | null
          phone: string | null
          referral_code: string | null
          referral_deposit: number | null
          referred_by: string | null
          role: string
          scheduled_subscription_tier: string | null
          shipper_login: string | null
          shipper_password_hash: string | null
          site_key: string | null
          subscription_end: string | null
          subscription_start: string | null
          subscription_tier: string | null
          telegram_id: number
          telegram_username: string | null
          total_completed_orders: number | null
          updated_at: string | null
          vibe_plus_granted_at: string | null
          vibe_plus_granted_by: string | null
          work_days: number[] | null
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
          deposit?: number | null
          deposit_limit?: number | null
          discount_percent?: number | null
          email?: string | null
          first_order_discount_used?: boolean | null
          id?: string
          is_blocked?: boolean | null
          is_onboarding_completed?: boolean | null
          is_vibe_plus?: boolean | null
          level?: number | null
          name?: string | null
          notification_new_products?: boolean | null
          notification_order_status?: boolean | null
          notification_promotions?: boolean | null
          password_hash?: string | null
          phone?: string | null
          referral_code?: string | null
          referral_deposit?: number | null
          referred_by?: string | null
          role: string
          scheduled_subscription_tier?: string | null
          shipper_login?: string | null
          shipper_password_hash?: string | null
          site_key?: string | null
          subscription_end?: string | null
          subscription_start?: string | null
          subscription_tier?: string | null
          telegram_id: number
          telegram_username?: string | null
          total_completed_orders?: number | null
          updated_at?: string | null
          vibe_plus_granted_at?: string | null
          vibe_plus_granted_by?: string | null
          work_days?: number[] | null
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
          deposit?: number | null
          deposit_limit?: number | null
          discount_percent?: number | null
          email?: string | null
          first_order_discount_used?: boolean | null
          id?: string
          is_blocked?: boolean | null
          is_onboarding_completed?: boolean | null
          is_vibe_plus?: boolean | null
          level?: number | null
          name?: string | null
          notification_new_products?: boolean | null
          notification_order_status?: boolean | null
          notification_promotions?: boolean | null
          password_hash?: string | null
          phone?: string | null
          referral_code?: string | null
          referral_deposit?: number | null
          referred_by?: string | null
          role?: string
          scheduled_subscription_tier?: string | null
          shipper_login?: string | null
          shipper_password_hash?: string | null
          site_key?: string | null
          subscription_end?: string | null
          subscription_start?: string | null
          subscription_tier?: string | null
          telegram_id?: number
          telegram_username?: string | null
          total_completed_orders?: number | null
          updated_at?: string | null
          vibe_plus_granted_at?: string | null
          vibe_plus_granted_by?: string | null
          work_days?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "users_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_vibe_plus_granted_by_fkey"
            columns: ["vibe_plus_granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_actual_quantity: {
        Args: { delta: number; target_size_id: string }
        Returns: undefined
      }
      adjust_product_actual_quantity: {
        Args: { delta: number; target_product_id: string }
        Returns: undefined
      }
      cancel_order_auto: {
        Args: { order_id: string; reason?: string }
        Returns: {
          error_message: string
          refunded_amount: number
          success: boolean
        }[]
      }
      claim_avito_proxy: { Args: { p_user_id: string }; Returns: string }
      decrement_reserved_quantity:
        | { Args: { size_id: string }; Returns: undefined }
        | { Args: { amount?: number; size_id: string }; Returns: undefined }
      decrement_reserved_quantity_safe: {
        Args: { target_product_id?: string; target_size_id?: string }
        Returns: undefined
      }
      decrement_user_deposit: {
        Args: { amount: number; user_id: string }
        Returns: undefined
      }
      get_user_role: { Args: never; Returns: string }
      increment_product_size_quantity: {
        Args: { amount?: number; size_id: string }
        Returns: undefined
      }
      increment_referral_deposit: {
        Args: { amount: number; user_id: string }
        Returns: undefined
      }
      increment_reserved_quantity: {
        Args: { target_product_id?: string; target_size_id?: string }
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
      increment_user_deposit: {
        Args: { amount: number; user_id: string }
        Returns: undefined
      }
      is_client: { Args: never; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      is_premium_client: { Args: never; Returns: boolean }
      is_shipper: { Args: never; Returns: boolean }
      move_order_to_trash: {
        Args: { order_id: string }
        Returns: {
          error_message: string
          penalty_applied: number
          success: boolean
        }[]
      }
      release_avito_proxy: { Args: { p_user_id: string }; Returns: undefined }
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
