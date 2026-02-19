// Minimal AI client wrapper used by services/geminiService.ts
// Provides a single entry-point to call your Vercel Serverless Function.

export type GenerateWithAIRequest = {
  prompt: string;
  files?: Array<{ data: string; mimeType: string }>;
  model?: string;
  provider?: string;
  stream?: boolean;
};

export type GenerateWithAIResponse = {
  text?: string;
  // Allow additional fields without breaking callers
  [key: string]: unknown;
};

export async function generateWithAI(payload: GenerateWithAIRequest, signal?: AbortSignal): Promise<GenerateWithAIResponse> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    const msg = contentType.includes('application/json')
      ? JSON.stringify(await res.json())
      : await res.text();
    throw new Error(msg || `HTTP ${res.status}`);
  }

  if (contentType.includes('application/json')) {
    return (await res.json()) as GenerateWithAIResponse;
  }

  // Fallback: plain text
  return { text: await res.text() };
}

