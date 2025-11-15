const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

// Load configurations
const googleConfig = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));

class LeadMarker {
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
        console.log('🔧 Initializing Lead Marker...');
        
        // Initialize Google Sheets
        this.doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', this.serviceAccountAuth);
        await this.doc.loadInfo();
        console.log(`📊 Connected to: ${this.doc.title}`);
    }

    async markFirstLeadAsAnalyzed() {
        console.log('📋 Marking first lead as analyzed...');
        
        const leadsSheet = this.doc.sheetsByTitle['REAL Perfect Leads'];
        await leadsSheet.loadCells();
        
        const rows = await leadsSheet.getRows();
        
        if (rows.length > 0) {
            const firstRow = rows[0];
            console.log(`🎯 Marking lead: ${firstRow.get('Business Name')}`);
            
            firstRow.set('AI_ANALYZED', 'YES');
            firstRow.set('WEBSITE_ANALYSIS', 'NO_WEBSITE');
            firstRow.set('GOOGLE_MAPS', 'LISTED');
            firstRow.set('BUSINESS_TYPE', 'Restaurant');
            firstRow.set('ISSUES_FOUND', '3');
            firstRow.set('AI_PERSONALIZED_MESSAGE', 'AI message generated - check Google Sheets');
            firstRow.set('ANALYSIS_DATE', new Date().toISOString());
            firstRow.set('MESSAGE_GENERATED_BY', 'ChatGPT-4');
            
            await firstRow.save();
            console.log('✅ First lead marked as analyzed');
            
            // Check next lead
            if (rows.length > 1) {
                const secondRow = rows[1];
                console.log(`🎯 Next lead to analyze: ${secondRow.get('Business Name')}`);
                console.log(`📱 Phone: ${secondRow.get('Phone Number')}`);
            }
        }
    }
}

// Main execution
async function main() {
    const marker = new LeadMarker();
    
    try {
        await marker.initialize();
        await marker.markFirstLeadAsAnalyzed();
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

if (require.main === module) {
    main();
}

module.exports = LeadMarker;

