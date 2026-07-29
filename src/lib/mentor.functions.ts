import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

const AskInputSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(20),
  context: z
    .object({
      scenario: z.string().nullable().optional(),
      stem: z.string(),
      key_concept: z.string().nullable().optional(),
      options: z
        .array(z.object({ label: z.string(), text: z.string() }))
        .optional(),
      domain: z.string().optional(),
    })
    .optional(),
});

const SYSTEM_PROMPT = `You are the SME Voice Mentor for the Claude Code Architect Foundation exam prep.

Your role:
- Help the learner INTERPRET the question in front of them. Never reveal or hint at the correct answer directly — teach the underlying concept so they can decide themselves.
- If the learner asks "what's the answer", respond by clarifying the concept and asking them a Socratic follow-up.
- Ground every explanation in Anthropic's Claude Code / Claude Agent SDK terminology (system prompts, tool use, context windows, safety, deployment patterns).
- Be conversational, warm, and concise. Aim for 2–4 sentences. This response will be spoken aloud, so:
  * Use plain prose, no markdown, no lists, no code fences, no headings.
  * Spell out short acronyms (say "A P I" not "API") only on first mention if it aids clarity — otherwise natural pronunciation is fine.
  * Prefer natural sentence rhythm over jargon dumps.
- If asked something off-topic, gently steer back to the exam concept.`;

export const askMentor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AskInputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const contextBlock = data.context
      ? `Current question context (do NOT reveal the answer):
Domain: ${data.context.domain ?? "(unspecified)"}
Key concept: ${data.context.key_concept ?? "(unspecified)"}
${data.context.scenario ? `Scenario: ${data.context.scenario}\n` : ""}Stem: ${data.context.stem}
Options:
${(data.context.options ?? []).map((o) => `  ${o.label}. ${o.text}`).join("\n")}`
      : "No question context attached.";

    const res = await fetch(`${GATEWAY_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "system", content: contextBlock },
          ...data.messages,
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 429) {
        throw new Error("Mentor is rate limited. Try again in a moment.");
      }
      if (res.status === 402) {
        throw new Error("AI credits exhausted. Add credits in Lovable settings.");
      }
      throw new Error(`Mentor call failed: ${res.status} ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    return { text };
  });

const TtsInputSchema = z.object({
  text: z.string().min(1).max(2000),
  voice: z.string().default("alloy"),
});

export const synthesizeSpeech = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TtsInputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const res = await fetch(`${GATEWAY_URL}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input: data.text,
        voice: data.voice,
        response_format: "mp3",
        instructions:
          "Warm, patient tutor. Conversational pacing. Gentle emphasis on key exam concepts.",
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("TTS rate limited.");
      if (res.status === 402) throw new Error("AI credits exhausted.");
      throw new Error(`TTS failed: ${res.status} ${body.slice(0, 200)}`);
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    // base64 encode without stack overflow
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      bin += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    const b64 = btoa(bin);
    return { audio: b64, mimeType: "audio/mpeg" };
  });
