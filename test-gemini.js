import { GoogleGenerativeAI } from "@google/generative-ai";

import { readFileSync } from "fs";

// Load .env.local manually
try {
    const envContent = readFileSync(".env.local", "utf8");
    const lines = envContent.split("\n");
    for (const line of lines) {
        const [key, value] = line.split("=");
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    }
} catch (e) {
    console.error("No .env.local found");
}

const apiKey = process.env.GEMINI_API_KEY || "";
console.log("Using API Key starting with:", apiKey.substring(0, 10));

const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
    try {
        const models = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        // This doesn't list, but let's try to generate a simple thing
        const result = await models.generateContent("Hi");
        console.log("Response:", result.response.text());
    } catch (error) {
        console.error("Test Error:", error.message);
        if (error.message.includes("404")) {
            console.log("404 confirmed. Attempting listModels if possible...");
            // getGenerativeModel doesn't have listModels, but we can use the REST API via fetch if needed
        }
    }
}

listModels();
