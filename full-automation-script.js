// Full Automation Script - I Do Everything
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const puppeteer = require('puppeteer');
const fs = require('fs');

class FullAutomation {
    constructor() {
        this.spreadsheetId = '1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg';
        this.credentials = JSON.parse(fs.writeFileSync('./google-service-account-config.json', 'utf8'));
        this.resultsFile = 'automation-results.json';
        this.statusFile = 'automation-status.txt';
    }
    
    async execute() {
        try {
            // Write status
            fs.writeFileSync(this.statusFile, 'STARTING FULL AUTOMATION...');
            
            // Connect to Google Sheets
            fs.appendFileSync(this.statusFile, '\nConnecting to Google Sheets...');
            
            const auth = new JWT({
                email: this.credentials.client_email,
                key: this.credentials.private_key,
                scopes: [
                    'https://www.googleapis.com/auth/spreadsheets',
                    'https://www.googleapis.com/auth/drive.file'
                ]
            });
            
            const doc = new GoogleSpreadsheet(this.spreadsheetId, auth);
            await doc.loadInfo();
            
            fs.appendFileSync(this.statusFile, `\nConnected to: ${doc.title}`);
            
            // Get leads
            const sheet = doc.sheetsByIndex[0];
            await sheet.loadHeaderRow();
            const rows = await sheet.getRows();
            
            fs.appendFileSync(this.statusFile, `\nFound ${rows.length} leads`);
            
            // Analyze first 5 leads
            const leadsToAnalyze = rows.slice(0, 5);
            const results = [];
            
            for (const [index, lead] of leadsToAnalyze.entries()) {
                fs.appendFileSync(this.statusFile, `\nAnalyzing lead ${index + 1}: ${lead.get('Business Name') || 'Unknown'}`);
                
                const leadData = {};
                sheet.headerValues.forEach(header => {
                    leadData[header.toLowerCase().replace(/[^a-z0-9]/g, '_')] = lead.get(header) || '';
                });
                
                // Analyze website
                let websiteAnalysis = { exists: false };
                if (leadData.website || leadData.current_website) {
                    websiteAnalysis = await this.analyzeWebsite(leadData.website || leadData.current_website);
                }
                
                // Check Google Maps
                const googleMapsAnalysis = await this.checkGoogleMaps(leadData.business_name || leadData.name);
                
                // Generate personalized message
                const personalizedMessage = this.generateMessage(leadData, websiteAnalysis, googleMapsAnalysis);
                
                results.push({
                    leadId: leadData.id || `LEAD_${index + 1}`,
                    businessName: leadData.business_name || leadData.name || 'Unknown',
                    phone: leadData.phone_number || leadData.phone || '',
                    email: leadData.email || '',
                    website: leadData.website || leadData.current_website || '',
                    websiteExists: websiteAnalysis.exists,
                    googleMapsListing: googleMapsAnalysis.hasListing,
                    personalizedMessage: personalizedMessage,
                    analysisDate: new Date().toISOString()
                });
                
                fs.appendFileSync(this.statusFile, `\nCompleted analysis for ${leadData.business_name || leadData.name}`);
            }
            
            // Save results
            fs.writeFileSync(this.resultsFile, JSON.stringify(results, null, 2));
            
            // Create Google Sheets tab
            await this.createAnalysisTab(doc, results);
            
            fs.appendFileSync(this.statusFile, '\nFULL AUTOMATION COMPLETE!');
            fs.appendFileSync(this.statusFile, `\nAnalyzed ${results.length} leads`);
            fs.appendFileSync(this.statusFile, '\nResults saved to Google Sheet and local files');
            
        } catch (error) {
            fs.appendFileSync(this.statusFile, `\nERROR: ${error.message}`);
        }
    }
    
    async analyzeWebsite(url) {
        if (!url || !url.startsWith('http')) {
            return { exists: false, error: 'No valid URL' };
        }
        
        try {
            const browser = await puppeteer.launch({ headless: true });
            const page = await browser.newPage();
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            
            const title = await page.title();
            const mobileFriendly = await page.evaluate(() => {
                const viewport = document.querySelector('meta[name="viewport"]');
                return viewport && viewport.content.includes('width=device-width');
            });
            
            await browser.close();
            
            return {
                exists: true,
                title: title,
                mobileFriendly: mobileFriendly,
                url: url
            };
        } catch (error) {
            return {
                exists: false,
                error: error.message
            };
        }
    }
    
