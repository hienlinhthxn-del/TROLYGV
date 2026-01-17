
import { GoogleGenerativeAI } from "@google/generative-ai";
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
            // Remove quotes if present
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

async function listModels() {
    const genAI = new GoogleGenerativeAI(apiKey);
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        // Note: SDK doesn't have a direct listModels method exposed easily in the main class in all versions, 
        // but we can try a simple generation to see if it works, or check specific known models.
        // Actually, for listModels we might need to use the REST API manually if the SDK doesn't expose it conveniently in this version.
        // Let's try to just use a known stable model like 'gemini-pro' or 'gemini-1.0-pro' to test.

        console.log("Testing with 'gemini-pro'...");
        const modelPro = genAI.getGenerativeModel({ model: "gemini-pro" });
        const resultPro = await modelPro.generateContent("Hello");
        console.log("gemini-pro works:", resultPro.response.text());

        console.log("Testing with 'gemini-1.5-flash'...");
        const modelFlash = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const resultFlash = await modelFlash.generateContent("Hello");
        console.log("gemini-1.5-flash works:", resultFlash.response.text());

    } catch (error) {
        console.error("Error details:", error);
    }
}

listModels();
