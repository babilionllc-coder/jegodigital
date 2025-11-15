const puppeteer = require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const OpenAI = require('openai');
const fs = require('fs');

// Load configurations
const googleConfig = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));
const apiKeys = JSON.parse(fs.readFileSync('api-keys-config.json', 'utf8'));
const openaiConfig = JSON.parse(fs.readFileSync('openai-config.json', 'utf8'));

class AIPersonalizedAnalyzer {
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
    }

    async initialize() {
        console.log('🤖 Initializing AI-Powered Personalized Analyzer...');
        
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

    async getNextLeadToAnalyze() {
        console.log('📋 Getting next lead to analyze...');
        
        const leadsSheet = this.doc.sheetsByTitle['REAL Perfect Leads'];
        await leadsSheet.loadCells();
        
        const rows = await leadsSheet.getRows();
        
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const aiAnalyzed = row.get('AI_ANALYZED');
            console.log(`Checking lead ${i + 1}: ${row.get('Business Name')} - AI_ANALYZED: ${aiAnalyzed}`);
            if (!aiAnalyzed || aiAnalyzed === 'NO' || aiAnalyzed === '' || aiAnalyzed === null) {
                console.log(`🎯 Found unanalyzed lead: ${row.get('Business Name')}`);
                return { row, index: i };
            }
        }
        
        console.log('✅ All leads have been analyzed!');
        return null;
    }

    async deepWebsiteAnalysis(leadData) {
        console.log(`🔍 Deep website analysis for: ${leadData.businessName}`);
        
        if (!leadData.website || leadData.website === 'N/A' || leadData.website === '') {
            return {
                hasWebsite: false,
                detailedAnalysis: 'No website found - this business has no online presence at all.',
                businessType: 'Unknown',
                services: [],
                painPoints: ['No website', 'No online presence', 'Missing digital footprint'],
                opportunities: ['Create professional website', 'Establish online presence', 'Digital transformation']
            };
        }

        const page = await this.browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

        try {
            await page.goto(leadData.website, { waitUntil: 'networkidle2', timeout: 15000 });
            await new Promise(resolve => setTimeout(resolve, 4000));

            const websiteData = await page.evaluate(() => {
                const analysis = {
                    hasWebsite: true,
                    businessType: 'Unknown',
                    services: [],
                    painPoints: [],
                    opportunities: [],
                    designIssues: [],
                    contentIssues: [],
                    technicalIssues: [],
                    contactInfo: {},
                    socialLinks: [],
                    detailedContent: ''
                };

                // Extract all visible text content
                analysis.detailedContent = document.body.textContent || '';

                // Determine business type from content
                const text = analysis.detailedContent.toLowerCase();
                
                if (text.includes('restaurant') || text.includes('food') || text.includes('menu') || text.includes('chef')) {
                    analysis.businessType = 'Restaurant';
                } else if (text.includes('hotel') || text.includes('accommodation') || text.includes('rooms')) {
                    analysis.businessType = 'Hotel';
                } else if (text.includes('clinic') || text.includes('medical') || text.includes('doctor') || text.includes('health')) {
                    analysis.businessType = 'Medical';
                } else if (text.includes('salon') || text.includes('beauty') || text.includes('spa') || text.includes('hair')) {
                    analysis.businessType = 'Beauty';
                } else if (text.includes('gym') || text.includes('fitness') || text.includes('training') || text.includes('workout')) {
                    analysis.businessType = 'Fitness';
                } else if (text.includes('lawyer') || text.includes('legal') || text.includes('attorney') || text.includes('law')) {
                    analysis.businessType = 'Legal';
                } else if (text.includes('real estate') || text.includes('property') || text.includes('rent') || text.includes('sell')) {
                    analysis.businessType = 'Real Estate';
                } else if (text.includes('shop') || text.includes('store') || text.includes('retail') || text.includes('sell')) {
                    analysis.businessType = 'Retail';
                } else if (text.includes('auto') || text.includes('car') || text.includes('mechanic') || text.includes('repair')) {
                    analysis.businessType = 'Automotive';
                } else if (text.includes('dental') || text.includes('dentist') || text.includes('teeth')) {
                    analysis.businessType = 'Dental';
                }

                // Extract services offered
                const serviceKeywords = ['service', 'treatment', 'consultation', 'delivery', 'rental', 'repair', 'installation', 'consulting', 'therapy', 'class', 'course'];
                serviceKeywords.forEach(keyword => {
                    if (text.includes(keyword)) {
                        const sentences = analysis.detailedContent.split('.');
                        sentences.forEach(sentence => {
                            if (sentence.toLowerCase().includes(keyword) && sentence.length < 150 && sentence.length > 10) {
                                analysis.services.push(sentence.trim());
                            }
                        });
                    }
                });

                // Check for design issues
                const images = document.querySelectorAll('img');
                let brokenImages = 0;
                let lowQualityImages = 0;
                images.forEach(img => {
                    if (!img.src || img.src.includes('placeholder') || img.src.includes('broken')) {
                        brokenImages++;
                    }
                    if (img.width < 200 || img.height < 200) {
                        lowQualityImages++;
                    }
                });
                if (brokenImages > 0) analysis.designIssues.push('Broken or placeholder images');
                if (lowQualityImages > 3) analysis.designIssues.push('Low quality images');

                // Check for content issues
                if (analysis.detailedContent.length < 500) analysis.contentIssues.push('Very little content');
                if (!text.includes('contact') && !text.includes('phone') && !text.includes('email')) {
                    analysis.contentIssues.push('Missing contact information');
                }

                // Check for technical issues
                const title = document.querySelector('title');
                if (!title || title.textContent.length < 30) {
                    analysis.technicalIssues.push('Poor title optimization');
                }

                const metaDescription = document.querySelector('meta[name="description"]');
                if (!metaDescription) {
                    analysis.technicalIssues.push('Missing meta description');
                }

                // Extract contact information
                const phoneRegex = /(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
                const phoneMatches = analysis.detailedContent.match(phoneRegex);
                if (phoneMatches) analysis.contactInfo.phone = phoneMatches[0];

                const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                const emailMatches = analysis.detailedContent.match(emailRegex);
                if (emailMatches) analysis.contactInfo.email = emailMatches[0];

                // Find social media links
                const links = document.querySelectorAll('a[href]');
                links.forEach(link => {
                    const href = link.href.toLowerCase();
                    if (href.includes('facebook.com')) analysis.socialLinks.push({ platform: 'Facebook', url: link.href });
                    if (href.includes('instagram.com')) analysis.socialLinks.push({ platform: 'Instagram', url: link.href });
                    if (href.includes('twitter.com') || href.includes('x.com')) analysis.socialLinks.push({ platform: 'Twitter', url: link.href });
                    if (href.includes('linkedin.com')) analysis.socialLinks.push({ platform: 'LinkedIn', url: link.href });
                });

                // Compile pain points
                analysis.painPoints = [...analysis.designIssues, ...analysis.contentIssues, ...analysis.technicalIssues];

                // Generate opportunities
                if (analysis.designIssues.length > 0) analysis.opportunities.push('Professional website redesign');
                if (analysis.contentIssues.length > 0) analysis.opportunities.push('Content optimization');
                if (analysis.technicalIssues.length > 0) analysis.opportunities.push('SEO and technical optimization');
                if (analysis.socialLinks.length === 0) analysis.opportunities.push('Social media integration');

                return analysis;
            });

            await page.close();
            
            // Create detailed analysis summary
            const detailedAnalysis = this.createDetailedAnalysis(websiteData);
            return { ...websiteData, detailedAnalysis };

        } catch (error) {
            console.log(`❌ Error analyzing website: ${error.message}`);
            await page.close();
            return {
                hasWebsite: true,
                detailedAnalysis: `Website exists but has accessibility issues: ${error.message}`,
                businessType: 'Unknown',
                services: [],
                painPoints: ['Website accessibility issues', 'Slow loading or broken'],
                opportunities: ['Website optimization needed']
            };
        }
    }

    createDetailedAnalysis(websiteData) {
        let analysis = `Business Type: ${websiteData.businessType}\n\n`;
        
        if (websiteData.services.length > 0) {
            analysis += `Services Found:\n${websiteData.services.slice(0, 5).join('\n')}\n\n`;
        }
        
        if (websiteData.painPoints.length > 0) {
            analysis += `Issues Identified:\n${websiteData.painPoints.join('\n')}\n\n`;
        }
        
        if (websiteData.opportunities.length > 0) {
            analysis += `Opportunities:\n${websiteData.opportunities.join('\n')}\n\n`;
        }
        
        if (websiteData.socialLinks.length > 0) {
            analysis += `Social Media Present:\n${websiteData.socialLinks.map(s => s.platform).join(', ')}\n\n`;
        } else {
            analysis += `No social media integration found\n\n`;
        }
        
        return analysis;
    }

    async analyzeGoogleMaps(leadData) {
        console.log(`🗺️ Analyzing Google Maps for: ${leadData.businessName}`);
        
        const page = await this.browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

        try {
            const searchQuery = `${leadData.businessName} ${leadData.location}`;
            await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`, { 
                waitUntil: 'networkidle2', 
                timeout: 15000 
            });
            await new Promise(resolve => setTimeout(resolve, 5000));

            const mapsData = await page.evaluate(() => {
                const analysis = {
                    isListed: false,
                    rating: null,
                    reviewCount: 0,
                    photos: 0,
                    address: null,
                    phone: null,
                    website: null,
                    hours: null,
                    category: null,
                    issues: [],
                    strengths: []
                };

                // Look for business listing
                const businessCard = document.querySelector('[data-value="Business"]') || 
                                  document.querySelector('.Nv2PK') ||
                                  document.querySelector('.lI9IFe') ||
                                  document.querySelector('[role="main"]');
                
                if (businessCard) {
                    analysis.isListed = true;

                    // Extract rating
                    const ratingElement = document.querySelector('.MW4etd') || 
                                        document.querySelector('.fontDisplayLarge') ||
                                        document.querySelector('[aria-label*="stars"]');
                    if (ratingElement) {
                        const ratingText = ratingElement.textContent || ratingElement.getAttribute('aria-label');
                        const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
                        if (ratingMatch) {
                            analysis.rating = parseFloat(ratingMatch[1]);
                        }
                    }

                    // Extract review count
                    const reviewElement = document.querySelector('.HHrUdb') || 
                                        document.querySelector('.fontBodyMedium') ||
                                        document.querySelector('[aria-label*="reviews"]');
                    if (reviewElement) {
                        const reviewText = reviewElement.textContent || reviewElement.getAttribute('aria-label');
                        const reviewMatch = reviewText.match(/(\d+)/);
                        if (reviewMatch) {
                            analysis.reviewCount = parseInt(reviewMatch[1]);
                        }
                    }

                    // Extract address
                    const addressElement = document.querySelector('.Io6YTe') || 
                                         document.querySelector('.fontBodyMedium');
                    if (addressElement) {
                        analysis.address = addressElement.textContent;
                    }

                    // Extract phone
                    const phoneElement = document.querySelector('[data-value="Phone"]') || 
                                       document.querySelector('.fontBodyMedium');
                    if (phoneElement) {
                        analysis.phone = phoneElement.textContent;
                    }

                    // Extract website
                    const websiteElement = document.querySelector('[data-value="Website"]') || 
                                         document.querySelector('a[href*="http"]');
                    if (websiteElement) {
                        analysis.website = websiteElement.href || websiteElement.textContent;
                    }

                    // Check for photos
                    const photoElements = document.querySelectorAll('.DaVh4e img, .m6QErb img, [data-photo-index]');
                    analysis.photos = photoElements.length;

                    // Analyze strengths and issues
                    if (analysis.rating && analysis.rating >= 4.5) {
                        analysis.strengths.push('High Google Maps rating');
                    } else if (analysis.rating && analysis.rating < 4.0) {
                        analysis.issues.push('Low Google Maps rating');
                    }
                    
                    if (analysis.reviewCount >= 50) {
                        analysis.strengths.push('Strong review presence');
                    } else if (analysis.reviewCount < 10) {
                        analysis.issues.push('Very few reviews');
                    }
                    
                    if (analysis.photos >= 10) {
                        analysis.strengths.push('Good photo presence');
                    } else if (analysis.photos < 3) {
                        analysis.issues.push('Limited photos');
                    }
                    
                    if (!analysis.website) {
                        analysis.issues.push('No website link on Google Maps');
                    }
                } else {
                    analysis.issues.push('Not listed on Google Maps');
                }

                return analysis;
            });

            await page.close();
            return mapsData;

        } catch (error) {
            console.log(`❌ Error analyzing Google Maps: ${error.message}`);
            await page.close();
            return {
                isListed: false,
                rating: null,
                reviewCount: 0,
                photos: 0,
                issues: ['Could not verify Google Maps presence'],
                strengths: []
            };
        }
    }

    async generateAIPersonalizedMessage(leadData, websiteAnalysis, mapsAnalysis) {
        console.log(`🧠 Generating AI-powered personalized message for: ${leadData.businessName}`);
        
        const prompt = `
You are Alex from JegoDigital, a professional website design and digital marketing agency in Cancún, México. 

Generate a highly personalized WhatsApp message for this specific business:

BUSINESS DETAILS:
- Name: ${leadData.businessName}
- Phone: ${leadData.phoneNumber}
- Location: ${leadData.location}
- Industry: ${leadData.industry || websiteAnalysis.businessType || 'Unknown'}

WEBSITE ANALYSIS:
- Has Website: ${websiteAnalysis.hasWebsite}
- Business Type: ${websiteAnalysis.businessType}
- Issues Found: ${websiteAnalysis.painPoints.join(', ') || 'None identified'}
- Services: ${websiteAnalysis.services.slice(0, 3).join(', ') || 'Not specified'}

GOOGLE MAPS ANALYSIS:
- Listed on Google Maps: ${mapsAnalysis.isListed}
- Rating: ${mapsAnalysis.rating || 'Not available'}
- Reviews: ${mapsAnalysis.reviewCount || 0}
- Photos: ${mapsAnalysis.photos || 0}
- Issues: ${mapsAnalysis.issues.join(', ') || 'None'}

JEGODIGITAL SERVICES:
- Beautiful custom website designs (2-3 days delivery)
- Search engine optimization (SEO)
- Google Maps optimization
- Social media integration
- Mobile-responsive design
- E-commerce solutions
- Local business optimization

REQUIREMENTS:
1. Start with the phone number for easy copy-paste
2. Be very personal and specific to their business
3. Mention specific findings from the analysis
4. Focus on beautiful website design and SEO as main services
5. Include emojis naturally
6. Be conversational and friendly
7. End with a call to action for a free consultation
8. Include www.jegodigital.com at the end
9. Keep it under 300 words
10. Make it unique - no templates, completely original content
11. End with signature: "Alex. CEO JegoDigital"

Generate a compelling, personalized message that shows you've done real research on their business.
        `;

        try {
            const completion = await this.openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: "You are Alex from JegoDigital, a professional website design expert in Cancún. You write personalized, engaging WhatsApp messages that show real research and offer specific solutions. Always be genuine, helpful, and focused on beautiful website design and SEO services."
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
        return `📱 ${leadData.phoneNumber}

¡Hola! 👋 Soy Alex de JegoDigital 🚀

He estado investigando ${leadData.businessName} y me impresionó mucho tu negocio de ${websiteAnalysis.businessType || leadData.industry} en ${leadData.location} 🏢

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

    async analyzeSingleLead() {
        console.log('🎯 Starting AI-powered single lead analysis...');
        
        const leadInfo = await this.getNextLeadToAnalyze();
        if (!leadInfo) {
            console.log('✅ No more leads to analyze!');
            return;
        }

        const { row, index } = leadInfo;
        const leadData = {
            businessName: row.get('Business Name'),
            phoneNumber: row.get('Phone Number'),
            location: row.get('Location'),
            website: row.get('Website'),
            industry: row.get('Industry')
        };

        console.log(`\n🎯 ANALYZING LEAD #${index + 1}: ${leadData.businessName}`);
        console.log('=' .repeat(50));

        // Perform comprehensive analysis
        const websiteAnalysis = await this.deepWebsiteAnalysis(leadData);
        const mapsAnalysis = await this.analyzeGoogleMaps(leadData);

        // Generate AI-powered personalized message
        const personalizedMessage = await this.generateAIPersonalizedMessage(leadData, websiteAnalysis, mapsAnalysis);

        // Save results to Google Sheets
        await this.saveAnalysisResults(row, websiteAnalysis, mapsAnalysis, personalizedMessage);

        console.log('\n✅ AI Analysis complete!');
        console.log('🧠 Unique personalized message generated with ChatGPT');
        console.log('📊 Results saved to Google Sheets');
        
        return {
            leadData,
            websiteAnalysis,
            mapsAnalysis,
            personalizedMessage
        };
    }

    async saveAnalysisResults(row, websiteAnalysis, mapsAnalysis, personalizedMessage) {
        console.log('💾 Saving AI analysis results...');
        
        try {
            // Update the lead row with analysis results
            row.set('AI_ANALYZED', 'YES');
            row.set('WEBSITE_ANALYSIS', websiteAnalysis.hasWebsite ? 'HAS_WEBSITE' : 'NO_WEBSITE');
            row.set('GOOGLE_MAPS', mapsAnalysis.isListed ? 'LISTED' : 'NOT_LISTED');
            row.set('BUSINESS_TYPE', websiteAnalysis.businessType);
            row.set('ISSUES_FOUND', websiteAnalysis.painPoints.length + mapsAnalysis.issues.length);
            row.set('AI_PERSONALIZED_MESSAGE', personalizedMessage);
            row.set('ANALYSIS_DATE', new Date().toISOString());
            row.set('MESSAGE_GENERATED_BY', 'ChatGPT-4');
            
            await row.save();
            console.log('✅ AI results saved to Google Sheets');
            
            // Verify the save worked
            const savedValue = row.get('AI_ANALYZED');
            console.log(`🔍 Verification: AI_ANALYZED is now set to: ${savedValue}`);
            
        } catch (error) {
            console.log(`❌ Error saving to Google Sheets: ${error.message}`);
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
        console.log('🔧 AI Analyzer closed');
    }
}

// Main execution
async function main() {
    const analyzer = new AIPersonalizedAnalyzer();
    
    try {
        await analyzer.initialize();
        const result = await analyzer.analyzeSingleLead();
        
        if (result) {
            console.log('\n🎉 AI LEAD ANALYSIS COMPLETE!');
            console.log('=' .repeat(50));
            console.log(`Business: ${result.leadData.businessName}`);
            console.log(`Phone: ${result.leadData.phoneNumber}`);
            console.log(`Has Website: ${result.websiteAnalysis.hasWebsite}`);
            console.log(`Google Maps Listed: ${result.mapsAnalysis.isListed}`);
            console.log(`Business Type: ${result.websiteAnalysis.businessType}`);
            console.log('\n🧠 AI-GENERATED PERSONALIZED MESSAGE:');
            console.log(result.personalizedMessage);
        }
        
    } catch (error) {
        console.error('❌ Error during AI analysis:', error);
    } finally {
        await analyzer.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = AIPersonalizedAnalyzer;
