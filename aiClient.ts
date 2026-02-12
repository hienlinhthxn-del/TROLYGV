export type AIProvider = 'gemini' | 'openai';

export async function generateWithAI({
    prompt, provider = 'gemini', system, model, fallback = true
}: {
    prompt: string;
    provider?: AIProvider;
    system?: string;
    model?: string;
    fallback?: boolean;
}) {
    const r = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, provider, system, model, fallback }),
    });
    const data = await r.json();
    if (!r.ok) {
        const reason = data?.primary || data?.secondary || data?.detail || data?.error || 'AI error';
        throw new Error(`Lỗi AI (${data?.status ?? r.status}): ${reason}`);
    }
    return data as { text: string; provider: AIProvider; note?: string };
}