
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } from "@google/generative-ai";

const MODEL_NAME = 'gemini-1.5-flash';
const STABLE_MODEL = 'gemini-1.5-flash';
const FALLBACK_MODEL = 'gemini-1.5-flash-8b';

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
      this.model = this.genAI.getGenerativeModel({ model: MODEL_NAME }, { apiVersion: 'v1' });
      console.log(`[GeminiService] Initialized with model: ${MODEL_NAME} (v1)`);
    } catch (e) {
      console.error("[GeminiService] Error during basic initialization:", e);
    }
  }

  private getApiKey(): string {
    const key = (import.meta as any).env?.VITE_GEMINI_API_KEY ||
      (import.meta as any).env?.GEMINI_API_KEY ||
      process.env.VITE_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.API_KEY || '';

    if (!key || key === 'PLACEHOLDER_API_KEY' || key.trim() === '') {
      return '';
    }
    return key;
  }

  public checkApiKey() {
    const key = this.getApiKey();
    if (!key) {
      throw new Error("Chưa cấu hình API Key. Vui lòng kiểm tra lại tệp .env.local hoặc cấu hình Vite.");
    }
  }

  public async initChat(systemInstruction: string) {
    this.checkApiKey();
    this.model = this.genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: systemInstruction
    }, { apiVersion: 'v1' });
    this.chat = this.model.startChat({
      generationConfig: {
        temperature: 0.7,
      },
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
      console.log("[GeminiService] Chat not initialized, initializing with default persona...");
      await this.initChat("Bạn là một trợ lý giáo dục chuyên nghiệp.");
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
    this.checkApiKey();
    try {
      const model = this.genAI.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              readingPassage: {
                type: SchemaType.STRING,
                description: "Văn bản đọc hiểu (Dành cho môn Tiếng Việt/Tiếng Anh hoặc các bài có ngữ liệu dùng chung). Nếu môn Toán hoặc không có ngữ liệu, để trống."
              },
              questions: {
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
            },
            required: ["questions"]
          }
        }
      }, { apiVersion: 'v1' });

      const parts: any[] = [];
      if (fileParts && fileParts.length > 0) {
        parts.push(...fileParts);
      }
      parts.push({ text: prompt });

      const result = await model.generateContent(parts);
      let text = result.response.text();

      console.log("[GeminiService] Exam Generation Raw Text Length:", text.length);

      // Clean JSON string
      text = this.cleanJSON(text);

      try {
        const parsed = JSON.parse(text);
        if (!parsed.questions || !Array.isArray(parsed.questions)) {
          throw new Error("AI trả về định dạng JSON nhưng thiếu danh sách câu hỏi.");
        }
        return parsed;
      } catch (parseError) {
        console.error("JSON Parse Error. Cleaned text:", text);
        throw new Error("AI trả về dữ liệu không đúng cấu trúc. Thầy/Cô vui lòng thử lại nhé!");
      }
    } catch (error) {
      console.error("Structured Exam Generation Error:", error);
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

  public async generateWorksheetContent(topic: string, subject: string, questionCount: number, format: 'trac-nghiem' | 'tu-luan' | 'hon-hop' = 'hon-hop') {
    this.checkApiKey();
    try {
      const formatInstruction = {
        'trac-nghiem': 'Tất cả câu hỏi phải ở dạng trắc nghiệm với 4 lựa chọn A, B, C, D.',
        'tu-luan': 'Tất cả câu hỏi phải ở dạng tự luận (ví dụ: bé hãy viết, bé hãy vẽ, bé hãy điền...).',
        'hon-hop': 'Kết hợp cả trắc nghiệm và tự luận để phiếu học tập thêm phong phú.'
      }[format];

      const prompt = `Tạo phiếu học tập cho học sinh lớp 1 (6-7 tuổi) với các thông tin sau:
- Môn học: ${subject}
- Chủ đề: ${topic}
- Số lượng yêu cầu: ĐÚNG ${questionCount} CÂU HỎI.
- Định dạng: ${formatInstruction}

YÊU CẦU BẮT BUỘC:
1. Bạn phải tạo DANH SÁCH gồm CHÍNH XÁC ${questionCount} câu hỏi. KHÔNG ĐƯỢC THIẾU.
2. Đánh số id từ q1, q2, q3... đến q${questionCount}.
3. Mỗi câu hỏi phải có nội dung khác nhau, sáng tạo, phù hợp với trẻ em.
4. 'imagePrompt' phải là mô tả tiếng Anh chi tiết cho từng câu (ví dụ: "A cute drawing of 3 red apples...").

Cấu trúc JSON yêu cầu:
{
  "title": "Tên phiếu học tập",
  "subject": "${subject}",
  "questions": [
    { "id": "q1", "type": "multiple-choice", "question": "...", "imagePrompt": "...", "options": ["..."], "answer": "..." },
    ... tiếp tục cho đến "q${questionCount}" ...
  ]
}`;

      const model = this.genAI.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig: {
          temperature: 0.7, // Giảm temperature để cấu trúc JSON ổn định hơn
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
                    options: {
                      type: SchemaType.ARRAY,
                      items: { type: SchemaType.STRING }
                    },
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

      const result = await model.generateContent(prompt);
      let text = result.response.text();

      text = this.cleanJSON(text);

      try {
        const content = JSON.parse(text);
        // LOGIC KIỂM TRA: Nếu AI trả về thiếu câu hỏi, chúng ta sẽ log lỗi để debug
        console.log(`AI generated ${content.questions?.length || 0}/${questionCount} questions`);
        return content;
      } catch (e) {
        console.error("Worksheet JSON Parse Error:", text);
        throw new Error("AI trả về dữ liệu không đúng cấu trúc phiếu học tập. Thầy/Cô vui lòng thử lại nhé!");
      }
    } catch (error) {
      console.error("Worksheet Generation Error:", error);
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
      }, { apiVersion: 'v1' });

      const result = await model.generateContent(prompt);
      const data = JSON.parse(result.response.text());
      return data.suggestions as string[];
    } catch (error) {
      console.error("Suggestions Generation Error:", error);
      return [];
    }
  }

  public async generateImage(prompt: string) {
    try {
      // Sử dụng API trực tiếp của Pollinations để đảm bảo tính ổn định cao nhất
      const cleanPrompt = prompt.replace(/[^\w\s]/gi, '').slice(0, 500); // Làm sạch prompt
      const enhancedPrompt = encodeURIComponent(cleanPrompt);
      const seed = Math.floor(Math.random() * 1000000);
      const timestamp = Date.now();

      // Định dạng mới nhất và ổn định nhất của Pollinations
      return `https://image.pollinations.ai/prompt/${enhancedPrompt}?width=1024&height=1024&seed=${seed}&timestamp=${timestamp}&nologo=true`;
    } catch (e) {
      console.error("Image generation error:", e);
      return null;
    }
  }

  public async generateSpeech(text: string, voiceName: 'Kore' | 'Puck' = 'Kore') {
    try {
      // Vì Gemini API hiện chưa hỗ trợ TTS trực tiếp qua SDK này một cách đơn giản,
      // chúng ta sử dụng Google Translate TTS API (miễn phí và hỗ trợ tiếng Việt rất tốt).
      // Giới hạn của API này là khoảng 200 ký tự mỗi lần.

      const encodedText = encodeURIComponent(text.slice(0, 200));
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=vi&client=tw-ob`;

      return url;
    } catch (error) {
      console.error("TTS Error:", error);
      return null;
    }
  }
}

export const geminiService = new GeminiService();

// Export standalone functions for convenience
export const generateWorksheetContent = (topic: string, subject: string, questionCount: number, format?: 'trac-nghiem' | 'tu-luan' | 'hon-hop') =>
  geminiService.generateWorksheetContent(topic, subject, questionCount, format);
