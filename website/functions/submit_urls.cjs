const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// NOTE: You must place your 'service_account.json' in the 'tools/' folder.
// Download it from: https://console.cloud.google.com/iam-admin/serviceaccounts
// NOTE: Key file located at root
const KEY_FILE = path.join(__dirname, '../jegodigital-e02fb-6bdcd05bee0e.json');

const submitUrl = async (url) => {
    if (!fs.existsSync(KEY_FILE)) {
        console.error('❌ ERROR: Missing service_account.json');
        console.log('👉 Please download your Service Account Key from Google Cloud Console and save it as tools/service_account.json');
        return;
    }

    const auth = new google.auth.GoogleAuth({
        keyFile: KEY_FILE,
        scopes: ['https://www.googleapis.com/auth/indexing'],
    });

    const indexing = google.indexing({ version: 'v3', auth });

    try {
        console.log(`🚀 Submitting URL: ${url}`);
        const result = await indexing.urlNotifications.publish({
            requestBody: {
                url: url,
                type: 'URL_UPDATED',
            },
        });
        console.log('✅ Success:', result.data);
    } catch (error) {
        console.error('❌ Failed to submit:', error.message);
    }
};

// Example Usage:
// node tools/submit_urls.js https://jegodigital.com/blog/ia-inmobiliaria-cancun.html
const args = process.argv.slice(2);
if (args.length > 0) {
    submitUrl(args[0]);
} else {
    console.log('Usage: node tools/submit_urls.js <URL>');
}
