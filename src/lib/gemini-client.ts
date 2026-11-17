import { GoogleGenAI } from '@google/genai';
import type { z } from 'zod';
import { env } from './env';

export const GEMINI_FLASH_LITE_MODEL = 'gemini-3.5-flash-lite';

export interface StructuredInteractionInvoke {
  (params: {
    model: string;
    input: string;
    system_instruction: string;
    store: false;
    response_format: {
      type: 'text';
      mime_type: 'application/json';
      schema: Record<string, unknown>;
    };
  }): Promise<{ output_text?: string | null }>;
}

export interface InvokeGeminiJsonOptions<T> {
  model?: string;
  systemInstruction: string;
  input: string;
  jsonSchema: Record<string, unknown>;
  outputSchema: z.ZodType<T>;
  timeoutMs?: number;
  apiKey?: string;
  createInteraction?: StructuredInteractionInvoke;
}

/**
 * Shared server-only helper calling Gemini Interactions API (`store: false`)
 * with strict JSON Schema output and Zod validation.
 */
export async function invokeGeminiStructuredJson<T>(
  opts: InvokeGeminiJsonOptions<T>
): Promise<{ ok: true; data: T; model: string } | { ok: false; reason: 'missing_key' | 'error' }> {
  const apiKey = (opts.apiKey ?? env.GEMINI_API_KEY ?? process.env.GEMINI_API_KEY ?? '').trim();
  if (!apiKey && !opts.createInteraction) {
    return { ok: false, reason: 'missing_key' };
  }

  const model = opts.model || GEMINI_FLASH_LITE_MODEL;
  const timeoutMs = opts.timeoutMs ?? 9_000;

  const invoke: StructuredInteractionInvoke =
    opts.createInteraction ??
    (async (params) => {
      const ai = new GoogleGenAI({ apiKey });
      return ai.interactions.create(params);
    });

  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const interaction = await Promise.race([
      invoke({
        model,
        system_instruction: opts.systemInstruction,
        input: opts.input,
        store: false,
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: opts.jsonSchema,
        },
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Gemini interaction timeout')), timeoutMs);
      }),
    ]);

    const rawText = String(interaction?.output_text || '').trim();
    const parsed = opts.outputSchema.parse(JSON.parse(rawText));
    return { ok: true, data: parsed, model };
  } catch {
    return { ok: false, reason: 'error' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
