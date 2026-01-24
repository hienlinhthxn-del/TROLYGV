
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } from "@google/generative-ai";

// Dựa trên kết quả ListModels từ tài khoản của bạn, chúng ta sẽ sử dụng các model khả dụng nhất.
const PRIMARY_MODEL = 'gemini-2.0-flash';
const FALLBACK_MODEL = 'gemini-1.5-flash-latest';

export interface FilePart {
  inlineData: {
    data: string;
    mimeType: string;
  }
}

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private chat: any | null = null;
  private model: any;

  constructor() {
    const key = this.getApiKey();
    console.log("[GeminiService] API Key check:", key ? "Key found (starting with " + key.substring(0, 5) + ")" : "Key NOT found");
    this.refreshConfig();
  }

  private getApiKey(): string {
    // 1. Ưu tiên lấy từ import.meta.env (Cách chuẩn của Vite)
    if ((import.meta as any).env?.VITE_GEMINI_API_KEY) {
      return (import.meta as any).env.VITE_GEMINI_API_KEY;
    }

    // 2. Kiểm tra các biến process.env (Dành cho môi trường Node hoặc nếu Vite inject vào)
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

      this.genAI = new GoogleGenerativeAI(apiKey);

      const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ];

      const modelName = PRIMARY_MODEL;
      this.model = this.genAI.getGenerativeModel({
        model: modelName,
        safetySettings,
        systemInstruction
      }, { apiVersion: 'v1' });

      console.log(`[GeminiService] Configured with ${modelName}`);
    } catch (e) {
      console.error("[GeminiService] Settings error:", e);
    }
  }

  public checkApiKey() {
    if (!this.getApiKey()) {
      throw new Error("Chưa cấu hình API Key. Thầy Cô vui lòng kiểm tra tệp .env.local và đảm bảo VITE_GEMINI_API_KEY đã được thiết lập.");
    }
  }

  public async initChat(systemInstruction: string) {
    this.checkApiKey();
    this.refreshConfig(systemInstruction);
    this.chat = this.model.startChat({
      generationConfig: { temperature: 0.7 },
    });
  }

  public async generateText(prompt: string) {
    this.checkApiKey();
    if (!this.model) this.refreshConfig();
    try {
      const result = await this.model.generateContent(prompt);
      return result.response.text();
    } catch (error: any) {
      console.error("Text Gen Error:", error);
      if (error.message?.includes("404")) throw new Error("Mô hình AI không khả dụng (404). Vui lòng kiểm tra lại Key.");
      throw error;
    }
  }

  public async* sendMessageStream(message: string, fileParts?: FilePart[]) {
    this.checkApiKey();
    if (!this.chat) {
      await this.initChat("Bạn là một trợ lý giáo dục chuyên nghiệp.");
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
      throw new Error(`Lỗi kết nối AI: ${error.message}`);
    }
  }

  public async generateExamQuestionsStructured(prompt: string, fileParts?: FilePart[]) {
    this.checkApiKey();
    try {
      const structuredModel = this.genAI.getGenerativeModel({
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
    this.checkApiKey();
    const prompt = `Tạo phiếu học tập: ${subject}, ${topic}, ${questionCount} câu, ${format}. Trả về JSON.`;

    try {
      const model = this.genAI.getGenerativeModel({
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
      const prompt = `Lịch sử: ${history.join(' | ')}. Suggest 3 actions in JSON { "suggestions": [] }`;
      const result = await this.model.generateContent(prompt);
      const data = JSON.parse(this.cleanJSON(result.response.text()));
      return data.suggestions || [];
    } catch (e) {
      return [];
    }
  }

  public async generateImage(prompt: string) {
    const cleanPrompt = encodeURIComponent(prompt.replace(/[^\w\s]/gi, '').slice(0, 500));
    return `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=1024&nologo=true&seed=${Math.random()}`;
  }

  public async generateSpeech(text: string) {
    return `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.slice(0, 200))}&tl=vi&client=tw-ob`;
  }
}

export const geminiService = new GeminiService();
export const generateWorksheetContent = (topic: string, subject: string, questionCount: number, format?: string) =>
  geminiService.generateWorksheetContent(topic, subject, questionCount, format);
