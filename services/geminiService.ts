
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } from "@google/generative-ai";

// Dựa trên kết quả ListModels, gemini-1.5-flash không có sẵn trong tài khoản này.
// Thay vào đó, tài khoản có quyền truy cập vào các model thế hệ mới hơn.
// Chúng ta sẽ ưu tiên sử dụng gemini-2.0-flash (bản ổn định trên v1).
const MODEL_NAME = 'gemini-2.0-flash';

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
      this.initModel();
    } catch (e) {
      console.error("[GeminiService] Initialization error:", e);
    }
  }

  private getApiKey(): string {
    const env = (import.meta as any).env;
    const key = env?.VITE_GEMINI_API_KEY ||
      env?.GEMINI_API_KEY ||
      process.env.VITE_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY || '';
    return key;
  }

  private initModel(systemInstruction?: string) {
    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ];

    const modelParams: any = { model: MODEL_NAME, safetySettings };
    if (systemInstruction) {
      modelParams.systemInstruction = systemInstruction;
    }

    // Luôn sử dụng v1 cho các model 2.0/2.5
    this.model = this.genAI.getGenerativeModel(modelParams, { apiVersion: 'v1' });
    console.log(`[GeminiService] Model initialized: ${MODEL_NAME}`);
  }

  public checkApiKey() {
    if (!this.getApiKey()) {
      throw new Error("Chưa cấu hình API Key. Thầy Cô vui lòng kiểm tra tệp .env.local.");
    }
  }

  public async initChat(systemInstruction: string) {
    this.checkApiKey();
    this.initModel(systemInstruction);
    this.chat = this.model.startChat({
      generationConfig: { temperature: 0.7 },
    });
  }

  public async generateText(prompt: string) {
    this.checkApiKey();
    try {
      const result = await this.model.generateContent(prompt);
      return result.response.text();
    } catch (error: any) {
      console.error("Generate Text Error:", error);
      // Nếu gemini-2.0-flash chưa khả dụng (hiếm), thử dùng 2.5 flash
      if (error.message?.includes("404")) {
        console.log("Falling back to gemini-2.5-flash...");
        const fallbackModel = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }, { apiVersion: 'v1' });
        const result = await fallbackModel.generateContent(prompt);
        return result.response.text();
      }
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
    } catch (error) {
      console.error("Gemini Stream Error:", error);
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
      return JSON.parse(this.cleanJSON(result.response.text()));
    } catch (error) {
      console.error("Structured Exam Error:", error);
      throw error;
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
    const prompt = `Tạo phiếu học tập môn ${subject}, chủ đề ${topic}, ${questionCount} câu, dạng ${format}. Trả về JSON phù hợp.`;

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
      const prompt = `Lịch sử: ${history.join(' | ')}. Đề xuất 3 hành động tiếp theo dạng JSON { "suggestions": string[] }`;
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
