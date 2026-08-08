/**
 * Sub-task 8 — Agent trace data access.
 * Reads run/step traces written by the orchestrator. RLS scopes rows to the
 * signed-in learner (admins additionally see all rows).
 */

import { supabase } from "@/integrations/supabase/client";

export type AgentRun = {
  id: string;
  mode: string;
  question: string | null;
  final_answer: string | null;
  question_id: string | null;
  status: string;
  error: string | null;
  duration_ms: number | null;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AgentStep = {
  id: string;
  run_id: string;
  step_index: number;
  agent: string;
  role: string | null;
  model: string | null;
  input: unknown;
  output: unknown;
  status: string;
  error: string | null;
  duration_ms: number | null;
  prompt_tokens: number;
  completion_tokens: number;
  created_at: string;
};

export async function fetchAgentRuns(limit = 40): Promise<AgentRun[]> {
  const { data, error } = await supabase
    .from("agent_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as AgentRun[];
}

export async function fetchAgentSteps(runId: string): Promise<AgentStep[]> {
  const { data, error } = await supabase
    .from("agent_steps")
    .select("*")
    .eq("run_id", runId)
    .order("step_index", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as AgentStep[];
}
