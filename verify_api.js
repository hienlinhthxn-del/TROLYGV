
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import path from 'path';

// Load env
const envPath = path.resolve(process.cwd(), '.env.local');
let apiKey = '';

try {
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const match = envContent.match(/(?:VITE_)?GEMINI_API_KEY=(.+)/);
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

console.log(`Testing API Key: ${apiKey.substring(0, 5)}...`);

async function testConnection() {
    try {
        const ai = new GoogleGenerativeAI(apiKey);
        const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent("Hello, this is a test.");

        console.log("Sending request...");
        console.log("Response received!");
        console.log("Text:", result.response.text());
        console.log("Connection Successful.");
    } catch (error) {
        console.error("Connection Failed!");
        console.error(error);
    }
}

testConnection();
