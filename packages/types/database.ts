// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT BY HAND.
//
//   python3 scripts/gen-types.py > packages/types/database.ts
//
// Derived by introspecting the schema in supabase/migrations. CI regenerates
// this and fails if it differs, so the types can never drift from the tables.
// ---------------------------------------------------------------------------

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      action_items: {
        Row: {
          id: string;
          clinic_id: string;
          type: Database["public"]["Enums"]["action_type"];
          severity: Database["public"]["Enums"]["action_severity"];
          status: Database["public"]["Enums"]["action_status"];
          title: string;
          description: string | null;
          payload: Json;
          related_appointment_id: string | null;
          related_call_id: string | null;
          related_doctor_id: string | null;
          related_patient_id: string | null;
          related_batch_id: string | null;
          due_by: string | null;
          assigned_to: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
          resolution_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          type: Database["public"]["Enums"]["action_type"];
          severity?: Database["public"]["Enums"]["action_severity"];
          status?: Database["public"]["Enums"]["action_status"];
          title: string;
          description?: string | null;
          payload?: Json;
          related_appointment_id?: string | null;
          related_call_id?: string | null;
          related_doctor_id?: string | null;
          related_patient_id?: string | null;
          related_batch_id?: string | null;
          due_by?: string | null;
          assigned_to?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          resolution_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          type?: Database["public"]["Enums"]["action_type"];
          severity?: Database["public"]["Enums"]["action_severity"];
          status?: Database["public"]["Enums"]["action_status"];
          title?: string;
          description?: string | null;
          payload?: Json;
          related_appointment_id?: string | null;
          related_call_id?: string | null;
          related_doctor_id?: string | null;
          related_patient_id?: string | null;
          related_batch_id?: string | null;
          due_by?: string | null;
          assigned_to?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          resolution_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "action_items_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_items_batch_fkey";
            columns: ["related_batch_id"];
            isOneToOne: false;
            referencedRelation: "reschedule_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_items_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_items_related_appointment_id_fkey";
            columns: ["related_appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_items_related_call_id_fkey";
            columns: ["related_call_id"];
            isOneToOne: false;
            referencedRelation: "calls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_items_related_doctor_id_fkey";
            columns: ["related_doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_items_related_patient_id_fkey";
            columns: ["related_patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_items_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_audit_log: {
        Row: {
          id: string;
          admin_user_id: string;
          action: string;
          target_type: string | null;
          target_id: string | null;
          reason: string | null;
          before: Json | null;
          after: Json | null;
          request_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_user_id: string;
          action: string;
          target_type?: string | null;
          target_id?: string | null;
          reason?: string | null;
          before?: Json | null;
          after?: Json | null;
          request_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_user_id?: string;
          action?: string;
          target_type?: string | null;
          target_id?: string | null;
          reason?: string | null;
          before?: Json | null;
          after?: Json | null;
          request_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_admin_user_id_fkey";
            columns: ["admin_user_id"];
            isOneToOne: false;
            referencedRelation: "platform_admins";
            referencedColumns: ["user_id"];
          },
        ];
      };
      admin_clinic_notes: {
        Row: {
          id: string;
          clinic_id: string;
          admin_user_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          admin_user_id: string;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          admin_user_id?: string;
          body?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_clinic_notes_admin_user_id_fkey";
            columns: ["admin_user_id"];
            isOneToOne: false;
            referencedRelation: "platform_admins";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "admin_clinic_notes_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      appointment_events: {
        Row: {
          id: string;
          clinic_id: string;
          appointment_id: string;
          event: Database["public"]["Enums"]["appointment_event"];
          actor_type: Database["public"]["Enums"]["actor_type"];
          actor_staff_id: string | null;
          actor_call_id: string | null;
          note: string | null;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          appointment_id: string;
          event: Database["public"]["Enums"]["appointment_event"];
          actor_type: Database["public"]["Enums"]["actor_type"];
          actor_staff_id?: string | null;
          actor_call_id?: string | null;
          note?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          appointment_id?: string;
          event?: Database["public"]["Enums"]["appointment_event"];
          actor_type?: Database["public"]["Enums"]["actor_type"];
          actor_staff_id?: string | null;
          actor_call_id?: string | null;
          note?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointment_events_actor_call_fkey";
            columns: ["actor_call_id"];
            isOneToOne: false;
            referencedRelation: "calls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_events_actor_staff_id_fkey";
            columns: ["actor_staff_id"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_events_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_events_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          id: string;
          clinic_id: string;
          doctor_id: string;
          patient_id: string;
          starts_at: string;
          ends_at: string;
          duration_min: number;
          status: Database["public"]["Enums"]["appointment_status"];
          source: Database["public"]["Enums"]["booking_source"];
          reason: string | null;
          token_number: number | null;
          notes: string | null;
          booked_by_call_id: string | null;
          booked_by_staff_id: string | null;
          rescheduled_from_id: string | null;
          confirmed_at: string | null;
          checked_in_at: string | null;
          completed_at: string | null;
          cancelled_at: string | null;
          cancelled_by: Database["public"]["Enums"]["actor_type"] | null;
          cancellation_reason: string | null;
          created_at: string;
          updated_at: string;
          phone_verified: boolean;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          doctor_id: string;
          patient_id: string;
          starts_at: string;
          ends_at: string;
          duration_min: number;
          status?: Database["public"]["Enums"]["appointment_status"];
          source?: Database["public"]["Enums"]["booking_source"];
          reason?: string | null;
          token_number?: number | null;
          notes?: string | null;
          booked_by_call_id?: string | null;
          booked_by_staff_id?: string | null;
          rescheduled_from_id?: string | null;
          confirmed_at?: string | null;
          checked_in_at?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: Database["public"]["Enums"]["actor_type"] | null;
          cancellation_reason?: string | null;
          created_at?: string;
          updated_at?: string;
          phone_verified?: boolean;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          doctor_id?: string;
          patient_id?: string;
          starts_at?: string;
          ends_at?: string;
          duration_min?: number;
          status?: Database["public"]["Enums"]["appointment_status"];
          source?: Database["public"]["Enums"]["booking_source"];
          reason?: string | null;
          token_number?: number | null;
          notes?: string | null;
          booked_by_call_id?: string | null;
          booked_by_staff_id?: string | null;
          rescheduled_from_id?: string | null;
          confirmed_at?: string | null;
          checked_in_at?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: Database["public"]["Enums"]["actor_type"] | null;
          cancellation_reason?: string | null;
          created_at?: string;
          updated_at?: string;
          phone_verified?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_booked_by_call_fkey";
            columns: ["booked_by_call_id"];
            isOneToOne: false;
            referencedRelation: "calls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_booked_by_staff_id_fkey";
            columns: ["booked_by_staff_id"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_doctor_id_clinic_id_fkey";
            columns: ["doctor_id", "clinic_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id", "clinic_id"];
          },
          {
            foreignKeyName: "appointments_patient_id_clinic_id_fkey";
            columns: ["patient_id", "clinic_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id", "clinic_id"];
          },
          {
            foreignKeyName: "appointments_rescheduled_from_id_fkey";
            columns: ["rescheduled_from_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
        ];
      };
      call_access_log: {
        Row: {
          id: string;
          clinic_id: string;
          call_id: string;
          actor_user_id: string;
          request_id: string | null;
          accessed_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          call_id: string;
          actor_user_id: string;
          request_id?: string | null;
          accessed_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          call_id?: string;
          actor_user_id?: string;
          request_id?: string | null;
          accessed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "call_access_log_call_id_fkey";
            columns: ["call_id"];
            isOneToOne: false;
            referencedRelation: "calls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "call_access_log_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      call_summaries: {
        Row: {
          call_id: string;
          clinic_id: string;
          summary_en: string | null;
          summary_te: string | null;
          follow_up_needed: boolean;
          created_at: string;
        };
        Insert: {
          call_id: string;
          clinic_id: string;
          summary_en?: string | null;
          summary_te?: string | null;
          follow_up_needed?: boolean;
          created_at?: string;
        };
        Update: {
          call_id?: string;
          clinic_id?: string;
          summary_en?: string | null;
          summary_te?: string | null;
          follow_up_needed?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "call_summaries_call_id_fkey";
            columns: ["call_id"];
            isOneToOne: true;
            referencedRelation: "calls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "call_summaries_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      call_tool_invocations: {
        Row: {
          id: string;
          clinic_id: string;
          call_id: string;
          turn_id: string | null;
          tool_name: string;
          arguments: Json;
          allowed: boolean;
          denial_reason: string | null;
          result: Json | null;
          latency_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          call_id: string;
          turn_id?: string | null;
          tool_name: string;
          arguments?: Json;
          allowed: boolean;
          denial_reason?: string | null;
          result?: Json | null;
          latency_ms?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          call_id?: string;
          turn_id?: string | null;
          tool_name?: string;
          arguments?: Json;
          allowed?: boolean;
          denial_reason?: string | null;
          result?: Json | null;
          latency_ms?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "call_tool_invocations_call_id_fkey";
            columns: ["call_id"];
            isOneToOne: false;
            referencedRelation: "calls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "call_tool_invocations_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "call_tool_invocations_turn_id_fkey";
            columns: ["turn_id"];
            isOneToOne: false;
            referencedRelation: "call_turns";
            referencedColumns: ["id"];
          },
        ];
      };
      call_turns: {
        Row: {
          id: string;
          clinic_id: string;
          call_id: string;
          turn_index: number;
          role: Database["public"]["Enums"]["turn_role"];
          content: string;
          language: Database["public"]["Enums"]["language_code"] | null;
          stt_confidence: number | null;
          latency_ms: number | null;
          audio_url: string | null;
          started_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          call_id: string;
          turn_index: number;
          role: Database["public"]["Enums"]["turn_role"];
          content: string;
          language?: Database["public"]["Enums"]["language_code"] | null;
          stt_confidence?: number | null;
          latency_ms?: number | null;
          audio_url?: string | null;
          started_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          call_id?: string;
          turn_index?: number;
          role?: Database["public"]["Enums"]["turn_role"];
          content?: string;
          language?: Database["public"]["Enums"]["language_code"] | null;
          stt_confidence?: number | null;
          latency_ms?: number | null;
          audio_url?: string | null;
          started_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "call_turns_call_id_fkey";
            columns: ["call_id"];
            isOneToOne: false;
            referencedRelation: "calls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "call_turns_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      calls: {
        Row: {
          id: string;
          clinic_id: string;
          provider: Database["public"]["Enums"]["telephony_provider"];
          provider_call_sid: string | null;
          direction: Database["public"]["Enums"]["call_direction"];
          from_e164: string;
          to_e164: string;
          patient_id: string | null;
          started_at: string;
          answered_at: string | null;
          ended_at: string | null;
          duration_sec: number | null;
          status: Database["public"]["Enums"]["call_status"];
          outcome: Database["public"]["Enums"]["call_outcome"] | null;
          intent: Database["public"]["Enums"]["call_intent"] | null;
          primary_language: Database["public"]["Enums"]["language_code"] | null;
          languages_detected: Database["public"]["Enums"]["language_code"][];
          stt_confidence_avg: number | null;
          recording_url: string | null;
          escalated_to_human: boolean;
          recovered_missed: boolean;
          created_at: string;
          updated_at: string;
          transcript_purged_at: string | null;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          provider?: Database["public"]["Enums"]["telephony_provider"];
          provider_call_sid?: string | null;
          direction?: Database["public"]["Enums"]["call_direction"];
          from_e164: string;
          to_e164: string;
          patient_id?: string | null;
          started_at?: string;
          answered_at?: string | null;
          ended_at?: string | null;
          duration_sec?: number | null;
          status?: Database["public"]["Enums"]["call_status"];
          outcome?: Database["public"]["Enums"]["call_outcome"] | null;
          intent?: Database["public"]["Enums"]["call_intent"] | null;
          primary_language?: Database["public"]["Enums"]["language_code"] | null;
          languages_detected?: Database["public"]["Enums"]["language_code"][];
          stt_confidence_avg?: number | null;
          recording_url?: string | null;
          escalated_to_human?: boolean;
          recovered_missed?: boolean;
          created_at?: string;
          updated_at?: string;
          transcript_purged_at?: string | null;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          provider?: Database["public"]["Enums"]["telephony_provider"];
          provider_call_sid?: string | null;
          direction?: Database["public"]["Enums"]["call_direction"];
          from_e164?: string;
          to_e164?: string;
          patient_id?: string | null;
          started_at?: string;
          answered_at?: string | null;
          ended_at?: string | null;
          duration_sec?: number | null;
          status?: Database["public"]["Enums"]["call_status"];
          outcome?: Database["public"]["Enums"]["call_outcome"] | null;
          intent?: Database["public"]["Enums"]["call_intent"] | null;
          primary_language?: Database["public"]["Enums"]["language_code"] | null;
          languages_detected?: Database["public"]["Enums"]["language_code"][];
          stt_confidence_avg?: number | null;
          recording_url?: string | null;
          escalated_to_human?: boolean;
          recovered_missed?: boolean;
          created_at?: string;
          updated_at?: string;
          transcript_purged_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "calls_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calls_patient_id_clinic_id_fkey";
            columns: ["patient_id", "clinic_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id", "clinic_id"];
          },
        ];
      };
      care_plans: {
        Row: {
          id: string;
          clinic_id: string;
          name: string;
          trigger: Database["public"]["Enums"]["care_trigger"];
          offset_days: number;
          template_key: string;
          channel: Database["public"]["Enums"]["message_channel"];
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          name: string;
          trigger: Database["public"]["Enums"]["care_trigger"];
          offset_days: number;
          template_key: string;
          channel?: Database["public"]["Enums"]["message_channel"];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          name?: string;
          trigger?: Database["public"]["Enums"]["care_trigger"];
          offset_days?: number;
          template_key?: string;
          channel?: Database["public"]["Enums"]["message_channel"];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "care_plans_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      care_tasks: {
        Row: {
          id: string;
          clinic_id: string;
          care_plan_id: string;
          patient_id: string;
          appointment_id: string | null;
          due_on: string;
          status: Database["public"]["Enums"]["care_task_status"];
          message_id: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          care_plan_id: string;
          patient_id: string;
          appointment_id?: string | null;
          due_on: string;
          status?: Database["public"]["Enums"]["care_task_status"];
          message_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          care_plan_id?: string;
          patient_id?: string;
          appointment_id?: string | null;
          due_on?: string;
          status?: Database["public"]["Enums"]["care_task_status"];
          message_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "care_tasks_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "care_tasks_care_plan_id_fkey";
            columns: ["care_plan_id"];
            isOneToOne: false;
            referencedRelation: "care_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "care_tasks_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "care_tasks_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "care_tasks_patient_id_clinic_id_fkey";
            columns: ["patient_id", "clinic_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id", "clinic_id"];
          },
        ];
      };
      clinic_closures: {
        Row: {
          id: string;
          clinic_id: string;
          starts_on: string;
          ends_on: string;
          reason: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          starts_on: string;
          ends_on: string;
          reason: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          starts_on?: string;
          ends_on?: string;
          reason?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinic_closures_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      clinic_documents: {
        Row: {
          id: string;
          clinic_id: string;
          kind: string;
          storage_path: string;
          file_name: string;
          content_type: string;
          size_bytes: number;
          uploaded_by: string | null;
          uploaded_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          kind: string;
          storage_path: string;
          file_name: string;
          content_type: string;
          size_bytes: number;
          uploaded_by?: string | null;
          uploaded_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          kind?: string;
          storage_path?: string;
          file_name?: string;
          content_type?: string;
          size_bytes?: number;
          uploaded_by?: string | null;
          uploaded_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinic_documents_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clinic_documents_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      clinic_faqs: {
        Row: {
          id: string;
          clinic_id: string;
          question_en: string;
          question_te: string | null;
          answer_en: string;
          answer_te: string | null;
          category: Database["public"]["Enums"]["faq_category"];
          keywords: string[];
          priority: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          question_en: string;
          question_te?: string | null;
          answer_en: string;
          answer_te?: string | null;
          category?: Database["public"]["Enums"]["faq_category"];
          keywords?: string[];
          priority?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          question_en?: string;
          question_te?: string | null;
          answer_en?: string;
          answer_te?: string | null;
          category?: Database["public"]["Enums"]["faq_category"];
          keywords?: string[];
          priority?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinic_faqs_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      clinic_hours: {
        Row: {
          id: string;
          clinic_id: string;
          day_of_week: number;
          opens_at: string;
          closes_at: string;
          label: string | null;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          day_of_week: number;
          opens_at: string;
          closes_at: string;
          label?: string | null;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          day_of_week?: number;
          opens_at?: string;
          closes_at?: string;
          label?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "clinic_hours_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      clinic_members: {
        Row: {
          clinic_id: string;
          staff_id: string;
          role: Database["public"]["Enums"]["staff_role"];
          status: Database["public"]["Enums"]["member_status"];
          invited_by: string | null;
          invited_at: string;
          joined_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          clinic_id: string;
          staff_id: string;
          role?: Database["public"]["Enums"]["staff_role"];
          status?: Database["public"]["Enums"]["member_status"];
          invited_by?: string | null;
          invited_at?: string;
          joined_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          clinic_id?: string;
          staff_id?: string;
          role?: Database["public"]["Enums"]["staff_role"];
          status?: Database["public"]["Enums"]["member_status"];
          invited_by?: string | null;
          invited_at?: string;
          joined_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinic_members_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: true;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clinic_members_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clinic_members_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      clinic_services: {
        Row: {
          id: string;
          clinic_id: string;
          name_en: string;
          name_te: string | null;
          description: string | null;
          price_paise: number | null;
          duration_min: number | null;
          category: string | null;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          name_en: string;
          name_te?: string | null;
          description?: string | null;
          price_paise?: number | null;
          duration_min?: number | null;
          category?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          name_en?: string;
          name_te?: string | null;
          description?: string | null;
          price_paise?: number | null;
          duration_min?: number | null;
          category?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinic_services_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      clinic_settings: {
        Row: {
          clinic_id: string;
          ai_enabled: boolean;
          ai_answers_after_hours: boolean;
          ai_may_book: boolean;
          ai_may_reschedule: boolean;
          ai_may_cancel: boolean;
          slot_granularity_min: number;
          booking_horizon_days: number;
          min_notice_minutes: number;
          cancellation_window_min: number;
          max_daily_ai_bookings: number | null;
          greeting_te: string | null;
          greeting_en: string | null;
          escalation_phone_e164: string | null;
          escalation_keywords: string[];
          send_confirmations: boolean;
          send_reminders: boolean;
          reminder_hours_before: number;
          created_at: string;
          updated_at: string;
          portal_enabled: boolean;
          patient_may_reschedule: boolean;
          patient_may_cancel: boolean;
          portal_link_ttl_days: number;
          transcript_retention_days: number;
          receptionists_see_transcripts: boolean;
          patient_may_book: boolean;
          public_booking_enabled: boolean;
        };
        Insert: {
          clinic_id: string;
          ai_enabled?: boolean;
          ai_answers_after_hours?: boolean;
          ai_may_book?: boolean;
          ai_may_reschedule?: boolean;
          ai_may_cancel?: boolean;
          slot_granularity_min?: number;
          booking_horizon_days?: number;
          min_notice_minutes?: number;
          cancellation_window_min?: number;
          max_daily_ai_bookings?: number | null;
          greeting_te?: string | null;
          greeting_en?: string | null;
          escalation_phone_e164?: string | null;
          escalation_keywords?: string[];
          send_confirmations?: boolean;
          send_reminders?: boolean;
          reminder_hours_before?: number;
          created_at?: string;
          updated_at?: string;
          portal_enabled?: boolean;
          patient_may_reschedule?: boolean;
          patient_may_cancel?: boolean;
          portal_link_ttl_days?: number;
          transcript_retention_days?: number;
          receptionists_see_transcripts?: boolean;
          patient_may_book?: boolean;
          public_booking_enabled?: boolean;
        };
        Update: {
          clinic_id?: string;
          ai_enabled?: boolean;
          ai_answers_after_hours?: boolean;
          ai_may_book?: boolean;
          ai_may_reschedule?: boolean;
          ai_may_cancel?: boolean;
          slot_granularity_min?: number;
          booking_horizon_days?: number;
          min_notice_minutes?: number;
          cancellation_window_min?: number;
          max_daily_ai_bookings?: number | null;
          greeting_te?: string | null;
          greeting_en?: string | null;
          escalation_phone_e164?: string | null;
          escalation_keywords?: string[];
          send_confirmations?: boolean;
          send_reminders?: boolean;
          reminder_hours_before?: number;
          created_at?: string;
          updated_at?: string;
          portal_enabled?: boolean;
          patient_may_reschedule?: boolean;
          patient_may_cancel?: boolean;
          portal_link_ttl_days?: number;
          transcript_retention_days?: number;
          receptionists_see_transcripts?: boolean;
          patient_may_book?: boolean;
          public_booking_enabled?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "clinic_settings_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: true;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      clinics: {
        Row: {
          id: string;
          slug: string;
          name: string;
          legal_name: string | null;
          phone_e164: string;
          whatsapp_e164: string | null;
          support_email: string | null;
          address_line: string | null;
          landmark: string | null;
          city: string;
          district: string | null;
          state: string | null;
          pincode: string | null;
          map_url: string | null;
          timezone: string;
          default_language: Database["public"]["Enums"]["language_code"];
          supported_languages: Database["public"]["Enums"]["language_code"][];
          is_active: boolean;
          onboarded_at: string | null;
          created_at: string;
          updated_at: string;
          verification_status: Database["public"]["Enums"]["clinic_verification_status"];
          hfr_id: string | null;
          establishment_reg_no: string | null;
          registration_state: string | null;
          owner_reg_no: string | null;
          owner_council: string | null;
          gstin: string | null;
          submitted_at: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          review_note: string | null;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          legal_name?: string | null;
          phone_e164: string;
          whatsapp_e164?: string | null;
          support_email?: string | null;
          address_line?: string | null;
          landmark?: string | null;
          city: string;
          district?: string | null;
          state?: string | null;
          pincode?: string | null;
          map_url?: string | null;
          timezone?: string;
          default_language?: Database["public"]["Enums"]["language_code"];
          supported_languages?: Database["public"]["Enums"]["language_code"][];
          is_active?: boolean;
          onboarded_at?: string | null;
          created_at?: string;
          updated_at?: string;
          verification_status?: Database["public"]["Enums"]["clinic_verification_status"];
          hfr_id?: string | null;
          establishment_reg_no?: string | null;
          registration_state?: string | null;
          owner_reg_no?: string | null;
          owner_council?: string | null;
          gstin?: string | null;
          submitted_at?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          review_note?: string | null;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          legal_name?: string | null;
          phone_e164?: string;
          whatsapp_e164?: string | null;
          support_email?: string | null;
          address_line?: string | null;
          landmark?: string | null;
          city?: string;
          district?: string | null;
          state?: string | null;
          pincode?: string | null;
          map_url?: string | null;
          timezone?: string;
          default_language?: Database["public"]["Enums"]["language_code"];
          supported_languages?: Database["public"]["Enums"]["language_code"][];
          is_active?: boolean;
          onboarded_at?: string | null;
          created_at?: string;
          updated_at?: string;
          verification_status?: Database["public"]["Enums"]["clinic_verification_status"];
          hfr_id?: string | null;
          establishment_reg_no?: string | null;
          registration_state?: string | null;
          owner_reg_no?: string | null;
          owner_council?: string | null;
          gstin?: string | null;
          submitted_at?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          review_note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "clinics_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "platform_admins";
            referencedColumns: ["user_id"];
          },
        ];
      };
      consultations: {
        Row: {
          id: string;
          clinic_id: string;
          appointment_id: string | null;
          patient_id: string;
          doctor_id: string;
          chief_complaint: string | null;
          findings: string | null;
          diagnosis_text: string | null;
          advice: string | null;
          follow_up_days: number | null;
          dictation_audio_url: string | null;
          dictated_language: Database["public"]["Enums"]["language_code"] | null;
          raw_transcript: string | null;
          formatted_note: string | null;
          status: Database["public"]["Enums"]["note_status"];
          finalised_at: string | null;
          finalised_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          appointment_id?: string | null;
          patient_id: string;
          doctor_id: string;
          chief_complaint?: string | null;
          findings?: string | null;
          diagnosis_text?: string | null;
          advice?: string | null;
          follow_up_days?: number | null;
          dictation_audio_url?: string | null;
          dictated_language?: Database["public"]["Enums"]["language_code"] | null;
          raw_transcript?: string | null;
          formatted_note?: string | null;
          status?: Database["public"]["Enums"]["note_status"];
          finalised_at?: string | null;
          finalised_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          appointment_id?: string | null;
          patient_id?: string;
          doctor_id?: string;
          chief_complaint?: string | null;
          findings?: string | null;
          diagnosis_text?: string | null;
          advice?: string | null;
          follow_up_days?: number | null;
          dictation_audio_url?: string | null;
          dictated_language?: Database["public"]["Enums"]["language_code"] | null;
          raw_transcript?: string | null;
          formatted_note?: string | null;
          status?: Database["public"]["Enums"]["note_status"];
          finalised_at?: string | null;
          finalised_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "consultations_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: true;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consultations_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consultations_doctor_id_clinic_id_fkey";
            columns: ["doctor_id", "clinic_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id", "clinic_id"];
          },
          {
            foreignKeyName: "consultations_finalised_by_fkey";
            columns: ["finalised_by"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consultations_patient_id_clinic_id_fkey";
            columns: ["patient_id", "clinic_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id", "clinic_id"];
          },
        ];
      };
      doctor_sessions: {
        Row: {
          id: string;
          clinic_id: string;
          doctor_id: string;
          day_of_week: number;
          starts_at: string;
          ends_at: string;
          slot_duration_min: number | null;
          capacity_per_slot: number;
          label: string | null;
          effective_from: string;
          effective_to: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          doctor_id: string;
          day_of_week: number;
          starts_at: string;
          ends_at: string;
          slot_duration_min?: number | null;
          capacity_per_slot?: number;
          label?: string | null;
          effective_from?: string;
          effective_to?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          doctor_id?: string;
          day_of_week?: number;
          starts_at?: string;
          ends_at?: string;
          slot_duration_min?: number | null;
          capacity_per_slot?: number;
          label?: string | null;
          effective_from?: string;
          effective_to?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "doctor_sessions_doctor_id_clinic_id_fkey";
            columns: ["doctor_id", "clinic_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id", "clinic_id"];
          },
        ];
      };
      doctor_time_off: {
        Row: {
          id: string;
          clinic_id: string;
          doctor_id: string;
          starts_at: string;
          ends_at: string;
          kind: Database["public"]["Enums"]["time_off_kind"];
          reason: string | null;
          created_by: string | null;
          processed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          doctor_id: string;
          starts_at: string;
          ends_at: string;
          kind?: Database["public"]["Enums"]["time_off_kind"];
          reason?: string | null;
          created_by?: string | null;
          processed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          doctor_id?: string;
          starts_at?: string;
          ends_at?: string;
          kind?: Database["public"]["Enums"]["time_off_kind"];
          reason?: string | null;
          created_by?: string | null;
          processed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "doctor_time_off_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "doctor_time_off_doctor_id_clinic_id_fkey";
            columns: ["doctor_id", "clinic_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id", "clinic_id"];
          },
        ];
      };
      doctors: {
        Row: {
          id: string;
          clinic_id: string;
          full_name: string;
          spoken_name: string;
          specialty: string;
          qualifications: string | null;
          registration_no: string | null;
          phone_e164: string | null;
          languages: Database["public"]["Enums"]["language_code"][];
          consult_duration_min: number;
          consult_fee_paise: number | null;
          followup_fee_paise: number | null;
          staff_id: string | null;
          colour_hex: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          full_name: string;
          spoken_name: string;
          specialty: string;
          qualifications?: string | null;
          registration_no?: string | null;
          phone_e164?: string | null;
          languages?: Database["public"]["Enums"]["language_code"][];
          consult_duration_min?: number;
          consult_fee_paise?: number | null;
          followup_fee_paise?: number | null;
          staff_id?: string | null;
          colour_hex?: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          full_name?: string;
          spoken_name?: string;
          specialty?: string;
          qualifications?: string | null;
          registration_no?: string | null;
          phone_e164?: string | null;
          languages?: Database["public"]["Enums"]["language_code"][];
          consult_duration_min?: number;
          consult_fee_paise?: number | null;
          followup_fee_paise?: number | null;
          staff_id?: string | null;
          colour_hex?: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "doctors_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "doctors_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: true;
            referencedRelation: "staff_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      invoice_counters: {
        Row: {
          series: string;
          fy: string;
          last: number;
        };
        Insert: {
          series: string;
          fy: string;
          last?: number;
        };
        Update: {
          series?: string;
          fy?: string;
          last?: number;
        };
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          kind: string;
          number: string;
          fy: string;
          clinic_id: string;
          payment_id: string;
          refund_id: string | null;
          original_invoice_id: string | null;
          issued_at: string;
          seller: Json;
          buyer: Json;
          description: string;
          sac_code: string;
          period_start: string | null;
          period_end: string | null;
          is_tax_invoice: boolean;
          gst_rate_bps: number;
          taxable_paise: number;
          cgst_paise: number;
          sgst_paise: number;
          igst_paise: number;
          total_paise: number;
        };
        Insert: {
          id?: string;
          kind: string;
          number: string;
          fy: string;
          clinic_id: string;
          payment_id: string;
          refund_id?: string | null;
          original_invoice_id?: string | null;
          issued_at?: string;
          seller: Json;
          buyer: Json;
          description: string;
          sac_code: string;
          period_start?: string | null;
          period_end?: string | null;
          is_tax_invoice: boolean;
          gst_rate_bps: number;
          taxable_paise: number;
          cgst_paise?: number;
          sgst_paise?: number;
          igst_paise?: number;
          total_paise: number;
        };
        Update: {
          id?: string;
          kind?: string;
          number?: string;
          fy?: string;
          clinic_id?: string;
          payment_id?: string;
          refund_id?: string | null;
          original_invoice_id?: string | null;
          issued_at?: string;
          seller?: Json;
          buyer?: Json;
          description?: string;
          sac_code?: string;
          period_start?: string | null;
          period_end?: string | null;
          is_tax_invoice?: boolean;
          gst_rate_bps?: number;
          taxable_paise?: number;
          cgst_paise?: number;
          sgst_paise?: number;
          igst_paise?: number;
          total_paise?: number;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_original_invoice_id_fkey";
            columns: ["original_invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: true;
            referencedRelation: "subscription_payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_refund_id_fkey";
            columns: ["refund_id"];
            isOneToOne: true;
            referencedRelation: "refunds";
            referencedColumns: ["id"];
          },
        ];
      };
      job_runs: {
        Row: {
          job: string;
          last_started_at: string | null;
          last_ok_at: string | null;
          last_error: string | null;
          last_source: string | null;
          runs: number;
        };
        Insert: {
          job: string;
          last_started_at?: string | null;
          last_ok_at?: string | null;
          last_error?: string | null;
          last_source?: string | null;
          runs?: number;
        };
        Update: {
          job?: string;
          last_started_at?: string | null;
          last_ok_at?: string | null;
          last_error?: string | null;
          last_source?: string | null;
          runs?: number;
        };
        Relationships: [];
      };
      message_templates: {
        Row: {
          id: string;
          clinic_id: string | null;
          key: string;
          channel: Database["public"]["Enums"]["message_channel"];
          language: Database["public"]["Enums"]["language_code"];
          body: string;
          provider_template_name: string | null;
          variables: string[];
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id?: string | null;
          key: string;
          channel: Database["public"]["Enums"]["message_channel"];
          language: Database["public"]["Enums"]["language_code"];
          body: string;
          provider_template_name?: string | null;
          variables?: string[];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string | null;
          key?: string;
          channel?: Database["public"]["Enums"]["message_channel"];
          language?: Database["public"]["Enums"]["language_code"];
          body?: string;
          provider_template_name?: string | null;
          variables?: string[];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_templates_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          id: string;
          clinic_id: string;
          patient_id: string | null;
          appointment_id: string | null;
          batch_item_id: string | null;
          channel: Database["public"]["Enums"]["message_channel"];
          direction: Database["public"]["Enums"]["message_direction"];
          to_e164: string;
          template_key: string | null;
          language: Database["public"]["Enums"]["language_code"] | null;
          body_rendered: string;
          status: Database["public"]["Enums"]["message_status"];
          provider: string | null;
          provider_message_id: string | null;
          error_code: string | null;
          error_detail: string | null;
          scheduled_for: string | null;
          sent_at: string | null;
          delivered_at: string | null;
          read_at: string | null;
          failed_at: string | null;
          cost_paise: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          patient_id?: string | null;
          appointment_id?: string | null;
          batch_item_id?: string | null;
          channel: Database["public"]["Enums"]["message_channel"];
          direction?: Database["public"]["Enums"]["message_direction"];
          to_e164: string;
          template_key?: string | null;
          language?: Database["public"]["Enums"]["language_code"] | null;
          body_rendered: string;
          status?: Database["public"]["Enums"]["message_status"];
          provider?: string | null;
          provider_message_id?: string | null;
          error_code?: string | null;
          error_detail?: string | null;
          scheduled_for?: string | null;
          sent_at?: string | null;
          delivered_at?: string | null;
          read_at?: string | null;
          failed_at?: string | null;
          cost_paise?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          patient_id?: string | null;
          appointment_id?: string | null;
          batch_item_id?: string | null;
          channel?: Database["public"]["Enums"]["message_channel"];
          direction?: Database["public"]["Enums"]["message_direction"];
          to_e164?: string;
          template_key?: string | null;
          language?: Database["public"]["Enums"]["language_code"] | null;
          body_rendered?: string;
          status?: Database["public"]["Enums"]["message_status"];
          provider?: string | null;
          provider_message_id?: string | null;
          error_code?: string | null;
          error_detail?: string | null;
          scheduled_for?: string | null;
          sent_at?: string | null;
          delivered_at?: string | null;
          read_at?: string | null;
          failed_at?: string | null;
          cost_paise?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_batch_item_id_fkey";
            columns: ["batch_item_id"];
            isOneToOne: false;
            referencedRelation: "reschedule_batch_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          clinic_id: string | null;
          audience: string;
          kind: string;
          to_email: string;
          to_name: string | null;
          payload: Json;
          dedupe_key: string;
          status: string;
          attempts: number;
          last_error: string | null;
          provider_message_id: string | null;
          send_after: string;
          created_at: string;
          sent_at: string | null;
        };
        Insert: {
          id?: string;
          clinic_id?: string | null;
          audience: string;
          kind: string;
          to_email: string;
          to_name?: string | null;
          payload?: Json;
          dedupe_key: string;
          status?: string;
          attempts?: number;
          last_error?: string | null;
          provider_message_id?: string | null;
          send_after?: string;
          created_at?: string;
          sent_at?: string | null;
        };
        Update: {
          id?: string;
          clinic_id?: string | null;
          audience?: string;
          kind?: string;
          to_email?: string;
          to_name?: string | null;
          payload?: Json;
          dedupe_key?: string;
          status?: string;
          attempts?: number;
          last_error?: string | null;
          provider_message_id?: string | null;
          send_after?: string;
          created_at?: string;
          sent_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      patient_access_tokens: {
        Row: {
          id: string;
          clinic_id: string;
          patient_id: string;
          token_hash: string;
          label: string | null;
          issued_by: string | null;
          issued_via: Database["public"]["Enums"]["message_channel"] | null;
          expires_at: string;
          last_used_at: string | null;
          use_count: number;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          patient_id: string;
          token_hash: string;
          label?: string | null;
          issued_by?: string | null;
          issued_via?: Database["public"]["Enums"]["message_channel"] | null;
          expires_at: string;
          last_used_at?: string | null;
          use_count?: number;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          patient_id?: string;
          token_hash?: string;
          label?: string | null;
          issued_by?: string | null;
          issued_via?: Database["public"]["Enums"]["message_channel"] | null;
          expires_at?: string;
          last_used_at?: string | null;
          use_count?: number;
          revoked_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "patient_access_tokens_issued_by_fkey";
            columns: ["issued_by"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patient_access_tokens_patient_id_clinic_id_fkey";
            columns: ["patient_id", "clinic_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id", "clinic_id"];
          },
        ];
      };
      patient_conditions: {
        Row: {
          id: string;
          clinic_id: string;
          patient_id: string;
          condition: string;
          icd10_code: string | null;
          status: Database["public"]["Enums"]["condition_status"];
          onset_date: string | null;
          resolved_date: string | null;
          noted_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          patient_id: string;
          condition: string;
          icd10_code?: string | null;
          status?: Database["public"]["Enums"]["condition_status"];
          onset_date?: string | null;
          resolved_date?: string | null;
          noted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          patient_id?: string;
          condition?: string;
          icd10_code?: string | null;
          status?: Database["public"]["Enums"]["condition_status"];
          onset_date?: string | null;
          resolved_date?: string | null;
          noted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "patient_conditions_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patient_conditions_noted_by_fkey";
            columns: ["noted_by"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patient_conditions_patient_id_clinic_id_fkey";
            columns: ["patient_id", "clinic_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id", "clinic_id"];
          },
        ];
      };
      patient_invoice_items: {
        Row: {
          id: string;
          invoice_id: string;
          service_id: string | null;
          description: string;
          quantity: number;
          unit_price_paise: number;
          amount_paise: number;
          sort_order: number;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          service_id?: string | null;
          description: string;
          quantity?: number;
          unit_price_paise: number;
          sort_order?: number;
        };
        Update: {
          id?: string;
          invoice_id?: string;
          service_id?: string | null;
          description?: string;
          quantity?: number;
          unit_price_paise?: number;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "patient_invoice_items_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "patient_invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patient_invoice_items_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "clinic_services";
            referencedColumns: ["id"];
          },
        ];
      };
      patient_invoices: {
        Row: {
          id: string;
          clinic_id: string;
          patient_id: string;
          appointment_id: string | null;
          consultation_id: string | null;
          invoice_number: string;
          subtotal_paise: number;
          discount_paise: number;
          tax_paise: number;
          total_paise: number;
          status: Database["public"]["Enums"]["invoice_status"];
          payment_mode: Database["public"]["Enums"]["payment_mode"] | null;
          issued_at: string | null;
          paid_at: string | null;
          receipt_sent_message_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          patient_id: string;
          appointment_id?: string | null;
          consultation_id?: string | null;
          invoice_number: string;
          subtotal_paise?: number;
          discount_paise?: number;
          tax_paise?: number;
          total_paise?: number;
          status?: Database["public"]["Enums"]["invoice_status"];
          payment_mode?: Database["public"]["Enums"]["payment_mode"] | null;
          issued_at?: string | null;
          paid_at?: string | null;
          receipt_sent_message_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          patient_id?: string;
          appointment_id?: string | null;
          consultation_id?: string | null;
          invoice_number?: string;
          subtotal_paise?: number;
          discount_paise?: number;
          tax_paise?: number;
          total_paise?: number;
          status?: Database["public"]["Enums"]["invoice_status"];
          payment_mode?: Database["public"]["Enums"]["payment_mode"] | null;
          issued_at?: string | null;
          paid_at?: string | null;
          receipt_sent_message_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "patient_invoices_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patient_invoices_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patient_invoices_consultation_id_fkey";
            columns: ["consultation_id"];
            isOneToOne: false;
            referencedRelation: "consultations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patient_invoices_patient_id_clinic_id_fkey";
            columns: ["patient_id", "clinic_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id", "clinic_id"];
          },
          {
            foreignKeyName: "patient_invoices_receipt_sent_message_id_fkey";
            columns: ["receipt_sent_message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
        ];
      };
      patient_vaccinations: {
        Row: {
          id: string;
          clinic_id: string;
          patient_id: string;
          vaccine_code: string;
          dose_number: number;
          due_date: string | null;
          administered_at: string | null;
          administered_by: string | null;
          batch_no: string | null;
          status: Database["public"]["Enums"]["vaccination_status"];
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          patient_id: string;
          vaccine_code: string;
          dose_number?: number;
          due_date?: string | null;
          administered_at?: string | null;
          administered_by?: string | null;
          batch_no?: string | null;
          status?: Database["public"]["Enums"]["vaccination_status"];
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          patient_id?: string;
          vaccine_code?: string;
          dose_number?: number;
          due_date?: string | null;
          administered_at?: string | null;
          administered_by?: string | null;
          batch_no?: string | null;
          status?: Database["public"]["Enums"]["vaccination_status"];
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "patient_vaccinations_administered_by_fkey";
            columns: ["administered_by"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patient_vaccinations_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patient_vaccinations_patient_id_clinic_id_fkey";
            columns: ["patient_id", "clinic_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id", "clinic_id"];
          },
          {
            foreignKeyName: "patient_vaccinations_vaccine_code_fkey";
            columns: ["vaccine_code"];
            isOneToOne: false;
            referencedRelation: "vaccine_catalogue";
            referencedColumns: ["code"];
          },
        ];
      };
      patients: {
        Row: {
          id: string;
          clinic_id: string;
          full_name: string;
          phone_e164: string;
          alt_phone_e164: string | null;
          date_of_birth: string | null;
          approx_age_years: number | null;
          sex: Database["public"]["Enums"]["sex"];
          preferred_language: Database["public"]["Enums"]["language_code"];
          address_line: string | null;
          landmark: string | null;
          notes: string | null;
          is_blocked: boolean;
          first_seen_via: Database["public"]["Enums"]["booking_source"];
          created_at: string;
          updated_at: string;
          auth_user_id: string | null;
          account_created_at: string | null;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          full_name: string;
          phone_e164: string;
          alt_phone_e164?: string | null;
          date_of_birth?: string | null;
          approx_age_years?: number | null;
          sex?: Database["public"]["Enums"]["sex"];
          preferred_language?: Database["public"]["Enums"]["language_code"];
          address_line?: string | null;
          landmark?: string | null;
          notes?: string | null;
          is_blocked?: boolean;
          first_seen_via?: Database["public"]["Enums"]["booking_source"];
          created_at?: string;
          updated_at?: string;
          auth_user_id?: string | null;
          account_created_at?: string | null;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          full_name?: string;
          phone_e164?: string;
          alt_phone_e164?: string | null;
          date_of_birth?: string | null;
          approx_age_years?: number | null;
          sex?: Database["public"]["Enums"]["sex"];
          preferred_language?: Database["public"]["Enums"]["language_code"];
          address_line?: string | null;
          landmark?: string | null;
          notes?: string | null;
          is_blocked?: boolean;
          first_seen_via?: Database["public"]["Enums"]["booking_source"];
          created_at?: string;
          updated_at?: string;
          auth_user_id?: string | null;
          account_created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "patients_auth_user_id_fkey";
            columns: ["auth_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patients_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_events: {
        Row: {
          id: string;
          provider_event_id: string | null;
          event_type: string | null;
          signature_ok: boolean;
          razorpay_payment_id: string | null;
          razorpay_order_id: string | null;
          razorpay_refund_id: string | null;
          amount_paise: number | null;
          payload: Json | null;
          outcome: string | null;
          received_at: string;
        };
        Insert: {
          id?: string;
          provider_event_id?: string | null;
          event_type?: string | null;
          signature_ok: boolean;
          razorpay_payment_id?: string | null;
          razorpay_order_id?: string | null;
          razorpay_refund_id?: string | null;
          amount_paise?: number | null;
          payload?: Json | null;
          outcome?: string | null;
          received_at?: string;
        };
        Update: {
          id?: string;
          provider_event_id?: string | null;
          event_type?: string | null;
          signature_ok?: boolean;
          razorpay_payment_id?: string | null;
          razorpay_order_id?: string | null;
          razorpay_refund_id?: string | null;
          amount_paise?: number | null;
          payload?: Json | null;
          outcome?: string | null;
          received_at?: string;
        };
        Relationships: [];
      };
      payment_exceptions: {
        Row: {
          id: string;
          kind: string;
          status: string;
          clinic_id: string | null;
          payment_id: string | null;
          razorpay_payment_id: string | null;
          razorpay_order_id: string | null;
          amount_paise: number | null;
          details: Json;
          detected_at: string;
          resolved_by: string | null;
          resolved_at: string | null;
          resolution: string | null;
        };
        Insert: {
          id?: string;
          kind: string;
          status?: string;
          clinic_id?: string | null;
          payment_id?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_order_id?: string | null;
          amount_paise?: number | null;
          details?: Json;
          detected_at?: string;
          resolved_by?: string | null;
          resolved_at?: string | null;
          resolution?: string | null;
        };
        Update: {
          id?: string;
          kind?: string;
          status?: string;
          clinic_id?: string | null;
          payment_id?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_order_id?: string | null;
          amount_paise?: number | null;
          details?: Json;
          detected_at?: string;
          resolved_by?: string | null;
          resolved_at?: string | null;
          resolution?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payment_exceptions_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_exceptions_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "subscription_payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_exceptions_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "platform_admins";
            referencedColumns: ["user_id"];
          },
        ];
      };
      plans: {
        Row: {
          code: Database["public"]["Enums"]["plan_code"];
          name: string;
          monthly_price_paise: number;
          included_call_minutes: number;
          overage_per_min_paise: number;
          max_doctors: number | null;
          features: Json;
          is_active: boolean;
          sort_order: number;
          yearly_price_paise: number | null;
        };
        Insert: {
          code: Database["public"]["Enums"]["plan_code"];
          name: string;
          monthly_price_paise: number;
          included_call_minutes?: number;
          overage_per_min_paise?: number;
          max_doctors?: number | null;
          features?: Json;
          is_active?: boolean;
          sort_order?: number;
          yearly_price_paise?: number | null;
        };
        Update: {
          code?: Database["public"]["Enums"]["plan_code"];
          name?: string;
          monthly_price_paise?: number;
          included_call_minutes?: number;
          overage_per_min_paise?: number;
          max_doctors?: number | null;
          features?: Json;
          is_active?: boolean;
          sort_order?: number;
          yearly_price_paise?: number | null;
        };
        Relationships: [];
      };
      platform_admins: {
        Row: {
          user_id: string;
          role: Database["public"]["Enums"]["platform_admin_role"];
          full_name: string;
          created_at: string;
          created_by: string | null;
          disabled_at: string | null;
        };
        Insert: {
          user_id: string;
          role: Database["public"]["Enums"]["platform_admin_role"];
          full_name: string;
          created_at?: string;
          created_by?: string | null;
          disabled_at?: string | null;
        };
        Update: {
          user_id?: string;
          role?: Database["public"]["Enums"]["platform_admin_role"];
          full_name?: string;
          created_at?: string;
          created_by?: string | null;
          disabled_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "platform_admins_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "platform_admins";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "platform_admins_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_settings: {
        Row: {
          id: boolean;
          legal_name: string;
          address: string;
          state: string;
          state_code: string;
          gstin: string | null;
          pan: string | null;
          email: string;
          phone: string;
          sac_code: string;
          gst_rate_bps: number;
          refund_second_approval_paise: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: boolean;
          legal_name?: string;
          address?: string;
          state?: string;
          state_code?: string;
          gstin?: string | null;
          pan?: string | null;
          email?: string;
          phone?: string;
          sac_code?: string;
          gst_rate_bps?: number;
          refund_second_approval_paise?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: boolean;
          legal_name?: string;
          address?: string;
          state?: string;
          state_code?: string;
          gstin?: string | null;
          pan?: string | null;
          email?: string;
          phone?: string;
          sac_code?: string;
          gst_rate_bps?: number;
          refund_second_approval_paise?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "platform_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "platform_admins";
            referencedColumns: ["user_id"];
          },
        ];
      };
      prescription_items: {
        Row: {
          id: string;
          prescription_id: string;
          drug_name: string;
          strength: string | null;
          form: string | null;
          dosage: string | null;
          frequency: string | null;
          duration_days: number | null;
          instructions_en: string | null;
          instructions_te: string | null;
          sort_order: number;
        };
        Insert: {
          id?: string;
          prescription_id: string;
          drug_name: string;
          strength?: string | null;
          form?: string | null;
          dosage?: string | null;
          frequency?: string | null;
          duration_days?: number | null;
          instructions_en?: string | null;
          instructions_te?: string | null;
          sort_order?: number;
        };
        Update: {
          id?: string;
          prescription_id?: string;
          drug_name?: string;
          strength?: string | null;
          form?: string | null;
          dosage?: string | null;
          frequency?: string | null;
          duration_days?: number | null;
          instructions_en?: string | null;
          instructions_te?: string | null;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "prescription_items_prescription_id_fkey";
            columns: ["prescription_id"];
            isOneToOne: false;
            referencedRelation: "prescriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      prescriptions: {
        Row: {
          id: string;
          clinic_id: string;
          consultation_id: string | null;
          patient_id: string;
          doctor_id: string;
          issued_at: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          consultation_id?: string | null;
          patient_id: string;
          doctor_id: string;
          issued_at?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          consultation_id?: string | null;
          patient_id?: string;
          doctor_id?: string;
          issued_at?: string;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prescriptions_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prescriptions_consultation_id_fkey";
            columns: ["consultation_id"];
            isOneToOne: false;
            referencedRelation: "consultations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prescriptions_doctor_id_clinic_id_fkey";
            columns: ["doctor_id", "clinic_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id", "clinic_id"];
          },
          {
            foreignKeyName: "prescriptions_patient_id_clinic_id_fkey";
            columns: ["patient_id", "clinic_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id", "clinic_id"];
          },
        ];
      };
      record_access_log: {
        Row: {
          id: string;
          clinic_id: string;
          patient_id: string;
          actor_type: Database["public"]["Enums"]["actor_type"];
          actor_user_id: string;
          record_type: string;
          request_id: string | null;
          accessed_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          patient_id: string;
          actor_type: Database["public"]["Enums"]["actor_type"];
          actor_user_id: string;
          record_type: string;
          request_id?: string | null;
          accessed_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          patient_id?: string;
          actor_type?: Database["public"]["Enums"]["actor_type"];
          actor_user_id?: string;
          record_type?: string;
          request_id?: string | null;
          accessed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "record_access_log_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "record_access_log_patient_id_clinic_id_fkey";
            columns: ["patient_id", "clinic_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id", "clinic_id"];
          },
        ];
      };
      refund_requests: {
        Row: {
          id: string;
          clinic_id: string;
          payment_id: string;
          amount_paise: number;
          revoke_period: boolean;
          reason: string;
          requested_by: string;
          requested_at: string;
          status: string;
          decided_by: string | null;
          decided_at: string | null;
          decision_note: string | null;
          refund_id: string | null;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          payment_id: string;
          amount_paise: number;
          revoke_period: boolean;
          reason: string;
          requested_by: string;
          requested_at?: string;
          status?: string;
          decided_by?: string | null;
          decided_at?: string | null;
          decision_note?: string | null;
          refund_id?: string | null;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          payment_id?: string;
          amount_paise?: number;
          revoke_period?: boolean;
          reason?: string;
          requested_by?: string;
          requested_at?: string;
          status?: string;
          decided_by?: string | null;
          decided_at?: string | null;
          decision_note?: string | null;
          refund_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "refund_requests_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refund_requests_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "platform_admins";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "refund_requests_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: true;
            referencedRelation: "subscription_payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refund_requests_refund_id_fkey";
            columns: ["refund_id"];
            isOneToOne: true;
            referencedRelation: "refunds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refund_requests_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "platform_admins";
            referencedColumns: ["user_id"];
          },
        ];
      };
      refunds: {
        Row: {
          id: string;
          clinic_id: string;
          payment_id: string;
          razorpay_refund_id: string | null;
          amount_paise: number;
          reason: string;
          revoked_period: boolean;
          status: string;
          requested_by: string;
          created_at: string;
          processed_at: string | null;
          approved_by: string | null;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          payment_id: string;
          razorpay_refund_id?: string | null;
          amount_paise: number;
          reason: string;
          revoked_period?: boolean;
          status?: string;
          requested_by: string;
          created_at?: string;
          processed_at?: string | null;
          approved_by?: string | null;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          payment_id?: string;
          razorpay_refund_id?: string | null;
          amount_paise?: number;
          reason?: string;
          revoked_period?: boolean;
          status?: string;
          requested_by?: string;
          created_at?: string;
          processed_at?: string | null;
          approved_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "refunds_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "platform_admins";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "refunds_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refunds_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "subscription_payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refunds_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "platform_admins";
            referencedColumns: ["user_id"];
          },
        ];
      };
      reschedule_batch_items: {
        Row: {
          id: string;
          clinic_id: string;
          batch_id: string;
          appointment_id: string;
          patient_id: string;
          status: Database["public"]["Enums"]["batch_item_status"];
          new_appointment_id: string | null;
          message_id: string | null;
          attempts: number;
          last_error: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          batch_id: string;
          appointment_id: string;
          patient_id: string;
          status?: Database["public"]["Enums"]["batch_item_status"];
          new_appointment_id?: string | null;
          message_id?: string | null;
          attempts?: number;
          last_error?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          batch_id?: string;
          appointment_id?: string;
          patient_id?: string;
          status?: Database["public"]["Enums"]["batch_item_status"];
          new_appointment_id?: string | null;
          message_id?: string | null;
          attempts?: number;
          last_error?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reschedule_batch_items_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reschedule_batch_items_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "reschedule_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reschedule_batch_items_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reschedule_batch_items_message_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reschedule_batch_items_new_appointment_id_fkey";
            columns: ["new_appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reschedule_batch_items_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      reschedule_batches: {
        Row: {
          id: string;
          clinic_id: string;
          doctor_id: string;
          time_off_id: string | null;
          window_start: string;
          window_end: string;
          status: Database["public"]["Enums"]["batch_status"];
          reason_note: string | null;
          total_affected: number;
          notified_count: number;
          rebooked_count: number;
          created_by: string | null;
          dispatched_by: string | null;
          dispatched_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          doctor_id: string;
          time_off_id?: string | null;
          window_start: string;
          window_end: string;
          status?: Database["public"]["Enums"]["batch_status"];
          reason_note?: string | null;
          total_affected?: number;
          notified_count?: number;
          rebooked_count?: number;
          created_by?: string | null;
          dispatched_by?: string | null;
          dispatched_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          doctor_id?: string;
          time_off_id?: string | null;
          window_start?: string;
          window_end?: string;
          status?: Database["public"]["Enums"]["batch_status"];
          reason_note?: string | null;
          total_affected?: number;
          notified_count?: number;
          rebooked_count?: number;
          created_by?: string | null;
          dispatched_by?: string | null;
          dispatched_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reschedule_batches_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reschedule_batches_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reschedule_batches_dispatched_by_fkey";
            columns: ["dispatched_by"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reschedule_batches_doctor_id_fkey";
            columns: ["doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reschedule_batches_time_off_id_fkey";
            columns: ["time_off_id"];
            isOneToOne: false;
            referencedRelation: "doctor_time_off";
            referencedColumns: ["id"];
          },
        ];
      };
      security_events: {
        Row: {
          id: string;
          kind: string;
          actor_user_id: string | null;
          clinic_id: string | null;
          ip: string | null;
          method: string | null;
          path: string | null;
          details: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          kind: string;
          actor_user_id?: string | null;
          clinic_id?: string | null;
          ip?: string | null;
          method?: string | null;
          path?: string | null;
          details?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          kind?: string;
          actor_user_id?: string | null;
          clinic_id?: string | null;
          ip?: string | null;
          method?: string | null;
          path?: string | null;
          details?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "security_events_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_profiles: {
        Row: {
          id: string;
          full_name: string;
          phone_e164: string | null;
          avatar_url: string | null;
          locale: Database["public"]["Enums"]["language_code"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          phone_e164?: string | null;
          avatar_url?: string | null;
          locale?: Database["public"]["Enums"]["language_code"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          phone_e164?: string | null;
          avatar_url?: string | null;
          locale?: Database["public"]["Enums"]["language_code"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      subscription_invoices: {
        Row: {
          id: string;
          clinic_id: string;
          subscription_id: string;
          period_start: string;
          period_end: string;
          base_paise: number;
          overage_minutes: number;
          overage_paise: number;
          tax_paise: number;
          total_paise: number;
          status: Database["public"]["Enums"]["invoice_status"];
          issued_at: string | null;
          paid_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          subscription_id: string;
          period_start: string;
          period_end: string;
          base_paise: number;
          overage_minutes?: number;
          overage_paise?: number;
          tax_paise?: number;
          total_paise: number;
          status?: Database["public"]["Enums"]["invoice_status"];
          issued_at?: string | null;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          subscription_id?: string;
          period_start?: string;
          period_end?: string;
          base_paise?: number;
          overage_minutes?: number;
          overage_paise?: number;
          tax_paise?: number;
          total_paise?: number;
          status?: Database["public"]["Enums"]["invoice_status"];
          issued_at?: string | null;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscription_invoices_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscription_invoices_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      subscription_payments: {
        Row: {
          id: string;
          clinic_id: string;
          subscription_id: string;
          billing_cycle: string;
          amount_paise: number;
          razorpay_order_id: string;
          razorpay_payment_id: string | null;
          status: string;
          period_start: string | null;
          period_end: string | null;
          created_by: string | null;
          created_at: string;
          paid_at: string | null;
          captured_paise: number | null;
          refunded_paise: number;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          subscription_id: string;
          billing_cycle: string;
          amount_paise: number;
          razorpay_order_id: string;
          razorpay_payment_id?: string | null;
          status?: string;
          period_start?: string | null;
          period_end?: string | null;
          created_by?: string | null;
          created_at?: string;
          paid_at?: string | null;
          captured_paise?: number | null;
          refunded_paise?: number;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          subscription_id?: string;
          billing_cycle?: string;
          amount_paise?: number;
          razorpay_order_id?: string;
          razorpay_payment_id?: string | null;
          status?: string;
          period_start?: string | null;
          period_end?: string | null;
          created_by?: string | null;
          created_at?: string;
          paid_at?: string | null;
          captured_paise?: number | null;
          refunded_paise?: number;
        };
        Relationships: [
          {
            foreignKeyName: "subscription_payments_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscription_payments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscription_payments_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          id: string;
          clinic_id: string;
          plan_code: Database["public"]["Enums"]["plan_code"];
          status: Database["public"]["Enums"]["subscription_status"];
          started_at: string;
          trial_ends_at: string | null;
          current_period_start: string;
          current_period_end: string;
          cancel_at: string | null;
          cancelled_at: string | null;
          billing_email: string | null;
          created_at: string;
          updated_at: string;
          billing_cycle: string | null;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          plan_code: Database["public"]["Enums"]["plan_code"];
          status?: Database["public"]["Enums"]["subscription_status"];
          started_at?: string;
          trial_ends_at?: string | null;
          current_period_start?: string;
          current_period_end: string;
          cancel_at?: string | null;
          cancelled_at?: string | null;
          billing_email?: string | null;
          created_at?: string;
          updated_at?: string;
          billing_cycle?: string | null;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          plan_code?: Database["public"]["Enums"]["plan_code"];
          status?: Database["public"]["Enums"]["subscription_status"];
          started_at?: string;
          trial_ends_at?: string | null;
          current_period_start?: string;
          current_period_end?: string;
          cancel_at?: string | null;
          cancelled_at?: string | null;
          billing_email?: string | null;
          created_at?: string;
          updated_at?: string;
          billing_cycle?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: true;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_plan_code_fkey";
            columns: ["plan_code"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["code"];
          },
        ];
      };
      support_access_grants: {
        Row: {
          id: string;
          clinic_id: string;
          granted_by: string;
          reason: string;
          created_at: string;
          expires_at: string;
          revoked_at: string | null;
          revoked_by: string | null;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          granted_by: string;
          reason: string;
          created_at?: string;
          expires_at: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          granted_by?: string;
          reason?: string;
          created_at?: string;
          expires_at?: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "support_access_grants_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "support_access_grants_granted_by_fkey";
            columns: ["granted_by"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "support_access_grants_revoked_by_fkey";
            columns: ["revoked_by"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      usage_events: {
        Row: {
          id: string;
          clinic_id: string;
          call_id: string | null;
          message_id: string | null;
          kind: Database["public"]["Enums"]["usage_kind"];
          provider: string;
          quantity: number;
          unit_cost_micro_inr: number;
          cost_micro_inr: number;
          occurred_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          call_id?: string | null;
          message_id?: string | null;
          kind: Database["public"]["Enums"]["usage_kind"];
          provider: string;
          quantity: number;
          unit_cost_micro_inr: number;
          occurred_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          call_id?: string | null;
          message_id?: string | null;
          kind?: Database["public"]["Enums"]["usage_kind"];
          provider?: string;
          quantity?: number;
          unit_cost_micro_inr?: number;
          occurred_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "usage_events_call_id_fkey";
            columns: ["call_id"];
            isOneToOne: false;
            referencedRelation: "calls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "usage_events_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "usage_events_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
        ];
      };
      vaccine_catalogue: {
        Row: {
          code: string;
          name: string;
          description: string | null;
          recommended_age_weeks: number | null;
          dose_number: number;
          is_active: boolean;
          sort_order: number;
        };
        Insert: {
          code: string;
          name: string;
          description?: string | null;
          recommended_age_weeks?: number | null;
          dose_number?: number;
          is_active?: boolean;
          sort_order?: number;
        };
        Update: {
          code?: string;
          name?: string;
          description?: string | null;
          recommended_age_weeks?: number | null;
          dose_number?: number;
          is_active?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      v_call_costs: {
        Row: {
          call_id: string | null;
          clinic_id: string | null;
          started_at: string | null;
          duration_sec: number | null;
          outcome: Database["public"]["Enums"]["call_outcome"] | null;
          cost_micro_inr: number | null;
          cost_inr: number | null;
          stt_micro_inr: number | null;
          tts_micro_inr: number | null;
          llm_micro_inr: number | null;
          telephony_micro_inr: number | null;
        };
        Relationships: [];
      };
      v_call_metrics_daily: {
        Row: {
          clinic_id: string | null;
          day: string | null;
          total_calls: number | null;
          answered: number | null;
          recovered_missed: number | null;
          bookings: number | null;
          reschedules: number | null;
          escalations: number | null;
          telugu_calls: number | null;
          english_calls: number | null;
          avg_duration_sec: number | null;
          avg_stt_confidence: number | null;
        };
        Relationships: [];
      };
      v_clinic_monthly_usage: {
        Row: {
          clinic_id: string | null;
          month: string | null;
          total_cost_inr: number | null;
          call_minutes: number | null;
          billable_calls: number | null;
        };
        Relationships: [];
      };
      v_doctor_utilisation: {
        Row: {
          clinic_id: string | null;
          doctor_id: string | null;
          doctor_name: string | null;
          day: string | null;
          booked: number | null;
          completed: number | null;
          no_shows: number | null;
          cancellations: number | null;
          ai_booked: number | null;
        };
        Relationships: [];
      };
      v_open_action_items: {
        Row: {
          id: string | null;
          clinic_id: string | null;
          type: Database["public"]["Enums"]["action_type"] | null;
          severity: Database["public"]["Enums"]["action_severity"] | null;
          status: Database["public"]["Enums"]["action_status"] | null;
          title: string | null;
          description: string | null;
          due_by: string | null;
          created_at: string | null;
          assigned_to: string | null;
          related_appointment_id: string | null;
          related_call_id: string | null;
          related_batch_id: string | null;
          doctor_name: string | null;
          patient_name: string | null;
          patient_phone: string | null;
          total_affected: number | null;
          notified_count: number | null;
          rebooked_count: number | null;
          batch_status: Database["public"]["Enums"]["batch_status"] | null;
          is_overdue: boolean | null;
        };
        Relationships: [];
      };
      v_patient_appointments: {
        Row: {
          id: string | null;
          clinic_id: string | null;
          patient_id: string | null;
          starts_at: string | null;
          ends_at: string | null;
          duration_min: number | null;
          status: Database["public"]["Enums"]["appointment_status"] | null;
          reason: string | null;
          token_number: number | null;
          cancelled_at: string | null;
          confirmed_at: string | null;
          doctor_name: string | null;
          doctor_specialty: string | null;
          doctor_colour: string | null;
          consult_fee_paise: number | null;
          clinic_name: string | null;
          clinic_phone: string | null;
          address_line: string | null;
          landmark: string | null;
          city: string | null;
          map_url: string | null;
          timezone: string | null;
        };
        Relationships: [];
      };
      v_patient_medical_history: {
        Row: {
          id: string | null;
          clinic_id: string | null;
          patient_id: string | null;
          appointment_id: string | null;
          chief_complaint: string | null;
          diagnosis_text: string | null;
          advice: string | null;
          follow_up_days: number | null;
          finalised_at: string | null;
          visited_at: string | null;
          doctor_name: string | null;
          doctor_specialty: string | null;
          doctor_colour: string | null;
        };
        Relationships: [];
      };
      v_patient_prescriptions: {
        Row: {
          id: string | null;
          clinic_id: string | null;
          patient_id: string | null;
          consultation_id: string | null;
          issued_at: string | null;
          notes: string | null;
          doctor_name: string | null;
          items: Json | null;
        };
        Relationships: [];
      };
      v_todays_appointments: {
        Row: {
          id: string | null;
          clinic_id: string | null;
          starts_at: string | null;
          ends_at: string | null;
          status: Database["public"]["Enums"]["appointment_status"] | null;
          source: Database["public"]["Enums"]["booking_source"] | null;
          reason: string | null;
          token_number: number | null;
          local_time: string | null;
          doctor_id: string | null;
          doctor_name: string | null;
          colour_hex: string | null;
          patient_id: string | null;
          patient_name: string | null;
          phone_e164: string | null;
          preferred_language: Database["public"]["Enums"]["language_code"] | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      activate_paid_subscription: {
        Args: {
          p_order_id: string;
          p_payment_id: string;
          p_captured_paise: number;
        };
        Returns: Database["public"]["Tables"]["subscription_payments"]["Row"];
      };
      admin_adjust_subscription: {
        Args: {
          p_clinic_id: string;
          p_action: string;
          p_days: number;
          p_note: string;
          p_admin_id: string;
          p_request_id?: string;
        };
        Returns: Database["public"]["Tables"]["subscriptions"]["Row"];
      };
      admin_clinic_signals: {
        Args: Record<string, never>;
        Returns: { id: string; name: string; city: string; verification_status: Database["public"]["Enums"]["clinic_verification_status"]; subscription_status: Database["public"]["Enums"]["subscription_status"]; current_period_end: string; ever_paid: boolean; bookings_14d: number; bookings_prev_14d: number; open_actions: number; oldest_action_at: string; last_staff_sign_in: string; created_at: string }[];
      };
      admin_clinic_summaries: {
        Args: Record<string, never>;
        Returns: { id: string; name: string; city: string; verification_status: Database["public"]["Enums"]["clinic_verification_status"]; created_at: string; subscription_status: Database["public"]["Enums"]["subscription_status"]; billing_cycle: string; current_period_end: string; is_live: boolean; staff: number; patients: number; appointments_30d: number; ai_bookings_30d: number; last_appointment_at: string; paid_total_paise: number }[];
      };
      admin_decide_refund_request: {
        Args: {
          p_request: string;
          p_action: string;
          p_note: string;
          p_admin_id: string;
          p_request_id?: string;
        };
        Returns: Database["public"]["Tables"]["refund_requests"]["Row"];
      };
      admin_log_support_access: {
        Args: {
          p_admin_id: string;
          p_clinic: string;
          p_patient: string;
          p_query: string;
          p_request_id?: string;
        };
        Returns: Database["public"]["Tables"]["support_access_grants"]["Row"];
      };
      admin_monthly_metrics: {
        Args: {
          p_months?: number;
        };
        Returns: { month: string; new_clinics: number; approved: number; first_payments: number; collected_paise: number; refunded_paise: number; mrr_paise: number; paying_clinics: number; new_patients: number; appointments: number; ai_bookings: number; completed: number; no_shows: number }[];
      };
      admin_record_refund: {
        Args: {
          p_payment_id: string;
          p_razorpay_refund_id: string;
          p_amount: number;
          p_status: string;
          p_revoke_period: boolean;
          p_reason: string;
          p_admin_id: string;
          p_request_id?: string;
          p_refund_request?: string;
        };
        Returns: Database["public"]["Tables"]["refunds"]["Row"];
      };
      admin_request_refund: {
        Args: {
          p_payment_id: string;
          p_amount: number;
          p_revoke_period: boolean;
          p_reason: string;
          p_admin_id: string;
          p_request_id?: string;
        };
        Returns: Database["public"]["Tables"]["refund_requests"]["Row"];
      };
      admin_resolve_payment_exception: {
        Args: {
          p_exception_id: string;
          p_status: string;
          p_resolution: string;
          p_admin_id: string;
          p_request_id?: string;
        };
        Returns: Database["public"]["Tables"]["payment_exceptions"]["Row"];
      };
      admin_review_clinic: {
        Args: {
          p_clinic_id: string;
          p_decision: string;
          p_note: string;
          p_admin_id: string;
          p_request_id?: string;
        };
        Returns: Database["public"]["Tables"]["clinics"]["Row"];
      };
      admin_update_platform_settings: {
        Args: {
          p_changes: Json;
          p_admin_id: string;
          p_request_id?: string;
        };
        Returns: Database["public"]["Tables"]["platform_settings"]["Row"];
      };
      book_appointment: {
        Args: {
          p_clinic_id: string;
          p_doctor_id: string;
          p_patient_name: string;
          p_phone_e164: string;
          p_starts_at: string;
          p_reason?: string;
          p_call_id?: string;
          p_source?: Database["public"]["Enums"]["booking_source"];
          p_language?: Database["public"]["Enums"]["language_code"];
        };
        Returns: Database["public"]["Tables"]["appointments"]["Row"];
      };
      cancel_appointment: {
        Args: {
          p_appointment_id: string;
          p_actor?: Database["public"]["Enums"]["actor_type"];
          p_reason?: string;
          p_call_id?: string;
        };
        Returns: Database["public"]["Tables"]["appointments"]["Row"];
      };
      claim_notifications: {
        Args: {
          p_limit?: number;
        };
        Returns: Database["public"]["Tables"]["notifications"]["Row"][];
      };
      claim_patient_account: {
        Args: {
          p_patient_id: string;
          p_auth_user_id: string;
        };
        Returns: Database["public"]["Tables"]["patients"]["Row"];
      };
      create_clinic_with_trial: {
        Args: {
          p_name: string;
          p_city: string;
          p_phone: string;
        };
        Returns: string;
      };
      enqueue_scheduled_notifications: {
        Args: Record<string, never>;
        Returns: number;
      };
      enqueue_security_alerts: {
        Args: Record<string, never>;
        Returns: number;
      };
      expire_unverified_bookings: {
        Args: Record<string, never>;
        Returns: number;
      };
      finish_notification: {
        Args: {
          p_id: string;
          p_ok: boolean;
          p_message_id: string;
          p_error: string;
        };
        Returns: undefined;
      };
      get_available_slots: {
        Args: {
          p_doctor_id: string;
          p_date: string;
        };
        Returns: { slot_start: string; slot_end: string; remaining: number }[];
      };
      grant_support_access: {
        Args: {
          p_clinic: string;
          p_hours: number;
          p_reason: string;
        };
        Returns: Database["public"]["Tables"]["support_access_grants"]["Row"];
      };
      issue_missing_invoices: {
        Args: Record<string, never>;
        Returns: number;
      };
      job_health: {
        Args: Record<string, never>;
        Returns: { job: string; last_ok_at: string; minutes_since_ok: number; last_error: string; last_source: string }[];
      };
      log_call_access: {
        Args: {
          p_call_id: string;
          p_request_id?: string;
        };
        Returns: boolean;
      };
      log_record_access: {
        Args: {
          p_patient_id: string;
          p_record_type: string;
          p_request_id?: string;
        };
        Returns: undefined;
      };
      public_clinic_by_slug: {
        Args: {
          p_slug: string;
        };
        Returns: { id: string; live: boolean; requests_enabled: boolean }[];
      };
      purge_expired_transcripts: {
        Args: {
          p_limit?: number;
        };
        Returns: number;
      };
      record_job_run: {
        Args: {
          p_job: string;
          p_ok: boolean;
          p_error?: string;
          p_source?: string;
        };
        Returns: undefined;
      };
      record_payment_exception: {
        Args: {
          p_kind: string;
          p_payment_id: string;
          p_rzp_payment: string;
          p_rzp_order: string;
          p_amount: number;
          p_details: Json;
        };
        Returns: string;
      };
      request_public_booking: {
        Args: {
          p_clinic_id: string;
          p_doctor_id: string;
          p_name: string;
          p_phone: string;
          p_starts_at: string;
          p_reason?: string;
        };
        Returns: Database["public"]["Tables"]["appointments"]["Row"];
      };
      reschedule_appointment: {
        Args: {
          p_appointment_id: string;
          p_new_starts_at: string;
          p_new_doctor_id?: string;
          p_actor?: Database["public"]["Enums"]["actor_type"];
          p_call_id?: string;
        };
        Returns: Database["public"]["Tables"]["appointments"]["Row"];
      };
      resolve_patient_token: {
        Args: {
          p_token_hash: string;
        };
        Returns: { patient_id: string; clinic_id: string; token_id: string }[];
      };
      revoke_support_access: {
        Args: {
          p_grant: string;
        };
        Returns: Database["public"]["Tables"]["support_access_grants"]["Row"];
      };
      run_database_jobs: {
        Args: {
          p_source?: string;
        };
        Returns: Json;
      };
      set_appointment_status: {
        Args: {
          p_appointment_id: string;
          p_status: Database["public"]["Enums"]["appointment_status"];
        };
        Returns: Database["public"]["Tables"]["appointments"]["Row"];
      };
      submit_clinic_application: {
        Args: {
          p_name: string;
          p_address: string;
          p_city: string;
          p_pincode: string;
          p_phone: string;
          p_hfr_id: string;
          p_est_reg_no: string;
          p_reg_state: string;
          p_owner_reg_no: string;
          p_owner_council: string;
          p_gstin: string;
        };
        Returns: string;
      };
      update_clinic_application: {
        Args: {
          p_hfr_id: string;
          p_est_reg_no: string;
          p_reg_state: string;
          p_owner_reg_no: string;
          p_owner_council: string;
          p_gstin: string;
        };
        Returns: Database["public"]["Tables"]["clinics"]["Row"];
      };
    };
    Enums: {
      action_severity: "low" | "normal" | "high" | "urgent";
      action_status: "open" | "in_progress" | "resolved" | "dismissed";
      action_type: "reschedule_needed" | "unrecognised_caller" | "ai_escalation" | "low_confidence_call" | "failed_message" | "booking_conflict" | "missed_call_followup" | "online_request";
      actor_type: "ai" | "staff" | "patient" | "doctor" | "system" | "support";
      appointment_event: "created" | "confirmed" | "rescheduled" | "cancelled" | "checked_in" | "completed" | "no_show" | "flagged_for_reschedule" | "reminder_sent";
      appointment_status: "booked" | "confirmed" | "checked_in" | "completed" | "cancelled" | "no_show" | "needs_reschedule";
      batch_item_status: "pending" | "notified" | "rebooked" | "cancelled" | "unreachable";
      batch_status: "draft" | "notifying" | "completed" | "cancelled";
      booking_source: "ai_call" | "staff_manual" | "walk_in" | "whatsapp" | "web";
      call_direction: "inbound" | "outbound";
      call_intent: "book" | "reschedule" | "cancel" | "faq" | "emergency" | "other";
      call_outcome: "booked" | "rescheduled" | "cancelled" | "faq_answered" | "escalated" | "no_action" | "unresolved";
      call_status: "in_progress" | "completed" | "missed" | "abandoned" | "failed" | "transferred";
      care_task_status: "pending" | "sent" | "completed" | "skipped" | "failed";
      care_trigger: "after_appointment" | "chronic_medication" | "preventive_checkup" | "vaccination_due";
      clinic_verification_status: "submitted" | "under_review" | "needs_info" | "approved" | "rejected" | "suspended";
      condition_status: "active" | "chronic" | "resolved";
      faq_category: "fees" | "timings" | "location" | "services" | "doctors" | "insurance" | "preparation" | "other";
      invoice_status: "draft" | "issued" | "paid" | "partially_paid" | "void";
      language_code: "te" | "en" | "hi";
      member_status: "invited" | "active" | "suspended";
      message_channel: "whatsapp" | "sms" | "voice_callback";
      message_direction: "outbound" | "inbound";
      message_status: "queued" | "sending" | "sent" | "delivered" | "read" | "failed" | "undelivered";
      note_status: "draft" | "finalised";
      payment_mode: "cash" | "upi" | "card" | "netbanking" | "other";
      plan_code: "starter" | "growth" | "multi_branch";
      platform_admin_role: "super_admin" | "reviewer" | "finance" | "support" | "analyst";
      sex: "male" | "female" | "other" | "unknown";
      staff_role: "owner" | "manager" | "receptionist" | "doctor";
      subscription_status: "trialing" | "active" | "past_due" | "paused" | "cancelled";
      telephony_provider: "exotel" | "twilio" | "plivo" | "knowlarity" | "browser_demo";
      time_off_kind: "leave" | "emergency" | "conference" | "hours_change" | "clinic_closed";
      turn_role: "assistant" | "caller" | "system" | "tool";
      usage_kind: "stt_seconds" | "tts_characters" | "llm_input_tokens" | "llm_output_tokens" | "telephony_seconds" | "whatsapp_message" | "sms_message";
      vaccination_status: "due" | "administered" | "overdue" | "skipped";
    };
    CompositeTypes: Record<string, never>;
  };
};

// --- Convenience aliases -------------------------------------------------

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update'];
export type Views<T extends keyof PublicSchema['Views']> =
  PublicSchema['Views'][T]['Row'];
export type Enums<T extends keyof PublicSchema['Enums']> =
  PublicSchema['Enums'][T];
export type FunctionArgs<T extends keyof PublicSchema['Functions']> =
  PublicSchema['Functions'][T]['Args'];
export type FunctionReturns<T extends keyof PublicSchema['Functions']> =
  PublicSchema['Functions'][T]['Returns'];
