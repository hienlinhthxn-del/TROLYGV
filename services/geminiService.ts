
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } from "@google/generative-ai";

/**
 * GEMINI SERVICE - VERSION 4.2 (FIXED)
 * Đã sửa lỗi cú pháp và tích hợp Diagnostic Panel chân trang.
 */

const FLASH_MODELS = ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash-001'];
const PRO_MODELS = ['gemini-1.5-pro', 'gemini-1.5-pro-latest', 'gemini-pro'];

export interface FilePart {
  inlineData: {
    data: string;
    mimeType: string;
  }
}

export class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;
  private chat: any | null = null;
  private model: any | null = null;
  private currentModelName: string = FLASH_MODELS[0];
  private currentApiVersion: 'v1' | 'v1beta' = 'v1';
  private currentSystemInstruction: string = "Bạn là một trợ lý giáo dục chuyên nghiệp tại Việt Nam.";

  constructor() {
    this.initialize();
  }

  private setStatus(status: string) {
    if (typeof window !== 'undefined') {
      (window as any).ai_status = status;
    }
  }

  private getApiKey(): string {
    let key = '';
    try {
      // 1. Kiểm tra trong localStorage (Key thủ công)
      key = localStorage.getItem('manually_entered_api_key') || '';

      // 2. Kiểm tra các nguồn khác nếu không có key thủ công
      if (!key) {
        key = (import.meta as any).env?.VITE_GEMINI_API_KEY ||
          (window as any).VITE_GEMINI_API_KEY ||
          (process as any).env?.VITE_GEMINI_API_KEY || '';
      }
    } catch (e) { }
    return (key && key !== 'undefined') ? key.trim() : '';
  }

  private initialize() {
    const apiKey = this.getApiKey();
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.setupModel();
      this.setStatus("Sẵn sàng");
    } else {
      this.setStatus("LỖI: Chưa có API Key");
    }
  }

  private setupModel(name: string = FLASH_MODELS[0], version: 'v1' | 'v1beta' = 'v1') {
    if (!this.genAI) return;
    this.currentModelName = name;
    this.currentApiVersion = version;

    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ];

    this.model = this.genAI.getGenerativeModel({
      model: name,
      safetySettings,
      systemInstruction: this.currentSystemInstruction,
    }, { apiVersion: version });
  }

  private async ensureInitialized() {
    if (!this.getApiKey()) {
      this.setStatus("LỖI: Thầy Cô hãy kiểm tra .env.local");
      throw new Error("Chưa tìm thấy API Key");
    }
    if (!this.genAI || !this.model) this.initialize();
  }

  private async retryWithNextModel(error: any): Promise<boolean> {
    if (!this.genAI) return false;

    const isNotFoundError = error.message?.includes("404") || error.message?.includes("not found") || error.message?.includes("500");
    if (!isNotFoundError) return false;

    this.setStatus(`Đang k.tra Model mới...`);

    const attempts = [
      { name: FLASH_MODELS[0], version: 'v1beta' as const },
      { name: FLASH_MODELS[1], version: 'v1' as const },
      { name: PRO_MODELS[0], version: 'v1' as const },
      { name: 'gemini-pro', version: 'v1' as const },
    ];

    for (const attempt of attempts) {
      try {
        this.setupModel(attempt.name, attempt.version);
        const testResult = await this.model.generateContent("ping");
        if (testResult) {
          this.setStatus(`Đã chuyển sang ${attempt.name}`);
          return true;
        }
      } catch (e) {
        continue;
      }
    }
    this.setStatus("LỖI: Toàn bộ Model thất bại");
    return false;
  }

  public async initChat(systemInstruction: string) {
    await this.ensureInitialized();
    if (systemInstruction) this.currentSystemInstruction = systemInstruction;
    this.setupModel(this.currentModelName, this.currentApiVersion);
    this.chat = this.model.startChat({
      generationConfig: { temperature: 0.7, topP: 0.9, maxOutputTokens: 8192 },
    });
  }

  public async generateText(prompt: string): Promise<string> {
    await this.ensureInitialized();
    this.setStatus("Đang xử lý...");
    try {
      const result = await this.model.generateContent(prompt);
      this.setStatus("Hoàn tất");
      return result.response.text();
    } catch (error: any) {
      if (await this.retryWithNextModel(error)) {
        return this.generateText(prompt);
      }
      this.setStatus(`LỖI: ${error.message.substring(0, 20)}`);
      throw error;
    }
  }

  public async* sendMessageStream(message: string, fileParts?: FilePart[]) {
    await this.ensureInitialized();
    if (!this.chat) await this.initChat(this.currentSystemInstruction);
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
      if (await this.retryWithNextModel(error)) {
        this.chat = null;
        const stream = this.sendMessageStream(message, fileParts);
        for await (const chunk of stream) yield chunk;
        return;
      }
      this.chat = null;
      this.setStatus("LỖI KẾT NỐI");
      throw new Error(`Lỗi: ${error.message}`);
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
              readingPassage: { type: SchemaType.STRING },
              questions: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    type: { type: SchemaType.STRING },
                    level: { type: SchemaType.STRING },
                    content: { type: SchemaType.STRING },
                    answer: { type: SchemaType.STRING },
                    options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                    explanation: { type: SchemaType.STRING }
                  },
                  required: ["type", "content", "answer"]
                }
              }
            }
          }
        }
      }, { apiVersion: this.currentApiVersion });

      const parts: any[] = [];
      if (fileParts) parts.push(...fileParts);
      parts.push({ text: prompt });

      const result = await structuredModel.generateContent(parts);
      this.setStatus("Đã soạn xong");
      return JSON.parse(this.cleanJSON(result.response.text()));
    } catch (error: any) {
      if (await this.retryWithNextModel(error)) {
        return this.generateExamQuestionsStructured(prompt, fileParts);
      }
      this.setStatus("LỖI CẤU TRÚC");
      const backupResult = await this.model.generateContent(prompt + "\nTrả về JSON.");
      return JSON.parse(this.cleanJSON(backupResult.response.text()));
    }
  }

  public async generateWorksheetContent(topic: string, subject: string, questionCount: number) {
    const prompt = `Tạo phiếu học tập: Môn ${subject}, ${topic}, ${questionCount} câu. Trả về JSON.`;
    return this.generateExamQuestionsStructured(prompt);
  }

  private cleanJSON(text: string): string {
    let cleaned = text.trim();
    if (cleaned.includes('```json')) cleaned = cleaned.split('```json')[1].split('```')[0].trim();
    else if (cleaned.includes('```')) cleaned = cleaned.split('```')[1].split('```')[0].trim();
    return cleaned;
  }

  public async generateSuggestions(history: string[], persona: string) {
    try {
      const prompt = `Gợi ý 3 hành động ngắn gọn cho ${persona}. Lịch sử: ${history.join('|')}. Trả về JSON { "suggestions": [] }`;
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
  geminiService.generateWorksheetContent(topic, subject, questionCount);
