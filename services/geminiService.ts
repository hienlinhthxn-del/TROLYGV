
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } from "@google/generative-ai";

// Sử dụng 'latest' để đảm bảo luôn dùng bản cập nhật nhất, tránh lỗi 404 phiên bản cũ
const MODEL_NAME = 'gemini-1.5-flash-latest';

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
    try {
      const apiKey = this.getApiKey();
      this.genAI = new GoogleGenerativeAI(apiKey);
      // Ép hoàn toàn sang v1 cho tất cả các request
      this.model = this.genAI.getGenerativeModel({
        model: MODEL_NAME,
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ]
      }, { apiVersion: 'v1' });
      console.log(`[GeminiService] Initialized with ${MODEL_NAME} (v1)`);
    } catch (e) {
      console.error("[GeminiService] Initialization error:", e);
    }
  }

  private getApiKey(): string {
    // Ưu tiên chuẩn VITE cho môi trường browser
    const env = (import.meta as any).env;
    const key = env?.VITE_GEMINI_API_KEY ||
      env?.GEMINI_API_KEY ||
      process.env.VITE_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY || '';

    if (key.length < 10) {
      console.warn("[GeminiService] API Key có vẻ không hợp lệ hoặc chưa được cấu hình.");
    }
    return key;
  }

  public checkApiKey() {
    if (!this.getApiKey()) {
      throw new Error("Chưa cấu hình API Key. Thầy Cô vui lòng kiểm tra tệp .env.local.");
    }
  }

  public async initChat(systemInstruction: string) {
    this.checkApiKey();
    this.model = this.genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: systemInstruction,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ]
    }, { apiVersion: 'v1' });

    this.chat = this.model.startChat({
      generationConfig: { temperature: 0.7 },
    });
  }

  public async generateText(prompt: string) {
    this.checkApiKey();
    try {
      const result = await this.model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error("Generate Text Error:", error);
      throw error;
    }
  }

  public async* sendMessageStream(message: string, fileParts?: FilePart[]) {
    this.checkApiKey();
    if (!this.chat) {
      await this.initChat("Bạn là một trợ lý giáo dục chuyên nghiệp, luôn sẵn lòng hỗ trợ giáo viên Việt Nam.");
    }

    try {
      const parts: any[] = [];
      // Lọc các fileParts để đảm bảo dữ liệu hợp lệ trước khi gửi
      if (fileParts && fileParts.length > 0) {
        fileParts.forEach(part => {
          if (part.inlineData && part.inlineData.data) {
            parts.push(part);
          }
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
      console.error("Gemini Stream Error:", error);
      // Nếu lỗi 404 lại xảy ra, thử khởi tạo lại chat
      if (error.message?.includes("404")) {
        throw new Error("Lỗi phiên bản AI (404). Vui lòng F5 trang web.");
      }
      throw error;
    }
  }

  public async generateExamQuestionsStructured(prompt: string, fileParts?: FilePart[]) {
    this.checkApiKey();
    try {
      const structuredModel = this.genAI.getGenerativeModel({
        model: MODEL_NAME,
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
      let text = result.response.text();
      text = this.cleanJSON(text);

      const parsed = JSON.parse(text);
      return parsed;
    } catch (error: any) {
      console.error("Structured Exam Error:", error);
      throw new Error(`AI không thể tạo cấu trúc đề: ${error.message}`);
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
    const prompt = `Tạo phiếu học tập môn ${subject}, chủ đề ${topic}, ${questionCount} câu, dạng ${format}. Trả về JSON phù hợp Schema.`;

    try {
      const model = this.genAI.getGenerativeModel({
        model: MODEL_NAME,
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
    } catch (e) {
      console.error("Worksheet Error:", e);
      throw e;
    }
  }

  public async generateSuggestions(history: string[], persona: string) {
    try {
      const prompt = `History: ${history.join(' | ')}. Persona: ${persona}. Suggest 3 next actions in JSON: { "suggestions": string[] }`;
      const result = await this.model.generateContent(prompt);
      const data = JSON.parse(this.cleanJSON(result.response.text()));
      return data.suggestions || [];
    } catch (e) {
      return [];
    }
  }

  public async generateImage(prompt: string) {
    try {
      const cleanPrompt = encodeURIComponent(prompt.replace(/[^\w\s]/gi, '').slice(0, 500));
      return `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=1024&nologo=true&seed=${Math.random()}`;
    } catch (e) {
      return null;
    }
  }

  public async generateSpeech(text: string) {
    try {
      return `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.slice(0, 200))}&tl=vi&client=tw-ob`;
    } catch (e) {
      return null;
    }
  }
}

export const geminiService = new GeminiService();
export const generateWorksheetContent = (topic: string, subject: string, questionCount: number, format?: string) =>
  geminiService.generateWorksheetContent(topic, subject, questionCount, format);
