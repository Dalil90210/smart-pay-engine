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
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          home_currency: Database["public"]["Enums"]["currency_code"]
          id: string
          tax_setaside_percent: number
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          home_currency?: Database["public"]["Enums"]["currency_code"]
          id: string
          tax_setaside_percent?: number
        }
        Update: {
          created_at?: string
          display_name?: string | null
          home_currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
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
      has_pin: { Args: never; Returns: boolean }
      pay_invoice_by_token: {
        Args: { p_idempotency_key: string; p_token: string }
        Returns: Json
      }
      post_transaction: {
        Args: {
          p_entries: Json
          p_idempotency_key: string
          p_metadata: Json
          p_type: Database["public"]["Enums"]["tx_type"]
        }
        Returns: string
      }
      send_invoice: { Args: { p_invoice_id: string }; Returns: undefined }
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
