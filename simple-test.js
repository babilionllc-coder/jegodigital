console.log('🚀 Starting simple test...');

try {
    const axios = require('axios');
    console.log('✅ Axios loaded successfully');
    
    // Test basic axios functionality
    axios.get('https://httpbin.org/get')
        .then(response => {
            console.log('✅ Axios working correctly');
            console.log('📊 Response status:', response.status);
        })
        .catch(error => {
            console.log('❌ Axios error:', error.message);
        });
        
} catch (error) {
    console.log('❌ Error loading axios:', error.message);
}

console.log('🏁 Test completed');


