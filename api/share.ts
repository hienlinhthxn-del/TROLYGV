import type { VercelRequest, VercelResponse } from '@vercel/node';

const SAFE_KEY_RE = /^[a-zA-Z0-9_-]{3,48}$/;

async function uploadToBytebin(payload: string): Promise<string | null> {
  try {
    const res = await fetch('https://bytebin.lucko.me/post', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'User-Agent': 'EduAssistAI/2.0',
      },
      body: payload,
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    if (json && typeof json.key === 'string' && SAFE_KEY_RE.test(json.key)) {
      return `bb_${json.key}`;
    }
    return null;
  } catch (e) {
    console.warn('[api/share] bytebin upload failed:', e);
    return null;
  }
}

async function uploadToPasteRs(payload: string): Promise<string | null> {
  try {
    const res = await fetch('https://paste.rs/', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'User-Agent': 'EduAssistAI/2.0',
      },
      body: payload,
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    const match = text.match(/paste\.rs\/([a-zA-Z0-9_-]+)/);
    if (match && SAFE_KEY_RE.test(match[1])) {
      return `pr_${match[1]}`;
    }
    return null;
  } catch (e) {
    console.warn('[api/share] paste.rs upload failed:', e);
    return null;
  }
}

async function uploadToDpaste(payload: string): Promise<string | null> {
  try {
    const body = new URLSearchParams();
    body.set('content', payload);
    body.set('expiry_days', '365');
    const res = await fetch('https://dpaste.com/api/v2/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'EduAssistAI/2.0',
      },
      body: body.toString(),
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    const match = text.match(/dpaste\.com\/([a-zA-Z0-9_-]+)/);
    if (match && SAFE_KEY_RE.test(match[1])) {
      return `dp_${match[1]}`;
    }
    return null;
  } catch (e) {
    console.warn('[api/share] dpaste upload failed:', e);
    return null;
  }
}

async function fetchFromProvider(id: string): Promise<string | null> {
  if (id.startsWith('bb_')) {
    const key = id.slice(3);
    if (!SAFE_KEY_RE.test(key)) return null;
    const res = await fetch(`https://bytebin.lucko.me/${key}`, {
      headers: { 'User-Agent': 'EduAssistAI/2.0' },
    });
    return res.ok ? await res.text() : null;
  }
  if (id.startsWith('pr_')) {
    const key = id.slice(3);
    if (!SAFE_KEY_RE.test(key)) return null;
    const res = await fetch(`https://paste.rs/${key}`, {
      headers: { 'User-Agent': 'EduAssistAI/2.0' },
    });
    return res.ok ? await res.text() : null;
  }
  if (id.startsWith('dp_')) {
    const key = id.slice(3);
    if (!SAFE_KEY_RE.test(key)) return null;
    const res = await fetch(`https://dpaste.com/${key}.txt`, {
      headers: { 'User-Agent': 'EduAssistAI/2.0' },
    });
    return res.ok ? await res.text() : null;
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const rawPayload = typeof req.body === 'string' ? req.body : req.body?.payload;
      if (!rawPayload || typeof rawPayload !== 'string') {
        return res.status(400).json({ error: 'Thiếu dữ liệu bài Quiz để chia sẻ.' });
      }
      if (rawPayload.length > 4_000_000) {
        return res.status(413).json({ error: 'Dung lượng bài Quiz vượt quá giới hạn 4MB.' });
      }

      const id =
        (await uploadToBytebin(rawPayload)) ||
        (await uploadToPasteRs(rawPayload)) ||
        (await uploadToDpaste(rawPayload));

      if (!id) {
        return res.status(502).json({ error: 'Không thể lưu trữ link rút gọn lên máy chủ đám mây.' });
      }

      return res.status(200).json({ id });
    } catch (e: any) {
      console.error('[api/share] POST error:', e);
      return res.status(500).json({ error: e?.message || 'Lỗi máy chủ chia sẻ.' });
    }
  }

  if (req.method === 'GET') {
    try {
      const id = String(req.query?.id || '').trim();
      if (!id || id.length < 5 || id.length > 60) {
        return res.status(400).json({ error: 'Mã link chia sẻ không hợp lệ.' });
      }

      const payload = await fetchFromProvider(id);
      if (!payload) {
        return res.status(404).json({ error: 'Không tìm thấy đề thi hoặc link chia sẻ đã hết hạn.' });
      }

      return res.status(200).json({ payload });
    } catch (e: any) {
      console.error('[api/share] GET error:', e);
      return res.status(500).json({ error: e?.message || 'Lỗi tải đề thi chia sẻ.' });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
