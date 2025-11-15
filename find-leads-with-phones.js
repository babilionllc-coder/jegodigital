const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

// Load configurations
const googleConfig = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));

class LeadsWithPhonesFinder {
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
        console.log('🔧 Initializing Leads with Phones Finder...');
        
        this.doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', this.serviceAccountAuth);
        await this.doc.loadInfo();
        console.log(`📊 Connected to: ${this.doc.title}`);
    }

    async findLeadsWithPhones() {
        console.log('📋 Finding leads with phone numbers...');
        
        const leadsSheet = this.doc.sheetsByTitle['REAL Perfect Leads'];
        await leadsSheet.loadCells();
        
        const rows = await leadsSheet.getRows();
        const leadsWithPhones = [];
        
        console.log(`📊 Checking ${rows.length} leads...`);
        
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const businessName = row.get('Business Name');
            const phoneNumber = row.get('Phone');
            const address = row.get('Address');
            const businessType = row.get('Business Type');
            const realScore = row.get('Real Score');
            const serviceNeeded = row.get('Service Needed');
            
            if (phoneNumber && phoneNumber.trim() !== '') {
                leadsWithPhones.push({
                    rank: row.get('Rank'),
                    businessName,
                    phoneNumber,
                    address,
                    businessType,
                    realScore,
                    serviceNeeded,
                    email: row.get('Email') || 'No email',
                    aiAnalyzed: row.get('AI_ANALYZED') || 'NO'
                });
                
                console.log(`✅ Lead ${leadsWithPhones.length}: ${businessName} - ${phoneNumber}`);
            }
        }
        
        console.log(`\n🎉 Found ${leadsWithPhones.length} leads with phone numbers!`);
        
        // Group by business type
        const businessTypes = {};
        leadsWithPhones.forEach(lead => {
            if (!businessTypes[lead.businessType]) {
                businessTypes[lead.businessType] = [];
            }
            businessTypes[lead.businessType].push(lead);
        });
        
        console.log('\n📊 Business Types Summary:');
        Object.keys(businessTypes).forEach(type => {
            console.log(`  ${type}: ${businessTypes[type].length} leads`);
        });
        
        // Save to file
        fs.writeFileSync('leads-with-phones.json', JSON.stringify(leadsWithPhones, null, 2));
        console.log('\n💾 Saved to leads-with-phones.json');
        
        return leadsWithPhones;
    }

    async createPhonesOnlySheet() {
        console.log('📋 Creating sheet with only leads that have phones...');
        
        const leadsWithPhones = JSON.parse(fs.readFileSync('leads-with-phones.json', 'utf8'));
        
        let phonesSheet;
        try {
            phonesSheet = this.doc.sheetsByTitle['Leads with Phones'];
            console.log('✅ Found existing Leads with Phones sheet');
        } catch (error) {
            console.log('📝 Creating new Leads with Phones sheet...');
            phonesSheet = await this.doc.addSheet({
                title: 'Leads with Phones'
            });
        }

        // Clear existing data
        await phonesSheet.clear();
        
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
            'Notes': `Teléfono disponible: ${lead.phoneNumber} | Tipo: ${lead.businessType} | Servicios: ${lead.serviceNeeded}`
        }));

        await phonesSheet.addRows(rowsToAdd);
        
        console.log(`🎉 Successfully created sheet with ${leadsWithPhones.length} leads that have phones!`);
        console.log('📊 Check the "Leads with Phones" sheet in your Google Sheets');
        
        return leadsWithPhones;
    }
}

// Main execution
async function main() {
    const finder = new LeadsWithPhonesFinder();
    
    try {
        await finder.initialize();
        const leadsWithPhones = await finder.findLeadsWithPhones();
        await finder.createPhonesOnlySheet();
        
        console.log('\n🎯 SUMMARY:');
        console.log(`✅ Found ${leadsWithPhones.length} leads with phone numbers`);
        console.log('📱 All phone numbers are ready for WhatsApp outreach');
        console.log('📊 Created dedicated sheet: "Leads with Phones"');
        console.log('💾 Backup saved to: leads-with-phones.json');
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

if (require.main === module) {
    main();
}

module.exports = LeadsWithPhonesFinder;

