
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } from "@google/generative-ai";

/**
 * GEMINI SERVICE - VERSION 3.0 (STABLE)
 * Sử dụng API v1beta để đảm bảo tính năng Structured Output và Grounding hoạt động tốt nhất.
 */

const PRIMARY_MODEL = 'gemini-1.5-flash';
const FALLBACK_MODEL = 'gemini-1.5-flash-8b';

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

    // 3. Kiểm tra window object (Dự phòng)
    if (!key) {
      key = (window as any).VITE_GEMINI_API_KEY || (window as any).GEMINI_API_KEY;
    }

    if (key && key !== 'undefined' && key !== 'PLACEHOLDER_API_KEY') {
      return key.trim();
    }
    return '';
  }

  private initialize() {
    try {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        console.error("[GeminiService] CRITICAL: API Key not found!");
        return;
      }

      this.genAI = new GoogleGenerativeAI(apiKey);
      console.log("[GeminiService] Initialized with Key starting with:", apiKey.substring(0, 5));
      this.setupModel();
    } catch (error) {
      console.error("[GeminiService] Error during initialization:", error);
    }
  }

  private setupModel(systemInstruction?: string) {
    if (!this.genAI) return;

    if (systemInstruction) {
      this.currentSystemInstruction = systemInstruction;
    }

    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ];

    try {
      // Sử dụng API v1beta cho tính ổn định cao nhất với các model mới
      this.model = this.genAI.getGenerativeModel({
        model: PRIMARY_MODEL,
        safetySettings,
        systemInstruction: this.currentSystemInstruction,
      }, { apiVersion: 'v1beta' });

      console.log(`[GeminiService] Model ${PRIMARY_MODEL} configured on v1beta.`);
    } catch (error) {
      console.error("[GeminiService] Setup Model Error:", error);
    }
  }

  private async ensureInitialized() {
    if (!this.genAI || !this.model) {
      this.initialize();
    }

    if (!this.getApiKey()) {
      throw new Error("Chưa tìm thấy API Key. Thầy Cô vui lòng kiểm tra tệp .env.local và khởi động lại ứng dụng.");
    }

    if (!this.model) {
      throw new Error("Không thể khởi tạo mô hình AI. Thầy Cô vui lòng kiểm tra kết nối mạng.");
    }
  }

  public async initChat(systemInstruction: string) {
    await this.ensureInitialized();
    this.setupModel(systemInstruction);
    this.chat = this.model.startChat({
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
      },
    });
  }

  public async generateText(prompt: string) {
    await this.ensureInitialized();
    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error: any) {
      console.error("GenerateText Error:", error);
      if (error.message?.includes("404") || error.message?.includes("500") || error.message?.includes("fetch")) {
        console.warn("Attempting fallback to 1.5-flash-8b...");
        const altModel = this.genAI!.getGenerativeModel({ model: FALLBACK_MODEL }, { apiVersion: 'v1beta' });
        const result = await altModel.generateContent(prompt);
        return (await result.response).text();
      }
      throw error;
    }
  }

  public async* sendMessageStream(message: string, fileParts?: FilePart[]) {
    await this.ensureInitialized();
    if (!this.chat) {
      await this.initChat(this.currentSystemInstruction);
    }

    try {
      const parts: any[] = [];
      if (fileParts && fileParts.length > 0) {
        fileParts.forEach(part => {
          if (part.inlineData?.data && part.inlineData?.mimeType) {
            parts.push(part);
          }
        });
      }
      parts.push({ text: message });

      const result = await this.chat.sendMessageStream(parts);

      for await (const chunk of result.stream) {
        try {
          const chunkText = chunk.text();
          yield {
            text: chunkText,
            grounding: (chunk as any).candidates?.[0]?.groundingMetadata
          };
        } catch (e) {
          console.warn("[GeminiService] Chunk processing error:", e);
        }
      }
    } catch (error: any) {
      console.error("Stream Error:", error);
      this.chat = null; // Reset chat if broken

      const readableError = error.message || "";
      if (readableError.includes("429")) throw new Error("Yêu cầu quá nhanh. Thầy Cô vui lòng đợi 1 phút.");
      if (readableError.includes("API_KEY_INVALID")) throw new Error("API Key không hợp lệ. Vui lòng kiểm tra lại tệp .env.local.");
      if (readableError.includes("SAFETY")) throw new Error("Nội dung bị chặn bởi bộ lọc an toàn. Thầy Cô thử diễn đạt lại nhé.");

      throw new Error(`AI không phản hồi: ${error.message || "Lỗi kết nối"}`);
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
      }, { apiVersion: 'v1beta' });

      const parts: any[] = [];
      if (fileParts) parts.push(...fileParts);
      parts.push({ text: prompt });

      const result = await structuredModel.generateContent(parts);
      const response = await result.response;
      return JSON.parse(this.cleanJSON(response.text()));
    } catch (error: any) {
      console.error("Structured Gen Error:", error);
      throw new Error(`Lỗi cấu trúc đề thi: ${error.message}`);
    }
  }

  public async generateWorksheetContent(topic: string, subject: string, questionCount: number, format: string = 'hon-hop') {
    await this.ensureInitialized();
    const prompt = `Tạo phiếu học tập cho học sinh tiểu học (Lớp 1). Môn: ${subject}. Chủ đề: ${topic}. Số lượng: ${questionCount} câu. Dạng: ${format}. Định dạng trả về: JSON.`;

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
      }, { apiVersion: 'v1beta' });

      const result = await schemaModel.generateContent(prompt);
      const response = await result.response;
      return JSON.parse(this.cleanJSON(response.text()));
    } catch (e: any) {
      console.error("Worksheet JSON error:", e);
      throw new Error(`Lỗi tạo phiếu học tập: ${e.message}`);
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

  public async generateSuggestions(history: string[], persona: string) {
    try {
      await this.ensureInitialized();
      const prompt = `Lịch sử chat: ${history.join(' | ')}. Bạn là ${persona}. Hãy gợi ý 3 câu hỏi/hành động tiếp theo ngắn gọn dưới dạng JSON: { "suggestions": ["...", "...", "..."] }`;
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const data = JSON.parse(this.cleanJSON(response.text()));
      return data.suggestions || [];
    } catch (e) {
      console.warn("Could not generate suggestions:", e);
      return [];
    }
  }

  public async generateImage(prompt: string) {
    const randomSeed = Math.floor(Math.random() * 1000000);
    const cleanPrompt = encodeURIComponent(prompt.replace(/[^\w\s]/gi, ' ').trim().slice(0, 500));
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
