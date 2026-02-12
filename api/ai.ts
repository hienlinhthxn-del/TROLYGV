import type { VercelRequest, VercelResponse } from '@vercel/node';

async function callOpenAI({ prompt, system, model }: { prompt: string; system?: string; model?: string }) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('Thiếu OPENAI_API_KEY');

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: model || 'gpt-4o-mini',
            messages: [
                ...(system ? [{ role: 'system', content: String(system) }] : []),
                { role: 'user', content: prompt },
            ],
        }),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content ?? '';
    return { text, raw: data, provider: 'openai' as const };
}

async function callGemini({ prompt, system, model }: { prompt: string; system?: string; model?: string }) {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!key) throw new Error('Thiếu GEMINI_API_KEY/GOOGLE_API_KEY');

    const usedModel = model || 'gemini-2.5-flash';
    const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${usedModel}:generateContent?key=${key}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                ...(system ? { systemInstruction: { parts: [{ text: String(system) }] } } : {}),
            }),
        }
    );
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? '').join('') ?? '';
    return { text, raw: data, provider: 'gemini' as const };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { provider = 'gemini', prompt, system, model, fallback = true } = req.body ?? {};
        if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'Thiếu prompt' });

        try {
            const out = provider === 'openai'
                ? await callOpenAI({ prompt, system, model })
                : await callGemini({ prompt, system, model });
            return res.status(200).json(out);

        } catch (primaryErr: any) {
            if (!fallback) throw primaryErr;
            try {
                const out = provider === 'openai'
                    ? await callGemini({ prompt, system, model })
                    : await callOpenAI({ prompt, system, model });
                return res.status(200).json({ ...out, note: `Failover từ ${provider} → ${out.provider}` });
            } catch (secondaryErr: any) {
                return res.status(502).json({
                    error: 'AI upstream error (cả 2 provider)',
                    primary: String(primaryErr?.message || primaryErr),
                    secondary: String(secondaryErr?.message || secondaryErr),
                });
            }
        }
    } catch (err: any) {
        console.error('Server error', err);
        return res.status(500).json({ error: err?.message ?? 'Server error' });
    }
}