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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_access_blocks: {
        Row: {
          created_at: string
          endpoint: string
          message: string
          status: number
        }
        Insert: {
          created_at?: string
          endpoint: string
          message: string
          status: number
        }
        Update: {
          created_at?: string
          endpoint?: string
          message?: string
          status?: number
        }
        Relationships: []
      }
      medication_audit: {
        Row: {
          action: string
          actor_staff_id: string
          actor_user_id: string
          client_id: string | null
          created_at: string
          details: Json
          entity_id: string
          entity_type: string
          id: string
          organisation_id: string
          site_id: string
        }
        Insert: {
          action: string
          actor_staff_id: string
          actor_user_id: string
          client_id?: string | null
          created_at?: string
          details?: Json
          entity_id: string
          entity_type: string
          id?: string
          organisation_id: string
          site_id: string
        }
        Update: {
          action?: string
          actor_staff_id?: string
          actor_user_id?: string
          client_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string
          entity_type?: string
          id?: string
          organisation_id?: string
          site_id?: string
        }
        Relationships: []
      }
      medication_exceptions: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by_staff_id: string | null
          client_id: string
          created_at: string
          exception_key: string
          follow_up: string | null
          follow_up_at: string | null
          follow_up_by_staff_id: string | null
          id: string
          kind: string
          organisation_id: string
          outcome_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by_staff_id: string | null
          site_id: string
          status: string
          task_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by_staff_id?: string | null
          client_id: string
          created_at?: string
          exception_key: string
          follow_up?: string | null
          follow_up_at?: string | null
          follow_up_by_staff_id?: string | null
          id?: string
          kind: string
          organisation_id: string
          outcome_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by_staff_id?: string | null
          site_id: string
          status: string
          task_id: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by_staff_id?: string | null
          client_id?: string
          created_at?: string
          exception_key?: string
          follow_up?: string | null
          follow_up_at?: string | null
          follow_up_by_staff_id?: string | null
          id?: string
          kind?: string
          organisation_id?: string
          outcome_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by_staff_id?: string | null
          site_id?: string
          status?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_exceptions_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "medication_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_exceptions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "medication_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_instruction_versions: {
        Row: {
          created_at: string
          created_by_staff_id: string
          dose: string
          effective_from: string | null
          end_date: string | null
          frequency: string
          id: string
          medication_id: string
          provider_instructions: string
          regularity: string
          route: string
          scheduled_times: string[]
          source_document: string
          start_date: string
          supersedes_id: string | null
          support_level: string
          verification_status: string
          verified_at: string | null
          verified_by_staff_id: string | null
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by_staff_id: string
          dose: string
          effective_from?: string | null
          end_date?: string | null
          frequency: string
          id?: string
          medication_id: string
          provider_instructions: string
          regularity: string
          route: string
          scheduled_times: string[]
          source_document: string
          start_date: string
          supersedes_id?: string | null
          support_level: string
          verification_status: string
          verified_at?: string | null
          verified_by_staff_id?: string | null
          version_number: number
        }
        Update: {
          created_at?: string
          created_by_staff_id?: string
          dose?: string
          effective_from?: string | null
          end_date?: string | null
          frequency?: string
          id?: string
          medication_id?: string
          provider_instructions?: string
          regularity?: string
          route?: string
          scheduled_times?: string[]
          source_document?: string
          start_date?: string
          supersedes_id?: string | null
          support_level?: string
          verification_status?: string
          verified_at?: string | null
          verified_by_staff_id?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "medication_instruction_versions_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_instruction_versions_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "medication_instruction_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_notifications: {
        Row: {
          attempted_at: string | null
          created_at: string
          detail: string
          exception_id: string
          id: string
          status: string
        }
        Insert: {
          attempted_at?: string | null
          created_at?: string
          detail: string
          exception_id: string
          id?: string
          status: string
        }
        Update: {
          attempted_at?: string | null
          created_at?: string
          detail?: string
          exception_id?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_notifications_exception_id_fkey"
            columns: ["exception_id"]
            isOneToOne: false
            referencedRelation: "medication_exceptions"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_outcomes: {
        Row: {
          client_id: string
          correction_of: string | null
          correction_reason: string | null
          event_at: string
          id: string
          idempotency_key: string
          instruction_version_id: string
          medication_id: string
          organisation_id: string
          outcome: string
          reason: string
          site_id: string
          staff_id: string
          submitted_at: string
          submitted_by_user_id: string
          task_id: string
          visit_id: string | null
        }
        Insert: {
          client_id: string
          correction_of?: string | null
          correction_reason?: string | null
          event_at: string
          id?: string
          idempotency_key: string
          instruction_version_id: string
          medication_id: string
          organisation_id: string
          outcome: string
          reason?: string
          site_id: string
          staff_id: string
          submitted_at?: string
          submitted_by_user_id: string
          task_id: string
          visit_id?: string | null
        }
        Update: {
          client_id?: string
          correction_of?: string | null
          correction_reason?: string | null
          event_at?: string
          id?: string
          idempotency_key?: string
          instruction_version_id?: string
          medication_id?: string
          organisation_id?: string
          outcome?: string
          reason?: string
          site_id?: string
          staff_id?: string
          submitted_at?: string
          submitted_by_user_id?: string
          task_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medication_outcomes_correction_of_fkey"
            columns: ["correction_of"]
            isOneToOne: false
            referencedRelation: "medication_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_outcomes_instruction_version_id_fkey"
            columns: ["instruction_version_id"]
            isOneToOne: false
            referencedRelation: "medication_instruction_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_outcomes_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_outcomes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "medication_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_outcomes_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "medication_visits"
            referencedColumns: ["visit_id"]
          },
        ]
      }
      medication_staff_access: {
        Row: {
          access_role: string
          can_administer: boolean
          can_configure: boolean
          created_at: string
          organisation_id: string
          site_ids: string[]
          staff_id: string
          user_id: string
        }
        Insert: {
          access_role: string
          can_administer?: boolean
          can_configure?: boolean
          created_at?: string
          organisation_id: string
          site_ids: string[]
          staff_id: string
          user_id: string
        }
        Update: {
          access_role?: string
          can_administer?: boolean
          can_configure?: boolean
          created_at?: string
          organisation_id?: string
          site_ids?: string[]
          staff_id?: string
          user_id?: string
        }
        Relationships: []
      }
      medication_tasks: {
        Row: {
          client_id: string
          created_at: string
          documentation_due_at: string
          id: string
          instruction_version_id: string
          medication_id: string
          organisation_id: string
          scheduled_at: string
          site_id: string
          visit_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          documentation_due_at: string
          id?: string
          instruction_version_id: string
          medication_id: string
          organisation_id: string
          scheduled_at: string
          site_id: string
          visit_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          documentation_due_at?: string
          id?: string
          instruction_version_id?: string
          medication_id?: string
          organisation_id?: string
          scheduled_at?: string
          site_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medication_tasks_instruction_version_id_fkey"
            columns: ["instruction_version_id"]
            isOneToOne: false
            referencedRelation: "medication_instruction_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_tasks_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_tasks_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "medication_visits"
            referencedColumns: ["visit_id"]
          },
        ]
      }
      medication_visits: {
        Row: {
          assigned_staff_ids: string[]
          client_id: string
          created_at: string
          organisation_id: string
          scheduled_end: string
          scheduled_start: string
          site_id: string
          visit_id: string
        }
        Insert: {
          assigned_staff_ids: string[]
          client_id: string
          created_at?: string
          organisation_id: string
          scheduled_end: string
          scheduled_start: string
          site_id: string
          visit_id: string
        }
        Update: {
          assigned_staff_ids?: string[]
          client_id?: string
          created_at?: string
          organisation_id?: string
          scheduled_end?: string
          scheduled_start?: string
          site_id?: string
          visit_id?: string
        }
        Relationships: []
      }
      medications: {
        Row: {
          client_id: string
          created_at: string
          created_by_staff_id: string
          current_version_id: string | null
          id: string
          name: string
          organisation_id: string
          site_id: string
          status: string
          strength: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by_staff_id: string
          current_version_id?: string | null
          id?: string
          name: string
          organisation_id: string
          site_id: string
          status: string
          strength: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by_staff_id?: string
          current_version_id?: string | null
          id?: string
          name?: string
          organisation_id?: string
          site_id?: string
          status?: string
          strength?: string
        }
        Relationships: []
      }
      visit_note_drafts: {
        Row: {
          ai_draft: Json
          client_id: string
          created_at: string
          id: string
          source_kind: string
          transcript: string
          user_id: string
          visit_id: string
        }
        Insert: {
          ai_draft: Json
          client_id: string
          created_at?: string
          id?: string
          source_kind: string
          transcript: string
          user_id: string
          visit_id: string
        }
        Update: {
          ai_draft?: Json
          client_id?: string
          created_at?: string
          id?: string
          source_kind?: string
          transcript?: string
          user_id?: string
          visit_id?: string
        }
        Relationships: []
      }
      visit_notes: {
        Row: {
          ai_draft: Json
          client_id: string
          confirmed_at: string
          confirmed_by_staff_id: string
          draft_id: string
          final_text: Json
          id: string
          provenance: Json
          source_kind: string
          transcript: string
          user_id: string
          visit_id: string
        }
        Insert: {
          ai_draft: Json
          client_id: string
          confirmed_at?: string
          confirmed_by_staff_id: string
          draft_id: string
          final_text: Json
          id?: string
          provenance: Json
          source_kind: string
          transcript: string
          user_id: string
          visit_id: string
        }
        Update: {
          ai_draft?: Json
          client_id?: string
          confirmed_at?: string
          confirmed_by_staff_id?: string
          draft_id?: string
          final_text?: Json
          id?: string
          provenance?: Json
          source_kind?: string
          transcript?: string
          user_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_notes_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: true
            referencedRelation: "visit_note_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      medication_has_access: {
        Args: { _organisation_id: string; _roles?: string[]; _site_id: string }
        Returns: boolean
      }
      submit_medication_outcome: {
        Args: {
          p_correction_of?: string
          p_correction_reason?: string
          p_event_at: string
          p_idempotency_key: string
          p_outcome: string
          p_reason: string
          p_task_id: string
          p_user_id: string
          p_visit_id: string
        }
        Returns: {
          client_id: string
          correction_of: string | null
          correction_reason: string | null
          event_at: string
          id: string
          idempotency_key: string
          instruction_version_id: string
          medication_id: string
          organisation_id: string
          outcome: string
          reason: string
          site_id: string
          staff_id: string
          submitted_at: string
          submitted_by_user_id: string
          task_id: string
          visit_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "medication_outcomes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sweep_medication_documentation: {
        Args: { p_user_id: string }
        Returns: number
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
