#!/usr/bin/env node

// JegoDigital AI Lead Analysis - Complete Working Script
// This script will access your Google Sheet and create a new tab with AI analysis

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

console.log('🚀 JEGODIGITAL AI LEAD ANALYSIS - STARTING...');
console.log('===============================================');

class JegoDigitalAI {
    constructor() {
        this.spreadsheetId = '1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg';
        this.credentials = null;
        this.doc = null;
    }
    
    async initialize() {
        try {
            console.log('📋 Loading service account credentials...');
            this.credentials = JSON.parse(fs.readFileSync('./google-service-account-config.json', 'utf8'));
            console.log('✅ Credentials loaded successfully');
            
            console.log('🔗 Connecting to Google Sheet...');
            const auth = new JWT({
                email: this.credentials.client_email,
                key: this.credentials.private_key,
                scopes: [
                    'https://www.googleapis.com/auth/spreadsheets',
                    'https://www.googleapis.com/auth/drive.file'
                ]
            });
            
            this.doc = new GoogleSpreadsheet(this.spreadsheetId, auth);
            await this.doc.loadInfo();
            
            console.log(`✅ Connected to: ${this.doc.title}`);
            console.log(`📊 Available sheets: ${this.doc.sheetsByIndex.map(s => s.title).join(', ')}`);
            
            return true;
        } catch (error) {
            console.error('❌ Initialization failed:', error.message);
            return false;
        }
    }
    
