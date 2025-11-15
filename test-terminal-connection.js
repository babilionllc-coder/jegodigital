// Test Terminal Connection and Google Sheets Access
console.log('🚀 TESTING TERMINAL CONNECTION...');
console.log('===================================');

// Test 1: Basic Node.js functionality
console.log('✅ Node.js is working');
console.log('✅ Script is running');

// Test 2: Check if we can load dependencies
try {
    const { GoogleSpreadsheet } = require('google-spreadsheet');
    const { JWT } = require('google-auth-library');
    console.log('✅ Google Sheets dependencies loaded');
} catch (error) {
    console.log('❌ Error loading dependencies:', error.message);
    process.exit(1);
}

// Test 3: Check if credentials file exists
const fs = require('fs');
try {
    const credentials = JSON.parse(fs.readFileSync('./google-service-account-config.json', 'utf8'));
    console.log('✅ Service account credentials loaded');
    console.log(`   Email: ${credentials.client_email}`);
} catch (error) {
    console.log('❌ Error loading credentials:', error.message);
    process.exit(1);
}

// Test 4: Try to connect to Google Sheets
async function testGoogleSheetsConnection() {
    try {
        console.log('🔗 Testing Google Sheets connection...');
        
        const { GoogleSpreadsheet } = require('google-spreadsheet');
        const { JWT } = require('google-auth-library');
        const fs = require('fs');
        
        const credentials = JSON.parse(fs.readFileSync('./google-service-account-config.json', 'utf8'));
        
        const auth = new JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive.file'
            ]
        });
        
        const doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', auth);
        await doc.loadInfo();
        
        console.log('✅ Successfully connected to Google Sheets!');
        console.log(`   Sheet title: ${doc.title}`);
        console.log(`   Available sheets: ${doc.sheetsByIndex.map(s => s.title).join(', ')}`);
        
        // Try to read from the first sheet
        const sheet = doc.sheetsByIndex[0];
        await sheet.loadHeaderRow();
        const rows = await sheet.getRows();
        
        console.log(`✅ Successfully read data from sheet!`);
        console.log(`   Sheet name: ${sheet.title}`);
        console.log(`   Headers: ${sheet.headerValues.slice(0, 5).join(', ')}...`);
        console.log(`   Total rows: ${rows.length}`);
        
        if (rows.length > 0) {
            const firstRow = rows[0];
            console.log('   First row sample data:');
            sheet.headerValues.slice(0, 3).forEach(header => {
                console.log(`     ${header}: ${firstRow.get(header)}`);
            });
        }
        
        console.log('\n🎉 ALL TESTS PASSED!');
        console.log('===================');
        console.log('✅ Terminal connection: WORKING');
        console.log('✅ Node.js: WORKING');
        console.log('✅ Dependencies: WORKING');
        console.log('✅ Google Sheets: WORKING');
        console.log('✅ Data access: WORKING');
        
        console.log('\n🚀 READY TO RUN REAL AI ANALYSIS!');
        console.log('The system is fully functional and ready to analyze your leads.');
        
    } catch (error) {
        console.log('❌ Google Sheets connection failed:', error.message);
        console.log('Full error:', error);
    }
}

// Run the test
testGoogleSheetsConnection().catch(console.error);


