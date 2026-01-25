
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } from "@google/generative-ai";

/**
 * GEMINI SERVICE - VERSION 4.3 (PROMPT FALLBACK)
 * Giải quyết lỗi "Unknown name systemInstruction" bằng cách gộp chỉ dẫn vào Prompt nếu v1 không hỗ trợ.
 */

export interface FilePart {
  inlineData: {
    data: string;
    mimeType: string;
  }
}

const MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-flash-latest', 'gemini-pro-latest'];

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
      this.setStatus("Sẵn sàng");
    } else {
      this.setStatus("LỖI: Thiếu API Key");
    }
  }

  private setupModel(modelName: string) {
    if (!this.genAI) return;
    this.currentModelName = modelName;

    // Sử dụng v1beta cho tính năng cao nhất, v1 làm dự phòng
    this.model = this.genAI.getGenerativeModel({
      model: modelName,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      ]
    }, { apiVersion: 'v1beta' });
  }

  private async ensureInitialized() {
    if (!this.genAI) this.initialize();
    if (!this.genAI) throw new Error("Chưa có API Key");
  }

  // Tăng cường Prompt với System Instruction để tránh lỗi API Version
  private enrichPrompt(prompt: string): string {
    return `[System Instruction: ${this.systemInstruction}]\n\nUser Request: ${prompt}`;
  }

  public async initChat(instruction: string) {
    await this.ensureInitialized();
    this.systemInstruction = instruction;
    this.chat = this.model.startChat({
      history: [
        { role: 'user', parts: [{ text: `Quy tắc làm việc của bạn: ${instruction}` }] },
        { role: 'model', parts: [{ text: "Tôi đã hiểu. Tôi sẵn sàng hỗ trợ Thầy Cô." }] }
      ]
    });
  }

  public async generateText(prompt: string): Promise<string> {
    await this.ensureInitialized();
    this.setStatus("Đang phản hồi...");
    try {
      const result = await this.model.generateContent(this.enrichPrompt(prompt));
      this.setStatus("Hoàn tất");
      return result.response.text();
    } catch (error: any) {
      console.error("Text Error:", error);
      if (error.message?.includes("404")) {
        this.setStatus("Thử model dự phòng...");
        const nextIndex = MODELS.indexOf(this.currentModelName) + 1;
        if (nextIndex < MODELS.length) {
          this.setupModel(MODELS[nextIndex]);
          return this.generateText(prompt);
        }
      }
      if (error.message?.includes("leaked")) {
        this.setStatus("LỖI: API Key bị lộ");
        throw new Error("API Key của Thầy Cô đã bị Google chặn do bị lộ (leaked). Vui lòng tạo API Key mới tại Google AI Studio và cập nhật trong phần Bảo mật.");
      }
      this.setStatus("LỖI KẾT NỐI");
      throw error;
    }
  }

  public async* sendMessageStream(message: string, fileParts?: FilePart[]) {
    await this.ensureInitialized();
    if (!this.chat) await this.initChat(this.systemInstruction);
    this.setStatus("Đang phản hồi...");

    try {
      const parts: any[] = [];
      if (fileParts) {
        fileParts.forEach(part => { if (part.inlineData?.data) parts.push(part); });
      }
      parts.push({ text: message });

      const result = await this.chat.sendMessageStream(parts);
      for await (const chunk of result.stream) {
        yield { text: chunk.text(), grounding: (chunk as any).candidates?.[0]?.groundingMetadata };
      }
      this.setStatus("Hoàn tất");
    } catch (error: any) {
      this.chat = null;
      if (error.message?.includes("leaked")) {
        this.setStatus("LỖI: API Key bị lộ");
        throw new Error("API Key đã bị chặn (leaked). Vui lòng dùng Key mới.");
      }
      this.setStatus("LỖI KẾT NỐI");
      throw error;
    }
  }

  public async generateExamQuestionsStructured(prompt: string, fileParts?: FilePart[]) {
    await this.ensureInitialized();
    this.setStatus("Đang soạn đề...");
    try {
      const structuredModel = this.genAI!.getGenerativeModel({
        model: this.currentModelName,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              title: { type: SchemaType.STRING },
              subject: { type: SchemaType.STRING },
              readingPassage: { type: SchemaType.STRING },
              questions: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    type: { type: SchemaType.STRING },
                    level: { type: SchemaType.STRING },
                    content: { type: SchemaType.STRING },
                    question: { type: SchemaType.STRING }, // Alias cho WorksheetCreator
                    answer: { type: SchemaType.STRING },
                    options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                    explanation: { type: SchemaType.STRING },
                    imagePrompt: { type: SchemaType.STRING }
                  },
                  required: ["type", "answer"]
                }
              }
            },
            required: ["questions"]
          }
        }
      }, { apiVersion: 'v1beta' });

      const parts: any[] = [];
      if (fileParts) parts.push(...fileParts);
      parts.push({ text: this.enrichPrompt(prompt) });

      const result = await structuredModel.generateContent(parts);
      this.setStatus("Hoàn tất");
      const json = JSON.parse(this.cleanJSON(result.response.text()));

      // Đảm bảo tính tương thích giữa 'content' và 'question'
      if (json.questions) {
        json.questions = json.questions.map((q: any) => ({
          ...q,
          content: q.content || q.question || '',
          question: q.question || q.content || ''
        }));
      }
      return json;
    } catch (error: any) {
      console.warn("Structured Error, trying non-structured...", error);
      if (error.message?.includes("leaked")) {
        throw new Error("API Key đã bị chặn (leaked). Vui lòng dùng Key mới.");
      }
      const result = await this.model.generateContent(this.enrichPrompt(prompt) + "\nTrả về JSON.");
      return JSON.parse(this.cleanJSON(result.response.text()));
    }
  }

  public async generateWorksheetContent(topic: string, subject: string, questionCount: number, format: string = 'hon-hop') {
    const prompt = `Bạn là trợ lý soạn bài cho giáo viên lớp 1. Hãy tạo phiếu học tập mới:
    - Môn: ${subject}
    - Chủ đề: ${topic}
    - Số lượng: ${questionCount} câu
    - Định dạng: ${format === 'trac-nghiem' ? 'Trắc nghiệm' : format === 'tu-luan' ? 'Tự luận' : 'Hỗn hợp'}
    - YÊU CẦU ĐẶC BIỆT:
      1. Nội dung cực kỳ đơn giản, phù hợp học sinh 6 tuổi.
      2. Với mỗi câu hỏi, hãy cung cấp một đoạn mô tả hình ảnh minh họa ngắn chọn vào trường "imagePrompt" (ví dụ: "con mèo đang ngủ", "5 quả táo đỏ").
      3. Hãy đặt cho phiếu học tập một tiêu đề sáng tạo trong trường "title".
      4. Trả về JSON chuẩn.`;
    const result = await this.generateExamQuestionsStructured(prompt);
    if (!result.title) result.title = `Phiếu học tập ${subject}: ${topic}`;
    if (!result.subject) result.subject = subject;
    return result;
  }

  private cleanJSON(text: string): string {
    let cleaned = text.trim();
    if (cleaned.includes('```json')) cleaned = cleaned.split('```json')[1].split('```')[0].trim();
    else if (cleaned.includes('```')) cleaned = cleaned.split('```')[1].split('```')[0].trim();
    return cleaned;
  }

  public async generateSuggestions(history: string[], persona: string) {
    try {
      const prompt = `Gợi ý 3 hành động tiếp theo cho ${persona}. Lịch sử: ${history.join('|')}. Trả về JSON { "suggestions": [] }`;
      const result = await this.model.generateContent(prompt);
      return JSON.parse(this.cleanJSON(result.response.text())).suggestions || [];
    } catch (e) { return []; }
  }

  public async generateImage(prompt: string) {
    const seed = Math.floor(Math.random() * 1000000);
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${seed}`;
  }

  public async generateSpeech(text: string) {
    return `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.slice(0, 200))}&tl=vi&client=tw-ob`;
  }
}

export const geminiService = new GeminiService();
export const generateWorksheetContent = (topic: string, subject: string, questionCount: number, format?: string) =>
  geminiService.generateWorksheetContent(topic, subject, questionCount, format);
