
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } from "@google/generative-ai";

export interface FilePart {
  inlineData: {
    data: string;
    mimeType: string;
  }
}

// Sử dụng các model Gemini ổn định nhất và hỗ trợ v1beta/v1
const MODELS = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-2.0-flash',
  'gemini-2.0-flash-exp',
  'gemini-1.5-pro',
  'gemini-1.0-pro'
];

export class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;
  private chat: any | null = null;
  private model: any | null = null;
  private currentModelName: string = MODELS[0];
  private currentVersion: 'v1' | 'v1beta' = 'v1';
  private currentInstruction: string = "Bạn là một trợ lý giáo dục chuyên nghiệp tại Việt Nam.";

  constructor() {
    this.initialize();
  }

  private setStatus(status: string) {
    if (typeof window !== 'undefined') (window as any).ai_status = status;
  }

  private getApiKey(): string {
    // Thử tìm Key ở tất cả các nguồn có thể
    const sources = [
      { name: 'Manual', key: localStorage.getItem('manually_entered_api_key') },
      { name: 'Vite Env', key: (import.meta as any).env?.VITE_GEMINI_API_KEY },
      { name: 'Gemini Env', key: (import.meta as any).env?.GEMINI_API_KEY },
      { name: 'Window Vite', key: (window as any).VITE_GEMINI_API_KEY },
      { name: 'Window Gemini', key: (window as any).GEMINI_API_KEY }
    ];

    for (const source of sources) {
      if (typeof source.key === 'string') {
        const cleaned = source.key.trim().replace(/["']/g, '');
        if (cleaned.startsWith('AIza') && cleaned.length > 30 && cleaned !== 'YOUR_NEW_API_KEY_HERE') {
          console.log(`Assistant: Using API Key from ${source.name}`);
          return cleaned;
        }
      }
    }
    return '';
  }

  private initialize() {
    const key = this.getApiKey();
    if (key) {
      this.genAI = new GoogleGenerativeAI(key);
      this.setupModel(MODELS[0], 'v1beta');
      console.log("AI Assistant: API Key detected and active.");
    } else {
      this.setStatus("LỖI: Chưa cấu hình API Key");
      console.warn("AI Assistant: No valid API Key found.");
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
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ]
    }, { apiVersion: version });
    this.setStatus(`AI Sẵn sàng (${modelName})`);
  }

  private async ensureInitialized() {
    if (!this.genAI) this.initialize();
    if (!this.genAI) throw new Error("Chưa có API Key. Thầy/Cô hãy kiểm tra lại cấu hình nhé!");
  }

  // --- FALLBACK PROVIDERS (OpenAI / Claude) ---

  private getOtherApiKey(provider: 'openai' | 'anthropic'): string {
    const keyName = provider === 'openai' ? 'VITE_OPENAI_API_KEY' : 'VITE_ANTHROPIC_API_KEY';
    const localKey = localStorage.getItem(provider + '_api_key');
    if (localKey) return localKey;
    const envKey = (import.meta as any).env?.[keyName] || (window as any)[keyName] || '';
    if (envKey) return envKey;

    if (provider === 'openai') {
      return '';
    }
    return '';
  }

  private async fallbackToOtherProviders(prompt: string, isJson: boolean = false, fileParts?: FilePart[]): Promise<string> {
    // 1. Thử OpenAI (GPT-4o-mini hỗ trợ Vision)
    const openaiKey = this.getOtherApiKey('openai');
    if (openaiKey) {
      this.setStatus("Đang chuyển sang OpenAI (GPT)...");
      try {
        const messages: any[] = [];
        const content: any[] = [{ type: "text", text: prompt }];

        // Thêm ảnh nếu có
        if (fileParts && fileParts.length > 0) {
          fileParts.forEach(part => {
            if (part.inlineData.mimeType.startsWith('image/')) {
              content.push({
                type: "image_url",
                image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` }
              });
            }
          });
        }

        messages.push({ role: 'user', content });

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages,
            response_format: isJson ? { type: "json_object" } : undefined,
            max_tokens: 4096
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        return data.choices[0].message.content;
      } catch (e) {
        console.warn("OpenAI Fallback Error:", e);
      }
    }

    // 2. Thử Anthropic (Claude 3 Haiku)
    const anthropicKey = this.getOtherApiKey('anthropic');
    if (anthropicKey) {
      this.setStatus("Đang chuyển sang Claude...");
      try {
        // Claude 3 cũng hỗ trợ ảnh nhưng định dạng hơi khác, tạm thời gửi text để đảm bảo ổn định
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'dangerously-allow-browser': 'true' },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 4096,
            messages: [{ role: 'user', content: prompt + (isJson ? "\n\nIMPORTANT: Respond with valid JSON only." : "") }]
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        return data.content[0].text;
      } catch (e) { console.warn("Anthropic Fallback Error:", e); }
    }

    throw new Error("⚠️ QUOTA EXCEEDED (429): Thầy/Cô đã hết lượt sử dụng miễn phí của Google Gemini và không tìm thấy Key dự phòng (OpenAI/Claude).\n\n💡 GIẢI PHÁP:\n1. Đợi vài phút rồi thử lại (nếu bị giới hạn tạm thời).\n2. Nhập API Key cá nhân trong phần 'Cài đặt' (biểu tượng 🔑) để tiếp tục sử dụng KHÔNG GIỚI HẠN.");
  }

  // --- TRÒ CHUYỆN (Chat & Streaming) ---

  public async initChat(instruction: string) {
    await this.ensureInitialized();
    this.currentInstruction = instruction;
    this.chat = this.model.startChat({
      history: [
        { role: 'user', parts: [{ text: `System Instruction: ${instruction}` }] },
        { role: 'model', parts: [{ text: "Tôi đã hiểu quy tắc làm việc. Tôi sẵn sàng hỗ trợ Thầy Cô." }] }
      ]
    });
  }

  public async* sendMessageStream(prompt: string, fileParts?: FilePart[]) {
    await this.ensureInitialized();
    if (!this.chat) await this.initChat(this.currentInstruction);

    const parts = [...(fileParts || []), { text: prompt }];
    try {
      // Retry logic for streaming
      let result: any;
      let streamAttempt = 0;
      const maxStreamAttempts = 5;

      while (streamAttempt < maxStreamAttempts) {
        try {
          result = await this.chat.sendMessageStream(parts);
          break;
        } catch (streamError: any) {
          const isRetryable = streamError.message?.includes('429') ||
            streamError.message?.includes('503') ||
            streamError.message?.includes('502') ||
            streamError.message?.includes('timeout');

          if (!isRetryable || streamAttempt === maxStreamAttempts - 1) {
            throw streamError;
          }
          streamAttempt++;
          await this.delayWithBackoff(streamAttempt, 3000);
        }
      }

      for await (const chunk of result.stream) {
        let text = '';
        try {
          text = chunk.text();
        } catch (e) {
          // Skip errors if chunk is blocked by safety settings
        }
        yield {
          text: text,
          grounding: (chunk as any).candidates?.[0]?.groundingMetadata
        };
      }
    } catch (error: any) {
      if (error.message?.includes("429") || error.message?.includes("503")) {
        // Rate limit or service unavailable - try fallback providers
        try {
          const fallbackText = await this.fallbackToOtherProviders(prompt, false);
          yield { text: fallbackText, grounding: null };
          return;
        } catch (e) {
          throw new Error("Lượt dùng miễn phí hiện tại đã hết. Thầy Cô vui lòng đợi 1 phút rồi thử lại nhé!");
        }
      }
      if (error.message?.includes("safety") || error.message?.includes("blocked")) {
        throw new Error("Nội dung câu hỏi hoặc câu trả lời bị hệ thống an toàn chặn. Thầy/Cô vui lòng diễn đạt lại câu hỏi nhé!");
      }
      throw error;
    }
  }

  // --- HỖ TRỢ RATE LIMITING ---

  // Exponential backoff with jitter for rate limiting
  private async delayWithBackoff(attempt: number, baseDelay: number = 2000): Promise<void> {
    const jitter = Math.random() * 1000; // Add random jitter to avoid thundering herd
    const delay = baseDelay * Math.pow(2, attempt) + jitter;
    console.warn(`Rate limit backoff: waiting ${Math.round(delay)}ms before retry...`);
    await new Promise(r => setTimeout(r, delay));
  }

  // Generic retry logic for API calls
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 5,
    baseDelay: number = 2000
  ): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        // Check if error is retryable (rate limiting, server errors, network issues)
        const isRetryable = error.message?.includes('429') ||
          error.message?.includes('503') ||
          error.message?.includes('502') ||
          error.message?.includes('500') ||
          error.message?.includes('timeout') ||
          error.message?.includes('network') ||
          error.message?.includes('ECONNRESET') ||
          error.message?.includes('ETIMEDOUT') ||
          error.message?.includes('ENOTFOUND');

        if (!isRetryable || attempt === maxRetries - 1) {
          throw error;
        }

        await this.delayWithBackoff(attempt, baseDelay);
      }
    }
    throw lastError;
  }

  // --- TẠO NỘI DUNG VĂN BẢN ---

  public async generateText(prompt: string, fileParts?: FilePart[]): Promise<string> {
    await this.ensureInitialized();
    try {
      const parts = [...(fileParts || []), { text: `${this.currentInstruction}\n\nYêu cầu: ${prompt}` }];
      return await this.retryWithBackoff(() => this.model.generateContent(parts));
    } catch (error: any) {
      try {
        return await this.handleError(error, () => this.generateText(prompt, fileParts));
      } catch (finalError) {
        if (fileParts && fileParts.length > 0) throw finalError;
        return this.fallbackToOtherProviders(`${this.currentInstruction}\n\nYêu cầu: ${prompt}`);
      }
    }
  }

  // --- TẠO ĐỀ THI / PHIẾU HỌC TẬP (JSON) ---

  public async generateExamQuestionsStructured(prompt: string, fileParts?: FilePart[]) {
    await this.ensureInitialized();
    this.setStatus("Đang soạn nội dung...");

    const fullPrompt = `${this.currentInstruction}

    **NHIỆM VỤ CỐT LÕI:** Số hóa đề thi từ file PDF/Ảnh đính kèm. Đặc biệt ưu tiên các đề Trạng Nguyên Tiếng Việt, Toán Olympic, Violympic.
    **MỤC TIÊU:** Phải trích xuất ĐẦY ĐỦ 30 CÂU HỎI (theo đúng số lượng trong các đề thi này). Hãy kiên nhẫn xử lý đến câu cuối cùng (câu 30), TUYỆT ĐỐI KHÔNG BỎ QUA hay tóm tắt nội dung.

    **QUY TẮC XỬ LÝ (BẮT BUỘC TUÂN THỦ NGHIÊM NGẶT):**

    **1. VỀ CẤU TRÚC & SỐ LƯỢNG:**
       - **KHÔNG BAO GIỜ** được trả về một mảng chỉ chứa đáp án (ví dụ: \`["A", "B", "C"]\`).
       - **LUÔN LUÔN** trả về cấu trúc JSON đầy đủ như trong mẫu, bao gồm \`title\`, \`subject\`, và mảng \`questions\`.
       - **SỐ LƯỢNG:** Phải đếm kỹ và lấy đủ số lượng câu hỏi trong đề (ví dụ đề có 30 câu thì JSON phải có đủ 30 phần tử).

    **2. VỀ HÌNH ẢNH VÀ CẮT ẢNH TỪ ĐỀ (QUAN TRỌNG NHẤT):**
       - Với **MỌI CÂU HỎI**, bạn **PHẢI** xác định nó nằm ở trang nào và trả về trường \`"page_index": N\` (N là số trang, bắt đầu từ 0).
       - **XỬ LÝ HÌNH ẢNH:** Nếu câu hỏi hoặc đáp án chứa hình ảnh (hình học, đồ thị, hình minh họa), bạn KHÔNG ĐƯỢC BỎ QUA.
       - **LỆNH CẮT ẢNH:** Thay vì chỉ mô tả, hãy ra lệnh cho hệ thống cắt ảnh từ file gốc.
       - Cú pháp điền vào trường \`image\`: \`"[CẮT ẢNH TỪ ĐỀ: Trang {số_trang} - {mô_tả_ngắn_gọn}]"\`.
       - Ví dụ: \`"image": "[CẮT ẢNH TỪ ĐỀ: Trang 2 - Hình tam giác ABC]"\`.

    **3. VỀ NỘI DUNG:**
       - **Câu hỏi quy luật/Hình ảnh:** Nếu có thể mô tả bằng lời thì mô tả, nếu phức tạp hãy dùng lệnh [CẮT ẢNH TỪ ĐỀ...] như trên.
       - **Câu hỏi điền từ:** Mô tả rõ ngữ cảnh. Ví dụ: \`"content": "Điền từ thích hợp vào chỗ trống: 'Học ... đôi với hành'"\`
       - **Đáp án:** Trường \`"answer"\` phải chứa **ĐẦY ĐỦ NỘI DUNG** của đáp án đúng, không chỉ là "A" hay "B".
       - **Giải thích (\`explanation\`):** Ngắn gọn, chỉ ra quy luật hoặc logic.

    QUY TẮC CƠ BẢN ĐỂ TRÁNH LỖI JSON:
    1. QUAN TRỌNG NHẤT: Chỉ trả về JSON. KHÔNG có lời dẫn (Ví dụ: "Đây là kết quả..."). Bắt buộc dùng dấu ngoặc kép (") cho tên trường và giá trị chuỗi.
    2. KHÔNG ĐƯỢC chứa comment (// hoặc /* */).
    3. Escape kỹ các ký tự đặc biệt:
       - Dấu ngoặc kép (") -> \\"
       - Dấu gạch chéo (\\) trong LaTeX -> \\\\ (Ví dụ: \\\\frac{a}{b})
    4. Không xuống dòng trong chuỗi, dùng \\n.
    5. Không để dấu phẩy thừa cuối mảng/đối tượng.
    
    CẤU TRÚC JSON MẪU (BẮT BUỘC):
    { 
      "title": "Tên đề thi", 
      "subject": "Môn học", 
      "questions": [ 
        { 
          "type": "Trắc nghiệm", 
          "content": "Câu hỏi?", 
          "options": [
            { "text": "A", "image": "" },
            { "text": "B", "image": "" }
          ], 
          "answer": "A", 
          "explanation": "Giải thích ngắn gọn", 
          "image": "[CẮT ẢNH TỪ ĐỀ: Trang 0 - Hình tam giác ABC]",
          "page_index": 0 
        } 
      ] 
    }`;

    try {
      // Kết hợp instruction mặc định và prompt tùy chỉnh của người dùng
      const combinedPrompt = `${fullPrompt}\n\nBỔ XUNG YÊU CẦU CỤ THỂ:\n${prompt}`;
      const parts = [...(fileParts || []), { text: combinedPrompt }];

      // Sử dụng model tạm thời với cấu hình JSON Mode để đảm bảo dữ liệu trả về luôn chuẩn
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
      }, { apiVersion: this.currentVersion });

      // Use retry logic for API calls
      const result = await this.retryWithBackoff(() => jsonModel.generateContent(parts), 5, 3000);
      const text = result.response.text();
      let json = this.parseJSONSafely(text);

      // Fallback 1: Nếu AI chỉ trả về mảng (do lỗi format), tự động bọc lại
      if (Array.isArray(json)) {
        json = { questions: json };
      }

      // Fallback 2: Duyệt tìm mảng 'questions' hoặc bất kỳ mảng nào có thể là danh sách câu hỏi
      const findQuestionsArray = (obj: any): any[] | null => {
        if (!obj || typeof obj !== 'object') return null;
        if (Array.isArray(obj.questions) && obj.questions.length > 0) return obj.questions;
        if (Array.isArray(obj.items) && obj.items.length > 0) return obj.items;
        if (Array.isArray(obj.data) && obj.data.length > 0) return obj.data;

        for (const key in obj) {
          if (Array.isArray(obj[key]) && obj[key].length > 0) {
            // Kiểm tra xem các phần tử trong mảng có giống câu hỏi không
            const firstItem = obj[key][0];
            if (firstItem && (firstItem.question || firstItem.content || firstItem.q)) {
              return obj[key];
            }
          } else if (typeof obj[key] === 'object') {
            const found = findQuestionsArray(obj[key]);
            if (found) return found;
          }
        }
        return null;
      };

      const extractedQuestions = findQuestionsArray(json);
      if (extractedQuestions) {
        json.questions = extractedQuestions;
      }

      if (json && json.questions && Array.isArray(json.questions)) {
        json.questions = json.questions.map((q: any) => ({
          ...q,
          id: q.id || 'q-' + Math.random().toString(36).substr(2, 9),
          content: q.content || q.question || q.q || 'Nội dung chưa rõ',
          question: q.question || q.content || q.q || 'Nội dung chưa rõ'
        }));
      } else {
        // Nếu hoàn toàn không tìm thấy mảng câu hỏi
        return { questions: [] };
      }

      return json;
    } catch (error: any) {
      console.error("Lỗi AI bóc tách đề:", error);
      try {
        return await this.handleError(error, () => this.generateExamQuestionsStructured(prompt, fileParts));
      } catch (finalError) {
        const text = await this.fallbackToOtherProviders(fullPrompt, true, fileParts);
        return this.parseJSONSafely(text);
      }
    }
  }

  public async generateWorksheetContentDetailed(topic: string, subject: string, config: any, fileParts?: FilePart[]) {
    const prompt = `Soạn phiếu học tập đa dạng cho học sinh lớp 1. Chủ đề: ${topic}, Môn: ${subject}. Cơ cấu: Trắc nghiệm (${config.mcq}), Đúng/Sai (${config.tf}), Điền khuyết (${config.fill}), Nối cột (${config.match}), Sắp xếp từ thành câu (${config.arrange || 0}), Tự luận (${config.essay}).`;
    return this.generateExamQuestionsStructured(prompt, fileParts);
  }

  public async generateCrossword(topic: string, size: number = 12, wordCount: number = 10): Promise<any> {
    await this.ensureInitialized();
    this.setStatus("Đang tạo ô chữ...");

    const prompt = `Tạo một trò chơi ô chữ cho học sinh tiểu học với chủ đề "${topic}".
    
    YÊU CẦU:
    1.  Tạo một lưới ${size}x${size}.
    2.  Tạo khoảng ${wordCount} từ liên quan đến chủ đề. Các từ không quá dài (tối đa ${size} chữ cái), không có dấu và viết hoa.
    3.  Sắp xếp các từ vào lưới sao cho chúng giao nhau hợp lệ.
    4.  Cung cấp gợi ý (clue) đơn giản, dễ hiểu cho mỗi từ.
    5.  Trả về DUY NHẤT một đối tượng JSON, không có văn bản giải thích nào khác.
    
    CẤU TRÚC JSON BẮT BUỘC:
    {
      "size": ${size},
      "words": [
        {
          "word": "TUVUNG",
          "clue": "Gợi ý cho từ này",
          "direction": "across" | "down",
          "row": 0, // 0-indexed
          "col": 0  // 0-indexed
        }
      ]
    }`;

    try {
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
      }, { apiVersion: this.currentVersion });

      const result = await this.retryWithBackoff(() => jsonModel.generateContent(prompt), 5, 3000);
      const text = result.response.text();
      return this.parseJSONSafely(text);
    } catch (error: any) {
      console.error("Lỗi tạo ô chữ:", error);
      try {
        return await this.handleError(error, () => this.generateCrossword(topic, size, wordCount));
      } catch (finalError) {
        const text = await this.fallbackToOtherProviders(prompt, true);
        return this.parseJSONSafely(text);
      }
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

    try {
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

      const result = await this.retryWithBackoff(() => jsonModel.generateContent(prompt), 5, 3000);
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
        const response = await fetch(url);
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
      } catch (error) {
        console.warn(`Lỗi tạo ảnh lần ${i + 1}:`, error);
        if (i === 2) {
          throw new Error("Dịch vụ tạo ảnh đang gặp sự cố hoặc quá tải. Thầy Cô vui lòng thử lại sau ít phút.");
        }
        await new Promise(r => setTimeout(r, 1500)); // Đợi một chút trước khi thử lại
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
        const response = await fetch(url);
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
        // Nếu phản hồi không OK, hoặc blob không phải là ảnh, nó sẽ rơi xuống logic thử lại.
        console.warn(`Video gen attempt ${i + 1} failed with status: ${response.status}`);
        if (i === 2) { // Lần thử cuối cùng thất bại với lỗi từ máy chủ
          throw new Error(`Máy chủ tạo video đang quá tải (Lỗi ${response.status}). Thầy/Cô vui lòng thử lại sau giây lát.`);
        }
      } catch (error) {
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
  public async generateSuggestions(history: string[], persona: string): Promise<string[]> {
    if (history.length === 0) return [];
    try {
      const res = await this.generateText(`Dựa trên cuộc trò chuyện: ${history.slice(-2).join(' | ')}. Gợi ý 3 câu hỏi tiếp theo ngắn gọn.`);
      return res.split('\n').filter(s => s.trim().length > 5).slice(0, 3);
    } catch {
      return [];
    }
  }

  // --- TIỆN ÍCH ---

  /* --- XỬ LÝ JSON AN TOÀN --- */

  public parseJSONSafely(text: string): any {
    // 1. Dọn dẹp sơ bộ: xóa markdown blocks
    let cleaned = text.trim();

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
                // Cấp cứu 6: Nếu object ngoài cùng lỗi, thử tìm mảng bên trong (thường là questions)
                const arrayMatch = rescued.match(/\[\s*\{[\s\S]*\}\s*\]/);
                if (arrayMatch) {
                  try {
                    return JSON.parse(fixCommonErrors(arrayMatch[0]));
                  } catch (e6) { }
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

    console.error("JSON Rescue Failed Final.", { original: text });
    throw new Error(`AI trả về định dạng không chuẩn. Thầy/Cô vui lòng bấm 'Tạo lại' nhé.`);
  }

  private retryAttempt: number = 0;

  private async handleError(error: any, retryFn: () => Promise<any>): Promise<any> {
    const msg = (error.message || "").toLowerCase();
    const status = error.status || 0;
    console.warn("AI Encountered Error:", msg, "Status:", status);

    // Xử lý lỗi 404, 400, 403 hoặc Model Not Found
    // Lỗi 400/403 thường do Model không hỗ trợ hoặc Key không có quyền, nên đổi Model luôn
    if (msg.includes("404") || msg.includes("not found") || msg.includes("400") || msg.includes("403") || msg.includes("permission") || msg.includes("key not valid")) {
      // Thử đổi version API (v1 <-> v1beta) trước khi đổi model
      if (this.currentVersion === 'v1beta' && !msg.includes("2.0")) {
        this.setStatus(`Thử lại với kênh v1 cho ${this.currentModelName}...`);
        this.setupModel(this.currentModelName, 'v1');
        return retryFn();
      } else if (this.currentVersion === 'v1') {
        this.setStatus(`Thử lại với kênh v1beta cho ${this.currentModelName}...`);
        this.setupModel(this.currentModelName, 'v1beta');
        return retryFn();
      }

      const nextIdx = MODELS.indexOf(this.currentModelName) + 1;
      if (nextIdx < MODELS.length) {
        this.setStatus(`Chuyển sang model ${MODELS[nextIdx]}...`);
        this.setupModel(MODELS[nextIdx], 'v1beta');
        this.retryAttempt = 0; // Reset retry attempt when changing model
        return retryFn();
      } else {
        // Nếu đã thử hết danh sách mà vẫn lỗi
        throw new Error("❌ LOI KET NOI (403/404): Không tìm thấy model AI phù hợp hoặc API Key gặp lỗi quyền truy cập. Thầy/Cô hãy kiểm tra lại loại Key (Gemini) hoặc thử đổi sang Key khác trong phần Cài đặt nhé!");
      }
    }

    // Xử lý lỗi 429 (Giới hạn tốc độ/Quota) - Tự động thử lại hoặc đổi Model
    // Bổ sung thêm các lỗi 503, 500, overloaded, busy
    if (
      msg.includes("429") ||
      msg.includes("quota") ||
      msg.includes("limit") ||
      msg.includes("overloaded") ||
      msg.includes("busy") ||
      msg.includes("503") ||
      msg.includes("500") ||
      msg.includes("failed to fetch") ||
      msg.includes("networkerror") ||
      msg.includes("network request failed") ||
      msg.includes("load failed")
    ) {
      const isNetworkIssue =
        msg.includes("failed to fetch") ||
        msg.includes("networkerror") ||
        msg.includes("network request failed") ||
        msg.includes("load failed");

      // Tự động đọc thời gian chờ từ thông báo lỗi của Google
      let waitMs = isNetworkIssue ? 1500 : (this.retryAttempt === 0 ? 2000 : 5000); // Mạng lỗi thì thử lại nhanh hơn
      const match = msg.match(/retry in (\d+(\.\d+)?)s/);
      if (match) {
        waitMs = Math.ceil(parseFloat(match[1]) * 1000) + 2000; // Thêm buffer 2s an toàn
      }

      // Nếu Google bảo chờ quá lâu (> 8s), hoặc đã thử lại 1 lần bận liên tiếp
      // thì đổi model luôn cho nhanh
      if (waitMs > 10000 || this.retryAttempt >= 2 || isNetworkIssue) {
        this.retryAttempt = 0;
        const currentIdx = MODELS.indexOf(this.currentModelName);
        const nextIdx = (currentIdx + 1) % MODELS.length; // Vòng lặp các model

        // Nếu đã thử qua tất cả các model mà vẫn lỗi (vòng quay trở lại model đầu)
        if (nextIdx === 0 && currentIdx !== -1) {
          if (isNetworkIssue) {
            throw new Error("Kết nối mạng tới Google AI đang bị gián đoạn. Thầy/Cô kiểm tra Internet/VPN hoặc thử lại sau nhé.");
          }
          throw new Error("⚠️ QUOTA EXCEEDED (429): Tất cả các đường truyền AI (Gemini 1.5, 2.0...) đều đang bận hoặc hết hạn mức sử dụng miễn phí.");
        }

        this.setStatus(`Chuyển sang đường truyền dự phòng ${MODELS[nextIdx]}...`);
        this.setupModel(MODELS[nextIdx], 'v1beta');
        return retryFn();
      }

      this.retryAttempt++;
      this.setStatus(`Google báo bận, đang thử lại sau ${Math.round(waitMs / 1000)} giây...`);
      await new Promise(r => setTimeout(r, waitMs));
      return retryFn();
    }

    this.retryAttempt = 0; // Reset nếu là lỗi khác
    throw error;
  }
}

export const geminiService = new GeminiService();
export const generateWorksheetContentDetailed = (topic: string, subject: string, config: any, fileParts?: FilePart[]) =>
  geminiService.generateWorksheetContentDetailed(topic, subject, config, fileParts);
