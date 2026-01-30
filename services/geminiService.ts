
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } from "@google/generative-ai";

export interface FilePart {
  inlineData: {
    data: string;
    mimeType: string;
  }
}

// Ưu tiên các model Lite vì có Quota (hạn mức) cao hơn cho tài khoản miễn phí
// Ưu tiên các model ổn định và có Quota cao
const MODELS = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro'];
// Ánh xạ model name sang alias nếu cần
const MODEL_ALIASES: Record<string, string> = {
  'gemini-1.5-flash': 'gemini-flash-latest',
  'gemini-1.5-flash-8b': 'gemini-flash-lite-latest',
  'gemini-1.5-pro': 'gemini-pro-latest'
};

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
      localStorage.getItem('manually_entered_api_key'),
      (import.meta as any).env?.VITE_GEMINI_API_KEY,
      (window as any).VITE_GEMINI_API_KEY,
      (window as any).process?.env?.VITE_GEMINI_API_KEY
    ];

    for (const key of sources) {
      if (typeof key === 'string') {
        const cleaned = key.trim().replace(/["']/g, '');
        // Kiểm tra xem có phải mã Key thật của Google không (bắt đầu bằng AIza và đủ độ dài)
        if (cleaned.startsWith('AIza') && cleaned.length > 30 && cleaned !== 'YOUR_NEW_API_KEY_HERE') {
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

    // Sử dụng alias nếu có (để tăng khả năng tương thích)
    const activeModelName = MODEL_ALIASES[modelName] || modelName;

    this.currentModelName = modelName;
    this.currentVersion = version;
    this.chat = null;

    this.model = this.genAI.getGenerativeModel({
      model: activeModelName,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ]
    }, { apiVersion: version });
    this.setStatus(`AI Sẵn sàng (${activeModelName})`);
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
    return (import.meta as any).env?.[keyName] || (window as any)[keyName] || '';
  }

  private async fallbackToOtherProviders(prompt: string, isJson: boolean = false): Promise<string> {
    // 1. Thử OpenAI (GPT-4o-mini)
    const openaiKey = this.getOtherApiKey('openai');
    if (openaiKey) {
      this.setStatus("Đang chuyển sang OpenAI (GPT)...");
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            response_format: isJson ? { type: "json_object" } : undefined
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        return data.choices[0].message.content;
      } catch (e) { console.warn("OpenAI Fallback Error:", e); }
    }

    // 2. Thử Anthropic (Claude 3 Haiku)
    const anthropicKey = this.getOtherApiKey('anthropic');
    if (anthropicKey) {
      this.setStatus("Đang chuyển sang Claude...");
      try {
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

    throw new Error("Hết lượt dùng Google Gemini và không tìm thấy Key dự phòng (OpenAI/Claude). Thầy Cô vui lòng đợi 1-2 phút hoặc nhập Key cá nhân.");
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
      const result = await this.chat.sendMessageStream(parts);
      for await (const chunk of result.stream) {
        yield {
          text: chunk.text(),
          grounding: (chunk as any).candidates?.[0]?.groundingMetadata
        };
      }
    } catch (error: any) {
      if (error.message?.includes("429")) {
        throw new Error("Lượt dùng miễn phí hiện tại đã hết. Thầy Cô vui lòng đợi 1 phút rồi thử lại nhé!");
      }
      throw error;
    }
  }

  // --- TẠO NỘI DUNG VĂN BẢN ---

  public async generateText(prompt: string): Promise<string> {
    await this.ensureInitialized();
    try {
      const result = await this.model.generateContent([
        { text: `${this.currentInstruction}\n\nYêu cầu: ${prompt}` }
      ]);
      return result.response.text();
    } catch (error: any) {
      try {
        return await this.handleError(error, () => this.generateText(prompt));
      } catch (finalError) {
        return this.fallbackToOtherProviders(`${this.currentInstruction}\n\nYêu cầu: ${prompt}`);
      }
    }
  }

  // --- TẠO ĐỀ THI / PHIẾU HỌC TẬP (JSON) ---

  public async generateExamQuestionsStructured(prompt: string, fileParts?: FilePart[]) {
    await this.ensureInitialized();
    this.setStatus("Đang soạn nội dung...");

    const fullPrompt = `${this.currentInstruction}\n\nYêu cầu: ${prompt}\n\nQUY TẮC CƠ BẢN ĐỂ TRÁNH LỖI JSON:
    1. Trả về DUY NHẤT mã JSON, không chứa bất kỳ văn bản giải thích nào ở trước hoặc sau.
    2. Nếu trong nội dung câu hỏi hoặc đáp án có dấu ngoặc kép ("), PHẢI viết là \\"
    3. Tránh sử dụng các ký tự điều khiển lạ. Các công thức toán học nếu có dấu \\ thì phải viết double thành \\\\
    4. Không được xuống dòng thực sự bên trong giá trị của một trường, hãy dùng ký tự \\n.
    
    CẤU TRÚC JSON MẪU:
    { 
      "title": "Tên đề thi", 
      "subject": "Môn học", 
      "readingPassage": "Văn bản đọc hiểu (nếu có)", 
      "questions": [ 
        { 
          "type": "Trắc nghiệm", 
          "content": "Câu hỏi số 1?", 
          "options": ["A. Đáp án 1", "B. Đáp án 2", "C. Đáp án 3", "D. Đáp án 4"], 
          "answer": "A. Đáp án 1", 
          "explanation": "Giải thích tại sao A đúng", 
          "imagePrompt": "Mô tả hình ảnh công thức/sơ đồ nếu cần" 
        } 
      ] 
    }`;

    try {
      const parts = [...(fileParts || []), { text: fullPrompt }];

      // Sử dụng model tạm thời với cấu hình JSON Mode để đảm bảo dữ liệu trả về luôn chuẩn
      const activeModelName = MODEL_ALIASES[this.currentModelName] || this.currentModelName;
      const jsonModel = this.genAI!.getGenerativeModel({
        model: activeModelName,
        generationConfig: { responseMimeType: "application/json" }
      }, { apiVersion: 'v1beta' });

      const result = await jsonModel.generateContent(parts);
      const text = result.response.text();
      const json = this.parseJSONSafely(text);

      if (json.questions) {
        json.questions = json.questions.map((q: any) => ({
          ...q,
          id: 'q-' + Math.random().toString(36).substr(2, 9),
          content: q.content || q.question || '',
          question: q.question || q.content || ''
        }));
      }
      return json;
    } catch (error: any) {
      console.error("Lỗi AI:", error);
      try {
        return await this.handleError(error, () => this.generateExamQuestionsStructured(prompt, fileParts));
      } catch (finalError) {
        if (fileParts && fileParts.length > 0) throw finalError; // Fallback chưa hỗ trợ file
        const text = await this.fallbackToOtherProviders(fullPrompt, true);
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
      const activeModelName = MODEL_ALIASES[this.currentModelName] || this.currentModelName;
      const jsonModel = this.genAI!.getGenerativeModel({
        model: activeModelName,
        generationConfig: { responseMimeType: "application/json" }
      }, { apiVersion: 'v1beta' });

      const result = await jsonModel.generateContent(prompt);
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

  public async generateQuiz(topic: string, count: number = 5): Promise<any> {
    await this.ensureInitialized();
    this.setStatus("Đang soạn câu hỏi Quiz...");

    const prompt = `Soạn ${count} câu hỏi trắc nghiệm vui nhộn về chủ đề "${topic}" cho học sinh tiểu học.
    YÊU CẦU:
    1. Trả về DUY NHẤT một mảng JSON.
    2. Mỗi câu hỏi có 4 đáp án (options).
    3. Chỉ định rõ đáp án đúng (answer) phải khớp chính xác với một trong các options.
    
    CẤU TRÚC JSON:
    [
      {
        "question": "Câu hỏi ở đây?",
        "options": ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
        "answer": "Đáp án A",
        "explanation": "Giải thích ngắn gọn vì sao đúng"
      }
    ]`;

    try {
      const activeModelName = MODEL_ALIASES[this.currentModelName] || this.currentModelName;
      const jsonModel = this.genAI!.getGenerativeModel({
        model: activeModelName,
        generationConfig: { responseMimeType: "application/json" }
      }, { apiVersion: 'v1beta' });

      const result = await jsonModel.generateContent(prompt);
      const text = result.response.text();
      return this.parseJSONSafely(text);
    } catch (error: any) {
      console.error("Lỗi tạo Quiz:", error);
      try {
        return await this.handleError(error, () => this.generateQuiz(topic, count));
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
    // Không dùng Gemini để vẽ (vì phiên bản miễn phí thường lỗi 429 khi vẽ nhiều)
    // Tận dụng API bên ngoài để ổn định và nhanh hơn cho GV
    const seed = Math.floor(Math.random() * 9999);
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + " simple cute drawing for kids")}?width=600&height=400&seed=${seed}&nologo=true`;
  }

  public async generateVideo(prompt: string): Promise<string> {
    const seed = Math.floor(Math.random() * 9999);
    // Pollinations.ai có thể tạo video ngắn, nhưng chất lượng và độ ổn định không cao.
    // Đây là một giải pháp tạm thời để có tính năng.
    // Thêm các từ khóa "video, animation" để tăng khả năng AI hiểu đúng yêu cầu,
    // ngay cả khi prompt đầu vào là tiếng Việt.
    const finalPrompt = `${prompt}, video, animation, cinematic`;
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?model=video&seed=${seed}&nologo=true`;
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

  private parseJSONSafely(text: string): any {
    // 1. Tìm và bóc tách khối JSON (Hỗ trợ cả Object {} và Array [])
    const extractJSON = (input: string): string => {
      const firstOpenBrace = input.indexOf('{');
      const firstOpenBracket = input.indexOf('[');

      let start = -1;
      let end = -1;

      // Xác định xem là Object hay Array dựa vào cái nào xuất hiện trước
      if (firstOpenBracket !== -1 && (firstOpenBrace === -1 || firstOpenBracket < firstOpenBrace)) {
        start = firstOpenBracket;
        end = input.lastIndexOf(']');
      } else if (firstOpenBrace !== -1) {
        start = firstOpenBrace;
        end = input.lastIndexOf('}');
      }

      if (start !== -1 && end !== -1 && end > start) {
        return input.substring(start, end + 1);
      }
      return input;
    };

    let cleaned = extractJSON(text.trim());

    // 2. Hàm sửa lỗi JSON "siêu cấp"
    const ultraRepair = (str: string): string => {
      let r = str;

      // A. Sửa lỗi backslash: Chỉ giữ lại các escape hơp lệ, còn lại biến thành double backslash
      // Các escape hợp lệ: " \ / b f n r t uXXXX
      r = r.replace(/\\/g, '__BACKSLASH__'); // Tạm thời ẩn tất cả backslash

      // Khôi phục các escape chuẩn
      r = r.replace(/__BACKSLASH__(["\\\/bfnrt])/g, '\\$1');
      r = r.replace(/__BACKSLASH__u([0-9a-fA-F]{4})/g, '\\u$1');

      // Những gì còn lại là backslash đơn lẻ gây lỗi -> biến thành \\
      r = r.replace(/__BACKSLASH__/g, '\\\\');

      // B. Sửa lỗi ký tự điều khiển (Newline, Tab...) bên trong chuỗi
      r = r.replace(/[\u0000-\u001F]/g, (match) => {
        const charCode = match.charCodeAt(0);
        if (charCode === 10) return "\\n";
        if (charCode === 13) return "\\r";
        if (charCode === 9) return "\\t";
        return "";
      });

      return r;
    };

    // 3. Thử Parse đa tầng
    try {
      return JSON.parse(cleaned);
    } catch (e1) {
      try {
        const repaired = ultraRepair(cleaned);
        return JSON.parse(repaired);
      } catch (e2) {
        console.error("JSON Parse Failed completely.", { original: text, repaired: ultraRepair(cleaned) });
        throw new Error(`AI trả về định dạng không chuẩn (${e1 instanceof Error ? e1.message : 'JSON Error'}). Thầy/Cô vui lòng bấm 'Tạo lại' nhé.`);
      }
    }
  }

  private retryAttempt: number = 0;

  private async handleError(error: any, retryFn: () => Promise<any>): Promise<any> {
    const msg = error.message || "";
    console.warn("AI Encountered Error:", msg);

    // Xử lý lỗi 404 hoặc Model Not Found
    if (msg.includes("404") || msg.includes("not found")) {
      if (this.currentVersion === 'v1') {
        this.setStatus(`Dò tìm kênh dự phòng cho ${this.currentModelName}...`);
        this.setupModel(this.currentModelName, 'v1beta');
        return retryFn();
      }

      const nextIdx = MODELS.indexOf(this.currentModelName) + 1;
      if (nextIdx < MODELS.length) {
        this.setStatus(`Chuyển sang model ${MODELS[nextIdx]}...`);
        this.setupModel(MODELS[nextIdx], 'v1beta');
        this.retryAttempt = 0; // Reset retry attempt when changing model
        return retryFn();
      }
    }

    // Xử lý lỗi 429 (Giới hạn tốc độ/Quota) - Tự động thử lại
    if (msg.includes("429") || msg.includes("quota") || msg.includes("limit reached")) {
      if (this.retryAttempt < 2) {
        this.retryAttempt++;
        const waitMs = this.retryAttempt === 1 ? 5000 : 15000;
        this.setStatus(`Google báo bận, đang đợi ${waitMs / 1000} giây để thử lại...`);
        await new Promise(r => setTimeout(r, waitMs));
        return retryFn();
      } else {
        // Đổi model ngay nếu thử lại 2 lần không được
        this.retryAttempt = 0;
        const nextIdx = MODELS.indexOf(this.currentModelName) + 1;
        if (nextIdx < MODELS.length) {
          this.setStatus(`Đang đổi sang đường truyền dự phòng ${MODELS[nextIdx]}...`);
          this.setupModel(MODELS[nextIdx], 'v1beta');
          return retryFn();
        } else {
          this.setStatus("Tạm thời hết lượt.");
          throw new Error("Lượt dùng miễn phí của Google hiện đã hết trong lúc này. Thầy Cô vui lòng đợi khoảng 1 phút rồi bấm nút lại nhé. (Mách nhỏ: Thầy Cô có thể vào Trung tâm Bảo mật để nhập API Key cá nhân để dùng thoải mái hơn ạ!)");
        }
      }
    }

    this.retryAttempt = 0; // Reset nếu là lỗi khác
    throw error;
  }
}

export const geminiService = new GeminiService();
export const generateWorksheetContentDetailed = (topic: string, subject: string, config: any, fileParts?: FilePart[]) =>
  geminiService.generateWorksheetContentDetailed(topic, subject, config, fileParts);
