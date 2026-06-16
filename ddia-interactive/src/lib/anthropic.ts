/**
 * Minimal server-side Anthropic Messages API client (raw fetch).
 *
 * We call the REST API directly rather than the SDK to keep the dependency
 * surface small (the corporate npm proxy blocks some packages). The API key is
 * read from the environment at request time and never reaches the client.
 *
 * Opus 4.7 constraints honored here: no `temperature`/`top_p`/`top_k` and no
 * `thinking.budget_tokens` (all removed → 400). Variety in generated quizzes
 * comes from a per-request nonce in the user message, not a sampling temp.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-4-7";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim());
}

export async function anthropicRequest(opts: {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  stream?: boolean;
}): Promise<Response> {
  const { system, messages, maxTokens = 2048, stream = false } = opts;
  return fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      // Stable, per-chapter prefix → cache it. Volatile content lives in messages.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages,
      stream,
    }),
  });
}

/** Concatenate the text blocks of a non-streaming Messages response. */
export function extractText(message: { content?: { type: string; text?: string }[] }): string {
  if (!message?.content) return "";
  return message.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
}

/** Pull a JSON object out of model text, tolerating ```json fences / prose. */
export function parseJsonObject<T>(text: string): T | null {
  if (!text) return null;
  let candidate = text.trim();
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidate = fence[1].trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/**
 * Transform an Anthropic SSE stream into a plain-text stream of just the
 * assistant's text deltas — simplest possible thing for the client to consume.
 */
export function sseToTextStream(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const evt = JSON.parse(payload);
              if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                controller.enqueue(encoder.encode(evt.delta.text));
              }
            } catch {
              /* ignore keep-alive / partial lines */
            }
          }
        }
      } catch (err) {
        controller.error(err);
        return;
      } finally {
        reader.releaseLock();
      }
      controller.close();
    },
  });
}
