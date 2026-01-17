
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
    console.log("Checking available models via direct REST API...");
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);

        if (!response.ok) {
            console.error(`API Error: ${response.status} ${response.statusText}`);
            const errorText = await response.text();
            console.error("Error details:", errorText);
            return;
        }

        const data = await response.json();

        if (data.models) {
            console.log("\nSuccessfully retrieved model list! Here are the models available to your API Key:");
            console.log("---------------------------------------------------");
            data.models.forEach(model => {
                if (model.supportedGenerationMethods && model.supportedGenerationMethods.includes("generateContent")) {
                    console.log(`- Name: ${model.name.replace('models/', '')}`);
                    console.log(`  Display Name: ${model.displayName}`);
                    console.log(`  Description: ${model.description ? model.description.substring(0, 60) + '...' : ''}`);
                    console.log("---------------------------------------------------");
                }
            });
        } else {
            console.log("No models found in the response.");
            console.log("Raw response:", data);
        }

    } catch (error) {
        console.error("Network or Fetch Error:", error);
    }
}

listModels();
