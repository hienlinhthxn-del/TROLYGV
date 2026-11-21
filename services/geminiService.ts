import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, GenerativeModel, ChatSession } from "@google/generative-ai";
import { generateWithAI } from '../aiClient';
import { loadPdfJsLibrary } from './pdfService';

// This type is used by other components like ExamCreator
export interface FilePart {
  inlineData: {
    data: string;
    mimeType: string;
  };
}

class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: GenerativeModel | null = null;
  private chat: ChatSession | null = null;
  private currentModelName: string = '';
  private lastUsedKey: string | null = null;
  private onStatusChange: ((status: string) => void) | null = null;

  // Danh sách ưu tiên mới nhất + fallback để giảm lỗi "Model not found" và "Rate Limit"
  private static readonly MODEL_CANDIDATES = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-2.5-pro',
    'gemini-1.5-flash',
  ];

  private allApiKeys: string[] = [];
  private currentKeyIndex: number = 0;

  private availableModels: string[] = [...GeminiService.MODEL_CANDIDATES];
  private static readonly MAX_RATE_LIMIT_SWITCHES_PER_REQUEST = 20;

  private static isPreferredModelFamily(modelName: string): boolean {
    return modelName.startsWith('gemini-');
  }

  private static isTextGenerationModel(modelName: string): boolean {
    const excludedTokens = ['image', 'tts', 'robotics', 'computer-use', 'embedding'];
    return !excludedTokens.some(token => modelName.includes(token));
  }

  private static supportsJsonResponseMimeType(modelName: string): boolean {
    return /^gemini-(2\.5|2\.0|1\.5)-(flash|pro)/.test(modelName);
  }

  private currentVersion: 'v1' | 'v1beta' = 'v1beta';
  private totalRetryCount: number = 0;
  private retryAttempt: number = 0;
  private versionRetryCount: number = 0;
  private modelCycleCount: number = 0;
  private rateLimitSwitchCount: number = 0;

  // Rate Limiter - Ngăn chặn lỗi 429 (Too Many Requests)
  private lastRequestTime: number = 0;
  private readonly MIN_REQUEST_INTERVAL_MS = 500;
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessingQueue: boolean = false;
  private rateLimitedModels: Set<string> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      this.initialize();
    }
  }

  public setStatusCallback(callback: (status: string) => void) {
    this.onStatusChange = callback;
  }

  private setStatus(status: string) {
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }

  private refreshKeys() {
    try {
      const manualKeysStr = localStorage.getItem('manually_entered_api_keys');
      if (manualKeysStr) {
        const keys = JSON.parse(manualKeysStr);
        if (Array.isArray(keys) && keys.length > 0) {
          this.allApiKeys = keys;
          return;
        }
      }

      const singleManualKey = localStorage.getItem('manually_entered_api_key');
      const defaultKey = localStorage.getItem('google_api_key');
      const envKey = typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_GEMINI_API_KEY : undefined;

      const combined = [singleManualKey, defaultKey, envKey].filter(Boolean) as string[];
      this.allApiKeys = [...new Set(combined)];
    } catch (e) {
      this.allApiKeys = [];
    }
  }

  private getApiKey(): string | null {
    if (this.allApiKeys.length > 0) {
      return this.allApiKeys[this.currentKeyIndex % this.allApiKeys.length];
    }
    return null;
  }

  private initialize() {
    this.refreshKeys();
    const key = this.getApiKey();
    this.lastUsedKey = key;

    if (key) {
      try {
        this.genAI = new GoogleGenerativeAI(key);
        this.refreshAvailableModels().catch(e => console.warn('Could not refresh model list.', e));

        const preferredModel = localStorage.getItem('preferred_gemini_model');
        const startModel = (preferredModel && this.availableModels.includes(preferredModel)) ? preferredModel : this.availableModels[0];

        if (startModel) {
          this.setupModel(startModel, 'v1beta');
        }
        console.log(`AI Assistant: API Key active (${this.allApiKeys.length > 1 ? `Rotating x${this.allApiKeys.length}` : 'Single'}).`);
      } catch (e) {
        console.error("Gemini initialization failed:", e);
      }
    } else {
      this.setStatus("LỖI: Chưa cấu hình API Key");
      console.warn("AI Assistant: No valid API Key found.");
    }
  }

  private async rotateApiKey(): Promise<boolean> {
    if (this.allApiKeys.length <= 1) return false;

    this.currentKeyIndex++;
    const newKey = this.getApiKey();
    if (newKey) {
      console.log(`🔑 [AI Service] Rotating to API Key #${(this.currentKeyIndex % this.allApiKeys.length) + 1}`);
      this.genAI = new GoogleGenerativeAI(newKey);
      this.lastUsedKey = newKey;
      this.rateLimitedModels.clear();
      await this.refreshAvailableModels();
      return true;
    }
    return false;
  }

  private async refreshAvailableModels(): Promise<void> {
    const key = this.getApiKey();
    if (!key) return;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (!response.ok) return;

      const data = await response.json();
      const listedModels = (data.models || [])
        .filter((m: any) => {
          const methods = m?.supportedGenerationMethods || [];
          const name = m?.name || '';
          const hasMethod = methods.includes('generateContent');
          const isGemini = name.includes('models/gemini-');
          const isText = !['image', 'tts', 'robotics', 'computer-use', 'embedding'].some(t => name.includes(t));

          if (!hasMethod || !isGemini || !isText) return false;
          return true;
        })
        .map((m: any) => (m?.name || '').replace('models/', ''));

      if (!listedModels.length) {
        console.warn('No Gemini models found for this key.');
        return;
      }

      const prioritized = GeminiService.MODEL_CANDIDATES.filter(m => listedModels.includes(m));
      const others = listedModels.filter(m => !GeminiService.MODEL_CANDIDATES.includes(m));

      this.availableModels = [...new Set([...prioritized, ...others])];
      console.log('🚀 [AI Discovery] Available models count:', this.availableModels.length);

      const preferredModel = localStorage.getItem('preferred_gemini_model');
      if (preferredModel && !this.availableModels.includes(preferredModel)) {
        this.setupModel(this.availableModels[0], 'v1beta');
      }

      if (!(window as any)._ai_cleanup_set) {
        setInterval(() => {
          if (this.rateLimitedModels.size > 0) {
            console.log('🧹 [AI Service] Clearing rate limit flags...');
            this.rateLimitedModels.clear();
          }
        }, 300000);
        (window as any)._ai_cleanup_set = true;
      }
    } catch (e) {
      console.warn('Model discovery failed:', e);
    }
  }

  private setupModel(modelName: string, version: 'v1' | 'v1beta' = 'v1beta') {
    if (!this.genAI) return;

    this.currentModelName = modelName;
    this.currentVersion = version;
    this.chat = null;

    this.model = this.genAI.getGenerativeModel({
      model: modelName,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
      ]
    }, { apiVersion: version });

    this.setStatus(`AI Sẵn sàng (${modelName})`);
    localStorage.setItem('preferred_gemini_model', modelName);
  }

  private markCurrentModelRateLimited(): void {
    if (!this.currentModelName) return;
    this.rateLimitedModels.add(this.currentModelName);
    (window as any).ai_status = `⚠️ ${this.currentModelName} 429 (Đang chuyển...)`;
  }

  private resetRateLimits(): void {
    this.rateLimitSwitchCount = 0;
    this.modelCycleCount = 0;
    this.rateLimitedModels.clear();
  }

  private getNextModelSkippingRateLimited(): string | null {
    if (!this.availableModels.length) return null;

    const currentIdx = this.availableModels.indexOf(this.currentModelName);
    for (let i = 1; i <= this.availableModels.length; i++) {
      const nextIdx = (currentIdx + i) % this.availableModels.length;
      const modelName = this.availableModels[nextIdx];

      if (!this.rateLimitedModels.has(modelName)) {
        return modelName;
      }
    }

    const nextIdx = (currentIdx + 1) % this.availableModels.length;
    return this.availableModels[nextIdx];
  }

  private async ensureInitialized() {
    const currentKey = this.getApiKey();

    if (currentKey !== this.lastUsedKey) {
      console.log("🔄 Detecting API Key change...");
      this.genAI = null;
      this.model = null;
      this.chat = null;
      this.resetRateLimits();
      this.lastUsedKey = currentKey;
      this.initialize();
    }

    if (!this.genAI || !this.model) {
      this.initialize();
    }
  }

  public getApiKeySource(): string {
    if (typeof window === 'undefined') return 'Server';
    const manualKeysStr = localStorage.getItem('manually_entered_api_keys');
    if (manualKeysStr) {
      try {
        const arr = JSON.parse(manualKeysStr);
        if (Array.isArray(arr) && arr.length > 0) return `Manual (${arr.length})`;
      } catch {}
    }
    if (localStorage.getItem('manually_entered_api_key')) return 'Manual';
    if (localStorage.getItem('google_api_key')) return 'Legacy';
    return 'Env/Default';
  }

  private resetRetryCounters() {
    this.totalRetryCount = 0;
    this.modelCycleCount = 0;
    this.versionRetryCount = 0;
    this.rateLimitSwitchCount = 0;
  }

  public async generateText(prompt: string, fileParts: FilePart[] = []): Promise<string> {
    this.resetRetryCounters();
    return this._generateText(prompt, fileParts);
  }

  private async _generateText(prompt: string, fileParts: FilePart[] = []): Promise<string> {
    await this.ensureInitialized();

    if (!this.model) {
      return this.fallbackToOtherProviders(prompt, false, fileParts);
    }

    const parts: any[] = [{ text: prompt }];
    if (fileParts && fileParts.length > 0) {
      fileParts.forEach(p => parts.push(p));
    }

    try {
      (window as any).ai_status = `Đang gọi AI (${this.currentModelName})...`;
      // Tăng số lần retry và delay ban đầu để xử lý tốt hơn lỗi 429
      const result = await this.retryWithBackoff(() => this.model!.generateContent(parts), 5, 2000);
      (window as any).ai_status = "Thành công";
      return result.response.text();
    } catch (error: any) {
      return this.handleError(error, () => this._generateText(prompt, fileParts), prompt);
    }
  }

  public initChat(instruction: string) {
    if (!this.genAI) this.initialize();
    if (!this.model) return;

    this.chat = this.model.startChat({
      history: [
        { role: "user", parts: [{ text: instruction }] },
        { role: "model", parts: [{ text: "Xin chào! Tôi là trợ lý AI giáo dục. Tôi có thể giúp gì cho Thầy/Cô?" }] }
      ]
    });
  }

  public async * sendMessageStream(message: string, fileParts: FilePart[] = [], signal?: AbortSignal): AsyncGenerator<{ text: string }> {
    await this.ensureInitialized();
    if (!this.chat) this.initChat("Bạn là trợ lý giáo viên.");

    const parts: any[] = [];
    if (message) parts.push({ text: message });
    if (fileParts && fileParts.length > 0) {
      fileParts.forEach(p => parts.push(p));
    }

    if (parts.length === 0) return;

    // Fallback nếu không có chat hoặc model
    if (!this.chat || !this.model) {
      if (message) {
        console.warn("🚨 [Stream] No AI chat available. Using Server Fallback...");
        try {
          const text = await this.fallbackToOtherProviders(message, false, fileParts);
          yield { text };
          return;
        } catch (e) {
          throw new Error("Không thể khởi tạo AI và Server cũng quá tải.");
        }
      }
      return;
    }

    // Retry logic cho stream với xử lý lỗi 429
    const maxRetries = 3;
    let lastError: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Áp dụng rate limiting
        await this.waitForRateLimit();

        const result = await this.chat.sendMessageStream(parts);
        for await (const chunk of result.stream) {
          if (signal?.aborted) break;
          yield { text: chunk.text() };
        }
        return; // Thành công, thoát khỏi hàm
      } catch (error: any) {
        lastError = error;
        const is429Error = error.message?.includes("429") || error.status === 429;
        const is503Error = error.message?.includes("503") || error.status === 503;

        // Nếu là lỗi rate limit và còn retry
        if ((is429Error || is503Error) && attempt < maxRetries) {
          const waitTime = Math.min(5000 * Math.pow(2, attempt), 20000);
          console.warn(`⚠️ Stream rate limit (attempt ${attempt + 1}/${maxRetries + 1}). Waiting ${waitTime}ms and switching model...`);

          this.markCurrentModelRateLimited();
          const nextModel = this.getNextModelSkippingRateLimited();
          if (nextModel) {
            this.setupModel(nextModel, 'v1beta');
          }

          await new Promise(r => setTimeout(r, waitTime));
          this.initChat("Bạn là trợ lý giáo viên.");
          continue;
        }

        // Final rescue for stream if all retries fail
        if (is429Error && message) {
          console.warn("🚨 [Stream Fallback] Attempting server rescue...");
          try {
            const text = await this.fallbackToOtherProviders(message, false, fileParts);
            yield { text };
            return;
          } catch (e) {
            console.error("Stream rescue also failed", e);
          }
        }

        throw error;
      }
    }

    throw lastError;
  }

  public async generateCrossword(topic: string): Promise<any> {
    await this.ensureInitialized();
    const prompt = `Tạo một trò chơi ô chữ (Crossword) về chủ đề: "${topic}".
    Yêu cầu:
    - Khoảng 8-12 từ vựng liên quan.
    - Có gợi ý (clue) rõ ràng bằng tiếng Việt.
    - Trả về JSON hợp lệ để render lên lưới.
    
    JSON Format:
    {
      "size": 15,
      "words": [
        { "word": "GIAOVIEN", "clue": "Người dạy học", "row": 5, "col": 2, "direction": "across" },
        { "word": "HOCSINH", "clue": "Người đi học", "row": 2, "col": 5, "direction": "down" }
      ]
    }
    RETURN JSON ONLY.`;

    const text = await this.generateText(prompt);
    return this.parseJSONSafely(text);
  }

  public async generateExamQuestionsStructured(prompt: string, fileParts: FilePart[] = []): Promise<any> {
    this.resetRetryCounters();
    return this._generateExamQuestionsStructured(prompt, fileParts);
  }

  private async _generateExamQuestionsStructured(prompt: string, fileParts: FilePart[] = []): Promise<any> {
    await this.ensureInitialized();

    // Thêm hướng dẫn JSON rõ ràng vào prompt TRƯỚC khi gọi bất kỳ nhánh nào (kể cả Server Fallback trên điện thoại)
    const hasCustomBboxSchema = /"bbox"\s*:|page_index/i.test(prompt);
    const enhancedPrompt = hasCustomBboxSchema
      ? `${prompt}

QUAN TRỌNG - YÊU CẦU ĐỊNH DẠNG:
- Trả về DUY NHẤT một JSON object hợp lệ có trường "questions" là mảng các câu hỏi.
- KHÔNG thêm markdown hay giải thích ngoài JSON.
- Giữ nguyên đầy đủ các trường "bbox", "page_index", "has_image" của câu hỏi và của từng phương án trong "options".`
      : `${prompt}

QUAN TRỌNG - YÊU CẦU ĐỊNH DẠNG:
- Trả về DUY NHẤT một JSON object hợp lệ
- KHÔNG thêm markdown, code blocks, hay giải thích
- KHÔNG thêm text nào ngoài JSON
- Đảm bảo tất cả dấu ngoặc kép được đóng đúng
- Đảm bảo tất cả dấu ngoặc {} và [] được đóng đúng

CẤU TRÚC JSON BẮT BUỘC:
{
  "questions": [
    {
      "type": "Trắc nghiệm" hoặc "Tự luận",
      "level": "Nhận biết" hoặc "Thông hiểu" hoặc "Vận dụng" hoặc "Vận dụng cao",
      "content": "Nội dung câu hỏi",
      "image": "",
      "options": [
        {"text": "Đáp án A", "image": ""},
        {"text": "Đáp án B", "image": ""},
        {"text": "Đáp án C", "image": ""},
        {"text": "Đáp án D", "image": ""}
      ],
      "answer": "Đáp án đúng",
      "explanation": "Giải thích"
    }
  ],
  "readingPassage": "Văn bản đọc hiểu (nếu có)"
}`;

    const normalizeExamParsed = (raw: any): any => {
      if (!raw) return raw;
      const obj = Array.isArray(raw)
        ? { questions: raw, readingPassage: '' }
        : typeof raw === 'object'
          ? {
              ...raw,
              questions: Array.isArray(raw.questions)
                ? raw.questions
                : Array.isArray(raw.data)
                  ? raw.data
                  : Array.isArray(raw.cau_hoi)
                    ? raw.cau_hoi
                    : Array.isArray(raw.items)
                      ? raw.items
                      : []
            }
          : { questions: [], readingPassage: '' };

      if (Array.isArray(obj.questions)) {
        obj.questions = obj.questions.map((q: any, idx: number) => {
          const rawType = String(q?.type ?? '').toLowerCase();
          const rawOpts = Array.isArray(q?.options)
            ? q.options
            : Array.isArray(q?.choices)
              ? q.choices
              : Array.isArray(q?.answers)
                ? q.answers
                : [];
          const isEssay =
            rawType.includes('tự luận') ||
            rawType.includes('tu luan') ||
            rawType.includes('điền') ||
            rawType === 'essay' ||
            (rawOpts.length === 0 && rawType !== '' && !rawType.includes('trắc nghiệm') && !rawType.includes('trac nghiem') && !rawType.includes('mcq'));

          const contentVal = q?.content ?? q?.question ?? q?.text ?? q?.prompt ?? q?.cauHoi ?? q?.cau_hoi ?? '';
          const contentStr = typeof contentVal === 'string' ? contentVal : JSON.stringify(contentVal ?? '');

          const normOpts = !isEssay && rawOpts.length > 0
            ? rawOpts.map((opt: any) => {
                if (typeof opt === 'string' || typeof opt === 'number') {
                  return { text: String(opt), image: '' };
                }
                return {
                  text: String(opt?.text ?? opt?.content ?? opt?.label ?? opt?.value ?? ''),
                  image: String(opt?.image ?? opt?.svg ?? ''),
                  ...(Array.isArray(opt?.bbox) && opt.bbox.length === 4 ? { bbox: opt.bbox.map(Number) } : {}),
                  ...(typeof opt?.has_image === 'boolean' ? { has_image: opt.has_image } : {})
                };
              })
            : [];

          return {
            id: q?.id || `gen-${Date.now()}-${idx}`,
            type: isEssay ? 'Tự luận' : 'Trắc nghiệm',
            level: q?.level || 'Thông hiểu',
            content: contentStr,
            question: contentStr,
            image: typeof q?.image === 'string' && q.image ? q.image : (typeof q?.svg === 'string' ? q.svg : ''),
            options: normOpts,
            answer: typeof q?.answer === 'string' ? q.answer : String(q?.answer?.text ?? q?.answer ?? ''),
            correct_option_text: typeof q?.correct_option_text === 'string' ? q.correct_option_text : '',
            explanation: typeof q?.explanation === 'string' ? q.explanation : String(q?.explanation ?? ''),
            ...(typeof q?.has_image === 'boolean' ? { has_image: q.has_image } : {}),
            ...(Array.isArray(q?.bbox) && q.bbox.length === 4 ? { bbox: q.bbox.map(Number) } : {}),
            ...(q?.page_index !== undefined || q?.page !== undefined || q?.pageNumber !== undefined
              ? { page_index: Number(q?.page_index ?? q?.page ?? q?.pageNumber ?? 0) }
              : {})
          };
        });
      }
      return obj;
    };

    if (!this.model) {
      try {
        const text = await this.fallbackToOtherProviders(enhancedPrompt, true, fileParts);
        return normalizeExamParsed(this.parseJSONSafely(text));
      } catch (e: any) {
        console.error("Fallback failed:", e);
        return { error: e.message || "Lỗi kết nối AI Server" };
      }
    }

    const parts: any[] = [{ text: enhancedPrompt }];
    if (fileParts && fileParts.length > 0) {
      fileParts.forEach(p => parts.push(p));
    }

    try {
      // Sử dụng JSON mode nếu đang dùng v1beta và model hỗ trợ
      let result;
      if (this.currentVersion === 'v1beta' && GeminiService.supportsJsonResponseMimeType(this.currentModelName)) {
        const jsonModel = this.genAI!.getGenerativeModel({
          model: this.currentModelName,
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 8192,
          }
        }, { apiVersion: 'v1beta' });

        result = await this.retryWithBackoff(() => jsonModel.generateContent(parts), 2, 1500);
      } else {
        result = await this.retryWithBackoff(() => this.model!.generateContent(parts), 2, 1500);
      }

      return normalizeExamParsed(this.parseJSONSafely(result.response.text()));
    } catch (error: any) {
      const fallbackRes = await this.handleError(error, () => this._generateExamQuestionsStructured(prompt, fileParts), enhancedPrompt, fileParts);
      return normalizeExamParsed(fallbackRes);
    }
  }

  public async generateWorksheetContentDetailed(topic: string, subject: string, config: any, fileParts: FilePart[] = []): Promise<any> {
    await this.ensureInitialized();

    const configDesc = Object.entries(config)
      .filter(([, v]) => (v as number) > 0)
      .map(([k, v]) => {
        const labels: Record<string, string> = {
          mcq: 'Trắc nghiệm', tf: 'Đúng/Sai', fill: 'Điền khuyết',
          match: 'Nối cột', essay: 'Tự luận', arrange: 'Sắp xếp câu',
          circle: 'Khoanh tròn', compare: 'So sánh (>,<,=)', reading: 'Đọc hiểu'
        };
        return `${v} câu ${labels[k] || k}`;
      }).join(', ');

    const hasImage = fileParts && fileParts.length > 0;
    const imageInstruction = hasImage
      ? `\nCÓ ẢNH MẪU ĐÍNH KÈM - Hãy phân tích ảnh mẫu kỹ lưỡng:
- Xác định các DẠNG BÀI có trong ảnh (khoanh tròn, so sánh, điền chỗ trống, đọc hiểu...)
- Xác định ĐỘ KHÓ và PHONG CÁCH trình bày
- Tạo phiếu MỚI HOÀN TOÀN nhưng CÓ CẤU TRÚC TƯƠNG TỰ ảnh mẫu
- imagePrompt của mỗi câu mô tả hình ảnh BÀI TẬP (giống phong cách ảnh mẫu: nhân vật, đồ vật, số liệu cụ thể)`
      : '';

    const subjectHint = subject === 'Toán'
      ? `\nGỢI Ý DẠNG BÀI TOÁN LỚP 1 (dùng thêm type phù hợp):
- "circle": Khoanh vào số/hình lớn nhất/bé nhất (imagePrompt: "3 cartoon kids each holding a sign with number X, Y, Z, colorful, white background, circle the biggest/smallest")
- "compare": So sánh hai số với >, <, = (imagePrompt: "two number boxes XX and YY with empty comparison box between them, grade 1 math worksheet style")
- "arrange": Sắp xếp dãy số từ bé đến lớn hoặc ngược lại (imagePrompt: "cute train with 3-4 empty wagons waiting for numbers, colorful cartoon style")
- "fill": Điền số còn thiếu trong dãy, phép tính (imagePrompt: "math equation with blank: X + Y = __, simple bold numbers, kids worksheet")`
      : subject === 'Tiếng Việt'
        ? `\nGỢI Ý DẠNG BÀI TIẾNG VIỆT LỚP 1:
- "reading": Đọc đoạn văn ngắn rồi trả lời câu hỏi. Đặt nội dung đoạn văn vào field "readingPassage". Câu hỏi là trắc nghiệm 3 lựa chọn A/B/C.
- "fill": Điền tiếng/chữ thích hợp vào chỗ trống (imagePrompt: "cute strawberry cartoon character next to blank line, Vietnamese worksheet style")
- "circle": Khoanh vào chữ/tiếng đúng chính tả (imagePrompt: "Vietnamese word choice exercise: two options in boxes, circle the correct one")
- "essay": Viết câu theo tranh (imagePrompt: "cute Vietnamese kid in a scene related to the topic, simple illustration")` : '';

    const prompt = `Soạn phiếu bài tập môn ${subject} cho học sinh lớp 1, phong cách CHUYÊN NGHIỆP như sách bài tập thực tế.
Chủ đề: "${topic || 'Tổng hợp kiến thức lớp 1'}".
Cơ cấu: ${configDesc}.
${imageInstruction}
${subjectHint}

NGUYÊN TẮC SOẠN:
1. Ngôn ngữ ĐƠN GIẢN, ngắn gọn, dễ đọc với trẻ 6-7 tuổi
2. Mỗi câu phải có "imagePrompt" mô tả ĐÚNG hình ảnh minh họa BÀI TẬP (không phải ảnh trang trí chung chung)
   - imagePrompt viết tiếng Anh, mô tả rõ nội dung số/chữ/hình trong bài, phong cách cartoon dành cho trẻ
3. Trả về JSON THUẦN TÚY, KHÔNG markdown

CẤU TRÚC JSON BẮT BUỘC:
{
  "title": "Phiếu Bài Tập ${subject} Lớp 1 - ${topic || 'Tổng hợp'}",
  "subject": "${subject}",
  "readingPassage": "(chỉ có nội dung nếu có bài đọc hiểu, để trống nếu không)",
  "questions": [
    {
      "id": "1",
      "type": "circle",
      "question": "a) Khoanh vào số lớn nhất:",
      "numbers": ["54", "19", "52"],
      "imagePrompt": "three cheerful cartoon children each holding a sign with numbers 54, 19, 52, colorful cute style, white background, Vietnamese grade 1 math",
      "options": ["54", "19", "52"],
      "answer": "54"
    },
    {
      "id": "2",
      "type": "compare",
      "question": "Điền >, < hoặc = vào ô trống:",
      "pairs": [["25", "35"], ["45", "25"], ["99", "36"]],
      "imagePrompt": "math comparison boxes showing pairs of two-digit numbers with empty box between them, colorful ribbon decoration, Vietnamese worksheet style",
      "options": [],
      "answer": "25 < 35; 45 > 25; 99 > 36"
    },
    {
      "id": "3",
      "type": "arrange",
      "question": "Viết các số 57, 51, 45 theo thứ tự từ bé đến lớn:",
      "imagePrompt": "colorful cartoon train with 3 empty wagon panels waiting to be filled with numbers, Vietnamese grade 1 style",
      "options": ["57", "51", "45"],
      "answer": "45, 51, 57"
    },
    {
      "id": "4",
      "type": "fill",
      "question": "Điền số còn thiếu: 10, 20, ___, 40, ___",
      "imagePrompt": "number line with cute animal characters, missing numbers shown as blank boxes, colorful cartoon",
      "options": [],
      "answer": "30, 50"
    },
    {
      "id": "5",
      "type": "mcq",
      "question": "Câu hỏi trắc nghiệm?",
      "imagePrompt": "cute Vietnamese grade 1 student character related to the question topic, cartoon style",
      "options": ["Đáp án A", "Đáp án B", "Đáp án C"],
      "answer": "Đáp án A"
    }
  ]
}

QUY TẮC FIELD "type":
- "circle": Khoanh vào đáp án đúng trong nhóm. "numbers" là mảng các số/chữ để khoanh, "options" = numbers
- "compare": So sánh các cặp số/đại lượng. "pairs" là mảng cặp [["A","B"],...]. "options" = []
- "arrange": Sắp xếp thứ tự. "options" là các phần tử cần sắp xếp (đã xáo trộn). "answer" là thứ tự đúng
- "fill": Điền khuyết. "options" = []. "answer" là nội dung cần điền
- "mcq": Trắc nghiệm 3-4 lựa chọn. "answer" là đáp án đúng
- "tf": Đúng/Sai. "options" = ["Đúng","Sai"]
- "essay": Tự luận / Viết câu / Vẽ tranh. "options" = []
- "reading": Câu hỏi đọc hiểu (ghép với readingPassage). "options" là 3 phương án A/B/C

QUAN TRỌNG:
- "question" PHẢI là string, KHÔNG phải object hay null
- "options" PHẢI là mảng string [], không phải mảng object  
- "answer" PHẢI là string
- "imagePrompt" PHẢI CÓ trong MỌI câu, mô tả hình ảnh BÀI TẬP CỤ THỂ:
  ĐÚNG: "three kids holding signs with numbers 54, 19, 52, circle the largest"
  SAI: "cute cartoon illustration for kids"

CHỈ XUẤT JSON THUẦN TÚY.`;

    const normalizeWorksheetParsed = (parsed: any) => {
      if (parsed && Array.isArray(parsed.questions)) {
        parsed.questions = parsed.questions.map((q: any, idx: number) => ({
          id: q.id ?? String(idx + 1),
          type: q.type ?? 'essay',
          question: typeof q.question === 'string' ? q.question
            : (typeof q.content === 'string' ? q.content : JSON.stringify(q.question ?? q.content ?? '')),
          imagePrompt: q.imagePrompt ?? q.image ?? '',
          imageUrl: q.imageUrl,
          options: Array.isArray(q.options)
            ? q.options.map((o: any) => typeof o === 'string' ? o : (o?.text ?? JSON.stringify(o)))
            : [],
          answer: typeof q.answer === 'string' ? q.answer : (q.answer?.text ?? String(q.answer ?? '')),
          numbers: q.numbers,
          pairs: q.pairs,
        }));
      }
      return parsed;
    };

    if (!this.model) {
      try {
        const text = await this.fallbackToOtherProviders(prompt, true, fileParts);
        return normalizeWorksheetParsed(this.parseJSONSafely(text));
      } catch (e: any) {
        return { error: e.message || 'Lỗi kết nối AI Server' };
      }
    }

    const parts: any[] = [{ text: prompt }];
    if (fileParts && fileParts.length > 0) {
      fileParts.forEach(p => parts.push(p));
    }

    try {
      let result;
      if (this.currentVersion === 'v1beta' && GeminiService.supportsJsonResponseMimeType(this.currentModelName)) {
        const jsonModel = this.genAI!.getGenerativeModel({
          model: this.currentModelName,
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 8192,
          }
        }, { apiVersion: 'v1beta' });
        result = await this.retryWithBackoff(() => jsonModel.generateContent(parts), 5, 3000);
      } else {
        result = await this.retryWithBackoff(() => this.model!.generateContent(parts), 5, 3000);
      }

      return normalizeWorksheetParsed(this.parseJSONSafely(result.response.text()));
    } catch (error: any) {
      const fallbackRes = await this.handleError(error, () => this.generateWorksheetContentDetailed(topic, subject, config, fileParts), prompt, fileParts);
      return normalizeWorksheetParsed(fallbackRes);
    }
  }

  // Rate Limiter: Đảm bảo khoảng cách tối thiểu giữa các request
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL_MS) {
      const waitTime = this.MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  private isRateLimitError(error: any): boolean {
    const rawMessage = String(error?.message || '').toLowerCase();
    const status = Number(error?.status || error?.response?.status || 0);
    return (
      status === 429 ||
      status === 503 ||
      rawMessage.includes('429') ||
      rawMessage.includes('503') ||
      rawMessage.includes('too many requests') ||
      rawMessage.includes('resource_exhausted') ||
      rawMessage.includes('quota') ||
      rawMessage.includes('rate limit') ||
      rawMessage.includes('quá tải')
    );
  }

  private createRateLimitError(sourceError: any): Error {
    const wrapped = new Error('⚠️ API tạm quá tải (429). Hệ thống đang tự chuyển kênh AI, vui lòng thử lại sau vài giây.');
    (wrapped as any).status = 429;
    (wrapped as any).code = 'RATE_LIMIT';
    (wrapped as any).cause = sourceError;
    return wrapped;
  }

  // Cải thiện retry: chuyển model ngay lập tức nếu lỗi 404/400/403 hoặc 429 thay vì treo 90 giây trên 1 model
  private async retryWithBackoff<T>(fn: () => Promise<T>, retries: number = 2, initialDelay: number = 1000): Promise<T> {
    let lastError: any;
    for (let i = 0; i < retries; i++) {
      try {
        await this.waitForRateLimit();
        return await fn();
      } catch (error: any) {
        lastError = error;
        const msg = String(error?.message || '').toLowerCase();
        const isFatalForCurrentModel =
          msg.includes('404') ||
          msg.includes('not found') ||
          msg.includes('400') ||
          msg.includes('403') ||
          msg.includes('key not valid') ||
          msg.includes('permission');

        if (isFatalForCurrentModel) {
          throw error;
        }

        const is429 = this.isRateLimitError(error);
        if (is429) {
          this.markCurrentModelRateLimited();
          throw this.createRateLimitError(error);
        }

        if (i < retries - 1) {
          const waitTime = initialDelay * Math.pow(1.5, i) + Math.random() * 400;
          console.warn(`⚠️ AI Request failed (attempt ${i + 1}/${retries}). Retrying in ${Math.round(waitTime)}ms...`, error.message);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    throw lastError;
  }

  private async fallbackToOtherProviders(prompt: string, isJson: boolean, fileParts: FilePart[] = []): Promise<string> {
    console.log("🚀 [Fallback] Calling Server API...");
    try {
      const files = fileParts?.map(fp => ({
        data: fp.inlineData.data,
        mimeType: fp.inlineData.mimeType
      }));
      // Dùng model ổn định nhất của server
      const result = await generateWithAI({ prompt, files, provider: 'gemini', model: 'gemini-2.5-flash' });
      return result.text || '';
    } catch (error: any) {
      console.error("❌ [Fallback] Server also failed:", error);
      throw new Error(`⚠️ HẾT HẠN MỨC (429) HOẶC CHƯA CẤU HÌNH API KEY: Toàn bộ kênh trực tiếp và dự phòng đều đang quá tải hoặc chưa có Key. \n\n👉 GIẢI PHÁP: Thầy/Cô vui lòng bấm vào nút "API Key" (biểu tượng 🔑 góc dưới bên trái) để nhập Gemini API Key cá nhân miễn phí nhé.`);
    }
  }

  public async generateQuiz(topic: string, count: number = 5, additionalPrompt: string = ''): Promise<any> {
    this.resetRetryCounters();
    return this._generateQuiz(topic, count, additionalPrompt);
  }

  private async _generateQuiz(topic: string, count: number = 5, additionalPrompt: string = ''): Promise<any> {
    await this.ensureInitialized();
    this.setStatus("Đang soạn câu hỏi Quiz...");

    const prompt = `Soạn ${count} câu hỏi trắc nghiệm vui nhộn về chủ đề "${topic}" cho học sinh tiểu học.
    ${additionalPrompt ? `YÊU CẦU BỔ SUNG TỪ GIÁO VIÊN: "${additionalPrompt}"` : ''}

    YÊU CẦU:
    1. Trả về DUY NHẤT một mảng JSON.
    2. Mỗi câu hỏi có 4 đáp án (options).
    3. Chỉ định rõ đáp án đúng (answer) phải khớp chính xác với một trong các options.
    
    CẤU TRÚC JSON:
    [
      {
        "type": "Trắc nghiệm",
        "question": "Câu hỏi ở đây? CHỈ dùng [IMAGE] nếu thật sự cần hình minh họa.",
        "image": "Chỉ điền mô tả ảnh nếu câu hỏi CẦN hình vẽ, đồ thị. Nếu chỉ có chữ thì ĐỂ TRỐNG.",
        "options": [
          { "text": "Đáp án A", "image": "" },
          { "text": "Đáp án B", "image": "" },
          { "text": "Đáp án C", "image": "" },
          { "text": "Đáp án D", "image": "" }
        ],
        "answer": "A",
        "explanation": "Giải thích ngắn gọn, dễ hiểu cho học sinh"
      }
    ]
    QUAN TRỌNG: 
    - Ưu tiên tối đa việc sử dụng VĂN BẢN (Text) để mô tả câu hỏi và đáp án.
    - CHỈ trả về giá trị cho trường 'image' nếu nội dung đó KHÔNG THỂ viết bằng chữ (ví dụ: hình học phức tạp, sơ đồ, tranh vẽ minh họa).
    - Các công thức toán học, biểu thức hãy viết bằng văn bản hoặc mã Latex đơn giản thay vì yêu cầu ảnh.
    - Trả về DUY NHẤT JSON.`;

    if (!this.model) {
      try {
        const text = await this.fallbackToOtherProviders(prompt, true);
        return this.parseJSONSafely(text);
      } catch (e: any) {
        return { error: e.message || "Lỗi kết nối AI Server" };
      }
    }

    try {
      const generationConfig: any = {
        maxOutputTokens: 8192,
      };
      // Luôn ưu tiên v1beta nếu model là flash, nếu hien tai la v1 thi khong dung JSON mode
      let finalPrompt = prompt;
      const selectedVersion = this.currentVersion;
      if (selectedVersion === 'v1beta' && GeminiService.supportsJsonResponseMimeType(this.currentModelName)) {
        generationConfig.responseMimeType = "application/json";
      } else {
        finalPrompt += "\n\nRETURN ONLY VALID JSON ARRAY. NO MARKDOWN.";
      }

      const jsonModel = this.genAI!.getGenerativeModel({
        model: this.currentModelName,
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
        generationConfig
      }, { apiVersion: selectedVersion });

      const result = await this.retryWithBackoff(() => jsonModel.generateContent(finalPrompt), 5, 3000);
      const text = result.response.text();
      return this.parseJSONSafely(text);
    } catch (error: any) {
      console.error("Lỗi tạo Quiz:", error);
      try {
        return await this.handleError(error, () => this._generateQuiz(topic, count, additionalPrompt));
      } catch (finalError) {
        const text = await this.fallbackToOtherProviders(prompt, true);
        return this.parseJSONSafely(text);
      }
    }
  }

  // --- HÌNH ẢNH & GỢI Ý ---

  private pcmBase64ToWavDataUrl(base64Pcm: string, sampleRate: number = 24000): string {
    const binaryString = atob(base64Pcm);
    const dataSize = binaryString.length;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true);  // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < dataSize; i++) {
      bytes[44 + i] = binaryString.charCodeAt(i);
    }

    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
    }
    return `data:audio/wav;base64,${btoa(binary)}`;
  }

  public async generateSpeech(text: string, voice: string): Promise<string | null> {
    this.refreshKeys();
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

    // 1. Thử tạo giọng đọc qua Gemini 2.5 Flash TTS nếu có API Key cá nhân
    for (const key of this.allApiKeys) {
      try {
        const res = await fetch(
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

        if (res.ok) {
          const data: any = await res.json();
          const inlineData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
          if (inlineData?.data) {
            const mimeType: string = inlineData.mimeType || '';
            if (mimeType.includes('pcm') || mimeType.includes('L16')) {
              return this.pcmBase64ToWavDataUrl(inlineData.data, selectedVoiceCfg.sampleRate);
            }
            return `data:${mimeType || 'audio/wav'};base64,${inlineData.data}`;
          }
        }
      } catch (e) {
        console.warn('[TTS] Gemini client TTS failed, trying server fallback...', e);
      }
    }

    // 2. Fallback qua Serverless API /api/tts (trả về file .wav hoặc .mp3 tiếng Việt)
    try {
      const serverRes = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice }),
      });
      if (serverRes.ok) {
        const data = await serverRes.json();
        if (data?.audioUrl) {
          return data.audioUrl;
        }
      }
    } catch (e) {
      console.warn('[TTS] Server /api/tts failed:', e);
    }

    return null;
  }

  private currentSpeechAudio: HTMLAudioElement | null = null;
  private speechAudioCache: Map<string, string> = new Map();

  public cleanMathAndSymbolsForSpeech(rawText: string): string {
    if (!rawText) return '';
    return String(rawText)
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' hình minh họa ')
      .replace(/\[(HÌNH ẢNH|IMAGE|IMG|HÌNH|CẮT ẢNH|CẮT ẢNH TỪ ĐỀ):?.*?\]/gi, '')
      .replace(/[*_#`~]+/g, ' ')
      .replace(/\.{2,}|_{2,}|…+/g, ' chỗ trống ')
      .replace(/(\d+)\s*\+\s*(\d+)/g, '$1 cộng $2')
      .replace(/(\d+)\s*-\s*(\d+)/g, '$1 trừ $2')
      .replace(/(\d+)\s*[x×\*]\s*(\d+)/g, '$1 nhân $2')
      .replace(/(\d+)\s*[:÷]\s*(\d+)/g, '$1 chia $2')
      .replace(/=\s*\?/g, ' bằng mấy? ')
      .replace(/=/g, ' bằng ')
      .replace(/</g, ' bé hơn ')
      .replace(/>/g, ' lớn hơn ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  public formatQuestionForSpeech(questionText: string, options?: any[], questionNumber?: number): string {
    const cleanQ = this.cleanMathAndSymbolsForSpeech(questionText);
    const prefix = typeof questionNumber === 'number' ? `Câu ${questionNumber}: ` : '';
    const optList = Array.isArray(options) ? options : [];
    const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
    const spokenOptions: string[] = [];

    optList.forEach((opt, idx) => {
      const rawOpt = typeof opt === 'string' || typeof opt === 'number'
        ? String(opt)
        : String(opt?.text || opt?.label || opt?.content || '');
      const strippedOpt = rawOpt.replace(/^[A-F][\.\:\)]\s*/i, '').trim();
      const cleanOpt = this.cleanMathAndSymbolsForSpeech(strippedOpt);
      if (cleanOpt) {
        spokenOptions.push(`Đáp án ${labels[idx] || idx + 1}: ${cleanOpt}`);
      }
    });

    if (spokenOptions.length > 0) {
      return `${prefix}${cleanQ}. ${spokenOptions.join('. ')}.`;
    }
    return `${prefix}${cleanQ}`;
  }

  public stopSpeakingQuestion(): void {
    if (this.currentSpeechAudio) {
      try {
        this.currentSpeechAudio.pause();
        this.currentSpeechAudio.currentTime = 0;
      } catch {}
      this.currentSpeechAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }

  public async speakQuestionText(
    rawText: string,
    voice: 'Kore' | 'Puck' | 'Boy' | 'Girl' = 'Puck',
    onStart?: () => void,
    onEnd?: () => void
  ): Promise<void> {
    this.stopSpeakingQuestion();
    const cleaned = this.cleanMathAndSymbolsForSpeech(rawText);
    if (!cleaned) {
      onEnd?.();
      return;
    }

    const cacheKey = `${voice}::${cleaned}`;
    let audioDataUrl = this.speechAudioCache.get(cacheKey) || null;

    if (!audioDataUrl) {
      try {
        audioDataUrl = await this.generateSpeech(cleaned, voice);
        if (audioDataUrl) {
          this.speechAudioCache.set(cacheKey, audioDataUrl);
        }
      } catch (e) {
        console.warn('[speakQuestionText] generateSpeech fallback:', e);
      }
    }

    if (audioDataUrl) {
      try {
        const audio = new Audio(audioDataUrl);
        this.currentSpeechAudio = audio;
        const isChildVoice = voice === 'Boy' || voice === 'Girl';
        const isMp3Fallback = audioDataUrl.startsWith('data:audio/mpeg');
        if (isChildVoice && isMp3Fallback) {
          (audio as any).preservesPitch = false;
          (audio as any).mozPreservesPitch = false;
          (audio as any).webkitPreservesPitch = false;
          audio.playbackRate = voice === 'Girl' ? 1.24 : 1.18;
        } else {
          (audio as any).preservesPitch = true;
          audio.playbackRate = 0.96; // Đọc chậm rãi, rõ ràng cho học sinh Lớp 1
        }
        audio.onplay = () => onStart?.();
        audio.onended = () => {
          this.currentSpeechAudio = null;
          onEnd?.();
        };
        audio.onerror = () => {
          this.currentSpeechAudio = null;
          onEnd?.();
        };
        await audio.play();
        return;
      } catch (playErr) {
        console.warn('[speakQuestionText] Audio play failed, using speechSynthesis:', playErr);
      }
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(cleaned);
        utterance.lang = 'vi-VN';
        utterance.rate = 0.88;
        utterance.pitch = voice === 'Girl' ? 1.55 : voice === 'Boy' ? 1.38 : voice === 'Kore' ? 0.88 : 1.08;
        const voices = window.speechSynthesis.getVoices();
        const viVoices = voices.filter(v => v.lang.includes('vi'));
        if (viVoices.length > 0) {
          utterance.voice = viVoices[0];
        }
        utterance.onstart = () => onStart?.();
        utterance.onend = () => onEnd?.();
        utterance.onerror = () => onEnd?.();
        window.speechSynthesis.speak(utterance);
        return;
      } catch {}
    }

    onEnd?.();
  }

  public async generateImage(prompt: string): Promise<string> {
    // Rút ngắn prompt vừa phải để tránh URL quá dài (> 2000 chars total) nhưng vẫn giữ được ý nghĩa
    const shortPrompt = prompt.length > 500 ? prompt.substring(0, 500) : prompt;
    const enhancedPrompt = `${shortPrompt}, cute cartoon for kids, white background, high quality, educational illustration`;

    // Danh sách các nguồn phát sinh ảnh (ưu tiên các endpoint ổn định)
    const endpoints = [
      // Flux via Pollinations (Nguồn tốt nhất hiện tại)
      `https://pollinations.ai/p/${encodeURIComponent(enhancedPrompt)}?width=512&height=512&model=flux&nologo=true&seed=${Math.floor(Math.random() * 999999)}`,
      // Turbo via Pollinations (Nhanh hơn Flux)
      `https://pollinations.ai/p/${encodeURIComponent(enhancedPrompt)}?width=512&height=512&model=turbo&nologo=true&seed=${Math.floor(Math.random() * 999999)}`,
      // Các endpoint phụ
      `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?nologo=true&seed=${Math.floor(Math.random() * 999999)}`,
      `https://gen.pollinations.ai/image/${encodeURIComponent(enhancedPrompt)}?nologo=true`
    ];

    for (let i = 0; i < endpoints.length; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 35000);

        console.log(`[Image] Thử nguồn ${i + 1}/${endpoints.length}`);
        const response = await fetch(endpoints[i], { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
          const blob = await response.blob();
          if (blob.size > 1000 && blob.type.startsWith('image/')) {
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          }
          console.warn(`[Image] Blob không hợp lệ: size=${blob.size}, type=${blob.type}`);
        } else {
          console.warn(`[Image] HTTP ${response.status} từ nguồn ${i + 1}`);
        }
      } catch (error: any) {
        console.warn(`[Image] Lỗi nguồn ${i + 1}:`, error.name === 'AbortError' ? 'Timeout' : error.message);
      }

      if (i < endpoints.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // --- Phương án 3: AI Horde (stablehorde.net) - miễn phí, không cần key ---
    try {
      console.log('[Image] Thử AI Horde...');
      const hordeRes = await fetch('https://stablehorde.net/api/v2/generate/async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': '0000000000' },
        body: JSON.stringify({
          prompt: enhancedPrompt,
          params: { width: 512, height: 512, steps: 20, n: 1 },
          nsfw: false,
          models: ['Deliberate']
        })
      });

      if (hordeRes.ok) {
        const hordeData = await hordeRes.json();
        const hordeId = hordeData.id;
        if (hordeId) {
          // Polling chờ kết quả (tối đa 60s)
          for (let poll = 0; poll < 20; poll++) {
            await new Promise(r => setTimeout(r, 3000));
            const statusRes = await fetch(`https://stablehorde.net/api/v2/generate/status/${hordeId}`);
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.done && statusData.generations && statusData.generations.length > 0) {
                const imgUrl = statusData.generations[0].img;
                if (imgUrl) {
                  // Tải ảnh về dạng data URL
                  const imgRes = await fetch(imgUrl);
                  if (imgRes.ok) {
                    const imgBlob = await imgRes.blob();
                    return new Promise((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resolve(reader.result as string);
                      reader.onerror = reject;
                      reader.readAsDataURL(imgBlob);
                    });
                  }
                }
              }
            }
          }
        }
      }
    } catch (hordeErr: any) {
      console.warn('[Image] AI Horde lỗi:', hordeErr.message);
    }

    // --- Phương án 4: Fallback tối thượng - Trả về trực tiếp URL ảnh thay vì DataURL ---
    // Điều này giúp vượt qua các lỗi Fetch/CORS/Blob nếu có, trình duyệt sẽ tự tải ảnh khi hiển thị
    console.log('[Image] Toàn bộ fetch thất bại. Trả về URL trực tiếp làm phương án cuối.');
    return endpoints[0]; // Trả về URL Flux trực tiếp
  }
  private renderFallbackSceneDataUrl(titleText: string, styleName: string = 'Hoạt hình', sceneIdx: number = 0): string {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const palettes = [
      ['#38bdf8', '#e0f2fe', '#fef9c3'],
      ['#60a5fa', '#dbeafe', '#dcfce7'],
      ['#f472b6', '#fce7f3', '#fef3c7'],
      ['#818cf8', '#e0e7ff', '#d1fae5']
    ];
    const pal = palettes[sceneIdx % palettes.length];

    // Nền bầu trời chuyển sắc theo phân cảnh
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 720);
    skyGrad.addColorStop(0, pal[0]);
    skyGrad.addColorStop(0.65, pal[1]);
    skyGrad.addColorStop(1, pal[2]);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, 1280, 720);

    // Mặt trời
    const sunX = 1060 - (sceneIdx * 180) % 700;
    const sunGrad = ctx.createRadialGradient(sunX, 135, 20, sunX, 135, 110);
    sunGrad.addColorStop(0, '#fde047');
    sunGrad.addColorStop(0.6, '#facc15');
    sunGrad.addColorStop(1, 'rgba(250, 204, 21, 0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, 135, 110, 0, Math.PI * 2);
    ctx.fill();

    // Đám mây
    const drawCloud = (cx: number, cy: number, scale: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(0, 0, 40, 0, Math.PI * 2);
      ctx.arc(35, -10, 50, 0, Math.PI * 2);
      ctx.arc(75, 0, 40, 0, Math.PI * 2);
      ctx.arc(35, 15, 45, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    drawCloud(180 + sceneIdx * 40, 130, 1.1);
    drawCloud(520 - sceneIdx * 30, 95, 0.85);
    drawCloud(840 + sceneIdx * 20, 160, 0.95);

    // Đồi cỏ xanh phía xa và gần
    ctx.fillStyle = '#86efac';
    ctx.beginPath();
    ctx.moveTo(0, 540);
    ctx.quadraticCurveTo(340, 430, 720, 520);
    ctx.quadraticCurveTo(1040, 590, 1280, 490);
    ctx.lineTo(1280, 720);
    ctx.lineTo(0, 720);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.moveTo(0, 590);
    ctx.quadraticCurveTo(420, 500, 860, 580);
    ctx.quadraticCurveTo(1100, 620, 1280, 560);
    ctx.lineTo(1280, 720);
    ctx.lineTo(0, 720);
    ctx.closePath();
    ctx.fill();

    // Cây xanh trang trí
    const drawTree = (tx: number, ty: number, s: number) => {
      ctx.save();
      ctx.translate(tx, ty);
      ctx.scale(s, s);
      ctx.fillStyle = '#854d0e';
      ctx.fillRect(-12, 0, 24, 70);
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.arc(0, -25, 48, 0, Math.PI * 2);
      ctx.arc(-32, 5, 38, 0, Math.PI * 2);
      ctx.arc(32, 5, 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    drawTree(150, 510, 1.15);
    drawTree(1130, 485, 1.25);
    drawTree(1020, 535, 0.85);

    // Khung bảng bài học ở trung tâm
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 8;
    const bx = 220, by = 170, bw = 840, bh = 310, br = 36;
    ctx.beginPath();
    ctx.moveTo(bx + br, by);
    ctx.lineTo(bx + bw - br, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + br);
    ctx.lineTo(bx + bw, by + bh - br);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - br, by + bh);
    ctx.lineTo(bx + br, by + bh);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - br);
    ctx.lineTo(bx, by + br);
    ctx.quadraticCurveTo(bx, by, bx + br, by);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#4f46e5';
    ctx.font = 'bold 24px "Be Vietnam Pro", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`🎬 CẢNH ${sceneIdx + 1} • BÀI GIẢNG HOẠT HÌNH AI`, 640, 230);

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 32px "Be Vietnam Pro", Arial, sans-serif';
    const words = (titleText || 'Bài học sáng tạo').trim().split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';
    for (const w of words) {
      const test = currentLine ? `${currentLine} ${w}` : w;
      if (ctx.measureText(test).width > 740) {
        if (currentLine) lines.push(currentLine);
        currentLine = w;
      } else {
        currentLine = test;
      }
    }
    if (currentLine) lines.push(currentLine);
    const displayLines = lines.slice(0, 4);
    const startY = 305 - ((displayLines.length - 1) * 20);
    displayLines.forEach((line, idx) => {
      ctx.fillText(line, 640, startY + idx * 46);
    });
    ctx.restore();

    return canvas.toDataURL('image/png');
  }

  public stripCommandPrefix(rawInput: string): string {
    return (rawInput || '')
      .trim()
      .replace(/^(xin chào[,.\s]*)?(thầy cô|bạn|ai|hệ thống)?[,.\s]*(hãy|vui lòng|giúp tôi|giúp mình|làm ơn)?\s*(tạo|làm|xây dựng|viết|soạn|vẽ|thiết kế|cho tôi|cho mình)\s*(một\s+|1\s+)?(video|clip|bài giảng|phim|hoạt hình|câu chuyện|kịch bản)\s*(ngắn\s+|hoạt hình\s+|giáo dục\s+|minh họa\s+)*(về\s+|cho\s+|chủ đề\s+|nội dung\s+|kể chuyện\s+|bài\s+|môn\s+)?/i, '')
      .replace(/\s+(giúp tôi|giúp mình|nhé|nha|với ạ|ạ)\s*[.!?]*$/i, '')
      .trim() || rawInput.trim();
  }

  public async generateVideoStoryboard(
    userInput: string,
    styleName: string = 'Hoạt hình đơn giản'
  ): Promise<{
    title: string;
    fullNarration: string;
    scenes: Array<{
      sceneTitle: string;
      narration: string;
      visualPrompt: string;
      effect: 'sparkles' | 'clouds' | 'rain' | 'bubbles' | 'leaves';
      motion: 'zoom-in' | 'pan-right' | 'pan-left' | 'zoom-out';
      imageUrl: string;
    }>;
  }> {
    const cleanSubject = this.stripCommandPrefix(userInput);
    const motions: Array<'zoom-in' | 'pan-right' | 'pan-left' | 'zoom-out'> = ['zoom-in', 'pan-right', 'pan-left', 'zoom-out'];
    const effects: Array<'sparkles' | 'clouds' | 'rain' | 'bubbles' | 'leaves'> = ['sparkles', 'clouds', 'leaves', 'bubbles'];

    let rawScenes: Array<{
      sceneTitle: string;
      narration: string;
      visualPrompt: string;
      effect?: 'sparkles' | 'clouds' | 'rain' | 'bubbles' | 'leaves';
    }> = [];
    let videoTitle = cleanSubject;

    try {
      const prompt = `Người dùng vừa nhập yêu cầu tạo video giáo dục: "${userInput}".
Hãy đóng vai biên kịch phim hoạt hình giáo dục cho học sinh Việt Nam, viết kịch bản video gồm ĐÚNG 3 phân cảnh liên tiếp (Mở đầu - Khám phá - Bài học/Kết thúc).

QUY TẮC TUYỆT ĐỐI QUAN TRỌNG:
1. Trường "narration" (Lời thuyết minh):
   - Phải là lời kể chuyện hoặc lời giảng bài truyền cảm, thân thiện trực tiếp dành cho học sinh (Ví dụ: "Các em thân mến! Hôm nay chúng mình cùng khám phá...", "Ngày xửa ngày xưa...").
   - TUYỆT ĐỐI KHÔNG đọc lại hay nhắc lại câu lệnh của giáo viên (CẤM dùng các cụm từ như "Tạo video về...", "Hãy làm video...", "Video này nói về...", "Theo yêu cầu của bạn...").
   - Mỗi cảnh chỉ 1-2 câu ngắn gọn, súc tích, dễ hiểu (khoảng 18-30 chữ mỗi cảnh).
2. Trường "visualPrompt": Mô tả chi tiết bối cảnh hình ảnh bằng tiếng Anh (khoảng 20-30 từ) theo phong cách "${styleName}, cute 2D/3D educational animation for kids, vibrant colors, no text" để AI vẽ từng phân cảnh khác nhau.
3. Trường "effect": Chọn 1 trong các hiệu ứng hạt chuyển động phù hợp với cảnh: "sparkles" | "clouds" | "rain" | "bubbles" | "leaves".

CHỈ TRẢ VỀ JSON HỢP LỆ THEO ĐÚNG CẤU TRÚC SAU (KHÔNG MARKDOWN):
{
  "title": "Tên bài học / câu chuyện",
  "scenes": [
    {
      "sceneTitle": "Cảnh 1: Mở đầu",
      "narration": "Lời thuyết minh cảnh 1...",
      "visualPrompt": "English visual description for scene 1...",
      "effect": "clouds"
    },
    {
      "sceneTitle": "Cảnh 2: Khám phá",
      "narration": "Lời thuyết minh cảnh 2...",
      "visualPrompt": "English visual description for scene 2...",
      "effect": "sparkles"
    },
    {
      "sceneTitle": "Cảnh 3: Bài học bổ ích",
      "narration": "Lời thuyết minh cảnh 3...",
      "visualPrompt": "English visual description for scene 3...",
      "effect": "leaves"
    }
  ]
}`;

      const responseText = await this.generateText(prompt);
      const parsed = this.parseJSONSafely(responseText);
      const candidateScenes = Array.isArray(parsed?.scenes)
        ? parsed.scenes
        : Array.isArray(parsed)
          ? parsed
          : [];

      if (parsed?.title && typeof parsed.title === 'string') {
        videoTitle = parsed.title;
      }

      if (candidateScenes.length > 0) {
        rawScenes = candidateScenes.slice(0, 4).map((sc: any, idx: number) => ({
          sceneTitle: sc.sceneTitle || sc.title || `Cảnh ${idx + 1}`,
          narration: this.stripCommandPrefix(String(sc.narration || sc.text || sc.script || '')),
          visualPrompt: String(sc.visualPrompt || sc.imagePrompt || `${cleanSubject} scene ${idx + 1}, ${styleName}`),
          effect: ['sparkles', 'clouds', 'rain', 'bubbles', 'leaves'].includes(sc.effect) ? sc.effect : effects[idx % effects.length],
        })).filter((sc: any) => sc.narration.length > 0);
      }
    } catch (e) {
      console.warn('[VideoStoryboard] AI script generation fallback:', e);
    }

    if (rawScenes.length === 0) {
      rawScenes = [
        {
          sceneTitle: 'Cảnh 1: Mở đầu',
          narration: `Các em học sinh thân mến! Hôm nay chúng mình cùng khám phá bài học thú vị về ${cleanSubject} nhé!`,
          visualPrompt: `Happy elementary school kids and teacher exploring ${cleanSubject}, wide shot, sunny outdoor background, ${styleName}`,
          effect: 'clouds',
        },
        {
          sceneTitle: 'Cảnh 2: Tìm hiểu kiến thức',
          narration: `Qua những hình ảnh trực quan sinh động, chúng ta thấy ${cleanSubject} gắn liền với nhiều điều kỳ diệu trong cuộc sống xung quanh.`,
          visualPrompt: `Detailed educational close up illustration showing how ${cleanSubject} works in nature and daily life, colorful cartoon, ${styleName}`,
          effect: 'sparkles',
        },
        {
          sceneTitle: 'Cảnh 3: Tổng kết bài học',
          narration: `Các em hãy ghi nhớ những kiến thức bổ ích hôm nay và cùng chia sẻ với bạn bè, người thân nhé!`,
          visualPrompt: `Joyful children smiling and celebrating learning achievement about ${cleanSubject} in a bright colorful classroom, ${styleName}`,
          effect: 'leaves',
        }
      ];
    }

    // Tạo hình ảnh minh họa riêng biệt cho từng phân cảnh song song
    const scenesWithImages = await Promise.all(
      rawScenes.map(async (sc, idx) => {
        const imgUrl = await this.generateVideo(
          `${sc.visualPrompt}, scene ${idx + 1}`,
          `${sc.sceneTitle}: ${sc.narration}`,
          styleName,
          idx
        );
        return {
          sceneTitle: sc.sceneTitle,
          narration: sc.narration,
          visualPrompt: sc.visualPrompt,
          effect: sc.effect || effects[idx % effects.length],
          motion: motions[idx % motions.length],
          imageUrl: imgUrl,
        };
      })
    );

    const fullNarration = scenesWithImages.map(s => s.narration).join(' ');
    return {
      title: videoTitle,
      fullNarration,
      scenes: scenesWithImages,
    };
  }

  public async generateVideo(prompt: string, originalTopic?: string, styleName?: string, sceneIdx: number = 0): Promise<string> {
    const shortPrompt = prompt.length > 380 ? prompt.substring(0, 380) : prompt;
    const enhancedPrompt = `${shortPrompt}, cinematic 16:9, ${styleName || 'animation style'}, cute illustration for kids, educational, vibrant colors`;
    const seed = Math.floor(Math.random() * 999999);

    const endpoints = [
      `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=960&height=540&nologo=true&seed=${seed}`,
      `https://pollinations.ai/p/${encodeURIComponent(enhancedPrompt)}?width=960&height=540&model=flux&nologo=true&seed=${seed}`,
      `https://pollinations.ai/p/${encodeURIComponent(enhancedPrompt)}?width=960&height=540&model=turbo&nologo=true&seed=${seed}`
    ];

    // 1. Thử tải ảnh 16:9 từ các nguồn Pollinations với timeout ngắn (12s)
    for (let i = 0; i < endpoints.length; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        const response = await fetch(endpoints[i], { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
          const blob = await response.blob();
          if (blob.size > 1000 && (blob.type.startsWith('video/') || blob.type.startsWith('image/'))) {
            return await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          }
        }
      } catch (error: any) {
        console.warn(`[Video] Nguồn ${i + 1} lỗi hoặc timeout:`, error?.message || error);
      }
    }

    // 2. Nếu nguồn ảnh bên ngoài bị chặn/quá tải, dùng Gemini vẽ tranh minh họa SVG 16:9 chất lượng cao
    try {
      const svgPrompt = `Hãy tạo một bức tranh minh họa định dạng SVG (tỉ lệ 16:9, viewBox="0 0 1280 720", width="1280", height="720") thật đẹp, sinh động, nhiều màu sắc tươi sáng dành cho học sinh tiểu học để minh họa cho kịch bản video: "${originalTopic || prompt}".
      Phong cách: ${styleName || 'Hoạt hình thiếu nhi'}.
      YÊU CẦU BẮT BUỘC:
      - Chỉ trả về duy nhất mã <svg ...>...</svg>, không có markdown, không giải thích.
      - Sử dụng màu chuyển sắc (linearGradient/radialGradient), vẽ bối cảnh bầu trời, thiên nhiên/lớp học, nhân vật hoặc vật thể chính rõ ràng, dễ thương.`;
      const svgRes = await this.generateText(svgPrompt);
      const svgMatch = svgRes.match(/<svg[\s\S]*?<\/svg>/i);
      if (svgMatch) {
        const svgString = svgMatch[0];
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);
        const pngDataUrl = await new Promise<string>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 1280;
            canvas.height = 720;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              URL.revokeObjectURL(svgUrl);
              reject(new Error('No canvas context'));
              return;
            }
            ctx.fillStyle = '#e0f2fe';
            ctx.fillRect(0, 0, 1280, 720);
            ctx.drawImage(img, 0, 0, 1280, 720);
            URL.revokeObjectURL(svgUrl);
            resolve(canvas.toDataURL('image/png'));
          };
          img.onerror = (err) => {
            URL.revokeObjectURL(svgUrl);
            reject(err);
          };
          img.src = svgUrl;
        });
        if (pngDataUrl) return pngDataUrl;
      }
    } catch (svgErr) {
      console.warn('[Video] Tạo SVG minh họa dự phòng không thành công:', svgErr);
    }

    // 3. Fallback an toàn tuyệt đối bằng Canvas 2D HD (không bao giờ lỗi mạng)
    return this.renderFallbackSceneDataUrl(originalTopic || prompt, styleName, sceneIdx);
  }

  public async generateSuggestions(history: any[], personaName: string) {
    await this.ensureInitialized();
    if (!this.genAI) return ["Hãy kể cho tôi nghe thêm về chủ đề này", "Tôi nên bắt đầu từ đâu?", "Bạn có thể ví dụ không?"];
    try {
      const res = await this.generateText(`Dựa trên cuộc trò chuyện: ${history.slice(-2).join(' | ')}. Gợi ý 3 câu hỏi tiếp theo ngắn gọn.`);
      return res.split('\n').filter(s => s.trim().length > 5).slice(0, 3);
    } catch {
      return ["Hãy kể cho tôi nghe thêm về chủ đề này", "Tôi nên bắt đầu từ đâu?", "Bạn có thể ví dụ không?"];
    }
  }

  public async digitizeExamFromFiles(
    fileParts: FilePart[],
    callbacks?: {
      onProgress?: (msg: string) => void;
      onPartialResult?: (questions: any[]) => void;
      shouldStop?: () => boolean;
    }
  ): Promise<any[]> {
    const onProgress = callbacks?.onProgress;
    const onPartialResult = callbacks?.onPartialResult;
    const shouldStop = callbacks?.shouldStop || (() => false);

    const base64ToUint8Array = (data: string) => {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    };

    const convertPdfPartToImages = async (
      base64: string
    ): Promise<{ imageParts: FilePart[]; pageImages: string[]; pageTexts: string[]; numPages: number } | null> => {
      try {
        const pdfjsLib = await loadPdfJsLibrary();
        const pdfBytes = base64ToUint8Array(base64);

        let pdf: any;
        try {
          pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
        } catch (workerErr) {
          console.warn('[digitizeExamFromFiles] Retrying PDF.js with disableWorker: true', workerErr);
          pdf = await pdfjsLib.getDocument({ data: base64ToUint8Array(base64), disableWorker: true }).promise;
        }

        const imageParts: FilePart[] = [];
        const pageImages: string[] = [];
        const pageTexts: string[] = [];

        const maxPages = Math.min(pdf.numPages, 40);
        for (let i = 1; i <= maxPages; i++) {
          if (shouldStop()) throw new Error('Đã dừng xử lý file.');
          onProgress?.(`Đang đọc file PDF: trang ${i}/${maxPages}...`);
          await new Promise(resolve => setTimeout(resolve, 15));

          const page = await pdf.getPage(i);

          // Trích xuất lớp văn bản gốc từ trang PDF (nếu file PDF có chứa text)
          let extractedPageText = '';
          try {
            const textContent = await page.getTextContent();
            if (textContent && Array.isArray(textContent.items)) {
              let lastY: number | null = null;
              const chunks: string[] = [];
              for (const item of textContent.items) {
                const str = typeof item?.str === 'string' ? item.str : '';
                const y = Array.isArray(item?.transform) ? Number(item.transform[5]) : null;
                if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
                  chunks.push('\n');
                } else if (chunks.length > 0 && !chunks[chunks.length - 1].endsWith('\n') && !chunks[chunks.length - 1].endsWith(' ')) {
                  chunks.push(' ');
                }
                chunks.push(str);
                if (y !== null) lastY = y;
              }
              extractedPageText = chunks.join('').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
            }
          } catch {
            extractedPageText = '';
          }
          pageTexts.push(extractedPageText);

          const unscaled = page.getViewport({ scale: 1.0 });
          const targetScale = unscaled.width > 0 ? Math.min(1.8, Math.max(1.0, 1280 / unscaled.width)) : 1.3;
          const viewport = page.getViewport({ scale: targetScale });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = Math.round(viewport.height);
          canvas.width = Math.round(viewport.width);
          await page.render({ canvasContext: context!, viewport }).promise;

          const imgData = canvas.toDataURL('image/jpeg', 0.84);
          pageImages.push(imgData);
          imageParts.push({
            inlineData: {
              data: imgData.split(',')[1],
              mimeType: 'image/jpeg'
            }
          });
          canvas.width = 0;
          canvas.height = 0;
        }
        return { imageParts, pageImages, pageTexts, numPages: pdf.numPages };
      } catch (e: any) {
        console.error('[digitizeExamFromFiles] PDF Convert Error:', e);
        if (e?.message?.includes('dừng')) throw e;
        return null;
      }
    };

    const trimWhitespaceFromCanvas = (sourceCanvas: HTMLCanvasElement, pad = 14): HTMLCanvasElement | null => {
      const ctx = sourceCanvas.getContext('2d');
      if (!ctx || sourceCanvas.width === 0 || sourceCanvas.height === 0) return sourceCanvas;
      const { width, height } = sourceCanvas;
      const imgData = ctx.getImageData(0, 0, width, height);
      const { data } = imgData;

      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];
          // Điểm ảnh không phải màu nền trắng hoặc xám nhạt viền trang (#f4f3ef)
          if (a > 20 && (r < 236 || g < 236 || b < 232)) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (maxX < minX || maxY < minY || maxX - minX < 8 || maxY - minY < 8) {
        return null;
      }

      const cropW = maxX - minX + 1;
      const cropH = maxY - minY + 1;
      const out = document.createElement('canvas');
      out.width = cropW + pad * 2;
      out.height = cropH + pad * 2;
      const outCtx = out.getContext('2d');
      if (!outCtx) return sourceCanvas;
      outCtx.fillStyle = '#ffffff';
      outCtx.fillRect(0, 0, out.width, out.height);
      outCtx.drawImage(sourceCanvas, minX, minY, cropW, cropH, pad, pad, cropW, cropH);
      return out;
    };

    const detectSafeQuestionTopNormY = (img: HTMLImageElement): number => {
      try {
        const probeW = 200;
        const probeH = 100;
        const c = document.createElement('canvas');
        c.width = probeW;
        c.height = probeH;
        const ctx = c.getContext('2d');
        if (!ctx) return 25;
        ctx.drawImage(img, 0, 0, img.width, Math.round(img.height * 0.22), 0, 0, probeW, probeH);
        const data = ctx.getImageData(0, 0, probeW, probeH).data;

        let lastHeaderRow = -1;
        for (let y = 0; y < probeH; y++) {
          let coloredCount = 0;
          // Chỉ xét vùng giữa trang (từ 15% đến 85% chiều ngang) để tránh viền xám 2 bên
          for (let x = 30; x < 170; x++) {
            const idx = (y * probeW + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            if (r < 230 || g < 230 || b < 230) {
              coloredCount++;
            }
          }
          // Thanh tiêu đề đỏ VioEdu hoặc thanh tab trình duyệt thường phủ > 65% chiều ngang ở phía trên cùng (y < 65)
          if (y < 65 && coloredCount > 95) {
            lastHeaderRow = y;
          }
        }

        if (lastHeaderRow >= 0) {
          // Quy đổi từ probeH (tương ứng 22% chiều cao ảnh) sang hệ 0..1000
          const normY = Math.round(((lastHeaderRow + 4) / probeH) * 220);
          return Math.min(145, Math.max(20, normY));
        }
        return 20;
      } catch {
        return 25;
      }
    };

    const cropImageFromBbox = (
      base64Image: string,
      bbox: number[],
      mode: 'question' | 'option' = 'question',
      optionIndex?: number
    ): Promise<string> => {
      return new Promise((resolve) => {
        if (!base64Image || !Array.isArray(bbox) || bbox.length !== 4) {
          resolve('');
          return;
        }
        let [ymin, xmin, ymax, xmax] = bbox.map(Number);
        if (
          !Number.isFinite(ymin) ||
          !Number.isFinite(xmin) ||
          !Number.isFinite(ymax) ||
          !Number.isFinite(xmax) ||
          ymax <= ymin + 8 ||
          xmax <= xmin + 8
        ) {
          resolve('');
          return;
        }

        const img = new Image();
        img.onload = () => {
          if (img.width === 0 || img.height === 0) {
            resolve('');
            return;
          }
          const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
          const isWidescreen = img.width > img.height * 1.25;

          if (mode === 'question') {
            const safeTop = detectSafeQuestionTopNormY(img);
            // Nếu bbox nằm ở nửa trên trang đề (ymin < 320), tự động mở rộng lên safeTop để KHÔNG BAO GIỜ cắt mất dòng phép tính/hình vẽ phía trên câu hỏi (như 6 O 3 O 2 = 7)
            if (ymin < 320) {
              ymin = Math.min(ymin, safeTop);
            } else {
              ymin = Math.max(safeTop, ymin - 35);
            }
            xmin = isWidescreen ? Math.min(xmin, 58) : Math.max(15, xmin - 30);
            ymax = Math.min(isWidescreen ? 435 : 960, ymax + 28);
            if (isWidescreen && xmax < 750) {
              xmax = Math.min(735, Math.max(xmax + 30, 650));
            } else {
              xmax = Math.min(940, xmax + 25);
            }
          } else if (mode === 'option') {
            // Mở rộng nhẹ vùng cắt bên trong ô đáp án để không bị cụt icon dấu +, -, hình vẽ ở sát mép trái
            if (isWidescreen && typeof optionIndex === 'number') {
              const isLeftCol = optionIndex % 2 === 0;
              if (isLeftCol) {
                xmin = Math.max(68, Math.min(xmin, 74));
                xmax = Math.min(484, Math.max(xmax + 20, 260));
              } else {
                xmin = Math.max(508, Math.min(xmin, 514));
                xmax = Math.min(922, Math.max(xmax + 20, 700));
              }
              ymin = Math.max(400, ymin - 14);
              ymax = Math.min(920, ymax + 14);
            } else {
              ymin = Math.max(0, ymin - 12);
              xmin = Math.max(0, xmin - 16);
              ymax = Math.min(1000, ymax + 12);
              xmax = Math.min(1000, xmax + 16);
            }
          }

          const y1 = clamp((ymin / 1000) * img.height, 0, img.height - 1);
          const x1 = clamp((xmin / 1000) * img.width, 0, img.width - 1);
          const y2 = clamp((ymax / 1000) * img.height, y1 + 1, img.height);
          const x2 = clamp((xmax / 1000) * img.width, x1 + 1, img.width);
          const w = Math.round(x2 - x1);
          const h = Math.round(y2 - y1);
          if (w < 16 || h < 16) {
            resolve('');
            return;
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve('');
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, x1, y1, w, h, 0, 0, w, h);

          // Nếu là màn hình ngang VioEdu và cắt vùng câu hỏi, xóa vùng nút "Xác nhận" (x: 745..945, y: 245..345) và dòng "Hãy chọn 1 đáp án đúng" (y > 390) nếu lỡ dính vào
          if (mode === 'question' && isWidescreen) {
            const btnX1 = Math.round((745 / 1000) * img.width - x1);
            const btnY1 = Math.round((240 / 1000) * img.height - y1);
            const btnW = Math.round((210 / 1000) * img.width);
            const btnH = Math.round((115 / 1000) * img.height);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(btnX1, btnY1, btnW, btnH);
          }

          const trimmed = trimWhitespaceFromCanvas(canvas, mode === 'question' ? 16 : 10);
          if (!trimmed) {
            resolve('');
            return;
          }
          resolve(trimmed.toDataURL('image/jpeg', 0.88));
        };
        img.onerror = () => resolve('');
        img.src = base64Image;
      });
    };

    const parseQuestionsFromRawPageText = (text: string, pageImg: string): any[] => {
      if (!text || text.trim().length < 15) return [];
      const cleaned = text
        .replace(/Vui lòng bật chế độ toàn màn hình[^\n]*/gi, '')
        .replace(/Bạn đã trả lời (sai|đúng)!/gi, '')
        .replace(/Hãy chọn 1 đáp án đúng/gi, '')
        .trim();
      if (!cleaned) return [];

      // Tách câu hỏi theo dạng "Câu 1:", "Bài 1:", "1." hoặc toàn bộ trang nếu chỉ có 1 câu
      const blocks = cleaned
        .split(/(?=(?:^|\n)\s*(?:Câu|Bài|Question)\s*\d+[\.\:\)]|\n\s*\d+[\.\)]\s+[A-ZÀ-Ỹ])/i)
        .map(b => b.trim())
        .filter(b => b.length >= 10);

      const candidateBlocks = blocks.length > 0 ? blocks : [cleaned];
      const results: any[] = [];

      for (const block of candidateBlocks) {
        const optRegex = /(?:^|\s|\n)([A-D])[\.\:\)]\s*([^\n]+?)(?=(?:\s+[A-D][\.\:\)]\s)|$)/g;
        const opts: { text: string; image: string }[] = [];
        let firstOptIdx = -1;
        let match: RegExpExecArray | null;
        while ((match = optRegex.exec(block)) !== null) {
          if (firstOptIdx === -1) firstOptIdx = match.index;
          opts.push({ text: match[2].trim(), image: '' });
        }

        const qText = (firstOptIdx > 0 ? block.slice(0, firstOptIdx) : block)
          .replace(/^(?:Câu|Bài|Question)\s*\d+[\.\:\)]?\s*/i, '')
          .replace(/^\d+[\.\)]\s*/, '')
          .trim();

        if (!qText || qText.length < 4) continue;
        const isMcq = opts.length >= 2;
        results.push({
          id: `digitized-txt-${Date.now()}-${results.length}-${Math.random().toString(36).slice(2, 6)}`,
          type: isMcq ? 'Trắc nghiệm' : 'Tự luận',
          question: qText,
          content: qText,
          image: '',
          options: isMcq ? opts.slice(0, 4) : [],
          answer: isMcq ? 'A' : '',
          explanation: '',
          originalPageImage: pageImg
        });
      }
      return results;
    };

    const finalFileParts: FilePart[] = [];
    const pageImageUrls: string[] = [];
    const pageTextList: string[] = [];

    // Khử trùng lặp nếu người dùng chọn cùng 1 file nhiều lần
    const uniqueInputParts: FilePart[] = [];
    const seenFingerprints = new Set<string>();
    for (const p of fileParts) {
      const d = p?.inlineData?.data || '';
      if (!d) continue;
      const fp = `${d.length}:${d.slice(0, 128)}:${d.slice(-128)}`;
      if (!seenFingerprints.has(fp)) {
        seenFingerprints.add(fp);
        uniqueInputParts.push(p);
      }
    }

    for (const part of uniqueInputParts) {
      if (shouldStop()) throw new Error('Yêu cầu đã bị dừng.');
      const isPdf =
        part.inlineData.mimeType === 'application/pdf' ||
        part.inlineData.data.startsWith('JVBERi0');
      if (isPdf) {
        const converted = await convertPdfPartToImages(part.inlineData.data);
        if (converted && converted.imageParts.length > 0) {
          finalFileParts.push(...converted.imageParts);
          pageImageUrls.push(...converted.pageImages);
          pageTextList.push(...converted.pageTexts);
        } else {
          finalFileParts.push({
            inlineData: { data: part.inlineData.data, mimeType: 'application/pdf' }
          });
          pageImageUrls.push('');
          pageTextList.push('');
        }
      } else {
        const mime = part.inlineData.mimeType || 'image/jpeg';
        finalFileParts.push({ inlineData: { data: part.inlineData.data, mimeType: mime } });
        pageImageUrls.push(`data:${mime};base64,${part.inlineData.data}`);
        pageTextList.push('');
      }
    }

    if (finalFileParts.length === 0) {
      throw new Error('Không tìm thấy trang tài liệu hợp lệ để số hóa.');
    }

    const digitizePrompt = `Bạn là hệ thống SỐ HÓA ĐỀ THI & GIẢI TOÁN chuyên nghiệp.
Nhiệm vụ: Đọc kỹ các trang tài liệu đính kèm và trích xuất TOÀN BỘ các câu hỏi có trong tài liệu thành dữ liệu Quiz tương tác chính xác 100%.

QUY TẮC BẮT BUỘC:
1. SỐ HÓA ĐÚNG NỘI DUNG TÀI LIỆU TẢI LÊN:
   - Trích xuất toàn bộ các câu hỏi có trên từng trang (gán đúng "page_index" từ 0 đến N-1 tương ứng với trang trong lô gửi lên).
   - Nếu phía trên câu hỏi có phép tính, dãy số hoặc biểu thức (ví dụ: "6 ⚪ 3 ⚪ 2 = 7", "5 + ? = 9"): BẮT BUỘC ghi cả biểu thức đó vào đầu trường "question" (VD: "6 ⚪ 3 ⚪ 2 = 7. Chọn dấu phép tính phù hợp để hoàn thành phép tính trên:") ĐỒNG THỜI đặt "has_image": true và trả về "bbox" bao trọn cả biểu thức lẫn hình minh họa đó.
2. LỌC BỎ NHIỄU GIAO DIỆN CHỤP MÀN HÌNH (nếu có):
   - Không lấy các dòng cảnh báo trình duyệt như: "Vui lòng bật chế độ toàn màn hình (F11)...", "Tên đăng nhập: ...", "Bạn đã trả lời sai!", "Bạn đã trả lời đúng!", "Hãy chọn 1 đáp án đúng", "Xác nhận".
3. THỨ TỰ ĐỌC CÁC Ô ĐÁP ÁN TRẮC NGHIỆM (CỰC KỲ QUAN TRỌNG):
   - Với giao diện lưới 2 cột (2x2): BẮT BUỘC đọc theo từng hàng ngang TỪ TRÁI SANG PHẢI, TỪ TRÊN XUỐNG DƯỚI:
     + Phương án A = Ô TRÁI - TRÊN (Hàng 1, Cột Trái: ymin khoảng 460-630, xmin khoảng 60-495)
     + Phương án B = Ô PHẢI - TRÊN (Hàng 1, Cột Phải: ymin khoảng 460-630, xmin khoảng 500-935)
     + Phương án C = Ô TRÁI - DƯỚI (Hàng 2, Cột Trái: ymin khoảng 640-815, xmin khoảng 60-495)
     + Phương án D = Ô PHẢI - DƯỚI (Hàng 2, Cột Phải: ymin khoảng 640-815, xmin khoảng 500-935). Lưu ý: Nếu đề chỉ có 3 ô đáp án (Trái-Trên, Phải-Trên, Trái-Dưới) thì mảng "options" chỉ trả về đúng 3 phần tử A, B, C (TUYỆT ĐỐI KHÔNG đọc theo cột dọc!).
   - Nếu trang có ô nhập "Đáp án của bạn..." hoặc yêu cầu điền số/chữ mà không có các ô lựa chọn -> "type": "Tự luận", "options": [].
4. CẮT HÌNH MINH HỌA CÂU HỎI ("bbox") ĐẦY ĐỦ, KHÔNG BỊ CẮT CỤT PHÍA TRÊN:
   - Nếu câu hỏi có phép tính hình ảnh (như "6 ⚪ 3 ⚪ 2 = 7"), hình vẽ minh họa, sơ đồ, bảng, đồ vật, con vật: BẮT BUỘC trả về "has_image": true và "bbox": [ymin, xmin, ymax, xmax] (hệ 0-1000).
   - LƯU Ý TỌA ĐỘ "ymin": Phải lấy "ymin" từ PHÍA TRÊN CÙNG của phép tính hoặc hình vẽ (ví dụ ymin = 30..70), TUYỆT ĐỐI KHÔNG đặt ymin quá thấp làm cắt mất dòng phép tính hoặc phần đầu của hình vẽ!
5. ĐỌC VÀ CẮT HÌNH TRONG TỪNG Ô ĐÁP ÁN ("options"):
   - Nếu trong ô đáp án là các biểu tượng dấu phép tính trong vòng tròn màu (ví dụ: dấu "-" và "+", dấu "+" và "-", dấu "-" và "-"):
     + BẮT BUỘC ghi rõ dấu vào trường "text" theo đúng thứ tự trái sang phải trong ô đó (ví dụ: "- và +", "+ và -", "- và -").
     + ĐỒNG THỜI đặt "has_image": true và trả về "bbox": [ymin, xmin, ymax, xmax] bao quanh các biểu tượng bên trong ô đáp án đó.
   - Nếu trong ô đáp án là hình vẽ (đồ vật, con vật, hình học, vạch màu): đặt "has_image": true, trả về "bbox" bao quanh hình vẽ trong ô đó, và điền "text" mô tả ngắn.
   - Nếu trong ô đáp án chỉ là chữ hoặc số thông thường: điền vào "text", đặt "has_image": false, "bbox": null.
6. GIẢI TOÁN TỪNG BƯỚC TRƯỚC KHI CHỌN ĐÁP ÁN ("explanation" -> "correct_option_text" -> "answer"):
   - BẮT BUỘC viết lời giải vào "explanation" TRƯỚC: Thay từng phương án A (Trái-Trên), B (Phải-Trên), C (Trái-Dưới), D (Phải-Dưới) vào đề bài để kiểm tra phép tính đúng hay sai (Ví dụ với "6 ⚪ 3 ⚪ 2 = 7": Thử A (- và +): 6 - 3 + 2 = 5 ≠ 7 (Sai); Thử B (+ và -): 6 + 3 - 2 = 7 (Đúng); Thử C (- và -): 6 - 3 - 2 = 1 ≠ 7 (Sai) -> Vậy phương án đúng là B: "+ và -").
   - Điền chính xác nội dung của phương án đúng vào "correct_option_text" (VD: "+ và -") và chữ cái tương ứng ("A", "B", "C", hoặc "D") vào "answer".

TRẢ VỀ JSON HỢP LỆ THEO CẤU TRÚC:
{
  "questions": [
    {
      "page_index": 0,
      "type": "Trắc nghiệm",
      "question": "Nội dung câu hỏi (kèm biểu thức phía trên nếu có)",
      "has_image": true,
      "bbox": [ymin, xmin, ymax, xmax],
      "options": [
        {"text": "Nội dung ô Trái-Trên (A)", "has_image": false, "bbox": null},
        {"text": "Nội dung ô Phải-Trên (B)", "has_image": false, "bbox": null},
        {"text": "Nội dung ô Trái-Dưới (C)", "has_image": false, "bbox": null},
        {"text": "Nội dung ô Phải-Dưới (D)", "has_image": false, "bbox": null}
      ],
      "explanation": "Thử từng phương án A, B, C, D để tìm kết quả đúng...",
      "correct_option_text": "Nội dung chính xác của phương án đúng",
      "answer": "B"
    }
  ]
}`;

    const BATCH_PAGES = 2;
    const digitizedQuestions: any[] = [];
    const defaultVioEduOptionBboxes = [
      [482, 70, 620, 482],  // A: Trái trên
      [482, 510, 620, 920], // B: Phải trên
      [656, 70, 798, 482],  // C: Trái dưới
      [656, 510, 798, 920], // D: Phải dưới
    ];

    for (let startIdx = 0; startIdx < finalFileParts.length; startIdx += BATCH_PAGES) {
      if (shouldStop()) throw new Error('Yêu cầu đã bị dừng.');
      const endPage = Math.min(startIdx + BATCH_PAGES, finalFileParts.length);
      onProgress?.(`Đang dùng AI đọc câu hỏi trang ${startIdx + 1} - ${endPage} / ${finalFileParts.length} (Đã trích xuất ${digitizedQuestions.length} câu)...`);

      const batchParts = finalFileParts.slice(startIdx, endPage);
      const batchTexts = pageTextList
        .slice(startIdx, endPage)
        .map((t, idx) => (t ? `--- VĂN BẢN TRANG ${idx} (page_index = ${idx}) ---\n${t}` : ''))
        .filter(Boolean)
        .join('\n\n');

      const promptForBatch = batchTexts
        ? `${digitizePrompt}\n\nVĂN BẢN GỐC TRÍCH XUẤT TỪ CÁC TRANG TRONG LÔ NÀY (kết hợp cùng hình ảnh trang để lấy đúng nội dung và tọa độ hình vẽ bbox):\n${batchTexts}`
        : digitizePrompt;

      let rawBatchList: any[] = [];

      const extractListFromRes = (res: any): any[] => {
        if (!res) return [];
        if (Array.isArray(res.questions)) return res.questions;
        if (Array.isArray(res)) return res;
        return [];
      };

      try {
        const batchResult = await this.generateExamQuestionsStructured(promptForBatch, batchParts);
        rawBatchList = extractListFromRes(batchResult);
        if (rawBatchList.length === 0) {
          throw new Error(batchResult?.error || 'Batch empty');
        }
      } catch (firstErr: any) {
        if (shouldStop()) throw new Error('Yêu cầu đã bị dừng.');

        // Thử lại từng trang một (1 trang/lần) để giảm tải cho AI
        rawBatchList = [];
        for (let pIdx = 0; pIdx < batchParts.length; pIdx++) {
          if (shouldStop()) throw new Error('Yêu cầu đã bị dừng.');
          await new Promise(r => setTimeout(r, 900));
          const singleText = pageTextList[startIdx + pIdx] || '';
          const singlePrompt = singleText
            ? `${digitizePrompt}\n\nVĂN BẢN GỐC TRANG 0:\n${singleText}`
            : digitizePrompt;
          try {
            const singleRes = await this.generateExamQuestionsStructured(singlePrompt, [batchParts[pIdx]]);
            const singleList = extractListFromRes(singleRes);
            if (singleList.length > 0) {
              for (const item of singleList) {
                rawBatchList.push({ ...item, page_index: pIdx });
              }
            }
          } catch (singleErr) {
            console.warn(`[digitizeExamFromFiles] Retry single page ${startIdx + pIdx + 1} failed:`, singleErr);
          }
        }
      }

      // Đánh dấu những trang nào trong batch đã có câu hỏi do AI trả về
      const pagesCoveredInBatch = new Set<number>();

      for (let qIdx = 0; qIdx < rawBatchList.length; qIdx++) {
        const q = rawBatchList[qIdx];
        if (!q || typeof q !== 'object') continue;

        const rawLocalPage = Number(q.page_index ?? q.page ?? (qIdx < batchParts.length ? qIdx : 0));
        const localPageIdx = Number.isFinite(rawLocalPage)
          ? Math.min(Math.max(0, rawLocalPage), batchParts.length - 1)
          : 0;
        pagesCoveredInBatch.add(localPageIdx);

        const globalPageIdx = startIdx + localPageIdx;
        const pageImage = pageImageUrls[globalPageIdx] || pageImageUrls[0] || '';

        const qTextRaw = String(q.question || q.content || q.text || '').trim();
        const cleanedQText = qTextRaw
          .replace(/Vui lòng bật chế độ toàn màn hình.*?lần/gi, '')
          .replace(/Bạn đã trả lời (sai|đúng)!/gi, '')
          .replace(/Hãy chọn 1 đáp án đúng/gi, '')
          .trim() || 'Quan sát hình và trả lời câu hỏi:';

        let questionCroppedImg = '';
        if (Array.isArray(q.bbox) && q.bbox.length === 4 && pageImage) {
          questionCroppedImg = await cropImageFromBbox(pageImage, q.bbox, 'question');
        } else if (typeof q.image === 'string' && (q.image.startsWith('<svg') || q.image.startsWith('data:image'))) {
          questionCroppedImg = q.image;
        }

        // Fallback cắt vùng hình minh họa / biểu thức phía trên câu hỏi từ trang đề gốc nếu câu hỏi có nhắc tới hình/phép tính trên mà AI quên trả về tọa độ bbox
        const mentionsVisual = /hình trên|hình dưới|hình bên|hình sau|hình vẽ|quan sát hình|bông hoa trên|phép tính trên|dãy hình|sơ đồ/i.test(cleanedQText);
        if (!questionCroppedImg && (q.has_image || mentionsVisual) && pageImage) {
          questionCroppedImg = await cropImageFromBbox(pageImage, [25, 55, 385, 735], 'question');
        }

        const rawOpts = Array.isArray(q.options) ? q.options : [];
        const processedOptions = await Promise.all(
          rawOpts.map(async (opt: any, oIdx: number) => {
            if (typeof opt === 'string' || typeof opt === 'number') {
              return { text: String(opt).trim(), image: '' };
            }
            const optText = String(opt?.text ?? opt?.label ?? opt?.content ?? '').trim();
            let optImg = typeof opt?.image === 'string' && (opt.image.startsWith('<svg') || opt.image.startsWith('data:image'))
              ? opt.image
              : '';
            if (!optImg && Array.isArray(opt?.bbox) && opt.bbox.length === 4 && pageImage) {
              optImg = await cropImageFromBbox(pageImage, opt.bbox, 'option', oIdx);
            }
            if (!optImg && opt?.has_image && pageImage && defaultVioEduOptionBboxes[oIdx]) {
              optImg = await cropImageFromBbox(pageImage, defaultVioEduOptionBboxes[oIdx], 'option', oIdx);
            }
            return {
              text: optText || (optImg ? `Phương án ${String.fromCharCode(65 + oIdx)}` : ''),
              image: optImg
            };
          })
        );

        const validOptions = processedOptions.filter(o => o.text !== '' || o.image !== '');
        const isEssay =
          String(q.type || '').toLowerCase().includes('tự luận') ||
          String(q.type || '').toLowerCase().includes('điền') ||
          validOptions.length < 2;

        let finalAnswer = String(q.answer ?? '').trim();
        const correctOptText = String(q.correct_option_text ?? '').trim().toLowerCase();
        if (!isEssay && correctOptText && validOptions.length > 0) {
          const matchedOptIdx = validOptions.findIndex(
            o => o.text.trim().toLowerCase() === correctOptText
          );
          if (matchedOptIdx !== -1) {
            finalAnswer = String.fromCharCode(65 + matchedOptIdx);
          }
        }

        digitizedQuestions.push({
          id: `digitized-${Date.now()}-${digitizedQuestions.length}`,
          type: isEssay ? 'Tự luận' : 'Trắc nghiệm',
          question: cleanedQText,
          content: cleanedQText,
          image: questionCroppedImg,
          options: isEssay ? [] : validOptions,
          answer: finalAnswer,
          explanation: String(q.explanation ?? '').trim(),
          originalPageImage: pageImage
        });
      }

      // Với những trang trong batch mà AI bị lỗi 429 không trả về được câu hỏi:
      for (let localPageIdx = 0; localPageIdx < batchParts.length; localPageIdx++) {
        if (pagesCoveredInBatch.has(localPageIdx)) continue;
        const globalPageIdx = startIdx + localPageIdx;
        const pageImage = pageImageUrls[globalPageIdx] || '';
        const rawPageText = pageTextList[globalPageIdx] || '';

        // Ưu tiên 1: Bóc tách từ văn bản gốc của trang PDF nếu có
        const textExtractedQuestions = parseQuestionsFromRawPageText(rawPageText, pageImage);
        if (textExtractedQuestions.length > 0) {
          digitizedQuestions.push(...textExtractedQuestions);
          continue;
        }

        // Ưu tiên 2: Tạo thẻ câu hỏi kèm ảnh cắt trực tiếp từ đúng trang PDF của người dùng tải lên
        if (pageImage) {
          const fallbackCrop = (await cropImageFromBbox(pageImage, [120, 120, 540, 880])) || pageImage;
          digitizedQuestions.push({
            id: `digitized-page-${Date.now()}-${digitizedQuestions.length}`,
            type: 'Trắc nghiệm',
            question: `Câu hỏi trang ${globalPageIdx + 1} (Bấm "Ảnh trang đề gốc" hoặc "Sửa đề & Cắt ảnh" để chỉnh sửa):`,
            content: `Câu hỏi trang ${globalPageIdx + 1} (Bấm "Ảnh trang đề gốc" hoặc "Sửa đề & Cắt ảnh" để chỉnh sửa):`,
            image: fallbackCrop,
            options: [
              { text: 'Phương án A', image: '' },
              { text: 'Phương án B', image: '' },
              { text: 'Phương án C', image: '' },
              { text: 'Phương án D', image: '' }
            ],
            answer: 'A',
            explanation: '',
            originalPageImage: pageImage
          });
        }
      }

      if (digitizedQuestions.length > 0) {
        onPartialResult?.([...digitizedQuestions]);
      }
    }

    return digitizedQuestions;
  }

  /* --- XỬ LÝ JSON AN TOÀN --- */

  public parseJSONSafely(text: string): any {
    let cleaned = text.replace(/^\uFEFF/, '').trim();
    cleaned = cleaned.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");

    const jsonBlockMatch = cleaned.match(/```(?:json)\s*([\s\S]*?)```/i);
    if (jsonBlockMatch) {
      cleaned = jsonBlockMatch[1].trim();
    } else {
      const codeBlockMatch = cleaned.match(/```(?:\w+)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        cleaned = codeBlockMatch[1].trim();
      }
    }

    if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
      cleaned = cleaned.slice(1, -1).trim();
    }

    const rescueTruncated = (str: string): string => {
      let r = str.trim();
      const startBrace = r.indexOf('{');
      const startBracket = r.indexOf('[');
      let startIdx = -1;

      if (startBrace !== -1 && startBracket !== -1) startIdx = Math.min(startBrace, startBracket);
      else if (startBrace !== -1) startIdx = startBrace;
      else if (startBracket !== -1) startIdx = startBracket;

      if (startIdx !== -1) r = r.substring(startIdx);
      else return "";

      let braces = 0;
      let brackets = 0;
      let inString = false;
      let output = '';

      for (let i = 0; i < r.length; i++) {
        const char = r[i];
        if (inString) {
          if (char === '\\') {
            output += char;
            if (i + 1 < r.length) { output += r[i + 1]; i++; }
            continue;
          }
          if (char === '"') inString = false;
          output += char;
          continue;
        }
        if (char === '"') { inString = true; output += char; continue; }
        if (char === '{') braces++;
        else if (char === '}') braces--;
        else if (char === '[') brackets++;
        else if (char === ']') brackets--;
        output += char;
        if (braces === 0 && brackets === 0 && (char === '}' || char === ']')) return output;
      }
      let final = output.trim();
      if (final.endsWith('\\')) final = final.slice(0, -1);
      if (final.endsWith(',')) final = final.slice(0, -1);
      if (inString) final += '"';
      while (brackets > 0) { final += ']'; brackets--; }
      while (braces > 0) { final += '}'; braces--; }
      return final;
    };

    const fixCommonErrors = (str: string): string => {
      let s = str;
      s = s.replace(/("(?:\\[\s\S]|[^"\\])*")|(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, (match, group1) => group1 ? match : "");
      s = s.replace(/,\s*([\]}])/g, '$1');
      s = s.replace(/[\u0000-\u001F]+/g, (match) => {
        const charCodes: Record<number, string> = { 10: "\\n", 13: "\\r", 9: "\\t" };
        let res = "";
        for (let i = 0; i < match.length; i++) res += charCodes[match.charCodeAt(i)] || "";
        return res;
      });
      return s;
    };

    const fixSingleQuotes = (str: string): string => {
      let s = str.replace(/'((?:\\.|[^'])*)'\s*:/g, '"$1":');
      s = s.replace(/:\s*'((?:\\.|[^'])*)'/g, ': "$1"');
      return s;
    };

    const fixUnquotedKeys = (str: string): string => {
      return str.replace(/([\{,]\s*)([A-Za-z_$][\w$\-]*)(\s*:)/g, (_, prefix, key, suffix) => {
        const normalizedKey = String(key).trim();
        if (/^(true|false|null)$/i.test(normalizedKey)) return `${prefix}${normalizedKey}${suffix}`;
        return `${prefix}"${normalizedKey}"${suffix}`;
      });
    };

    const fixNonJsonLiterals = (str: string): string => {
      return str.replace(/\bNone\b/g, 'null').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false');
    };

    const fixMissingCommas = (str: string): string => {
      let s = str.replace(/}\s*[\r\n]+\s*{/g, '},{');
      s = s.replace(/}\s*{/g, '},{');
      return s;
    };

    let currentText = cleaned;
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const rescued = rescueTruncated(currentText);
      if (!rescued) break;
      try { return JSON.parse(rescued); } catch (e1) {
        try { return JSON.parse(fixCommonErrors(rescued)); } catch (e2) {
          try {
            const superFix = rescued.replace(/\\(?!["\\\/bfnrtu])/g, '\\\\');
            return JSON.parse(fixCommonErrors(superFix));
          } catch (e3) {
            try { return JSON.parse(fixCommonErrors(fixSingleQuotes(rescued))); } catch (e4) {
              try { return JSON.parse(fixCommonErrors(fixMissingCommas(rescued))); } catch (e5) {
                try { return JSON.parse(fixCommonErrors(fixNonJsonLiterals(fixUnquotedKeys(fixSingleQuotes(rescued))))); } catch (e6) {
                  const arrayMatch = rescued.match(/\[\s*\{[\s\S]*\}\s*\]/);
                  if (arrayMatch) { try { return JSON.parse(fixCommonErrors(arrayMatch[0])); } catch (e7) { } }
                  const startBrace = currentText.indexOf('{');
                  const startBracket = currentText.indexOf('[');
                  let nIdx = -1;
                  if (startBrace !== -1 && startBracket !== -1) nIdx = Math.min(startBrace, startBracket);
                  else if (startBrace !== -1) nIdx = startBrace;
                  else if (startBracket !== -1) nIdx = startBracket;
                  if (nIdx !== -1) { currentText = currentText.substring(nIdx + 1); continue; } else break;
                }
              }
            }
          }
        }
      }
    }

    console.error("JSON Rescue Failed Final.", { original: text });
    if (text.trim().startsWith('[')) return [];
    return { questions: [], readingPassage: "", title: "Lỗi tạo nội dung", subject: "", error: "AI trả về định dạng không chuẩn. Vui lòng thử lại." };
  }

  private async handleError(error: any, retryFn: () => Promise<any>, originalPrompt?: string, fileParts: FilePart[] = []): Promise<any> {
    const msg = (error.message || "").toLowerCase();
    const status = error.status || 0;
    console.warn("AI Encountered Error:", msg, "Status:", status);
    (window as any).ai_status = `Lỗi: ${status || 'Request'}`;

    this.totalRetryCount++;
    if (this.totalRetryCount > 10) {
      this.totalRetryCount = 0;
      throw new Error("AI trả về định dạng không chuẩn sau nhiều lần thử. Thầy/Cô vui lòng thử lại sau nhé!");
    }

    // Xử lý lỗi 404, 400, 403 hoặc Model Not Found
    if (msg.includes("404") || msg.includes("not found") || msg.includes("400") || msg.includes("403") || msg.includes("permission") || msg.includes("key not valid") || msg.includes("payload")) {
      localStorage.removeItem('preferred_gemini_model');
      const isModelNotFound = msg.includes("404") || msg.includes("not found");

      if (!isModelNotFound && this.versionRetryCount < 1) {
        this.versionRetryCount++;
        const nVersion = this.currentVersion === 'v1beta' ? 'v1' : 'v1beta';
        this.setStatus(`Thử kênh ${nVersion} cho ${this.currentModelName}...`);
        this.setupModel(this.currentModelName, nVersion);
        return await retryFn();
      }

      this.versionRetryCount = 0;
      const cIdx = this.availableModels.indexOf(this.currentModelName);
      const nIdx = ((cIdx >= 0 ? cIdx : 0) + 1) % this.availableModels.length;

      this.modelCycleCount++;
      if (this.modelCycleCount >= this.availableModels.length) {
        if (originalPrompt) {
          try {
            const text = await this.fallbackToOtherProviders(originalPrompt, true, fileParts);
            const currentFnStr = retryFn.toString();
            const needsJson =
              currentFnStr.includes('Structured') ||
              currentFnStr.includes('Quiz') ||
              currentFnStr.includes('Worksheet') ||
              currentFnStr.includes('Exam');
            this.resetRetryCounters();
            return needsJson ? this.parseJSONSafely(text) : text;
          } catch (serverErr) {
            console.error("Server fallback after 404/400 failed:", serverErr);
          }
        }
        this.resetRetryCounters();
        throw new Error("❌ LỖI AI: Không tìm thấy Model phù hợp hoặc Key không đủ quyền. Thầy/Cô hãy kiểm tra lại Key cá nhân (API Key) trong Cài đặt nhé!");
      }

      this.setStatus(`Thử đường truyền ${this.availableModels[nIdx]}...`);
      this.setupModel(this.availableModels[nIdx], 'v1beta');
      this.retryAttempt = 0;
      return await retryFn();
    }

    // Xử lý lỗi 429 (Giới hạn tốc độ/Quota)
    if (this.isRateLimitError(error) || msg.includes("quá tải") || msg.includes("rate_limit")) {
      this.markCurrentModelRateLimited();
      this.rateLimitSwitchCount++;
      this.modelCycleCount++;

      // Ngăn chặn vòng lặp vô tận
      if (this.rateLimitSwitchCount > 40) {
        throw new Error("Hệ thống AI đang gặp sự cố kết nối liên tục. Vui lòng thử lại sau 1 phút.");
      }

      const nextModel = this.getNextModelSkippingRateLimited();

      // Nếu đã thử xoay vòng qua toàn bộ model mà vẫn lỗi 429
      if (this.modelCycleCount >= this.availableModels.length) {

        // LUÔN THỬ XOAY KEY NẾU CÓ NHIỀU KEY
        if (this.allApiKeys.length > 1) {
          const success = await this.rotateApiKey();
          if (success) {
            this.modelCycleCount = 0;
            return await retryFn();
          }
        }

        // Cố gắng cứu hộ bằng server fallback trước khi tuyệt vọng
        if (originalPrompt) {
          console.warn("🚨 [GeminiService] Local models exhausted. Attempting rescue via Server Fallback...");
          (window as any).ai_status = "Đang cứu hộ qua Server...";
          try {
            const text = await this.fallbackToOtherProviders(originalPrompt, true, fileParts);
            const currentFnStr = retryFn.toString();
            const needsJson = currentFnStr.includes('Structured') ||
              currentFnStr.includes('Quiz') ||
              currentFnStr.includes('Worksheet') ||
              currentFnStr.includes('Exam');

            return needsJson ? this.parseJSONSafely(text) : text;
          } catch (serverErr) {
            console.error("Rescue failed:", serverErr);
          }
        }

        // Tăng thêm cơ hội bằng cách chờ lâu hơn và thử lại vòng tiếp theo (tối đa 2 vòng)
        if (this.rateLimitSwitchCount < this.availableModels.length * 2) {
          const longWait = 10000 + Math.random() * 5000;
          this.setStatus(`⚠️ Chờ giải phóng quota (${Math.round(longWait / 1000)}s)...`);
          await new Promise(r => setTimeout(r, longWait));
          // Không reset modelCycleCount để tránh loop vô tận, nhưng tiếp tục vòng tiếp theo
          if (nextModel) {
            this.setupModel(nextModel, 'v1beta');
            return await retryFn();
          }
        }

        this.resetRetryCounters();
        throw new Error("⚠️ LỖI GIỚI HẠN (429):\n\n⚠️ TẤT CẢ KÊNH ĐỀU BẬN (429): Google đang tạm khóa các model của Thầy/Cô do vượt hạn mức miễn phí (RPM/TPM).\n\n👉 GIẢI PHÁP: Thầy/Cô hãy đợi khoảng 1 phút rồi thử lại, hoặc hãy nhập một API Key khác từ tài khoản Google khác trong phần Cài đặt (hình chiếc chìa khóa 🔑) nhé.");
      }

      if (nextModel) {
        this.setStatus(`🔄 Đang chuyển sang ${nextModel}...`);
        this.setupModel(nextModel, 'v1beta');

        // Chờ nhẹ 2-3s để quota kịp nhả trước khi thử model mới
        const wait = 2000 + Math.random() * 1000;
        await new Promise(r => setTimeout(r, wait));
        return await retryFn();
      }
    }

    this.resetRetryCounters();
    throw error;
  }
}

export const geminiService = new GeminiService();
export const generateWorksheetContentDetailed = (topic: string, subject: string, config: any, fileParts?: FilePart[]) =>
  geminiService.generateWorksheetContentDetailed(topic, subject, config, fileParts);
