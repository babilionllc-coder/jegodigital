console.log('🚀 Testing Google Sheets connection...');

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

async function testConnection() {
    try {
        console.log('📋 Loading service account credentials...');
        
        // Load credentials from saved file
        const credentials = JSON.parse(fs.readFileSync('./google-service-account-config.json', 'utf8'));
        console.log('✅ Credentials loaded successfully');
        
        // Create auth object
        const auth = new JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive.file',
            ],
        });
        
        console.log('🔗 Connecting to Google Sheet...');
        const spreadsheetId = '1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg';
        const doc = new GoogleSpreadsheet(spreadsheetId, auth);
        
        await doc.loadInfo();
        console.log(`✅ Connected successfully to: ${doc.title}`);
        console.log(`📊 Available sheets: ${doc.sheetsByIndex.map(s => s.title).join(', ')}`);
        
        // Try to read from a sheet
        const sheet = doc.sheetsByIndex[0];
        await sheet.loadHeaderRow();
        const rows = await sheet.getRows();
        
        console.log(`📋 Found ${rows.length} rows in "${sheet.title}"`);
        console.log(`📝 Headers: ${sheet.headerValues.slice(0, 5).join(', ')}...`);
        
        if (rows.length > 0) {
            const firstRow = rows[0];
            console.log('📊 Sample data from first row:');
            sheet.headerValues.slice(0, 3).forEach(header => {
                console.log(`  ${header}: ${firstRow.get(header)}`);
            });
        }
        
        console.log('🎉 Connection test successful!');
        
    } catch (error) {
        console.error('❌ Connection test failed:', error.message);
        console.error('Full error:', error);
    }
}

testConnection();


