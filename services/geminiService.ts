import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, GenerativeModel, ChatSession } from "@google/generative-ai";
import { generateWithAI } from '../aiClient';

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
    'gemini-1.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash-8b',
    'gemini-2.0-flash-exp',
    'gemini-1.5-pro',
    'gemini-pro',
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
    return /^(gemini-(2\.0-(flash|flash-lite)|1\.5-(flash|pro)))$/.test(modelName);
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

      const combined = [singleManualKey, defaultKey].filter(Boolean) as string[];
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

  public async generateText(prompt: string): Promise<string> {
    this.resetRetryCounters();
    return this._generateText(prompt);
  }

  private async _generateText(prompt: string): Promise<string> {
    await this.ensureInitialized();

    if (!this.model) {
      return this.fallbackToOtherProviders(prompt, false);
    }

    try {
      (window as any).ai_status = `Đang gọi AI (${this.currentModelName})...`;
      // Tăng số lần retry và delay ban đầu để xử lý tốt hơn lỗi 429
      const result = await this.retryWithBackoff(() => this.model!.generateContent(prompt), 5, 2000);
      (window as any).ai_status = "Thành công";
      return result.response.text();
    } catch (error: any) {
      return this.handleError(error, () => this._generateText(prompt), prompt);
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
          const text = await this.fallbackToOtherProviders(message, false);
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
            const text = await this.fallbackToOtherProviders(message, false);
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

    if (!this.model) {
      try {
        const text = await this.fallbackToOtherProviders(prompt, true);
        return this.parseJSONSafely(text);
      } catch (e: any) {
        console.error("Fallback failed:", e);
        return { error: e.message || "Lỗi kết nối AI Server" };
      }
    }

    // Thêm hướng dẫn JSON rõ ràng vào prompt
    const enhancedPrompt = `${prompt}

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
        {"text": "Đáp án B", "image": ""}
      ],
      "answer": "Đáp án đúng",
      "explanation": "Giải thích"
    }
  ],
  "readingPassage": "Văn bản đọc hiểu (nếu có)"
}`;

    const parts: any[] = [{ text: enhancedPrompt }];
    if (fileParts && fileParts.length > 0) {
      fileParts.forEach(p => parts.push(p));
    }

    try {
      // Sử dụng JSON mode nếu đang dùng v1beta
      let result;
      if (this.currentVersion === 'v1beta') {
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

        // Tăng retry và delay cho exam generation (thường là request lớn)
        result = await this.retryWithBackoff(() => jsonModel.generateContent(parts), 5, 3000);
      } else {
        result = await this.retryWithBackoff(() => this.model!.generateContent(parts), 5, 3000);
      }

      return this.parseJSONSafely(result.response.text());
    } catch (error: any) {
      return this.handleError(error, () => this._generateExamQuestionsStructured(prompt, fileParts), prompt);
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

    if (!this.model) {
      try {
        const text = await this.fallbackToOtherProviders(prompt, true);
        return this.parseJSONSafely(text);
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

      const parsed = this.parseJSONSafely(result.response.text());

      // Chuẩn hóa dữ liệu
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
          // Giữ nguyên các field đặc thù của từng dạng bài
          numbers: q.numbers,
          pairs: q.pairs,
        }));
      }

      return parsed;
    } catch (error: any) {
      return this.handleError(error, () => this.generateWorksheetContentDetailed(topic, subject, config, fileParts), prompt);
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

  // Cải thiện retry với exponential backoff và xử lý đặc biệt cho lỗi 429
  private async retryWithBackoff<T>(fn: () => Promise<T>, retries: number = 3, initialDelay: number = 1000): Promise<T> {
    let lastError: any;
    for (let i = 0; i < retries; i++) {
      try {
        await this.waitForRateLimit();
        return await fn();
      } catch (error: any) {
        lastError = error;

        const is429 = this.isRateLimitError(error);

        if (i < retries - 1) {
          // Lỗi 429 (Rate Limit) cần chờ lâu hơn một chút
          const baseDelay = is429 ? Math.max(initialDelay * 2, 5000) : initialDelay;
          const waitTime = baseDelay * Math.pow(2, i) + (Math.random() * 1000);

          console.warn(`⚠️ AI Request failed (attempt ${i + 1}/${retries}). ${is429 ? 'Rate Limited. ' : ''}Retrying in ${Math.round(waitTime)}ms...`, error.message);

          if (is429) {
            this.markCurrentModelRateLimited();
            (window as any).ai_status = `⚠️ Đợi quota (${Math.round(waitTime / 1000)}s)...`;
          }

          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          // Nếu đã hết số lần retry cho model này mà vẫn 429, mới throw để handleError chuyển model
          if (is429) {
            throw this.createRateLimitError(error);
          }
        }
      }
    }
    throw lastError;
  }

  private async fallbackToOtherProviders(prompt: string, isJson: boolean): Promise<string> {
    console.log("🚀 [Fallback] Calling Server API...");
    try {
      // Dùng model ổn định nhất của server
      const result = await generateWithAI({ prompt, provider: 'gemini', model: 'gemini-1.5-flash' });
      return result.text || '';
    } catch (error: any) {
      console.error("❌ [Fallback] Server also failed:", error);
      throw new Error(`⚠️ HẾT HẠN MỨC (429): Toàn bộ kênh trực tiếp và dự phòng đều đang quá tải. \n\n👉 GIẢI PHÁP: Thầy/Cô vui lòng đợi 1 phút rồi thử lại, hoặc dùng một API Key khác.`);
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
        "question": "Câu hỏi ở đây? CHỈ dùng [IMAGE] nếu thật sự cần hình minh họa.",
        "image": "Chỉ điền mô tả ảnh nếu câu hỏi CẦN hình vẽ, đồ thị. Nếu chỉ có chữ thì ĐỂ TRỐNG.",
        "options": [
          { "text": "Đáp án A", "image": "" },
          { "text": "Đáp án B", "image": "" },
          { "text": "Đáp án C", "image": "" },
          { "text": "Đáp án D", "image": "" }
        ]
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

  public async generateSpeech(text: string, voice: string): Promise<string | null> {
    // Hiện tại ưu tiên dùng Web Speech API của trình duyệt
    return null;
  }

  public async generateImage(prompt: string): Promise<string> {
    // Rút ngắn prompt để tránh URL quá dài
    const shortPrompt = prompt.length > 80 ? prompt.substring(0, 80) : prompt;
    const enhancedPrompt = `${shortPrompt}, cute cartoon for kids, white background`;

    // --- Phương án 1: image.pollinations.ai (endpoint cũ) ---
    const endpoints = [
      `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?nologo=true&seed=${Math.floor(Math.random() * 999999)}&width=512&height=512&model=flux`,
      `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?nologo=true&seed=${Math.floor(Math.random() * 999999)}&width=512&height=512&model=turbo`,
      // Phương án 2: gen.pollinations.ai (endpoint mới, thử không key)
      `https://gen.pollinations.ai/image/${encodeURIComponent(enhancedPrompt)}?nologo=true&seed=${Math.floor(Math.random() * 999999)}&width=512&height=512&model=flux`,
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

    throw new Error("Dịch vụ tạo ảnh đang bận. Thầy Cô bấm 'Vẽ lại' sau nhé.");
  }
  public async generateVideo(prompt: string): Promise<string> {
    const enhancedPrompt = `${prompt}, cinematic, animation style, for kids, educational`;

    for (let i = 0; i < 3; i++) {
      const seed = Math.floor(Math.random() * 1000000);
      const url = `https://image.pollinations.ai/p/${encodeURIComponent(enhancedPrompt)}?nologo=true&seed=${seed}&width=1280&height=720`;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
          const blob = await response.blob();
          if (blob.type.startsWith('video/') || blob.type.startsWith('image/')) {
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          }
        }
        console.warn(`Video gen attempt ${i + 1} failed with status: ${response.status}`);
        if (i === 2) {
          throw new Error(`Máy chủ tạo video đang quá tải (Lỗi ${response.status}). Thầy/Cô vui lòng thử lại sau giây lát.`);
        }
      } catch (error: any) {
        if (error.name === 'AbortError') console.warn("Video generation timeout reached.");
        console.warn(`Lỗi tạo video lần ${i + 1}:`, error);
        if (i === 2) {
          throw new Error("Không thể kết nối đến dịch vụ tạo video. Vui lòng kiểm tra kết nối mạng.");
        }
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error("Không thể tạo video sau nhiều lần thử. Dịch vụ có thể đang bảo trì.");
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

  private async handleError(error: any, retryFn: () => Promise<any>, originalPrompt?: string): Promise<any> {
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
            const text = await this.fallbackToOtherProviders(originalPrompt, true);
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
