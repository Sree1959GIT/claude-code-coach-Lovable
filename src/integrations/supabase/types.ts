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
      agent_eval_results: {
        Row: {
          agents: string[]
          answer: string | null
          completion_tokens: number
          created_at: string
          duration_ms: number | null
          error: string | null
          eval_id: string | null
          eval_run_id: string
          id: string
          intent: string | null
          issues: string[]
          missing_points: string[]
          name: string
          passed: boolean
          prompt_tokens: number
          score: number
        }
        Insert: {
          agents?: string[]
          answer?: string | null
          completion_tokens?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          eval_id?: string | null
          eval_run_id: string
          id?: string
          intent?: string | null
          issues?: string[]
          missing_points?: string[]
          name: string
          passed?: boolean
          prompt_tokens?: number
          score?: number
        }
        Update: {
          agents?: string[]
          answer?: string | null
          completion_tokens?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          eval_id?: string | null
          eval_run_id?: string
          id?: string
          intent?: string | null
          issues?: string[]
          missing_points?: string[]
          name?: string
          passed?: boolean
          prompt_tokens?: number
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_eval_results_eval_id_fkey"
            columns: ["eval_id"]
            isOneToOne: false
            referencedRelation: "agent_evals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_eval_results_eval_run_id_fkey"
            columns: ["eval_run_id"]
            isOneToOne: false
            referencedRelation: "agent_eval_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_eval_runs: {
        Row: {
          avg_score: number
          created_at: string
          duration_ms: number | null
          error: string | null
          failed: number
          id: string
          label: string
          passed: number
          status: string
          total: number
          triggered_by: string | null
          updated_at: string
        }
        Insert: {
          avg_score?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          failed?: number
          id?: string
          label?: string
          passed?: number
          status?: string
          total?: number
          triggered_by?: string | null
          updated_at?: string
        }
        Update: {
          avg_score?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          failed?: number
          id?: string
          label?: string
          passed?: number
          status?: string
          total?: number
          triggered_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      agent_evals: {
        Row: {
          created_at: string
          created_by: string | null
          expected_agents: string[]
          expected_intent: string | null
          expected_points: string[]
          id: string
          is_active: boolean
          name: string
          notes: string | null
          prompt: string
          question_id: string | null
          selected_option_label: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expected_agents?: string[]
          expected_intent?: string | null
          expected_points?: string[]
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          prompt: string
          question_id?: string | null
          selected_option_label?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expected_agents?: string[]
          expected_intent?: string | null
          expected_points?: string[]
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          prompt?: string
          question_id?: string | null
          selected_option_label?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_evals_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          created_at: string
          duration_ms: number | null
          error: string | null
          final_answer: string | null
          id: string
          metadata: Json
          mode: string
          question: string | null
          question_id: string | null
          status: string
          total_completion_tokens: number
          total_prompt_tokens: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          final_answer?: string | null
          id?: string
          metadata?: Json
          mode?: string
          question?: string | null
          question_id?: string | null
          status?: string
          total_completion_tokens?: number
          total_prompt_tokens?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          final_answer?: string | null
          id?: string
          metadata?: Json
          mode?: string
          question?: string | null
          question_id?: string | null
          status?: string
          total_completion_tokens?: number
          total_prompt_tokens?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_steps: {
        Row: {
          agent: string
          completion_tokens: number
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          input: Json | null
          model: string | null
          output: Json | null
          prompt_tokens: number
          role: string | null
          run_id: string
          status: string
          step_index: number
          user_id: string
        }
        Insert: {
          agent: string
          completion_tokens?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input?: Json | null
          model?: string | null
          output?: Json | null
          prompt_tokens?: number
          role?: string | null
          run_id: string
          status?: string
          step_index: number
          user_id: string
        }
        Update: {
          agent?: string
          completion_tokens?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input?: Json | null
          model?: string | null
          output?: Json | null
          prompt_tokens?: number
          role?: string | null
          run_id?: string
          status?: string
          step_index?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          path: string | null
          payload: Json
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          path?: string | null
          payload?: Json
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          path?: string | null
          payload?: Json
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      authoring_source_credentials: {
        Row: {
          auth_type: string
          created_at: string
          header_name: string | null
          id: string
          secret_value: string | null
          source_id: string
          updated_at: string
          updated_by: string | null
          username: string | null
        }
        Insert: {
          auth_type?: string
          created_at?: string
          header_name?: string | null
          id?: string
          secret_value?: string | null
          source_id: string
          updated_at?: string
          updated_by?: string | null
          username?: string | null
        }
        Update: {
          auth_type?: string
          created_at?: string
          header_name?: string | null
          id?: string
          secret_value?: string | null
          source_id?: string
          updated_at?: string
          updated_by?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "authoring_source_credentials_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: true
            referencedRelation: "authoring_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      authoring_sources: {
        Row: {
          created_at: string
          created_by: string | null
          domain_id: string | null
          enabled: boolean
          host: string
          id: string
          label: string
          last_checked_at: string | null
          last_status: string | null
          notes: string | null
          requires_auth: boolean
          subject: string
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          domain_id?: string | null
          enabled?: boolean
          host: string
          id?: string
          label: string
          last_checked_at?: string | null
          last_status?: string | null
          notes?: string | null
          requires_auth?: boolean
          subject?: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          domain_id?: string | null
          enabled?: boolean
          host?: string
          id?: string
          label?: string
          last_checked_at?: string | null
          last_status?: string | null
          notes?: string | null
          requires_auth?: boolean
          subject?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "authoring_sources_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reviews: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          id: string
          notes: string | null
          question_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          status: string
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          question_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          question_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_reviews_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_confidence: {
        Row: {
          created_at: string
          domain_id: string
          id: string
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          domain_id: string
          id?: string
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          domain_id?: string
          id?: string
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_confidence_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
        ]
      }
      domains: {
        Row: {
          created_at: string
          description: string | null
          id: string
          slug: string
          sort_order: number
          title: string
          weight: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          slug: string
          sort_order?: number
          title: string
          weight?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          slug?: string
          sort_order?: number
          title?: string
          weight?: number
        }
        Relationships: []
      }
      job_runs: {
        Row: {
          created_at: string
          details: Json
          duration_ms: number | null
          error: string | null
          id: string
          items_processed: number
          items_repaired: number
          job_name: string
          status: string
          summary: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          duration_ms?: number | null
          error?: string | null
          id?: string
          items_processed?: number
          items_repaired?: number
          job_name: string
          status?: string
          summary?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          duration_ms?: number | null
          error?: string | null
          id?: string
          items_processed?: number
          items_repaired?: number
          job_name?: string
          status?: string
          summary?: string | null
        }
        Relationships: []
      }
      library_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          token_count: number | null
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          token_count?: number | null
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "library_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "library_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      library_documents: {
        Row: {
          content_hash: string | null
          created_at: string
          id: string
          kind: string
          source: string
          tags: string[]
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          content_hash?: string | null
          created_at?: string
          id?: string
          kind?: string
          source: string
          tags?: string[]
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          content_hash?: string | null
          created_at?: string
          id?: string
          kind?: string
          source?: string
          tags?: string[]
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      practice_sessions: {
        Row: {
          created_at: string
          domain_id: string | null
          ended_at: string | null
          id: string
          metadata: Json
          mode: string
          started_at: string
          target_count: number
          time_limit_ms: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          domain_id?: string | null
          ended_at?: string | null
          id?: string
          metadata?: Json
          mode: string
          started_at?: string
          target_count?: number
          time_limit_ms?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          domain_id?: string | null
          ended_at?: string | null
          id?: string
          metadata?: Json
          mode?: string
          started_at?: string
          target_count?: number
          time_limit_ms?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_sessions_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      question_attempts: {
        Row: {
          created_at: string
          id: string
          is_correct: boolean
          question_id: string
          selected_option_id: string | null
          time_ms: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_correct: boolean
          question_id: string
          selected_option_id?: string | null
          time_ms?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_correct?: boolean
          question_id?: string
          selected_option_id?: string | null
          time_ms?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_attempts_selected_option_id_fkey"
            columns: ["selected_option_id"]
            isOneToOne: false
            referencedRelation: "question_options"
            referencedColumns: ["id"]
          },
        ]
      }
      question_citations: {
        Row: {
          chunk_id: string
          created_at: string
          document_id: string
          id: string
          question_id: string
          similarity: number
          source: string
        }
        Insert: {
          chunk_id: string
          created_at?: string
          document_id: string
          id?: string
          question_id: string
          similarity: number
          source?: string
        }
        Update: {
          chunk_id?: string
          created_at?: string
          document_id?: string
          id?: string
          question_id?: string
          similarity?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_citations_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "library_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_citations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "library_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_citations_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_drafts: {
        Row: {
          base_question_id: string | null
          citations: Json
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          created_by: string | null
          domain_id: string | null
          id: string
          iteration: number
          payload: Json
          rationale: string | null
          review_notes: string | null
          review_score: number | null
          run_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          base_question_id?: string | null
          citations?: Json
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          domain_id?: string | null
          id?: string
          iteration?: number
          payload: Json
          rationale?: string | null
          review_notes?: string | null
          review_score?: number | null
          run_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          base_question_id?: string | null
          citations?: Json
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          domain_id?: string | null
          id?: string
          iteration?: number
          payload?: Json
          rationale?: string | null
          review_notes?: string | null
          review_score?: number | null
          run_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_drafts_base_question_id_fkey"
            columns: ["base_question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_drafts_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_drafts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      question_embeddings: {
        Row: {
          content_hash: string
          created_at: string
          embedding: string
          model: string
          question_id: string
          updated_at: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          embedding: string
          model: string
          question_id: string
          updated_at?: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          embedding?: string
          model?: string
          question_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_embeddings_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_options: {
        Row: {
          explanation: string | null
          id: string
          is_correct: boolean
          label: string
          question_id: string
          sort_order: number
          text: string
        }
        Insert: {
          explanation?: string | null
          id?: string
          is_correct?: boolean
          label: string
          question_id: string
          sort_order?: number
          text: string
        }
        Update: {
          explanation?: string | null
          id?: string
          is_correct?: boolean
          label?: string
          question_id?: string
          sort_order?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          author_id: string | null
          calibrated_at: string | null
          calibrated_difficulty: string | null
          calibration_accuracy: number | null
          calibration_samples: number
          created_at: string
          difficulty: string
          domain_id: string
          id: string
          key_concept: string | null
          origin: string
          published_at: string | null
          scenario: string | null
          sort_order: number
          status: string
          stem: string
        }
        Insert: {
          author_id?: string | null
          calibrated_at?: string | null
          calibrated_difficulty?: string | null
          calibration_accuracy?: number | null
          calibration_samples?: number
          created_at?: string
          difficulty?: string
          domain_id: string
          id?: string
          key_concept?: string | null
          origin?: string
          published_at?: string | null
          scenario?: string | null
          sort_order?: number
          status?: string
          stem: string
        }
        Update: {
          author_id?: string | null
          calibrated_at?: string | null
          calibrated_difficulty?: string | null
          calibration_accuracy?: number | null
          calibration_samples?: number
          created_at?: string
          difficulty?: string
          domain_id?: string
          id?: string
          key_concept?: string | null
          origin?: string
          published_at?: string | null
          scenario?: string | null
          sort_order?: number
          status?: string
          stem?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
        ]
      }
      user_mastery: {
        Row: {
          created_at: string
          difficulty: number
          due_at: string | null
          id: string
          lapses: number
          last_attempt_at: string | null
          last_attempt_correct: boolean | null
          question_id: string
          reps: number
          stability: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          difficulty?: number
          due_at?: string | null
          id?: string
          lapses?: number
          last_attempt_at?: string | null
          last_attempt_correct?: boolean | null
          question_id: string
          reps?: number
          stability?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          difficulty?: number
          due_at?: string | null
          id?: string
          lapses?: number
          last_attempt_at?: string | null
          last_attempt_correct?: boolean | null
          question_id?: string
          reps?: number
          stability?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_mastery_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_citation_coverage: {
        Args: never
        Returns: {
          cited_questions: number
          coverage_pct: number
          domain_id: string
          domain_title: string
          total_questions: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      match_library_chunks: {
        Args: {
          match_count?: number
          min_similarity?: number
          query_embedding: string
        }
        Returns: {
          chunk_id: string
          chunk_index: number
          content: string
          document_id: string
          kind: string
          similarity: number
          source: string
          tags: string[]
          title: string
          url: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "pro" | "user" | "author" | "reviewer"
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
    Enums: {
      app_role: ["admin", "pro", "user", "author", "reviewer"],
    },
  },
} as const
