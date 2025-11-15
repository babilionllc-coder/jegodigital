const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

// Load configurations
const googleConfig = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));

class LeadsDataChecker {
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
        console.log('🔧 Initializing Leads Data Checker...');
        
        this.doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', this.serviceAccountAuth);
        await this.doc.loadInfo();
        console.log(`📊 Connected to: ${this.doc.title}`);
    }

    async checkLeadsData() {
        console.log('📋 Checking leads data...');
        
        const leadsSheet = this.doc.sheetsByTitle['REAL Perfect Leads'];
        await leadsSheet.loadCells();
        
        const rows = await leadsSheet.getRows();
        
        console.log(`📊 Found ${rows.length} leads`);
        console.log('\n📋 First 10 leads data:');
        console.log('=' .repeat(80));
        
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
            const row = rows[i];
            
            console.log(`\nLead ${i + 1}:`);
            console.log(`  Business Name: ${row.get('Business Name')}`);
            console.log(`  Phone Number: ${row.get('Phone Number')}`);
            console.log(`  Location: ${row.get('Location')}`);
            console.log(`  Industry: ${row.get('Industry')}`);
            console.log(`  Website: ${row.get('Website')}`);
            
            // Check all available columns
            console.log('  Available columns:');
            const headerRow = leadsSheet.headerValues;
            headerRow.forEach((header, index) => {
                if (header) {
                    console.log(`    ${header}: ${row.get(header)}`);
                }
            });
            console.log('  ' + '-'.repeat(60));
        }
    }

    async checkAllSheets() {
        console.log('📋 Available sheets:');
        this.doc.sheetCount;
        this.doc.sheetsByIndex.forEach((sheet, index) => {
            console.log(`  ${index + 1}. ${sheet.title}`);
        });
    }
}

// Main execution
async function main() {
    const checker = new LeadsDataChecker();
    
    try {
        await checker.initialize();
        await checker.checkAllSheets();
        await checker.checkLeadsData();
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

if (require.main === module) {
    main();
}

module.exports = LeadsDataChecker;

