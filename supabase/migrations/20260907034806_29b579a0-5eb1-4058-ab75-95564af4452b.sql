UPDATE public.codebases
SET advice = '{
  "summary": "A deterministic stand-in for a real agent loop: a policy function chooses a tool call, the loop executes it, records the trace, and stops when the policy returns nothing or the step budget runs out.",
  "walkthrough": [
    {"file":"agent_loop.py","line":3,"endLine":6,"label":"Tool registry","explanation":"Tools are plain callables in a dictionary keyed by name. The model never runs code directly; it only names a tool, and the loop looks it up here."},
    {"file":"agent_loop.py","line":9,"endLine":15,"label":"Policy step (think)","explanation":"Returns the next (tool, args) pair or None. In a real agent this is the model call; keeping it pure and deterministic makes the loop testable."},
    {"file":"agent_loop.py","line":18,"endLine":19,"label":"Loop state","explanation":"State carries the step counter, the last result, and a trace. Everything the next decision needs lives in one object."},
    {"file":"agent_loop.py","line":20,"endLine":23,"label":"Step budget guard","explanation":"The while condition plus the None check give two independent stop conditions: the agent finishing, and the budget being exhausted."},
    {"file":"agent_loop.py","line":24,"endLine":28,"label":"Execute and record","explanation":"The chosen tool is executed with its arguments, the result is appended to the trace, and the state is advanced. The trace is what you replay when debugging."},
    {"file":"agent_loop.py","line":33,"endLine":36,"label":"Observable output","explanation":"Printing the trace and the final answer makes the run inspectable, which is exactly what tracing gives you in production."}
  ],
  "tradeoffs": [
    {"decision":"Stopping condition","chosen":"Step budget plus an explicit None from the policy","alternative":"Loop until the model says it is done","why":"A hard budget bounds cost and guarantees the loop terminates even when the policy misbehaves."},
    {"decision":"Tool dispatch","chosen":"Name-keyed registry","alternative":"Executing model-produced code","why":"A registry keeps the blast radius to vetted functions and makes argument validation possible."},
    {"decision":"State shape","chosen":"One mutable dict threaded through the loop","alternative":"Re-deriving context from the message history each turn","why":"Simple and cheap here; a message history scales better once the agent needs full conversational context."}
  ],
  "misconceptions": [
    {"claim":"The model executes the tool itself.","reality":"The model only emits a tool name and arguments; your loop performs the call and feeds the result back.","check":"Which line actually invokes the tool?"},
    {"claim":"An agent loop ends when the model stops talking.","reality":"Without a step budget a loop can cycle forever; termination must be enforced by the harness.","check":"Remove the max_steps guard - what stops this loop?"},
    {"claim":"The trace is only for logging.","reality":"The trace is the state a later step (and your evaluation harness) reasons over.","check":"What would you lose if state[''trace''] were dropped?"}
  ],
  "conceptLinks": ["tool_routing", "context_trim", "tracing", "step_budget"],
  "followUps": [
    "How would you add a retry when a tool raises an exception?",
    "Where would you insert a guard that validates tool arguments before execution?",
    "How does the step budget interact with token cost per turn?"
  ]
}'::jsonb
WHERE concept_tag = 'agent_loop';