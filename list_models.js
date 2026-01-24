
import fs from 'fs';

async function listAllModels() {
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

    console.log("Listing models for API Key:", apiKey.substring(0, 5) + "...");

    const versions = ['v1', 'v1beta'];
    for (const v of versions) {
        try {
            console.log(`\n--- Fetching models for version ${v} ---`);
            const response = await fetch(`https://generativelanguage.googleapis.com/${v}/models?key=${apiKey}`);
            const data = await response.json();
            if (data.models) {
                data.models.forEach(m => {
                    console.log(`- ${m.name} (${m.supportedGenerationMethods.join(', ')})`);
                });
            } else {
                console.log(`No models found for ${v} hoặc có lỗi:`, JSON.stringify(data));
            }
        } catch (e) {
            console.error(`Error fetching for ${v}:`, e.message);
        }
    }
}

listAllModels();
