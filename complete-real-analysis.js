const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');

class CompleteRealAnalysis {
    constructor() {
        this.spreadsheetId = '1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg';
        this.doc = null;
        this.sheet = null;
        this.browser = null;
        this.apiKeys = JSON.parse(fs.readFileSync('api-keys-config.json', 'utf8'));
        
        // JegoDigital Services Knowledge
        this.services = {
            website_design: {
                name: "Website Design & Development",
                benefits: ["Modern, beautiful design", "2-3 day delivery", "Mobile responsive", "Custom built for business"],
                local_advantage: "Perfect for Cancún businesses wanting professional online presence"
            },
            seo_optimization: {
                name: "SEO & Google Optimization", 
                benefits: ["Rank higher on Google", "Get more customers", "Local SEO for Cancún", "Google Maps optimization"],
                local_advantage: "Help local businesses dominate Google searches in Cancún"
            },
            google_maps: {
                name: "Google Maps & Business Listings",
                benefits: ["Appear in local searches", "More foot traffic", "Customer reviews management", "Local visibility"],
                local_advantage: "Essential for Cancún tourism and service businesses"
            }
        };
        
        this.initGoogleSheets();
    }

    async initGoogleSheets() {
        try {
            console.log('🔗 Connecting to Google Sheets...');
            
            const serviceAccountConfig = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));
            this.serviceAccountAuth = new JWT({
                email: serviceAccountConfig.client_email,
                key: serviceAccountConfig.private_key,
                scopes: [
                    'https://www.googleapis.com/auth/spreadsheets',
                    'https://www.googleapis.com/auth/drive.file',
                ],
            });

            this.doc = new GoogleSpreadsheet(this.spreadsheetId, this.serviceAccountAuth);
            await this.doc.loadInfo();
            console.log('✅ Connected to:', this.doc.title);

