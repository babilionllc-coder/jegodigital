const puppeteer = require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

// Load configurations
const googleConfig = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));
const apiKeys = JSON.parse(fs.readFileSync('api-keys-config.json', 'utf8'));

class SingleLeadDeepAnalyzer {
    constructor() {
        this.doc = null;
        this.browser = null;
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
        console.log('🔧 Initializing Single Lead Deep Analyzer...');
        
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
    }

    async getNextLeadToAnalyze() {
        console.log('📋 Getting next lead to analyze...');
        
        const leadsSheet = this.doc.sheetsByTitle['REAL Perfect Leads'];
        await leadsSheet.loadCells();
        
        const rows = await leadsSheet.getRows();
        
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row.get('AI_ANALYZED') || row.get('AI_ANALYZED') === 'NO') {
                console.log(`🎯 Found unanalyzed lead: ${row.get('Business Name')}`);
                return { row, index: i };
            }
        }
        
        console.log('✅ All leads have been analyzed!');
        return null;
    }

    async analyzeWebsite(leadData) {
        console.log(`🔍 Analyzing website for: ${leadData.businessName}`);
        
        if (!leadData.website || leadData.website === 'N/A' || leadData.website === '') {
            return {
                hasWebsite: false,
                issues: ['No website found'],
                recommendations: ['Create professional website'],
                businessType: 'Unknown',
                services: [],
                socialLinks: [],
                contactInfo: {}
            };
        }

        const page = await this.browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

        try {
            await page.goto(leadData.website, { waitUntil: 'networkidle2', timeout: 15000 });
            await new Promise(resolve => setTimeout(resolve, 3000));

            const websiteAnalysis = await page.evaluate(() => {
                const analysis = {
                    hasWebsite: true,
                    issues: [],
                    recommendations: [],
                    businessType: 'Unknown',
                    services: [],
                    socialLinks: [],
                    contactInfo: {},
                    designIssues: [],
                    seoIssues: [],
                    mobileIssues: [],
                    contentIssues: []
                };

                // Check for mobile responsiveness
                const viewport = window.innerWidth;
                if (viewport < 768) {
                    const mobileElements = document.querySelectorAll('*');
                    let mobileIssues = 0;
                    mobileElements.forEach(el => {
                        const style = window.getComputedStyle(el);
                        if (style.fontSize && parseInt(style.fontSize) < 12) mobileIssues++;
                        if (style.width && style.width.includes('px') && parseInt(style.width) > viewport) mobileIssues++;
                    });
                    if (mobileIssues > 5) analysis.mobileIssues.push('Not mobile responsive');
                }

                // Check for design issues
                const images = document.querySelectorAll('img');
                let brokenImages = 0;
                let lowQualityImages = 0;
                images.forEach(img => {
                    if (!img.src || img.src.includes('placeholder')) brokenImages++;
                    if (img.width < 200 || img.height < 200) lowQualityImages++;
                });
                if (brokenImages > 0) analysis.designIssues.push('Broken or placeholder images');
                if (lowQualityImages > 3) analysis.designIssues.push('Low quality images');

                // Check for SEO issues
                const title = document.querySelector('title');
                if (!title || title.textContent.length < 30 || title.textContent.length > 60) {
                    analysis.seoIssues.push('Poor title tag optimization');
                }

                const metaDescription = document.querySelector('meta[name="description"]');
                if (!metaDescription || metaDescription.content.length < 120 || metaDescription.content.length > 160) {
                    analysis.seoIssues.push('Missing or poor meta description');
                }

                const headings = document.querySelectorAll('h1, h2, h3');
                if (headings.length < 3) analysis.seoIssues.push('Poor heading structure');
                if (document.querySelectorAll('h1').length !== 1) analysis.seoIssues.push('Multiple or missing H1 tags');

                // Extract business information
                const text = document.body.textContent.toLowerCase();
                
                // Determine business type
                if (text.includes('restaurant') || text.includes('food') || text.includes('menu')) analysis.businessType = 'Restaurant';
                else if (text.includes('hotel') || text.includes('accommodation')) analysis.businessType = 'Hotel';
                else if (text.includes('clinic') || text.includes('medical') || text.includes('doctor')) analysis.businessType = 'Medical';
                else if (text.includes('salon') || text.includes('beauty') || text.includes('spa')) analysis.businessType = 'Beauty';
                else if (text.includes('gym') || text.includes('fitness') || text.includes('training')) analysis.businessType = 'Fitness';
                else if (text.includes('lawyer') || text.includes('legal') || text.includes('attorney')) analysis.businessType = 'Legal';
                else if (text.includes('real estate') || text.includes('property')) analysis.businessType = 'Real Estate';
                else if (text.includes('shop') || text.includes('store') || text.includes('retail')) analysis.businessType = 'Retail';

                // Extract services
                const serviceKeywords = ['service', 'treatment', 'consultation', 'delivery', 'rental', 'repair', 'installation'];
                serviceKeywords.forEach(keyword => {
                    if (text.includes(keyword)) {
                        const sentences = document.body.textContent.split('.');
                        sentences.forEach(sentence => {
                            if (sentence.toLowerCase().includes(keyword) && sentence.length < 100) {
                                analysis.services.push(sentence.trim());
                            }
                        });
                    }
                });

                // Find social media links
                const links = document.querySelectorAll('a[href]');
                links.forEach(link => {
                    const href = link.href.toLowerCase();
                    if (href.includes('facebook.com')) analysis.socialLinks.push({ platform: 'Facebook', url: link.href });
                    if (href.includes('instagram.com')) analysis.socialLinks.push({ platform: 'Instagram', url: link.href });
                    if (href.includes('twitter.com') || href.includes('x.com')) analysis.socialLinks.push({ platform: 'Twitter', url: link.href });
                    if (href.includes('linkedin.com')) analysis.socialLinks.push({ platform: 'LinkedIn', url: link.href });
                });

                // Extract contact information
                const phoneRegex = /(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
                const phoneMatches = document.body.textContent.match(phoneRegex);
                if (phoneMatches) analysis.contactInfo.phone = phoneMatches[0];

                const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                const emailMatches = document.body.textContent.match(emailRegex);
                if (emailMatches) analysis.contactInfo.email = emailMatches[0];

                // Compile issues
                analysis.issues = [...analysis.designIssues, ...analysis.seoIssues, ...analysis.mobileIssues, ...analysis.contentIssues];
                
                // Generate recommendations
                if (analysis.designIssues.length > 0) analysis.recommendations.push('Professional website redesign');
                if (analysis.seoIssues.length > 0) analysis.recommendations.push('SEO optimization');
                if (analysis.mobileIssues.length > 0) analysis.recommendations.push('Mobile optimization');
                if (analysis.socialLinks.length === 0) analysis.recommendations.push('Social media integration');
                if (analysis.issues.length > 3) analysis.recommendations.push('Complete website overhaul');

                return analysis;
            });

            await page.close();
            return websiteAnalysis;

        } catch (error) {
            console.log(`❌ Error analyzing website: ${error.message}`);
            await page.close();
            return {
                hasWebsite: true,
                issues: ['Website not accessible or slow loading'],
                recommendations: ['Website optimization needed'],
                businessType: 'Unknown',
                services: [],
                socialLinks: [],
                contactInfo: {}
            };
        }
    }

    async analyzeGoogleMaps(leadData) {
        console.log(`🗺️ Analyzing Google Maps presence for: ${leadData.businessName}`);
        
        const page = await this.browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

        try {
            const searchQuery = `${leadData.businessName} ${leadData.location}`;
            await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`, { 
                waitUntil: 'networkidle2', 
                timeout: 15000 
            });
            await new Promise(resolve => setTimeout(resolve, 4000));

            const mapsAnalysis = await page.evaluate(() => {
                const analysis = {
                    isListed: false,
                    rating: null,
                    reviewCount: 0,
                    photos: 0,
                    address: null,
                    phone: null,
                    website: null,
                    hours: null,
                    issues: [],
                    recommendations: []
                };

                // Look for business listing
                const businessCard = document.querySelector('[data-value="Business"]') || 
                                  document.querySelector('.Nv2PK') ||
                                  document.querySelector('.lI9IFe');
                
                if (businessCard) {
                    analysis.isListed = true;

                    // Extract rating
                    const ratingElement = document.querySelector('.MW4etd') || 
                                        document.querySelector('.fontDisplayLarge');
                    if (ratingElement) {
                        analysis.rating = parseFloat(ratingElement.textContent);
                    }

                    // Extract review count
                    const reviewElement = document.querySelector('.HHrUdb') || 
                                        document.querySelector('.fontBodyMedium');
                    if (reviewElement) {
                        const reviewText = reviewElement.textContent;
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
                    const photoElements = document.querySelectorAll('.DaVh4e img, .m6QErb img');
                    analysis.photos = photoElements.length;

                    // Identify issues
                    if (analysis.rating && analysis.rating < 4.0) {
                        analysis.issues.push('Low Google Maps rating');
                    }
                    if (analysis.reviewCount < 5) {
                        analysis.issues.push('Very few reviews');
                    }
                    if (analysis.photos < 3) {
                        analysis.issues.push('Limited photos');
                    }
                    if (!analysis.website) {
                        analysis.issues.push('No website link on Google Maps');
                    }
                    if (!analysis.hours) {
                        analysis.issues.push('Business hours not specified');
                    }

                    // Generate recommendations
                    if (analysis.rating < 4.0) analysis.recommendations.push('Improve Google Maps rating');
                    if (analysis.reviewCount < 10) analysis.recommendations.push('Encourage more reviews');
                    if (analysis.photos < 5) analysis.recommendations.push('Add more photos');
                    if (!analysis.website) analysis.recommendations.push('Add website to Google Maps');
                } else {
                    analysis.issues.push('Not listed on Google Maps');
                    analysis.recommendations.push('Create Google Maps listing');
                }

                return analysis;
            });

            await page.close();
            return mapsAnalysis;

        } catch (error) {
            console.log(`❌ Error analyzing Google Maps: ${error.message}`);
            await page.close();
            return {
                isListed: false,
                rating: null,
                reviewCount: 0,
                photos: 0,
                issues: ['Could not verify Google Maps presence'],
                recommendations: ['Verify Google Maps listing']
            };
        }
    }

    async analyzeSocialMedia(leadData) {
        console.log(`📱 Analyzing social media presence for: ${leadData.businessName}`);
        
        const socialAnalysis = {
            facebook: { exists: false, followers: 0, issues: [], url: null },
            instagram: { exists: false, followers: 0, issues: [], url: null },
            overallIssues: [],
            recommendations: []
        };

        // Check Facebook
        const fbPage = await this.browser.newPage();
        try {
            await fbPage.goto(`https://www.facebook.com/${leadData.businessName.replace(/\s+/g, '')}`, { 
                waitUntil: 'networkidle2', 
                timeout: 10000 
            });
            await new Promise(resolve => setTimeout(resolve, 3000));

            const fbData = await fbPage.evaluate(() => {
                const analysis = { exists: false, followers: 0, issues: [], url: null };
                
                if (!document.querySelector('#loginform')) {
                    analysis.exists = true;
                    analysis.url = window.location.href;
                    
                    const followerText = document.querySelector('._4bl9')?.textContent || 
                                       document.querySelector('.x1lliihq')?.textContent;
                    if (followerText) {
                        const followerMatch = followerText.match(/(\d+)/);
                        if (followerMatch) {
                            analysis.followers = parseInt(followerMatch[1]);
                        }
                    }
                    
                    if (analysis.followers < 100) analysis.issues.push('Low follower count');
                    if (!document.querySelector('img[alt*="profile picture"]')) analysis.issues.push('No profile picture');
                }
                
                return analysis;
            });

            socialAnalysis.facebook = fbData;
            await fbPage.close();

        } catch (error) {
            console.log(`❌ Error checking Facebook: ${error.message}`);
            await fbPage.close();
        }

        // Check Instagram
        const igPage = await this.browser.newPage();
        try {
            await igPage.goto(`https://www.instagram.com/${leadData.businessName.replace(/\s+/g, '').toLowerCase()}/`, { 
                waitUntil: 'networkidle2', 
                timeout: 10000 
            });
            await new Promise(resolve => setTimeout(resolve, 3000));

            const igData = await igPage.evaluate(() => {
                const analysis = { exists: false, followers: 0, issues: [], url: null };
                
                if (document.querySelector('article')) {
                    analysis.exists = true;
                    analysis.url = window.location.href;
                    
                    const followerText = document.querySelector('a[href*="/followers/"] span')?.textContent;
                    if (followerText) {
                        const followerMatch = followerText.match(/(\d+)/);
                        if (followerMatch) {
                            analysis.followers = parseInt(followerMatch[1]);
                        }
                    }
                    
                    if (analysis.followers < 50) analysis.issues.push('Low follower count');
                }
                
                return analysis;
            });

            socialAnalysis.instagram = igData;
            await igPage.close();

        } catch (error) {
            console.log(`❌ Error checking Instagram: ${error.message}`);
            await igPage.close();
        }

        // Compile overall issues and recommendations
        if (!socialAnalysis.facebook.exists && !socialAnalysis.instagram.exists) {
            socialAnalysis.overallIssues.push('No social media presence');
            socialAnalysis.recommendations.push('Create social media profiles');
        } else {
            if (!socialAnalysis.facebook.exists) {
                socialAnalysis.overallIssues.push('No Facebook page');
                socialAnalysis.recommendations.push('Create Facebook business page');
            }
            if (!socialAnalysis.instagram.exists) {
                socialAnalysis.overallIssues.push('No Instagram profile');
                socialAnalysis.recommendations.push('Create Instagram business profile');
            }
        }

        return socialAnalysis;
    }

    generatePersonalizedMessage(leadData, websiteAnalysis, mapsAnalysis, socialAnalysis) {
        const businessName = leadData.businessName;
        const phone = leadData.phoneNumber;
        const businessType = websiteAnalysis.businessType;
        
        let message = `📱 ${phone}\n\n`;
        message += `¡Hola! 👋 Soy Alex de JegoDigital 🚀\n\n`;
        message += `He estado investigando ${businessName} y me impresionó mucho tu negocio ${businessType ? `de ${businessType.toLowerCase()}` : ''} en ${leadData.location} 🏢\n\n`;

        // Add specific findings
        if (!websiteAnalysis.hasWebsite) {
            message += `🔍 NOTÉ QUE: No tienes presencia web profesional. En el mundo digital de hoy, esto significa perder clientes potenciales todos los días 😱\n\n`;
        } else {
            if (websiteAnalysis.issues.length > 0) {
                message += `🔍 ANALICÉ TU SITIO WEB Y ENCONTRÉ:\n`;
                websiteAnalysis.issues.slice(0, 3).forEach(issue => {
                    message += `• ${issue}\n`;
                });
                message += `\n`;
            }
        }

        if (!mapsAnalysis.isListed) {
            message += `🗺️ También noté que no apareces en Google Maps - ¡esto es CRÍTICO para negocios locales como el tuyo! 💔\n\n`;
        } else {
            if (mapsAnalysis.issues.length > 0) {
                message += `🗺️ EN GOOGLE MAPS VI QUE:\n`;
                mapsAnalysis.issues.slice(0, 2).forEach(issue => {
                    message += `• ${issue}\n`;
                });
                message += `\n`;
            }
        }

        if (socialAnalysis.overallIssues.length > 0) {
            message += `📱 REDES SOCIALES: ${socialAnalysis.overallIssues[0]} - estás perdiendo engagement con clientes 💸\n\n`;
        }

        // Add JegoDigital services
        message += `🎨 EN JEGODIGITAL ESPECIALIZAMOS EN:\n`;
        message += `✨ DISEÑO WEB PROFESIONAL - Sitios hermosos y personalizados para tu tipo de negocio\n`;
        message += `🚀 SEO Y OPTIMIZACIÓN - Para que aparezcas en Google cuando busquen tus servicios\n`;
        message += `🗺️ OPTIMIZACIÓN GOOGLE MAPS - Para atraer clientes locales\n`;
        message += `📱 INTEGRACIÓN REDES SOCIALES - Conectamos todo tu marketing digital\n`;
        message += `⚡ ENTREGA RÁPIDA - Tu sitio web listo en 2-3 días\n\n`;

        // Add specific benefits
        message += `🎯 ESPECÍFICAMENTE PARA ${businessName.toUpperCase()}:\n`;
        message += `• Un sitio web hermoso que refleje la calidad de tu ${businessType ? businessType.toLowerCase() : 'negocio'}\n`;
        message += `• Optimización para que clientes te encuentren en Google\n`;
        message += `• Integración completa con Google Maps\n`;
        if (socialAnalysis.facebook.exists || socialAnalysis.instagram.exists) {
            message += `• Conectar tu sitio web con tus redes sociales\n`;
        }
        message += `• Diseño responsive para móviles\n\n`;

        message += `💡 ¿Te gustaría una consulta GRATIS de 15 minutos para ver exactamente cómo podemos hacer crecer ${businessName}? 📞\n\n`;
        message += `🌐 Más info: www.jegodigital.com\n\n`;
        message += `¡Espero tu respuesta! 😊`;

        return message;
    }

    async analyzeSingleLead() {
        console.log('🎯 Starting single lead deep analysis...');
        
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
        const websiteAnalysis = await this.analyzeWebsite(leadData);
        const mapsAnalysis = await this.analyzeGoogleMaps(leadData);
        const socialAnalysis = await this.analyzeSocialMedia(leadData);

        // Generate personalized message
        const personalizedMessage = this.generatePersonalizedMessage(leadData, websiteAnalysis, mapsAnalysis, socialAnalysis);

        // Save results to Google Sheets
        await this.saveAnalysisResults(row, websiteAnalysis, mapsAnalysis, socialAnalysis, personalizedMessage);

        console.log('\n✅ Analysis complete!');
        console.log('📱 Personalized message generated');
        console.log('📊 Results saved to Google Sheets');
        
        return {
            leadData,
            websiteAnalysis,
            mapsAnalysis,
            socialAnalysis,
            personalizedMessage
        };
    }

    async saveAnalysisResults(row, websiteAnalysis, mapsAnalysis, socialAnalysis, personalizedMessage) {
        console.log('💾 Saving analysis results...');
        
        // Update the lead row with analysis results
        row.set('AI_ANALYZED', 'YES');
        row.set('WEBSITE_ANALYSIS', websiteAnalysis.hasWebsite ? 'HAS_WEBSITE' : 'NO_WEBSITE');
        row.set('GOOGLE_MAPS', mapsAnalysis.isListed ? 'LISTED' : 'NOT_LISTED');
        row.set('FACEBOOK', socialAnalysis.facebook.exists ? 'EXISTS' : 'NO_FACEBOOK');
        row.set('INSTAGRAM', socialAnalysis.instagram.exists ? 'EXISTS' : 'NO_INSTAGRAM');
        row.set('BUSINESS_TYPE', websiteAnalysis.businessType);
        row.set('ISSUES_FOUND', websiteAnalysis.issues.length + mapsAnalysis.issues.length + socialAnalysis.overallIssues.length);
        row.set('PERSONALIZED_MESSAGE', personalizedMessage);
        row.set('ANALYSIS_DATE', new Date().toISOString());
        
        await row.save();
        console.log('✅ Results saved to Google Sheets');
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
    const analyzer = new SingleLeadDeepAnalyzer();
    
    try {
        await analyzer.initialize();
        const result = await analyzer.analyzeSingleLead();
        
        if (result) {
            console.log('\n🎉 LEAD ANALYSIS COMPLETE!');
            console.log('=' .repeat(50));
            console.log(`Business: ${result.leadData.businessName}`);
            console.log(`Phone: ${result.leadData.phoneNumber}`);
            console.log(`Has Website: ${result.websiteAnalysis.hasWebsite}`);
            console.log(`Google Maps Listed: ${result.mapsAnalysis.isListed}`);
            console.log(`Facebook: ${result.socialAnalysis.facebook.exists}`);
            console.log(`Instagram: ${result.socialAnalysis.instagram.exists}`);
            console.log('\n📱 PERSONALIZED MESSAGE:');
            console.log(result.personalizedMessage);
        }
        
    } catch (error) {
        console.error('❌ Error during analysis:', error);
    } finally {
        await analyzer.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = SingleLeadDeepAnalyzer;
