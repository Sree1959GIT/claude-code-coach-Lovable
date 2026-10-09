/** Browser-safe delivery guidance shared by cloud prompts, Ollama and playback. */
export type MentorRequest = "explain" | "read-fast" | "traps" | "option" | "code" | "other";

export function mentorRequest(turn: string): MentorRequest {
  if (/^\s*\[\[code-context:/.test(turn)) return "code";
  if (/\b(read fast|read .*quickly|reading strategy)\b/i.test(turn)) return "read-fast";
  if (/\b(trap spotting|distractor traps?|traps? in .*options)\b/i.test(turn)) return "traps";
  if (/\b(explain (the |this )?question|interpret (the |this )?question)\b/i.test(turn)) return "explain";
  if (/\b(i picked option|rate option|how apt|my answer)\b/i.test(turn)) return "option";
  return "other";
}

const OPENINGS: Record<Exclude<MentorRequest, "other">, string> = {
  explain: "Let's unpack what this question is asking you to decide.",
  "read-fast": "Let's find a quick way through this question and its options.",
  traps: "Let's spot what makes these options tempting, and where they fall short.",
  option: "Let's check how your choice fits the question.",
  code: "Let's see what this code does and which pattern to look for.",
};

const GUIDANCE: Record<Exclude<MentorRequest, "other">, string> = {
  explain: "Explain the scenario's decision and the decisive qualifier in this exact stem; do not merely paraphrase the whole question.",
  "read-fast": "Give a reading route for this exact item: find the task and qualifier in the stem, scan only the relevant scenario detail, then compare the distinguishing wording in the options. Name the actual words or details, not generic speed-reading advice.",
  traps: "Identify the tempting-but-incomplete reasoning in these actual options and the stem constraint each misses. Teach how to detect the trap without naming or implying the correct letter.",
  option: "Weigh the chosen option's fit, its limitation, and the discriminator separating it from a rival; do not reveal the key.",
  code: "Summarise the captured code's behaviour as a short plain-English flow, then connect the pattern to option selection. No line-by-line walkthrough or re-explanation of the question.",
};

export function mentorDeliveryGuidance(turn: string): string {
  const request = mentorRequest(turn);
  const opening = request === "other" ? "" : `Begin the SPOKEN brief with this sentence: "${OPENINGS[request]}" Then give concrete guidance for this item. ${GUIDANCE[request]}`;
  return `DELIVERY FOR THE LATEST LEARNER REQUEST (takes priority over generic intent/focus guidance): ${opening}
Never use the stock opener "OK, look at what the question is actually asking" or a variant. For free-form questions, open directly on what the learner asked. Keep this acknowledgement out of the written answer. The written answer comes first and remains precise; only the separate [[brief]] gist is spoken. Use friendly professional English, natural contractions and short complete sentences, with commas at meaningful pauses. Avoid rushed chains of clauses, unnecessary jargon, exaggerated cheerfulness and repeating the written explanation.`;
}

/** Remove a stale model-generated stock opener, without changing substantive guidance. */
export function contextualSpokenOpening(text: string, turn: string): string {
  const stock = /^(?:ok(?:ay)?[,!.\s—–-]*)?look at what (?:the|this) question is actually asking[.!?,;:\s—–-]*/i;
  if (!stock.test(text.trim())) return text;
  const rest = text.trim().replace(stock, "");
  const request = mentorRequest(turn);
  const opening = request === "other" ? "" : OPENINGS[request];
  return [opening, rest].filter(Boolean).join(" ");
}