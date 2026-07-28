
-- DOMAINS
CREATE TABLE public.domains (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  weight numeric NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.domains TO authenticated;
GRANT ALL ON public.domains TO service_role;
ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read domains" ON public.domains FOR SELECT TO authenticated USING (true);

-- QUESTIONS
CREATE TABLE public.questions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain_id uuid NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  scenario text,
  stem text NOT NULL,
  key_concept text,
  difficulty text NOT NULL DEFAULT 'medium',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.questions TO authenticated;
GRANT ALL ON public.questions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read questions" ON public.questions FOR SELECT TO authenticated USING (true);
CREATE INDEX questions_domain_idx ON public.questions(domain_id);

-- QUESTION OPTIONS
CREATE TABLE public.question_options (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  label text NOT NULL,
  text text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  explanation text,
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.question_options TO authenticated;
GRANT ALL ON public.question_options TO service_role;
ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read options" ON public.question_options FOR SELECT TO authenticated USING (true);
CREATE INDEX question_options_question_idx ON public.question_options(question_id);

-- ATTEMPTS
CREATE TABLE public.question_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_option_id uuid REFERENCES public.question_options(id) ON DELETE SET NULL,
  is_correct boolean NOT NULL,
  time_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.question_attempts TO authenticated;
GRANT ALL ON public.question_attempts TO service_role;
ALTER TABLE public.question_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own attempts" ON public.question_attempts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own attempts" ON public.question_attempts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX question_attempts_user_idx ON public.question_attempts(user_id, created_at DESC);
CREATE INDEX question_attempts_q_idx ON public.question_attempts(question_id);

-- SEED DOMAINS
INSERT INTO public.domains (slug, title, description, weight, sort_order) VALUES
  ('prompting', 'Prompting Fundamentals', 'Structured prompting, XML tags, role framing, and chain-of-thought.', 20, 1),
  ('context', 'Context Engineering', 'Context windows, RAG patterns, retrieval strategies, and token budgets.', 20, 2),
  ('agents', 'Agentic Workflows', 'Tool use, multi-step planning, orchestration, and error recovery.', 25, 3),
  ('safety', 'Safety & Alignment', 'Refusals, jailbreak resistance, red-teaming, and Constitutional AI.', 15, 4),
  ('deployment', 'Deployment & Ops', 'Latency, caching, streaming, evals, and cost engineering.', 20, 5);

-- SEED QUESTIONS
WITH d AS (SELECT id, slug FROM public.domains)
INSERT INTO public.questions (domain_id, scenario, stem, key_concept, difficulty, sort_order)
SELECT (SELECT id FROM d WHERE slug=q.slug), q.scenario, q.stem, q.key_concept, q.difficulty, q.sort_order FROM (VALUES
  ('prompting','A junior developer wants Claude to consistently produce JSON output matching a strict schema for an internal tool.','Which technique most reliably enforces schema-conformant JSON responses?','Structured output enforcement','easy',1),
  ('prompting','You are wrapping user-provided text inside a system prompt and want to prevent prompt injection from the user content.','What is the recommended way to isolate user input from instructions?','Prompt injection defense','medium',2),
  ('context','A support bot must answer from a 50,000-document knowledge base with strict factual grounding.','Which architecture is the best fit?','RAG vs long-context tradeoff','medium',1),
  ('context','You are building a coding assistant that needs to reference a 200k-token codebase within a single session.','What is the most cost-effective way to keep the codebase referenceable?','Prompt caching','medium',2),
  ('agents','An agent must call multiple tools in sequence and recover from tool failures without user intervention.','Which pattern is most appropriate?','Agentic error recovery','hard',1),
  ('agents','You want Claude to decide autonomously whether it needs a search tool before answering a user question.','Which capability enables this?','Tool routing','easy',2),
  ('safety','Users are trying to bypass safety guardrails by wrapping requests in fictional roleplay.','What is the recommended defense-in-depth approach?','Layered safety','hard',1),
  ('deployment','A production chat app has p99 latency spikes during peak hours despite low token counts.','What should you investigate first?','Latency engineering','medium',1)
) AS q(slug, scenario, stem, key_concept, difficulty, sort_order);

-- SEED OPTIONS
DO $$
DECLARE
  q record;
BEGIN
  FOR q IN SELECT id, key_concept FROM public.questions LOOP
    IF q.key_concept = 'Structured output enforcement' THEN
      INSERT INTO public.question_options (question_id, label, text, is_correct, explanation, sort_order) VALUES
        (q.id,'A','Ask nicely in the prompt: "Please return valid JSON only."', false,'Polite phrasing is unreliable at scale — models still occasionally add prose.',1),
        (q.id,'B','Provide an explicit JSON schema in the prompt AND validate the response, retrying on failure.', true,'Combining schema + validation + retry is the durable pattern used in production.',2),
        (q.id,'C','Set temperature to 0 and hope for the best.', false,'Temperature 0 reduces variance but does not enforce structure.',3),
        (q.id,'D','Fine-tune a bespoke model for every schema variant.', false,'Overkill; schema + validation is far cheaper and equally reliable.',4);
    ELSIF q.key_concept = 'Prompt injection defense' THEN
      INSERT INTO public.question_options (question_id, label, text, is_correct, explanation, sort_order) VALUES
        (q.id,'A','Concatenate user text after "User said:" with no delimiter.', false,'No isolation — injection succeeds trivially.',1),
        (q.id,'B','Wrap user text in XML tags such as <user_input>...</user_input> and instruct Claude to treat its contents as data, not instructions.', true,'XML tag isolation is the documented Anthropic recommendation.',2),
        (q.id,'C','Base64-encode the user text.', false,'Obfuscation is not isolation; Claude still decodes and executes.',3),
        (q.id,'D','Rely on a downstream regex to strip suspicious phrases.', false,'Regex cannot enumerate all injection patterns.',4);
    ELSIF q.key_concept = 'RAG vs long-context tradeoff' THEN
      INSERT INTO public.question_options (question_id, label, text, is_correct, explanation, sort_order) VALUES
        (q.id,'A','Stuff every document into the context window on every request.', false,'50k docs vastly exceeds practical context and cost budgets.',1),
        (q.id,'B','Retrieval-Augmented Generation with a hybrid vector + BM25 retriever and citation-forcing prompt.', true,'RAG with hybrid retrieval + citations is the standard grounded-answer pattern.',2),
        (q.id,'C','Fine-tune the model on the entire knowledge base.', false,'Fine-tuning bakes knowledge in but is brittle to updates.',3),
        (q.id,'D','Have a human answer every question.', false,'Defeats the purpose of the bot.',4);
    ELSIF q.key_concept = 'Prompt caching' THEN
      INSERT INTO public.question_options (question_id, label, text, is_correct, explanation, sort_order) VALUES
        (q.id,'A','Re-upload the codebase on every request.', false,'Extremely expensive; ignores caching entirely.',1),
        (q.id,'B','Use prompt caching to cache the stable codebase prefix and only pay full price for new tokens.', true,'Prompt caching is designed exactly for stable long prefixes.',2),
        (q.id,'C','Truncate the codebase to fit a small window.', false,'Loses information; caching preserves it cheaply.',3),
        (q.id,'D','Store embeddings only.', false,'Embeddings help retrieval, not verbatim reference.',4);
    ELSIF q.key_concept = 'Agentic error recovery' THEN
      INSERT INTO public.question_options (question_id, label, text, is_correct, explanation, sort_order) VALUES
        (q.id,'A','Halt on the first tool error and surface it to the user.', false,'Prevents autonomy; contradicts the requirement.',1),
        (q.id,'B','Loop with tool_use → tool_result, letting Claude observe errors and retry or choose an alternative tool.', true,'Standard agentic loop with observation-driven recovery.',2),
        (q.id,'C','Randomly retry each failed tool call up to 100 times.', false,'Wasteful and often makes failures worse.',3),
        (q.id,'D','Discard failed tool calls silently.', false,'Loses information the model needs to recover.',4);
    ELSIF q.key_concept = 'Tool routing' THEN
      INSERT INTO public.question_options (question_id, label, text, is_correct, explanation, sort_order) VALUES
        (q.id,'A','Native tool use with tool definitions declared in the request.', true,'Tool use lets Claude decide when to call tools vs answer directly.',1),
        (q.id,'B','A hardcoded if/else that always calls search.', false,'Removes autonomy the question requires.',2),
        (q.id,'C','A separate classifier model in front of Claude.', false,'Works but is unnecessary — tool use handles routing natively.',3),
        (q.id,'D','Manual user selection of the tool.', false,'Also removes autonomy.',4);
    ELSIF q.key_concept = 'Layered safety' THEN
      INSERT INTO public.question_options (question_id, label, text, is_correct, explanation, sort_order) VALUES
        (q.id,'A','Add "do not roleplay" once to the system prompt.', false,'Single-layer defenses are routinely bypassed.',1),
        (q.id,'B','Combine a hardened system prompt, input classification, output moderation, and rate-limiting on suspicious patterns.', true,'Defense in depth — multiple independent layers.',2),
        (q.id,'C','Block every message containing the word "roleplay".', false,'High false-positive rate and easily evaded.',3),
        (q.id,'D','Only allow whitelisted users.', false,'Does not address the attack surface for allowed users.',4);
    ELSIF q.key_concept = 'Latency engineering' THEN
      INSERT INTO public.question_options (question_id, label, text, is_correct, explanation, sort_order) VALUES
        (q.id,'A','Streaming, prompt caching hit rate, and model selection for the request mix.', true,'These are the highest-leverage latency levers for chat apps.',1),
        (q.id,'B','Rewrite the whole app in Rust.', false,'Language rarely dominates LLM p99 latency.',2),
        (q.id,'C','Increase temperature to speed up sampling.', false,'Temperature does not meaningfully affect latency.',3),
        (q.id,'D','Buy a bigger database.', false,'Unrelated to LLM inference latency.',4);
    END IF;
  END LOOP;
END $$;
