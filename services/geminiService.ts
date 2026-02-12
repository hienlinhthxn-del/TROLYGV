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
  private onStatusChange: ((status: string) => void) | null = null;

  // Danh sách ưu tiên mới nhất + fallback để giảm lỗi "Model not found"
  private static readonly MODEL_CANDIDATES = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-pro',
  ];

  private availableModels: string[] = [...GeminiService.MODEL_CANDIDATES];

  private static isPreferredModelFamily(modelName: string): boolean {
    return modelName.startsWith('gemini-');
  }

  private static supportsJsonResponseMimeType(modelName: string): boolean {
    return /^(gemini-(2\.0-(flash|flash-lite)|1\.5-(flash|pro)))$/.test(modelName);
  }

  private currentVersion: 'v1' | 'v1beta' = 'v1beta';
  private totalRetryCount: number = 0; // Bộ đếm retry toàn cục để ngăn vòng lặp vô hạn

  constructor() {
    // Defer initialization to run only on the client-side (in the browser)
    // to prevent crashes during server-side build processes.
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

  private getApiKey(): string | null {
    try {
      // Ưu tiên key nhập thủ công từ Cài đặt
      const manualKey = localStorage.getItem('manually_entered_api_key');
      if (manualKey) return manualKey;

      return localStorage.getItem('google_api_key');
    } catch (e) {
      console.warn("Could not access localStorage, it might be disabled by browser settings.", e);
      return null;
    }
  }

  private initialize() {
    if (this.genAI) return; // Already initialized
    const key = this.getApiKey();
    if (key) {
      try {
        this.genAI = new GoogleGenerativeAI(key);
        this.refreshAvailableModels().catch(e => console.warn('Could not refresh model list, using defaults.', e));
        const preferredModel = localStorage.getItem('preferred_gemini_model');
        const startModel = (preferredModel && this.availableModels.includes(preferredModel)) ? preferredModel : this.availableModels[0];
        this.setupModel(startModel, 'v1beta');
        console.log("AI Assistant: API Key detected and active.");
      } catch (e: any) {
        this.genAI = null;
        this.setStatus("LỖI: API Key không hợp lệ");
        console.error("AI Assistant: Invalid API Key.", e.message);
      }
    } else {
      this.setStatus("LỖI: Chưa cấu hình API Key");
      console.warn("AI Assistant: No valid API Key found.");
    }
  }

  private async refreshAvailableModels(): Promise<void> {
    const key = this.getApiKey();
    if (!key) return;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (!response.ok) return;

      const data = await response.json();
      const listedModels = (data.models || [])
        .filter((m: any) => m?.supportedGenerationMethods?.includes('generateContent'))
        .map((m: any) => (m?.name || '').replace('models/', ''))
        .filter((name: string) => Boolean(name))
        .filter((name: string) => GeminiService.isPreferredModelFamily(name));

      if (!listedModels.length) return;

      const prioritized = GeminiService.MODEL_CANDIDATES.filter(m => listedModels.includes(m));
      const others = listedModels.filter((m: string) => !prioritized.includes(m));
      this.availableModels = [...prioritized, ...others];
      console.log('AI available models:', this.availableModels);

      const preferredModel = localStorage.getItem('preferred_gemini_model');
      if (preferredModel && !this.availableModels.includes(preferredModel)) {
        localStorage.removeItem('preferred_gemini_model');
      }
    } catch (e) {
      // Không chặn luồng chính nếu API list model lỗi
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

  private async ensureInitialized() {
    if (!this.genAI || !this.model) {
      this.initialize();
      // Không throw lỗi ở đây nữa để cho phép fallback sang Server API
    }
  }

  public getApiKeySource(): string {
    if (typeof window === 'undefined') return 'Server';
    if (localStorage.getItem('manually_entered_api_key')) return 'Manual';
    if (localStorage.getItem('google_api_key')) return 'Legacy';
    return 'Env/Default';
  }

  public async generateText(prompt: string): Promise<string> {
    await this.ensureInitialized();

    if (!this.model) {
      return this.fallbackToOtherProviders(prompt, false);
    }

    try {
      const result = await this.retryWithBackoff(() => this.model!.generateContent(prompt), 3, 1000);
      return result.response.text();
    } catch (error: any) {
      return this.handleError(error, () => this.generateText(prompt));
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

  public async *sendMessageStream(message: string, fileParts: FilePart[] = [], signal?: AbortSignal): AsyncGenerator<{ text: string }> {
    await this.ensureInitialized();
    if (!this.chat) this.initChat("Bạn là trợ lý giáo viên.");

    const parts: any[] = [];
    if (message) parts.push({ text: message });
    if (fileParts && fileParts.length > 0) {
      fileParts.forEach(p => parts.push(p));
    }

    if (parts.length === 0) return;

    try {
      const result = await this.chat!.sendMessageStream(parts);
      for await (const chunk of result.stream) {
        if (signal?.aborted) break;
        yield { text: chunk.text() };
      }
    } catch (error: any) {
      console.error("Stream error:", error);
      throw error;
    }
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
    await this.ensureInitialized();

    if (!this.model) {
      const text = await this.fallbackToOtherProviders(prompt, true);
      return this.parseJSONSafely(text);
    }

    this.totalRetryCount = 0; // Reset counter cho mỗi request mới

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

        result = await this.retryWithBackoff(() => jsonModel.generateContent(parts), 3, 2000);
      } else {
        result = await this.retryWithBackoff(() => this.model!.generateContent(parts), 3, 2000);
      }

      return this.parseJSONSafely(result.response.text());
    } catch (error: any) {
      return this.handleError(error, () => this.generateExamQuestionsStructured(prompt, fileParts));
    }
  }

  public async generateWorksheetContentDetailed(topic: string, subject: string, config: any, fileParts: FilePart[] = []): Promise<any> {
    const prompt = `Soạn phiếu bài tập môn ${subject} cho học sinh lớp 1, chủ đề "${topic}".
Cấu hình: ${JSON.stringify(config)}.

QUAN TRỌNG: Trả về JSON thuần túy, KHÔNG thêm markdown hay giải thích.

Cấu trúc JSON:
{
  "title": "Tên phiếu bài tập",
  "subject": "${subject}",
  "questions": [
    {
      "id": "1",
      "type": "mcq",
      "question": "Nội dung câu hỏi",
      "imagePrompt": "Mô tả hình minh họa",
      "options": ["A", "B", "C", "D"],
      "answer": "A"
    }
  ]
}

Loại câu hỏi: mcq (trắc nghiệm), tf (đúng/sai), fill (điền khuyết), match (nối), essay (tự luận), arrange (sắp xếp).`;
    return this.generateExamQuestionsStructured(prompt, fileParts);
  }

  private async retryWithBackoff<T>(fn: () => Promise<T>, retries: number, delay: number): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      if (retries <= 0) throw error;
      if (error.message?.includes("429")) delay *= 2;
      await new Promise(r => setTimeout(r, delay));
      return this.retryWithBackoff(fn, retries - 1, delay);
    }
  }

  private async fallbackToOtherProviders(prompt: string, isJson: boolean): Promise<string> {
    try {
      const result = await generateWithAI({ prompt, provider: 'gemini', model: this.currentModelName });
      return result.text;
    } catch (error: any) {
      throw new Error(`Lỗi kết nối AI Server: ${error.message}. Vui lòng kiểm tra API Key trong Cài đặt.`);
    }
  }

  public async generateQuiz(topic: string, count: number = 5, additionalPrompt: string = ''): Promise<any> {
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
        "question": "Câu hỏi ở đây?",
        "options": [
          { "text": "Đáp án A", "image": "Mô tả hình/SVG nếu đáp án là hình" },
          { "text": "Đáp án B", "image": "" },
          { "text": "Đáp án C", "image": "" },
          { "text": "Đáp án D", "image": "" }
        ],
      }
    ]
    LƯU Ý: Trường 'options' phải là mảng các đối tượng {text, image}. 'image' của câu hỏi cũng rất quan trọng. Trả về DUY NHẤT JSON.`;

    if (!this.model) {
      const text = await this.fallbackToOtherProviders(prompt, true);
      return this.parseJSONSafely(text);
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
        return await this.handleError(error, () => this.generateQuiz(topic, count, additionalPrompt));
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
    // Sử dụng Pollinations.ai (đã ổn định hơn) hoặc dịch vụ tương đương
    const enhancedPrompt = `${prompt}, simple cute drawing for kids, educational illustration, high quality, white background`;

    // Thử lại tối đa 3 lần nếu lỗi kết nối
    for (let i = 0; i < 3; i++) {
      const seed = Math.floor(Math.random() * 1000000);
      const url = `https://image.pollinations.ai/p/${encodeURIComponent(enhancedPrompt)}?nologo=true&seed=${seed}&width=1024&height=1024`;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout per image

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
          const blob = await response.blob();
          if (blob.type.startsWith('image/')) {
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          }
        }
      } catch (error: any) {
        if (error.name === 'AbortError') console.warn("Image generation timeout reached.");
        console.warn(`Lỗi tạo ảnh lần ${i + 1}:`, error);
        if (i === 2) {
          throw new Error("Dịch vụ tạo ảnh đang bận. Thầy Cô có thể bấm 'Vẽ lại' từng câu sau nhé.");
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    throw new Error("Không thể tạo ảnh lúc này.");
  }

  public async generateVideo(prompt: string): Promise<string> {
    // Sử dụng Pollinations.ai cho ảnh video
    const enhancedPrompt = `${prompt}, cinematic, animation style, for kids, educational`;

    for (let i = 0; i < 3; i++) {
      // Thêm tham số ngẫu nhiên để tránh cache
      const seed = Math.floor(Math.random() * 1000000);
      const url = `https://image.pollinations.ai/p/${encodeURIComponent(enhancedPrompt)}?nologo=true&seed=${seed}&width=1280&height=720`;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
          const blob = await response.blob();
          // Pollinations có thể trả về video/mp4 hoặc image/jpeg (cho gif)
          if (blob.type.startsWith('video/') || blob.type.startsWith('image/')) {
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          }
        }
        // Nếu phản hồi không OK, hoặc blob không phải là video/ảnh, nó sẽ rơi xuống logic thử lại.
        console.warn(`Video gen attempt ${i + 1} failed with status: ${response.status}`);
        if (i === 2) { // Lần thử cuối cùng thất bại với lỗi từ máy chủ
          throw new Error(`Máy chủ tạo video đang quá tải (Lỗi ${response.status}). Thầy/Cô vui lòng thử lại sau giây lát.`);
        }
      } catch (error: any) {
        if (error.name === 'AbortError') console.warn("Video generation timeout reached.");
        console.warn(`Lỗi tạo video lần ${i + 1}:`, error);
        if (i === 2) { // Lần thử cuối cùng thất bại do lỗi mạng
          throw new Error("Không thể kết nối đến dịch vụ tạo video. Vui lòng kiểm tra kết nối mạng.");
        }
      }
      // Đợi một chút trước khi thử lại
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

  // --- TIỆN ÍCH ---

  /* --- XỬ LÝ JSON AN TOÀN --- */

  public parseJSONSafely(text: string): any {
    // 1. Dọn dẹp sơ bộ: xóa markdown blocks
    let cleaned = text.replace(/^\uFEFF/, '').trim();

    // Xử lý Smart Quotes (dấu ngoặc kép cong do lỗi font/bộ gõ)
    cleaned = cleaned.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");

    // Regex bắt nội dung trong code block, ưu tiên ```json
    const jsonBlockMatch = cleaned.match(/```(?:json)\s*([\s\S]*?)```/i);
    if (jsonBlockMatch) {
      cleaned = jsonBlockMatch[1].trim();
    } else {
      const codeBlockMatch = cleaned.match(/```(?:\w+)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        cleaned = codeBlockMatch[1].trim();
      }
    }

    // Xử lý trường hợp JSON bị bao bởi ngoặc đơn (JSONP style)
    if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
      cleaned = cleaned.slice(1, -1).trim();
    }

    // 2. Hàm cứu hộ JSON bị cắt ngang (Truncated)
    const rescueTruncated = (str: string): string => {
      let r = str.trim();

      // Tìm điểm bắt đầu của JSON (Object hoặc Array)
      const startBrace = r.indexOf('{');
      const startBracket = r.indexOf('[');
      let startIdx = -1;

      if (startBrace !== -1 && startBracket !== -1) {
        startIdx = Math.min(startBrace, startBracket);
      } else if (startBrace !== -1) {
        startIdx = startBrace;
      } else if (startBracket !== -1) {
        startIdx = startBracket;
      }

      if (startIdx !== -1) {
        r = r.substring(startIdx);
      } else {
        return ""; // Không tìm thấy JSON
      }

      let braces = 0;
      let brackets = 0;
      let inString = false;
      let output = '';

      for (let i = 0; i < r.length; i++) {
        const char = r[i];

        if (inString) {
          if (char === '\\') {
            output += char;
            if (i + 1 < r.length) {
              output += r[i + 1];
              i++;
            }
            continue;
          }
          if (char === '"') {
            inString = false;
          }
          output += char;
          continue;
        }

        // Not in string
        if (char === '"') {
          inString = true;
          output += char;
          continue;
        }

        if (char === '{') braces++;
        else if (char === '}') braces--;
        else if (char === '[') brackets++;
        else if (char === ']') brackets--;

        output += char;

        // Nếu đã đóng hết ngoặc và có nội dung, dừng lại (bỏ qua phần rác phía sau)
        if (braces === 0 && brackets === 0 && (char === '}' || char === ']')) {
          return output;
        }
      }

      // Nếu chạy hết chuỗi mà vẫn chưa đóng ngoặc (JSON bị cắt cụt)
      let final = output.trim();

      // Xử lý lỗi cắt cụt giữa chừng
      if (final.endsWith('\\')) final = final.slice(0, -1);
      if (final.endsWith(',')) final = final.slice(0, -1);

      // Nếu đang trong chuỗi, đóng chuỗi
      if (inString) final += '"';

      // Đóng các ngoặc còn thiếu
      while (brackets > 0) { final += ']'; brackets--; }
      while (braces > 0) { final += '}'; braces--; }

      return final;
    };

    // 3. Hàm sửa lỗi ký tự điều khiển và trailing commas
    const fixCommonErrors = (str: string): string => {
      let s = str;

      // Xóa comments (//... hoặc /*...*/) nhưng bảo vệ chuỗi
      s = s.replace(/("(?:\\[\s\S]|[^"\\])*")|(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, (match, group1) => {
        return group1 ? match : "";
      });

      // Xóa trailing commas (dấu phẩy thừa trước dấu đóng ngoặc)
      s = s.replace(/,\s*([\]}])/g, '$1');

      // Sửa ký tự điều khiển
      s = s.replace(/[\u0000-\u001F]+/g, (match) => {
        const charCodes: Record<number, string> = { 10: "\\n", 13: "\\r", 9: "\\t" };
        let res = "";
        for (let i = 0; i < match.length; i++) {
          res += charCodes[match.charCodeAt(i)] || "";
        }
        return res;
      });

      return s;
    };

    // 5. Hàm sửa lỗi single quotes (Fallback)
    const fixSingleQuotes = (str: string): string => {
      // Thay thế 'key': thành "key":
      let s = str.replace(/'((?:\\.|[^'])*)'\s*:/g, '"$1":');
      // Thay thế : 'value' thành : "value"
      s = s.replace(/:\s*'((?:\\.|[^'])*)'/g, ': "$1"');
      return s;
    };

    // 5.1. Sửa key không có ngoặc kép: {questions:[...]} => {"questions":[...]}
    const fixUnquotedKeys = (str: string): string => {
      return str.replace(/([\{,]\s*)([A-Za-z_$][\w$\- ]*)(\s*:)/g, (_, prefix, key, suffix) => {
        const normalizedKey = String(key).trim().replace(/\s+/g, ' ');
        if (/^(true|false|null)$/i.test(normalizedKey)) return `${prefix}${normalizedKey}${suffix}`;
        return `${prefix}"${normalizedKey}"${suffix}`;
      });
    };

    // 5.2. Chuẩn hóa literal kiểu Python thường bị AI trả về: True/False/None
    const fixNonJsonLiterals = (str: string): string => {
      return str
        .replace(/\bNone\b/g, 'null')
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false');
    };

    // 6. Hàm sửa lỗi thiếu dấu phẩy (Missing Commas) - Thường gặp khi list quá dài
    const fixMissingCommas = (str: string): string => {
      let s = str.replace(/}\s*[\r\n]+\s*{/g, '},{'); // Giữa các object
      s = s.replace(/}\s*{/g, '},{');
      return s;
    };

    // 4. Chiến lược Parse
    // CHIẾN THUẬT QUÉT ĐA TẦNG: Thử tìm JSON ở nhiều vị trí khác nhau
    let currentText = cleaned;
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const rescued = rescueTruncated(currentText);
      if (!rescued) break;

      try {
        return JSON.parse(rescued);
      } catch (e1) {
        try {
          return JSON.parse(fixCommonErrors(rescued));
        } catch (e2) {
          try {
            const superFix = rescued.replace(/\\(?!["\\\/bfnrtu])/g, '\\\\');
            return JSON.parse(fixCommonErrors(superFix));
          } catch (e3) {
            try {
              const singleQuoteFix = fixSingleQuotes(rescued);
              return JSON.parse(fixCommonErrors(singleQuoteFix));
            } catch (e4) {
              try {
                // Cấp cứu 5: Sửa lỗi thiếu dấu phẩy
                const commaFix = fixMissingCommas(rescued);
                return JSON.parse(fixCommonErrors(commaFix));
              } catch (e5) {
                try {
                  // Cấp cứu 6: Sửa object literal gần giống JS/Python
                  const literalFix = fixNonJsonLiterals(fixUnquotedKeys(fixSingleQuotes(rescued)));
                  return JSON.parse(fixCommonErrors(literalFix));
                } catch (e6) {
                  // Cấp cứu 7: Nếu object ngoài cùng lỗi, thử tìm mảng bên trong (thường là questions)
                  const arrayMatch = rescued.match(/\[\s*\{[\s\S]*\}\s*\]/);
                  if (arrayMatch) {
                    try {
                      return JSON.parse(fixCommonErrors(arrayMatch[0]));
                    } catch (e7) { }
                  }

                  // Nếu thất bại, thử tìm JSON ở vị trí tiếp theo trong chuỗi
                  const startBrace = currentText.indexOf('{');
                  const startBracket = currentText.indexOf('[');
                  let startIdx = -1;
                  if (startBrace !== -1 && startBracket !== -1) startIdx = Math.min(startBrace, startBracket);
                  else if (startBrace !== -1) startIdx = startBrace;
                  else if (startBracket !== -1) startIdx = startBracket;

                  if (startIdx !== -1) {
                    // Bỏ qua ký tự bắt đầu hiện tại để tìm cái tiếp theo
                    currentText = currentText.substring(startIdx + 1);
                    continue;
                  } else {
                    break;
                  }
                }
              }
            }
          }
        }
      }
    }

    console.error("JSON Rescue Failed Final.", { original: text });

    // FALLBACK: Trả về object mặc định thay vì throw error
    console.warn("Returning default empty structure due to JSON parse failure");

    // Thử phát hiện xem có phải là mảng hay object
    const trimmed = text.trim();
    if (trimmed.startsWith('[')) {
      // Nếu AI cố gắng trả về mảng, trả về mảng rỗng
      return [];
    }

    // Mặc định trả về object với questions rỗng
    return {
      questions: [],
      readingPassage: "",
      title: "Lỗi tạo nội dung",
      subject: "",
      error: "AI trả về định dạng không chuẩn. Vui lòng thử lại."
    };
  }

  private retryAttempt: number = 0;
  private versionRetryCount: number = 0;
  private modelCycleCount: number = 0;

  private async handleError(error: any, retryFn: () => Promise<any>): Promise<any> {
    const msg = (error.message || "").toLowerCase();
    const status = error.status || 0;
    console.warn("AI Encountered Error:", msg, "Status:", status);

    // NGĂN VÒNG LẶP VÔ HẠN: Kiểm tra tổng số lần retry
    this.totalRetryCount++;
    if (this.totalRetryCount > 10) {
      this.totalRetryCount = 0;
      throw new Error("AI trả về định dạng không chuẩn sau nhiều lần thử. Thầy/Cô vui lòng thử lại sau nhé!");
    }

    // Xử lý lỗi 404, 400, 403 hoặc Model Not Found
    if (msg.includes("404") || msg.includes("not found") || msg.includes("400") || msg.includes("403") || msg.includes("permission") || msg.includes("key not valid") || msg.includes("payload")) {

      // Nếu model hiện tại bị lỗi, xóa khỏi bộ nhớ đệm để lần sau không tự động chọn lại
      localStorage.removeItem('preferred_gemini_model');

      const isModelNotFound = msg.includes("404") || msg.includes("not found");

      // Thử đổi version API (v1 <-> v1beta), nhưng bỏ qua nếu lỗi là do model không tồn tại (404).
      if (!isModelNotFound && this.versionRetryCount < 1) {
        this.versionRetryCount++;
        const newVersion = this.currentVersion === 'v1beta' ? 'v1' : 'v1beta';
        this.setStatus(`Thử kênh ${newVersion} cho ${this.currentModelName}...`);
        console.warn(`Version switch: ${this.currentVersion} -> ${newVersion} for ${this.currentModelName}`);
        this.setupModel(this.currentModelName, newVersion);
        return retryFn();
      }

      // Nếu đổi version vẫn lỗi, hoặc model không tồn tại, chuyển sang model tiếp theo.
      this.versionRetryCount = 0;
      const currentIdx = this.availableModels.indexOf(this.currentModelName);
      const safeCurrentIdx = currentIdx >= 0 ? currentIdx : 0;
      const nextIdx = (safeCurrentIdx + 1) % this.availableModels.length;

      this.modelCycleCount++;
      if (this.modelCycleCount >= this.availableModels.length) {
        this.modelCycleCount = 0;
        this.totalRetryCount = 0;
        throw new Error("❌ LỖI AI: Không tìm thấy Model phù hợp hoặc Key không đủ quyền. Thầy/Cô hãy kiểm tra lại Key cá nhân (API Key) trong Cài đặt nhé!");
      }

      this.setStatus(`Thử đường truyền ${this.availableModels[nextIdx]}...`);
      console.log(`Model switch: ${this.currentModelName} -> ${this.availableModels[nextIdx]}`);
      this.setupModel(this.availableModels[nextIdx], 'v1beta');
      this.retryAttempt = 0;
      return retryFn();
    }

    // Xử lý lỗi 429 (Giới hạn tốc độ/Quota)
    if (
      msg.includes("429") ||
      msg.includes("quota") ||
      msg.includes("limit") ||
      msg.includes("overloaded") ||
      msg.includes("busy") ||
      msg.includes("503") ||
      msg.includes("500") ||
      msg.includes("failed to fetch") ||
      msg.includes("network")
    ) {
      const isNetworkIssue = msg.includes("fetch") || msg.includes("network");

      // Nếu gặp lỗi Quota (429), chuyển model NGAY LẬP TỨC (Fail-Fast Strategy)
      // Không cần chờ đợi vì Free Tier của Google thường khóa cả phút.

      this.retryAttempt = 0;
      this.versionRetryCount = 0;
      const currentIdx = this.availableModels.indexOf(this.currentModelName);
      const safeCurrentIdx = currentIdx >= 0 ? currentIdx : 0;
      const nextIdx = (safeCurrentIdx + 1) % this.availableModels.length;

      this.modelCycleCount++;
      if (this.modelCycleCount >= this.availableModels.length * 2) { // Cho phép lặp lại 2 vòng để chắc chắn
        this.modelCycleCount = 0;
        this.totalRetryCount = 0;
        if (isNetworkIssue) {
          throw new Error("Kết nối AI bị lỗi. Hãy kiểm tra Internet hoặc VPN.");
        }
        throw new Error("⚠️ HẾT HẠN MỨC (429): Đã thử tất cả các dòng AI nhưng đều không phản hồi. \n\n👉 LÝ DO: Có thể Key của Thầy/Cô là bản Miễn phí (Free) nên bị giới hạn tốc độ (RPM) hoặc giới hạn dung lượng hàng ngày.\n\n👉 GIẢI PHÁP:\n1. Đợi khoảng 1-2 phút rồi thử lại.\n2. Nếu vẫn lỗi, hãy thử dùng một tài khoản Google khác để tạo API Key mới.");
      }

      const nextModel = this.availableModels[nextIdx];
      this.setStatus(`Đường truyền ${this.currentModelName} quá tải (429), đang chuyển sang ${nextModel}...`);
      console.warn(`[Auto-Switch] ${this.currentModelName} (429) -> ${nextModel}`);

      this.setupModel(nextModel, 'v1beta');

      // Thêm một chút delay nhỏ để tránh spam
      await new Promise(r => setTimeout(r, 1000));
      return retryFn();
    }

    // Reset counters và throw error cho các lỗi khác
    this.retryAttempt = 0;
    this.versionRetryCount = 0;
    this.totalRetryCount = 0;
    throw error;
  }
}

export const geminiService = new GeminiService();
export const generateWorksheetContentDetailed = (topic: string, subject: string, config: any, fileParts?: FilePart[]) =>
  geminiService.generateWorksheetContentDetailed(topic, subject, config, fileParts);
