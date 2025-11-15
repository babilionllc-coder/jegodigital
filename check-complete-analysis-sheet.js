const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

// Load configurations
const googleConfig = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));

class CompleteAnalysisChecker {
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
        console.log('🔧 Initializing Complete Analysis Sheet Checker...');
        
        this.doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', this.serviceAccountAuth);
        await this.doc.loadInfo();
        console.log(`📊 Connected to: ${this.doc.title}`);
    }

    async checkCompleteAnalysisSheet() {
        console.log('📋 Checking Complete Real Analysis sheet...');
        
        const analysisSheet = this.doc.sheetsByTitle['Complete Real Analysis'];
        await analysisSheet.loadCells();
        
        const rows = await analysisSheet.getRows();
        console.log(`📊 Found ${rows.length} leads in Complete Real Analysis sheet`);
        
        if (rows.length > 0) {
            console.log('\n📋 First 5 leads from Complete Real Analysis:');
            console.log('=' .repeat(80));
            
            for (let i = 0; i < Math.min(rows.length, 5); i++) {
                const row = rows[i];
                
                console.log(`\nLead ${i + 1}:`);
                console.log(`  Business Name: ${row.get('Business Name')}`);
                console.log(`  Phone Number: ${row.get('Phone Number')}`);
                console.log(`  Location: ${row.get('Location')}`);
                console.log(`  Industry: ${row.get('Industry')}`);
                console.log(`  Has Website: ${row.get('Has Website')}`);
                console.log(`  Google Maps Listed: ${row.get('Google Maps Listed')}`);
                console.log(`  Status: ${row.get('Status')}`);
                console.log(`  Message Length: ${(row.get('AI Personalized Message') || '').length} characters`);
                console.log('  ' + '-'.repeat(60));
            }
        } else {
            console.log('❌ No leads found in Complete Real Analysis sheet');
        }
    }

    async checkCopyPasteSheet() {
        console.log('\n📋 Checking Copy Paste Messages sheet...');
        
        const messagesSheet = this.doc.sheetsByTitle['Copy Paste Messages'];
        await messagesSheet.loadCells();
        
        const rows = await messagesSheet.getRows();
        console.log(`📊 Found ${rows.length} leads in Copy Paste Messages sheet`);
        
        if (rows.length > 0) {
            console.log('\n📋 First 3 messages from Copy Paste Messages:');
            console.log('=' .repeat(80));
            
            for (let i = 0; i < Math.min(rows.length, 3); i++) {
                const row = rows[i];
                
                console.log(`\nMessage ${i + 1}:`);
                console.log(`  Business Name: ${row.get('Business Name')}`);
                console.log(`  Phone Number: ${row.get('Phone Number')}`);
                console.log(`  Business Type: ${row.get('Business Type')}`);
                console.log(`  Message Preview: ${(row.get('Message to Send') || '').substring(0, 100)}...`);
                console.log('  ' + '-'.repeat(60));
            }
        } else {
            console.log('❌ No messages found in Copy Paste Messages sheet');
        }
    }
}

// Main execution
async function main() {
    const checker = new CompleteAnalysisChecker();
    
    try {
        await checker.initialize();
        await checker.checkCompleteAnalysisSheet();
        await checker.checkCopyPasteSheet();
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

if (require.main === module) {
    main();
}

module.exports = CompleteAnalysisChecker;

