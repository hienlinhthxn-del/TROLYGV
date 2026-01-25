
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } from "@google/generative-ai";

export interface FilePart {
  inlineData: {
    data: string;
    mimeType: string;
  }
}

// Danh sách các model chính và dự phòng
const MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash-8b'];

export class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;
  private chat: any | null = null;
  private model: any | null = null;
  private currentModelName: string = MODELS[0];
  private currentInstruction: string = "Bạn là một trợ lý giáo dục chuyên nghiệp tại Việt Nam.";

  constructor() {
    this.initialize();
  }

  private setStatus(status: string) {
    if (typeof window !== 'undefined') (window as any).ai_status = status;
  }

  private getApiKey(): string {
    return localStorage.getItem('manually_entered_api_key') ||
      (import.meta as any).env?.VITE_GEMINI_API_KEY ||
      (window as any).VITE_GEMINI_API_KEY ||
      (window as any).process?.env?.VITE_GEMINI_API_KEY || '';
  }

  private initialize() {
    const key = this.getApiKey();
    if (key) {
      this.genAI = new GoogleGenerativeAI(key);
      this.setupModel(MODELS[0]);
    } else {
      this.setStatus("LỖI: Thiếu API Key");
    }
  }

  private setupModel(modelName: string) {
    if (!this.genAI) return;
    this.currentModelName = modelName;
    // QUAN TRỌNG: Phải reset chat về null để khi đổi model, phiên chat mới được tạo đúng model đó
    this.chat = null;

    this.model = this.genAI.getGenerativeModel({
      model: modelName,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ]
    }, { apiVersion: 'v1' });
    this.setStatus(`AI Sẵn sàng (${modelName})`);
  }

  private async ensureInitialized() {
    if (!this.genAI) this.initialize();
    if (!this.genAI) throw new Error("Chưa có API Key. Thầy/Cô hãy kiểm tra lại cấu hình nhé!");
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
      return this.handleError(error, () => this.generateText(prompt));
    }
  }

  // --- TẠO ĐỀ THI / PHIẾU HỌC TẬP (JSON) ---

  public async generateExamQuestionsStructured(prompt: string, fileParts?: FilePart[]) {
    await this.ensureInitialized();
    this.setStatus("Đang soạn nội dung...");

    const fullPrompt = `${this.currentInstruction}\n\nYêu cầu: ${prompt}\n\nHãy trả về JSON chuẩn theo cấu trúc sau:
    { "title": "tieu de", "subject": "mon hoc", "readingPassage": "van ban (neu co)", "questions": [ { "type": "Trắc nghiệm/Tự luận", "content": "cau hoi", "options": ["A", "B", "C", "D"], "answer": "dap an", "imagePrompt": "mo ta hinh anh" } ] }`;

    try {
      const parts = [...(fileParts || []), { text: fullPrompt }];
      const result = await this.model.generateContent(parts);
      const text = result.response.text();
      const json = JSON.parse(this.cleanJSON(text));

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
      return this.handleError(error, () => this.generateExamQuestionsStructured(prompt, fileParts));
    }
  }

  public async generateWorksheetContentDetailed(topic: string, subject: string, config: any, fileParts?: FilePart[]) {
    const prompt = `Soạn phiếu học tập đa dạng cho học sinh lớp 1. Chủ đề: ${topic}, Môn: ${subject}. Cơ cấu: Trắc nghiệm (${config.mcq}), Đúng/Sai (${config.tf}), Điền khuyết (${config.fill}), Nối cột (${config.match}), Tự luận (${config.essay}).`;
    return this.generateExamQuestionsStructured(prompt, fileParts);
  }

  // --- HÌNH ẢNH & GỢI Ý ---

  public async generateImage(prompt: string): Promise<string> {
    // Không dùng Gemini để vẽ (vì phiên bản miễn phí thường lỗi 429 khi vẽ nhiều)
    // Tận dụng API bên ngoài để ổn định và nhanh hơn cho GV
    const seed = Math.floor(Math.random() * 9999);
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + " simple cute drawing for kids")}?width=600&height=400&seed=${seed}&nologo=true`;
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

  private cleanJSON(text: string): string {
    return text.replace(/```json/g, '').replace(/```/g, '').trim();
  }

  private async handleError(error: any, retryFn: () => Promise<any>): Promise<any> {
    const msg = error.message || "";
    console.warn("AI Encountered Error:", msg);

    // Xử lý lỗi 404 hoặc Model Not Found
    if (msg.includes("404") || msg.includes("not found")) {
      const nextIdx = MODELS.indexOf(this.currentModelName) + 1;
      if (nextIdx < MODELS.length) {
        this.setStatus(`Chuyển sang ${MODELS[nextIdx]}...`);
        this.setupModel(MODELS[nextIdx]);
        return retryFn();
      }
    }

    // Xử lý lỗi 429 (Rate Limit) - Thử đổi model hoặc đợi 2s rồi thử lại 1 lần
    if (msg.includes("429") || msg.includes("quota")) {
      const nextIdx = MODELS.indexOf(this.currentModelName) + 1;
      if (nextIdx < MODELS.length) {
        this.setStatus("Chuyển model dự phòng...");
        this.setupModel(MODELS[nextIdx]);
        // Đợi 2 giây trước khi thử model mới để tránh bị "dính chùm" quota
        await new Promise(r => setTimeout(r, 2000));
        return retryFn();
      } else {
        this.setStatus("Hết hạn mức toàn bộ model.");
        throw new Error("Tài khoản miễn phí đã chạm giới hạn tốc độ. Thầy Cô vui lòng chờ khoảng 30-60 giây để Google 'thả' quota rồi nhấn lại nhé!");
      }
    }

    throw error;
  }
}

export const geminiService = new GeminiService();
export const generateWorksheetContentDetailed = (topic: string, subject: string, config: any, fileParts?: FilePart[]) =>
  geminiService.generateWorksheetContentDetailed(topic, subject, config, fileParts);
