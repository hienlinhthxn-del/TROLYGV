import type { VercelRequest, VercelResponse } from '@vercel/node';

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

function pcmToWavBuffer(pcmBuffer: Buffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (PCM)
  header.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

function splitTextIntoChunks(text: string, maxLen = 180): string[] {
  const sentences = text
    .replace(/\r\n/g, '\n')
    .split(/(?<=[.!?;\n])\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (!sentence.trim()) continue;
    if ((current + ' ' + sentence).trim().length <= maxLen) {
      current = (current + ' ' + sentence).trim();
    } else {
      if (current) chunks.push(current);
      if (sentence.length <= maxLen) {
        current = sentence.trim();
      } else {
        const words = sentence.split(/\s+/);
        current = '';
        for (const w of words) {
          if ((current + ' ' + w).trim().length <= maxLen) {
            current = (current + ' ' + w).trim();
          } else {
            if (current) chunks.push(current);
            current = w;
          }
        }
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
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

  const { text, voice } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Thiếu văn bản cần đọc.' });
  }

  // 1. Thử dùng Gemini 2.5 Flash TTS nếu có API Key trên server
  const keys = getServerApiKeys();
  const voiceMap: Record<string, { geminiVoice: string; sampleRate: number; stylePrompt: string }> = {
    Kore: {
      geminiVoice: 'Orus',
      sampleRate: 24000,
      stylePrompt: 'Hãy đọc văn bản sau bằng giọng nam giáo viên Việt Nam trầm ấm, chuẩn mực, rõ ràng:\n\n',
    },
    Puck: {
      geminiVoice: 'Aoede',
      sampleRate: 24000,
      stylePrompt: 'Hãy đọc văn bản sau bằng giọng nữ giáo viên Việt Nam dịu dàng, truyền cảm, rõ ràng:\n\n',
    },
    Boy: {
      geminiVoice: 'Puck',
      sampleRate: 26800,
      stylePrompt: 'Hãy đọc chậm rãi văn bản sau bằng giọng một bé trai tiểu học Việt Nam (8 tuổi), giọng cao, trong sáng, hồn nhiên, lễ phép:\n\n',
    },
    Girl: {
      geminiVoice: 'Leda',
      sampleRate: 27400,
      stylePrompt: 'Hãy đọc chậm rãi văn bản sau bằng giọng một bé gái tiểu học Việt Nam (8 tuổi), giọng cao, trong trẻo, nhí nhảnh, dễ thương:\n\n',
    },
  };
  const selectedVoiceCfg = voiceMap[voice] || voiceMap.Kore;

  for (const key of keys) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${selectedVoiceCfg.stylePrompt}${text}` }] }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: selectedVoiceCfg.geminiVoice,
                  },
                },
              },
            },
          }),
        }
      );

      if (geminiRes.ok) {
        const data: any = await geminiRes.json();
        const inlineData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (inlineData?.data) {
          const mimeType: string = inlineData.mimeType || '';
          if (mimeType.includes('pcm') || mimeType.includes('L16')) {
            const pcmBuffer = Buffer.from(inlineData.data, 'base64');
            const wavBuffer = pcmToWavBuffer(pcmBuffer, selectedVoiceCfg.sampleRate, 1, 16);
            return res.status(200).json({
              audioUrl: `data:audio/wav;base64,${wavBuffer.toString('base64')}`,
              ext: 'wav',
            });
          }
          return res.status(200).json({
            audioUrl: `data:${mimeType || 'audio/wav'};base64,${inlineData.data}`,
            ext: mimeType.includes('mp3') || mimeType.includes('mpeg') ? 'mp3' : 'wav',
          });
        }
      }
    } catch (e) {
      console.warn('[api/tts] Gemini TTS fallback error:', e);
    }
  }

  // 2. Fallback: Tạo file MP3 tiếng Việt qua Google Translate TTS
  try {
    const chunks = splitTextIntoChunks(text, 180);
    const buffers: Buffer[] = [];

    for (const chunk of chunks) {
      const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=vi&client=gtx&q=${encodeURIComponent(chunk)}`;
      const ttsRes = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (!ttsRes.ok) {
        throw new Error(`TTS HTTP ${ttsRes.status}`);
      }
      const arrayBuf = await ttsRes.arrayBuffer();
      buffers.push(Buffer.from(arrayBuf));
    }

    if (buffers.length > 0) {
      const combined = Buffer.concat(buffers);
      return res.status(200).json({
        audioUrl: `data:audio/mpeg;base64,${combined.toString('base64')}`,
        ext: 'mp3',
      });
    }
  } catch (err: any) {
    console.error('[api/tts] Google TTS fallback failed:', err);
  }

  return res.status(500).json({ error: 'Không thể tạo tệp âm thanh.' });
}
