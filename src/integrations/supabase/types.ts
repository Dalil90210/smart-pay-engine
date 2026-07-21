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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          type: Database["public"]["Enums"]["account_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          id?: string
          type: Database["public"]["Enums"]["account_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          type?: Database["public"]["Enums"]["account_type"]
          user_id?: string
        }
        Relationships: []
      }
      buyers: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_address: string | null
          full_name: string
          id: string
          latitude: number | null
          longitude: number | null
          phone_e164: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_address?: string | null
          full_name: string
          id: string
          latitude?: number | null
          longitude?: number | null
          phone_e164: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_address?: string | null
          full_name?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          phone_e164?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          created_at: string
          id: string
          message: Json
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: Json
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: Json
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      delivery_tracking: {
        Row: {
          distance_to_dest_m: number | null
          farmer_id: string
          id: string
          latitude: number
          longitude: number
          order_id: string
          recorded_at: string
        }
        Insert: {
          distance_to_dest_m?: number | null
          farmer_id: string
          id?: string
          latitude: number
          longitude: number
          order_id: string
          recorded_at?: string
        }
        Update: {
          distance_to_dest_m?: number | null
          farmer_id?: string
          id?: string
          latitude?: number
          longitude?: number
          order_id?: string
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_tracking_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "escrow_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      escrow_orders: {
        Row: {
          arrived_at: string | null
          buyer_id: string
          cancelled_at: string | null
          chat_id: string | null
          completed_at: string | null
          created_at: string
          currency: string
          delivery_fee_minor: number
          destination_label: string | null
          destination_lat: number | null
          destination_lng: number | null
          farmer_id: string
          feedback: string | null
          funded_at: string | null
          geofence_radius_m: number
          id: string
          in_transit_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          platform_fee_minor: number
          product_id: string
          product_subtotal_minor: number
          quantity: number
          rating: number | null
          status: Database["public"]["Enums"]["order_status"]
          total_minor: number
          unit_price_minor: number
          updated_at: string
        }
        Insert: {
          arrived_at?: string | null
          buyer_id: string
          cancelled_at?: string | null
          chat_id?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          delivery_fee_minor?: number
          destination_label?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          farmer_id: string
          feedback?: string | null
          funded_at?: string | null
          geofence_radius_m?: number
          id?: string
          in_transit_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          platform_fee_minor?: number
          product_id: string
          product_subtotal_minor: number
          quantity: number
          rating?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          total_minor: number
          unit_price_minor: number
          updated_at?: string
        }
        Update: {
          arrived_at?: string | null
          buyer_id?: string
          cancelled_at?: string | null
          chat_id?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          delivery_fee_minor?: number
          destination_label?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          farmer_id?: string
          feedback?: string | null
          funded_at?: string | null
          geofence_radius_m?: number
          id?: string
          in_transit_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          platform_fee_minor?: number
          product_id?: string
          product_subtotal_minor?: number
          quantity?: number
          rating?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          total_minor?: number
          unit_price_minor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escrow_orders_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "marketplace_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      farmers: {
        Row: {
          avatar_url: string | null
          created_at: string
          crops: string[]
          expected_supply: string | null
          farm_name: string
          full_name: string
          id: string
          latitude: number | null
          livestock: string[]
          location_label: string | null
          longitude: number | null
          onboarded_at: string | null
          phone_e164: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          crops?: string[]
          expected_supply?: string | null
          farm_name: string
          full_name: string
          id: string
          latitude?: number | null
          livestock?: string[]
          location_label?: string | null
          longitude?: number | null
          onboarded_at?: string | null
          phone_e164: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          crops?: string[]
          expected_supply?: string | null
          farm_name?: string
          full_name?: string
          id?: string
          latitude?: number | null
          livestock?: string[]
          location_label?: string | null
          longitude?: number | null
          onboarded_at?: string | null
          phone_e164?: string
          updated_at?: string
        }
        Relationships: []
      }
      hive_logs: {
        Row: {
          confirmed: boolean
          created_at: string
          error: string | null
          id: string
          parsed_intent: Json | null
          result: Json | null
          thread_id: string | null
          user_id: string
          user_message: string
        }
        Insert: {
          confirmed?: boolean
          created_at?: string
          error?: string | null
          id?: string
          parsed_intent?: Json | null
          result?: Json | null
          thread_id?: string | null
          user_id: string
          user_message: string
        }
        Update: {
          confirmed?: boolean
          created_at?: string
          error?: string | null
          id?: string
          parsed_intent?: Json | null
          result?: Json | null
          thread_id?: string | null
          user_id?: string
          user_message?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          position: number
          quantity: number
          unit_price_minor: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          position?: number
          quantity?: number
          unit_price_minor: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          position?: number
          quantity?: number
          unit_price_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_reminders: {
        Row: {
          body: string
          channel: string
          id: string
          invoice_id: string
          recipient_email: string
          sent_at: string
          subject: string
          user_id: string
        }
        Insert: {
          body: string
          channel?: string
          id?: string
          invoice_id: string
          recipient_email: string
          sent_at?: string
          subject: string
          user_id: string
        }
        Update: {
          body?: string
          channel?: string
          id?: string
          invoice_id?: string
          recipient_email?: string
          sent_at?: string
          subject?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_email: string | null
          client_name: string
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          due_date: string
          id: string
          notes: string | null
          number: string
          paid_at: string | null
          paid_transaction_id: string | null
          share_token: string
          status: string
          subtotal_minor: number
          tax_setaside_percent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          client_email?: string | null
          client_name: string
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          due_date: string
          id?: string
          notes?: string | null
          number: string
          paid_at?: string | null
          paid_transaction_id?: string | null
          share_token?: string
          status?: string
          subtotal_minor?: number
          tax_setaside_percent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          client_email?: string | null
          client_name?: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          due_date?: string
          id?: string
          notes?: string | null
          number?: string
          paid_at?: string | null
          paid_transaction_id?: string | null
          share_token?: string
          status?: string
          subtotal_minor?: number
          tax_setaside_percent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_paid_transaction_id_fkey"
            columns: ["paid_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          account_id: string
          amount_minor: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          direction: Database["public"]["Enums"]["entry_direction"]
          id: string
          transaction_id: string
        }
        Insert: {
          account_id: string
          amount_minor: number
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          direction: Database["public"]["Enums"]["entry_direction"]
          id?: string
          transaction_id: string
        }
        Update: {
          account_id?: string
          amount_minor?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          direction?: Database["public"]["Enums"]["entry_direction"]
          id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_chats: {
        Row: {
          buyer_id: string
          created_at: string
          farmer_id: string
          id: string
          last_message_at: string
          product_id: string
          updated_at: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          farmer_id: string
          id?: string
          last_message_at?: string
          product_id: string
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          farmer_id?: string
          id?: string
          last_message_at?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_chats_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_messages: {
        Row: {
          body: string | null
          chat_id: string
          created_at: string
          id: string
          offer_price_minor: number | null
          offer_quantity: number | null
          sender_id: string
        }
        Insert: {
          body?: string | null
          chat_id: string
          created_at?: string
          id?: string
          offer_price_minor?: number | null
          offer_quantity?: number | null
          sender_id: string
        }
        Update: {
          body?: string | null
          chat_id?: string
          created_at?: string
          id?: string
          offer_price_minor?: number | null
          offer_quantity?: number | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "marketplace_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      order_otps: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          expires_at: string
          id: string
          order_id: string
          sent_at: string
          sent_to_phone: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          expires_at: string
          id?: string
          order_id: string
          sent_at?: string
          sent_to_phone: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          expires_at?: string
          id?: string
          order_id?: string
          sent_at?: string
          sent_to_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_otps_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "escrow_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payees: {
        Row: {
          account_ref: string
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          name: string
          user_id: string
        }
        Insert: {
          account_ref: string
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          id?: string
          name: string
          user_id: string
        }
        Update: {
          account_ref?: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category: Database["public"]["Enums"]["product_category"]
          created_at: string
          currency: string
          description: string | null
          farmer_id: string
          id: string
          image_urls: string[]
          latitude: number | null
          longitude: number | null
          price_minor: number
          quantity_available: number
          status: Database["public"]["Enums"]["listing_status"]
          title: string
          unit: string
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["product_category"]
          created_at?: string
          currency?: string
          description?: string | null
          farmer_id: string
          id?: string
          image_urls?: string[]
          latitude?: number | null
          longitude?: number | null
          price_minor: number
          quantity_available?: number
          status?: Database["public"]["Enums"]["listing_status"]
          title: string
          unit?: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["product_category"]
          created_at?: string
          currency?: string
          description?: string | null
          farmer_id?: string
          id?: string
          image_urls?: string[]
          latitude?: number | null
          longitude?: number | null
          price_minor?: number
          quantity_available?: number
          status?: Database["public"]["Enums"]["listing_status"]
          title?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          home_currency: Database["public"]["Enums"]["currency_code"]
          id: string
          onboarded_at: string | null
          tax_setaside_percent: number
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          home_currency?: Database["public"]["Enums"]["currency_code"]
          id: string
          onboarded_at?: string | null
          tax_setaside_percent?: number
        }
        Update: {
          created_at?: string
          display_name?: string | null
          home_currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          onboarded_at?: string | null
          tax_setaside_percent?: number
        }
        Relationships: []
      }
      reversals: {
        Row: {
          ai_recommendation: string | null
          amount_minor: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          evidence: Json
          id: string
          priority_score: number
          reason_code: string
          status: Database["public"]["Enums"]["reversal_status"]
          success_probability: number
          timeline: Json
          transaction_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_recommendation?: string | null
          amount_minor: number
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          evidence?: Json
          id?: string
          priority_score?: number
          reason_code: string
          status?: Database["public"]["Enums"]["reversal_status"]
          success_probability?: number
          timeline?: Json
          transaction_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_recommendation?: string | null
          amount_minor?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          evidence?: Json
          id?: string
          priority_score?: number
          reason_code?: string
          status?: Database["public"]["Enums"]["reversal_status"]
          success_probability?: number
          timeline?: Json
          transaction_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reversals_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string
          metadata: Json
          state: Database["public"]["Enums"]["tx_state"]
          type: Database["public"]["Enums"]["tx_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key: string
          metadata?: Json
          state?: Database["public"]["Enums"]["tx_state"]
          type: Database["public"]["Enums"]["tx_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string
          metadata?: Json
          state?: Database["public"]["Enums"]["tx_state"]
          type?: Database["public"]["Enums"]["tx_type"]
          user_id?: string
        }
        Relationships: []
      }
      user_pins: {
        Row: {
          pin_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          pin_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          pin_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      account_balances: {
        Row: {
          account_id: string | null
          balance_minor: number | null
          currency: Database["public"]["Enums"]["currency_code"] | null
          type: Database["public"]["Enums"]["account_type"] | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_invoice: {
        Args: {
          p_client_email: string
          p_client_name: string
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_due_date: string
          p_items: Json
          p_notes?: string
          p_send?: boolean
          p_tax_setaside_percent?: number
        }
        Returns: string
      }
      get_invoice_by_token: { Args: { p_token: string }; Returns: Json }
      get_my_farmer_phone: { Args: never; Returns: string }
      get_order_otp_status: { Args: { p_order_id: string }; Returns: Json }
      has_pin: { Args: never; Returns: boolean }
      pay_invoice_by_token: {
        Args: { p_idempotency_key: string; p_token: string }
        Returns: Json
      }
      post_fx_conversion: {
        Args: {
          p_from_amount_minor: number
          p_from_currency: Database["public"]["Enums"]["currency_code"]
          p_idempotency_key: string
          p_pin?: string
          p_to_currency: Database["public"]["Enums"]["currency_code"]
        }
        Returns: Json
      }
      post_transaction: {
        Args: {
          p_entries: Json
          p_idempotency_key: string
          p_metadata: Json
          p_pin?: string
          p_type: Database["public"]["Enums"]["tx_type"]
        }
        Returns: string
      }
      provision_user_wallets: {
        Args: { p_display_name?: string; p_email?: string; p_user_id: string }
        Returns: undefined
      }
      send_invoice: { Args: { p_invoice_id: string }; Returns: undefined }
      send_invoice_reminder: { Args: { p_invoice_id: string }; Returns: Json }
      set_pin: { Args: { p_pin: string }; Returns: undefined }
      verify_pin: { Args: { p_pin: string }; Returns: boolean }
    }
    Enums: {
      account_type:
        | "checking"
        | "funding"
        | "fx_suspense"
        | "tax_setaside"
        | "fee_revenue"
      currency_code: "USD" | "EUR" | "GBP"
      entry_direction: "debit" | "credit"
      listing_status: "active" | "paused" | "sold" | "archived"
      marketplace_role: "farmer" | "buyer"
      order_status:
        | "negotiating"
        | "awaiting_payment"
        | "funded"
        | "in_transit"
        | "arrived"
        | "completed"
        | "cancelled"
        | "disputed"
      payment_method: "card" | "paypal" | "bank_transfer"
      product_category: "crop" | "livestock" | "dairy" | "poultry" | "other"
      reversal_status:
        | "submitted"
        | "under_review"
        | "approved"
        | "partially_approved"
        | "rejected"
      tx_state:
        | "initiated"
        | "confirmed"
        | "completed"
        | "failed"
        | "processing"
        | "reversed"
      tx_type: "deposit" | "withdrawal" | "transfer" | "fx" | "reversal"
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
  public: {
    Enums: {
      account_type: [
        "checking",
        "funding",
        "fx_suspense",
        "tax_setaside",
        "fee_revenue",
      ],
      currency_code: ["USD", "EUR", "GBP"],
      entry_direction: ["debit", "credit"],
      listing_status: ["active", "paused", "sold", "archived"],
      marketplace_role: ["farmer", "buyer"],
      order_status: [
        "negotiating",
        "awaiting_payment",
        "funded",
        "in_transit",
        "arrived",
        "completed",
        "cancelled",
        "disputed",
      ],
      payment_method: ["card", "paypal", "bank_transfer"],
      product_category: ["crop", "livestock", "dairy", "poultry", "other"],
      reversal_status: [
        "submitted",
        "under_review",
        "approved",
        "partially_approved",
        "rejected",
      ],
      tx_state: [
        "initiated",
        "confirmed",
        "completed",
        "failed",
        "processing",
        "reversed",
      ],
      tx_type: ["deposit", "withdrawal", "transfer", "fx", "reversal"],
    },
  },
} as const
