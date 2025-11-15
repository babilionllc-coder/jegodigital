const puppeteer = require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

// Load configurations
const googleConfig = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));

class ProperWhatsAppOpener {
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
        console.log('🚀 Opening WhatsApp Web properly...');
        
        this.doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', this.serviceAccountAuth);
        await this.doc.loadInfo();
        console.log(`📊 Connected to: ${this.doc.title}`);

        // Launch browser and navigate to WhatsApp Web
        this.browser = await puppeteer.launch({
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        });

        this.page = await this.browser.newPage();
        await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Navigate to WhatsApp Web
        console.log('📱 Opening WhatsApp Web...');
        await this.page.goto('https://web.whatsapp.com/', { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });
        
        console.log('✅ WhatsApp Web opened');
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

    async waitForLogin() {
        console.log('⏳ Waiting for WhatsApp Web to load...');
        console.log('📱 If you see a QR code, please scan it with your phone');
        console.log('⏳ Waiting up to 2 minutes for login...');
        
        try {
            // Wait for successful login
            await this.page.waitForSelector('div[data-testid="chat-list"], div[data-testid="chat"], div[title="Search or start new chat"]', { timeout: 120000 });
            console.log('✅ WhatsApp Web logged in successfully!');
            return true;
        } catch (error) {
            console.log('❌ WhatsApp Web login failed or timed out');
            console.log('💡 Please try scanning the QR code again');
            return false;
        }
    }

    async sendMessageToContact(lead) {
        try {
            console.log(`\n📱 Sending message to: ${lead.businessName} (${lead.phoneNumber})`);
            
            // Click on new chat button
            const newChatButton = await this.page.$('div[data-testid="chat"]') || 
                                 await this.page.$('div[title="Search or start new chat"]');
            
            if (newChatButton) {
                await newChatButton.click();
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log('✅ Clicked new chat button');
            }
            
            // Search for contact
            const searchBox = await this.page.$('div[data-testid="search"]') || 
                             await this.page.$('input[data-testid="search"]');
            
            if (searchBox) {
                await searchBox.click();
                await new Promise(resolve => setTimeout(resolve, 500));
                await this.page.keyboard.type(lead.phoneNumber);
                await new Promise(resolve => setTimeout(resolve, 2000));
                await this.page.keyboard.press('Enter');
                await new Promise(resolve => setTimeout(resolve, 2000));
                console.log('✅ Searched for contact');
            }
            
            // Find message input and send
            const messageInput = await this.page.$('div[data-testid="conversation-compose-box-input"]') ||
                                await this.page.$('div[contenteditable="true"]');
            
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

    async startSendingMessages() {
        console.log('🚀 Starting to send messages...');
        
        const leads = await this.getLeadsFromSheet();
        
        if (leads.length === 0) {
            console.log('❌ No leads found to send messages to');
            return;
        }
        
        console.log(`📊 Found ${leads.length} leads to process`);
        
        // Wait for login
        const isLoggedIn = await this.waitForLogin();
        if (!isLoggedIn) {
            console.log('❌ Cannot proceed without WhatsApp Web login');
            return;
        }
        
        console.log('\n🎯 Starting to send messages...');
        console.log('⚠️  Sending messages with 3-second delay between each');
        
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
                
                // Wait between messages
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
        console.log('🔧 WhatsApp automation closed');
    }
}

// Main execution
async function main() {
    const agent = new ProperWhatsAppOpener();
    
    try {
        await agent.initialize();
        await agent.startSendingMessages();
        
    } catch (error) {
        console.error('❌ Error during automation:', error);
    } finally {
        await agent.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = ProperWhatsAppOpener;

