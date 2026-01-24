import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } from "@google/generative-ai";

/**
 * GEMINI SERVICE - VERSION 4.0 (TURBO STABLE)
 * Cơ chế "Phòng thủ đa tầng": Tự động thử lại với nhiều Model và Version nếu bị lỗi 404.
 */

const FLASH_MODELS = ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash-002'];
const PRO_MODELS = ['gemini-1.5-pro', 'gemini-1.5-pro-latest', 'gemini-1.5-pro-002'];

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
  private currentModelName: string = FLASH_MODELS[0];
  private currentApiVersion: 'v1' | 'v1beta' = 'v1';
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

  private setupModel(name: string = FLASH_MODELS[0], version: 'v1' | 'v1beta' = 'v1') {
    if (!this.genAI) return;
    this.currentModelName = name;
    this.currentApiVersion = version;

    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ];

    this.model = this.genAI.getGenerativeModel({
      model: name,
      safetySettings,
      systemInstruction: this.currentSystemInstruction,
    }, { apiVersion: version });

    console.log(`[GeminiService] Initialized: ${name} (${version})`);
  }

  private async ensureInitialized() {
    if (!this.getApiKey()) throw new Error("Thầy Cô chưa cấu hình API Key trong .env.local");
    if (!this.genAI || !this.model) this.initialize();
  }

  // Hàm quan trọng: Tự động đổi model khi lỗi 404
  private async retryWithNextModel(error: any): Promise<boolean> {
    if (!this.genAI) return false;

    const isNotFoundError = error.message?.includes("404") || error.message?.includes("not found");
    if (!isNotFoundError) return false;

    console.warn(`[GeminiService] Model ${this.currentModelName} (${this.currentApiVersion}) bị lỗi 404. Đang thử model khác...`);

    // Danh sách thử nghiệm lần lượt
    const attempts = [
      { name: FLASH_MODELS[0], version: 'v1' as const },
      { name: FLASH_MODELS[1], version: 'v1' as const },
      { name: FLASH_MODELS[0], version: 'v1beta' as const },
      { name: PRO_MODELS[0], version: 'v1' as const },
      { name: PRO_MODELS[0], version: 'v1beta' as const },
    ];

    for (const attempt of attempts) {
      if (attempt.name === this.currentModelName && attempt.version === this.currentApiVersion) continue;

      try {
        console.log(`[GeminiService] Thử nghiệm: ${attempt.name} (${attempt.version})`);
        this.setupModel(attempt.name, attempt.version);
        // Kiểm tra nhanh bằng một câu hỏi ngắn
        await this.model.generateContent("ping");
        console.log(`[GeminiService] Đổi Model thành công sang: ${attempt.name}`);
        return true;
      } catch (e) {
        continue;
      }
    }
    return false;
  }

  public async initChat(systemInstruction: string) {
    await this.ensureInitialized();
    if (systemInstruction) this.currentSystemInstruction = systemInstruction;
    this.setupModel(this.currentModelName, this.currentApiVersion);
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
      if (await this.retryWithNextModel(error)) {
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
        fileParts.forEach(part => { if (part.inlineData?.data) parts.push(part); });
      }
      parts.push({ text: message });

      const result = await this.chat.sendMessageStream(parts);
      for await (const chunk of result.stream) {
        yield { text: chunk.text(), grounding: (chunk as any).candidates?.[0]?.groundingMetadata };
      }
    } catch (error: any) {
      if (await this.retryWithNextModel(error)) {
        this.chat = null;
        const stream = this.sendMessageStream(message, fileParts);
        for await (const chunk of stream) yield chunk;
        return;
      }
      this.chat = null;
      throw new Error(`Lỗi AI: ${error.message}. Thầy Cô hãy thử đổi API Key mới.`);
    }
  }

  public async generateExamQuestionsStructured(prompt: string, fileParts?: FilePart[]) {
    await this.ensureInitialized();
    try {
      const config = {
        model: this.currentModelName,
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
      };

      const structuredModel = this.genAI!.getGenerativeModel(config, { apiVersion: this.currentApiVersion });
      const parts: any[] = [];
      if (fileParts) parts.push(...fileParts);
      parts.push({ text: prompt });

      const result = await structuredModel.generateContent(parts);
      return JSON.parse(this.cleanJSON(result.response.text()));
    } catch (error: any) {
      if (await this.retryWithNextModel(error)) {
        return this.generateExamQuestionsStructured(prompt, fileParts);
      }
      // Nếu không tạo được cấu trúc JSON, dùng prompt thủ công
      const result = await this.model.generateContent(prompt + "\nTrả về JSON chuẩn.");
      return JSON.parse(this.cleanJSON(result.response.text()));
    }
  }

  public async generateWorksheetContent(topic: string, subject: string, questionCount: number, format: string = 'hon-hop') {
    const prompt = `Tạo phiếu học tập tiểu học: Môn ${subject}, Chủ đề ${topic}, ${questionCount} câu. Trả về JSON.`;
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
      const prompt = `Gợi ý 3 hành động tiếp theo cho ${persona} từ: ${history.join(' | ')}. Trả về JSON { "suggestions": [] }`;
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
