
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } from "@google/generative-ai";

export interface FilePart {
  inlineData: {
    data: string;
    mimeType: string;
  }
}

// Ưu tiên các model Lite vì có Quota (hạn mức) cao hơn cho tài khoản miễn phí
// Ưu tiên các model ổn định và có Quota cao
const MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp', 'gemini-1.5-flash-8b'];

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
        let text = '';
        try {
          text = chunk.text();
        } catch (e) {
          // Bỏ qua lỗi nếu chunk bị chặn do safety settings để tránh crash luồng
        }
        yield {
          text: text,
          grounding: (chunk as any).candidates?.[0]?.groundingMetadata
        };
      }
    } catch (error: any) {
      if (error.message?.includes("429")) {
        throw new Error("Lượt dùng miễn phí hiện tại đã hết. Thầy Cô vui lòng đợi 1 phút rồi thử lại nhé!");
      }
      if (error.message?.includes("safety") || error.message?.includes("blocked")) {
        throw new Error("Nội dung câu hỏi hoặc câu trả lời bị hệ thống an toàn chặn. Thầy/Cô vui lòng diễn đạt lại câu hỏi nhé!");
      }
      throw error;
    }
  }

  // --- TẠO NỘI DUNG VĂN BẢN ---

  public async generateText(prompt: string, fileParts?: FilePart[]): Promise<string> {
    await this.ensureInitialized();
    try {
      const parts = [...(fileParts || []), { text: `${this.currentInstruction}\n\nYêu cầu: ${prompt}` }];
      const result = await this.model.generateContent(parts);
      return result.response.text();
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
    
    NHIỆM VỤ: Trích xuất TOÀN BỘ câu hỏi từ tài liệu (Ảnh/PDF). Tài liệu này thường chứa khoảng 20 đến 30 câu hỏi.
    HÃY KIÊN NHẪN ĐỌC HẾT TÀI LIỆU VÀ TRÍCH XUẤT KHÔNG BỎ SÓT CÂU NÀO.

    YÊU CẦU XỬ LÝ DẠNG BÀI VIOLYMPIC / TRẠNG NGUYÊN TIẾNG VIỆT (BẮT BUỘC):
    1. Nếu câu hỏi có hình minh họa (hình học, con vật, đồ vật, quy luật dãy hình...):
       - Hãy phân tích nội dung hình ảnh thật kỹ.
       - **QUAN TRỌNG:** Nếu là file ảnh/PDF scan, hãy OCR chính xác nội dung văn bản và công thức.
       - **BẮT BUỘC:** Nếu câu hỏi gốc có hình ảnh, trường "image" trong JSON KHÔNG ĐƯỢC ĐỂ TRỐNG. Hãy điền mô tả chi tiết [HÌNH ẢNH: ...] hoặc mã SVG.
       - **ƯU TIÊN HÀNG ĐẦU:** Mô tả hình ảnh bằng văn bản một cách chi tiết và rõ ràng trong trường "image". Ví dụ: "image": "[HÌNH ẢNH: Một hình vuông bên trong có một hình tròn màu xanh]".
       - **CHỈ KHI THẬT SỰ CẦN THIẾT:** Nếu hình học quá đơn giản (ví dụ: một tam giác), bạn có thể dùng mã SVG. SVG phải trên một dòng và không chứa ký tự đặc biệt có thể làm hỏng JSON.
       - Với dạng bài QUY LUẬT: Hãy mô tả rõ dãy hình. Ví dụ: "Hoàn thành quy luật: [Con quạ] [Con quạ] [Đại bàng] [Con quạ] [Con quạ] [?]"
       - Với dạng bài ĐIỀN SỐ/CHỮ VÀO HÌNH: Hãy chuyển thành câu hỏi văn bản. Ví dụ: "Số thích hợp điền vào hình tròn cuối cùng là bao nhiêu? (Quy luật: Số sau gấp đôi số trước)".
       - Với dạng bài ĐIỀN TỪ (Trạng Nguyên Tiếng Việt): Hãy mô tả rõ ngữ cảnh. Ví dụ: "Điền từ thích hợp vào chỗ trống: 'Học ... đôi với hành'".
    2. Nếu ĐÁP ÁN là hình ảnh: 
       - Bắt buộc điền mô tả hoặc mã SVG vào trường "image" của đối tượng option.
       - Trường "text" của option có thể để là "Hình A", "Hình B" nếu đã có ảnh.
    3. SỐ LƯỢNG: Phải trích xuất đủ 20-30 câu nếu tài liệu có đủ. Không được tự ý tóm tắt hay cắt bớt.
    4. GIẢI THÍCH (explanation): Cần ngắn gọn, chỉ ra quy luật logic của bài toán/câu đố.

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
          "image": "SVG hoặc mô tả" 
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
      }, { apiVersion: 'v1beta' });

      const result = await jsonModel.generateContent(parts);
      const text = result.response.text();
      let json = this.parseJSONSafely(text);

      // Fallback: Nếu AI chỉ trả về mảng câu hỏi (do lỗi format), tự động bọc lại
      if (Array.isArray(json)) {
        json = { questions: json };
      }

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

      const result = await jsonModel.generateContent(prompt);
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
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?nologo=true&seed=${seed}&width=1024&height=1024`;

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
      const seed = Math.floor(Math.random() * 1000000);
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?nologo=true&seed=${seed}&width=1280&height=720`;

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
        console.warn(`Lỗi tạo video lần ${i + 1}:`, error);
        if (i === 2) {
          throw new Error("Dịch vụ tạo ảnh cho video đang gặp sự cố. Thầy Cô vui lòng thử lại sau ít phút.");
        }
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    throw new Error("Không thể tạo video lúc này.");
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

    // Xử lý lỗi 429 (Giới hạn tốc độ/Quota) - Tự động thử lại hoặc đổi Model
    // Bổ sung thêm các lỗi 503, 500, overloaded, busy
    if (
      msg.includes("429") ||
      msg.includes("quota") ||
      msg.includes("limit") ||
      msg.includes("overloaded") ||
      msg.includes("busy") ||
      msg.includes("503") ||
      msg.includes("500")
    ) {
      // Tự động đọc thời gian chờ từ thông báo lỗi của Google
      let waitMs = this.retryAttempt === 0 ? 2000 : 5000; // Giảm thời gian chờ để chuyển model nhanh hơn
      const match = msg.match(/retry in (\d+(\.\d+)?)s/);
      if (match) {
        waitMs = Math.ceil(parseFloat(match[1]) * 1000) + 2000; // Thêm buffer 2s an toàn
      }

      // Nếu Google bảo chờ quá lâu (> 8s), hoặc đã thử lại 1 lần bận liên tiếp
      // thì đổi model luôn cho nhanh
      if (waitMs > 8000 || this.retryAttempt >= 1) {
        this.retryAttempt = 0;
        const currentIdx = MODELS.indexOf(this.currentModelName);
        const nextIdx = (currentIdx + 1) % MODELS.length; // Vòng lặp các model

        // Nếu đã thử qua tất cả các model mà vẫn lỗi (vòng quay trở lại model đầu)
        if (nextIdx === 0 && currentIdx !== -1) {
          throw new Error("AI không thể xử lý được file này, ngay cả khi đã chia nhỏ. Nguyên nhân có thể do:\n1. File PDF chứa định dạng phức tạp hoặc ảnh chất lượng quá cao.\n2. Lỗi tạm thời từ máy chủ của Google.\n\nGiải pháp:\n- Thử lại sau vài phút.\n- Chụp ảnh màn hình (screenshot) các câu hỏi và tải lên dưới dạng file ảnh (PNG/JPG) thay vì PDF.");
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
