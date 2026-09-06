CREATE TABLE IF NOT EXISTS public.code_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language text NOT NULL,
  provider_id text,
  file_name text,
  ok boolean NOT NULL DEFAULT false,
  timed_out boolean NOT NULL DEFAULT false,
  cancelled boolean NOT NULL DEFAULT false,
  duration_ms integer NOT NULL DEFAULT 0,
  stdout_bytes integer NOT NULL DEFAULT 0,
  stderr_bytes integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.code_executions TO authenticated;
GRANT ALL ON public.code_executions TO service_role;

ALTER TABLE public.code_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own code executions" ON public.code_executions;
CREATE POLICY "Users can view their own code executions"
  ON public.code_executions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own code executions" ON public.code_executions;
CREATE POLICY "Users can insert their own code executions"
  ON public.code_executions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS code_executions_user_created_idx ON public.code_executions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.codebases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  concept_tag text NOT NULL,
  language text NOT NULL,
  difficulty text NOT NULL DEFAULT 'beginner',
  title text NOT NULL,
  description text,
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_codebases_concept_tag ON public.codebases (concept_tag);
CREATE INDEX IF NOT EXISTS idx_codebases_language ON public.codebases (language);

GRANT SELECT ON public.codebases TO anon;
GRANT SELECT ON public.codebases TO authenticated;
GRANT ALL ON public.codebases TO service_role;

ALTER TABLE public.codebases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Codebases are publicly readable" ON public.codebases;
CREATE POLICY "Codebases are publicly readable"
ON public.codebases FOR SELECT
TO anon, authenticated
USING (true);

INSERT INTO public.codebases (concept_tag, language, difficulty, title, description, files) VALUES
('agent_loop', 'python', 'beginner', 'Minimal Agent Loop', 'A tiny observe-think-act loop showing how an agent iterates with tools until it reaches a final answer.',
 jsonb_build_array(jsonb_build_object(
   'name', 'agent_loop.py',
   'language', 'python',
   'content', E'"""Minimal agent loop: observe -> think -> act -> repeat."""\n\nTOOLS = {\n    "add": lambda a, b: a + b,\n    "mul": lambda a, b: a * b,\n}\n\n\ndef think(state):\n    """Pick the next action. A real agent would call an LLM here."""\n    if state["step"] == 0:\n        return ("add", (2, 3))\n    if state["step"] == 1:\n        return ("mul", (state["last"], 4))\n    return None\n\n\ndef run(max_steps=5):\n    state = {"step": 0, "last": None, "trace": []}\n    while state["step"] < max_steps:\n        action = think(state)\n        if action is None:\n            break\n        name, args = action\n        result = TOOLS[name](*args)\n        state["trace"].append(f"{name}{args} -> {result}")\n        state["last"] = result\n        state["step"] += 1\n    return state\n\n\nfinal = run()\nfor line in final["trace"]:\n    print(line)\nprint("final answer:", final["last"])\n'
 ))),
('context_trim', 'javascript', 'intermediate', 'Context Window Trimming', 'Keeps a conversation under a token budget by preserving the system prompt and dropping the oldest turns first.',
 jsonb_build_array(jsonb_build_object(
   'name', 'contextTrim.js',
   'language', 'javascript',
   'content', E'// Trim a message list to fit a token budget.\n// Strategy: always keep the system prompt, then keep the newest turns.\n\nfunction estimateTokens(text) {\n  return Math.ceil(text.length / 4);\n}\n\nfunction trimContext(messages, budget) {\n  const system = messages.filter((m) => m.role === "system");\n  const rest = messages.filter((m) => m.role !== "system");\n\n  let used = system.reduce((n, m) => n + estimateTokens(m.content), 0);\n  const kept = [];\n\n  for (let i = rest.length - 1; i >= 0; i--) {\n    const cost = estimateTokens(rest[i].content);\n    if (used + cost > budget) break;\n    used += cost;\n    kept.unshift(rest[i]);\n  }\n\n  return { messages: [...system, ...kept], tokens: used, dropped: rest.length - kept.length };\n}\n\nconst convo = [\n  { role: "system", content: "You are a concise assistant." },\n  { role: "user", content: "Explain retrieval augmented generation in detail." },\n  { role: "assistant", content: "RAG fetches relevant documents and grounds the answer in them." },\n  { role: "user", content: "Now summarise that in one sentence." },\n];\n\nconst result = trimContext(convo, 40);\nconsole.log("tokens used:", result.tokens);\nconsole.log("dropped turns:", result.dropped);\nconsole.log(result.messages.map((m) => `${m.role}: ${m.content}`).join("\\n"));\n'
 )));