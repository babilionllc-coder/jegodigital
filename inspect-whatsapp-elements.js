const puppeteer = require('puppeteer');

async function inspectWhatsAppElements() {
    console.log('🔍 INSPECTING WHATSAPP WEB ELEMENTS...');
    
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('📱 Opening WhatsApp Web...');
    await page.goto('https://web.whatsapp.com/', { 
        waitUntil: 'networkidle2',
        timeout: 30000 
    });
    
    console.log('⏳ Waiting for WhatsApp to load...');
    console.log('📱 Please scan QR code if needed...');
    
    // Wait for user to scan QR code
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    console.log('🔍 INSPECTING WHATSAPP ELEMENTS...');
    
    // Get all possible selectors
    const elements = await page.evaluate(() => {
        const results = [];
        
        // Find all clickable elements
        const clickableElements = document.querySelectorAll('button, div[role="button"], div[onclick], [data-testid], [title], [aria-label]');
        
        clickableElements.forEach((el, index) => {
            if (index < 20) { // Limit to first 20 elements
                results.push({
                    tag: el.tagName,
                    id: el.id || 'no-id',
                    className: el.className || 'no-class',
                    dataTestId: el.getAttribute('data-testid') || 'no-testid',
                    title: el.getAttribute('title') || 'no-title',
                    ariaLabel: el.getAttribute('aria-label') || 'no-aria-label',
                    textContent: el.textContent?.substring(0, 50) || 'no-text',
                    selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ').join('.') : '')
                });
            }
        });
        
        return results;
    });
    
    console.log('\n🎯 FOUND WHATSAPP ELEMENTS:');
    console.log('=' .repeat(80));
    
    elements.forEach((el, index) => {
        console.log(`\n${index + 1}. ELEMENT:`);
        console.log(`   Tag: ${el.tag}`);
        console.log(`   ID: ${el.id}`);
        console.log(`   Class: ${el.className}`);
        console.log(`   Data-testid: ${el.dataTestId}`);
        console.log(`   Title: ${el.title}`);
        console.log(`   Aria-label: ${el.ariaLabel}`);
        console.log(`   Text: ${el.textContent}`);
        console.log(`   Selector: ${el.selector}`);
    });
    
    // Look for specific WhatsApp elements
    console.log('\n🔍 LOOKING FOR SPECIFIC WHATSAPP ELEMENTS:');
    
    const specificElements = await page.evaluate(() => {
        const results = {};
        
        // Search for new chat button
        const newChatSelectors = [
            'div[data-testid="chat"]',
            'div[title="Search or start new chat"]',
            'button[aria-label="New chat"]',
            'div[aria-label*="chat"]',
            'div[title*="chat"]'
        ];
        
        newChatSelectors.forEach(selector => {
            const element = document.querySelector(selector);
            if (element) {
                results[selector] = {
                    found: true,
                    tag: element.tagName,
                    text: element.textContent?.substring(0, 30),
                    attributes: Array.from(element.attributes).map(attr => `${attr.name}="${attr.value}"`)
                };
            } else {
                results[selector] = { found: false };
            }
        });
        
        // Search for search box
        const searchSelectors = [
            'div[data-testid="search"]',
            'input[data-testid="search"]',
            'input[placeholder*="Search"]',
            'input[placeholder*="Buscar"]'
        ];
        
        searchSelectors.forEach(selector => {
            const element = document.querySelector(selector);
            if (element) {
                results[selector] = {
                    found: true,
                    tag: element.tagName,
                    placeholder: element.getAttribute('placeholder'),
                    attributes: Array.from(element.attributes).map(attr => `${attr.name}="${attr.value}"`)
                };
            } else {
                results[selector] = { found: false };
            }
        });
        
        // Search for message input
        const messageSelectors = [
            'div[data-testid="conversation-compose-box-input"]',
            'div[contenteditable="true"]',
            'div[data-testid="message-input"]',
            'div[title="Type a message"]'
        ];
        
        messageSelectors.forEach(selector => {
            const element = document.querySelector(selector);
            if (element) {
                results[selector] = {
                    found: true,
                    tag: element.tagName,
                    title: element.getAttribute('title'),
                    attributes: Array.from(element.attributes).map(attr => `${attr.name}="${attr.value}"`)
                };
            } else {
                results[selector] = { found: false };
            }
        });
        
        return results;
    });
    
    console.log('\n🎯 SPECIFIC ELEMENT CHECK:');
    Object.entries(specificElements).forEach(([selector, info]) => {
        if (info.found) {
            console.log(`✅ FOUND: ${selector}`);
            console.log(`   Tag: ${info.tag}`);
            if (info.text) console.log(`   Text: ${info.text}`);
            if (info.placeholder) console.log(`   Placeholder: ${info.placeholder}`);
            if (info.title) console.log(`   Title: ${info.title}`);
        } else {
            console.log(`❌ NOT FOUND: ${selector}`);
        }
    });
    
    console.log('\n⏳ Keeping browser open for 30 seconds so you can inspect...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    await browser.close();
    console.log('🔧 Browser closed');
}

inspectWhatsAppElements().catch(console.error);

