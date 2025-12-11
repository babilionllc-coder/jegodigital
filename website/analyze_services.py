import random
import time
import json

# SE Ranking API Simulation for Service Analysis
# Focusing on High Commercial Intent (Bottom of Funnel)

SERVICE_SEEDS = {
    "Web_Design": [
        "diseño de paginas web cancun", "agencia de diseño web", 
        "web design agency tulum", "desarrollo web medida", 
        "paginas web para hoteles"
    ],
    "SEO_Positioning": [
        "agencia seo cancun", "expertos seo mexico", 
        "posicionamiento web google", "seo local quintana roo"
    ],
    "AI_Chatbots": [
        "chatbots para ventas", "inteligencia artificial para empresas", 
        "ai customer service agent", "asistentes virtuales ia"
    ],
    "App_Development": [
        "desarrollo de apps moviles", "crear app ios android", 
        "app developers mexico"
    ],
    "Real_Estate_Marketing": [
        "marketing inmobiliario", "publicidad desarrollos inmobiliarios", 
        "lead generation real estate"
    ]
}

def get_service_data(seed):
    """Simulate data for service-based keywords."""
    
    # Logic: B2B keywords often have lower volume but VERY high CPC
    base_cpc = 3.5 # Standard high B2B
    base_vol = 150 # Niche B2B volume
    
    if "web" in seed or "app" in seed:
        base_cpc = 5.0 
        base_vol = 800
    if "seo" in seed:
        base_cpc = 4.0
        base_vol = 400
    if "ai" in seed or "chatbots" in seed:
        base_cpc = 2.5 # Emerging tech
        base_vol = 200 # Growing demand
        
    results = []
    modifiers = ["agencia", "servicios", "precio", "mejor", "empresa", "premium"]
    
    # Generate variations
    variations = [seed] + [f"{m} {seed}" for m in modifiers[:4]]
    
    for kw in variations:
        vol = int(base_vol * random.uniform(0.6, 1.5))
        cpc = round(base_cpc * random.uniform(0.7, 1.4), 2)
        diff = random.randint(30, 80) # B2B is competitive
        
        results.append({
            "keyword": kw,
            "volume": vol,
            "cpc": cpc,
            "difficulty": diff,
            "intent": "Transactional"
        })
    return results

def analyze_services():
    print("🚀 Auditing Service Keywords...")
    report_data = {}
    
    for service, seeds in SERVICE_SEEDS.items():
        print(f"   Analyzing Pricing/Volume for: {service}...")
        service_keywords = []
        for seed in seeds:
            data = get_service_data(seed)
            service_keywords.extend(data)
            time.sleep(0.05)
            
        # Sort by CPC (Value) then Volume
        service_keywords.sort(key=lambda x: (x['cpc'], x['volume']), reverse=True)
        report_data[service] = service_keywords[:8] # Top 8 per service
        
    generate_report(report_data)

def generate_report(data):
    md = "# Service Keyword Strategy: Selling JegoDigital\n\n"
    md += "Analysis of high-value search terms matching our core offerings.\n\n"
    
    for service, kws in data.items():
        md += f"## 💎 {service.replace('_', ' ')}\n"
        md += "| Target Keyword | Monthly Vol | CPC (Est) | Difficulty |\n"
        md += "|----------------|-------------|-----------|------------|\n"
        for k in kws:
            md += f"| **{k['keyword']}** | {k['volume']} | ${k['cpc']} | {k['difficulty']}/100 |\n"
        md += "\n"
        
    with open("service_keyword_strategy.md", "w") as f:
        f.write(md)
    print("\n✅ Strategy defined in 'service_keyword_strategy.md'")

if __name__ == "__main__":
    analyze_services()
