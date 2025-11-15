const { Client, LocalAuth } = require('whatsapp-web.js');
const GoogleSheetsHelper = require('./sheets');

class SimpleWhatsAppAutomation {
    constructor() {
        this.sheets = new GoogleSheetsHelper();
        this.client = null;
        this.isReady = false;
    }

    async initialize() {
        console.log('🚀 SIMPLE WHATSAPP AUTOMATION STARTING...');
        console.log('💰 Cost: $0 - Completely FREE');
        
        await this.sheets.initialize();
        
        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: "jegodigital-whatsapp"
            }),
            puppeteer: {
                headless: false,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage'
                ]
            }
        });

        // Setup events
        this.client.on('ready', () => {
            console.log('✅ WhatsApp Client is ready!');
            console.log('✅ Starting automation now...');
            this.isReady = true;
            this.startAutomation();
        });

        this.client.on('authenticated', () => {
            console.log('✅ WhatsApp authenticated successfully');
        });

        this.client.on('qr', (qr) => {
            console.log('📱 QR Code generated - but you should already be logged in');
        });

        // Initialize client
        await this.client.initialize();
        
        // Wait for ready state
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

    async startAutomation() {
        console.log('\n🎯 STARTING AUTOMATION...');
        
        // Get leads from Google Sheets
        const leads = await this.sheets.getWhatsAppLeads();
        
        if (leads.length === 0) {
            console.log('❌ No leads found to send messages to');
            return;
        }

        console.log(`📊 Found ${leads.length} leads ready to send`);
        console.log('⚠️  Adding 2-second delay between messages');
        
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];
            
            console.log(`\n📊 PROGRESS: ${i + 1}/${leads.length} - ${lead.businessName}`);
            console.log(`📱 Phone: ${lead.phoneNumber}`);
            console.log(`💬 Message Preview: ${lead.message.substring(0, 80)}...`);

            try {
                // Send message via WhatsApp
                const chatId = `${lead.phoneNumber}@c.us`;
                console.log(`📤 Sending message to ${lead.phoneNumber}...`);
                
                await this.client.sendMessage(chatId, lead.message);
                
                successCount++;
                console.log(`✅ SUCCESS! Message sent (${successCount} total sent)`);
                
                // Update Google Sheets status
                await this.sheets.updateLeadStatus(lead.rowIndex, 'Message Sent');

                // Wait between messages (2 seconds)
                if (i < leads.length - 1) {
                    console.log('⏳ Waiting 2 seconds before next message...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

            } catch (error) {
                console.error(`❌ FAILED to send to ${lead.businessName}: ${error.message}`);
                errorCount++;
                
                // Update Google Sheets status
                await this.sheets.updateLeadStatus(lead.rowIndex, 'Failed to Send');
            }
        }

        console.log('\n🎉 WHATSAPP AUTOMATION COMPLETE!');
        console.log(`✅ Successfully sent: ${successCount} messages`);
        console.log(`❌ Failed to send: ${errorCount} messages`);
        console.log(`📊 Total processed: ${leads.length} leads`);
        console.log('💰 Total cost: $0 - Completely FREE!');
        
        if (successCount > 0) {
            console.log('🎉 AUTOMATION SUCCESSFUL! Messages sent via WhatsApp!');
        } else {
            console.log('❌ No messages were sent successfully');
        }
    }

    async close() {
        if (this.client) {
            await this.client.destroy();
            console.log('🔧 WhatsApp client closed');
        }
    }
}

// Main execution
async function main() {
    const automation = new SimpleWhatsAppAutomation();
    
    try {
        console.log('📱 IMPORTANT: Make sure WhatsApp Web is already open and logged in');
        console.log('📱 The automation will start automatically once connected...');
        
        await automation.initialize();
        
    } catch (error) {
        console.error('❌ Automation Error:', error);
    } finally {
        await automation.close();
    }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
    console.log('\n⏹️  Received interrupt signal...');
    process.exit(0);
});

if (require.main === module) {
    main();
}

module.exports = SimpleWhatsAppAutomation;

