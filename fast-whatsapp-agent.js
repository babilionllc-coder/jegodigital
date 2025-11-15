const puppeteer = require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

// Load configurations
const googleConfig = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));

class FastWhatsAppAgent {
    constructor() {
        this.doc = null;
        this.browser = null;
        this.page = null;
        this.serviceAccountAuth = new JWT({
            email: googleConfig.client_email,
            key: googleConfig.private_key,
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive.file',
            ],
        });
    }

    async initialize() {
        console.log('🚀 Initializing Fast WhatsApp Agent...');
        
        this.doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', this.serviceAccountAuth);
        await this.doc.loadInfo();
        console.log(`📊 Connected to: ${this.doc.title}`);

        // Launch browser with existing profile
        this.browser = await puppeteer.launch({
            headless: false,
            userDataDir: './whatsapp-profile',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ]
        });

        this.page = await this.browser.newPage();
        await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log('🌐 Browser launched');
    }

    async getLeadsFromSheet() {
        console.log('📋 Getting leads from Copy Paste Messages sheet...');
        
        const messagesSheet = this.doc.sheetsByTitle['Copy Paste Messages'];
        await messagesSheet.loadCells();
        
        const rows = await messagesSheet.getRows();
        const leads = [];
        let alreadySentCount = 0;
        
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const businessName = row.get('Business Name');
            const phoneNumber = row.get('Phone Number');
            const message = row.get('Message to Send');
            const status = row.get('Status');
            
            // Skip if already sent
            if (status === 'Message Sent') {
                alreadySentCount++;
                continue;
            }
            
            if (businessName && phoneNumber && message) {
                leads.push({
                    businessName,
                    phoneNumber: this.formatPhoneNumber(phoneNumber),
                    message,
                    rowIndex: i
                });
            }
        }
        
        console.log(`📊 Found ${leads.length} leads ready to send`);
        console.log(`⏭️ Skipping ${alreadySentCount} leads that were already sent`);
        return leads;
    }

    formatPhoneNumber(phone) {
        let cleanPhone = phone.replace(/\D/g, '');
        
        if (cleanPhone.startsWith('52')) {
            return cleanPhone;
        } else if (cleanPhone.startsWith('998') || cleanPhone.startsWith('55')) {
            return '52' + cleanPhone;
        } else {
            return '52' + cleanPhone;
        }
    }

    async openWhatsAppWeb() {
        console.log('📱 Opening WhatsApp Web...');
        
        await this.page.goto('https://web.whatsapp.com/', { 
            waitUntil: 'domcontentloaded',
            timeout: 15000 
        });
        
        console.log('⏳ Waiting for WhatsApp Web to load (shorter timeout)...');
        
        try {
            // Try to find chat interface quickly
            await this.page.waitForSelector('div[data-testid="chat-list"], div[data-testid="chat"], div[title="Search or start new chat"]', { timeout: 10000 });
            console.log('✅ WhatsApp Web loaded successfully!');
            return true;
        } catch (error) {
            console.log('⏳ Still loading... trying alternative approach');
            
            // Try alternative selectors
            try {
                await this.page.waitForSelector('div[role="application"]', { timeout: 5000 });
                console.log('✅ WhatsApp Web interface found!');
                return true;
            } catch (error2) {
                console.log('❌ WhatsApp Web still loading. Please check if you need to scan QR code again.');
                return false;
            }
        }
    }

    async sendMessageToContact(lead) {
        try {
            console.log(`\n📱 Sending message to: ${lead.businessName} (${lead.phoneNumber})`);
            
            // Try to find new chat button
            const newChatSelectors = [
                'div[data-testid="chat"]',
                'div[title="Search or start new chat"]',
                'div[data-testid="search"]'
            ];
            
            let newChatButton = null;
            for (const selector of newChatSelectors) {
                newChatButton = await this.page.$(selector);
                if (newChatButton) break;
            }
            
            if (newChatButton) {
                await newChatButton.click();
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Search for contact
            const searchSelectors = [
                'div[data-testid="search"]',
                'input[data-testid="search"]',
                'div[title="Search or start new chat"]'
            ];
            
            let searchBox = null;
            for (const selector of searchSelectors) {
                searchBox = await this.page.$(selector);
                if (searchBox) break;
            }
            
            if (searchBox) {
                await searchBox.click();
                await new Promise(resolve => setTimeout(resolve, 500));
                await this.page.keyboard.type(lead.phoneNumber);
                await new Promise(resolve => setTimeout(resolve, 2000));
                await this.page.keyboard.press('Enter');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            // Find message input and send
            const messageSelectors = [
                'div[data-testid="conversation-compose-box-input"]',
                'div[contenteditable="true"]',
                'div[data-testid="message-input"]'
            ];
            
            let messageInput = null;
            for (const selector of messageSelectors) {
                messageInput = await this.page.$(selector);
                if (messageInput) break;
            }
            
            if (messageInput) {
                await messageInput.click();
                await new Promise(resolve => setTimeout(resolve, 500));
                await this.page.keyboard.type(lead.message);
                await new Promise(resolve => setTimeout(resolve, 1000));
                await this.page.keyboard.press('Enter');
                
                console.log(`✅ Message sent successfully to ${lead.businessName}`);
                await this.updateLeadStatus(lead.rowIndex, 'Message Sent');
                return true;
            } else {
                console.log(`❌ Could not find message input for ${lead.businessName}`);
                return false;
            }
            
        } catch (error) {
            console.log(`❌ Error sending to ${lead.businessName}: ${error.message}`);
            return false;
        }
    }

    async updateLeadStatus(rowIndex, status) {
        try {
            const messagesSheet = this.doc.sheetsByTitle['Copy Paste Messages'];
            await messagesSheet.loadCells();
            
            const rows = await messagesSheet.getRows();
            if (rows[rowIndex]) {
                rows[rowIndex].set('Status', status);
                rows[rowIndex].set('Sent Date', new Date().toISOString());
                await rows[rowIndex].save();
            }
        } catch (error) {
            console.log(`❌ Error updating status: ${error.message}`);
        }
    }

    async sendAllMessages() {
        console.log('🚀 Starting FAST WhatsApp message automation...');
        
        const leads = await this.getLeadsFromSheet();
        
        if (leads.length === 0) {
            console.log('❌ No leads found to send messages to');
            return;
        }
        
        console.log(`📊 Found ${leads.length} leads to process`);
        
        // Open WhatsApp Web with faster timeout
        const isLoggedIn = await this.openWhatsAppWeb();
        if (!isLoggedIn) {
            console.log('❌ Cannot proceed without WhatsApp Web login');
            console.log('💡 Try refreshing the page or scanning QR code again');
            return;
        }
        
        console.log('\n🎯 Starting to send messages...');
        console.log('⚠️  The agent will send messages with a 3-second delay between each');
        
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];
            
            console.log(`\n📊 Progress: ${i + 1}/${leads.length} - ${lead.businessName}`);
            
            try {
                const success = await this.sendMessageToContact(lead);
                
                if (success) {
                    successCount++;
                } else {
                    errorCount++;
                }
                
                // Shorter delay between messages
                if (i < leads.length - 1) {
                    console.log('⏳ Waiting 3 seconds before next message...');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
                
            } catch (error) {
                console.log(`❌ Error processing ${lead.businessName}: ${error.message}`);
                errorCount++;
            }
        }
        
        console.log('\n🎉 MESSAGE SENDING COMPLETE!');
        console.log(`✅ Successfully sent: ${successCount} messages`);
        console.log(`❌ Failed to send: ${errorCount} messages`);
        console.log(`📊 Total processed: ${leads.length} leads`);
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
        console.log('🔧 Fast WhatsApp Agent closed');
    }
}

// Main execution
async function main() {
    const agent = new FastWhatsAppAgent();
    
    try {
        await agent.initialize();
        await agent.sendAllMessages();
        
    } catch (error) {
        console.error('❌ Error during automation:', error);
    } finally {
        await agent.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = FastWhatsAppAgent;

