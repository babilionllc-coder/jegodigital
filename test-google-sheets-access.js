// Simple test to verify Google Sheets access
const axios = require('axios');

async function testGoogleSheetsAccess() {
    console.log('🔍 Testing Google Sheets access...');
    
    const spreadsheetId = '1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg';
    const apiKey = 'AIzaSyA-1HU2daAhNIuVOdK6ZN_GOIW9YB1i7a4';
    
    // Try different sheet names
    const sheetNames = [
        'Top 200 Qualified Leads',
        'jegodigital-leads-template',
        'Sheet1',
        'Leads',
        'Qualified Leads'
    ];
    
    for (const sheetName of sheetNames) {
        try {
            console.log(`\n📊 Trying sheet: "${sheetName}"`);
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?key=${apiKey}`;
            const response = await axios.get(url);
            
            if (response.data.values && response.data.values.length > 0) {
                console.log(`✅ Found sheet "${sheetName}" with ${response.data.values.length} rows`);
                console.log(`📋 Headers: ${response.data.values[0].slice(0, 5).join(', ')}...`);
                console.log(`📊 Sample data: ${response.data.values[1]?.slice(0, 3).join(', ')}...`);
                return { success: true, sheetName, data: response.data.values };
            } else {
                console.log(`⚠️ Sheet "${sheetName}" exists but is empty`);
            }
        } catch (error) {
            console.log(`❌ Sheet "${sheetName}" not found or error: ${error.response?.status} ${error.response?.statusText}`);
        }
    }
    
    console.log('\n❌ No accessible sheets found');
    return { success: false };
}

testGoogleSheetsAccess().catch(console.error);


