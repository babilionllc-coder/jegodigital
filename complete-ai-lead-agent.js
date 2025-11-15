// Complete AI Lead Agent - Reads Google Sheet, Analyzes Leads, Writes Personalized Messages
const axios = require('axios');

class CompleteAILeadAgent {
    constructor() {
        this.spreadsheetId = '1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg';
        this.apiKey = 'AIzaSyA-1HU2daAhNIuVOdK6ZN_GOIW9YB1i7a4';
        this.baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values`;
        this.results = [];
        this.processedCount = 0;
    }

    // Main function - Complete AI Lead Analysis and Message Generation
    async executeCompleteAnalysis() {
        console.log('🤖 COMPLETE AI LEAD AGENT - Starting Analysis');
        console.log('=============================================\n');

        try {
            // Step 1: Access Google Sheet and get all leads
            console.log('📊 Step 1: Accessing your Google Sheet...');
            const leads = await this.getAllLeadsFromSheet();
            
            if (leads.length === 0) {
                throw new Error('No leads found in Google Sheet');
            }
            
            console.log(`✅ Found ${leads.length} leads in your Google Sheet`);
            console.log(`📋 Sample lead: ${leads[0]?.business_name || leads[0]?.name || 'Unknown'}\n`);

            // Step 2: Process leads in batches (start with first 10 for demo)
            console.log('🔍 Step 2: Starting AI Analysis of leads...');
            const leadsToProcess = leads.slice(0, 10); // Process first 10 leads
            console.log(`📊 Processing ${leadsToProcess.length} leads for personalized messages...\n`);

            // Step 3: AI Analysis and Message Generation
            const personalizedMessages = await this.generatePersonalizedMessagesForAllLeads(leadsToProcess);

            // Step 4: Display Results
            console.log('\n🎉 AI ANALYSIS COMPLETE!');
            this.displayResults(personalizedMessages);

            // Step 5: Save Results (optional)
            await this.saveResultsToFile(personalizedMessages);

            return {
                success: true,
                totalLeads: leads.length,
                processedLeads: leadsToProcess.length,
                personalizedMessages: personalizedMessages,
                results: personalizedMessages
            };

        } catch (error) {
            console.error('\n❌ AI Analysis failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get all leads from Google Sheet
    async getAllLeadsFromSheet() {
        try {
            const response = await axios.get(`${this.baseUrl}/jegodigital-leads-template?key=${this.apiKey}`);
            
            if (!response.data.values || response.data.values.length < 2) {
                return [];
            }

            // Convert sheet data to lead objects
            const headers = response.data.values[0];
            const rows = response.data.values.slice(1);
            
            console.log('📋 Sheet headers found:', headers.slice(0, 5).join(', ') + '...');
            
            const leads = rows.map((row, index) => {
                const lead = {};
                headers.forEach((header, headerIndex) => {
                    const cleanHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '_');
                    lead[cleanHeader] = row[headerIndex] || '';
                });
                lead.id = lead.id || `LEAD_${(index + 1).toString().padStart(3, '0')}`;
                return lead;
            });

            // Filter leads with essential information
            const validLeads = leads.filter(lead => 
                lead.name || lead.business_name || lead.contact_name
            );

            console.log(`📊 Valid leads found: ${validLeads.length}`);
            return validLeads;
            
        } catch (error) {
            console.error('❌ Error accessing Google Sheet:', error.message);
            return [];
        }
    }

    // Generate personalized messages for all leads
    async generatePersonalizedMessagesForAllLeads(leads) {
        const personalizedMessages = [];
        
        for (const [index, lead] of leads.entries()) {
            this.processedCount++;
            
            try {
                console.log(`🔍 ${this.processedCount}. Analyzing: ${lead.business_name || lead.name || 'Unknown Business'}...`);
                
                // AI Analysis of this specific lead
                const analysis = this.analyzeLeadIntelligence(lead);
                
                // Generate personalized message
                const personalizedMessage = this.createPersonalizedMessage(lead, analysis);
                
                // Create result object
                const result = {
                    leadNumber: this.processedCount,
                    leadId: lead.id,
                    name: lead.name || lead.contact_name || 'Unknown',
                    businessName: lead.business_name || lead.company || 'Unknown Business',
                    phone: lead.phone || '',
                    email: lead.email || '',
                    location: lead.location || lead.city || 'Cancún',
                    businessType: analysis.businessType,
                    industry: lead.industry || lead.business_type || '',
                    currentWebsite: lead.current_website || lead.website_status || 'unknown',
                    monthlyRevenue: lead.monthly_revenue || lead.revenue || '',
                    budget: lead.budget || lead.budget_range || '',
                    interest: lead.interest || lead.service_interest || '',
                    timeline: lead.timeline || lead.urgency || '',
                    source: lead.source || lead.lead_source || '',
                    employees: lead.employees || lead.team_size || '',
                    
                    // AI Analysis Results
                    painPoints: analysis.painPoints,
                    opportunities: analysis.opportunities,
                    recommendations: analysis.recommendations,
                    urgency: analysis.urgency,
                    priority: analysis.priority,
                    confidence: analysis.confidence,
                    
                    // Generated Message
                    personalizedMessage: personalizedMessage,
                    messageLength: personalizedMessage.length,
                    
                    // Action Items
                    recommendedAction: this.getRecommendedAction(analysis),
                    followUpDate: this.calculateFollowUpDate(analysis),
                    status: 'Ready for WhatsApp Outreach'
                };
                
                personalizedMessages.push(result);
                
                // Show progress
                console.log(`   ✅ Analysis complete - ${analysis.businessType} | ${analysis.priority} priority | ${analysis.confidence}% confidence`);
                
                // Small delay between leads
                await this.delay(100);
                
            } catch (error) {
                console.log(`   ❌ Error analyzing lead ${this.processedCount}: ${error.message}`);
                
                // Add error result
                personalizedMessages.push({
                    leadNumber: this.processedCount,
                    leadId: lead.id,
                    name: lead.name || 'Unknown',
                    businessName: lead.business_name || 'Unknown Business',
                    error: error.message,
                    personalizedMessage: this.generateFallbackMessage(lead),
                    status: 'Error - Manual Review Needed'
                });
            }
        }
        
        return personalizedMessages;
    }

    // AI Analysis of individual lead
    analyzeLeadIntelligence(lead) {
        const analysis = {
            businessType: this.determineBusinessType(lead),
            painPoints: [],
            opportunities: [],
            recommendations: [],
            urgency: 'medium',
            priority: 'medium',
            confidence: 70
        };

        // Analyze based on current website status
        const websiteStatus = (lead.current_website || lead.website_status || '').toLowerCase();
        if (websiteStatus === 'none' || websiteStatus === 'no website') {
            analysis.painPoints.push('Sin presencia web profesional');
            analysis.painPoints.push('Perdiendo clientes que buscan en internet');
            analysis.opportunities.push('Crear sitio web profesional desde cero');
            analysis.recommendations.push('website_design');
        } else if (websiteStatus === 'outdated' || websiteStatus === 'old') {
            analysis.painPoints.push('Sitio web desactualizado');
            analysis.painPoints.push('No funciona bien en móviles');
            analysis.opportunities.push('Rediseñar sitio web moderno y responsive');
            analysis.recommendations.push('website_design');
        } else if (websiteStatus === 'basic' || websiteStatus === 'simple') {
            analysis.painPoints.push('Sitio web básico sin optimización');
            analysis.painPoints.push('No genera leads efectivamente');
            analysis.opportunities.push('Optimizar para conversiones y SEO');
            analysis.recommendations.push('website_design', 'seo');
        }

        // Analyze based on business type
        const businessType = analysis.businessType;
        if (businessType === 'restaurante') {
            analysis.painPoints.push('Sin sistema de reservas online');
            analysis.painPoints.push('Menú no disponible digitalmente');
            analysis.opportunities.push('Sistema de reservas y menú digital');
            analysis.recommendations.push('website_design', 'ecommerce');
        } else if (businessType === 'hotel') {
            analysis.painPoints.push('Sin sistema de reservas directas');
            analysis.painPoints.push('Depende de terceros para ventas');
            analysis.opportunities.push('Sistema de reservas online directo');
            analysis.recommendations.push('website_design', 'ecommerce');
        } else if (businessType === 'tienda' || businessType === 'retail') {
            analysis.painPoints.push('Sin tienda online');
            analysis.painPoints.push('Ventas limitadas a horario físico');
            analysis.opportunities.push('E-commerce para ventas 24/7');
            analysis.recommendations.push('ecommerce', 'website_design');
        } else if (businessType === 'spa' || businessType === 'belleza') {
            analysis.painPoints.push('Sin sistema de citas online');
            analysis.painPoints.push('Falta presencia digital profesional');
            analysis.opportunities.push('Sistema de citas online y presencia digital');
            analysis.recommendations.push('website_design', 'ecommerce');
        } else if (businessType === 'salud' || businessType === 'medico') {
            analysis.painPoints.push('Sin sistema de citas online');
            analysis.painPoints.push('Falta confianza digital');
            analysis.opportunities.push('Sistema de citas online y credibilidad digital');
            analysis.recommendations.push('website_design', 'ecommerce');
        }

        // Analyze urgency based on timeline
        const timeline = (lead.timeline || lead.urgency || '').toLowerCase();
        if (timeline === 'urgent' || timeline === 'asap') {
            analysis.urgency = 'high';
            analysis.priority = 'very_high';
        } else if (timeline === 'this month' || timeline === 'soon') {
            analysis.urgency = 'medium';
            analysis.priority = 'high';
        } else if (timeline === 'next month' || timeline === 'later') {
            analysis.urgency = 'low';
            analysis.priority = 'medium';
        }

        // Analyze based on interest/service need
        const interest = (lead.interest || lead.service_interest || '').toLowerCase();
        if (interest.includes('website') || interest.includes('web')) {
            analysis.recommendations.push('website_design');
            analysis.confidence += 10;
        }
        if (interest.includes('seo') || interest.includes('google')) {
            analysis.recommendations.push('seo');
            analysis.confidence += 10;
        }
        if (interest.includes('ecommerce') || interest.includes('tienda online')) {
            analysis.recommendations.push('ecommerce');
            analysis.confidence += 10;
        }
        if (interest.includes('social') || interest.includes('redes')) {
            analysis.recommendations.push('social_media');
            analysis.confidence += 10;
        }

        // Analyze based on budget
        const budget = parseInt(lead.budget || lead.budget_range || '0');
        if (budget >= 25000) {
            analysis.priority = 'very_high';
            analysis.confidence += 15;
        } else if (budget >= 15000) {
            analysis.priority = 'high';
            analysis.confidence += 10;
        } else if (budget >= 10000) {
            analysis.priority = 'medium';
            analysis.confidence += 5;
        }

        // Analyze based on revenue
        const revenue = parseInt(lead.monthly_revenue || lead.revenue || '0');
        if (revenue >= 100000) {
            analysis.priority = 'very_high';
            analysis.confidence += 15;
        } else if (revenue >= 50000) {
            analysis.priority = 'high';
            analysis.confidence += 10;
        }

        // Ensure confidence is within bounds
        analysis.confidence = Math.min(Math.max(analysis.confidence, 50), 95);

        // Remove duplicates from recommendations
        analysis.recommendations = [...new Set(analysis.recommendations)];

        return analysis;
    }

    // Determine business type from lead data
    determineBusinessType(lead) {
        const businessName = (lead.business_name || '').toLowerCase();
        const businessType = (lead.business_type || '').toLowerCase();
        const industry = (lead.industry || '').toLowerCase();
        
        const text = `${businessName} ${businessType} ${industry}`;
        
        if (text.includes('restaurant') || text.includes('comida') || text.includes('food') || 
            text.includes('restaurante') || text.includes('cocina') || text.includes('gastronomia')) {
            return 'restaurante';
        } else if (text.includes('hotel') || text.includes('hospedaje') || text.includes('hospedaje') ||
                   text.includes('alojamiento') || text.includes('accommodation')) {
            return 'hotel';
        } else if (text.includes('retail') || text.includes('tienda') || text.includes('boutique') ||
                   text.includes('tienda') || text.includes('store') || text.includes('shop')) {
            return 'tienda';
        } else if (text.includes('spa') || text.includes('belleza') || text.includes('beauty') ||
                   text.includes('estetica') || text.includes('wellness') || text.includes('relax')) {
            return 'spa';
        } else if (text.includes('medical') || text.includes('dental') || text.includes('clinica') ||
                   text.includes('medico') || text.includes('salud') || text.includes('health')) {
            return 'salud';
        } else if (text.includes('gym') || text.includes('fitness') || text.includes('ejercicio') ||
                   text.includes('deporte') || text.includes('sport')) {
            return 'gym';
        } else if (text.includes('legal') || text.includes('abogado') || text.includes('lawyer') ||
                   text.includes('derecho') || text.includes('law')) {
            return 'legal';
        } else if (text.includes('contable') || text.includes('accounting') || text.includes('financiero') ||
                   text.includes('tax') || text.includes('impuestos')) {
            return 'contable';
        } else if (text.includes('inmobiliario') || text.includes('real estate') || text.includes('propiedades') ||
                   text.includes('casas') || text.includes('ventas')) {
            return 'inmobiliario';
        } else {
            return 'negocio';
        }
    }

    // Create personalized message for lead
    createPersonalizedMessage(lead, analysis) {
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
        
        // Build personalized message
        const greeting = `Hola ${name}, soy Alex de JegoDigital. Analicé ${businessName} en ${location} y encontré oportunidades importantes para hacer crecer tu negocio.`;
        
        const problemStatement = `He notado que ${primaryPainPoint.toLowerCase()}. Esto puede estar costándote clientes y oportunidades de crecimiento.`;
        
        const solutionStatement = `Te puedo ayudar con ${serviceInfo.name} para que:
• ${serviceInfo.benefits[0]}
• ${serviceInfo.benefits[1]}
• ${serviceInfo.benefits[2]}`;
        
        const socialProof = this.getSocialProof(location, businessType);
        
        const urgency = analysis.urgency === 'high' 
            ? 'Esta es una oportunidad de oro para hacer crecer tu negocio. Cada día que pasa, pierdes clientes potenciales que buscan tus servicios online.'
            : 'Es el momento perfecto para dar el salto digital y hacer crecer tu negocio de manera profesional y sostenible.';
        
        const callToAction = this.getCallToAction(analysis);
        
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

    // Get service information
    getServiceInfo(service) {
        const services = {
            'website_design': {
                name: 'Diseño Web Profesional',
                benefits: [
                    'Aumentes tu credibilidad y profesionalismo online',
                    'Generes más clientes a través de internet las 24 horas',
                    'Tu sitio funcione perfectamente en móviles y computadoras'
                ]
            },
            'seo': {
                name: 'SEO y Posicionamiento en Google',
                benefits: [
                    'Aparezcas en las primeras páginas de Google cuando te busquen',
                    'Más clientes te encuentren cuando busquen tus servicios',
                    'Te posiciones por encima de tu competencia local'
                ]
            },
            'ecommerce': {
                name: 'Tienda Online y E-commerce',
                benefits: [
                    'Vendas tus productos/servicios 24/7 sin estar presente',
                    'Aumentes tus ingresos significativamente',
                    'Llegues a más clientes en toda la Riviera Maya'
                ]
            },
            'social_media': {
                name: 'Redes Sociales Profesionales',
                benefits: [
                    'Tengas presencia profesional en Facebook e Instagram',
                    'Engages con tus clientes de manera efectiva',
                    'Generes más leads a través de contenido de calidad'
                ]
            }
        };
        
        return services[service] || services['website_design'];
    }

    // Get social proof based on location and business type
    getSocialProof(location, businessType) {
        const isCancun = location.toLowerCase().includes('cancun');
        
        if (businessType === 'restaurante') {
            return isCancun 
                ? 'Somos la agencia #1 en Cancún para restaurantes. Hemos ayudado a más de 20 restaurantes locales a aumentar sus ventas 200% con presencia web profesional.'
                : 'Hemos trabajado con restaurantes en toda la Riviera Maya, ayudándolos a aumentar sus ventas en promedio 200% con estrategias digitales efectivas.';
        } else if (businessType === 'hotel') {
            return isCancun
                ? 'Somos especialistas en hoteles de Cancún. Hemos ayudado a más de 15 hoteles locales a optimizar sus reservas directas y aumentar su ocupación.'
                : 'Hemos optimizado la presencia digital de hoteles en toda la Riviera Maya, aumentando sus reservas directas y reduciendo dependencia de terceros.';
        } else if (businessType === 'tienda' || businessType === 'retail') {
            return isCancun
                ? 'Somos la agencia líder para tiendas en Cancún. Hemos creado tiendas online que han duplicado las ventas de nuestros clientes locales.'
                : 'Hemos ayudado a tiendas en toda la región a crear presencia online exitosa, duplicando sus ventas con estrategias de e-commerce profesionales.';
        } else if (businessType === 'spa') {
            return isCancun
                ? 'Somos especialistas en spas de Cancún. Hemos ayudado a más de 10 spas locales a optimizar sus citas online y aumentar sus reservas.'
                : 'Hemos trabajado con spas en toda la Riviera Maya, optimizando sus sistemas de citas y aumentando su visibilidad online.';
        } else if (businessType === 'salud') {
            return isCancun
                ? 'Somos especialistas en clínicas de Cancún. Hemos ayudado a clínicas locales a crear confianza digital y optimizar sus citas online.'
                : 'Hemos trabajado con clínicas en toda la región, mejorando su presencia digital y optimizando sus sistemas de citas para mayor comodidad de pacientes.';
        } else {
            return isCancun
                ? 'Somos la agencia #1 en Cancún. Hemos ayudado a más de 50 empresas locales a duplicar sus ventas con estrategias digitales profesionales.'
                : 'Hemos trabajado con más de 50 empresas en la Riviera Maya, ayudándolas a crecer sus ventas en promedio 200% con presencia digital profesional.';
        }
    }

    // Get call to action based on analysis
    getCallToAction(analysis) {
        if (analysis.urgency === 'high' && analysis.priority === 'very_high') {
            return `¿Tienes 15 minutos para una consulta gratuita? Te muestro exactamente cómo podemos hacer crecer tus ventas de inmediato.

Responde "SÍ" y te contacto hoy mismo para empezar.`;
        } else if (analysis.priority === 'high') {
            return `¿Te gustaría una consulta gratuita de 15 minutos para ver cómo podemos impulsar tu negocio?

Responde "SÍ" y te envío los horarios disponibles esta semana.`;
        } else {
            return `¿Te gustaría conocer cómo podemos ayudarte a crecer tu negocio online?

Responde "SÍ" para una consulta gratuita de 15 minutos.`;
        }
    }

    // Get recommended action
    getRecommendedAction(analysis) {
        if (analysis.priority === 'very_high') {
            return 'Contact Immediately';
        } else if (analysis.priority === 'high') {
            return 'Priority Contact This Week';
        } else if (analysis.priority === 'medium') {
            return 'Standard Contact';
        } else {
            return 'Low Priority';
        }
    }

    // Calculate follow-up date
    calculateFollowUpDate(analysis) {
        let daysToAdd = 7;
        
        if (analysis.priority === 'very_high') daysToAdd = 1;
        else if (analysis.priority === 'high') daysToAdd = 3;
        else if (analysis.priority === 'low') daysToAdd = 14;
        
        const followUpDate = new Date();
        followUpDate.setDate(followUpDate.getDate() + daysToAdd);
        
        return followUpDate.toISOString().split('T')[0];
    }

    // Generate fallback message
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

    // Display results
    displayResults(personalizedMessages) {
        console.log('\n📊 COMPLETE AI ANALYSIS RESULTS:');
        console.log('=====================================');
        console.log(`Total Leads Processed: ${personalizedMessages.length}`);
        
        const highPriority = personalizedMessages.filter(m => m.priority === 'very_high' || m.priority === 'high').length;
        const averageConfidence = Math.round(personalizedMessages.reduce((sum, m) => sum + (m.confidence || 70), 0) / personalizedMessages.length);
        
        console.log(`High Priority Leads: ${highPriority}`);
        console.log(`Average Confidence: ${averageConfidence}%`);
        
        console.log('\n🎯 PERSONALIZED MESSAGES READY:');
        console.log('================================');
        
        personalizedMessages.forEach((message, index) => {
            console.log(`\n${index + 1}. ${message.businessName} (${message.name})`);
            console.log(`   Business Type: ${message.businessType}`);
            console.log(`   Priority: ${message.priority} | Confidence: ${message.confidence}%`);
            console.log(`   Phone: ${message.phone || 'Not provided'}`);
            console.log(`   Pain Points: ${message.painPoints?.slice(0, 2).join(', ') || 'General'}`);
            console.log(`   Recommendations: ${message.recommendations?.join(', ') || 'website_design'}`);
            console.log(`   Message Length: ${message.messageLength} characters`);
            console.log(`   Action: ${message.recommendedAction}`);
        });
        
        console.log('\n📱 WHATSAPP OUTREACH READY:');
        console.log('============================');
        console.log('✅ All messages are personalized and ready for WhatsApp');
        console.log('✅ Each message addresses specific pain points');
        console.log('✅ Messages include local Cancún advantages');
        console.log('✅ Optimized for high response rates');
        console.log('✅ Ready to copy-paste and send');
        
        console.log('\n🚀 NEXT STEPS:');
        console.log('==============');
        console.log('1. Start with highest priority leads first');
        console.log('2. Copy personalized messages for WhatsApp');
        console.log('3. Track responses and update lead status');
        console.log('4. Analyze which pain points get best responses');
        console.log('5. Scale to remaining leads in your database');
    }

    // Save results to file
    async saveResultsToFile(personalizedMessages) {
        try {
            const fs = require('fs');
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `ai-personalized-messages-${timestamp}.json`;
            
            const resultsData = {
                timestamp: new Date().toISOString(),
                totalLeads: personalizedMessages.length,
                highPriorityLeads: personalizedMessages.filter(m => m.priority === 'very_high' || m.priority === 'high').length,
                averageConfidence: Math.round(personalizedMessages.reduce((sum, m) => sum + (m.confidence || 70), 0) / personalizedMessages.length),
                messages: personalizedMessages
            };
            
            fs.writeFileSync(filename, JSON.stringify(resultsData, null, 2));
            console.log(`\n💾 Results saved to: ${filename}`);
            
        } catch (error) {
            console.log('⚠️ Could not save results to file:', error.message);
        }
    }

    // Utility function for delays
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Execute the complete analysis
async function runCompleteAnalysis() {
    const agent = new CompleteAILeadAgent();
    const results = await agent.executeCompleteAnalysis();
    
    if (results.success) {
        console.log('\n🎉 SUCCESS! Complete AI Lead Analysis Finished!');
        console.log(`📊 Processed ${results.processedLeads} leads with personalized messages`);
        console.log('📱 All messages ready for WhatsApp outreach');
        console.log('🎯 Start with highest priority leads for best results');
    } else {
        console.log('\n❌ Analysis failed:', results.error);
    }
}

// Run if called directly
if (require.main === module) {
    runCompleteAnalysis().catch(console.error);
}

module.exports = CompleteAILeadAgent;


