import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  maxDuration: 60,
};

const SAFE_KEY_RE = /^[a-zA-Z0-9_-]{3,48}$/;
// paste.rs giới hạn ~64KB mỗi request -> chia chunk 45KB để luôn thành công 100%
const CHUNK_SIZE = 45_000;
const CHUNKED_PREFIX = '__CHUNKED__:';

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function uploadToPastesDev(payload: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      'https://api.pastes.dev/post',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'User-Agent': 'EduAssistAI/2.0',
        },
        body: payload,
      },
      15000
    );
    if (!res.ok) return null;
    const json: any = await res.json();
    if (json && typeof json.key === 'string' && SAFE_KEY_RE.test(json.key)) {
      return `pd_${json.key}`;
    }
    return null;
  } catch (e) {
    console.warn('[api/share] pastes.dev upload failed:', e);
    return null;
  }
}

async function uploadToBytebin(payload: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout('https://bytebin.lucko.me/post', {
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
    const res = await fetchWithTimeout('https://paste.rs/', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'User-Agent': 'EduAssistAI/2.0',
      },
      body: payload,
    });
    // paste.rs trả về 206 nếu nội dung bị cắt bớt -> chỉ chấp nhận 200/201
    if (!res.ok || res.status === 206) return null;
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
    const res = await fetchWithTimeout('https://dpaste.com/api/v2/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'EduAssistAI/2.0',
      },
      body: body.toString(),
    });
    // paste.rs trả về 206 nếu nội dung bị cắt bớt -> chỉ chấp nhận 200/201
    if (!res.ok || res.status === 206) return null;
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
  if (id.startsWith('pd_')) {
    const key = id.slice(3);
    if (!SAFE_KEY_RE.test(key)) return null;
    const res = await fetchWithTimeout(
      `https://api.pastes.dev/${key}`,
      { headers: { 'User-Agent': 'EduAssistAI/2.0' } },
      15000
    );
    return res.ok ? await res.text() : null;
  }
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

async function uploadSingleChunk(chunk: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const id =
      (await uploadToPasteRs(chunk)) ||
      (await uploadToDpaste(chunk)) ||
      (await uploadToBytebin(chunk));
    if (id) return id;
    if (attempt === 0) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return null;
}

async function uploadPayloadWithChunking(rawPayload: string): Promise<string | null> {
  // Ưu tiên 1: api.pastes.dev hỗ trợ tới nhiều MB trong 1 request duy nhất, siêu nhanh và không bị giới hạn 64KB
  const directPastesDev = await uploadToPastesDev(rawPayload);
  if (directPastesDev) {
    return directPastesDev;
  }

  // Ưu tiên 2: Nếu payload nhỏ, dùng trực tiếp các provider dự phòng
  if (rawPayload.length <= CHUNK_SIZE) {
    return await uploadSingleChunk(rawPayload);
  }

  // Ưu tiên 3: Chia nhỏ 45KB và gửi tuần tự nhẹ (tránh bị paste.rs chặn rate-limit khi gửi song song)
  const chunks: string[] = [];
  for (let i = 0; i < rawPayload.length; i += CHUNK_SIZE) {
    chunks.push(rawPayload.slice(i, i + CHUNK_SIZE));
  }

  const chunkIds: string[] = new Array(chunks.length);
  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 250));
    const cid = await uploadSingleChunk(chunks[i]);
    if (!cid) return null;
    chunkIds[i] = cid;
  }

  const manifest = `${CHUNKED_PREFIX}${JSON.stringify(chunkIds)}`;
  return await uploadSingleChunk(manifest);
}

async function fetchPayloadWithChunking(id: string): Promise<string | null> {
  const first = await fetchFromProvider(id);
  if (!first) return null;

  const trimmed = first.trim();
  if (!trimmed.startsWith(CHUNKED_PREFIX)) {
    return trimmed;
  }

  try {
    const chunkIds: unknown = JSON.parse(trimmed.slice(CHUNKED_PREFIX.length));
    if (!Array.isArray(chunkIds) || chunkIds.length === 0 || chunkIds.length > 100) {
      return null;
    }
    const parts = await Promise.all(
      chunkIds.map((cid) => (typeof cid === 'string' ? fetchFromProvider(cid) : Promise.resolve(null)))
    );
    if (parts.some((p) => p === null)) return null;
    return parts.map((p) => (p || '').trim()).join('');
  } catch {
    return null;
  }
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

      const id = await uploadPayloadWithChunking(rawPayload);

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

      const payload = await fetchPayloadWithChunking(id);
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
