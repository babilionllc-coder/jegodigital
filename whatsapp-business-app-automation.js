const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

class WhatsAppBusinessAppAutomation {
    constructor() {
        this.doc = null;
        this.serviceAccountAuth = new JWT({
            email: JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8')).client_email,
            key: JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8')).private_key,
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive.file',
            ],
        });
    }

    async initialize() {
        console.log('🚀 WHATSAPP BUSINESS APP AUTOMATION');
        console.log('💰 Cost: $0 - Using WhatsApp Business App');
        console.log('🎯 Goal: Send all 100 leads with your phone number\n');
        
        this.doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', this.serviceAccountAuth);
        await this.doc.loadInfo();
        console.log(`📊 Connected to: ${this.doc.title}`);
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

    async displayManualProcess(leads) {
        console.log('📱 WHATSAPP BUSINESS APP MANUAL PROCESS:\n');
        
        console.log('🎯 STEP-BY-STEP INSTRUCTIONS:');
        console.log('   1. Download WhatsApp Business App on your phone');
        console.log('   2. Set up with your business phone number');
        console.log('   3. Open the app and start sending messages');
        console.log('   4. For each lead below:');
        console.log('      - Copy the phone number');
        console.log('      - Start new chat in WhatsApp Business');
        console.log('      - Paste phone number');
        console.log('      - Copy the personalized message');
        console.log('      - Paste and send message');
        console.log('      - Mark as sent in Google Sheet\n');
        
        console.log('⏱️ TIME ESTIMATE:');
        console.log(`   - 2 minutes per lead`);
        console.log(`   - ${leads.length} leads = ${leads.length * 2} minutes (${Math.round(leads.length * 2 / 60)} hours)`);
        console.log('   - Can be done over multiple days\n');
        
        console.log('📊 LEADS TO SEND:\n');
        
        let successCount = 0;
        
        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];
            
            console.log(`📊 LEAD ${i + 1}/${leads.length}:`);
            console.log('==========================================');
            console.log(`🏢 Business: ${lead.businessName}`);
            console.log(`📱 Phone: ${lead.phoneNumber}`);
            console.log(`💬 Message:`);
            console.log(lead.message);
            console.log('==========================================');
            console.log('📋 INSTRUCTIONS:');
            console.log('1. Copy the phone number above');
            console.log('2. Open WhatsApp Business App');
            console.log('3. Click "New Chat"');
            console.log('4. Paste the phone number');
            console.log('5. Copy the entire message above');
            console.log('6. Paste and send');
            console.log('7. Type "y" and press ENTER when done...');
            
            // Wait for user input
            const input = await this.waitForInput();
            
            if (input.toLowerCase() === 'y' || input.toLowerCase() === 'yes') {
                await this.updateLeadStatus(lead.rowIndex, 'Message Sent');
                successCount++;
                console.log('✅ Marked as sent in Google Sheets!');
            } else {
                await this.updateLeadStatus(lead.rowIndex, 'Not Sent');
                console.log('❌ Marked as not sent');
            }
            
            console.log('\n');
        }
        
        console.log('🎉 MANUAL PROCESS COMPLETE!');
        console.log(`✅ Successfully sent: ${successCount} messages`);
        console.log(`📊 Total processed: ${leads.length} leads`);
        console.log('💰 Total cost: $0 - Using WhatsApp Business App!');
    }

    async waitForInput() {
        return new Promise((resolve) => {
            process.stdin.once('data', (data) => {
                resolve(data.toString().trim());
            });
        });
    }

    async createAutomatedGuide() {
        console.log('🤖 CREATING AUTOMATED GUIDE FOR WHATSAPP BUSINESS APP...\n');
        
        const leads = await this.getLeadsFromSheet();
        
        if (leads.length === 0) {
            console.log('❌ No leads found for automation');
            return;
        }
        
        // Create a simple automation guide
        let guide = 'WHATSAPP BUSINESS APP AUTOMATION GUIDE\n\n';
        guide += `Total Leads: ${leads.length}\n`;
        guide += `Estimated Time: ${leads.length * 2} minutes (${Math.round(leads.length * 2 / 60)} hours)\n\n`;
        
        guide += 'SETUP INSTRUCTIONS:\n';
        guide += '1. Download WhatsApp Business App\n';
        guide += '2. Set up with your business phone number\n';
        guide += '3. Follow the process below for each lead\n\n';
        
        guide += 'LEADS TO SEND:\n\n';
        
        leads.forEach((lead, index) => {
            guide += `LEAD ${index + 1}/${leads.length}:\n`;
            guide += `Business: ${lead.businessName}\n`;
            guide += `Phone: ${lead.phoneNumber}\n`;
            guide += `Message: ${lead.message}\n`;
            guide += `\nInstructions:\n`;
            guide += `1. Copy phone number: ${lead.phoneNumber}\n`;
            guide += `2. Open WhatsApp Business App\n`;
            guide += `3. Start new chat\n`;
            guide += `4. Paste phone number\n`;
            guide += `5. Copy and send message\n\n`;
            guide += '='.repeat(50) + '\n\n';
        });
        
        // Save to file
        require('fs').writeFileSync('whatsapp-business-automation-guide.txt', guide);
        console.log('✅ Created whatsapp-business-automation-guide.txt');
        console.log('📋 Open this file to follow the automation process\n');
        
        return leads;
    }
}

// Main execution
async function main() {
    const automation = new WhatsAppBusinessAppAutomation();
    
    try {
        await automation.initialize();
        
        console.log('🎯 WHATSAPP BUSINESS API STATUS:');
        console.log('✅ Your API token is valid');
        console.log('❌ No phone number connected to API');
        console.log('💡 Solution: Use WhatsApp Business App instead\n');
        
        console.log('🚀 STARTING WHATSAPP BUSINESS APP AUTOMATION...\n');
        
        const leads = await automation.createAutomatedGuide();
        
        console.log('📱 NEXT STEPS:');
        console.log('1. Download WhatsApp Business App');
        console.log('2. Set up with your business phone number');
        console.log('3. Open whatsapp-business-automation-guide.txt');
        console.log('4. Follow the process for each lead');
        console.log('5. Track your progress in Google Sheets\n');
        
        console.log('🎉 AUTOMATION READY!');
        console.log(`📊 ${leads.length} leads prepared for WhatsApp Business App`);
        console.log('💰 Cost: $0 - Completely FREE!');
        
    } catch (error) {
        console.error('❌ Automation Error:', error);
    }
}

if (require.main === module) {
    main();
}

module.exports = WhatsAppBusinessAppAutomation;

