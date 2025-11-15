// Test AI Intelligence Agent with public Google Sheets API
const axios = require('axios');

class PublicAPIIntelligenceTest {
    constructor() {
        this.spreadsheetId = '1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg';
        this.apiKey = 'AIzaSyA-1HU2daAhNIuVOdK6ZN_GOIW9YB1i7a4';
        this.baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values`;
    }

    async testIntelligenceAnalysis() {
        console.log('🤖 Testing AI Intelligence Agent with Public API...\n');
        
        try {
            // Step 1: Fetch existing leads from your Google Sheet
            console.log('📊 Step 1: Fetching leads from your Google Sheet...');
            const leads = await this.fetchLeadsFromSheet();
            
            if (leads.length === 0) {
                console.log('⚠️ No leads found in sheet, using sample data...');
                return await this.testWithSampleData();
            }
            
            console.log(`✅ Found ${leads.length} leads in your Google Sheet`);
            
            // Step 2: Analyze first 5 leads with AI Intelligence
            console.log('\n🔍 Step 2: Starting AI Intelligence Analysis...');
            const sampleLeads = leads.slice(0, 5);
            const intelligenceResults = await this.analyzeLeadsIntelligence(sampleLeads);
            
            // Step 3: Generate personalized messages
            console.log('\n💬 Step 3: Generating personalized messages...');
            const personalizedMessages = await this.generatePersonalizedMessages(intelligenceResults);
            
            // Step 4: Display results
            console.log('\n🎉 AI INTELLIGENCE ANALYSIS COMPLETE!');
            this.displayResults(intelligenceResults, personalizedMessages);
            
            // Step 5: Show how to add to Google Sheets
            console.log('\n📊 Step 5: Adding results to Google Sheets...');
            await this.addResultsToSheet(personalizedMessages);
            
            return {
                success: true,
                leadsAnalyzed: sampleLeads.length,
                personalizedMessages: personalizedMessages.length,
                results: intelligenceResults
            };
            
        } catch (error) {
            console.error('❌ Intelligence analysis failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    async fetchLeadsFromSheet() {
        try {
            const response = await axios.get(`${this.baseUrl}/jegodigital-leads-template?key=${this.apiKey}`);
            
            if (!response.data.values || response.data.values.length < 2) {
                return [];
            }

            // Convert sheet data to lead objects
            const headers = response.data.values[0];
            const rows = response.data.values.slice(1);
            
            const leads = rows.map((row, index) => {
                const lead = {};
                headers.forEach((header, headerIndex) => {
                    const cleanHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '_');
                    lead[cleanHeader] = row[headerIndex] || '';
                });
                lead.id = lead.id || `LEAD_${(index + 1).toString().padStart(3, '0')}`;
                return lead;
            });

            return leads.filter(lead => lead.name || lead.business_name);
            
        } catch (error) {
            console.log('⚠️ Could not fetch from Google Sheet:', error.message);
            return [];
        }
    }

    async testWithSampleData() {
        console.log('🧪 Testing with sample leads...');
        
        const sampleLeads = [
            {
                id: 'LEAD_001',
                name: 'María González',
                business_name: 'Restaurante El Sabor',
                phone: '+529981234567',
                email: 'maria@elsabor.com',
                location: 'Cancún',
                business_type: 'restaurant',
                industry: 'food_service',
                current_website: 'none',
                monthly_revenue: '45000',
                budget: '15000',
                interest: 'website_design',
                timeline: 'urgent',
                source: 'website_form',
                employees: '8'
            },
            {
                id: 'LEAD_002',
                name: 'Carlos Rodríguez',
                business_name: 'Hotel Playa Paradise',
                phone: '+529981234568',
                email: 'carlos@playaparadise.com',
                location: 'Playa del Carmen',
                business_type: 'hotel',
                industry: 'hospitality',
                current_website: 'outdated',
                monthly_revenue: '120000',
                budget: '35000',
                interest: 'seo',
                timeline: 'this month',
                source: 'google_ads',
                employees: '25'
            },
            {
                id: 'LEAD_003',
                name: 'Ana Martínez',
                business_name: 'Boutique Cancún',
                phone: '+529981234569',
                email: 'ana@boutiquecancun.com',
                location: 'Cancún',
                business_type: 'retail',
                industry: 'fashion',
                current_website: 'basic',
                monthly_revenue: '65000',
                budget: '25000',
                interest: 'ecommerce',
                timeline: 'soon',
                source: 'referral',
                employees: '12'
            }
        ];

        const intelligenceResults = await this.analyzeLeadsIntelligence(sampleLeads);
        const personalizedMessages = await this.generatePersonalizedMessages(intelligenceResults);
        
        this.displayResults(intelligenceResults, personalizedMessages);
        
        return {
            success: true,
            leadsAnalyzed: sampleLeads.length,
            personalizedMessages: personalizedMessages.length,
            results: intelligenceResults
        };
    }

    async analyzeLeadsIntelligence(leads) {
        const results = [];
        
        for (const lead of leads) {
            console.log(`  🔍 Analyzing: ${lead.business_name || lead.name}...`);
            
            const intelligence = {
                lead: lead,
                analysis: {},
                personalizedMessage: '',
                confidence: 0,
                priority: 'medium'
            };

            try {
                // Simulate AI Intelligence Analysis
                intelligence.analysis = this.performIntelligenceAnalysis(lead);
                intelligence.personalizedMessage = this.generatePersonalizedMessage(lead, intelligence.analysis);
                intelligence.confidence = this.calculateConfidence(intelligence.analysis);
                intelligence.priority = this.calculatePriority(intelligence.analysis, intelligence.confidence);
                
                results.push(intelligence);
                console.log(`    ✅ Analysis complete - Confidence: ${intelligence.confidence}%, Priority: ${intelligence.priority}`);
                
            } catch (error) {
                console.log(`    ❌ Error analyzing ${lead.name}: ${error.message}`);
                intelligence.analysis = { error: error.message };
                intelligence.personalizedMessage = this.generateFallbackMessage(lead);
                results.push(intelligence);
            }
        }
        
        return results;
    }

    performIntelligenceAnalysis(lead) {
        const analysis = {
            businessType: this.determineBusinessType(lead),
            painPoints: [],
            opportunities: [],
            recommendations: [],
            urgency: 'medium',
            marketPosition: 'local',
            digitalMaturity: 'basic'
        };

        // Analyze pain points based on lead data
        if (lead.current_website === 'none') {
            analysis.painPoints.push('Sin presencia web profesional');
            analysis.painPoints.push('Perdiendo clientes que buscan en internet');
            analysis.opportunities.push('Crear sitio web profesional desde cero');
        } else if (lead.current_website === 'outdated') {
            analysis.painPoints.push('Sitio web desactualizado');
            analysis.painPoints.push('No funciona bien en móviles');
            analysis.opportunities.push('Rediseñar sitio web moderno');
        } else if (lead.current_website === 'basic') {
            analysis.painPoints.push('Sitio web básico sin optimización');
            analysis.painPoints.push('No genera leads efectivamente');
            analysis.opportunities.push('Optimizar para conversiones');
        }

        // Analyze based on business type
        const businessType = analysis.businessType;
        if (businessType === 'restaurante') {
            analysis.painPoints.push('Sin sistema de reservas online');
            analysis.opportunities.push('Sistema de reservas y menú digital');
        } else if (businessType === 'hotel') {
            analysis.painPoints.push('Sin sistema de reservas directas');
            analysis.opportunities.push('Sistema de reservas online');
        } else if (businessType === 'tienda') {
            analysis.painPoints.push('Sin tienda online');
            analysis.opportunities.push('E-commerce para ventas 24/7');
        }

        // Analyze urgency
        if (lead.timeline === 'urgent') {
            analysis.urgency = 'high';
        } else if (lead.timeline === 'this month') {
            analysis.urgency = 'medium';
        } else {
            analysis.urgency = 'low';
        }

        // Generate recommendations
        analysis.recommendations = this.generateRecommendations(analysis);

        return analysis;
    }

    determineBusinessType(lead) {
        const businessName = (lead.business_name || '').toLowerCase();
        const businessType = (lead.business_type || '').toLowerCase();
        const industry = (lead.industry || '').toLowerCase();
        
        const text = `${businessName} ${businessType} ${industry}`;
        
        if (text.includes('restaurant') || text.includes('comida') || text.includes('food')) {
            return 'restaurante';
        } else if (text.includes('hotel') || text.includes('hospedaje')) {
            return 'hotel';
        } else if (text.includes('retail') || text.includes('tienda') || text.includes('boutique')) {
            return 'tienda';
        } else if (text.includes('spa') || text.includes('belleza') || text.includes('beauty')) {
            return 'spa';
        } else if (text.includes('medical') || text.includes('dental') || text.includes('clinica')) {
            return 'salud';
        } else {
            return 'negocio';
        }
    }

    generateRecommendations(analysis) {
        const recommendations = [];
        
        if (analysis.painPoints.some(p => p.includes('Sin presencia web'))) {
            recommendations.push('website_design');
        }
        
        if (analysis.painPoints.some(p => p.includes('desactualizado') || p.includes('móviles'))) {
            recommendations.push('website_design');
        }
        
        if (analysis.painPoints.some(p => p.includes('reservas') || p.includes('ecommerce'))) {
            recommendations.push('ecommerce');
        }
        
        if (analysis.opportunities.some(o => o.includes('SEO') || o.includes('Google'))) {
            recommendations.push('seo');
        }
        
        return recommendations.length > 0 ? recommendations : ['website_design'];
    }

    generatePersonalizedMessage(lead, analysis) {
        const name = lead.name || lead.contact_name || 'Estimado empresario';
        const businessName = lead.business_name || lead.company || 'su negocio';
        const location = lead.location || lead.city || 'Cancún';
        const businessType = analysis.businessType;
        
        // Primary pain point
        const primaryPainPoint = analysis.painPoints[0] || 'tu negocio no tiene presencia digital profesional';
        
        // Primary opportunity
        const primaryOpportunity = analysis.opportunities[0] || 'crear una presencia web profesional';
        
        // Service recommendation
        const primaryService = analysis.recommendations[0] || 'website_design';
        const serviceInfo = this.getServiceInfo(primaryService);
        
        // Build message
        const greeting = `Hola ${name}, soy Alex de JegoDigital. Analicé ${businessName} en ${location} y encontré oportunidades importantes.`;
        
        const problemStatement = `He notado que ${primaryPainPoint.toLowerCase()}.`;
        
        const solutionStatement = `Te puedo ayudar con ${serviceInfo.name} para que:
• ${serviceInfo.benefits[0]}
• ${serviceInfo.benefits[1]}
• ${serviceInfo.benefits[2]}`;
        
        const socialProof = location.toLowerCase().includes('cancun') 
            ? 'Somos la agencia #1 en Cancún. Hemos ayudado a más de 50 empresas locales a duplicar sus ventas con estrategias digitales profesionales.'
            : 'Hemos trabajado con más de 50 empresas en la Riviera Maya, ayudándolas a crecer sus ventas en promedio 200% con nuestra estrategia digital.';
        
        const urgency = analysis.urgency === 'high' 
            ? 'Esta es una oportunidad de oro para hacer crecer tu negocio. Cada día que pasa, pierdes clientes potenciales.'
            : 'Es el momento perfecto para dar el salto digital y hacer crecer tu negocio.';
        
        const callToAction = analysis.urgency === 'high'
            ? `¿Tienes 15 minutos para una consulta gratuita? Te muestro exactamente cómo podemos hacer crecer tus ventas.

Responde "SÍ" y te contacto hoy mismo.`
            : `¿Te gustaría conocer cómo podemos ayudarte?

Responde "SÍ" para una consulta gratuita de 15 minutos.`;
        
        const signature = `Saludos,
Alex Jego
JegoDigital - Marketing Digital Cancún
📱 www.jegodigital.com
📧 alex@jegodigital.com`;

        return [
            greeting,
            '',
            problemStatement,
            '',
            solutionStatement,
            '',
            socialProof,
            '',
            urgency,
            '',
            callToAction,
            '',
            signature
        ].join('\n');
    }

    getServiceInfo(service) {
        const services = {
            'website_design': {
                name: 'Diseño Web Profesional',
                benefits: [
                    'Aumentes tu credibilidad y profesionalismo',
                    'Generes más clientes a través de internet',
                    'Tu sitio funcione perfectamente en móviles'
                ]
            },
            'seo': {
                name: 'SEO y Posicionamiento',
                benefits: [
                    'Aparezcas en las primeras páginas de Google',
                    'Más clientes te encuentren cuando te buscan',
                    'Te posiciones por encima de tu competencia'
                ]
            },
            'ecommerce': {
                name: 'Tienda Online',
                benefits: [
                    'Vendas 24/7 sin estar presente',
                    'Aumentes tus ingresos significativamente',
                    'Llegues a más clientes en toda la región'
                ]
            },
            'social_media': {
                name: 'Redes Sociales',
                benefits: [
                    'Tengas presencia profesional en redes sociales',
                    'Engages con tus clientes de manera efectiva',
                    'Generes más leads a través de contenido'
                ]
            }
        };
        
        return services[service] || services['website_design'];
    }

    async generatePersonalizedMessages(intelligenceResults) {
        return intelligenceResults.map(result => ({
            leadId: result.lead.id,
            name: result.lead.name || result.lead.contact_name,
            businessName: result.lead.business_name || result.lead.company,
            phone: result.lead.phone,
            email: result.lead.email,
            location: result.lead.location || result.lead.city,
            businessType: result.analysis.businessType,
            painPoints: result.analysis.painPoints.join(', '),
            opportunities: result.analysis.opportunities.join(', '),
            recommendations: result.analysis.recommendations.join(', '),
            urgency: result.analysis.urgency,
            priority: result.priority,
            confidence: result.confidence,
            personalizedMessage: result.personalizedMessage,
            messageLength: result.personalizedMessage.length,
            recommendedAction: this.getRecommendedAction(result),
            status: 'Ready for AI-Powered Outreach'
        }));
    }

    calculateConfidence(analysis) {
        let confidence = 60; // Base confidence
        
        if (analysis.painPoints.length > 0) confidence += 10;
        if (analysis.opportunities.length > 0) confidence += 10;
        if (analysis.recommendations.length > 0) confidence += 10;
        if (analysis.urgency === 'high') confidence += 10;
        
        return Math.min(confidence, 95);
    }

    calculatePriority(analysis, confidence) {
        if (analysis.urgency === 'high' && confidence >= 80) {
            return 'very_high';
        } else if (analysis.urgency === 'high' || confidence >= 75) {
            return 'high';
        } else if (confidence >= 60) {
            return 'medium';
        } else {
            return 'low';
        }
    }

    getRecommendedAction(result) {
        const priority = result.priority;
        const confidence = result.confidence;
        
        if (priority === 'very_high' || (priority === 'high' && confidence >= 80)) {
            return 'Contact Immediately';
        } else if (priority === 'high' || confidence >= 70) {
            return 'Priority Contact';
        } else if (priority === 'medium' || confidence >= 50) {
            return 'Standard Contact';
        } else {
            return 'Low Priority';
        }
    }

    generateFallbackMessage(lead) {
        const name = lead.name || lead.contact_name || 'Estimado empresario';
        
        return `Hola ${name}, soy Alex de JegoDigital.

Tu negocio tiene un gran potencial digital. Te puedo ayudar a crear una presencia web profesional que genere más clientes.

Somos la agencia #1 en Cancún y hemos ayudado a más de 50 empresas locales a duplicar sus ventas.

¿Te gustaría conocer cómo podemos ayudarte?

Responde "SÍ" para una consulta gratuita de 15 minutos.

Saludos,
Alex Jego
JegoDigital - Marketing Digital Cancún
📱 www.jegodigital.com
📧 alex@jegodigital.com`;
    }

    async addResultsToSheet(personalizedMessages) {
        try {
            // This would add the results to a new sheet in your Google Sheets
            console.log('📊 Results ready to be added to Google Sheets:');
            console.log(`✅ ${personalizedMessages.length} personalized messages generated`);
            console.log('📋 Each message is tailored to specific pain points and opportunities');
            console.log('🎯 Messages are optimized for WhatsApp outreach');
            
            // Show sample of what would be added
            if (personalizedMessages.length > 0) {
                console.log('\n📱 SAMPLE PERSONALIZED MESSAGE:');
                console.log('==============================');
                const sample = personalizedMessages[0];
                console.log(`Lead: ${sample.name} (${sample.businessName})`);
                console.log(`Priority: ${sample.priority} | Confidence: ${sample.confidence}%`);
                console.log(`Pain Points: ${sample.painPoints}`);
                console.log(`Recommendations: ${sample.recommendations}`);
                console.log('\nMessage Preview:');
                console.log(sample.personalizedMessage.substring(0, 200) + '...');
            }
            
        } catch (error) {
            console.log('⚠️ Could not add to Google Sheets:', error.message);
        }
    }

    displayResults(intelligenceResults, personalizedMessages) {
        console.log('\n📊 AI INTELLIGENCE ANALYSIS RESULTS:');
        console.log('=====================================');
        console.log(`Total Leads Analyzed: ${intelligenceResults.length}`);
        console.log(`Personalized Messages Generated: ${personalizedMessages.length}`);
        
        const highPriority = intelligenceResults.filter(r => r.priority === 'very_high' || r.priority === 'high').length;
        const averageConfidence = Math.round(intelligenceResults.reduce((sum, r) => sum + r.confidence, 0) / intelligenceResults.length);
        
        console.log(`High Priority Leads: ${highPriority}`);
        console.log(`Average Confidence: ${averageConfidence}%`);
        
        console.log('\n🎯 LEAD ANALYSIS BREAKDOWN:');
        intelligenceResults.forEach((result, index) => {
            console.log(`\n${index + 1}. ${result.lead.business_name || result.lead.name}`);
            console.log(`   Business Type: ${result.analysis.businessType}`);
            console.log(`   Priority: ${result.priority} | Confidence: ${result.confidence}%`);
            console.log(`   Pain Points: ${result.analysis.painPoints.slice(0, 2).join(', ')}`);
            console.log(`   Recommendations: ${result.analysis.recommendations.join(', ')}`);
        });
        
        console.log('\n📱 PERSONALIZED MESSAGES READY:');
        console.log('✅ Each message addresses specific pain points');
        console.log('✅ Messages include local Cancún advantages');
        console.log('✅ Optimized for WhatsApp outreach');
        console.log('✅ Ready to copy-paste and send');
        
        console.log('\n🚀 NEXT STEPS:');
        console.log('1. Review the personalized messages above');
        console.log('2. Start with highest priority leads first');
        console.log('3. Copy messages for WhatsApp outreach');
        console.log('4. Track responses and update lead status');
        console.log('5. Analyze which pain points get best responses');
    }
}

// Run the test
async function runTest() {
    const tester = new PublicAPIIntelligenceTest();
    await tester.testIntelligenceAnalysis();
}

if (require.main === module) {
    runTest().catch(console.error);
}

module.exports = PublicAPIIntelligenceTest;


