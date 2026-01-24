
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } from "@google/generative-ai";

/**
 * GEMINI SERVICE - VERSION 3.2 (ULTRA STABLE)
 * Tự động chuyển đổi giữa v1 và v1beta để tránh lỗi 404 Not Found.
 */

const PRIMARY_MODEL = 'gemini-1.5-flash';
const ALT_MODEL = 'gemini-1.5-flash-latest';
const PRO_MODEL = 'gemini-1.5-pro';

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
  private currentVersion: 'v1' | 'v1beta' = 'v1';
  private currentSystemInstruction: string = "Bạn là một trợ lý giáo dục chuyên nghiệp tại Việt Nam.";

  constructor() {
    this.initialize();
  }

  private getApiKey(): string {
    let key = '';
    try {
      key = (import.meta as any).env?.VITE_GEMINI_API_KEY ||
        (window as any).VITE_GEMINI_API_KEY ||
        (process as any).env?.VITE_GEMINI_API_KEY || '';
    } catch (e) { }
    return (key && key !== 'undefined') ? key.trim() : '';
  }

  private initialize() {
    const apiKey = this.getApiKey();
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.setupModel();
    }
  }

  private setupModel(instruction?: string, version: 'v1' | 'v1beta' = 'v1') {
    if (!this.genAI) return;
    if (instruction) this.currentSystemInstruction = instruction;
    this.currentVersion = version;

    const config = {
      model: PRIMARY_MODEL,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
      systemInstruction: this.currentSystemInstruction,
    };

    this.model = this.genAI.getGenerativeModel(config, { apiVersion: version });
    console.log(`[GeminiService] Initialized ${PRIMARY_MODEL} on ${version}`);
  }

  private async ensureInitialized() {
    if (!this.getApiKey()) throw new Error("Chưa tìm thấy API Key. Thầy Cô hãy kiểm tra .env.local");
    if (!this.genAI || !this.model) this.initialize();
  }

  public async initChat(systemInstruction: string) {
    await this.ensureInitialized();
    this.setupModel(systemInstruction, this.currentVersion);
    this.chat = this.model.startChat({
      generationConfig: { temperature: 0.7, topP: 0.9, maxOutputTokens: 8192 },
    });
  }

  public async generateText(prompt: string): Promise<string> {
    await this.ensureInitialized();
    try {
      const result = await this.model.generateContent(prompt);
      return result.response.text();
    } catch (error: any) {
      // Nếu lỗi 404 trên v1, thử chuyển sang v1beta
      if (error.message?.includes("404") && this.currentVersion === 'v1') {
        this.setupModel(this.currentSystemInstruction, 'v1beta');
        return this.generateText(prompt);
      }
      throw error;
    }
  }

  public async* sendMessageStream(message: string, fileParts?: FilePart[]) {
    await this.ensureInitialized();
    if (!this.chat) await this.initChat(this.currentSystemInstruction);

    try {
      const parts: any[] = [];
      if (fileParts) {
        fileParts.forEach(part => {
          if (part.inlineData?.data) parts.push(part);
        });
      }
      parts.push({ text: message });

      const result = await this.chat.sendMessageStream(parts);
      for await (const chunk of result.stream) {
        yield {
          text: chunk.text(),
          grounding: (chunk as any).candidates?.[0]?.groundingMetadata
        };
      }
    } catch (error: any) {
      console.error("Stream Error:", error);
      // Xử lý lỗi 404 bằng cách đổi phiên bản API
      if (error.message?.includes("404") && this.currentVersion === 'v1') {
        this.setupModel(this.currentSystemInstruction, 'v1beta');
        this.chat = null;
        const stream = this.sendMessageStream(message, fileParts);
        for await (const chunk of stream) yield chunk;
        return;
      }
      this.chat = null;
      throw new Error(`AI không phản hồi (${this.currentVersion}). Thầy Cô hãy thử nhấn F5 hoặc kiểm tra API Key.`);
    }
  }

  public async generateExamQuestionsStructured(prompt: string, fileParts?: FilePart[]) {
    await this.ensureInitialized();
    try {
      const structuredModel = this.genAI!.getGenerativeModel({
        model: PRIMARY_MODEL,
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
                    strand: { type: SchemaType.STRING },
                    content: { type: SchemaType.STRING },
                    image: { type: SchemaType.STRING },
                    options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                    answer: { type: SchemaType.STRING },
                    explanation: { type: SchemaType.STRING }
                  },
                  required: ["type", "level", "content", "answer"]
                }
              }
            },
            required: ["questions"]
          }
        }
      }, { apiVersion: this.currentVersion });

      const parts: any[] = [];
      if (fileParts) parts.push(...fileParts);
      parts.push({ text: prompt });

      const result = await structuredModel.generateContent(parts);
      return JSON.parse(this.cleanJSON(result.response.text()));
    } catch (error: any) {
      console.error("Structured Error:", error);
      // Thử dùng model Pro nếu Flash lỗi cấu trúc
      const proModel = this.genAI!.getGenerativeModel({ model: PRO_MODEL }, { apiVersion: 'v1beta' });
      const result = await proModel.generateContent(prompt + "\nTrả về JSON.");
      return JSON.parse(this.cleanJSON(result.response.text()));
    }
  }

  public async generateWorksheetContent(topic: string, subject: string, questionCount: number, format: string = 'hon-hop') {
    await this.ensureInitialized();
    const prompt = `Tạo phiếu học tập cho học sinh tiểu học. Môn: ${subject}, Chủ đề: ${topic}, ${questionCount} câu. Trả về JSON.`;
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
      await this.ensureInitialized();
      const prompt = `Gợi ý 3 hành động tiếp theo cho giáo viên từ: ${history.join(' | ')}. Trả về JSON: { "suggestions": [] }`;
      const result = await this.model.generateContent(prompt);
      const data = JSON.parse(this.cleanJSON(result.response.text()));
      return data.suggestions || [];
    } catch (e) {
      return [];
    }
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
