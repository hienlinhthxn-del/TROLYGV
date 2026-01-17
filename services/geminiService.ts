
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } from "@google/generative-ai";

const MODEL_NAME = 'gemini-1.5-flash';
const IMAGE_MODEL = 'gemini-1.5-flash'; // Note: Gemini 1.5 Flash does not typically generate images. This might need update to Imagen if available.
const TTS_MODEL = 'gemini-1.5-flash';

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
    // Attempt to get API Key from process.env (Vite define) or import.meta.env
    const apiKey = process.env.API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;

    if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY' || apiKey.trim() === '') {
      console.error("CRITICAL ERROR: API Key is missing or invalid.");
    }
    this.genAI = new GoogleGenerativeAI(apiKey || '');
    this.model = this.genAI.getGenerativeModel({ model: MODEL_NAME });
  }

  public async initChat(systemInstruction: string) {
    this.model = this.genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: systemInstruction
    });
    this.chat = this.model.startChat({
      generationConfig: {
        temperature: 0.7,
      },
    });
  }

  public async* sendMessageStream(message: string, fileParts?: FilePart[]) {
    if (!this.chat) {
      throw new Error("Chat not initialized");
    }

    try {
      const parts: any[] = [];
      if (fileParts && fileParts.length > 0) {
        fileParts.forEach(part => parts.push(part));
      }
      parts.push({ text: message });

      const result = await this.chat.sendMessageStream(parts);

      for await (const chunk of result.stream) {
        yield {
          text: chunk.text(),
          grounding: (chunk as any).candidates?.[0]?.groundingMetadata // Accessing raw candidate if needed, though simpler text() is preferred
        };
      }
    } catch (error) {
      console.error("Gemini API Error:", error);
      throw error;
    }
  }

  public async generateExamQuestionsStructured(prompt: string, fileParts?: FilePart[]) {
    try {
      const model = this.genAI.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                type: { type: SchemaType.STRING, description: "Phải là 'Trắc nghiệm' hoặc 'Tự luận'" },
                level: { type: SchemaType.STRING, description: "Nhận biết, Thông hiểu, Vận dụng, hoặc Vận dụng cao" },
                strand: { type: SchemaType.STRING, description: "Mạch kiến thức" },
                content: { type: SchemaType.STRING, description: "Nội dung câu hỏi văn bản" },
                image: {
                  type: SchemaType.STRING,
                  description: "NẾU câu hỏi gốc có hình vẽ, sơ đồ, đồ thị hoặc bảng biểu quan trọng, hãy cung cấp mô tả trực quan chi tiết hoặc mã SVG đơn giản để tái tạo hình ảnh đó. Nếu không có, để trống."
                },
                options: {
                  type: SchemaType.ARRAY,
                  items: { type: SchemaType.STRING },
                  description: "4 phương án A, B, C, D."
                },
                answer: { type: SchemaType.STRING, description: "Đáp án đúng" },
                explanation: { type: SchemaType.STRING, description: "Giải thích chi tiết" }
              },
              required: ["type", "level", "strand", "content", "answer"]
            }
          }
        }
      });

      const parts: any[] = [];
      if (fileParts && fileParts.length > 0) {
        parts.push(...fileParts);
      }
      parts.push({ text: prompt });

      const result = await model.generateContent(parts);
      return JSON.parse(result.response.text());
    } catch (error) {
      console.error("Structured Exam Generation Error:", error);
      throw error;
    }
  }

  public async generateSuggestions(history: string[], persona: string) {
    try {
      const prompt = `Dựa trên lịch sử: ${history.join(' | ')}, hãy đề xuất 3 hành động tiếp theo cho giáo viên. Trả về JSON: { "suggestions": string[] }`;

      const model = this.genAI.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              suggestions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
            }
          }
        }
      });

      const result = await model.generateContent(prompt);
      const data = JSON.parse(result.response.text());
      return data.suggestions as string[];
    } catch (error) {
      console.error("Suggestions Generation Error:", error);
      return [];
    }
  }

  public async generateImage(prompt: string) {
    // Placeholder: Gemini 1.5 Flash doesn't support image generation directly in this way usually.
    // If the user intends to use Imagen, specific model setup is needed.
    // We will try to send the request but likely it will be text.
    // However, for code compatibility, we return null if no image data found.
    try {
      const model = this.genAI.getGenerativeModel({ model: IMAGE_MODEL });
      const result = await model.generateContent(prompt);
      // Check for image data in parts (unlikely for Flash)
      return null;
    } catch (e) {
      return null;
    }
  }

  public async generateSpeech(text: string, voiceName: 'Kore' | 'Puck' = 'Kore') {
    // Placeholder: Gemini API currently doesn't have a direct TS SDK method for 'generateSpeech' in this structure 
    // identical to the python one or the previous code which looked proprietary.
    // We will perform a standard text generation request or return null to avoid breaking.
    return null;
  }
}

export const geminiService = new GeminiService();
