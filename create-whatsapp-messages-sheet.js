const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

// Load configurations
const googleConfig = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));

class WhatsAppMessagesSheet {
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
        console.log('🔧 Initializing WhatsApp Messages Sheet Creator...');
        
        this.doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', this.serviceAccountAuth);
        await this.doc.loadInfo();
        console.log(`📊 Connected to: ${this.doc.title}`);
    }

    async createWhatsAppMessagesSheet() {
        console.log('📱 Creating WhatsApp Messages sheet...');
        
        // Load the analyzed results
        if (!fs.existsSync('batch-analysis-results.json')) {
            console.log('❌ No analysis results found. Please run the analyzer first.');
            return;
        }

        const results = JSON.parse(fs.readFileSync('batch-analysis-results.json', 'utf8'));
        console.log(`📊 Found ${results.length} analyzed leads with messages`);

        let whatsappSheet;
        try {
            whatsappSheet = this.doc.sheetsByTitle['WhatsApp Messages'];
            console.log('✅ Found existing WhatsApp Messages sheet');
            // Clear existing data
            await whatsappSheet.clear();
        } catch (error) {
            console.log('📝 Creating new WhatsApp Messages sheet...');
            whatsappSheet = await this.doc.addSheet({
                title: 'WhatsApp Messages'
            });
        }

        // Add headers
        await whatsappSheet.setHeaderRow([
            'Business Name',
            'Phone Number',
            'Location',
            'Business Type',
            'WhatsApp Message',
            'Status',
            'Notes'
        ]);

        // Add results with messages
        const rowsToAdd = results.map(result => ({
            'Business Name': result.businessName || '',
            'Phone Number': result.phoneNumber || 'Not provided',
            'Location': result.location || '',
            'Business Type': result.websiteAnalysis?.businessType || result.industry || 'Unknown',
            'WhatsApp Message': result.personalizedMessage || '',
            'Status': 'Ready to Send',
            'Notes': `Analyzed: ${result.timestamp || new Date().toISOString()}`
        }));

        await whatsappSheet.addRows(rowsToAdd);
        
        console.log(`🎉 Successfully created WhatsApp Messages sheet with ${results.length} messages!`);
        console.log('📱 Check the "WhatsApp Messages" sheet - ready for copy-paste to WhatsApp!');
        
        return results.length;
    }

    async createSimpleMessagesSheet() {
        console.log('📱 Creating Simple Messages sheet for easy copy-paste...');
        
        // Load the analyzed results
        if (!fs.existsSync('batch-analysis-results.json')) {
            console.log('❌ No analysis results found.');
            return;
        }

        const results = JSON.parse(fs.readFileSync('batch-analysis-results.json', 'utf8'));

        let simpleSheet;
        try {
            simpleSheet = this.doc.sheetsByTitle['Copy Paste Messages'];
            console.log('✅ Found existing Copy Paste Messages sheet');
            await simpleSheet.clear();
        } catch (error) {
            console.log('📝 Creating new Copy Paste Messages sheet...');
            simpleSheet = await this.doc.addSheet({
                title: 'Copy Paste Messages'
            });
        }

        // Add headers
        await simpleSheet.setHeaderRow([
            'Business Name',
            'Phone Number',
            'Message to Send',
            'Business Type',
            'Location'
        ]);

        // Add results - each message ready for copy-paste
        const rowsToAdd = results.map(result => {
            const message = result.personalizedMessage || '';
            return {
                'Business Name': result.businessName || '',
                'Phone Number': result.phoneNumber || '',
                'Message to Send': message,
                'Business Type': result.websiteAnalysis?.businessType || result.industry || 'Unknown',
                'Location': result.location || ''
            };
        });

        await simpleSheet.addRows(rowsToAdd);
        
        console.log(`🎉 Created Copy Paste Messages sheet with ${results.length} ready-to-send messages!`);
        console.log('📱 Perfect for WhatsApp outreach - just copy and paste!');
        
        return results.length;
    }
}

// Main execution
async function main() {
    const creator = new WhatsAppMessagesSheet();
    
    try {
        await creator.initialize();
        await creator.createWhatsAppMessagesSheet();
        await creator.createSimpleMessagesSheet();
        
        console.log('\n🎯 WHATSAPP MESSAGES READY!');
        console.log('📊 Created 2 sheets:');
        console.log('   - "WhatsApp Messages" - Detailed view');
        console.log('   - "Copy Paste Messages" - Simple copy-paste');
        console.log('📱 All messages are in Spanish and ready for WhatsApp!');
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

if (require.main === module) {
    main();
}

module.exports = WhatsAppMessagesSheet;

