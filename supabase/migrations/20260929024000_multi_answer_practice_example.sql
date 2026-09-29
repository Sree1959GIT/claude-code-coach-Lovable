-- A published multi-answer practice question for the existing Agentic Workflows area.
-- IDs are stable so a repeated migration cannot create duplicate practice content.
INSERT INTO public.questions
  (id, domain_id, scenario, stem, key_concept, difficulty, sort_order, status, origin, published_at, answer_mode)
SELECT
  'd5a90000-0000-4000-8000-000000000001'::uuid, d.id,
  'A Claude-powered assistant calls external tools to complete a task. One tool fails, but the task can still be completed using an alternative.',
  'Which approaches help the assistant recover while keeping the workflow understandable? Select all that apply.',
  'Agentic error recovery', 'medium', 3, 'published', 'manual', now(), 'multiple'
FROM public.domains d
WHERE d.slug = 'agents'
  AND NOT EXISTS (SELECT 1 FROM public.questions WHERE id = 'd5a90000-0000-4000-8000-000000000001'::uuid);

INSERT INTO public.question_options (id, question_id, label, text, is_correct, explanation, sort_order)
SELECT v.id::uuid, q.id, v.label, v.text, v.is_correct, v.explanation, v.sort_order
FROM public.questions q
CROSS JOIN (VALUES
  ('d5a90000-0000-4000-8000-000000000011', 'A', 'Return the tool error to the assistant as an observation so it can choose the next step.', true, 'The assistant needs to see the failure to reason about recovery.', 1),
  ('d5a90000-0000-4000-8000-000000000012', 'B', 'Let the assistant select an alternative tool or adjust its plan after inspecting the error.', true, 'Observation-driven replanning can keep the task moving.', 2),
  ('d5a90000-0000-4000-8000-000000000013', 'C', 'Hide the failed tool call so the assistant assumes it succeeded.', false, 'Hiding a failure causes the assistant to reason from an incorrect state.', 3),
  ('d5a90000-0000-4000-8000-000000000014', 'D', 'Repeat the same failing call indefinitely without checking its result.', false, 'Unbounded retries do not diagnose or resolve the underlying failure.', 4)
) AS v(id, label, text, is_correct, explanation, sort_order)
WHERE q.id = 'd5a90000-0000-4000-8000-000000000001'::uuid
  AND NOT EXISTS (SELECT 1 FROM public.question_options o WHERE o.id = v.id::uuid);
