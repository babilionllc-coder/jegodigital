import csv

# Source File
INPUT_FILE = "final_b2b_keywords.csv"
BASE_URL = "https://jegodigital.com"

def get_url(keyword):
    k = keyword.lower()
    
    # 1. App Development (Specific)
    if any(x in k for x in ["app", "aplicacion", "android", "ios", "movil", "mobile"]):
        return f"{BASE_URL}/desarrollo-apps.html"

    # 2. Real Estate Marketing (Specific)
    if any(x in k for x in ["inmobiliario", "real estate", "bienes raices", "propiedades", "lead generation"]):
        return f"{BASE_URL}/marketing-realestate.html"

    # 3. AI / Chatbots (Specific)
    # Note: Search for "ia " (with space) or " ia" to avoid matching "agencia"
    if any(x in k for x in ["chatbot", "inteligencia artificial", "whatsapp", "asistentes", "automatiz", " ia ", " ia"]):
        return f"{BASE_URL}/lumiere.html"
    
    # 4. Web Design (Broad catch-all for Agency/Design)
    if any(x in k for x in ["web", "diseño", "design", "agencia", "internet", "online", "seo", "posicionamiento"]):
        return f"{BASE_URL}/diseno-web.html"
        
    return f"{BASE_URL}/"

def main():
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    clean_data = []
    for line in lines:
        kw = line.strip()
        if not kw or kw.lower() == "keyword":
            continue
        url = get_url(kw)
        clean_data.append([kw, url])

    # Variant 1: Standard (Comma, Header: Keyword, Landing Page)
    with open("semrush_v1_standard.csv", 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(["Keyword", "Landing Page"])
        writer.writerows(clean_data)

    # Variant 2: No Header (Comma)
    with open("semrush_v2_noheader.csv", 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerows(clean_data)

    # Variant 3: Excel/LatAm (Semicolon, Header: Keyword;Landing Page)
    with open("semrush_v3_semicolon.csv", 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f, delimiter=';')
        writer.writerow(["Keyword", "Landing Page"])
        writer.writerows(clean_data)

    print("✅ Generated 3 Clean Files.")

if __name__ == "__main__":
    main()
