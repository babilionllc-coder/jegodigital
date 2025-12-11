
// REMOVED: Direct GoogleGenerativeAI import
// REMOVED: Client-side API_KEY (Security Fix)

// Configuration
const API_ENDPOINT = "/api/chat";

// State
let chatHistory = [];
let isListening = false;
let isOpen = false;
let recognition = null;
let currentLang = 'es'; // Default
let currentTranslations = {}; // Store translations
let systemPrompt = `Eres el Agente IA de JegoDigital, una agencia de marketing premium en México.
    Tu tono es: Sofisticado, profesional, pero accesible y moderno (estilo 'concierge de lujo').`;

// DOM Elements (will be selected after DOM loads)
let chatContainer, messagesContainer, inputField, sendBtn, micBtn, imageBtn, fileInput, toggleBtn;

// --- UI Rendering & Event Listeners ---

document.addEventListener("DOMContentLoaded", () => {

    // Listen for Language Changes from language-manager.js
    window.addEventListener('languageChanged', (e) => {
        const { lang, translations } = e.detail;
        currentLang = lang;
        currentTranslations = translations;

        // Update Static Text
        document.querySelector('#chat-container h3').innerText = translations.chat_agent_name;
        document.querySelector('#chat-container p.text-xs').innerText = translations.chat_agent_role;
        document.getElementById('chat-input').placeholder = translations.chat_placeholder;

        // Update System Prompt
        systemPrompt = translations.chat_system_prompt;

        // Update Recognition Language
        if (recognition) {
            recognition.lang = lang === 'en' ? 'en-US' : 'es-MX';
        }
    });

    toggleBtn = document.getElementById('chat-toggle-btn');
    chatContainer = document.getElementById('chat-container');
    messagesContainer = document.getElementById('chat-messages');
    inputField = document.getElementById('chat-input');
    sendBtn = document.getElementById('chat-send-btn');
    micBtn = document.getElementById('chat-mic-btn');
    imageBtn = document.getElementById('chat-image-btn');
    fileInput = document.getElementById('chat-file-input');

    // Add Welcome Message
    const savedLang = localStorage.getItem('site_lang') || 'es';
    const initialWelcome = savedLang === 'en'
        ? "Hello! I am your JegoDigital AI Agent. I can see, hear, and help you reserve services. How can I assist you today?"
        : "¡Hola! Soy tu Agente IA de JegoDigital. Puedo ver, escuchar y ayudarte a reservar servicios. ¿En qué puedo ayudarte hoy?";

    addMessage(initialWelcome, 'bot');

    // Event Listeners
    toggleBtn.addEventListener('click', toggleChat);
    sendBtn.addEventListener('click', handleSend);
    inputField.addEventListener('keypress', (e) => e.key === 'Enter' && handleSend());
    micBtn.addEventListener('click', handleVoice);
    imageBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleImageUpload);

    // Initialize Speech Recognition
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.lang = savedLang === 'en' ? 'en-US' : 'es-MX';

        recognition.onstart = () => {
            isListening = true;
            micBtn.classList.add('text-red-500', 'animate-pulse');
        };

        recognition.onend = () => {
            isListening = false;
            micBtn.classList.remove('text-red-500', 'animate-pulse');
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            inputField.value = transcript;
            handleSend();
        };
    } else {
        micBtn.style.display = 'none';
    }
});

// --- Core Functions ---

function toggleChat() {
    isOpen = !isOpen;
    if (isOpen) {
        chatContainer.classList.remove('hidden');
        setTimeout(() => chatContainer.classList.remove('opacity-0', 'translate-y-4'), 10);
        inputField.focus();
    } else {
        chatContainer.classList.add('opacity-0', 'translate-y-4');
        setTimeout(() => chatContainer.classList.add('hidden'), 300);
    }
}

async function handleSend() {
    const text = inputField.value.trim();
    if (!text) return;

    // 1. Add User Message
    addMessage(text, 'user');
    chatHistory.push({ role: 'user', text: text });
    inputField.value = '';

    // 2. Show Typing Indicator
    const typingId = showTyping();

    try {
        // 3. SECURE CALL TO VERCEL BACKEND
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                history: chatHistory,
                config: {
                    systemPrompt: systemPrompt
                }
            })
        });

        const data = await response.json();

        // Remove Typing Indicator
        removeMessage(typingId);

        if (data.error) throw new Error(data.error);

        const aiResponse = data.text;

        // 4. Add AI Response
        addMessage(aiResponse, 'bot');
        chatHistory.push({ role: 'bot', text: aiResponse });

    } catch (error) {
        removeMessage(typingId);
        console.error("Chat Error:", error);
        addMessage(currentLang === 'en' ? "Sorry, connection error." : "Lo siento, error de conexión.", 'bot');
    }
}

async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        const base64Image = event.target.result;

        // Show image in chat
        const imgMsgId = addMessage(`<img src="${base64Image}" class="max-w-[150px] rounded-lg border border-white/20">`, 'user');

        const typingId = showTyping();

        try {
            // SECURE CALL - IMAGE WITH PROMPT
            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: currentLang === 'en' ? "Analyze this image." : "Analiza esta imagen.",
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
            chatHistory.push({ role: 'bot', text: data.text }); // Simplified history for image turn

        } catch (error) {
            removeMessage(typingId);
            addMessage("Error processing image.", 'bot');
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

    bubble.className = `max-w-[80%] rounded-2xl p-3 px-4 text-sm ${isUser
        ? 'bg-primary text-white rounded-br-none'
        : 'bg-surface border border-white/10 text-slate-200 rounded-bl-none'
        }`;

    // Markdown-ish parsing (basic)
    bubble.innerHTML = text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    div.appendChild(bubble);
    messagesContainer.appendChild(div);
    scrollToBottom();
}

function showTyping() { // Renamed from showTypingIndicator to match new call sites, or I should update logic.
    // In my rewritten handleSend I called showTyping(). Let's use that name or alias it.
    // The previous file had showTypingIndicator. Let's stick to consistent naming.
    // I will rename this function to showTyping to match my handleSend logic above.
    const div = document.createElement('div');
    const id = 'typing-' + Date.now();
    div.id = id;
    div.className = 'flex justify-start mb-4';
    div.innerHTML = `
        <div class="bg-surface border border-white/10 rounded-2xl rounded-bl-none p-3 flex gap-1">
            <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
            <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-100"></div>
            <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-200"></div>
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
    const cardId = 'vip-' + Date.now();
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=JEGODIGITAL-VIP-${Date.now()}`;

    const html = `
    <div class="bg-gradient-to-r from-slate-900 to-slate-800 border border-t-primary/50 border-white/10 p-4 rounded-xl mt-2 w-full max-w-xs mx-auto text-center shadow-lg shadow-primary/20">
        <div class="text-xs font-bold text-primary tracking-widest mb-2 uppercase">VIP Access Pass</div>
        <h3 class="text-white font-bold text-lg mb-4">Reservation Confirmed</h3>
        <div class="bg-white p-2 rounded-lg inline-block mb-3">
            <img src="${qrUrl}" alt="QR Code" class="w-32 h-32">
        </div>
        <p class="text-slate-400 text-xs text-center">Present this code to your agent.</p>
    </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = html;
    messagesContainer.appendChild(div);
    scrollToBottom();
}
