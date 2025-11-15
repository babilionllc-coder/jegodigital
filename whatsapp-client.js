const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

class WhatsAppClient {
    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: "jegodigital-whatsapp"
            }),
            puppeteer: {
                headless: false,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            }
        });
        
        this.isReady = false;
        this.setupEvents();
    }

    setupEvents() {
        this.client.on('qr', (qr) => {
            console.log('\n📱 WHATSAPP QR CODE GENERATED:');
            console.log('📱 Scan this QR code with your phone to login:');
            console.log('===============================================');
            qrcode.generate(qr, { small: true });
            console.log('===============================================');
            console.log('📱 Open WhatsApp on your phone');
            console.log('📱 Go to Settings > Linked Devices');
            console.log('📱 Tap "Link a Device"');
            console.log('📱 Scan the QR code above');
        });

        this.client.on('ready', () => {
            console.log('✅ WhatsApp Client is ready!');
            console.log('✅ You can now send messages automatically');
            this.isReady = true;
        });

        this.client.on('authenticated', () => {
            console.log('✅ WhatsApp authenticated successfully');
        });

        this.client.on('auth_failure', msg => {
            console.error('❌ Authentication failed:', msg);
        });

        this.client.on('disconnected', (reason) => {
            console.log('❌ WhatsApp client was logged out:', reason);
            this.isReady = false;
        });

        this.client.on('message', async (message) => {
            // Optional: Handle incoming messages
            if (message.from === 'status@broadcast') {
                console.log('📱 Status update received');
            }
        });
    }

    async initialize() {
        console.log('🚀 Initializing WhatsApp Client...');
        await this.client.initialize();
        
        // Wait for client to be ready
        return new Promise((resolve) => {
            const checkReady = () => {
                if (this.isReady) {
                    resolve(true);
                } else {
                    setTimeout(checkReady, 1000);
                }
            };
            checkReady();
        });
    }

    async sendMessage(phoneNumber, message) {
        try {
            if (!this.isReady) {
                throw new Error('WhatsApp client is not ready');
            }

            const chatId = `${phoneNumber}@c.us`;
            console.log(`📤 Sending message to ${phoneNumber}...`);
            
            await this.client.sendMessage(chatId, message);
            console.log(`✅ Message sent successfully to ${phoneNumber}`);
            
            return true;
        } catch (error) {
            console.error(`❌ Failed to send message to ${phoneNumber}:`, error.message);
            return false;
        }
    }

    async close() {
        if (this.client) {
            await this.client.destroy();
            console.log('🔧 WhatsApp client closed');
        }
    }
}

module.exports = WhatsAppClient;

