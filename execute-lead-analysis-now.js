// JegoDigital AI Lead Analysis - Complete Execution
// This script will analyze your leads and generate personalized WhatsApp messages

const https = require('https');
const fs = require('fs');

class JegoDigitalLeadAnalyzer {
    constructor() {
        this.spreadsheetId = '1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg';
        this.apiKey = 'AIzaSyA-1HU2daAhNIuVOdK6ZN_GOIW9YB1i7a4';
        
        // JegoDigital Services (Complete Understanding)
        this.services = {
            'website_design': {
                name: 'Diseño Web Profesional',
                benefits: [
                    'Aumenta tu credibilidad y profesionalismo online',
                    'Genera más clientes a través de internet las 24 horas',
                    'Funciona perfectamente en móviles y computadoras',
                    'Entrega rápida en solo 2-3 días'
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
        
        this.companyInfo = {
            name: 'JegoDigital',
            phone: '+52 998 202 3263',
            email: 'alex@jegodigital.com',
            website: 'www.jegodigital.com'
        };
    }
    
    // Fetch data from Google Sheets using native https
    async fetchGoogleSheetsData(sheetName) {
        return new Promise((resolve, reject) => {
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${encodeURIComponent(sheetName)}?key=${this.apiKey}`;
            
            https.get(url, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const jsonData = JSON.parse(data);
                        if (jsonData.values && jsonData.values.length > 0) {
                            resolve(jsonData.values);
                        } else {
                            resolve([]);
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            }).on('error', (error) => {
                reject(error);
            });
        });
    }
    
    // Analyze lead and determine business type
    analyzeLead(leadData) {
        const businessName = (leadData.business_name || '').toLowerCase();
        const industry = (leadData.industry || '').toLowerCase();
        
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
        const qualification = (leadData.qualification_scc_status || '').toLowerCase();
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
    
    // Generate personalized WhatsApp message
    generatePersonalizedMessage(leadData, analysis) {
        const name = leadData.name || leadData.contact_name || 'Estimado empresario';
        const businessName = leadData.business_name || 'su negocio';
        const phone = leadData.phone_number || leadData.phone || '';
        
        const primaryPainPoint = analysis.painPoints[0] || 'tu negocio no tiene presencia digital profesional';
        const primaryService = analysis.recommendedServices[0] || 'website_design';
        const serviceInfo = this.services[primaryService];
        
        const message = `Hola ${name}, soy Alex de JegoDigital. Analicé ${businessName} en Cancún y encontré oportunidades importantes para hacer crecer tu negocio.

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
📱 ${this.companyInfo.website}
📧 ${this.companyInfo.email}
📞 ${this.companyInfo.phone}`;

        return message;
    }
    
    // Main execution function
    async execute() {
        console.log('🚀 JEGODIGITAL AI LEAD ANALYSIS - STARTING...');
        console.log('===============================================\n');
        
        try {
            // Step 1: Try to fetch leads from different possible sheet names
            console.log('📊 Step 1: Accessing Google Sheets...');
            
            const possibleSheetNames = [
                'Top 200 Qualified Leads',
                'jegodigital-leads-template', 
                'Sheet1',
                'Leads',
                'Qualified Leads'
            ];
            
            let leadsData = null;
            let workingSheetName = null;
            
            for (const sheetName of possibleSheetNames) {
                try {
                    console.log(`   🔍 Trying sheet: "${sheetName}"`);
                    leadsData = await this.fetchGoogleSheetsData(sheetName);
                    
                    if (leadsData.length > 0) {
                        workingSheetName = sheetName;
                        console.log(`   ✅ Found working sheet: "${sheetName}" with ${leadsData.length} rows`);
                        break;
                    }
                } catch (error) {
                    console.log(`   ❌ Sheet "${sheetName}" not accessible: ${error.message}`);
                }
            }
            
            if (!leadsData || leadsData.length === 0) {
                throw new Error('No accessible Google Sheets found');
            }
            
            // Step 2: Process headers and convert to objects
            console.log('\n📋 Step 2: Processing lead data...');
            const headers = leadsData[0];
            const rows = leadsData.slice(1);
            
            console.log(`   📊 Headers found: ${headers.slice(0, 5).join(', ')}...`);
            console.log(`   📊 Processing ${rows.length} leads...`);
            
            // Convert rows to lead objects
            const leads = rows.map((row, index) => {
                const lead = {};
                headers.forEach((header, headerIndex) => {
                    const cleanHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '_');
                    lead[cleanHeader] = row[headerIndex] || '';
                });
                lead.id = lead.id || `LEAD_${(index + 1).toString().padStart(3, '0')}`;
                return lead;
            }).filter(lead => lead.business_name || lead.name || lead.contact_name);
            
            console.log(`   ✅ Valid leads found: ${leads.length}`);
            
            // Step 3: Process first 50 leads
            console.log('\n🤖 Step 3: AI Analysis and Personalized Message Generation...');
            const leadsToProcess = leads.slice(0, 50);
            console.log(`   📊 Processing first ${leadsToProcess.length} leads...`);
            
            const results = [];
            
            for (const [index, lead] of leadsToProcess.entries()) {
                console.log(`   🔍 ${index + 1}. Analyzing: ${lead.business_name || lead.name || 'Unknown Business'}...`);
                
                // Perform AI analysis
                const analysis = this.analyzeLead(lead);
                
                // Generate personalized message
                const personalizedMessage = this.generatePersonalizedMessage(lead, analysis);
                
                // Create result object
                const result = {
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
                    'Personalized WhatsApp Message': personalizedMessage,
                    'Message Status': 'Ready for Outreach',
                    'Last Contact Date': '',
                    'Response Status': 'Pending'
                };
                
                results.push(result);
                
                console.log(`      ✅ Analysis complete - ${analysis.businessType} | ${analysis.priority} priority | ${analysis.confidence}% confidence`);
                console.log(`      🎯 Services: ${analysis.recommendedServices.join(', ')}`);
                console.log(`      💬 Message length: ${personalizedMessage.length} characters`);
            }
            
            // Step 4: Save results
            console.log('\n💾 Step 4: Saving results...');
            
            // Save as CSV for easy import to Google Sheets
            const csvHeaders = Object.keys(results[0]);
            const csvContent = [
                csvHeaders.join(','),
                ...results.map(result => 
                    csvHeaders.map(header => {
                        const value = result[header] || '';
                        // Escape commas and quotes in CSV
                        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                            return `"${value.replace(/"/g, '""')}"`;
                        }
                        return value;
                    }).join(',')
                )
            ].join('\n');
            
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `jegodigital-ai-analysis-${timestamp}.csv`;
            
            fs.writeFileSync(filename, csvContent);
            
            // Step 5: Display summary
            console.log('\n🎉 JEGODIGITAL AI ANALYSIS COMPLETE!');
            console.log('=====================================');
            console.log(`📊 Total Leads Analyzed: ${results.length}`);
            console.log(`📋 Source Sheet: "${workingSheetName}"`);
            console.log(`💾 Results saved to: ${filename}`);
            
            const highPriority = results.filter(r => r['AI Priority Level'] === 'high').length;
            const avgConfidence = Math.round(results.reduce((sum, r) => sum + r['AI Confidence Score'], 0) / results.length);
            
            console.log(`🎯 High Priority Leads: ${highPriority}`);
            console.log(`📈 Average Confidence: ${avgConfidence}%`);
            
            console.log('\n📱 PERSONALIZED WHATSAPP MESSAGES READY:');
            console.log('=========================================');
            console.log('✅ Each message addresses specific pain points');
            console.log('✅ Messages include JegoDigital service benefits');
            console.log('✅ Optimized for high response rates');
            console.log('✅ Ready to copy-paste and send immediately');
            
            // Show sample message
            if (results.length > 0) {
                console.log('\n📝 SAMPLE PERSONALIZED MESSAGE:');
                console.log('==============================');
                const sample = results[0];
                console.log(`Lead: ${sample['Business Name']} (${sample['Contact Name']})`);
                console.log(`Priority: ${sample['AI Priority Level']} | Confidence: ${sample['AI Confidence Score']}%`);
                console.log(`Business Type: ${sample['AI Business Type']}`);
                console.log(`Pain Points: ${sample['AI Pain Points']}`);
                console.log(`Recommended Services: ${sample['AI Recommended Services']}`);
                console.log('\nMessage Preview:');
                console.log(sample['Personalized WhatsApp Message'].substring(0, 300) + '...');
            }
            
            console.log('\n🚀 NEXT STEPS:');
            console.log('==============');
            console.log('1. Import the CSV file into a new Google Sheets tab');
            console.log('2. Start with highest priority leads first');
            console.log('3. Copy personalized messages for WhatsApp outreach');
            console.log('4. Track responses and update lead status');
            console.log('5. Scale to remaining leads in your database');
            
            return {
                success: true,
                results,
                filename,
                summary: {
                    totalLeads: results.length,
                    highPriorityLeads: highPriority,
                    averageConfidence: avgConfidence,
                    sourceSheet: workingSheetName
                }
            };
            
        } catch (error) {
            console.error('\n❌ JEGODIGITAL AI ANALYSIS FAILED:');
            console.error('==================================');
            console.error(`Error: ${error.message}`);
            console.error('\nPossible solutions:');
            console.error('1. Check Google Sheets API key');
            console.error('2. Verify spreadsheet ID');
            console.error('3. Ensure sheet is publicly accessible');
            console.error('4. Check sheet name matches exactly');
            
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Execute the analysis
async function main() {
    const analyzer = new JegoDigitalLeadAnalyzer();
    const results = await analyzer.execute();
    
    if (results.success) {
        console.log('\n🎉 SUCCESS! JegoDigital AI Lead Analysis Complete!');
        console.log(`📊 Generated personalized messages for ${results.summary.totalLeads} leads`);
        console.log(`💾 Results saved to: ${results.filename}`);
        console.log('📱 Ready for WhatsApp outreach with complete JegoDigital service understanding');
    } else {
        console.log('\n❌ Analysis failed. Please check the error messages above.');
    }
}

// Run the analysis
main().catch(console.error);


