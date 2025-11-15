// Simple test to scan your 200 leads
const axios = require('axios');

async function testScanLeads() {
    console.log('🤖 Testing Google Sheets connection...');
    
    try {
        const spreadsheetId = '1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg';
        const apiKey = 'AIzaSyA-1HU2daAhNIuVOdK6ZN_GOIW9YB1i7a4';
        
        // Try to access the main sheet first
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/jegodigital-leads-template?key=${apiKey}`;
        
        console.log('📊 Connecting to your Google Sheet...');
        const response = await axios.get(url);
        
        if (response.data.values && response.data.values.length > 1) {
            console.log('✅ Successfully connected to Google Sheet!');
            console.log(`📋 Found ${response.data.values.length - 1} rows of data`);
            console.log('📋 Headers:', response.data.values[0].slice(0, 5).join(', '));
            
            // Show first few businesses
            const businesses = response.data.values.slice(1, 6);
            console.log('\n🏢 Sample businesses from your sheet:');
            businesses.forEach((row, index) => {
                console.log(`${index + 1}. ${row[0] || 'Unknown'} - ${row[1] || 'No phone'}`);
            });
            
            return true;
        } else {
            console.log('❌ No data found in sheet');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        return false;
    }
}

// Run the test
testScanLeads().then(success => {
    if (success) {
        console.log('\n🎉 Ready to scan your 200 leads!');
        console.log('📱 Next step: Generate personalized messages');
    } else {
        console.log('\n❌ Connection failed');
    }
}).catch(console.error);


