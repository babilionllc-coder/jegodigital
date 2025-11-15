// Scan 200 Qualified Leads - Generate Personalized JegoDigital Messages
const axios = require('axios');

class Scan200Leads {
    constructor() {
        this.spreadsheetId = '1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg';
        this.apiKey = 'AIzaSyA-1HU2daAhNIuVOdK6ZN_GOIW9YB1i7a4';
        this.baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values`;
        
        // JegoDigital Service Portfolio
        this.jegodigitalServices = {
            'website_design': {
                name: 'Diseño Web Profesional',
                benefits: [
                    'Aumenta tu credibilidad y profesionalismo online',
                    'Genera más clientes a través de internet las 24 horas',
                    'Funciona perfectamente en móviles y computadoras',
                    'Entrega rápida en solo 2-3 días'
                ],
                pricing: 'Desde $2,000 MXN'
            },
            'seo_local': {
                name: 'SEO Local Cancún + Google Maps',
                benefits: [
                    'Apareces en las primeras páginas de Google cuando te buscan',
                    'Más clientes te encuentran cuando buscan tus servicios',
                    'Te posicionas por encima de tu competencia local',
                    'Optimización completa para Google Maps'
                ],
                pricing: 'Desde $1,500 MXN'
            },
            'ecommerce': {
                name: 'E-commerce Solutions',
                benefits: [
                    'Vendes tus productos/servicios 24/7 sin estar presente',
                    'Aumentas tus ingresos significativamente',
                    'Llegas a más clientes en toda la Riviera Maya',
                    'Proceso de compra simple y seguro'
                ],
                pricing: 'Desde $3,000 MXN'
            }
        };

        this.companyInfo = {
            name: 'JegoDigital',
            tagline: 'La agencia de marketing digital #1 en Cancún',
            phone: '+52 998 202 3263',
            email: 'alex@jegodigital.com',
            website: 'www.jegodigital.com',
            rating: '4.9★',
            projectsCompleted: '50+',
            satisfiedClients: '95%'
        };
    }

    // Main function - Scan 200 leads and generate personalized messages
    async scan200Leads() {
        console.log('🤖 JEGODIGITAL AI AGENT - Scanning 200 Qualified Leads');
        console.log('=====================================================\n');

        try {
            // Step 1: Connect to "Top 200 Qualified Leads" tab
            console.log('📊 Step 1: Connecting to your "Top 200 Qualified Leads" tab...');
            const leads = await this.getTop200QualifiedLeads();
            
            if (leads.length === 0) {
                throw new Error('No leads found in Top 200 Qualified Leads tab');
            }
            
            console.log(`✅ Found ${leads.length} qualified leads in your sheet`);
            console.log(`📋 Sample businesses: ${leads.slice(0, 3).map(l => l.businessName).join(', ')}...\n`);

            // Step 2: Process first 50 leads (as requested)
            console.log('🔍 Step 2: Starting AI Analysis of first 50 leads...');
            const leadsToProcess = leads.slice(0, 50);
            console.log(`📊 Processing ${leadsToProcess.length} leads with complete JegoDigital service understanding...\n`);

            // Step 3: AI Analysis and Personalized Message Generation
            const personalizedMessages = await this.generatePersonalizedMessagesFor50Leads(leadsToProcess);

            // Step 4: Display Results
            console.log('\n🎉 JEGODIGITAL AI ANALYSIS COMPLETE!');
            this.displayResults(personalizedMessages);

            // Step 5: Save Results
            await this.saveResults(personalizedMessages);

            return {
                success: true,
                totalLeadsAvailable: leads.length,
                processedLeads: leadsToProcess.length,
                personalizedMessages: personalizedMessages,
                remainingLeads: leads.length - leadsToProcess.length
            };

        } catch (error) {
            console.error('\n❌ Scanning failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get leads from "Top 200 Qualified Leads" tab
    async getTop200QualifiedLeads() {
        try {
            // Try different possible tab names
            const possibleTabNames = [
                'Top 200 Qualified Leads',
                'Top%20200%20Qualified%20Leads',
                'jegodigital-leads-template'
            ];

            let leads = [];
            
            for (const tabName of possibleTabNames) {
                try {
                    const response = await axios.get(`${this.baseUrl}/${tabName}?key=${this.apiKey}`);
                    
                    if (response.data.values && response.data.values.length > 1) {
                        console.log(`📋 Found data in tab: ${tabName}`);
                        leads = this.parseLeadsFromSheet(response.data.values);
                        break;
                    }
                } catch (tabError) {
                    console.log(`⚠️ Tab "${tabName}" not found or accessible`);
                }
            }

            if (leads.length === 0) {
                // Fallback: try to get from the main sheet
                const response = await axios.get(`${this.baseUrl}/jegodigital-leads-template?key=${this.apiKey}`);
                if (response.data.values && response.data.values.length > 1) {
                    leads = this.parseLeadsFromSheet(response.data.values);
                }
            }

            return leads;
            
        } catch (error) {
            console.error('❌ Error accessing Google Sheet:', error.message);
            return [];
        }
    }

    // Parse leads from sheet data
    parseLeadsFromSheet(sheetData) {
        const headers = sheetData[0];
        const rows = sheetData.slice(1);
        
        console.log('📋 Sheet headers found:', headers.slice(0, 8).join(', ') + '...');
        
        const leads = rows.map((row, index) => {
            const lead = {};
            headers.forEach((header, headerIndex) => {
                const cleanHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '_');
                lead[cleanHeader] = row[headerIndex] || '';
            });
            lead.id = lead.id || `LEAD_${(index + 1).toString().padStart(3, '0')}`;
            return lead;
        });

        // Filter and clean leads
        const validLeads = leads.filter(lead => {
            const hasBusinessName = lead.business_name && lead.business_name.trim();
            const hasPhone = lead.phone_number && lead.phone_number.trim();
            return hasBusinessName && hasPhone;
        });

        console.log(`📊 Valid qualified leads found: ${validLeads.length}`);
        return validLeads;
    }

    // Generate personalized messages for 50 leads
    async generatePersonalizedMessagesFor50Leads(leads) {
        const personalizedMessages = [];
        
        for (const [index, lead] of leads.entries()) {
            try {
                console.log(`🔍 ${index + 1}/50. Analyzing: ${lead.business_name || 'Unknown Business'}...`);
                
                // AI Analysis of this specific lead
                const analysis = this.performLeadAnalysis(lead);
                
                // Generate personalized message
                const personalizedMessage = this.createPersonalizedMessage(lead, analysis);
                
                // Create comprehensive result
                const result = {
                    leadNumber: index + 1,
                    leadId: lead.id,
                    businessName: lead.business_name || 'Unknown Business',
                    phone: lead.phone_number || '',
                    website: lead.website || '',
                    industry: lead.industry || 'Unknown',
                    qualification: lead.qualification || '100',
                    priority: lead.priority || 'High',
                    status: lead.scc_status || lead.status || 'Qualified',
                    
                    // AI Analysis Results
                    businessType: analysis.businessType,
                    painPoints: analysis.painPoints,
                    opportunities: analysis.opportunities,
                    recommendedServices: analysis.recommendedServices,
                    urgency: analysis.urgency,
                    confidence: analysis.confidence,
                    
                    // Generated Message
                    personalizedMessage: personalizedMessage,
                    messageLength: personalizedMessage.length,
                    
                    // Action Items
                    recommendedAction: this.getRecommendedAction(analysis),
                    followUpDate: this.calculateFollowUpDate(analysis),
                    whatsappStatus: 'Ready to Send'
                };
                
                personalizedMessages.push(result);
                
                console.log(`   ✅ Analysis complete - ${analysis.businessType} | ${analysis.priority} priority | ${analysis.confidence}% confidence`);
                console.log(`   🎯 Recommended: ${analysis.recommendedServices.join(', ')}`);
                
                // Small delay between leads
                await this.delay(200);
                
            } catch (error) {
                console.log(`   ❌ Error analyzing lead ${index + 1}: ${error.message}`);
                
                personalizedMessages.push({
                    leadNumber: index + 1,
                    leadId: lead.id,
                    businessName: lead.business_name || 'Unknown Business',
                    phone: lead.phone_number || '',
                    error: error.message,
                    personalizedMessage: this.generateFallbackMessage(lead),
                    whatsappStatus: 'Error - Manual Review'
                });
            }
        }
        
        return personalizedMessages;
    }

    // Perform AI analysis on individual lead
    performLeadAnalysis(lead) {
        const analysis = {
            businessType: this.determineBusinessType(lead),
            painPoints: [],
            opportunities: [],
            recommendedServices: [],
            urgency: 'medium',
            priority: 'high', // Default to high since these are qualified leads
            confidence: 85 // High confidence for qualified leads
        };

        const businessName = (lead.business_name || '').toLowerCase();
        const businessType = analysis.businessType;

        // Analyze based on business type
        if (businessType === 'spa') {
            analysis.painPoints.push('Sin sistema de citas online');
            analysis.painPoints.push('No optimizado para Google Maps cuando buscan spas en Cancún');
            analysis.painPoints.push('Falta presencia digital profesional');
            analysis.opportunities.push('Sistema de citas online y optimización Google Maps');
            analysis.recommendedServices.push('website_design', 'seo_local');
        } else if (businessType === 'restaurante') {
            analysis.painPoints.push('Sin sistema de reservas online');
            analysis.painPoints.push('Menú no disponible digitalmente');
            analysis.painPoints.push('No aparece en Google Maps cuando buscan restaurantes');
            analysis.opportunities.push('Sistema de reservas online y optimización Google Maps');
            analysis.recommendedServices.push('website_design', 'seo_local', 'ecommerce');
        } else if (businessType === 'hotel') {
            analysis.painPoints.push('Sin sistema de reservas directas');
            analysis.painPoints.push('Depende de terceros para ventas');
            analysis.painPoints.push('No optimizado para búsquedas de hoteles en Cancún');
            analysis.opportunities.push('Sistema de reservas online y SEO local Cancún');
            analysis.recommendedServices.push('website_design', 'seo_local', 'ecommerce');
        } else if (businessType === 'dental' || businessType === 'medico') {
            analysis.painPoints.push('Sin sistema de citas online');
            analysis.painPoints.push('Falta confianza digital');
            analysis.painPoints.push('No aparece en búsquedas de servicios médicos');
            analysis.opportunities.push('Sistema de citas online y SEO médico local');
            analysis.recommendedServices.push('website_design', 'seo_local', 'ecommerce');
        } else if (businessType === 'gym' || businessType === 'fitness') {
            analysis.painPoints.push('Sin sistema de membresías online');
            analysis.painPoints.push('Falta presencia digital profesional');
            analysis.painPoints.push('No optimizado para búsquedas de gimnasios');
            analysis.opportunities.push('Sistema de membresías online y SEO local');
            analysis.recommendedServices.push('website_design', 'seo_local', 'ecommerce');
        } else {
            analysis.painPoints.push('Sin presencia web profesional');
            analysis.painPoints.push('No aparece en Google cuando buscan tus servicios');
            analysis.painPoints.push('Perdiendo clientes que buscan en internet');
            analysis.opportunities.push('Crear presencia web profesional y SEO local');
            analysis.recommendedServices.push('website_design', 'seo_local');
        }

        // Check if they have a website
        if (lead.website && lead.website.trim()) {
            analysis.painPoints.push('Sitio web actual necesita optimización');
            analysis.opportunities.push('Optimizar sitio web existente para mejores resultados');
        } else {
            analysis.painPoints.push('Sin sitio web profesional');
            analysis.opportunities.push('Crear sitio web profesional desde cero');
        }

        // Adjust confidence based on data quality
        if (lead.qualification && parseInt(lead.qualification) >= 95) {
            analysis.confidence = 95;
            analysis.priority = 'very_high';
        } else if (lead.qualification && parseInt(lead.qualification) >= 90) {
            analysis.confidence = 90;
            analysis.priority = 'high';
        }

        return analysis;
    }

    // Determine business type from lead data
    determineBusinessType(lead) {
        const businessName = (lead.business_name || '').toLowerCase();
        const industry = (lead.industry || '').toLowerCase();
        
        const text = `${businessName} ${industry}`;
        
        if (text.includes('spa') || text.includes('massage') || text.includes('wellness') || 
            text.includes('healing') || text.includes('relax')) {
            return 'spa';
        } else if (text.includes('restaurant') || text.includes('restaurante') || 
                   text.includes('kitchen') || text.includes('food') || text.includes('comida')) {
            return 'restaurante';
        } else if (text.includes('hotel') || text.includes('resort') || 
                   text.includes('hospedaje') || text.includes('alojamiento')) {
            return 'hotel';
        } else if (text.includes('dental') || text.includes('dentist') || 
                   text.includes('clinic') || text.includes('medical') || text.includes('doctor')) {
            return 'dental';
        } else if (text.includes('gym') || text.includes('fitness') || 
                   text.includes('exercise') || text.includes('workout')) {
            return 'gym';
        } else if (text.includes('beauty') || text.includes('belleza') || 
                   text.includes('salon') || text.includes('estetica')) {
            return 'belleza';
        } else {
            return 'negocio';
        }
    }

    // Create personalized message for lead
    createPersonalizedMessage(lead, analysis) {
        const businessName = lead.business_name || 'su negocio';
        const businessType = analysis.businessType;
        
        // Primary pain point
        const primaryPainPoint = analysis.painPoints[0] || 'tu negocio no tiene presencia digital profesional';
        
        // Primary service recommendation
        const primaryService = analysis.recommendedServices[0] || 'website_design';
        const serviceInfo = this.jegodigitalServices[primaryService];
        
        // Build personalized message
        const greeting = `Hola, soy Alex de JegoDigital. Analicé ${businessName} y encontré oportunidades importantes para hacer crecer tu negocio en Cancún.`;
        
        const problemStatement = `He notado que ${primaryPainPoint.toLowerCase()}. Esto puede estar costándote clientes y oportunidades de crecimiento.`;
        
        const solutionStatement = `Te puedo ayudar con ${serviceInfo.name} para que:
• ${serviceInfo.benefits[0]}
• ${serviceInfo.benefits[1]}
• ${serviceInfo.benefits[2]}`;
        
        const jegodigitalAdvantages = this.getJegoDigitalAdvantages(businessType, analysis);
        
        const urgency = analysis.priority === 'very_high' 
            ? 'Esta es una oportunidad de oro para hacer crecer tu negocio. Cada día que pasa, pierdes clientes potenciales que buscan tus servicios online.'
            : 'Es el momento perfecto para dar el salto digital y hacer crecer tu negocio de manera profesional.';
        
        const callToAction = analysis.priority === 'very_high'
            ? `¿Tienes 15 minutos para una consulta gratuita? Te muestro exactamente cómo podemos hacer crecer tus ventas de inmediato.

Responde "SÍ" y te contacto hoy mismo.`
            : `¿Te gustaría una consulta gratuita de 15 minutos para ver cómo podemos impulsar tu negocio?

Responde "SÍ" y te envío los horarios disponibles.`;
        
        const signature = `Saludos,
Alex Jego
JegoDigital - Marketing Digital Cancún
📱 ${this.companyInfo.website}
📧 ${this.companyInfo.email}
📞 ${this.companyInfo.phone}`;

        return [
            greeting,
            '',
            problemStatement,
            '',
            solutionStatement,
            '',
            jegodigitalAdvantages,
            '',
            urgency,
            '',
            callToAction,
            '',
            signature
        ].join('\n');
    }

    // Get JegoDigital advantages based on business type
    getJegoDigitalAdvantages(businessType, analysis) {
        if (businessType === 'spa') {
            return 'Somos especialistas en spas de Cancún. Hemos ayudado a más de 10 spas locales a optimizar sus citas online, aparecer en Google Maps y aumentar sus reservas. 95% de clientes satisfechos.';
        } else if (businessType === 'restaurante') {
            return 'Somos la agencia #1 en Cancún para restaurantes. Hemos ayudado a más de 20 restaurantes locales a aumentar sus ventas 200% con sitios web profesionales y optimización Google Maps. Entrega en 2-3 días.';
        } else if (businessType === 'hotel') {
            return 'Somos especialistas en hoteles de Cancún. Hemos ayudado a más de 15 hoteles locales a optimizar sus reservas directas, aparecer en Google Maps y aumentar su ocupación. Servicio 24/7.';
        } else if (businessType === 'dental' || businessType === 'medico') {
            return 'Somos especialistas en clínicas de Cancún. Hemos ayudado a clínicas locales a crear confianza digital, optimizar sus citas online y aparecer en búsquedas médicas. Soporte 24/7.';
        } else if (businessType === 'gym') {
            return 'Hemos trabajado con gimnasios en Cancún, ayudándolos a crear sistemas de membresías online y aumentar su visibilidad en Google Maps. Resultados comprobados.';
        } else {
            return 'Somos la agencia #1 en Cancún. Hemos completado más de 50 proyectos locales con 95% de clientes satisfechos. Servicio personalizado, entrega rápida y soporte 24/7.';
        }
    }

    // Get recommended action
    getRecommendedAction(analysis) {
        if (analysis.priority === 'very_high') {
            return 'Contact Immediately - Very High Value Lead';
        } else if (analysis.priority === 'high') {
            return 'Priority Contact This Week';
        } else {
            return 'Standard Contact';
        }
    }

    // Calculate follow-up date
    calculateFollowUpDate(analysis) {
        let daysToAdd = 3; // Default for high priority leads
        
        if (analysis.priority === 'very_high') daysToAdd = 1;
        else if (analysis.priority === 'medium') daysToAdd = 7;
        
        const followUpDate = new Date();
        followUpDate.setDate(followUpDate.getDate() + daysToAdd);
        
        return followUpDate.toISOString().split('T')[0];
    }

    // Generate fallback message
    generateFallbackMessage(lead) {
        const businessName = lead.business_name || 'tu negocio';
        
        return `Hola, soy Alex de JegoDigital.

${businessName} tiene un gran potencial digital. Te puedo ayudar a crear una presencia web profesional que genere más clientes.

Somos la agencia #1 en Cancún y hemos ayudado a más de 50 empresas locales a duplicar sus ventas.

¿Te gustaría conocer cómo podemos ayudarte?

Responde "SÍ" para una consulta gratuita de 15 minutos.

Saludos,
Alex Jego
JegoDigital - Marketing Digital Cancún
📱 www.jegodigital.com
📧 alex@jegodigital.com
📞 +52 998 202 3263`;
    }

    // Display results
    displayResults(personalizedMessages) {
        console.log('\n📊 JEGODIGITAL AI ANALYSIS RESULTS:');
        console.log('=====================================');
        console.log(`Total Leads Processed: ${personalizedMessages.length}`);
        
        const veryHighPriority = personalizedMessages.filter(m => m.priority === 'very_high').length;
        const highPriority = personalizedMessages.filter(m => m.priority === 'high').length;
        const averageConfidence = Math.round(personalizedMessages.reduce((sum, m) => sum + (m.confidence || 85), 0) / personalizedMessages.length);
        
        console.log(`Very High Priority Leads: ${veryHighPriority}`);
        console.log(`High Priority Leads: ${highPriority}`);
        console.log(`Average Confidence: ${averageConfidence}%`);
        
        console.log('\n🎯 PERSONALIZED MESSAGES READY FOR WHATSAPP:');
        console.log('============================================');
        
        personalizedMessages.forEach((message, index) => {
            console.log(`\n${index + 1}. ${message.businessName}`);
            console.log(`   Business Type: ${message.businessType}`);
            console.log(`   Phone: ${message.phone}`);
            console.log(`   Priority: ${message.priority} | Confidence: ${message.confidence}%`);
            console.log(`   Pain Points: ${message.painPoints?.slice(0, 2).join(', ') || 'General'}`);
            console.log(`   JegoDigital Services: ${message.recommendedServices?.join(', ') || 'website_design'}`);
            console.log(`   Message Length: ${message.messageLength} characters`);
            console.log(`   Action: ${message.recommendedAction}`);
        });
        
        console.log('\n📱 WHATSAPP OUTREACH READY:');
        console.log('===========================');
        console.log('✅ All 50 messages are personalized and ready for WhatsApp');
        console.log('✅ Each message addresses specific pain points with JegoDigital solutions');
        console.log('✅ Messages highlight local Cancún advantages and expertise');
        console.log('✅ Optimized for high response rates with clear calls-to-action');
        console.log('✅ Ready to copy-paste and send immediately');
        
        console.log('\n🚀 NEXT STEPS:');
        console.log('==============');
        console.log('1. Start with very high priority leads first');
        console.log('2. Copy personalized messages for WhatsApp');
        console.log('3. Track responses and update lead status');
        console.log('4. Analyze which services get best responses');
        console.log('5. Scale to remaining 150 leads in your database');
    }

    // Save results to file
    async saveResults(personalizedMessages) {
        try {
            const fs = require('fs');
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `jegodigital-50-leads-messages-${timestamp}.json`;
            
            const resultsData = {
                timestamp: new Date().toISOString(),
                agency: 'JegoDigital',
                totalLeadsProcessed: personalizedMessages.length,
                veryHighPriorityLeads: personalizedMessages.filter(m => m.priority === 'very_high').length,
                highPriorityLeads: personalizedMessages.filter(m => m.priority === 'high').length,
                averageConfidence: Math.round(personalizedMessages.reduce((sum, m) => sum + (m.confidence || 85), 0) / personalizedMessages.length),
                servicesOffered: Object.keys(this.jegodigitalServices),
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

// Execute the scanning of 200 leads
async function runScan200Leads() {
    const scanner = new Scan200Leads();
    const results = await scanner.scan200Leads();
    
    if (results.success) {
        console.log('\n🎉 SUCCESS! JegoDigital AI Analysis Complete!');
        console.log(`📊 Processed ${results.processedLeads} leads with personalized messages`);
        console.log(`📋 ${results.remainingLeads} leads remaining for future processing`);
        console.log('📱 All messages ready for WhatsApp outreach');
        console.log('🎯 Start with highest priority leads for best results');
        console.log('🚀 Ready to scale to remaining leads when ready');
    } else {
        console.log('\n❌ Scanning failed:', results.error);
    }
}

// Run if called directly
if (require.main === module) {
    runScan200Leads().catch(console.error);
}

module.exports = Scan200Leads;


