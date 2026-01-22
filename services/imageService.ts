import { geminiService } from './geminiService';

/**
 * Generate an image using AI based on a text prompt
 * @param prompt - Description of the image to generate
 * @returns URL of the generated image
 */
export const generate_image = async (prompt: string): Promise<string> => {
    try {
        const imageUrl = await geminiService.generateImage(prompt);
        if (!imageUrl) {
            throw new Error('Failed to generate image');
        }
        return imageUrl;
    } catch (error) {
        console.error('Image generation error:', error);
        throw error;
    }
};
