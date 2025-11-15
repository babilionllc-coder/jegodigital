const puppeteer = require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const OpenAI = require('openai');
const fs = require('fs');

// Load configurations
const googleConfig = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));
const openaiConfig = JSON.parse(fs.readFileSync('openai-config.json', 'utf8'));

class BatchAIAnalyzer {
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
        this.processedLeads = [];
    }

    async initialize() {
        console.log('🤖 Initializing Batch AI Analyzer...');
        
        // Initialize Google Sheets
        this.doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', this.serviceAccountAuth);
        await this.doc.loadInfo();
        console.log(`📊 Connected to: ${this.doc.title}`);

        // Initialize Puppeteer
        this.browser = await puppeteer.launch({
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        console.log('🌐 Browser launched');
        console.log('🧠 OpenAI initialized');
    }

    async getUnprocessedLeads() {
        console.log('📋 Getting unprocessed leads...');
        
        const leadsSheet = this.doc.sheetsByTitle['REAL Perfect Leads'];
        await leadsSheet.loadCells();
        
        const rows = await leadsSheet.getRows();
        const unprocessedLeads = [];
        
        for (let i = 0; i < Math.min(rows.length, 100); i++) { // Process up to 100 leads
            const row = rows[i];
            const businessName = row.get('Business Name');
            const phoneNumber = row.get('Phone'); // Correct column name
            
            console.log(`Checking lead ${i + 1}: ${businessName}`);
            
            // Skip if already processed
            if (this.processedLeads.includes(businessName)) {
                continue;
            }
            
            unprocessedLeads.push({
                row,
                index: i,
                businessName,
                phoneNumber,
                location: row.get('Address'), // Correct column name
                website: row.get('Website'),
                industry: row.get('Business Type') // Correct column name
            });
        }
        
        console.log(`🎯 Found ${unprocessedLeads.length} unprocessed leads`);
        return unprocessedLeads;
    }

    async quickWebsiteAnalysis(leadData) {
        if (!leadData.website || leadData.website === 'N/A' || leadData.website === '') {
            return {
                hasWebsite: false,
                businessType: leadData.industry || 'Unknown',
                issues: ['No website found'],
                opportunities: ['Create professional website']
            };
        }

        const page = await this.browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

        try {
            await page.goto(leadData.website, { waitUntil: 'networkidle2', timeout: 10000 });
            await new Promise(resolve => setTimeout(resolve, 2000));

            const analysis = await page.evaluate(() => {
                const text = document.body.textContent.toLowerCase();
                
                let businessType = 'Unknown';
                if (text.includes('restaurant') || text.includes('food') || text.includes('menu')) businessType = 'Restaurant';
                else if (text.includes('hotel') || text.includes('accommodation')) businessType = 'Hotel';
                else if (text.includes('clinic') || text.includes('medical')) businessType = 'Medical';
                else if (text.includes('salon') || text.includes('beauty')) businessType = 'Beauty';
                else if (text.includes('gym') || text.includes('fitness')) businessType = 'Fitness';
                
                return {
                    hasWebsite: true,
                    businessType,
                    issues: ['Website needs optimization'],
                    opportunities: ['Website redesign', 'SEO optimization']
                };
            });

            await page.close();
            return analysis;

        } catch (error) {
            await page.close();
            return {
                hasWebsite: true,
                businessType: leadData.industry || 'Unknown',
                issues: ['Website accessibility issues'],
                opportunities: ['Website optimization']
            };
        }
    }

    async quickGoogleMapsAnalysis(leadData) {
        const page = await this.browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

        try {
            const searchQuery = `${leadData.businessName} ${leadData.location}`;
            await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`, { 
                waitUntil: 'networkidle2', 
                timeout: 10000 
            });
            await new Promise(resolve => setTimeout(resolve, 3000));

            const analysis = await page.evaluate(() => {
                const businessCard = document.querySelector('[data-value="Business"]') || 
                                  document.querySelector('.Nv2PK') ||
                                  document.querySelector('.lI9IFe');
                
                if (businessCard) {
                    // Try to extract rating
                    const ratingElement = document.querySelector('.MW4etd') || 
                                        document.querySelector('.fontDisplayLarge');
                    let rating = null;
                    if (ratingElement) {
                        const ratingMatch = ratingElement.textContent.match(/(\d+\.?\d*)/);
                        if (ratingMatch) rating = parseFloat(ratingMatch[1]);
                    }

                    // Try to extract review count
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
            return analysis;

        } catch (error) {
            await page.close();
            return {
                isListed: false,
                rating: null,
                reviewCount: 0,
                issues: ['Could not verify Google Maps presence'],
                strengths: []
            };
        }
    }

    async generateAIMessage(leadData, websiteAnalysis, mapsAnalysis) {
        console.log(`🧠 Generating AI message for: ${leadData.businessName}`);
        
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

🎨 EN JEGODIGITAL ESPECIALIZAMOS EN:
✨ DISEÑO WEB PROFESIONAL - Sitios hermosos y personalizados
🚀 SEO Y OPTIMIZACIÓN - Para aparecer en Google
🗺️ OPTIMIZACIÓN GOOGLE MAPS - Para atraer clientes locales
⚡ ENTREGA RÁPIDA - Tu sitio web listo en 2-3 días

💡 ¿Te gustaría una consulta GRATIS de 15 minutos para ver exactamente cómo podemos hacer crecer ${leadData.businessName}? 📞

🌐 Más info: www.jegodigital.com

¡Espero tu respuesta! 😊

Alex. CEO JegoDigital`;
    }

    async analyzeBatch() {
        console.log('🎯 Starting batch AI analysis...');
        
        const leads = await this.getUnprocessedLeads();
        
        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];
            console.log(`\n🎯 ANALYZING LEAD ${i + 1}/${leads.length}: ${lead.businessName}`);
            console.log('=' .repeat(50));

            try {
                // Quick analysis
                const websiteAnalysis = await this.quickWebsiteAnalysis(lead);
                const mapsAnalysis = await this.quickGoogleMapsAnalysis(lead);
                
                // Generate AI message
                const personalizedMessage = await this.generateAIMessage(lead, websiteAnalysis, mapsAnalysis);
                
                // Store results
                this.processedLeads.push({
                    businessName: lead.businessName,
                    phoneNumber: lead.phoneNumber,
                    location: lead.location,
                    websiteAnalysis,
                    mapsAnalysis,
                    personalizedMessage,
                    timestamp: new Date().toISOString()
                });

                console.log('✅ Lead analyzed successfully');
                console.log(`📱 Phone: ${lead.phoneNumber || 'Not provided'}`);
                console.log(`🌐 Has Website: ${websiteAnalysis.hasWebsite}`);
                console.log(`🗺️ Google Maps: ${mapsAnalysis.isListed ? 'Listed' : 'Not Listed'}`);
                console.log('\n🧠 AI-GENERATED MESSAGE:');
                console.log(personalizedMessage);
                console.log('\n' + '=' .repeat(50));

            } catch (error) {
                console.log(`❌ Error analyzing ${lead.businessName}: ${error.message}`);
            }
        }

        console.log(`\n🎉 BATCH ANALYSIS COMPLETE!`);
        console.log(`📊 Processed ${this.processedLeads.length} leads`);
        console.log(`💾 All results ready for Google Sheets upload`);
        
        return this.processedLeads;
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
        console.log('🔧 Batch Analyzer closed');
    }
}

// Main execution
async function main() {
    const analyzer = new BatchAIAnalyzer();
    
    try {
        await analyzer.initialize();
        const results = await analyzer.analyzeBatch();
        
        // Save results to file for review
        fs.writeFileSync('batch-analysis-results.json', JSON.stringify(results, null, 2));
        console.log('💾 Results saved to batch-analysis-results.json');
        
    } catch (error) {
        console.error('❌ Error during batch analysis:', error);
    } finally {
        await analyzer.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = BatchAIAnalyzer;
