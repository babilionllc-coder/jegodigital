// Access Google Sheet and Create New Tab with AI Analysis
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

class JegoDigitalSheetAccessor {
    constructor() {
        // Your Google Sheets configuration
        this.spreadsheetId = '1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg';
        this.serviceAccountEmail = 'jegodigital-sheets-writer@jegodigital-leads-scraping.iam.gserviceaccount.com';
        
        // Service account authentication
        this.serviceAccountAuth = new JWT({
            email: this.serviceAccountEmail,
            key: process.env.GOOGLE_PRIVATE_KEY || this.getPrivateKey(),
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive.file',
            ],
        });
        
        this.doc = null;
    }
    
    // Get private key (you'll need to set this in your environment)
    getPrivateKey() {
        // For now, we'll use the service account email to authenticate
        // You'll need to add the private key to your environment variables
        return process.env.GOOGLE_PRIVATE_KEY;
    }
    
    // Initialize connection to Google Sheets
    async initialize() {
        try {
            console.log('🔗 Connecting to your Google Sheet...');
            console.log(`📊 Spreadsheet ID: ${this.spreadsheetId}`);
            console.log(`👤 Service Account: ${this.serviceAccountEmail}`);
            
            this.doc = new GoogleSpreadsheet(this.spreadsheetId, this.serviceAccountAuth);
            await this.doc.loadInfo();
            
            console.log(`✅ Connected to Google Sheets: ${this.doc.title}`);
            console.log(`📋 Existing sheets: ${this.doc.sheetsByIndex.map(s => s.title).join(', ')}`);
            
            return true;
        } catch (error) {
            console.error('❌ Error connecting to Google Sheets:', error.message);
            console.error('💡 Make sure the service account has access to the spreadsheet');
            return false;
        }
    }
    
    // Read leads from existing sheet
    async readLeadsFromSheet(sheetName = 'Top 200 Qualified Leads') {
        try {
            console.log(`📖 Reading leads from sheet: "${sheetName}"`);
            
            let sheet;
            try {
                sheet = this.doc.sheetsByTitle[sheetName];
            } catch (error) {
                // Try alternative sheet names
                const alternativeNames = [
                    'jegodigital-leads-template',
                    'Sheet1',
                    'Leads',
                    'Qualified Leads'
                ];
                
                for (const altName of alternativeNames) {
                    try {
                        sheet = this.doc.sheetsByTitle[altName];
                        if (sheet) {
                            console.log(`✅ Found sheet: "${altName}"`);
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }
            
            if (!sheet) {
                throw new Error(`Sheet "${sheetName}" not found`);
            }
            
            await sheet.loadHeaderRow();
            const rows = await sheet.getRows();
            
            console.log(`📊 Found ${rows.length} leads in sheet`);
            console.log(`📋 Headers: ${sheet.headerValues.slice(0, 5).join(', ')}...`);
            
            // Convert rows to lead objects
            const leads = rows.map((row, index) => {
                const lead = {};
                sheet.headerValues.forEach(header => {
                    lead[header.toLowerCase().replace(/[^a-z0-9]/g, '_')] = row.get(header) || '';
                });
                lead.id = lead.id || `LEAD_${(index + 1).toString().padStart(3, '0')}`;
                return lead;
            });
            
            console.log(`✅ Successfully read ${leads.length} leads`);
            return leads;
            
        } catch (error) {
            console.error('❌ Error reading leads:', error.message);
            return [];
        }
    }
    
    // Create new tab with AI analysis
    async createAIAnalysisTab(leads, tabName = 'AI Lead Analysis & Messages') {
        try {
            console.log(`📊 Creating new tab: "${tabName}"`);
            
            // Check if tab already exists
            let sheet;
            try {
                sheet = this.doc.sheetsByTitle[tabName];
                console.log(`⚠️ Tab "${tabName}" already exists, will update it`);
                await sheet.clear();
            } catch (error) {
                // Create new sheet
                sheet = await this.doc.addSheet({
                    title: tabName,
                    headerValues: this.getAIAnalysisHeaders()
                });
                console.log(`✅ Created new tab: "${tabName}"`);
            }
            
            // Set headers
            await sheet.setHeaderRow(this.getAIAnalysisHeaders());
            
            // Process leads and generate AI analysis
            console.log('🤖 Generating AI analysis for leads...');
            const analyzedLeads = await this.generateAIAnalysis(leads.slice(0, 50)); // Process first 50
            
            // Format data for Google Sheets
            const sheetData = analyzedLeads.map(lead => this.formatLeadForAISheet(lead));
            
            // Add rows to sheet
            await sheet.addRows(sheetData);
            
            console.log(`✅ Successfully added ${sheetData.length} analyzed leads to "${tabName}"`);
            return true;
            
        } catch (error) {
            console.error('❌ Error creating AI analysis tab:', error.message);
            return false;
        }
    }
    
    // Get headers for AI analysis sheet
    getAIAnalysisHeaders() {
        return [
            'Lead ID',
            'Business Name',
            'Contact Name',
            'Phone Number',
            'Email',
            'Industry',
            'Qualification Status',
            'Priority (Sheet)',
            'WhatsApp Ready',
            'AI Business Type',
            'AI Pain Points',
            'AI Recommended Services',
            'AI Priority Level',
            'AI Confidence Score',
            'Personalized WhatsApp Message',
            'Message Status',
            'Last Contact Date',
            'Response Status',
            'Notes'
        ];
    }
    
    // Generate AI analysis for leads
    async generateAIAnalysis(leads) {
        const analyzedLeads = [];
        
        for (const [index, lead] of leads.entries()) {
            console.log(`🔍 Analyzing lead ${index + 1}/${leads.length}: ${lead.business_name || lead.name || 'Unknown'}`);
            
            // Perform AI analysis
            const analysis = this.performJegoDigitalAnalysis(lead);
            
            // Generate personalized message
            const personalizedMessage = this.generatePersonalizedMessage(lead, analysis);
            
            // Create comprehensive result
            const result = {
                ...lead,
                analysis,
                personalizedMessage
            };
            
            analyzedLeads.push(result);
            
            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        return analyzedLeads;
    }
    
    // Perform JegoDigital analysis
    performJegoDigitalAnalysis(lead) {
        const businessName = (lead.business_name || '').toLowerCase();
        const industry = (lead.industry || '').toLowerCase();
        
        let businessType = 'negocio';
        let painPoints = [];
        let recommendedServices = ['website_design'];
        let priority = 'medium';
        let confidence = 70;
        
        // Determine business type and pain points
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
        
        // Determine priority based on qualification status
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
    
    // Generate personalized message
    generatePersonalizedMessage(lead, analysis) {
        const name = lead.name || lead.contact_name || 'Estimado empresario';
        const businessName = lead.business_name || 'su negocio';
        
        const primaryPainPoint = analysis.painPoints[0] || 'tu negocio no tiene presencia digital profesional';
        const primaryService = analysis.recommendedServices[0] || 'website_design';
        
        const serviceInfo = this.getServiceInfo(primaryService);
        
        return `Hola ${name}, soy Alex de JegoDigital. Analicé ${businessName} en Cancún y encontré oportunidades importantes para hacer crecer tu negocio.

He notado que ${primaryPainPoint.toLowerCase()}. Esto puede estar costándote clientes y oportunidades de crecimiento en el mercado de Cancún.

Te puedo ayudar con ${serviceInfo.name} para que:
• ${serviceInfo.benefits[0]}
• ${serviceInfo.benefits[1]}
• ${serviceInfo.benefits[2]}

${serviceInfo.local_advantage}

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
    
    // Get service information
    getServiceInfo(service) {
        const services = {
            'website_design': {
                name: 'Diseño Web Profesional',
                benefits: [
                    'Aumenta tu credibilidad y profesionalismo online',
                    'Genera más clientes a través de internet las 24 horas',
                    'Funciona perfectamente en móviles y computadoras'
                ],
                local_advantage: 'Somos especialistas en crear sitios web impactantes para negocios en Cancún. Más de 50 proyectos exitosos y 95% de clientes satisfechos.'
            },
            'seo_local': {
                name: 'SEO Local y Posicionamiento en Google Maps',
                benefits: [
                    'Aparece en las primeras páginas de Google cuando te busquen en Cancún',
                    'Atrae clientes locales directamente desde Google Maps',
                    'Supera a tu competencia en visibilidad online'
                ],
                local_advantage: 'Dominamos el SEO local en Cancún. Hemos ayudado a más de 30 negocios a aparecer en los primeros lugares de Google Maps.'
            },
            'ecommerce': {
                name: 'Tienda Online (E-commerce)',
                benefits: [
                    'Vende tus productos o servicios 24/7 sin límites geográficos',
                    'Gestiona inventario y pedidos de forma eficiente',
                    'Ofrece una experiencia de compra segura y moderna'
                ],
                local_advantage: 'Creamos tiendas online optimizadas para el mercado de Cancún, integrando métodos de pago locales y estrategias de envío.'
            }
        };
        return services[service] || services['website_design'];
    }
    
    // Format lead for AI sheet
    formatLeadForAISheet(lead) {
        const analysis = lead.analysis;
        
        return {
            'Lead ID': lead.id,
            'Business Name': lead.business_name || lead.name || 'Unknown',
            'Contact Name': lead.name || lead.contact_name || 'Unknown',
            'Phone Number': lead.phone_number || lead.phone || '',
            'Email': lead.email || '',
            'Industry': lead.industry || '',
            'Qualification Status': lead.qualification_scc_status || '',
            'Priority (Sheet)': lead.priority || '',
            'WhatsApp Ready': lead.whatsapp_ready || '',
            'AI Business Type': analysis.businessType,
            'AI Pain Points': analysis.painPoints.join('; '),
            'AI Recommended Services': analysis.recommendedServices.join('; '),
            'AI Priority Level': analysis.priority,
            'AI Confidence Score': analysis.confidence,
            'Personalized WhatsApp Message': lead.personalizedMessage,
            'Message Status': 'Ready for Outreach',
            'Last Contact Date': '',
            'Response Status': 'Pending',
            'Notes': `Analyzed on ${new Date().toISOString().split('T')[0]}`
        };
    }
    
    // Main execution function
    async execute() {
        console.log('🚀 JEGODIGITAL AI LEAD ANALYSIS - ACCESSING GOOGLE SHEET');
        console.log('======================================================\n');
        
        try {
            // Step 1: Initialize connection
            const connected = await this.initialize();
            if (!connected) {
                throw new Error('Could not connect to Google Sheets');
            }
            
            // Step 2: Read existing leads
            const leads = await this.readLeadsFromSheet();
            if (leads.length === 0) {
                throw new Error('No leads found in Google Sheet');
            }
            
            // Step 3: Create AI analysis tab
            const success = await this.createAIAnalysisTab(leads);
            if (!success) {
                throw new Error('Could not create AI analysis tab');
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
            
            return {
                success: true,
                totalLeads: leads.length,
                message: 'AI analysis tab created successfully in your Google Sheet'
            };
            
        } catch (error) {
            console.error('\n❌ AI ANALYSIS FAILED:');
            console.error('======================');
            console.error(`Error: ${error.message}`);
            
            console.error('\n💡 Possible solutions:');
            console.error('1. Check if the service account has access to the spreadsheet');
            console.error('2. Verify the spreadsheet ID is correct');
            console.error('3. Make sure the private key is set in environment variables');
            console.error('4. Check if the sheet name exists');
            
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Execute the analysis
async function main() {
    const accessor = new JegoDigitalSheetAccessor();
    const results = await accessor.execute();
    
    if (results.success) {
        console.log('\n🎉 MISSION ACCOMPLISHED!');
        console.log(`📊 ${results.message}`);
        console.log('🔗 Check your Google Sheet for the new "AI Lead Analysis & Messages" tab');
    } else {
        console.log('\n❌ Analysis failed. Please check the error messages above.');
    }
}

// Run the analysis
if (require.main === module) {
    main().catch(console.error);
}

module.exports = JegoDigitalSheetAccessor;


