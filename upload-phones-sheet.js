const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

// Load configurations
const googleConfig = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));

class PhonesSheetUploader {
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
        console.log('🔧 Initializing Phones Sheet Uploader...');
        
        this.doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', this.serviceAccountAuth);
        await this.doc.loadInfo();
        console.log(`📊 Connected to: ${this.doc.title}`);
    }

    async createPhonesSheet() {
        console.log('📋 Creating Leads with Phones sheet...');
        
        // Load the leads data
        const leadsWithPhones = JSON.parse(fs.readFileSync('leads-with-phones.json', 'utf8'));
        
        let phonesSheet;
        try {
            phonesSheet = this.doc.sheetsByTitle['Leads with Phones'];
            console.log('✅ Found existing Leads with Phones sheet');
            // Clear existing data
            await phonesSheet.clear();
        } catch (error) {
            console.log('📝 Creating new Leads with Phones sheet...');
            phonesSheet = await this.doc.addSheet({
                title: 'Leads with Phones'
            });
        }

        // Add headers
        await phonesSheet.setHeaderRow([
            'Rank',
            'Business Name',
            'Phone Number',
            'Address',
            'Business Type',
            'Real Score',
            'Service Needed',
            'Email',
            'AI Analyzed',
            'Status',
            'Notes'
        ]);

        // Add results
        const rowsToAdd = leadsWithPhones.map(lead => ({
            'Rank': lead.rank,
            'Business Name': lead.businessName,
            'Phone Number': lead.phoneNumber,
            'Address': lead.address,
            'Business Type': lead.businessType,
            'Real Score': lead.realScore,
            'Service Needed': lead.serviceNeeded,
            'Email': lead.email,
            'AI Analyzed': lead.aiAnalyzed,
            'Status': 'Ready for Contact',
            'Notes': `Teléfono: ${lead.phoneNumber} | Tipo: ${lead.businessType} | Servicios: ${lead.serviceNeeded}`
        }));

        await phonesSheet.addRows(rowsToAdd);
        
        console.log(`🎉 Successfully uploaded ${leadsWithPhones.length} leads with phones!`);
        console.log('📊 Check the "Leads with Phones" sheet in your Google Sheets');
        
        return leadsWithPhones.length;
    }
}

// Main execution
async function main() {
    const uploader = new PhonesSheetUploader();
    
    try {
        await uploader.initialize();
        const count = await uploader.createPhonesSheet();
        
        console.log('\n🎯 PHONES SUMMARY:');
        console.log(`✅ Found and uploaded ${count} leads with phone numbers`);
        console.log('📱 All phone numbers are ready for WhatsApp outreach');
        console.log('📊 Sheet created: "Leads with Phones"');
        console.log('🚀 Ready to start contacting leads!');
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

if (require.main === module) {
    main();
}

module.exports = PhonesSheetUploader;