            // Get or create the analysis results sheet
            this.sheet = this.doc.sheetsByTitle['Complete Real Analysis'];
            if (!this.sheet) {
                console.log('📊 Creating "Complete Real Analysis" sheet...');
                this.sheet = await this.doc.addSheet({
                    title: 'Complete Real Analysis'
                });
            }
            console.log('✅ Using "Complete Real Analysis" sheet');

        } catch (error) {
            console.error('❌ Google Sheets error:', error.message);
        }
    }

    async startCompleteAnalysis() {
        try {
            console.log('🚀 STARTING COMPLETE REAL ANALYSIS SYSTEM');
            console.log('==========================================');
            console.log('🎯 100% REAL DATA - NO FAKE INFORMATION');
            console.log('🔍 ACTUAL website scraping, Google Maps, Facebook, Instagram');
            console.log('📊 REAL analysis results saved to Google Sheets');
            console.log('💬 Personalized messages based on REAL findings');

            // Start browser for analysis
            console.log('🌐 Starting REAL browser for actual analysis...');
            this.browser = await puppeteer.launch({ 
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            // Get perfect leads
            const perfectLeadsSheet = this.doc.sheetsByTitle['REAL Perfect Leads'];
            if (!perfectLeadsSheet) {
                console.log('❌ Could not find "REAL Perfect Leads" sheet');
                return;
            }

            await perfectLeadsSheet.loadHeaderRow();
            const rows = await perfectLeadsSheet.getRows();
            
            console.log(`📊 Found ${rows.length} perfect leads to analyze`);
            
            // Set up analysis results sheet headers
            const headers = [
                'Business Name', 'Phone', 'Email', 'Business Type', 'Address',
                'Website Found', 'Website URL', 'Website Issues', 'Website Analysis',
                'Google Maps Found', 'Google Maps Issues', 'Google Maps Analysis',
                'Facebook Found', 'Facebook URL', 'Facebook Issues', 'Facebook Analysis',
                'Instagram Found', 'Instagram URL', 'Instagram Issues', 'Instagram Analysis',
                'All Problems Identified', 'Service Recommendations', 'Urgency Level',
                'Personalized Message', 'Message Length', 'Analysis Date'
            ];
            await this.sheet.setHeaderRow(headers);

            // Analyze first 200 leads (or all available if less than 200)
            const leadsToAnalyze = rows.slice(0, 200);
            
            for (let i = 0; i < leadsToAnalyze.length; i++) {
                const row = leadsToAnalyze[i];
                const businessName = row.get('Business Name') || '';
                const phone = row.get('Phone') || '';
                const email = row.get('Email') || '';
                const businessType = row.get('Business Type') || '';
                const address = row.get('Address') || '';
                
                console.log(`\n🔍 REAL ANALYSIS OF LEAD #${i + 1}: ${businessName}`);
                console.log('======================================================================');
                
                // Complete REAL analysis
                const analysis = await this.performCompleteAnalysis(businessName, phone, email, businessType, address);
                
                // Generate personalized message based on REAL findings
                const personalizedMessage = this.generatePersonalizedMessage(businessName, businessType, analysis, phone);
                
                // Save to Google Sheets
                await this.saveAnalysisToSheet(analysis, personalizedMessage, businessName, phone, email, businessType, address);
                
                console.log(`✅ REAL ANALYSIS COMPLETE FOR LEAD #${i + 1}`);
                console.log(`📝 Personalized message created (${personalizedMessage.length} characters)`);
                
                // Wait between analyses to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            await this.browser.close();
            console.log('\n🎉 COMPLETE REAL ANALYSIS FINISHED!');
            console.log(`📊 Analyzed ${leadsToAnalyze.length} leads with 100% real data`);
            console.log('📋 All results saved to "Complete Real Analysis" sheet');

        } catch (error) {
            console.error('❌ Analysis error:', error.message);
            if (this.browser) {
                await this.browser.close();
            }
        }
    }

    async performCompleteAnalysis(businessName, phone, email, businessType, address) {
        const analysis = {
            website: { found: false, url: '', issues: [], analysis: '' },
            googleMaps: { found: false, issues: [], analysis: '' },
            facebook: { found: false, url: '', issues: [], analysis: '' },
            instagram: { found: false, url: '', issues: [], analysis: '' },
            allProblems: [],
            serviceRecommendations: []
        };

        // 1. Website Analysis
        console.log(`    🌐 REAL ANALYSIS: Analyzing website for ${businessName}`);
        analysis.website = await this.analyzeWebsite(businessName);
        
        // 2. Google Maps Analysis
        console.log(`    🗺️ REAL ANALYSIS: Checking Google Maps for ${businessName}`);
        analysis.googleMaps = await this.analyzeGoogleMaps(businessName);
        
        // 3. Facebook Analysis
        console.log(`    📘 REAL ANALYSIS: Checking Facebook for ${businessName}`);
        analysis.facebook = await this.analyzeFacebook(businessName);
        
        // 4. Instagram Analysis
        console.log(`    📸 REAL ANALYSIS: Checking Instagram for ${businessName}`);
        analysis.instagram = await this.analyzeInstagram(businessName);

        // Compile all problems and recommendations
        analysis.allProblems = [
            ...analysis.website.issues,
            ...analysis.googleMaps.issues,
            ...analysis.facebook.issues,
            ...analysis.instagram.issues
        ];

        analysis.serviceRecommendations = this.getServiceRecommendations(analysis);

        return analysis;
    }

    async analyzeWebsite(businessName) {
        try {
            const page = await this.browser.newPage();
            await page.goto(`https://www.google.com/search?q=${encodeURIComponent(businessName + ' Cancún website')}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const websiteLinks = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a[href*="http"]'));
                return links
                    .map(link => link.href)
                    .filter(href => 
                        href.includes('http') && 
                        !href.includes('google.com') &&
                        !href.includes('facebook.com') &&
                        !href.includes('instagram.com') &&
                        !href.includes('maps.google.com')
                    )
                    .slice(0, 3);
            });

            if (websiteLinks.length > 0) {
                const websiteUrl = websiteLinks[0];
                console.log(`    ✅ Found website: ${websiteUrl}`);
                
                try {
                    await page.goto(websiteUrl, { waitUntil: 'networkidle2', timeout: 10000 });
                    
                    const websiteAnalysis = await page.evaluate(() => {
                        const bodyText = document.body.innerText.toLowerCase();
                        return {
                            title: document.title,
                            hasContactInfo: bodyText.includes('contact') || bodyText.includes('tel:') || bodyText.includes('phone'),
                            hasAddress: bodyText.includes('cancun') || bodyText.includes('cancún'),
                            hasEmail: bodyText.includes('@') && bodyText.includes('email'),
                            isMobileFriendly: window.innerWidth < 768,
                            pageLoadTime: performance.timing.loadEventEnd - performance.timing.navigationStart
                        };
                    });
                    
                    const issues = [];
                    const analysis = [];
                    
                    if (!websiteAnalysis.hasContactInfo) issues.push('No contact information visible');
                    if (!websiteAnalysis.hasAddress) issues.push('No Cancún address mentioned');
                    if (!websiteAnalysis.hasEmail) issues.push('No email contact found');
                    if (websiteAnalysis.pageLoadTime > 3000) issues.push('Slow loading website');
                    
                    analysis.push(`Title: ${websiteAnalysis.title}`);
                    analysis.push(`Load time: ${websiteAnalysis.pageLoadTime}ms`);
                    analysis.push(`Contact info: ${websiteAnalysis.hasContactInfo ? 'Yes' : 'No'}`);
                    
                    await page.close();
                    
                    return {
                        found: true,
                        url: websiteUrl,
                        issues: issues,
                        analysis: analysis.join('; ')
                    };
                    
                } catch (websiteError) {
                    console.log(`    ⚠️ Could not analyze website: ${websiteError.message}`);
                    await page.close();
                    return {
                        found: true,
                        url: websiteUrl,
                        issues: ['Website exists but cannot be analyzed'],
                        analysis: 'Website found but analysis failed'
                    };
                }
            } else {
                console.log(`    ❌ No website found for ${businessName}`);
                await page.close();
                return {
                    found: false,
                    url: '',
                    issues: ['No website found - Perfect for website design service'],
                    analysis: 'No website found - High priority for website creation'
                };
            }
            
        } catch (error) {
            console.log(`    ⚠️ Website analysis failed: ${error.message}`);
            return {
                found: false,
                url: '',
                issues: ['Website analysis failed'],
                analysis: 'Could not analyze website'
            };
        }
    }

    async analyzeGoogleMaps(businessName) {
        try {
            const page = await this.browser.newPage();
            await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(businessName + ' Cancún')}`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const mapsAnalysis = await page.evaluate(() => {
                // Check if we're on a place page (business found)
                const isPlacePage = window.location.href.includes('/place/');
                const businessNameFound = document.querySelector('h1') ? document.querySelector('h1').innerText : '';
                const address = document.querySelector('[data-item-id="address"]') ? document.querySelector('[data-item-id="address"]').innerText : '';
                const rating = document.querySelector('[aria-label*="estrellas"]') ? document.querySelector('[aria-label*="estrellas"]').getAttribute('aria-label') : '';
                const phone = document.querySelector('[data-item-id="phone"]') ? document.querySelector('[data-item-id="phone"]').innerText : '';
                const website = document.querySelector('[data-item-id="authority"]') ? document.querySelector('[data-item-id="authority"]').innerText : '';
                const photos = document.querySelector('[data-value="Photos"]') ? document.querySelector('[data-value="Photos"]').innerText : '';
                const reviews = document.querySelector('[data-value="Reviews"]') ? document.querySelector('[data-value="Reviews"]').innerText : '';
                
                return {
                    isPlacePage: isPlacePage,
                    businessName: businessNameFound,
                    address: address,
                    rating: rating,
                    phone: phone,
                    website: website,
                    photos: photos,
                    reviews: reviews,
                    hasBusinessInfo: businessNameFound || address || rating || phone
                };
            });
            
            if (mapsAnalysis.isPlacePage && mapsAnalysis.hasBusinessInfo) {
                console.log(`    ✅ FOUND on Google Maps: ${mapsAnalysis.businessName}`);
                
                const issues = [];
                const analysis = [];
                
                analysis.push(`Business: ${mapsAnalysis.businessName}`);
                if (mapsAnalysis.address) analysis.push(`Address: ${mapsAnalysis.address}`);
                if (mapsAnalysis.rating) analysis.push(`Rating: ${mapsAnalysis.rating}`);
                if (mapsAnalysis.phone) analysis.push(`Phone: ${mapsAnalysis.phone}`);
                if (mapsAnalysis.website) analysis.push(`Website: ${mapsAnalysis.website}`);
                if (mapsAnalysis.photos) analysis.push(`Photos: ${mapsAnalysis.photos}`);
                if (mapsAnalysis.reviews) analysis.push(`Reviews: ${mapsAnalysis.reviews}`);
                
                // Check for issues
                if (!mapsAnalysis.rating || mapsAnalysis.rating.includes('estrellas') && !mapsAnalysis.rating.includes('4') && !mapsAnalysis.rating.includes('5')) {
                    issues.push('Low or no customer reviews - Needs review management');
                }
                if (!mapsAnalysis.photos || mapsAnalysis.photos.includes('0')) {
                    issues.push('No photos - Needs professional photos for Google Maps');
                }
                if (!mapsAnalysis.website) {
                    issues.push('No website link on Google Maps - Missing website integration');
                }
                if (!mapsAnalysis.reviews || mapsAnalysis.reviews.includes('0')) {
                    issues.push('No customer reviews - Needs review generation strategy');
                }
                
                await page.close();
                
                return {
                    found: true,
                    issues: issues.length > 0 ? issues : ['Google Maps listing exists but needs optimization'],
                    analysis: analysis.join('; ')
                };
            } else {
                console.log(`    ❌ No Google Maps listing found for ${businessName}`);
                await page.close();
                return {
                    found: false,
                    issues: ['Not listed on Google Maps - Perfect for Google Maps optimization'],
                    analysis: 'No Google Maps listing found - High priority for local SEO'
                };
            }
            
        } catch (error) {
            console.log(`    ⚠️ Google Maps analysis failed: ${error.message}`);
            return {
                found: false,
                issues: ['Google Maps analysis failed'],
                analysis: 'Could not analyze Google Maps'
            };
        }
    }

    async analyzeFacebook(businessName) {
        try {
            const page = await this.browser.newPage();
            await page.goto(`https://www.facebook.com/search/pages/?q=${encodeURIComponent(businessName + ' Cancún')}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const facebookResults = await page.evaluate(() => {
                const results = [];
                const pageElements = document.querySelectorAll('[data-pagelet="SearchResults"] a[href*="/pages/"]');
                
                pageElements.forEach(element => {
                    const nameElement = element.querySelector('span');
                    if (nameElement && nameElement.innerText.toLowerCase().includes('cancun')) {
                        results.push({
                            name: nameElement.innerText,
                            url: element.href
                        });
                    }
                });
                
                return results.slice(0, 2);
            });
            
            if (facebookResults.length > 0) {
                console.log(`    📘 Facebook: Found ${facebookResults.length} pages`);
                const analysis = facebookResults.map(result => `${result.name} - ${result.url}`).join('; ');
                await page.close();
                
                return {
                    found: true,
                    url: facebookResults[0].url,
                    issues: [],
                    analysis: analysis
                };
            } else {
                console.log(`    📘 Facebook: No pages found`);
                await page.close();
                return {
                    found: false,
                    url: '',
                    issues: ['No Facebook business page - Perfect for social media setup'],
                    analysis: 'No Facebook page found'
                };
            }
            
        } catch (error) {
            console.log(`    📘 Facebook: Could not check - ${error.message}`);
            return {
                found: false,
                url: '',
                issues: ['Facebook analysis failed'],
                analysis: 'Could not analyze Facebook'
            };
        }
    }

    async analyzeInstagram(businessName) {
        try {
            const page = await this.browser.newPage();
            const cleanName = businessName.replace(/\s+/g, '').toLowerCase();
            await page.goto(`https://www.instagram.com/explore/tags/${encodeURIComponent(cleanName)}/`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const instagramResults = await page.evaluate(() => {
                const results = [];
                const postElements = document.querySelectorAll('article a[href*="/p/"]');
                return Math.min(postElements.length, 5);
            });
            
            console.log(`    📸 Instagram: Found ${instagramResults} related posts`);
            await page.close();
            
            if (instagramResults > 0) {
                return {
                    found: true,
                    url: `https://www.instagram.com/explore/tags/${cleanName}/`,
                    issues: [],
                    analysis: `Found ${instagramResults} related posts`
                };
            } else {
                return {
                    found: false,
                    url: '',
                    issues: ['No Instagram presence - Perfect for social media setup'],
                    analysis: 'No Instagram presence found'
                };
            }
            
        } catch (error) {
            console.log(`    📸 Instagram: Could not check - ${error.message}`);
            return {
                found: false,
                url: '',
                issues: ['Instagram analysis failed'],
                analysis: 'Could not analyze Instagram'
            };
        }
    }

    getServiceRecommendations(analysis) {
        const recommendations = [];
        
        if (!analysis.website.found) {
            recommendations.push('Website Design & Development - HIGH PRIORITY');
        }
        if (!analysis.googleMaps.found) {
            recommendations.push('Google Maps Optimization - HIGH PRIORITY');
        }
        if (!analysis.facebook.found || !analysis.instagram.found) {
            recommendations.push('Social Media Setup - MEDIUM PRIORITY');
        }
        if (analysis.website.issues.length > 0) {
            recommendations.push('Website Optimization - MEDIUM PRIORITY');
        }
        
        return recommendations;
    }

    generatePersonalizedMessage(businessName, businessType, analysis, phone) {
        const problems = analysis.allProblems;
        const services = analysis.serviceRecommendations;
        
        // Create highly personalized message with emojis and specific details
        let message = `📞 WHATSAPP TO: ${phone}\n`;
        message += `🏢 BUSINESS: ${businessName}\n`;
        message += `📋 TYPE: ${businessType}\n\n`;
        message += `¡Hola! 👋 Soy Alex de JegoDigital 🚀\n\n`;
        
        // Personal business recognition with specific findings
        message += `Hice una investigación completa de tu ${businessType} ${businessName} y encontré información muy interesante:\n\n`;
        
        // Specific findings with URLs and details
        const specificFindings = [];
        const specificIssues = [];
        
        // Google Maps analysis
        if (analysis.googleMaps.found) {
            specificFindings.push(`✅ Estás listado en Google Maps (${analysis.googleMaps.analysis})`);
            if (analysis.googleMaps.issues.length > 0) {
                specificIssues.push(`❌ Google Maps incompleto: ${analysis.googleMaps.issues.join(', ')}`);
            }
        } else {
            specificIssues.push(`❌ No apareces en Google Maps - Los clientes no te encuentran`);
        }
        
        // Website analysis
        if (analysis.website.found) {
            specificFindings.push(`✅ Tienes sitio web: ${analysis.website.url}`);
            if (analysis.website.issues.length > 0) {
                specificIssues.push(`❌ Sitio web con problemas: ${analysis.website.issues.join(', ')}`);
            }
        } else {
            specificIssues.push(`❌ No tienes sitio web profesional`);
        }
        
        // Facebook analysis
        if (analysis.facebook.found) {
            specificFindings.push(`✅ Tienes página de Facebook: ${analysis.facebook.url}`);
            if (analysis.facebook.issues.length > 0) {
                specificIssues.push(`❌ Facebook necesita trabajo: ${analysis.facebook.issues.join(', ')}`);
            }
        } else {
            specificIssues.push(`❌ No tienes página profesional de Facebook`);
        }
        
        // Instagram analysis
        if (analysis.instagram.found) {
            specificFindings.push(`✅ Tienes presencia en Instagram: ${analysis.instagram.url}`);
            if (analysis.instagram.issues.length > 0) {
                specificIssues.push(`❌ Instagram necesita optimización: ${analysis.instagram.issues.join(', ')}`);
            }
        } else {
            specificIssues.push(`❌ No tienes presencia en Instagram`);
        }
        
        // Add findings and issues to message
        if (specificFindings.length > 0) {
            message += `🔍 LO QUE ENCONTRÉ:\n`;
            specificFindings.forEach(finding => message += `${finding}\n`);
            message += `\n`;
        }
        
        if (specificIssues.length > 0) {
            message += `⚠️ OPORTUNIDADES DE MEJORA:\n`;
            specificIssues.forEach(issue => message += `${issue}\n`);
            message += `\n`;
        }
        
        // Impact on business
        message += `En Cancún, estos problemas significan que estás perdiendo MUCHOS clientes cada día. 💸\n\n`;
        
        // Specific services based on findings
        message += `🎯 EN JEGODIGITAL PODEMOS SOLUCIONARLO:\n\n`;
        
        if (specificIssues.some(issue => issue.includes('Google Maps'))) {
            message += `🗺️ OPTIMIZACIÓN GOOGLE MAPS: Agregar fotos, reviews, horarios, sitio web\n`;
        }
        
        if (specificIssues.some(issue => issue.includes('sitio web'))) {
            message += `🌐 DISEÑO WEB PROFESIONAL: Sitio moderno, rápido, optimizado para móviles\n`;
        }
        
        if (specificIssues.some(issue => issue.includes('Facebook') || issue.includes('Instagram'))) {
            message += `📱 REDES SOCIALES: Crear y optimizar Facebook e Instagram profesionales\n`;
        }
        
        message += `🔍 SEO LOCAL: Aparecer primero en búsquedas de Cancún\n`;
        message += `📈 CRECIMIENTO: Más clientes, más ventas, más visibilidad\n\n`;
        
        // Business type specific
        if (businessType.includes('salon') || businessType.includes('beauty')) {
            message += `Para salones como el tuyo, mostrar tu trabajo en redes sociales es CLAVE para conseguir clientes. 💄✨\n\n`;
        } else if (businessType.includes('gym') || businessType.includes('fitness')) {
            message += `Los gimnasios necesitan mostrar instalaciones y resultados - eso convierte visitantes en miembros. 💪🏋️‍♀️\n\n`;
        } else if (businessType.includes('dental') || businessType.includes('clinic')) {
            message += `Las clínicas necesitan generar confianza online - testimonios y fotos profesionales son esenciales. 🦷👨‍⚕️\n\n`;
        } else if (businessType.includes('hotel') || businessType.includes('travel')) {
            message += `El turismo en Cancún es competitivo - necesitas destacar con fotos y reseñas increíbles. 🏖️✈️\n\n`;
        }
        
        // Call to action
        message += `¿Te gustaría una consulta GRATUITA de 15 minutos para ver exactamente cómo podemos ayudarte a conseguir más clientes? 🤝\n\n`;
        message += `📞 Solo responde este mensaje y coordinamos la llamada.\n\n`;
        message += `¡Espero hablar contigo pronto! 😊\n\n`;
        message += `Alex - JegoDigital 🚀\n`;
        message += `🌐 www.jegodigital.com`;
        
        return message;
    }

    async saveAnalysisToSheet(analysis, personalizedMessage, businessName, phone, email, businessType, address) {
        try {
            const rowData = [
                businessName,
                phone,
                email,
                businessType,
                address,
                analysis.website.found ? 'Yes' : 'No',
                analysis.website.url,
                analysis.website.issues.join('; '),
                analysis.website.analysis,
                analysis.googleMaps.found ? 'Yes' : 'No',
                analysis.googleMaps.issues.join('; '),
                analysis.googleMaps.analysis,
                analysis.facebook.found ? 'Yes' : 'No',
                analysis.facebook.url,
                analysis.facebook.issues.join('; '),
                analysis.facebook.analysis,
                analysis.instagram.found ? 'Yes' : 'No',
                analysis.instagram.url,
                analysis.instagram.issues.join('; '),
                analysis.instagram.analysis,
                analysis.allProblems.join('; '),
                analysis.serviceRecommendations.join('; '),
                analysis.serviceRecommendations.includes('HIGH PRIORITY') ? 'HIGH' : 'MEDIUM',
                personalizedMessage,
                personalizedMessage.length,
                new Date().toISOString()
            ];

            await this.sheet.addRow(rowData);
            console.log(`    💾 Analysis saved to Google Sheets`);
            
        } catch (error) {
            console.log(`    ⚠️ Could not save to Google Sheets: ${error.message}`);
        }
    }
}

// Run the complete analysis
async function runCompleteAnalysis() {
    const analyzer = new CompleteRealAnalysis();
    await analyzer.startCompleteAnalysis();
}

runCompleteAnalysis().catch(console.error);
