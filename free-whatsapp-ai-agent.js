const puppeteer = require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

// Load configurations
const googleConfig = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));

class FreeWhatsAppAIAgent {
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
        this.aiDetectedElements = {};
        this.messageQueue = [];
        this.isRunning = false;
    }

    async initialize() {
        console.log('🤖 FREE WHATSAPP AI AGENT INITIALIZING...');
        console.log('💰 Cost: $0 - Completely FREE solution');
        console.log('🎯 Goal: Automate all 100 leads without any paid tools');
        
        this.doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', this.serviceAccountAuth);
        await this.doc.loadInfo();
        console.log(`📊 Connected to: ${this.doc.title}`);
    }

    async aiDetectWhatsAppElements() {
        console.log('🧠 AI DETECTING WHATSAPP ELEMENTS...');
        
        // AI-powered element detection using multiple strategies
        const elements = await this.page.evaluate(() => {
            const results = {
                newChatButtons: [],
                searchBoxes: [],
                messageInputs: [],
                sendButtons: []
            };
            
            // Strategy 1: Find by text content
            const allElements = document.querySelectorAll('*');
            allElements.forEach((el, index) => {
                const text = el.textContent?.toLowerCase() || '';
                const tag = el.tagName.toLowerCase();
                const classes = el.className || '';
                
                // AI logic to identify new chat elements
                if ((text.includes('new') || text.includes('chat') || text.includes('message') || 
                     text.includes('start') || text.includes('compose')) && 
                    (tag === 'button' || tag === 'div' || tag === 'span') &&
                    el.offsetWidth > 10 && el.offsetHeight > 10) {
                    
                    results.newChatButtons.push({
                        selector: this.generateSelector(el),
                        text: el.textContent?.substring(0, 30),
                        tag: tag,
                        className: classes.substring(0, 50),
                        index: index
                    });
                }
                
                // AI logic to identify search elements
                if ((text.includes('search') || text.includes('buscar') || 
                     el.placeholder?.toLowerCase().includes('search') ||
                     el.placeholder?.toLowerCase().includes('buscar')) &&
                    (tag === 'input' || tag === 'div')) {
                    
                    results.searchBoxes.push({
                        selector: this.generateSelector(el),
                        placeholder: el.placeholder,
                        tag: tag,
                        className: classes.substring(0, 50),
                        index: index
                    });
                }
                
                // AI logic to identify message input elements
                if ((text.includes('message') || text.includes('mensaje') || 
                     text.includes('type') || text.includes('escribe') ||
                     el.placeholder?.toLowerCase().includes('message') ||
                     el.placeholder?.toLowerCase().includes('mensaje') ||
                     el.contentEditable === 'true') &&
                    (tag === 'input' || tag === 'div' || tag === 'textarea')) {
                    
                    results.messageInputs.push({
                        selector: this.generateSelector(el),
                        placeholder: el.placeholder,
                        contentEditable: el.contentEditable,
                        tag: tag,
                        className: classes.substring(0, 50),
                        index: index
                    });
                }
                
                // AI logic to identify send buttons
                if ((text.includes('send') || text.includes('enviar') || 
                     text.includes('arrow') || text.includes('→') ||
                     classes.includes('send')) &&
                    (tag === 'button' || tag === 'div') &&
                    el.offsetWidth > 20 && el.offsetHeight > 20) {
                    
                    results.sendButtons.push({
                        selector: this.generateSelector(el),
                        text: el.textContent?.substring(0, 30),
                        tag: tag,
                        className: classes.substring(0, 50),
                        index: index
                    });
                }
            });
            
            return results;
        });
        
        this.aiDetectedElements = elements;
        
        console.log('🎯 AI DETECTION RESULTS:');
        console.log(`📱 New Chat Buttons: ${elements.newChatButtons.length}`);
        console.log(`🔍 Search Boxes: ${elements.searchBoxes.length}`);
        console.log(`💬 Message Inputs: ${elements.messageInputs.length}`);
        console.log(`📤 Send Buttons: ${elements.sendButtons.length}`);
        
        // Show top candidates
        if (elements.newChatButtons.length > 0) {
            console.log(`✅ Best New Chat Button: ${elements.newChatButtons[0].selector} - "${elements.newChatButtons[0].text}"`);
        }
        if (elements.searchBoxes.length > 0) {
            console.log(`✅ Best Search Box: ${elements.searchBoxes[0].selector} - "${elements.searchBoxes[0].placeholder}"`);
        }
        if (elements.messageInputs.length > 0) {
            console.log(`✅ Best Message Input: ${elements.messageInputs[0].selector} - "${elements.messageInputs[0].placeholder}"`);
        }
        
        return elements;
    }

    async aiSendMessage(lead) {
        try {
            console.log(`\n🤖 AI SENDING TO: ${lead.businessName} (${lead.phoneNumber})`);
            
            // Step 1: AI finds and clicks new chat button
            console.log('🧠 AI finding new chat button...');
            let newChatClicked = false;
            
            for (const button of this.aiDetectedElements.newChatButtons) {
                try {
                    const element = await this.page.$(button.selector);
                    if (element) {
                        await element.click();
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        console.log(`✅ AI clicked new chat: ${button.selector}`);
                        newChatClicked = true;
                        break;
                    }
                } catch (e) {
                    // Try next button
                }
            }
            
            if (!newChatClicked) {
                console.log('⚠️ AI trying alternative new chat methods...');
                // Try clicking on any button with "new" or "chat" text
                await this.page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button, div'));
                    const chatButton = buttons.find(btn => 
                        btn.textContent?.toLowerCase().includes('new') ||
                        btn.textContent?.toLowerCase().includes('chat') ||
                        btn.textContent?.toLowerCase().includes('start')
                    );
                    if (chatButton) chatButton.click();
                });
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            // Step 2: AI finds and uses search box
            console.log('🧠 AI finding search box...');
            let searchUsed = false;
            
            for (const searchBox of this.aiDetectedElements.searchBoxes) {
                try {
                    const element = await this.page.$(searchBox.selector);
                    if (element) {
                        await element.click();
                        await new Promise(resolve => setTimeout(resolve, 500));
                        await this.page.keyboard.type(lead.phoneNumber);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        await this.page.keyboard.press('Enter');
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        console.log(`✅ AI used search: ${searchBox.selector}`);
                        searchUsed = true;
                        break;
                    }
                } catch (e) {
                    // Try next search box
                }
            }
            
            if (!searchUsed) {
                console.log('⚠️ AI trying alternative search methods...');
                // Try typing in any input field
                await this.page.keyboard.type(lead.phoneNumber);
                await this.page.keyboard.press('Enter');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
            // Step 3: AI finds and uses message input
            console.log('🧠 AI finding message input...');
            let messageSent = false;
            
            for (const messageInput of this.aiDetectedElements.messageInputs) {
                try {
                    const element = await this.page.$(messageInput.selector);
                    if (element) {
                        await element.click();
                        await new Promise(resolve => setTimeout(resolve, 500));
                        await this.page.keyboard.type(lead.message);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        await this.page.keyboard.press('Enter');
                        console.log(`✅ AI sent message: ${messageInput.selector}`);
                        messageSent = true;
                        break;
                    }
                } catch (e) {
                    // Try next message input
                }
            }
            
            if (!messageSent) {
                console.log('⚠️ AI trying alternative message methods...');
                // Try typing in any contenteditable or input
                await this.page.evaluate((message) => {
                    const inputs = Array.from(document.querySelectorAll('input, div[contenteditable="true"], textarea'));
                    const messageInput = inputs.find(input => 
                        input.placeholder?.toLowerCase().includes('message') ||
                        input.placeholder?.toLowerCase().includes('mensaje') ||
                        input.contentEditable === 'true'
                    );
                    if (messageInput) {
                        messageInput.focus();
                        messageInput.textContent = message;
                        messageInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }, lead.message);
                
                await new Promise(resolve => setTimeout(resolve, 1000));
                await this.page.keyboard.press('Enter');
            }
            
            if (messageSent) {
                console.log(`✅ AI SUCCESSFULLY SENT MESSAGE to ${lead.businessName}`);
                await this.updateLeadStatus(lead.rowIndex, 'Message Sent');
                return true;
            } else {
                console.log(`❌ AI could not send message to ${lead.businessName}`);
                return false;
            }
            
        } catch (error) {
            console.log(`❌ AI Error with ${lead.businessName}: ${error.message}`);
            return false;
        }
    }

    async getLeadsFromSheet() {
        console.log('📋 AI getting leads from Google Sheets...');
        
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
        
        console.log(`📊 AI found ${leads.length} leads ready to send`);
        console.log(`⏭️ AI skipping ${alreadySentCount} leads already sent`);
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
            if (rows[rowIndex]) {
                rows[rowIndex].set('Status', status);
                rows[rowIndex].set('Sent Date', new Date().toISOString());
                await rows[rowIndex].save();
                console.log(`📊 AI updated Google Sheets: ${status}`);
            }
        } catch (error) {
            console.log(`❌ AI error updating Google Sheets: ${error.message}`);
        }
    }

    async startFreeAutomation() {
        console.log('🚀 STARTING FREE WHATSAPP AI AUTOMATION...');
        
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
        console.log('📱 AI opening WhatsApp Web...');
        await this.page.goto('https://web.whatsapp.com/', { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });
        
        console.log('✅ WhatsApp Web opened');
        console.log('📱 Please scan QR code if needed...');
        
        // Wait for login
        try {
            await this.page.waitForSelector('div[role="application"], button, input', { timeout: 120000 });
            console.log('✅ WhatsApp Web logged in successfully!');
        } catch (error) {
            console.log('❌ WhatsApp Web login failed or timed out');
            return;
        }
        
        // AI detects WhatsApp elements
        await this.aiDetectWhatsAppElements();
        
        // Get leads
        const leads = await this.getLeadsFromSheet();
        
        if (leads.length === 0) {
            console.log('❌ No leads found to send messages to');
            return;
        }
        
        console.log('\n🤖 AI STARTING FREE AUTOMATION...');
        console.log('💰 Cost: $0 - Completely FREE');
        console.log('🎯 Will send messages to all leads automatically');
        console.log('⚠️  3-second delay between each message');
        
        this.isRunning = true;
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < leads.length && this.isRunning; i++) {
            const lead = leads[i];
            
            console.log(`\n📊 AI PROGRESS: ${i + 1}/${leads.length} - ${lead.businessName}`);
            
            try {
                const success = await this.aiSendMessage(lead);
                
                if (success) {
                    successCount++;
                    console.log(`✅ AI SUCCESS! (${successCount} total sent)`);
                } else {
                    errorCount++;
                    console.log(`❌ AI FAILED! (${errorCount} total failed)`);
                }
                
                // Wait between messages
                if (i < leads.length - 1) {
                    console.log('⏳ AI waiting 3 seconds before next message...');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
                
            } catch (error) {
                console.log(`❌ AI Error processing ${lead.businessName}: ${error.message}`);
                errorCount++;
            }
        }
        
        console.log('\n🎉 FREE AI AUTOMATION COMPLETE!');
        console.log(`✅ Successfully sent: ${successCount} messages`);
        console.log(`❌ Failed to send: ${errorCount} messages`);
        console.log(`📊 Total processed: ${leads.length} leads`);
        console.log('💰 Total cost: $0 - Completely FREE!');
        
        if (successCount > 0) {
            console.log('🎉 FREE AI AUTOMATION WORKING! Messages sent successfully!');
        } else {
            console.log('❌ AI needs more training - try running again');
        }
    }

    async close() {
        this.isRunning = false;
        if (this.browser) {
            await this.browser.close();
        }
        console.log('🔧 Free AI Agent closed');
    }
}

// Main execution
async function main() {
    const freeAI = new FreeWhatsAppAIAgent();
    
    try {
        await freeAI.initialize();
        await freeAI.startFreeAutomation();
        
    } catch (error) {
        console.error('❌ Free AI Agent Error:', error);
    } finally {
        await freeAI.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = FreeWhatsAppAIAgent;

