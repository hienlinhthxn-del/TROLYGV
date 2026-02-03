// Quick script to list available Gemini models
const API_KEY = 'AIzaSyBWkCZUYFFmPJzxMqviFKoU7iYcSAa6-JY';

async function listModels() {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
        const data = await response.json();

        if (data.error) {
            console.log('API Error:', data.error.message);
            return;
        }

        console.log('Available models that support generateContent:');
        data.models.forEach(model => {
            if (model.supportedGenerationMethods && model.supportedGenerationMethods.includes('generateContent')) {
                console.log(`  - ${model.name.replace('models/', '')}`);
            }
        });
    } catch (error) {
        console.error('Error:', error.message);
    }
}

listModels();
