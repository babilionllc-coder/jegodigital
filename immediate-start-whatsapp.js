const puppeteer = require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

// Load configurations
const googleConfig = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));

class ImmediateStartWhatsApp {
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
        console.log('🚀 IMMEDIATE START: Bypassing all login detection...');
        
        this.doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', this.serviceAccountAuth);
        await this.doc.loadInfo();
        console.log(`📊 Connected to: ${this.doc.title}`);

        // Connect to existing browser or launch new one
        try {
            // Try to connect to existing browser first
            this.browser = await puppeteer.connect({
                browserURL: 'http://localhost:9222'
            });
            console.log('✅ Connected to existing browser');
        } catch (error) {
            // Launch new browser if connection fails
            this.browser = await puppeteer.launch({
                headless: false,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage'
                ]
            });
            console.log('✅ Launched new browser');
        }

        // Get existing pages or create new one
        const pages = await this.browser.pages();
        if (pages.length > 0) {
            this.page = pages[0];
            console.log('✅ Using existing WhatsApp Web page');
        } else {
            this.page = await this.browser.newPage();
            await this.page.goto('https://web.whatsapp.com/');
            console.log('✅ Opened WhatsApp Web');
        }

        await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    }

    async getLeadsFromSheet() {
        console.log('📋 Getting leads from Google Sheets...');
        
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

    async sendMessageToContact(lead) {
        try {
            console.log(`\n📱 SENDING TO: ${lead.businessName} (${lead.phoneNumber})`);
            
            // Wait a moment for page to be ready
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Try to find and click new chat button
            console.log('🔍 Looking for new chat button...');
            const newChatSelectors = [
                'div[data-testid="chat"]',
                'div[title="Search or start new chat"]',
                'div[aria-label="Search or start new chat"]',
                'button[aria-label="New chat"]',
                '[data-testid="compose-btn"]',
                'div[role="button"][aria-label*="chat"]'
            ];
            
            let newChatButton = null;
            for (const selector of newChatSelectors) {
                try {
                    newChatButton = await this.page.$(selector);
                    if (newChatButton) {
                        console.log(`✅ Found new chat button: ${selector}`);
                        break;
                    }
                } catch (e) {
                    // Continue to next selector
                }
            }
            
            if (newChatButton) {
                await newChatButton.click();
                await new Promise(resolve => setTimeout(resolve, 2000));
                console.log('✅ Clicked new chat button');
            }
            
            // Try to find search box
            console.log('🔍 Looking for search box...');
            const searchSelectors = [
                'div[data-testid="search"]',
                'input[data-testid="search"]',
                'div[title="Search or start new chat"]',
                'input[placeholder*="Search"]',
                'input[placeholder*="Buscar"]',
                'div[contenteditable="true"][data-testid="search"]'
            ];
            
            let searchBox = null;
            for (const selector of searchSelectors) {
                try {
                    searchBox = await this.page.$(selector);
                    if (searchBox) {
                        console.log(`✅ Found search box: ${selector}`);
                        break;
                    }
                } catch (e) {
                    // Continue to next selector
                }
            }
            
            if (searchBox) {
                await searchBox.click();
                await new Promise(resolve => setTimeout(resolve, 500));
                console.log(`📱 Typing phone: ${lead.phoneNumber}`);
                await this.page.keyboard.type(lead.phoneNumber);
                await new Promise(resolve => setTimeout(resolve, 2000));
                await this.page.keyboard.press('Enter');
                await new Promise(resolve => setTimeout(resolve, 3000));
                console.log('✅ Phone entered and contact selected');
            }
            
            // Try to find message input
            console.log('🔍 Looking for message input...');
            const messageSelectors = [
                'div[data-testid="conversation-compose-box-input"]',
                'div[contenteditable="true"]',
                'div[data-testid="message-input"]',
                'div[title="Type a message"]',
                'div[title="Escribe un mensaje"]',
                'div[contenteditable="true"][data-testid*="message"]'
            ];
            
            let messageInput = null;
            for (const selector of messageSelectors) {
                try {
                    messageInput = await this.page.$(selector);
                    if (messageInput) {
                        console.log(`✅ Found message input: ${selector}`);
                        break;
                    }
                } catch (e) {
                    // Continue to next selector
                }
            }
            
            if (messageInput) {
                await messageInput.click();
                await new Promise(resolve => setTimeout(resolve, 500));
                console.log('💬 Typing message...');
                await this.page.keyboard.type(lead.message);
                await new Promise(resolve => setTimeout(resolve, 2000));
                console.log('📤 Sending message...');
                await this.page.keyboard.press('Enter');
                
                console.log(`✅ MESSAGE SENT to ${lead.businessName}`);
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
                console.log(`📊 Updated Google Sheets: ${status}`);
            }
        } catch (error) {
            console.log(`❌ Error updating Google Sheets: ${error.message}`);
        }
    }

    async startImmediateAutomation() {
        console.log('🚀 STARTING IMMEDIATE AUTOMATION (NO LOGIN WAIT)...');
        
        const leads = await this.getLeadsFromSheet();
        
        if (leads.length === 0) {
            console.log('❌ No leads found to send messages to');
            return;
        }
        
        console.log(`📊 Found ${leads.length} leads to process`);
        console.log('\n🎯 STARTING IMMEDIATELY - NO LOGIN DETECTION');
        console.log('📱 Will automatically send messages to all leads');
        console.log('⚠️  3-second delay between each message');
        
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];
            
            console.log(`\n📊 PROGRESS: ${i + 1}/${leads.length} - ${lead.businessName}`);
            
            try {
                const success = await this.sendMessageToContact(lead);
                
                if (success) {
                    successCount++;
                    console.log(`✅ SUCCESS! (${successCount} total sent)`);
                } else {
                    errorCount++;
                    console.log(`❌ FAILED! (${errorCount} total failed)`);
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
        
        console.log('\n🎉 AUTOMATION COMPLETE!');
        console.log(`✅ Successfully sent: ${successCount} messages`);
        console.log(`❌ Failed to send: ${errorCount} messages`);
        console.log(`📊 Total processed: ${leads.length} leads`);
    }

    async close() {
        // Don't close browser, just disconnect
        console.log('🔧 Automation completed');
    }
}

// Main execution
async function main() {
    const automation = new ImmediateStartWhatsApp();
    
    try {
        await automation.initialize();
        await automation.startImmediateAutomation();
        
    } catch (error) {
        console.error('❌ Error during automation:', error);
    } finally {
        await automation.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = ImmediateStartWhatsApp;

