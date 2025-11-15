const puppeteer = require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

// Load configurations
const googleConfig = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));

class WhatsAppAutomationAgent {
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
        this.processedLeads = [];
        this.currentLeadIndex = 0;
    }

    async initialize() {
        console.log('🚀 Initializing WhatsApp Automation Agent...');
        
        this.doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', this.serviceAccountAuth);
        await this.doc.loadInfo();
        console.log(`📊 Connected to: ${this.doc.title}`);

        // Launch browser with WhatsApp Web
        this.browser = await puppeteer.launch({
            headless: false,
            userDataDir: './whatsapp-profile', // Save login session
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu'
            ]
        });

        this.page = await this.browser.newPage();
        await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log('🌐 Browser launched with WhatsApp Web');
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
        // Remove all non-digits
        let cleanPhone = phone.replace(/\D/g, '');
        
        // Add Mexico country code if not present
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
            waitUntil: 'networkidle2',
            timeout: 30000 
        });
        
        // Wait for QR code or login
        console.log('⏳ Waiting for WhatsApp Web to load...');
        console.log('📱 Please scan the QR code with your phone to login to WhatsApp Web');
        
        // Wait for chat interface to load (indicates successful login)
        try {
            await this.page.waitForSelector('div[data-testid="chat-list"]', { timeout: 60000 });
            console.log('✅ Successfully logged into WhatsApp Web!');
            return true;
        } catch (error) {
            console.log('❌ Failed to login to WhatsApp Web. Please try again.');
            return false;
        }
    }

    async sendMessageToContact(lead) {
        try {
            console.log(`\n📱 Sending message to: ${lead.businessName} (${lead.phoneNumber})`);
            
            // Click on new chat button
            await this.page.click('div[data-testid="chat"]');
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Search for contact by phone number
            await this.page.click('div[data-testid="search"]');
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Type phone number
            await this.page.type('div[data-testid="search"]', lead.phoneNumber);
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Click on the contact if found, or create new chat
            try {
                // Look for existing chat or contact
                const contactElement = await this.page.$(`span[title="${lead.phoneNumber}"]`) || 
                                     await this.page.$(`span[title="+${lead.phoneNumber}"]`);
                
                if (contactElement) {
                    await contactElement.click();
                } else {
                    // Create new chat with phone number
                    await this.page.keyboard.press('Enter');
                }
                
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Type the message
                const messageInput = await this.page.$('div[data-testid="conversation-compose-box-input"]');
                if (messageInput) {
                    await messageInput.click();
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Type the message
                    await this.page.keyboard.type(lead.message);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Send the message
                    await this.page.keyboard.press('Enter');
                    
                    console.log(`✅ Message sent successfully to ${lead.businessName}`);
                    
                    // Update status in Google Sheet
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
            
        } catch (error) {
            console.log(`❌ Error with ${lead.businessName}: ${error.message}`);
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
                console.log(`📊 Updated status for row ${rowIndex}: ${status}`);
            }
        } catch (error) {
            console.log(`❌ Error updating status: ${error.message}`);
        }
    }

    async sendAllMessages() {
        console.log('🚀 Starting WhatsApp message automation...');
        
        const leads = await this.getLeadsFromSheet();
        
        if (leads.length === 0) {
            console.log('❌ No leads found to send messages to');
            return;
        }
        
        console.log(`📊 Found ${leads.length} leads to process`);
        
        // Open WhatsApp Web first
        const isLoggedIn = await this.openWhatsAppWeb();
        if (!isLoggedIn) {
            console.log('❌ Cannot proceed without WhatsApp Web login');
            return;
        }
        
        console.log('\n🎯 Starting to send messages...');
        console.log('⚠️  The agent will send messages with a 5-second delay between each');
        console.log('⚠️  You can stop anytime by pressing Ctrl+C');
        
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
                
                // Wait between messages to avoid being flagged as spam
                if (i < leads.length - 1) {
                    console.log('⏳ Waiting 5 seconds before next message...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
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
        console.log('🔧 WhatsApp Automation Agent closed');
    }
}

// Main execution
async function main() {
    const agent = new WhatsAppAutomationAgent();
    
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

module.exports = WhatsAppAutomationAgent;
