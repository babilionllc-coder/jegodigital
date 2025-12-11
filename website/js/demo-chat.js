
// REMOVED: Direct GoogleGenerativeAI import
// REMOVED: Client-side API_KEY (Security Fix)

// Configuration
const API_ENDPOINT = "/api/chat";

// State
let isListening = false;
let isOpen = false;
let recognition = null;

// Load Config or Default
const CONFIG = window.LUMIERE_CONFIG || {
    name: "Sofia",
    role: "Concierge",
    identity: "You are SOFIA, the AI Concierge for 'La Isla Maison', a high-end luxury jewelry boutique.",
    personality: "Warm, sophisticated, slightly flirtatious but professional.",
    goal: "Sell luxury jewelry.",
    inventory: `
    - Royal Sapphire Ring ($3,500)
    - Diamond Tennis Bracelet ($5,000)
    - Tahitian Pearl Necklace ($2,200)
    `,
    color: "#D4AF37",
    welcome: "✨ Welcome to La Isla Maison. I am Sofia. Are you looking for something special today?"
};

let systemPrompt = `
Identity: ${CONFIG.identity}
Personality: ${CONFIG.personality}
Goal: ${CONFIG.goal}
Inventory Context:
${CONFIG.inventory}

Instructions:
1. If the user sends an image, analyze it based on the context.
2. Keep responses concise (under 3 sentences).
3. Try to close with a reservation request.
`;

// DOM Elements
let chatContainer, messagesContainer, inputField, sendBtn, micBtn, imageBtn, fileInput, toggleBtn;

// --- UI Rendering & Event Listeners ---

document.addEventListener("DOMContentLoaded", () => {
    toggleBtn = document.getElementById('chat-toggle-btn');
    chatContainer = document.getElementById('chat-container');
    messagesContainer = document.getElementById('chat-messages');
    inputField = document.getElementById('chat-input');
    sendBtn = document.getElementById('chat-send-btn');
    micBtn = document.getElementById('chat-mic-btn');
    imageBtn = document.getElementById('chat-image-btn');
    fileInput = document.getElementById('chat-file-input');

    // Welcome Message
    addMessage(CONFIG.welcome, 'bot');

    // Event Listeners
    if (toggleBtn) toggleBtn.addEventListener('click', toggleChat);
    sendBtn.addEventListener('click', handleSend);
    inputField.addEventListener('keypress', (e) => e.key === 'Enter' && handleSend());
    micBtn.addEventListener('click', handleVoice);
    imageBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleImageUpload);

    // Initialize Speech Recognition
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'es-MX'; // Could be parameterized in CONFIG too

        recognition.onstart = () => {
            isListening = true;
            micBtn.classList.add('text-red-500', 'animate-pulse');
        };

        recognition.onend = () => {
            isListening = false;
            micBtn.classList.remove('text-red-500', 'animate-pulse');
            handleSend(); // Auto-send on voice end
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            inputField.value = transcript;
        };
    } else {
        micBtn.style.display = 'none';
    }
});

// --- Core Functions ---

function toggleChat() {
    isOpen = !isOpen;
    if (isOpen) {
        chatContainer.classList.remove('hidden', 'scale-90', 'opacity-0');
        chatContainer.classList.add('scale-100', 'opacity-100');
    } else {
        chatContainer.classList.add('hidden', 'scale-90', 'opacity-0');
        chatContainer.classList.remove('scale-100', 'opacity-100');
    }
}

async function handleSend() {
    const text = inputField.value.trim();
    if (!text) return;

    // 1. User Message
    addMessage(text, 'user');
    inputField.value = '';

    // 2. Typing Indicator
    const typingId = showTyping();

    try {
        // 3. SECURE CALL TO VERCEL BACKEND
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                // We could send full history here if we tracked it in a simpler array structure, 
                // but for this demo script we often just send the message or a small context.
                // Let's assume stateless for this simple demo OR send message + systemPrompt.
                config: {
                    systemPrompt: systemPrompt
                }
            })
        });

        const data = await response.json();
        removeMessage(typingId);

        if (data.error) throw new Error(data.error);

        const aiResponse = data.text;

        // 4. Bot Response
        addMessage(aiResponse, 'bot');
        speak(aiResponse);

        // Simulate "Sale" event
        if (aiResponse.toLowerCase().includes("reserve") || aiResponse.toLowerCase().includes("reserva") || aiResponse.toLowerCase().includes("book")) {
            showVIPCard();
        }

    } catch (error) {
        removeMessage(typingId);
        addMessage("One moment please.", 'bot');
        console.error(error);
    }
}

function handleVoice() {
    if (!recognition) return;
    if (isListening) {
        recognition.stop();
    } else {
        recognition.start();
    }
}

