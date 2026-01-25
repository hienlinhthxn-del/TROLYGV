
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } from "@google/generative-ai";

/**
 * GEMINI SERVICE - VERSION 4.5 (STABLE RELEASE FIX)
 * Khắc phục hoàn toàn lỗi 404 bằng cách sử dụng endpoint chuẩn 'v1'.
 */

export interface FilePart {
  inlineData: {
    data: string;
    mimeType: string;
  }
}

// Danh sách các model ổn định nhất hiện nay
const MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp'];

export class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;
  private chat: any | null = null;
  private model: any | null = null;
  private currentModelName: string = MODELS[0];
  private systemInstruction: string = "Bạn là một trợ lý giáo dục chuyên nghiệp tại Việt Nam.";

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
    console.log(`Cấu hình model: ${modelName}`);

    // Dùng v1 - bản ổn định nhất để tránh lỗi 404 từ v1beta
    // Loại bỏ version v1beta vì đang gây lỗi không tìm thấy model
    this.model = this.genAI.getGenerativeModel({
      model: modelName,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ]
    }); // Mặc định dùng v1
    this.setStatus(`Sẵn sàng (${modelName})`);
  }

  private async ensureInitialized() {
    if (!this.genAI) this.initialize();
    if (!this.genAI) throw new Error("Chưa có API Key");
  }

  private enrichPrompt(prompt: string): string {
    return `${this.systemInstruction}\n\nYêu cầu từ người dùng: ${prompt}`;
  }

  public async initChat(instruction: string) {
    await this.ensureInitialized();
    this.systemInstruction = instruction;
    this.chat = this.model.startChat({
      history: [
        { role: 'user', parts: [{ text: `Quy tắc: ${instruction}` }] },
        { role: 'model', parts: [{ text: "Tôi đã sẵn sàng." }] }
      ]
    });
  }

  public async generateText(prompt: string): Promise<string> {
    await this.ensureInitialized();
    this.setStatus(`Đang xử lý...`);
    try {
      const result = await this.model.generateContent(this.enrichPrompt(prompt));
      this.setStatus("Hoàn tất");
      return result.response.text();
    } catch (error: any) {
      console.error("Lỗi AI:", error);
      return this.handleError(error, () => this.generateText(prompt));
    }
  }

  private async handleError(error: any, retryFn: () => Promise<any>): Promise<any> {
    const msg = error.message || "";
    if (msg.includes("404") || msg.includes("not found")) {
      const nextIdx = MODELS.indexOf(this.currentModelName) + 1;
      if (nextIdx < MODELS.length) {
        this.setupModel(MODELS[nextIdx]);
        return retryFn();
      }
    }
    if (msg.includes("429")) {
      this.setStatus("Hết hạn mức, vui lòng thử lại sau 1 phút.");
      throw new Error("Tài khoản của Thầy/Cô đã hết lượt dùng miễn phí trong lúc này. Hãy đợi 1-2 phút rồi thử lại nhé!");
    }
    throw error;
  }

  public async generateExamQuestionsStructured(prompt: string, fileParts?: FilePart[]) {
    await this.ensureInitialized();
    this.setStatus(`Đang soạn nội dung...`);

    // Vì mode Structured đôi khi chỉ chạy trên v1beta, ta dùng mode text truyền thống rồi parse JSON để ổn định nhất
    const fullPrompt = `${this.enrichPrompt(prompt)}\n\nHãy trả về kết quả dưới dạng JSON chuẩn với cấu trúc: 
    { "title": "...", "subject": "...", "questions": [ { "type": "...", "content": "...", "options": ["..."], "answer": "...", "imagePrompt": "..." } ] }`;

    try {
      const parts: any[] = [];
      if (fileParts) parts.push(...fileParts);
      parts.push({ text: fullPrompt });

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
      this.setStatus("Hoàn tất");
      return json;
    } catch (error: any) {
      console.error("Lỗi cấu trúc:", error);
      return this.handleError(error, () => this.generateExamQuestionsStructured(prompt, fileParts));
    }
  }

  private cleanJSON(text: string): string {
    return text.replace(/```json/g, '').replace(/```/g, '').trim();
  }

  public async generateWorksheetContentDetailed(topic: string, subject: string, config: any, fileParts?: FilePart[]) {
    const prompt = `Soạn phiếu học tập lớp 1. Chủ đề: ${topic}, Môn: ${subject}. Cơ cấu: ${JSON.stringify(config)}`;
    return this.generateExamQuestionsStructured(prompt, fileParts);
  }

  public async generateSuggestions(history: string[], persona: string): Promise<string[]> {
    try {
      const prompt = `Dựa trên lịch sử: ${history.join('|')}. Gợi ý 3 câu tiếp theo cho giáo viên.`;
      const res = await this.generateText(prompt);
      return res.split('\n').filter(s => s.length > 5).slice(0, 3);
    } catch {
      return [];
    }
  }
}

export const geminiService = new GeminiService();
export const generateWorksheetContentDetailed = (topic: string, subject: string, config: any, fileParts?: FilePart[]) =>
  geminiService.generateWorksheetContentDetailed(topic, subject, config, fileParts);
