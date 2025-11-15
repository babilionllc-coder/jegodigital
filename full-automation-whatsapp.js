const puppeteer = require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

// Load configurations
const googleConfig = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));

class FullAutomationWhatsApp {
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
        console.log('🚀 FULL AUTOMATION: Opening WhatsApp Web...');
        
        this.doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', this.serviceAccountAuth);
        await this.doc.loadInfo();
        console.log(`📊 Connected to: ${this.doc.title}`);

        // Launch browser
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

    async waitForLogin() {
        console.log('⏳ Waiting for WhatsApp Web to load...');
        console.log('📱 If you see a QR code, please scan it with your phone');
        
        try {
            // Wait for successful login - try multiple selectors
            await this.page.waitForSelector('div[data-testid="chat-list"], div[data-testid="chat"], div[title="Search or start new chat"], div[role="application"]', { timeout: 120000 });
            console.log('✅ WhatsApp Web logged in successfully!');
            return true;
        } catch (error) {
            console.log('❌ WhatsApp Web login failed or timed out');
            return false;
        }
    }

    async sendMessageToContact(lead) {
        try {
            console.log(`\n📱 AUTOMATING: ${lead.businessName} (${lead.phoneNumber})`);
            
            // Step 1: Click on new chat button
            console.log('🔍 Looking for new chat button...');
            const newChatSelectors = [
                'div[data-testid="chat"]',
                'div[title="Search or start new chat"]',
                'div[aria-label="Search or start new chat"]',
                'button[aria-label="New chat"]',
                '[data-testid="compose-btn"]'
            ];
            
            let newChatButton = null;
            for (const selector of newChatSelectors) {
                newChatButton = await this.page.$(selector);
                if (newChatButton) {
                    console.log(`✅ Found new chat button: ${selector}`);
                    break;
                }
            }
            
            if (newChatButton) {
                await newChatButton.click();
                await new Promise(resolve => setTimeout(resolve, 2000));
                console.log('✅ Clicked new chat button');
            }
            
            // Step 2: Search for phone number
            console.log('🔍 Looking for search box...');
            const searchSelectors = [
                'div[data-testid="search"]',
                'input[data-testid="search"]',
                'div[title="Search or start new chat"]',
                'input[placeholder*="Search"]',
                'input[placeholder*="Buscar"]'
            ];
            
            let searchBox = null;
            for (const selector of searchSelectors) {
                searchBox = await this.page.$(selector);
                if (searchBox) {
                    console.log(`✅ Found search box: ${selector}`);
                    break;
                }
            }
            
            if (searchBox) {
                await searchBox.click();
                await new Promise(resolve => setTimeout(resolve, 500));
                console.log(`📱 Typing phone number: ${lead.phoneNumber}`);
                await this.page.keyboard.type(lead.phoneNumber);
                await new Promise(resolve => setTimeout(resolve, 2000));
                await this.page.keyboard.press('Enter');
                await new Promise(resolve => setTimeout(resolve, 3000));
                console.log('✅ Phone number entered and contact selected');
            }
            
            // Step 3: Find message input and send message
            console.log('🔍 Looking for message input...');
            const messageSelectors = [
                'div[data-testid="conversation-compose-box-input"]',
                'div[contenteditable="true"]',
                'div[data-testid="message-input"]',
                'div[title="Type a message"]',
                'div[title="Escribe un mensaje"]'
            ];
            
            let messageInput = null;
            for (const selector of messageSelectors) {
                messageInput = await this.page.$(selector);
                if (messageInput) {
                    console.log(`✅ Found message input: ${selector}`);
                    break;
                }
            }
            
            if (messageInput) {
                await messageInput.click();
                await new Promise(resolve => setTimeout(resolve, 500));
                console.log('💬 Typing personalized message...');
                await this.page.keyboard.type(lead.message);
                await new Promise(resolve => setTimeout(resolve, 2000));
                console.log('📤 Sending message...');
                await this.page.keyboard.press('Enter');
                
                console.log(`✅ MESSAGE SENT SUCCESSFULLY to ${lead.businessName}`);
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
                console.log(`📊 Updated Google Sheets: Row ${rowIndex} = ${status}`);
            }
        } catch (error) {
            console.log(`❌ Error updating Google Sheets: ${error.message}`);
        }
    }

    async runFullAutomation() {
        console.log('🚀 STARTING FULL WHATSAPP AUTOMATION...');
        
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
        
        console.log('\n🎯 FULL AUTOMATION STARTING...');
        console.log('📱 Will automatically:');
        console.log('   1. Add phone numbers to WhatsApp');
        console.log('   2. Send personalized messages');
        console.log('   3. Update Google Sheets status');
        console.log('   4. Move to next lead');
        console.log('⚠️  5-second delay between each message');
        
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
                    console.log('⏳ Waiting 5 seconds before next message...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
                
            } catch (error) {
                console.log(`❌ Error processing ${lead.businessName}: ${error.message}`);
                errorCount++;
            }
        }
        
        console.log('\n🎉 FULL AUTOMATION COMPLETE!');
        console.log(`✅ Successfully sent: ${successCount} messages`);
        console.log(`❌ Failed to send: ${errorCount} messages`);
        console.log(`📊 Total processed: ${leads.length} leads`);
        console.log('📋 Check your Google Sheets for updated status');
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
        console.log('🔧 Full automation closed');
    }
}

// Main execution
async function main() {
    const automation = new FullAutomationWhatsApp();
    
    try {
        await automation.initialize();
        await automation.runFullAutomation();
        
    } catch (error) {
        console.error('❌ Error during full automation:', error);
    } finally {
        await automation.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = FullAutomationWhatsApp;

