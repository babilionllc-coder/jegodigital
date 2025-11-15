const puppeteer = require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

class DirectWhatsAppAutomation {
    constructor() {
        this.doc = null;
        this.browser = null;
        this.page = null;
        this.serviceAccountAuth = new JWT({
            email: JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8')).client_email,
            key: JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8')).private_key,
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive.file',
            ],
        });
        this.isLoggedIn = false;
    }

    async initialize() {
        console.log('🚀 DIRECT WHATSAPP AUTOMATION');
        console.log('💰 Cost: $0 - Using your WhatsApp account directly');
        console.log('🎯 Goal: Send all 100 leads with your WhatsApp Web\n');
        
        this.doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', this.serviceAccountAuth);
        await this.doc.loadInfo();
        console.log(`📊 Connected to: ${this.doc.title}`);
    }

    async launchBrowser() {
        console.log('🌐 Launching browser for WhatsApp Web...\n');
        
        this.browser = await puppeteer.launch({
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        this.page = await this.browser.newPage();
        
        // Set user agent to avoid detection
        await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Set viewport
        await this.page.setViewport({ width: 1366, height: 768 });
        
        console.log('✅ Browser launched successfully');
    }

    async openWhatsAppWeb() {
        console.log('📱 Opening WhatsApp Web...\n');
        
        await this.page.goto('https://web.whatsapp.com/', { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });
        
        console.log('✅ WhatsApp Web opened');
        
        // Wait for QR code or login
        try {
            await this.page.waitForSelector('div[data-testid="qr-code"], div[data-testid="landing-main"], div[data-testid="chat-list"]', { timeout: 10000 });
            console.log('📱 WhatsApp Web loaded - ready for login');
        } catch (error) {
            console.log('⚠️ WhatsApp Web may need manual loading');
        }
    }

    async waitForLogin() {
        console.log('⏳ Waiting for WhatsApp login...\n');
        
        try {
            // Wait for chat list to appear (indicates successful login)
            await this.page.waitForSelector('div[data-testid="chat-list"]', { timeout: 120000 });
            console.log('✅ WhatsApp login successful!');
            this.isLoggedIn = true;
            return true;
        } catch (error) {
            console.log('❌ Login timeout - please scan QR code manually');
            console.log('📱 Instructions:');
            console.log('   1. Open WhatsApp on your phone');
            console.log('   2. Go to Settings > Linked Devices');
            console.log('   3. Tap "Link a Device"');
            console.log('   4. Scan the QR code on the screen');
            console.log('   5. Press ENTER when logged in...\n');
            
            // Wait for user to press ENTER
            await this.waitForEnter();
            
            // Check if login was successful
            try {
                await this.page.waitForSelector('div[data-testid="chat-list"]', { timeout: 10000 });
                console.log('✅ WhatsApp login successful!');
                this.isLoggedIn = true;
                return true;
            } catch (error) {
                console.log('❌ Still not logged in - please try again');
                return false;
            }
        }
    }

    async waitForEnter() {
        return new Promise((resolve) => {
            process.stdin.once('data', () => {
                resolve();
            });
        });
    }

    async findWhatsAppElements() {
        console.log('🔍 Finding WhatsApp elements...\n');
        
        const elements = await this.page.evaluate(() => {
            const results = {
                newChatButton: null,
                searchBox: null,
                messageInput: null,
                sendButton: null
            };
            
            // Find new chat button
            const newChatSelectors = [
                'div[data-testid="compose-btn"]',
                'div[aria-label="New chat"]',
                'div[title="New chat"]',
                'button[aria-label="New chat"]',
                'div[data-testid="chat"]'
            ];
            
            for (const selector of newChatSelectors) {
                const element = document.querySelector(selector);
                if (element && element.offsetParent !== null) {
                    results.newChatButton = selector;
                    break;
                }
            }
            
            // Find search box
            const searchSelectors = [
                'div[data-testid="search"]',
                'input[data-testid="search"]',
                'div[contenteditable="true"][data-testid="search"]',
                'div[title="Search or start new chat"]',
                'input[placeholder*="Search"]'
            ];
            
            for (const selector of searchSelectors) {
                const element = document.querySelector(selector);
                if (element && element.offsetParent !== null) {
                    results.searchBox = selector;
                    break;
                }
            }
            
            // Find message input
            const messageSelectors = [
                'div[data-testid="conversation-compose-box-input"]',
                'div[contenteditable="true"][data-testid="conversation-compose-box-input"]',
                'div[contenteditable="true"][title="Type a message"]',
                'div[contenteditable="true"][data-testid="message-input"]'
            ];
            
            for (const selector of messageSelectors) {
                const element = document.querySelector(selector);
                if (element && element.offsetParent !== null) {
                    results.messageInput = selector;
                    break;
                }
            }
            
            // Find send button
            const sendSelectors = [
                'button[data-testid="send"]',
                'span[data-testid="send"]',
                'div[data-testid="send"]',
                'button[aria-label="Send"]'
            ];
            
            for (const selector of sendSelectors) {
                const element = document.querySelector(selector);
                if (element && element.offsetParent !== null) {
                    results.sendButton = selector;
                    break;
                }
            }
            
            return results;
        });
        
        console.log('🎯 WhatsApp Elements Found:');
        console.log(`   📱 New Chat Button: ${elements.newChatButton || 'Not found'}`);
        console.log(`   🔍 Search Box: ${elements.searchBox || 'Not found'}`);
        console.log(`   💬 Message Input: ${elements.messageInput || 'Not found'}`);
        console.log(`   📤 Send Button: ${elements.sendButton || 'Not found'}\n`);
        
        return elements;
    }

    async sendMessage(phoneNumber, message) {
        console.log(`📤 Sending message to ${phoneNumber}...\n`);
        
        try {
            // Step 1: Click new chat button
            console.log('1️⃣ Clicking new chat button...');
            const newChatButton = await this.page.$('div[data-testid="compose-btn"], div[aria-label="New chat"], div[title="New chat"]');
            if (newChatButton) {
                await newChatButton.click();
                await new Promise(resolve => setTimeout(resolve, 2000));
                console.log('✅ New chat button clicked');
            } else {
                console.log('⚠️ New chat button not found, trying alternative...');
                await this.page.keyboard.press('Control+Shift+N');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            // Step 2: Type phone number in search
            console.log('2️⃣ Typing phone number...');
            const searchBox = await this.page.$('div[data-testid="search"], input[data-testid="search"], div[contenteditable="true"][data-testid="search"]');
            if (searchBox) {
                await searchBox.click();
                await new Promise(resolve => setTimeout(resolve, 500));
                await this.page.keyboard.type(phoneNumber);
                await new Promise(resolve => setTimeout(resolve, 2000));
                await this.page.keyboard.press('Enter');
                await new Promise(resolve => setTimeout(resolve, 3000));
                console.log('✅ Phone number entered');
            } else {
                console.log('⚠️ Search box not found, trying alternative...');
                await this.page.keyboard.type(phoneNumber);
                await new Promise(resolve => setTimeout(resolve, 2000));
                await this.page.keyboard.press('Enter');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
            // Step 3: Type message
            console.log('3️⃣ Typing message...');
            const messageInput = await this.page.$('div[data-testid="conversation-compose-box-input"], div[contenteditable="true"][data-testid="conversation-compose-box-input"]');
            if (messageInput) {
                await messageInput.click();
                await new Promise(resolve => setTimeout(resolve, 500));
                await this.page.keyboard.type(message);
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log('✅ Message typed');
            } else {
                console.log('⚠️ Message input not found, trying alternative...');
                await this.page.keyboard.type(message);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Step 4: Send message
            console.log('4️⃣ Sending message...');
            const sendButton = await this.page.$('button[data-testid="send"], span[data-testid="send"], div[data-testid="send"]');
            if (sendButton) {
                await sendButton.click();
                console.log('✅ Message sent via send button');
            } else {
                await this.page.keyboard.press('Enter');
                console.log('✅ Message sent via Enter key');
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log(`✅ Message sent successfully to ${phoneNumber}\n`);
            
            return true;
            
        } catch (error) {
            console.error(`❌ Failed to send message to ${phoneNumber}: ${error.message}\n`);
            return false;
        }
    }

    async getLeadsFromSheet() {
        console.log('📋 Getting leads from Google Sheets...\n');
        
        const messagesSheet = this.doc.sheetsByTitle['Copy Paste Messages'];
        await messagesSheet.loadCells();
        
        const rows = await messagesSheet.getRows();
        const leads = [];
        
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const businessName = row.get('Business Name');
            const phoneNumber = row.get('Phone Number');
            const message = row.get('Message to Send');
            const status = row.get('Status');
            
            if (businessName && phoneNumber && message && status !== 'Message Sent') {
                leads.push({
                    businessName,
                    phoneNumber: this.formatPhoneNumber(phoneNumber),
                    message,
                    rowIndex: i + 2
                });
            }
        }
        
        console.log(`📊 Found ${leads.length} leads ready to send\n`);
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

    async updateLeadStatus(rowIndex, status) {
        try {
            const messagesSheet = this.doc.sheetsByTitle['Copy Paste Messages'];
            await messagesSheet.loadCells();
            
            const rows = await messagesSheet.getRows();
            if (rows[rowIndex - 2]) {
                rows[rowIndex - 2].set('Status', status);
                rows[rowIndex - 2].set('Sent Date', new Date().toISOString());
                await rows[rowIndex - 2].save();
                console.log(`📊 Updated Google Sheets: ${status}`);
            }
        } catch (error) {
            console.log(`❌ Error updating Google Sheets: ${error.message}`);
        }
    }

    async runAutomation() {
        console.log('🤖 STARTING DIRECT WHATSAPP AUTOMATION...\n');
        
        // Launch browser and open WhatsApp Web
        await this.launchBrowser();
        await this.openWhatsAppWeb();
        
        // Wait for login
        const loginSuccess = await this.waitForLogin();
        if (!loginSuccess) {
            console.log('❌ Cannot proceed without login');
            await this.browser.close();
            return;
        }
        
        // Find WhatsApp elements
        await this.findWhatsAppElements();
        
        // Get leads from sheet
        const leads = await this.getLeadsFromSheet();
        
        if (leads.length === 0) {
            console.log('❌ No leads found for automation');
            await this.browser.close();
            return;
        }
        
        console.log(`🎯 Starting automation with ${leads.length} leads...\n`);
        console.log('⚠️ Adding 5-second delay between messages to avoid rate limits\n');
        
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];
            
            console.log(`📊 PROGRESS: ${i + 1}/${leads.length} - ${lead.businessName}`);
            console.log(`📱 Phone: ${lead.phoneNumber}`);
            console.log(`💬 Message Preview: ${lead.message.substring(0, 80)}...`);
            
            const result = await this.sendMessage(lead.phoneNumber, lead.message);
            
            if (result) {
                successCount++;
                await this.updateLeadStatus(lead.rowIndex, 'Message Sent');
                console.log(`✅ SUCCESS! (${successCount} total sent)\n`);
            } else {
                errorCount++;
                await this.updateLeadStatus(lead.rowIndex, 'Failed to Send');
                console.log(`❌ FAILED! (${errorCount} total failed)\n`);
            }
            
            // Wait 5 seconds between messages
            if (i < leads.length - 1) {
                console.log('⏳ Waiting 5 seconds before next message...\n');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        
        console.log('🎉 DIRECT WHATSAPP AUTOMATION COMPLETE!');
        console.log(`✅ Successfully sent: ${successCount} messages`);
        console.log(`❌ Failed to send: ${errorCount} messages`);
        console.log(`📊 Total processed: ${leads.length} leads`);
        console.log('💰 Total cost: $0 - Using your WhatsApp account directly!');
        
        if (successCount > 0) {
            console.log('🎉 AUTOMATION SUCCESSFUL! Messages sent via WhatsApp Web!');
            console.log('📊 Check your Google Sheet for updated status');
        }
        
        await this.browser.close();
    }
}

// Main execution
async function main() {
    const automation = new DirectWhatsAppAutomation();
    
    try {
        await automation.initialize();
        await automation.runAutomation();
        
    } catch (error) {
        console.error('❌ Automation Error:', error);
    }
}

if (require.main === module) {
    main();
}

module.exports = DirectWhatsAppAutomation;

