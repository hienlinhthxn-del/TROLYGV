
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } from "@google/generative-ai";

// Sử dụng gemini-1.5-flash làm mặc định vì độ ổn định cao và hỗ trợ hầu hết các API Key.
const PRIMARY_MODEL = 'gemini-1.5-flash';
const SECONDARY_MODEL = 'gemini-2.0-flash-exp';

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
  private currentSystemInstruction: string = "";

  constructor() {
    this.initService();
  }

  private initService() {
    try {
      const apiKey = this.getApiKey();
      if (apiKey) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        console.log("[GeminiService] Initialized with Key:", apiKey.substring(0, 5) + "...");
        this.refreshConfig();
      } else {
        console.warn("[GeminiService] API Key NOT found. Service is in idle state.");
      }
    } catch (e) {
      console.error("[GeminiService] Initialization error:", e);
    }
  }

  private getApiKey(): string {
    // 1. Ưu tiên lấy từ import.meta.env (Cách chuẩn của Vite)
    const viteKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
    if (viteKey && viteKey !== 'undefined' && viteKey !== 'PLACEHOLDER_API_KEY') {
      return viteKey;
    }

    // 2. Dự phòng các nguồn khác
    const pEnv = (typeof process !== 'undefined') ? process.env : {};
    const processEnvKey = pEnv.VITE_GEMINI_API_KEY || pEnv.GEMINI_API_KEY || pEnv.API_KEY || '';

    if (processEnvKey && processEnvKey !== 'undefined' && processEnvKey !== 'PLACEHOLDER_API_KEY') {
      return processEnvKey;
    }

    return '';
  }

  private refreshConfig(systemInstruction?: string) {
    try {
      const apiKey = this.getApiKey();
      if (!apiKey) return;

      if (!this.genAI) {
        this.genAI = new GoogleGenerativeAI(apiKey);
      }

      this.currentSystemInstruction = systemInstruction || this.currentSystemInstruction || "Bạn là một trợ lý giáo dục chuyên nghiệp.";

      const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ];

      this.model = this.genAI.getGenerativeModel({
        model: PRIMARY_MODEL,
        safetySettings,
        systemInstruction: this.currentSystemInstruction
      }, { apiVersion: 'v1' });

      console.log(`[GeminiService] Model configured: ${PRIMARY_MODEL}`);
    } catch (e) {
      console.error("[GeminiService] Config error:", e);
    }
  }

  private ensureService() {
    if (!this.genAI || !this.model) {
      this.initService();
    }
    if (!this.getApiKey()) {
      throw new Error("Chưa cấu hình API Key. Thầy Cô vui lòng kiểm tra tệp .env.local và đảm bảo VITE_GEMINI_API_KEY đã được thiết lập.");
    }
  }

  public async initChat(systemInstruction: string) {
    this.ensureService();
    this.refreshConfig(systemInstruction);
    this.chat = this.model.startChat({
      generationConfig: { temperature: 0.7 },
    });
  }

  public async generateText(prompt: string) {
    this.ensureService();
    try {
      const result = await this.model.generateContent(prompt);
      return result.response.text();
    } catch (error: any) {
      console.error("Text Gen Error:", error);
      // Thử dùng model dự phòng nếu lỗi 404 hoặc 429
      if (error.message?.includes("404") || error.message?.includes("500")) {
        console.log("Switching to secondary model...");
        const altModel = this.genAI!.getGenerativeModel({ model: SECONDARY_MODEL });
        const result = await altModel.generateContent(prompt);
        return result.response.text();
      }
      throw error;
    }
  }

  public async* sendMessageStream(message: string, fileParts?: FilePart[]) {
    this.ensureService();
    if (!this.chat) {
      await this.initChat(this.currentSystemInstruction);
    }

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
      // Reset chat if error occurs to avoid corrupted state
      this.chat = null;
      throw new Error(`Lỗi kết nối AI: ${error.message}`);
    }
  }

  public async generateExamQuestionsStructured(prompt: string, fileParts?: FilePart[]) {
    this.ensureService();
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
      }, { apiVersion: 'v1' });

      const parts: any[] = [];
      if (fileParts) parts.push(...fileParts);
      parts.push({ text: prompt });

      const result = await structuredModel.generateContent(parts);
      return JSON.parse(this.cleanJSON(result.response.text()));
    } catch (error: any) {
      console.error("Structured Gen Error:", error);
      throw new Error(`AI không thể tạo cấu trúc: ${error.message}`);
    }
  }

  private cleanJSON(text: string): string {
    let cleaned = text.trim();
    if (cleaned.includes('```json')) {
      cleaned = cleaned.split('```json')[1].split('```')[0].trim();
    } else if (cleaned.includes('```')) {
      cleaned = cleaned.split('```')[1].split('```')[0].trim();
    }
    return cleaned;
  }

  public async generateWorksheetContent(topic: string, subject: string, questionCount: number, format: string = 'hon-hop') {
    this.ensureService();
    const prompt = `Tạo phiếu học tập cho học sinh tiểu học: Môn ${subject}, Chủ đề "${topic}", ${questionCount} câu, Dạng bài ${format}. Trả về JSON theo đúng cấu trúc yêu cầu.`;

    try {
      const model = this.genAI!.getGenerativeModel({
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
                  }
                }
              }
            }
          }
        }
      }, { apiVersion: 'v1' });

      const result = await model.generateContent(prompt);
      return JSON.parse(this.cleanJSON(result.response.text()));
    } catch (e: any) {
      console.error("Worksheet Error:", e);
      throw new Error(`Lỗi tạo phiếu: ${e.message}`);
    }
  }

  public async generateSuggestions(history: string[], persona: string) {
    try {
      this.ensureService();
      const prompt = `Dựa trên lịch sử: ${history.join(' | ')}. Hãy gợi ý 3 hành động tiếp theo cho giáo viên (${persona}) dưới dạng JSON { "suggestions": [] }`;
      const result = await this.model.generateContent(prompt);
      const data = JSON.parse(this.cleanJSON(result.response.text()));
      return data.suggestions || [];
    } catch (e) {
      return [];
    }
  }

  public async generateImage(prompt: string) {
    // Sử dụng Pollinations AI (Miễn phí và không cần Key)
    const randomSeed = Math.floor(Math.random() * 1000000);
    const cleanPrompt = encodeURIComponent(prompt.replace(/[^\w\s]/gi, '').slice(0, 500));
    return `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=1024&nologo=true&seed=${randomSeed}`;
  }

  public async generateSpeech(text: string, voice?: string) {
    // Google TTS (Dùng qua proxy đơn giản)
    return `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.slice(0, 200))}&tl=vi&client=tw-ob`;
  }
}

export const geminiService = new GeminiService();
export const generateWorksheetContent = (topic: string, subject: string, questionCount: number, format?: string) =>
  geminiService.generateWorksheetContent(topic, subject, questionCount, format);