function speak(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis.getVoices();
        const keywords = CONFIG.voice_keywords || ['Paulina', 'Google español', 'Samantha'];

        let preferredVoice = null;
        for (const keyword of keywords) {
            preferredVoice = voices.find(v => v.name.includes(keyword));
            if (preferredVoice) break;
        }

        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }

        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
    }
}

async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        const base64Image = event.target.result;

        const imgNav = document.createElement('img');
        imgNav.src = base64Image;
        imgNav.className = "max-w-[200px] rounded-lg mb-2 border border-white/10";
        appendToChat(imgNav, 'user');
        addMessage("(Showing item...)", 'user');

        const typingId = showTyping();

        try {
            const prompt = `Act as ${CONFIG.name}. Analyze this image. Cross-reference it with the Inventory Context. Recommend the ONE item that best matches. Be persuasive.`;

            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: prompt,
                    image: base64Image,
                    config: {
                        systemPrompt: systemPrompt
                    }
                })
            });

            const data = await response.json();
            removeMessage(typingId);

            if (data.error) throw new Error(data.error);

            addMessage(data.text, 'bot');
            speak(data.text);

        } catch (error) {
            removeMessage(typingId);
            addMessage("Could you describe it for me?", 'bot');
            console.error(error);
        }
    };
    reader.readAsDataURL(file);
}

// --- UI Helpers ---

function addMessage(text, sender) {
    const div = document.createElement('div');
    div.className = `flex w-full mb-4 ${sender === 'user' ? 'justify-end' : 'justify-start'}`;

    const bubble = document.createElement('div');
    const isUser = sender === 'user';

    // Dynamic Color for User Bubble
    const userStyle = `background-color: ${CONFIG.color}; color: #000; border-bottom-right-radius: 0;`;
    const botStyle = 'background-color: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #f1f5f9; border-bottom-left-radius: 0; backdrop-filter: blur(12px);';

    bubble.className = `max-w-[80%] rounded-2xl p-3 px-4 text-sm shadow-md`;
    bubble.style.cssText = isUser ? userStyle : botStyle;

    bubble.innerHTML = text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    div.appendChild(bubble);
    messagesContainer.appendChild(div);
    scrollToBottom();
}

function appendToChat(element, sender) {
    const div = document.createElement('div');
    div.className = `flex w-full mb-2 ${sender === 'user' ? 'justify-end' : 'justify-start'}`;
    div.appendChild(element);
    messagesContainer.appendChild(div);
    scrollToBottom();
}

function showTyping() {
    const div = document.createElement('div');
    const id = 'typing-' + Date.now();
    div.id = id;
    div.className = 'flex justify-start mb-4';
    div.innerHTML = `
        <div class="bg-white/10 border border-white/20 rounded-2xl rounded-bl-none p-3 flex gap-1 backdrop-blur-md">
            <div class="w-2 h-2 rounded-full animate-bounce" style="background-color: ${CONFIG.color}"></div>
            <div class="w-2 h-2 rounded-full animate-bounce delay-100" style="background-color: ${CONFIG.color}"></div>
            <div class="w-2 h-2 rounded-full animate-bounce delay-200" style="background-color: ${CONFIG.color}"></div>
        </div>
    `;
    messagesContainer.appendChild(div);
    scrollToBottom();
    return id;
}

function removeMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showVIPCard() {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=VIP-${Date.now()}`;
    const html = `
    <div class="bg-gradient-to-br from-slate-900 to-black border p-5 rounded-xl mt-4 w-full max-w-xs mx-auto text-center shadow-[0_0_30px_rgba(255,255,255,0.1)] transform transition-all hover:scale-105 duration-300" style="border-color: ${CONFIG.color}">
        <div class="text-[10px] font-bold tracking-[0.2em] mb-3 uppercase border-b pb-2" style="color: ${CONFIG.color}; border-color: ${CONFIG.color}30">Authentication</div>
        <h3 class="text-white font-serif italic text-xl mb-4">Confirmation</h3>
        <div class="bg-white p-3 rounded-lg inline-block mb-4 shadow-inner">
            <img src="${qrUrl}" alt="QR Code" class="w-28 h-28 mix-blend-multiply">
        </div>
        <p class="text-slate-400 text-xs italic">"Your reservation is confirmed."</p>
    </div>
    `;
    const div = document.createElement('div');
    div.innerHTML = html;
    // Note: This logic previously just modified innerHTML. It's safer to append, 
    // but the original showVIPCode often just appended.
    // However, showVIPCard in this file was appending to innerHTML of the container? 
    // No, it was creating a div but the helper in the previous file wrote directly to messagesContainer.
    // Here I will append.
    messagesContainer.appendChild(div);
    scrollToBottom();
}
