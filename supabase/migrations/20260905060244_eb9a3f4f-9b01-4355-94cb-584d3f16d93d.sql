CREATE TABLE public.codebases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  concept_tag text NOT NULL,
  language text NOT NULL,
  difficulty text NOT NULL DEFAULT 'beginner',
  title text NOT NULL,
  description text,
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_codebases_concept_tag ON public.codebases (concept_tag);
CREATE INDEX idx_codebases_language ON public.codebases (language);

GRANT SELECT ON public.codebases TO anon;
GRANT SELECT ON public.codebases TO authenticated;
GRANT ALL ON public.codebases TO service_role;

ALTER TABLE public.codebases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Codebases are publicly readable"
ON public.codebases FOR SELECT
TO anon, authenticated
USING (true);

INSERT INTO public.codebases (concept_tag, language, difficulty, title, description, files) VALUES
('agent_loop', 'python', 'beginner', 'Minimal Agent Loop', 'A tiny observe-think-act loop showing how an agent iterates with tools until it reaches a final answer.', '[{"name":"agent_loop.py","language":"python","content":"\"\"\"Minimal agent loop: observe -> think -> act -> repeat.\"\"\"\n\nTOOLS = {\n    \"add\": lambda a, b: a + b,\n    \"mul\": lambda a, b: a * b,\n}\n\n\ndef think(state):\n    \"\"\"Pick the next action. A real agent would call an LLM here.\"\"\"\n    if state[\"step\"] == 0:\n        return (\"add\", (2, 3))\n    if state[\"step\"] == 1:\n        return (\"mul\", (state[\"last\"], 4))\n    return None\n\n\ndef run(max_steps=5):\n    state = {\"step\": 0, \"last\": None, \"trace\": []}\n    while state[\"step\"] < max_steps:\n        action = think(state)\n        if action is None:\n            break\n        name, args = action\n        result = TOOLS[name](*args)\n        state[\"trace\"].append(f\"{name}{args} -> {result}\")\n        state[\"last\"] = result\n        state[\"step\"] += 1\n    return state\n\n\nfinal = run()\nfor line in final[\"trace\"]:\n    print(line)\nprint(\"final answer:\", final[\"last\"])\n"}]'::jsonb),
('context_trim', 'javascript', 'intermediate', 'Context Window Trimming', 'Keeps a conversation under a token budget by preserving the system prompt and dropping the oldest turns first.', '[{"name":"contextTrim.js","language":"javascript","content":"// Trim a message list to fit a token budget.\n// Strategy: always keep the system prompt, then keep the newest turns.\n\nfunction estimateTokens(text) {\n  // Rough heuristic: ~4 characters per token.\n  return Math.ceil(text.length / 4);\n}\n\nfunction trimContext(messages, budget) {\n  const system = messages.filter((m) => m.role === \"system\");\n  const rest = messages.filter((m) => m.role !== \"system\");\n\n  let used = system.reduce((n, m) => n + estimateTokens(m.content), 0);\n  const kept = [];\n\n  for (let i = rest.length - 1; i >= 0; i--) {\n    const cost = estimateTokens(rest[i].content);\n    if (used + cost > budget) break;\n    used += cost;\n    kept.unshift(rest[i]);\n  }\n\n  return { messages: [...system, ...kept], tokens: used, dropped: rest.length - kept.length };\n}\n\nconst convo = [\n  { role: \"system\", content: \"You are a concise assistant.\" },\n  { role: \"user\", content: \"Explain retrieval augmented generation in detail.\" },\n  { role: \"assistant\", content: \"RAG fetches relevant documents and grounds the answer in them.\" },\n  { role: \"user\", content: \"Now summarise that in one sentence.\" },\n];\n\nconst result = trimContext(convo, 40);\nconsole.log(\"tokens used:\", result.tokens);\nconsole.log(\"dropped turns:\", result.dropped);\nconsole.log(result.messages.map((m) => `${m.role}: ${m.content}`).join(\"\\n\"));\n"}]'::jsonb);