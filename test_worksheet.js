
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import fs from 'fs';
import path from 'path';

// Load env
const envPath = path.resolve(process.cwd(), '.env.local');
let apiKey = '';

try {
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const match = envContent.match(/GEMINI_API_KEY=(.+)/);
        if (match) {
            apiKey = match[1].trim();
            if ((apiKey.startsWith('"') && apiKey.endsWith('"')) || (apiKey.startsWith("'") && apiKey.endsWith("'"))) {
                apiKey = apiKey.slice(1, -1);
            }
        }
    }
} catch (e) {
    console.error("Error reading .env.local:", e);
}

if (!apiKey) {
    console.error("API Key not found in .env.local");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const MODEL_NAME = 'gemini-1.5-flash';

async function testWorksheet() {
    console.log(`Testing Worksheet Generation with model: ${MODEL_NAME}`);
    try {
        const model = genAI.getGenerativeModel({
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
        });

        const prompt = "Tạo phiếu học tập cho học sinh lớp 1 chủ đề Bé học đếm, môn Toán, 2 câu.";
        const result = await model.generateContent(prompt);
        console.log("Raw Response:", result.response.text());
        const content = JSON.parse(result.response.text());
        console.log("Parsed Content:", JSON.stringify(content, null, 2));
    } catch (error) {
        console.error("Generation Failed!");
        console.error(error);
    }
}

testWorksheet();
