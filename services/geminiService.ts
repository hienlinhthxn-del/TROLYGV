
import { GoogleGenAI, GenerateContentResponse, Chat, Modality, Type } from "@google/genai";

const MODEL_NAME = 'gemini-2.0-flash-exp';
const IMAGE_MODEL = 'gemini-2.0-flash-exp';
const TTS_MODEL = 'gemini-2.0-flash-exp';

export interface FilePart {
  inlineData: {
    data: string;
    mimeType: string;
  }
}

export class GeminiService {
  private ai: GoogleGenAI;
  private chat: Chat | null = null;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  public async initChat(systemInstruction: string) {
    this.chat = this.ai.chats.create({
      model: MODEL_NAME,
      config: {
        systemInstruction,
        temperature: 0.7,
        tools: [{ googleSearch: {} }]
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

      const responseStream = await this.chat.sendMessageStream({
        message: { parts } as any
      });

      for await (const chunk of responseStream) {
        const c = chunk as GenerateContentResponse;
        yield {
          text: c.text,
          grounding: c.candidates?.[0]?.groundingMetadata
        };
      }
    } catch (error) {
      console.error("Gemini API Error:", error);
      throw error;
    }
  }

  public async generateExamQuestionsStructured(prompt: string, fileParts?: FilePart[]) {
    try {
      const contents = fileParts && fileParts.length > 0
        ? { parts: [...fileParts, { text: prompt }] }
        : prompt;

      const response = await this.ai.models.generateContent({
        model: MODEL_NAME,
        contents: contents as any,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, description: "Phải là 'Trắc nghiệm' hoặc 'Tự luận'" },
                level: { type: Type.STRING, description: "Nhận biết, Thông hiểu, Vận dụng, hoặc Vận dụng cao" },
                strand: { type: Type.STRING, description: "Mạch kiến thức" },
                content: { type: Type.STRING, description: "Nội dung câu hỏi văn bản" },
                image: {
                  type: Type.STRING,
                  description: "NẾU câu hỏi gốc có hình vẽ, sơ đồ, đồ thị hoặc bảng biểu quan trọng, hãy cung cấp mô tả trực quan chi tiết hoặc mã SVG đơn giản để tái tạo hình ảnh đó. Nếu không có, để trống."
                },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "4 phương án A, B, C, D."
                },
                answer: { type: Type.STRING, description: "Đáp án đúng" },
                explanation: { type: Type.STRING, description: "Giải thích chi tiết" }
              },
              required: ["type", "level", "strand", "content", "answer"]
            }
          }
        }
      });

      return JSON.parse(response.text || '[]');
    } catch (error) {
      console.error("Structured Exam Generation Error:", error);
      throw error;
    }
  }

  public async generateSuggestions(history: string[], persona: string) {
    try {
      const prompt = `Dựa trên lịch sử: ${history.join(' | ')}, hãy đề xuất 3 hành động tiếp theo cho giáo viên. Trả về JSON: { "suggestions": string[] }`;
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestions: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
          }
        }
      });
      const data = JSON.parse(response.text || '{"suggestions": []}');
      return data.suggestions as string[];
    } catch (error) {
      console.error("Suggestions Generation Error:", error);
      return [];
    }
  }

  public async generateImage(prompt: string) {
    const response = await this.ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: { parts: [{ text: prompt }] },
      config: { imageConfig: { aspectRatio: "1:1" } }
    });
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    return null;
  }

  public async generateSpeech(text: string, voiceName: 'Kore' | 'Puck' = 'Kore') {
    const response = await this.ai.models.generateContent({
      model: TTS_MODEL,
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } }
      }
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  }
}

export const geminiService = new GeminiService();
