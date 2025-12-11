import os
import datetime
from urllib.parse import urljoin

# Configuration
BASE_URL = "https://jegodigital.com/"
ROOT_DIR = "."  # Current directory (website root)
OUTPUT_FILE = "sitemap.xml"

# Pages to exclude (e.g., templates, partials, private pages)
EXCLUDE_FILES = [
    "404.html",
    "google3464539656.html", # hypothetical verification file
    "template.html",
    "header.html",
    "footer.html"
]

def generate_sitemap():
    print(f"Generating sitemap for {BASE_URL}...")
    
    pages = []
    
    # Scan for .html files
    for filename in os.listdir(ROOT_DIR):
        if filename.endswith(".html") and filename not in EXCLUDE_FILES:
            # Check modification time
            filepath = os.path.join(ROOT_DIR, filename)
            mod_time = os.path.getmtime(filepath)
            lastmod = datetime.datetime.fromtimestamp(mod_time).strftime('%Y-%m-%d')
            
            # Prioritize main pages
            priority = "0.8"
            if filename == "index.html":
                priority = "1.0"
                loc = BASE_URL
            else:
                loc = urljoin(BASE_URL, filename)
                
            pages.append({
                "loc": loc,
                "lastmod": lastmod,
                "priority": priority
            })
            
    # XML Construction
    xml_content = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml_content += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    
    for page in pages:
        xml_content += '  <url>\n'
        xml_content += f'    <loc>{page["loc"]}</loc>\n'
        xml_content += f'    <lastmod>{page["lastmod"]}</lastmod>\n'
        xml_content += '    <changefreq>weekly</changefreq>\n'
        xml_content += f'    <priority>{page["priority"]}</priority>\n'
        xml_content += '  </url>\n'
        
    xml_content += '</urlset>'
    
    # Write to file
    with open(OUTPUT_FILE, 'w') as f:
        f.write(xml_content)
        
    print(f"✅ Generated {OUTPUT_FILE} with {len(pages)} URLs.")

if __name__ == "__main__":
    generate_sitemap()
