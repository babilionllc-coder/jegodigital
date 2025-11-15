const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

class ConnectExistingWhatsApp {
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
        console.log('🚀 CONNECTING TO EXISTING WHATSAPP SESSION...');
        console.log('💰 Cost: $0 - Completely FREE');
        console.log('📱 Using your existing WhatsApp Web session');
        
        this.doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', this.serviceAccountAuth);
        await this.doc.loadInfo();
        console.log(`📊 Connected to: ${this.doc.title}`);
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
                    rowIndex: i + 2 // +2 because array is 0-indexed and we have header
                });
            }
        }
        
        console.log(`📊 Found ${leads.length} leads ready to send`);
        console.log(`⏭️ Skipping ${alreadySentCount} leads already sent`);
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
            if (rows[rowIndex - 2]) { // Adjust for 0-indexed array
                rows[rowIndex - 2].set('Status', status);
                rows[rowIndex - 2].set('Sent Date', new Date().toISOString());
                await rows[rowIndex - 2].save();
                console.log(`📊 Updated Google Sheets: ${status}`);
            }
        } catch (error) {
            console.log(`❌ Error updating Google Sheets: ${error.message}`);
        }
    }

    async displayLeadsForManualSending() {
        console.log('\n🎯 MANUAL WHATSAPP AUTOMATION GUIDE');
        console.log('📱 Since WhatsApp automation is having browser issues, here\'s how to send manually:');
        console.log('💰 Cost: $0 - Completely FREE');
        console.log('📋 All your leads are ready with personalized messages!\n');
        
        const leads = await this.getLeadsFromSheet();
        
        if (leads.length === 0) {
            console.log('❌ No leads found to send messages to');
            return;
        }

        console.log(`📊 You have ${leads.length} leads ready to send`);
        console.log('\n📱 MANUAL SENDING INSTRUCTIONS:');
        console.log('1. Open WhatsApp Web in your browser');
        console.log('2. For each lead below, copy the phone number');
        console.log('3. Start a new chat with that number');
        console.log('4. Copy and paste the personalized message');
        console.log('5. Send the message');
        console.log('6. Mark as sent in the Google Sheet\n');

        let successCount = 0;
        
        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];
            
            console.log(`\n📊 LEAD ${i + 1}/${leads.length}:`);
            console.log('==========================================');
            console.log(`🏢 Business: ${lead.businessName}`);
            console.log(`📱 Phone: ${lead.phoneNumber}`);
            console.log(`💬 Message:`);
            console.log(lead.message);
            console.log('==========================================');
            console.log('📋 INSTRUCTIONS:');
            console.log('1. Copy the phone number above');
            console.log('2. Open WhatsApp Web');
            console.log('3. Click "New Chat"');
            console.log('4. Paste the phone number');
            console.log('5. Copy the entire message above');
            console.log('6. Paste and send');
            console.log('7. Press ENTER to continue to next lead...');
            
            // Wait for user input
            await this.waitForEnter();
            
            // Ask if message was sent
            console.log('✅ Did you send the message? (y/n)');
            const sent = await this.waitForInput();
            
            if (sent.toLowerCase() === 'y' || sent.toLowerCase() === 'yes') {
                await this.updateLeadStatus(lead.rowIndex, 'Message Sent');
                successCount++;
                console.log('✅ Marked as sent in Google Sheets!');
            } else {
                await this.updateLeadStatus(lead.rowIndex, 'Not Sent');
                console.log('❌ Marked as not sent');
            }
        }

        console.log('\n🎉 MANUAL AUTOMATION COMPLETE!');
        console.log(`✅ Successfully sent: ${successCount} messages`);
        console.log(`📊 Total processed: ${leads.length} leads`);
        console.log('💰 Total cost: $0 - Completely FREE!');
        console.log('📊 Check your Google Sheet for updated status');
    }

    async waitForEnter() {
        return new Promise((resolve) => {
            process.stdin.once('data', () => {
                resolve();
            });
        });
    }

    async waitForInput() {
        return new Promise((resolve) => {
            process.stdin.once('data', (data) => {
                resolve(data.toString().trim());
            });
        });
    }
}

// Main execution
async function main() {
    const automation = new ConnectExistingWhatsApp();
    
    try {
        await automation.initialize();
        await automation.displayLeadsForManualSending();
        
    } catch (error) {
        console.error('❌ Automation Error:', error);
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

module.exports = ConnectExistingWhatsApp;