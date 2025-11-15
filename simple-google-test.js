// Simple Google Sheets Test
console.log('🚀 Starting simple Google Sheets test...');

try {
    const { GoogleSpreadsheet } = require('google-spreadsheet');
    const { JWT } = require('google-auth-library');
    const fs = require('fs');
    
    console.log('✅ Dependencies loaded successfully');
    
    // Load credentials
    const credentials = JSON.parse(fs.readFileSync('./google-service-account-config.json', 'utf8'));
    console.log('✅ Credentials loaded');
    
    // Create auth
    const auth = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    
    console.log('✅ Auth created');
    
    // Connect to spreadsheet
    const doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', auth);
    console.log('✅ Spreadsheet object created');
    
    // Load info
    await doc.loadInfo();
    console.log(`✅ Connected to: ${doc.title}`);
    
    // List sheets
    console.log('📋 Available sheets:');
    doc.sheetsByIndex.forEach((sheet, index) => {
        console.log(`  ${index + 1}. ${sheet.title}`);
    });
    
    console.log('🎉 Test completed successfully!');
    
} catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
}


