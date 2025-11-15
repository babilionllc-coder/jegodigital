const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

// Load configurations
const googleConfig = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));

class ManualWhatsAppOpener {
    constructor() {
        this.doc = null;
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
        console.log('🚀 Manual WhatsApp Opener - Opening WhatsApp Web for you...');
        
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

    async showInstructions(leads) {
        console.log('\n🎯 MANUAL WHATSAPP MESSAGE SENDING');
        console.log('=' .repeat(60));
        console.log(`📊 You have ${leads.length} leads ready to send messages to`);
        console.log('\n📱 INSTRUCTIONS:');
        console.log('1. Open WhatsApp Web in your browser: https://web.whatsapp.com/');
        console.log('2. Make sure you are logged in');
        console.log('3. I will show you each lead with their phone number and message');
        console.log('4. You can copy and paste the messages manually');
        console.log('\n🎯 Ready to start? Press ENTER to see the first lead...');
        
        // Wait for user input (simulated)
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        console.log('\n🚀 Starting manual message display...');
        
        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];
            
            console.log(`\n📊 LEAD ${i + 1}/${leads.length}`);
            console.log('=' .repeat(50));
            console.log(`🏢 Business: ${lead.businessName}`);
            console.log(`📱 Phone: ${lead.phoneNumber}`);
            console.log(`💬 Message:`);
            console.log('-' .repeat(40));
            console.log(lead.message);
            console.log('-' .repeat(40));
            
            console.log('\n📋 TO SEND THIS MESSAGE:');
            console.log('1. Click "New Chat" in WhatsApp Web');
            console.log(`2. Search for: ${lead.phoneNumber}`);
            console.log('3. Copy the message above');
            console.log('4. Paste and send');
            
            // Update status as "Ready to Send"
            await this.updateLeadStatus(lead.rowIndex, 'Ready to Send');
            
            console.log('\n⏳ Waiting 10 seconds before next lead...');
            console.log('(Press Ctrl+C to stop)');
            
            // Wait 10 seconds before next lead
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
        
        console.log('\n🎉 ALL LEADS DISPLAYED!');
        console.log('📊 Check your Google Sheets for updated status');
    }
}

// Main execution
async function main() {
    const opener = new ManualWhatsAppOpener();
    
    try {
        await opener.initialize();
        const leads = await opener.getLeadsFromSheet();
        
        if (leads.length === 0) {
            console.log('❌ No leads found to send messages to');
            return;
        }
        
        await opener.showInstructions(leads);
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

if (require.main === module) {
    main();
}

module.exports = ManualWhatsAppOpener;

