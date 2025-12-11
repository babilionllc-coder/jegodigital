import csv

# Source File
INPUT_FILE = "final_b2b_keywords.csv"
OUTPUT_FILE = "semrush_import.csv"

# Domain
BASE_URL = "https://jegodigital.com"

# Content logic
def get_url(keyword):
    k = keyword.lower()
    
    # 1. AI / Chatbots (Lumiere)
    if any(x in k for x in ["chatbot", "ia ", "ia", "inteligencia artificial", "whatsapp", "asistentes", "automatiz"]):
        return f"{BASE_URL}/lumiere.html"
    
    # 2. Real Estate Marketing
    if any(x in k for x in ["inmobiliario", "real estate", "bienes raices", "propiedades", "lead generation"]):
        return f"{BASE_URL}/marketing-realestate.html"
        
    # 3. App Development
    if any(x in k for x in ["app", "aplicacion", "android", "ios", "movil", "mobile"]):
        return f"{BASE_URL}/desarrollo-apps.html"

    # 4. Web Design (Default for 'agencia', 'design', 'web')
    if any(x in k for x in ["web", "diseño", "design", "agencia", "internet", "online", "seo", "posicionamiento"]):
        return f"{BASE_URL}/diseno-web.html"

    # Fallback to Homepage
    return f"{BASE_URL}/"

def main():
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        # Skip header if it exists (it does: "Keyword")
        lines = f.readlines()

    clean_data = []
    
    # Process lines
    for line in lines:
        kw = line.strip()
        if not kw or kw.lower() == "keyword": # Skip header/empty
            continue
            
        url = get_url(kw)
        clean_data.append([kw, url])

    # Write to CSV with correct headers for Semrush
    # Semrush expects: Keyword, URL (separated by comma or semi-colon)
    with open(OUTPUT_FILE, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        # Header (optional but good practice)
        writer.writerow(["Keyword", "URL"])
        writer.writerows(clean_data)

    print(f"✅ Generated {OUTPUT_FILE} with {len(clean_data)} keywords.")

if __name__ == "__main__":
    main()
