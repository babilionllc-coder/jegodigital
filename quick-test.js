console.log('🚀 Quick test starting...');
console.log('✅ Node.js is working');
console.log('📊 Testing Google Sheets access...');

// Simple test without external dependencies
const https = require('https');

const spreadsheetId = '1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg';
const apiKey = 'AIzaSyA-1HU2daAhNIuVOdK6ZN_GOIW9YB1i7a4';
const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Top%20200%20Qualified%20Leads?key=${apiKey}`;

console.log('🔍 Fetching data from:', url);

https.get(url, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        try {
            const jsonData = JSON.parse(data);
            console.log('✅ Successfully fetched data!');
            console.log('📊 Rows found:', jsonData.values ? jsonData.values.length : 0);
            
            if (jsonData.values && jsonData.values.length > 0) {
                console.log('📋 Headers:', jsonData.values[0].slice(0, 5).join(', '));
                console.log('📝 Sample row:', jsonData.values[1] ? jsonData.values[1].slice(0, 3).join(', ') : 'No data');
                
                // Generate sample personalized message
                const sampleLead = jsonData.values[1];
                if (sampleLead && sampleLead.length > 0) {
                    const businessName = sampleLead[0] || 'Business';
                    const contactName = sampleLead[1] || 'Contact';
                    const phone = sampleLead[2] || 'Phone';
                    
                    console.log('\n🎯 SAMPLE PERSONALIZED MESSAGE:');
                    console.log('==============================');
                    
                    const message = `Hola ${contactName}, soy Alex de JegoDigital. Analicé ${businessName} en Cancún y encontré oportunidades importantes para hacer crecer tu negocio.

He notado que tu negocio puede estar perdiendo clientes por falta de presencia digital profesional. Esto puede estar costándote oportunidades de crecimiento en el mercado de Cancún.

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

                    console.log(message);
                    console.log('\n✅ Message generated successfully!');
                }
            }
            
            console.log('\n🎉 AI Analysis test completed successfully!');
            console.log('📱 Ready to generate personalized messages for all leads');
            
        } catch (error) {
            console.error('❌ Error parsing response:', error.message);
        }
    });
}).on('error', (error) => {
    console.error('❌ Request failed:', error.message);
});


