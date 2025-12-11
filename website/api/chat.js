import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { message, history, image, config } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Server configuration error: Missing API Key' });
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        // Use the model specified in config or default to flash-exp
        const modelName = config?.model || "gemini-2.0-flash-exp";
        const model = genAI.getGenerativeModel({ model: modelName });

        // Construct the chat history for the API
        // The Google SDK expects: { role: "user" | "model", parts: [{ text: "..." }] }
        // Our frontend history might need mapping if it differs, but let's assume standard format or map it here.

        // Simple mapping if needed, otherwise pass through if aligned
        const formattedHistory = history ? history.map(msg => ({
            role: msg.role === 'bot' ? 'model' : 'user',
            parts: [{ text: msg.text }]
        })) : [];

        // If there's an image, we use the vision capabilities
        if (image) {
            // For vision, we usually use generateContent with [text, image] rather than chatSession
            // Assuming 'image' is base64 string without data prefix, or handle it
            const imagePart = {
                inlineData: {
                    data: image.split(',')[1] || image,
                    mimeType: "image/jpeg" // Adjust based on input if needed
                }
            };

            const prompt = message || "Analyze this image";
            // Prepend system instruction if provided in config logic (SDK supports systemInstruction now)

            const result = await model.generateContent([prompt, imagePart]);
            const response = await result.response;
            return res.status(200).json({ text: response.text() });
        }

        // Standard Chat with History
        // Note: System instruction is set at model initialization in newer SDKs or mapped into history
        // For Vercel statelessness, we might need to send system prompt as first history item or use systemInstruction

        const chatOptions = {
            history: formattedHistory
        };

        if (config?.systemPrompt) {
            chatOptions.systemInstruction = config.systemPrompt;
        }

        const chat = model.startChat(chatOptions);
        const result = await chat.sendMessage(message);
        const response = await result.response;
        const text = response.text();

        return res.status(200).json({ text: text });

    } catch (error) {
        console.error('Gemini API Error:', error);
        return res.status(500).json({ error: 'Failed to generate response', details: error.message });
    }
}
