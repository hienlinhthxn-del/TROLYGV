
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } from "@google/generative-ai";

/**
 * GEMINI SERVICE - VERSION 3.1 (STABLE)
 * Điều chỉnh sang v1 để tránh lỗi 404 trên một số API Key mới.
 */

const PRIMARY_MODEL = 'gemini-1.5-flash';
const FALLBACK_MODEL = 'gemini-1.5-flash-latest';
const LITE_MODEL = 'gemini-1.5-flash-8b';

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
  private currentSystemInstruction: string = "Bạn là một trợ lý giáo dục chuyên nghiệp tại Việt Nam.";

  constructor() {
    this.initialize();
  }

  private getApiKey(): string {
    let key = '';

    // 1. Kiểm tra Vite environment (import.meta.env)
    try {
      const metaEnv = (import.meta as any).env;
      key = metaEnv?.VITE_GEMINI_API_KEY || metaEnv?.GEMINI_API_KEY;
    } catch (e) { }

    // 2. Kiểm tra process.env (Vite define)
    if (!key) {
      try {
        const pEnv = (typeof process !== 'undefined') ? process.env : {};
        key = (pEnv as any).VITE_GEMINI_API_KEY || (pEnv as any).GEMINI_API_KEY;
      } catch (e) { }
    }

    // 3. Kiểm tra window object
    if (!key) {
      key = (window as any).VITE_GEMINI_API_KEY || (window as any).GEMINI_API_KEY;
    }

    return key ? key.trim() : '';
  }

  private initialize() {
    try {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        console.error("[GeminiService] API Key not found");
        return;
      }

      this.genAI = new GoogleGenerativeAI(apiKey);
      this.setupModel();
    } catch (error) {
      console.error("[GeminiService] Init Error:", error);
    }
  }

  private setupModel(systemInstruction?: string) {
    if (!this.genAI) return;
    if (systemInstruction) this.currentSystemInstruction = systemInstruction;

    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ];

    try {
      // Chuyển sang v1 để tương thích rộng hơn
      this.model = this.genAI.getGenerativeModel({
        model: PRIMARY_MODEL,
        safetySettings,
        systemInstruction: this.currentSystemInstruction,
      }, { apiVersion: 'v1' });

      console.log(`[GeminiService] Configured ${PRIMARY_MODEL} on v1`);
    } catch (error) {
      console.error("[GeminiService] Setup Error:", error);
    }
  }

  private async ensureInitialized() {
    if (!this.genAI || !this.model) this.initialize();
    if (!this.getApiKey()) throw new Error("Vui lòng cấu hình VITE_GEMINI_API_KEY trong tệp .env.local");
    if (!this.model) throw new Error("Chưa khởi tạo được Model AI");
  }

  public async initChat(systemInstruction: string) {
    await this.ensureInitialized();
    this.setupModel(systemInstruction);
    this.chat = this.model.startChat({
      generationConfig: { temperature: 0.7, topP: 0.95, topK: 40, maxOutputTokens: 8192 },
    });
  }

  public async generateText(prompt: string) {
    await this.ensureInitialized();
    try {
      const result = await this.model.generateContent(prompt);
      return result.response.text();
    } catch (error: any) {
      console.warn("Retrying with fallback model because of:", error.message);
      try {
        const altModel = this.genAI!.getGenerativeModel({ model: FALLBACK_MODEL }, { apiVersion: 'v1' });
        const result = await altModel.generateContent(prompt);
        return result.response.text();
      } catch (innerError: any) {
        throw new Error(`Lỗi kết nối AI: ${innerError.message}`);
      }
    }
  }

  public async* sendMessageStream(message: string, fileParts?: FilePart[]) {
    await this.ensureInitialized();
    if (!this.chat) await this.initChat(this.currentSystemInstruction);

    try {
      const parts: any[] = [];
      if (fileParts) {
        fileParts.forEach(part => {
          if (part.inlineData?.data && part.inlineData?.mimeType) parts.push(part);
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
      this.chat = null;
      throw new Error(`AI không phản hồi (404/500). Thầy Cô vui lòng thử lại hoặc đổi API Key.`);
    }
  }

  public async generateExamQuestionsStructured(prompt: string, fileParts?: FilePart[]) {
    await this.ensureInitialized();
    try {
      // Structured Output cũng khả dụng trên v1 cho 1.5-flash
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
      }, { apiVersion: 'v1' });

      const parts: any[] = [];
      if (fileParts) parts.push(...fileParts);
      parts.push({ text: prompt });

      const result = await structuredModel.generateContent(parts);
      return JSON.parse(this.cleanJSON(result.response.text()));
    } catch (error: any) {
      console.error("Structured Gen Error:", error.message);
      // Fallback cho model 8b nếu 1.5-flash gốc từ chối
      const liteModel = this.genAI!.getGenerativeModel({ model: LITE_MODEL }, { apiVersion: 'v1' });
      const result = await liteModel.generateContent(prompt + "\nTrả về JSON.");
      return JSON.parse(this.cleanJSON(result.response.text()));
    }
  }

  public async generateWorksheetContent(topic: string, subject: string, questionCount: number, format: string = 'hon-hop') {
    await this.ensureInitialized();
    const prompt = `Tạo phiếu học tập cho học sinh tiểu học (Lớp 1). Môn: ${subject}. Chủ đề: ${topic}. Số lượng: ${questionCount} câu. Dạng: ${format}. Trả về JSON.`;

    try {
      const schemaModel = this.genAI!.getGenerativeModel({
        model: PRIMARY_MODEL,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              title: { type: SchemaType.STRING },
              subject: { type: SchemaType.STRING },
              questions: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    id: { type: SchemaType.STRING },
                    type: { type: SchemaType.STRING },
                    question: { type: SchemaType.STRING },
                    imagePrompt: { type: SchemaType.STRING },
                    options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                    answer: { type: SchemaType.STRING }
                  },
                  required: ["id", "type", "question", "imagePrompt"]
                }
              }
            },
            required: ["title", "subject", "questions"]
          }
        }
      }, { apiVersion: 'v1' });

      const result = await schemaModel.generateContent(prompt);
      return JSON.parse(this.cleanJSON(result.response.text()));
    } catch (e: any) {
      throw new Error(`Lỗi tạo phiếu: ${e.message}`);
    }
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
      const prompt = `Gợi ý 3 câu hỏi tiếp theo cho ${persona} dựa trên: ${history.join(' | ')}. Trả về JSON: { "suggestions": [] }`;
      const result = await this.model.generateContent(prompt);
      const data = JSON.parse(this.cleanJSON(result.response.text()));
      return data.suggestions || [];
    } catch (e) {
      return [];
    }
  }

  public async generateImage(prompt: string) {
    const randomSeed = Math.floor(Math.random() * 1000000);
    const cleanPrompt = encodeURIComponent(prompt.replace(/[^\w\s]/gi, ' ').slice(0, 500));
    return `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=1024&nologo=true&seed=${randomSeed}`;
  }

  public async generateSpeech(text: string, voice?: string) {
    // Proxy Google TTS cho tiếng Việt
    return `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.slice(0, 200))}&tl=vi&client=tw-ob`;
  }
}

export const geminiService = new GeminiService();
export const generateWorksheetContent = (topic: string, subject: string, questionCount: number, format?: string) =>
  geminiService.generateWorksheetContent(topic, subject, questionCount, format);