    async checkGoogleMaps(businessName) {
        try {
            const browser = await puppeteer.launch({ headless: true });
            const page = await browser.newPage();
            
            const searchQuery = `${businessName} Cancún`;
            const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;
            
            await page.goto(mapsUrl, { waitUntil: 'networkidle2', timeout: 15000 });
            
            const hasListing = await page.evaluate(() => {
                return document.querySelectorAll('[data-result-index]').length > 0;
            });
            
            await browser.close();
            
            return {
                hasListing: hasListing,
                searchQuery: searchQuery
            };
        } catch (error) {
            return {
                hasListing: false,
                error: error.message
            };
        }
    }
    
    generateMessage(lead, websiteAnalysis, googleMapsAnalysis) {
        const name = lead.name || lead.contact_name || 'Estimado empresario';
        const businessName = lead.business_name || 'su negocio';
        
        let message = `Hola ${name}, soy Alex de JegoDigital. He realizado un análisis completo de ${businessName} en Cancún y encontré oportunidades importantes para hacer crecer tu negocio.\n\n`;
        
        if (!websiteAnalysis.exists) {
            message += `He verificado que actualmente no tienes un sitio web profesional, lo que significa que estás perdiendo clientes que buscan tus servicios en internet.\n\n`;
        } else if (!websiteAnalysis.mobileFriendly) {
            message += `He revisado tu sitio web y noté que no funciona bien en dispositivos móviles, lo que puede estar costándote hasta el 60% de tus visitantes potenciales.\n\n`;
        }
        
        if (!googleMapsAnalysis.hasListing) {
            message += `También verifiqué tu presencia en Google Maps y no encontré un listado optimizado, lo que significa que pierdes visibilidad cuando la gente busca tu tipo de negocio en Cancún.\n\n`;
        }
        
        message += `Te puedo ayudar con una presencia digital profesional que incluye:
• Sitio web moderno y móvil-friendly
• Optimización para Google Maps y búsquedas locales
• Sistema de contacto y reservas online

Somos especialistas en crear presencia digital impactante para negocios en Cancún. Más de 50 proyectos exitosos y 95% de clientes satisfechos.

¿Tienes 15 minutos para una consulta gratuita? Te muestro exactamente cómo podemos hacer crecer tus ventas de inmediato.

Responde "SÍ" y te contacto hoy mismo.

Saludos,
Alex Jego
JegoDigital - Marketing Digital Cancún
📱 www.jegodigital.com
📧 alex@jegodigital.com
📞 +52 998 202 3263`;

        return message;
    }
    
    async createAnalysisTab(doc, results) {
        try {
            let sheet;
            try {
                sheet = doc.sheetsByTitle['Full Automation Results'];
                await sheet.clear();
            } catch (error) {
                sheet = await doc.addSheet({
                    title: 'Full Automation Results',
                    headerValues: [
                        'Lead ID', 'Business Name', 'Phone', 'Email', 'Website',
                        'Website Exists', 'Google Maps Listing', 'Personalized Message',
                        'Analysis Date'
                    ]
                });
            }
            
            const sheetData = results.map(result => ({
                'Lead ID': result.leadId,
                'Business Name': result.businessName,
                'Phone': result.phone,
                'Email': result.email,
                'Website': result.website,
                'Website Exists': result.websiteExists ? 'Yes' : 'No',
                'Google Maps Listing': result.googleMapsListing ? 'Yes' : 'No',
                'Personalized Message': result.personalizedMessage,
                'Analysis Date': result.analysisDate
            }));
            
            await sheet.setHeaderRow(Object.keys(sheetData[0]));
            await sheet.addRows(sheetData);
            
        } catch (error) {
            fs.appendFileSync(this.statusFile, `\nError creating sheet: ${error.message}`);
        }
    }
}

// Execute full automation
async function main() {
    const automation = new FullAutomation();
    await automation.execute();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = FullAutomation;


