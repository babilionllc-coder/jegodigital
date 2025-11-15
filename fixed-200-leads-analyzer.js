const puppeteer = require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const OpenAI = require('openai');
const fs = require('fs');

// Load configurations
const googleConfig = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));
const openaiConfig = JSON.parse(fs.readFileSync('openai-config.json', 'utf8'));

class Fixed200LeadsAnalyzer {
    constructor() {
        this.doc = null;
        this.browser = null;
        this.openai = new OpenAI({
            apiKey: openaiConfig.openai_api_key,
        });
        this.serviceAccountAuth = new JWT({
            email: googleConfig.client_email,
            key: googleConfig.private_key,
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive.file',
            ],
        });
        this.analyzedLeads = [];
        this.startIndex = 28; // Continue from where we left off
        this.targetLeads = 200;
        this.processedCount = 0;
    }

    async initialize() {
        console.log('🚀 Initializing Fixed 200 Leads Analyzer...');
        
        this.doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', this.serviceAccountAuth);
        await this.doc.loadInfo();
        console.log(`📊 Connected to: ${this.doc.title}`);

        this.browser = await puppeteer.launch({
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        console.log('🌐 Browser launched');
        console.log('🧠 OpenAI initialized');
    }

    async getLeadsFromMainSheet(startIndex, count) {
        console.log(`📋 Getting leads ${startIndex + 1} to ${startIndex + count} from main sheet...`);
        
        // Get leads from the main sheet with 2317 leads
        const leadsSheet = this.doc.sheetsByTitle['jegodigital-leads-template'];
        await leadsSheet.loadCells();
        
        const rows = await leadsSheet.getRows();
        const leadsToAnalyze = [];
        
        for (let i = startIndex; i < Math.min(startIndex + count, rows.length); i++) {
            const row = rows[i];
            const businessName = row.get('Business Name');
            const phoneNumber = row.get('Phone'); // Correct column name!
            
            // Only process leads that have a phone number
            if (businessName && phoneNumber && phoneNumber.trim() !== '') {
                leadsToAnalyze.push({
                    row,
                    index: i,
                    businessName,
                    phoneNumber,
                    location: row.get('Address') || 'Cancún, México',
                    website: row.get('Website') || '',
                    industry: row.get('Business Type') || 'Unknown'
                });
            }
        }
        
        console.log(`🎯 Found ${leadsToAnalyze.length} leads with phone numbers to analyze`);
        return leadsToAnalyze;
    }

    async quickAnalysis(leadData) {
        // Quick website check
        let websiteAnalysis = {
            hasWebsite: false,
            businessType: leadData.industry || 'Unknown',
            issues: ['No website found'],
            opportunities: ['Create professional website']
        };

        if (leadData.website && leadData.website !== 'N/A' && leadData.website.trim() !== '') {
            const page = await this.browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

            try {
                await page.goto(leadData.website, { waitUntil: 'networkidle2', timeout: 8000 });
                await new Promise(resolve => setTimeout(resolve, 1500));

                websiteAnalysis = await page.evaluate(() => {
                    const text = document.body.textContent.toLowerCase();
                    
                    let businessType = 'Unknown';
                    if (text.includes('restaurant') || text.includes('food')) businessType = 'Restaurant';
                    else if (text.includes('hotel')) businessType = 'Hotel';
                    else if (text.includes('clinic') || text.includes('medical')) businessType = 'Medical';
                    else if (text.includes('salon') || text.includes('beauty')) businessType = 'Beauty';
                    else if (text.includes('gym') || text.includes('fitness')) businessType = 'Fitness';
                    else if (text.includes('lawyer') || text.includes('legal')) businessType = 'Legal';
                    else if (text.includes('dental')) businessType = 'Dental';
                    
                    return {
                        hasWebsite: true,
                        businessType,
                        issues: ['Website needs optimization'],
                        opportunities: ['Website redesign', 'SEO optimization']
                    };
                });

                await page.close();
            } catch (error) {
                await page.close();
            }
        }

        // Quick Google Maps check
        let mapsAnalysis = {
            isListed: false,
            rating: null,
            reviewCount: 0,
            issues: ['Not listed on Google Maps'],
            strengths: []
        };

        const page = await this.browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

        try {
            const searchQuery = `${leadData.businessName} ${leadData.location}`;
            await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`, { 
                waitUntil: 'networkidle2', 
                timeout: 8000 
            });
            await new Promise(resolve => setTimeout(resolve, 2000));

            mapsAnalysis = await page.evaluate(() => {
                const businessCard = document.querySelector('[data-value="Business"]') || 
                                  document.querySelector('.Nv2PK') ||
                                  document.querySelector('.lI9IFe');
                
                if (businessCard) {
                    const ratingElement = document.querySelector('.MW4etd') || 
                                        document.querySelector('.fontDisplayLarge');
                    let rating = null;
                    if (ratingElement) {
                        const ratingMatch = ratingElement.textContent.match(/(\d+\.?\d*)/);
                        if (ratingMatch) rating = parseFloat(ratingMatch[1]);
                    }

                    const reviewElement = document.querySelector('.HHrUdb') || 
                                        document.querySelector('.fontBodyMedium');
                    let reviewCount = 0;
                    if (reviewElement) {
                        const reviewMatch = reviewElement.textContent.match(/(\d+)/);
                        if (reviewMatch) reviewCount = parseInt(reviewMatch[1]);
                    }

                    return {
                        isListed: true,
                        rating,
                        reviewCount,
                        issues: rating && rating < 4.0 ? ['Low rating'] : [],
                        strengths: rating && rating >= 4.0 ? ['Good rating'] : []
                    };
                } else {
                    return {
                        isListed: false,
                        rating: null,
                        reviewCount: 0,
                        issues: ['Not listed on Google Maps'],
                        strengths: []
                    };
                }
            });

            await page.close();
        } catch (error) {
            await page.close();
        }

        return { websiteAnalysis, mapsAnalysis };
    }

    async generateSpanishMessage(leadData, websiteAnalysis, mapsAnalysis) {
        const prompt = `
Eres Alex de JegoDigital, una agencia profesional de diseño web y marketing digital en Cancún, México.

Genera un mensaje de WhatsApp altamente personalizado para este negocio específico:

DETALLES DEL NEGOCIO:
- Nombre: ${leadData.businessName}
- Teléfono: ${leadData.phoneNumber || 'No proporcionado'}
- Ubicación: ${leadData.location}
- Industria: ${leadData.industry || websiteAnalysis.businessType || 'Desconocida'}

HALLAZGOS DEL ANÁLISIS:
- Tiene Sitio Web: ${websiteAnalysis.hasWebsite}
- Tipo de Negocio: ${websiteAnalysis.businessType}
- Problemas: ${websiteAnalysis.issues.join(', ')}
- Listado en Google Maps: ${mapsAnalysis.isListed}
- Calificación Google Maps: ${mapsAnalysis.rating || 'No disponible'}
- Reseñas Google Maps: ${mapsAnalysis.reviewCount || 0}

SERVICIOS DE JEGODIGITAL:
- Diseños web hermosos y personalizados (entrega en 2-3 días)
- Optimización para motores de búsqueda (SEO)
- Optimización de Google Maps
- Integración de redes sociales
- Diseño responsive para móviles
- Soluciones de comercio electrónico

REQUISITOS:
1. Comenzar con el número de teléfono si está disponible
2. Ser muy personal y específico a su negocio
3. Mencionar hallazgos específicos del análisis
4. Enfocarse en diseño web hermoso y SEO
5. Incluir emojis naturalmente
6. Ser conversacional y amigable
7. Terminar con llamada a la acción para consulta gratuita
8. Incluir www.jegodigital.com
9. Terminar con firma: "Alex. CEO JegoDigital"
10. Mantener bajo 300 palabras
11. Hacerlo completamente único - sin plantillas
12. ESCRIBIR TODO EN ESPAÑOL - NO INGLÉS

Genera un mensaje convincente y personalizado en español.
        `;

        try {
            const completion = await this.openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: "Eres Alex de JegoDigital, un experto en diseño web profesional en Cancún. Escribe mensajes de WhatsApp personalizados y atractivos que muestren investigación real y ofrezcan soluciones específicas. ESCRIBE SIEMPRE EN ESPAÑOL."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_tokens: 500,
                temperature: 0.8
            });

            return completion.choices[0].message.content.trim();

        } catch (error) {
            console.log(`❌ Error generating AI message: ${error.message}`);
            return this.generateFallbackMessage(leadData, websiteAnalysis, mapsAnalysis);
        }
    }

    generateFallbackMessage(leadData, websiteAnalysis, mapsAnalysis) {
        return `📱 ${leadData.phoneNumber || 'Teléfono no proporcionado'}

¡Hola! 👋 Soy Alex de JegoDigital 🚀

He estado investigando ${leadData.businessName} y me impresionó mucho tu negocio de ${websiteAnalysis.businessType} en ${leadData.location} 🏢

🔍 NOTÉ QUE: ${websiteAnalysis.hasWebsite ? 'Tu sitio web necesita optimización' : 'No tienes presencia web profesional'}. Esto significa perder clientes potenciales todos los días 😱

🎨 EN JEGODIGAL ESPECIALIZAMOS EN:
✨ DISEÑO WEB PROFESIONAL - Sitios hermosos y personalizados
🚀 SEO Y OPTIMIZACIÓN - Para aparecer en Google
🗺️ OPTIMIZACIÓN GOOGLE MAPS - Para atraer clientes locales
⚡ ENTREGA RÁPIDA - Tu sitio web listo en 2-3 días

💡 ¿Te gustaría una consulta GRATIS de 15 minutos para ver exactamente cómo podemos hacer crecer ${leadData.businessName}? 📞

🌐 Más info: www.jegodigital.com

¡Espero tu respuesta! 😊

Alex. CEO JegoDigital`;
    }

    async analyzeBatch(startIndex, count) {
        console.log(`🎯 Starting batch analysis from lead ${startIndex + 1} to ${startIndex + count}...`);
        
        const leads = await this.getLeadsFromMainSheet(startIndex, count);
        
        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];
            console.log(`\n🎯 ANALYZING LEAD ${this.startIndex + this.processedCount + 1}/${this.targetLeads}: ${lead.businessName}`);
            console.log('=' .repeat(50));

            try {
                // Quick analysis
                const { websiteAnalysis, mapsAnalysis } = await this.quickAnalysis(lead);
                
                // Generate AI message
                const personalizedMessage = await this.generateSpanishMessage(lead, websiteAnalysis, mapsAnalysis);
                
                // Store results
                this.analyzedLeads.push({
                    businessName: lead.businessName,
                    phoneNumber: lead.phoneNumber,
                    location: lead.location,
                    industry: lead.industry,
                    website: lead.website,
                    websiteAnalysis,
                    mapsAnalysis,
                    personalizedMessage,
                    timestamp: new Date().toISOString()
                });

                this.processedCount++;

                console.log('✅ Lead analyzed successfully');
                console.log(`📱 Phone: ${lead.phoneNumber}`);
                console.log(`🌐 Has Website: ${websiteAnalysis.hasWebsite}`);
                console.log(`🗺️ Google Maps: ${mapsAnalysis.isListed ? 'Listed' : 'Not Listed'}`);

            } catch (error) {
                console.log(`❌ Error analyzing ${lead.businessName}: ${error.message}`);
            }
        }

        console.log(`\n🎉 BATCH COMPLETE!`);
        console.log(`📊 Processed ${this.processedCount} total leads`);
        
        return leads.length;
    }

    async uploadResults() {
        console.log('📤 Uploading results to Google Sheets...');
        
        const leadsSheet = this.doc.sheetsByTitle['Complete Real Analysis'];
        
        // Prepare new rows
        const newRows = this.analyzedLeads.map(result => ({
            'Business Name': result.businessName || '',
            'Phone Number': result.phoneNumber || 'Not provided',
            'Location': result.location || '',
            'Industry': result.industry || '',
            'Website URL': result.website || 'No website',
            'Has Website': result.websiteAnalysis?.hasWebsite ? 'YES' : 'NO',
            'Business Type': result.websiteAnalysis?.businessType || 'Unknown',
            'Website Issues': result.websiteAnalysis?.issues?.join(', ') || 'None found',
            'Website Opportunities': result.websiteAnalysis?.opportunities?.join(', ') || 'None identified',
            'Google Maps Listed': result.mapsAnalysis?.isListed ? 'YES' : 'NO',
            'Google Maps Rating': result.mapsAnalysis?.rating || 'N/A',
            'Google Maps Reviews': result.mapsAnalysis?.reviewCount || 0,
            'Google Maps Issues': result.mapsAnalysis?.issues?.join(', ') || 'None found',
            'Google Maps Strengths': result.mapsAnalysis?.strengths?.join(', ') || 'None identified',
            'Total Issues Found': (result.websiteAnalysis?.issues?.length || 0) + (result.mapsAnalysis?.issues?.length || 0),
            'AI Personalized Message': result.personalizedMessage || '',
            'Analysis Date': result.timestamp || new Date().toISOString(),
            'Generated By': 'ChatGPT-4',
            'Status': 'Ready for Outreach',
            'Notes': `Teléfono: ${result.phoneNumber || 'No proporcionado'} | Ubicación: ${result.location} | Industria: ${result.industry}`
        }));

        await leadsSheet.addRows(newRows);
        console.log(`✅ Added ${newRows.length} rows to Complete Real Analysis sheet`);

        // Update Copy Paste Messages sheet
        const messagesSheet = this.doc.sheetsByTitle['Copy Paste Messages'];
        const messageRows = this.analyzedLeads.map(result => ({
            'Business Name': result.businessName || '',
            'Phone Number': result.phoneNumber || '',
            'Message to Send': result.personalizedMessage || '',
            'Business Type': result.websiteAnalysis?.businessType || result.industry || 'Unknown',
            'Location': result.location || ''
        }));

        await messagesSheet.addRows(messageRows);
        console.log(`✅ Added ${messageRows.length} rows to Copy Paste Messages sheet`);
        
        // Clear the analyzed leads array for next batch
        this.analyzedLeads = [];
    }

    async runTo200Leads() {
        console.log('🚀 Starting analysis to reach 200 leads...');
        
        let currentIndex = 0; // Start from beginning of main sheet
        
        while (this.processedCount < this.targetLeads - this.startIndex) {
            try {
                const batchSize = Math.min(20, (this.targetLeads - this.startIndex) - this.processedCount);
                const processed = await this.analyzeBatch(currentIndex, batchSize * 3); // Get more to filter for phone numbers
                
                if (processed === 0) {
                    console.log('❌ No more leads found. Stopping.');
                    break;
                }
                
                currentIndex += batchSize * 3;
                
                // Upload results after each batch
                if (this.analyzedLeads.length > 0) {
                    await this.uploadResults();
                }
                
                console.log(`\n📊 PROGRESS: ${this.startIndex + this.processedCount}/${this.targetLeads} leads processed`);
                
                if (this.processedCount >= (this.targetLeads - this.startIndex)) {
                    console.log('🎉 ALL 200 LEADS COMPLETED!');
                    break;
                }
                
                // Small delay between batches
                await new Promise(resolve => setTimeout(resolve, 3000));
                
            } catch (error) {
                console.log(`❌ Batch error: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        
        console.log('\n🎉 ANALYSIS TO 200 LEADS COMPLETE!');
        console.log(`📊 Total leads processed: ${this.startIndex + this.processedCount}`);
        console.log('📊 All results saved to Google Sheets');
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
        console.log('🔧 Analyzer closed');
    }
}

// Main execution
async function main() {
    const analyzer = new Fixed200LeadsAnalyzer();
    
    try {
        await analyzer.initialize();
        await analyzer.runTo200Leads();
        
    } catch (error) {
        console.error('❌ Error during analysis:', error);
    } finally {
        await analyzer.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = Fixed200LeadsAnalyzer;

