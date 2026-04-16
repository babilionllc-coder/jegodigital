const nodemailer = require('nodemailer');

// CREDENTIALS (Extracted)
const GMAIL_USER = 'creeksidemaile@gmail.com';
const GMAIL_PASS = 'mqrx hcqj slhq ypes';

// Transporter (Reusable)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: GMAIL_USER,
        pass: GMAIL_PASS
    }
});

/**
 * Send Live Email via Gmail
 * @param {string} to - Recipient email
 * @param {string} subject - Email Subject
 * @param {string} htmlBody - HTML Content
 */
async function sendEmail(to, subject, htmlBody) {
    try {
        const info = await transporter.sendMail({
            from: `"Jego Digital AI" <${GMAIL_USER}>`,
            to: to,
            subject: subject,
            html: htmlBody
        });
        console.log("✅ Email Sent:", info.messageId);
        return { success: true, id: info.messageId };
    } catch (error) {
        console.error("❌ Email Failed:", error);
        throw error;
    }
}

module.exports = { sendEmail };
