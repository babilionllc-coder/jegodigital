const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

// Load configurations
const googleConfig = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));

class MainSheetChecker {
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
        console.log('🔧 Initializing Main Sheet Checker...');
        
        this.doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', this.serviceAccountAuth);
        await this.doc.loadInfo();
        console.log(`📊 Connected to: ${this.doc.title}`);
    }

    async checkMainSheet() {
        console.log('📋 Checking main sheet with 2000+ leads...');
        
        // Check the main sheet with all leads
        const mainSheet = this.doc.sheetsByTitle['jegodigital-leads-template'];
        await mainSheet.loadCells();
        
        const rows = await mainSheet.getRows();
        console.log(`📊 Found ${rows.length} total leads in main sheet`);
        
        console.log('\n📋 First 10 leads from main sheet:');
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
            const headerRow = mainSheet.headerValues;
            headerRow.forEach((header, index) => {
                if (header) {
                    console.log(`    ${header}: ${row.get(header)}`);
                }
            });
            console.log('  ' + '-'.repeat(60));
        }

        // Count leads with phone numbers
        let leadsWithPhones = 0;
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const phoneNumber = row.get('Phone Number');
            if (phoneNumber && phoneNumber.trim() !== '') {
                leadsWithPhones++;
            }
        }

        console.log(`\n📊 SUMMARY:`);
        console.log(`Total leads: ${rows.length}`);
        console.log(`Leads with phone numbers: ${leadsWithPhones}`);
    }
}

// Main execution
async function main() {
    const checker = new MainSheetChecker();
    
    try {
        await checker.initialize();
        await checker.checkMainSheet();
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

if (require.main === module) {
    main();
}

module.exports = MainSheetChecker;