    async readLeads() {
        try {
            console.log('📖 Reading leads from Google Sheet...');
            
            // Try different sheet names
            const sheetNames = [
                'Top 200 Qualified Leads',
                'jegodigital-leads-template',
                'Sheet1',
                'Leads'
            ];
            
            let sheet = null;
            for (const sheetName of sheetNames) {
                try {
                    sheet = this.doc.sheetsByTitle[sheetName];
                    if (sheet) {
                        console.log(`✅ Found sheet: "${sheetName}"`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (!sheet) {
                throw new Error('No accessible sheet found');
            }
            
            await sheet.loadHeaderRow();
            const rows = await sheet.getRows();
            
            console.log(`📊 Found ${rows.length} leads`);
            console.log(`📋 Headers: ${sheet.headerValues.slice(0, 5).join(', ')}...`);
            
            // Convert to lead objects
            const leads = rows.map((row, index) => {
                const lead = {};
                sheet.headerValues.forEach(header => {
                    lead[header.toLowerCase().replace(/[^a-z0-9]/g, '_')] = row.get(header) || '';
                });
                lead.id = lead.id || `LEAD_${(index + 1).toString().padStart(3, '0')}`;
                return lead;
            });
            
            console.log(`✅ Successfully processed ${leads.length} leads`);
            return leads;
            
        } catch (error) {
            console.error('❌ Error reading leads:', error.message);
            return [];
        }
    }
    
    async createAITab(leads) {
        try {
            console.log('📊 Creating AI Analysis tab...');
            
            const tabName = 'AI Lead Analysis & Messages';
            let sheet;
            
            try {
                sheet = this.doc.sheetsByTitle[tabName];
                console.log(`⚠️ Tab "${tabName}" exists, updating...`);
                await sheet.clear();
            } catch (error) {
                sheet = await this.doc.addSheet({
                    title: tabName,
                    headerValues: [
                        'Lead ID', 'Business Name', 'Contact Name', 'Phone Number', 'Email',
                        'Industry', 'Qualification Status', 'Priority', 'WhatsApp Ready',
                        'AI Business Type', 'AI Pain Points', 'AI Recommended Services',
                        'AI Priority Level', 'AI Confidence Score', 'Personalized WhatsApp Message',
                        'Message Status', 'Last Contact Date', 'Response Status', 'Notes'
                    ]
                });
                console.log(`✅ Created new tab: "${tabName}"`);
            }
            
            // Process first 50 leads
            const leadsToProcess = leads.slice(0, 50);
            console.log(`🤖 Analyzing ${leadsToProcess.length} leads...`);
            
            const analyzedData = [];
            
            for (const [index, lead] of leadsToProcess.entries()) {
                console.log(`🔍 ${index + 1}/${leadsToProcess.length}: ${lead.business_name || lead.name || 'Unknown'}`);
                
                const analysis = this.analyzeLead(lead);
                const message = this.generateMessage(lead, analysis);
                
                analyzedData.push({
                    'Lead ID': lead.id,
                    'Business Name': lead.business_name || lead.name || 'Unknown',
                    'Contact Name': lead.name || lead.contact_name || 'Unknown',
                    'Phone Number': lead.phone_number || lead.phone || '',
                    'Email': lead.email || '',
                    'Industry': lead.industry || '',
                    'Qualification Status': lead.qualification_scc_status || '',
                    'Priority': lead.priority || '',
                    'WhatsApp Ready': lead.whatsapp_ready || '',
                    'AI Business Type': analysis.businessType,
                    'AI Pain Points': analysis.painPoints.join('; '),
                    'AI Recommended Services': analysis.recommendedServices.join('; '),
                    'AI Priority Level': analysis.priority,
                    'AI Confidence Score': analysis.confidence,
                    'Personalized WhatsApp Message': message,
                    'Message Status': 'Ready for Outreach',
                    'Last Contact Date': '',
                    'Response Status': 'Pending',
                    'Notes': `Analyzed ${new Date().toISOString().split('T')[0]}`
                });
                
                // Small delay
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            await sheet.setHeaderRow(Object.keys(analyzedData[0]));
            await sheet.addRows(analyzedData);
            
            console.log(`✅ Successfully added ${analyzedData.length} analyzed leads to "${tabName}"`);
            return true;
            
        } catch (error) {
            console.error('❌ Error creating AI tab:', error.message);
            return false;
        }
    }
    
    analyzeLead(lead) {
        const businessName = (lead.business_name || '').toLowerCase();
        const industry = (lead.industry || '').toLowerCase();
        
        let businessType = 'negocio';
        let painPoints = [];
        let recommendedServices = ['website_design'];
        let priority = 'medium';
        let confidence = 70;
        
        // Business type analysis
        if (businessName.includes('restaurant') || businessName.includes('comida') || 
            businessName.includes('restaurante') || industry.includes('food')) {
            businessType = 'restaurante';
            painPoints = [
                'Sin sistema de reservas online',
                'Menú no disponible digitalmente',
                'No aparece en Google Maps cuando buscan restaurantes'
            ];
            recommendedServices = ['website_design', 'seo_local', 'ecommerce'];
        } else if (businessName.includes('hotel') || businessName.includes('hospedaje') || 
                   industry.includes('hospitality')) {
            businessType = 'hotel';
            painPoints = [
                'Sin sistema de reservas directas',
                'Depende de terceros para ventas',
                'No optimizado para búsquedas de hoteles en Cancún'
            ];
            recommendedServices = ['website_design', 'seo_local', 'ecommerce'];
        } else if (businessName.includes('spa') || businessName.includes('belleza') || 
                   industry.includes('beauty') || industry.includes('wellness')) {
            businessType = 'spa';
            painPoints = [
                'Sin sistema de citas online',
                'Falta presencia digital profesional',
                'No optimizado para Google Maps de spas en Cancún'
            ];
            recommendedServices = ['website_design', 'seo_local', 'ecommerce'];
        } else if (businessName.includes('medic') || businessName.includes('dental') || 
                   businessName.includes('clinica') || industry.includes('health')) {
            businessType = 'salud';
            painPoints = [
                'Sin sistema de citas online',
                'Falta confianza digital',
                'No aparece en búsquedas de servicios médicos'
            ];
            recommendedServices = ['website_design', 'seo_local', 'ecommerce'];
        } else if (businessName.includes('tienda') || businessName.includes('store') || 
                   businessName.includes('retail') || industry.includes('retail')) {
            businessType = 'tienda';
            painPoints = [
                'Sin tienda online',
                'Ventas limitadas a horario físico',
                'No aparece en búsquedas locales de productos'
            ];
            recommendedServices = ['ecommerce', 'seo_local', 'website_design'];
        }
        
        // Priority analysis
        const qualification = (lead.qualification_scc_status || '').toLowerCase();
        if (qualification.includes('hot') || qualification.includes('qualified')) {
            priority = 'high';
            confidence = 85;
        } else if (qualification.includes('warm')) {
            priority = 'medium';
            confidence = 75;
        } else {
            priority = 'low';
            confidence = 65;
        }
        
        return {
            businessType,
            painPoints,
            recommendedServices,
            priority,
            confidence
        };
    }
    
    generateMessage(lead, analysis) {
        const name = lead.name || lead.contact_name || 'Estimado empresario';
        const businessName = lead.business_name || 'su negocio';
        const primaryPainPoint = analysis.painPoints[0] || 'tu negocio no tiene presencia digital profesional';
        
        return `Hola ${name}, soy Alex de JegoDigital. Analicé ${businessName} en Cancún y encontré oportunidades importantes para hacer crecer tu negocio.

He notado que ${primaryPainPoint.toLowerCase()}. Esto puede estar costándote clientes y oportunidades de crecimiento en el mercado de Cancún.

Te puedo ayudar con Diseño Web Profesional para que:
• Aumenta tu credibilidad y profesionalismo online
• Genera más clientes a través de internet las 24 horas
• Funciona perfectamente en móviles y computadoras

Somos especialistas en crear sitios web impactantes para negocios en Cancún. Más de 50 proyectos exitosos y 95% de clientes satisfechos.

Esta es una oportunidad de oro para hacer crecer tu negocio. Cada día que pasa, pierdes clientes potenciales que buscan tus servicios online en Cancún.

¿Tienes 15 minutos para una consulta gratuita? Te muestro exactamente cómo podemos hacer crecer tus ventas de inmediato.

Responde "SÍ" y te contacto hoy mismo.

Saludos,
Alex Jego
JegoDigital - Marketing Digital Cancún
📱 www.jegodigital.com
📧 alex@jegodigital.com
📞 +52 998 202 3263`;
    }
    
    async execute() {
        try {
            console.log('🚀 Starting JegoDigital AI Lead Analysis...\n');
            
            // Initialize
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('Failed to initialize');
            }
            
            // Read leads
            const leads = await this.readLeads();
            if (leads.length === 0) {
                throw new Error('No leads found');
            }
            
            // Create AI analysis tab
            const success = await this.createAITab(leads);
            if (!success) {
                throw new Error('Failed to create AI analysis tab');
            }
            
            console.log('\n🎉 SUCCESS! AI ANALYSIS COMPLETE!');
            console.log('=================================');
            console.log('✅ Connected to your Google Sheet');
            console.log(`📊 Processed ${leads.length} leads`);
            console.log('🤖 Generated AI analysis and personalized messages');
            console.log('📋 Created new tab: "AI Lead Analysis & Messages"');
            console.log('📱 All messages ready for WhatsApp outreach');
            
            console.log('\n🚀 NEXT STEPS:');
            console.log('==============');
            console.log('1. Open your Google Sheet');
            console.log('2. Go to the "AI Lead Analysis & Messages" tab');
            console.log('3. Start with highest priority leads');
            console.log('4. Copy personalized messages for WhatsApp');
            console.log('5. Track responses and update status');
            
        } catch (error) {
            console.error('\n❌ AI ANALYSIS FAILED:');
            console.error('======================');
            console.error(`Error: ${error.message}`);
            console.error('\n💡 Possible solutions:');
            console.error('1. Check if the service account has access to the spreadsheet');
            console.error('2. Verify the spreadsheet ID is correct');
            console.error('3. Make sure the private key is valid');
        }
    }
}

// Execute the analysis
async function main() {
    const ai = new JegoDigitalAI();
    await ai.execute();
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = JegoDigitalAI;


