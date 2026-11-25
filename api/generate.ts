import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

export const config = {
  maxDuration: 60,
};

const MODEL_CANDIDATES = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-pro',
];

function getServerApiKeys(): string[] {
  const raw =
    process.env.GEMINI_API_KEYS ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    '';
  return raw
    .split(/[,;\n]+/)
    .map((k) => k.trim())
    .filter(Boolean);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const keys = getServerApiKeys();
  if (keys.length === 0) {
    return res.status(500).json({
      error:
        'Chưa cấu hình GEMINI_API_KEY trên Server và chưa nhập API Key cá nhân. Vui lòng bấm nút API Key (🔑) ở góc dưới bên trái để nhập Gemini API Key miễn phí.',
    });
  }

  const { prompt, files, model: requestedModel, isJson } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Thiếu nội dung prompt.' });
  }

  const parts: any[] = [{ text: prompt }];
  if (Array.isArray(files)) {
    for (const f of files) {
      if (f && f.data && f.mimeType) {
        parts.push({
          inlineData: {
            data: f.data,
            mimeType: f.mimeType,
          },
        });
      }
    }
  }

  const modelsToTry = requestedModel && !MODEL_CANDIDATES.includes(requestedModel)
    ? [requestedModel, ...MODEL_CANDIDATES]
    : [...MODEL_CANDIDATES];

  const withPerModelTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Model timeout after ${ms}ms`)), ms);
      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); }
      );
    });

  let lastError: any = null;
  const startTime = Date.now();

  for (const apiKey of keys) {
    const genAI = new GoogleGenerativeAI(apiKey);
    for (const modelName of modelsToTry) {
      // Còn ít hơn 8s trước khi Vercel cắt 60s thì dừng sớm để trả lỗi rõ ràng
      const remainingMs = 56000 - (Date.now() - startTime);
      if (remainingMs < 8000) break;

      try {
        const generationConfig: Record<string, any> = {
          maxOutputTokens: 16384,
        };
        if (isJson && /^gemini-(2\.5|2\.0)-(flash|pro)/.test(modelName)) {
          generationConfig.responseMimeType = 'application/json';
        }

        const generativeModel = genAI.getGenerativeModel(
          {
            model: modelName,
            safetySettings: [
              { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            ],
            generationConfig,
          },
          { apiVersion: 'v1beta' }
        );

        const attemptTimeout = Math.min(28000, remainingMs - 1000);
        const result = await withPerModelTimeout(generativeModel.generateContent(parts), attemptTimeout);
        const text = result.response.text();
        return res.status(200).json({ text, model: modelName });
      } catch (err: any) {
        lastError = err;
        console.warn(`[api/generate] Model ${modelName} failed:`, err?.message || err);
      }
    }
  }

  return res.status(500).json({
    error: lastError?.message || 'Tất cả các model AI trên server đều đang quá tải.',
  });
}
