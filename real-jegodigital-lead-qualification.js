const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

async function realJegoDigitalLeadQualification() {
    try {
        console.log('🎯 REAL JEGODIGITAL LEAD QUALIFICATION SYSTEM');
        console.log('==============================================');
        console.log('🔍 NO FAKE SCORING - ONLY REAL BUSINESS CRITERIA');
        
        // Load service account credentials
        const serviceAccountConfig = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));
        const serviceAccountAuth = new JWT({
            email: serviceAccountConfig.client_email,
            key: serviceAccountConfig.private_key,
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive.file',
            ],
        });

        // Connect to spreadsheet
        const doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', serviceAccountAuth);
        await doc.loadInfo();
        console.log('✅ Connected to:', doc.title);

        // Get the leads sheet
        const leadsSheet = doc.sheetsByTitle['jegodigital-leads-template'];
        if (!leadsSheet) {
            console.log('❌ Could not find leads sheet');
            return;
        }

        console.log('📊 Loading all 2318 leads...');
        await leadsSheet.loadHeaderRow();
        const rows = await leadsSheet.getRows();
        
        console.log('📋 Available columns:', leadsSheet.headerValues);

        // REAL JegoDigital Business Criteria (No fake scoring)
        console.log('\n🏢 REAL JEGODIGITAL BUSINESS CRITERIA:');
        console.log('=====================================');
        
        const realCriteria = {
            // 1. BUSINESSES THAT ACTUALLY NEED WEBSITES
            noWebsiteBusinesses: [],
            
            // 2. BUSINESSES WITH BAD WEBSITES (that need improvement)
            badWebsiteBusinesses: [],
            
            // 3. BUSINESSES THAT NEED SEO (have websites but not optimized)
            needsSEO: [],
            
            // 4. LOCAL CANCÚN BUSINESSES (our target market)
            localCancunBusinesses: [],
            
            // 5. HIGH-VALUE BUSINESSES (hotels, restaurants, spas, gyms)
            highValueBusinesses: [],
            
            // 6. BUSINESSES WITH CONTACT INFO (we can actually reach them)
            contactableBusinesses: []
        };

        console.log('🔍 ANALYZING EACH LEAD WITH REAL CRITERIA...');
        console.log('============================================');

        rows.forEach((row, index) => {
            const businessName = row.get('Business Name') || '';
            const website = row.get('Website') || '';
            const phone = row.get('Phone') || '';
            const email = row.get('Email') || '';
            const businessType = row.get('Business Type') || '';
            const address = row.get('Address') || '';
            
            // REAL CRITERIA 1: No Website (Perfect for website design service)
            if (!website || website.length < 10 || !website.includes('http')) {
                realCriteria.noWebsiteBusinesses.push({
                    businessName,
                    phone,
                    email,
                    businessType,
                    address,
                    reason: 'NO WEBSITE - Perfect for website design service',
                    rowIndex: index
                });
            }
            
            // REAL CRITERIA 2: Bad Website (Needs improvement)
            if (website.includes('http') && website.length > 10) {
                // Check if it's a basic/bad website
                if (website.includes('facebook.com') || 
                    website.includes('instagram.com') || 
                    website.includes('google.com/maps') ||
                    website.includes('wix.com') ||
                    website.includes('wordpress.com')) {
                    realCriteria.badWebsiteBusinesses.push({
                        businessName,
                        website,
                        phone,
                        email,
                        businessType,
                        address,
                        reason: 'BASIC/SOCIAL MEDIA WEBSITE - Needs professional website',
                        rowIndex: index
                    });
                } else {
                    realCriteria.needsSEO.push({
                        businessName,
                        website,
                        phone,
                        email,
                        businessType,
                        address,
                        reason: 'HAS WEBSITE - Needs SEO optimization',
                        rowIndex: index
                    });
                }
            }
            
            // REAL CRITERIA 3: Local Cancún Businesses
            if (businessName.toLowerCase().includes('cancun') || 
                businessName.toLowerCase().includes('cancún') ||
                address.toLowerCase().includes('cancun') ||
                address.toLowerCase().includes('cancún')) {
                realCriteria.localCancunBusinesses.push({
                    businessName,
                    phone,
                    email,
                    businessType,
                    address,
                    reason: 'LOCAL CANCÚN BUSINESS - Our target market',
                    rowIndex: index
                });
            }
            
            // REAL CRITERIA 4: High-Value Business Types
            const highValueTypes = [
                'hotel', 'restaurant', 'spa', 'gym', 'dental', 'clinic', 
                'travel', 'tour', 'beauty', 'salon', 'real estate', 'law'
            ];
            
            if (highValueTypes.some(type => 
                businessName.toLowerCase().includes(type) || 
                businessType.toLowerCase().includes(type))) {
                realCriteria.highValueBusinesses.push({
                    businessName,
                    phone,
                    email,
                    businessType,
                    address,
                    reason: 'HIGH-VALUE BUSINESS TYPE - Good revenue potential',
                    rowIndex: index
                });
            }
            
            // REAL CRITERIA 5: Contactable (we can actually reach them)
            if (phone && phone.length > 5) {
                realCriteria.contactableBusinesses.push({
                    businessName,
                    phone,
                    email,
                    businessType,
                    address,
                    reason: 'HAS PHONE - We can contact them',
                    rowIndex: index
                });
            }
        });

        // Display REAL Analysis Results
        console.log('\n📊 REAL QUALIFICATION RESULTS:');
        console.log('==============================');
        console.log(`🚫 NO WEBSITE: ${realCriteria.noWebsiteBusinesses.length} businesses`);
        console.log(`⚠️  BAD WEBSITE: ${realCriteria.badWebsiteBusinesses.length} businesses`);
        console.log(`🔍 NEEDS SEO: ${realCriteria.needsSEO.length} businesses`);
        console.log(`🏠 LOCAL CANCÚN: ${realCriteria.localCancunBusinesses.length} businesses`);
        console.log(`💰 HIGH-VALUE: ${realCriteria.highValueBusinesses.length} businesses`);
        console.log(`📞 CONTACTABLE: ${realCriteria.contactableBusinesses.length} businesses`);

        // Find the BEST leads using REAL intersection criteria
        console.log('\n🏆 FINDING BEST LEADS USING REAL CRITERIA INTERSECTION:');
        console.log('=======================================================');
        
        // Best leads = No website + Local Cancún + High-value + Contactable
        const bestLeads = [];
        
        realCriteria.noWebsiteBusinesses.forEach(noWebsiteLead => {
            // Check if it's also local Cancún
            const isLocalCancun = realCriteria.localCancunBusinesses.some(local => 
                local.businessName === noWebsiteLead.businessName);
            
            // Check if it's also high-value
            const isHighValue = realCriteria.highValueBusinesses.some(highValue => 
                highValue.businessName === noWebsiteLead.businessName);
            
            // Check if it's contactable
            const isContactable = realCriteria.contactableBusinesses.some(contact => 
                contact.businessName === noWebsiteLead.businessName);
            
            if (isLocalCancun && isHighValue && isContactable) {
                bestLeads.push({
                    ...noWebsiteLead,
                    realScore: 'PERFECT MATCH',
                    realReasons: [
                        'NO WEBSITE - Needs website design',
                        'LOCAL CANCÚN - Our target market',
                        'HIGH-VALUE BUSINESS - Good revenue potential',
                        'HAS PHONE - We can contact them'
                    ]
                });
            }
        });

        console.log(`\n🎯 PERFECT MATCH LEADS: ${bestLeads.length}`);
        
        // Show top 50 perfect matches
        const top50Perfect = bestLeads.slice(0, 50);
        
        console.log('\n🏆 TOP 50 PERFECT LEADS FOR JEGODIGITAL:');
        console.log('=========================================');
        
        top50Perfect.forEach((lead, index) => {
            console.log(`\n${index + 1}. ${lead.businessName}`);
            console.log(`   Phone: ${lead.phone || 'No phone'}`);
            console.log(`   Email: ${lead.email || 'No email'}`);
            console.log(`   Type: ${lead.businessType || 'Not specified'}`);
            console.log(`   Address: ${lead.address || 'Not specified'}`);
            console.log(`   Score: ${lead.realScore}`);
            console.log(`   Reasons: ${lead.realReasons.join(', ')}`);
        });

        // Create REAL qualification sheet
        console.log('\n📊 Creating "REAL Perfect Leads" sheet...');
        
        let perfectLeadsSheet = doc.sheetsByTitle['REAL Perfect Leads'];
        if (!perfectLeadsSheet) {
            perfectLeadsSheet = await doc.addSheet({
                title: 'REAL Perfect Leads'
            });
        }

        // Set headers for REAL analysis
        const headers = [
            'Rank', 'Business Name', 'Phone', 'Email', 'Business Type', 
            'Address', 'Real Score', 'Real Reasons', 'Service Needed'
        ];
        await perfectLeadsSheet.setHeaderRow(headers);

        // Add the REAL perfect leads
        const leadData = top50Perfect.map((lead, index) => [
            index + 1,
            lead.businessName,
            lead.phone || '',
            lead.email || '',
            lead.businessType || '',
            lead.address || '',
            lead.realScore,
            lead.realReasons.join('; '),
            'Website Design + SEO + Google Maps'
        ]);

        await perfectLeadsSheet.addRows(leadData);

        console.log('✅ REAL perfect leads saved to Google Sheets!');
        
        // Summary of REAL qualification
        console.log('\n📈 REAL QUALIFICATION SUMMARY:');
        console.log(`Total Leads Analyzed: ${rows.length}`);
        console.log(`Perfect Matches Found: ${bestLeads.length}`);
        console.log(`Top 50 Selected: ${top50Perfect.length}`);
        console.log(`Success Rate: ${Math.round((bestLeads.length / rows.length) * 100)}%`);

        return top50Perfect;

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    }
}

realJegoDigitalLeadQualification();

