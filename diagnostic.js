
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';

async function testModels() {
    let apiKey = '';
    try {
        const env = fs.readFileSync('.env.local', 'utf8');
        const match = env.match(/VITE_GEMINI_API_KEY=(.+)/) || env.match(/GEMINI_API_KEY=(.+)/);
        if (match) apiKey = match[1].trim();
    } catch (e) { }

    if (!apiKey) {
        console.error("No API key found");
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const models = [
        'gemini-1.5-flash',
        'gemini-2.0-flash-exp',
        'gemini-1.5-flash-8b',
        'gemini-1.5-pro',
        'gemini-1.0-pro'
    ];

    console.log("Testing with API Key:", apiKey.substring(0, 5) + "...");

    for (const modelName of models) {
        try {
            console.log(`Checking ${modelName} on v1...`);
            const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1' });
            const result = await model.generateContent("test");
            console.log(`✅ ${modelName} works on v1!`);
        } catch (e) {
            console.log(`❌ ${modelName} failed on v1: ${e.message}`);

            try {
                console.log(`Checking ${modelName} on v1beta...`);
                const modelBeta = genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1beta' });
                const resultBeta = await modelBeta.generateContent("test");
                console.log(`✅ ${modelName} works on v1beta!`);
            } catch (e2) {
                console.log(`❌ ${modelName} failed on v1beta: ${e2.message}`);
            }
        }
        console.log("-------------------");
    }
}

testModels();
