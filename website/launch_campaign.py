import smtplib
import ssl
import csv
import time
import random
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# --- CONFIGURATION (FILL THESE IN!) ---
# To get App Passwords: Go to myaccount.google.com -> Security -> 2-Step Verification -> App Passwords
SENDERS = [
    {"email": "alexiuzjeg@gmail.com", "pass": "eebm mfcj guei enjc"},
    {"email": "bkningstore@gmail.com", "pass": "fpvs lmsi zfbg epiv"},
    {"email": "creeksidemaile@gmail.com", "pass": "mqrx hcqj slhq ypes"},
    {"email": "eggstralearn@gmail.com", "pass": "yvmu qfvb gvcc zqiz"},
    {"email": "jegoalexdigital@gmail.com", "pass": "lpmm opaz osag binu"},
    {"email": "jegooalex@gmail.com", "pass": "pjpw mdzl xsrq bwgc"}, # Updated
    {"email": "jfranzisca@gmail.com", "pass": "nailed123"},
    {"email": "jmariaa4@gmail.com", "pass": "nailed123"},
    {"email": "namitachohan222@gmail.com", "pass": "nailed123"},
    {"email": "promptigo14@gmail.com", "pass": "nailed123"}
]

# Campaign Settings
EMAILS_PER_ACCOUNT = 10
DELAY_MIN = 60
DELAY_MAX = 120
Total_Target = len(SENDERS) * EMAILS_PER_ACCOUNT  # 100 Emails

# File Paths
LEADS_FILE = "b2b_leads_enriched.csv"
LOG_FILE = "campaign_log.txt"

# --- HELPER: Sanitize Hook for Local Market ---
def sanitize_hook_for_local(hook):
    """Adapts 'USA/English' hooks to 'Local/Mobile' hooks on the fly."""
    if "Inglés" in hook or "USA" in hook or "americano" in hook:
        return "noté que la experiencia móvil en su sitio podría ser más fluida para clientes de CDMX"
    return hook

import requests
from bs4 import BeautifulSoup

# --- LIVE WEBSITE ANALYSIS ---
def analyze_website_live(url):
    """Scrapes the website to detect niche AND specific technical gaps."""
    findings = {"niche": "GENERAL", "missing_chatbot": True, "tech": "Generic"}
    try:
        # Add http if missing
        if not url.startswith('http'):
            url = 'https://' + url
            
        response = requests.get(url, timeout=10, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'})
        soup = BeautifulSoup(response.text, 'html.parser')
        
        text_content = (soup.title.string if soup.title else "") + " " + \
                       (soup.find("meta", {"name": "description"})['content'] if soup.find("meta", {"name": "description"}) else "") + " " + \
                       soup.get_text()
        text_content = text_content.lower()
        html_content = str(soup).lower()
        
        # 1. Niche Detection
        if any(x in text_content for x in ['luxury', 'lujo', 'exclusivo', 'premium', 'high-end', 'mansión']):
            findings['niche'] = "LUXURY"
        elif any(x in text_content for x in ['inversión', 'roi', 'rentabilidad', 'airbnb', 'invest', 'capital']):
            findings['niche'] = "INVESTMENT"
        elif any(x in text_content for x in ['eco', 'sustentable', 'selva', 'preservación', 'verde', 'nature']):
            findings['niche'] = "ECO"
            
        # 2. Tech/Gap Detection
        if any(x in html_content for x in ['wp-content', 'wordpress']):
            findings['tech'] = "WordPress"
        
        # Check for common chat widgets
        if any(x in html_content for x in ['tidio', 'tawk.to', 'zendesk', 'hubspot', 'whatsapp', 'intercom', 'drift']):
            findings['missing_chatbot'] = False
            
        # 3. Specific Offering Detection (Show we read the site)
        findings['offering'] = "su portafolio inmobiliario" # Default
        if any(x in text_content for x in ['preventa', 'pre-sale', 'desarrollo']):
            findings['offering'] = "sus desarrollos en preventa"
        elif any(x in text_content for x in ['renta vacacional', 'vacation rental', 'airbnb']):
            findings['offering'] = "sus propiedades para renta vacacional"
        elif any(x in text_content for x in ['hotel', 'resort', 'hospedaje']):
            findings['offering'] = "sus servicios de hospitalidad"
        elif any(x in text_content for x in ['terrenos', 'lotes', 'land']):
            findings['offering'] = "su oferta de lotes de inversión"
        elif any(x in text_content for x in ['tours', 'cenote', 'experiencia', 'adventure']):
            findings['offering'] = "sus experiencias turísticas"

        return findings
    except:
        return findings

def clean_company_name(title):
    """Extracts the likely company name from the page title."""
    if not title: return "su empresa"
    separators = ['|', '-', ':', '–', '—']
    clean_title = title
    for sep in separators:
        if sep in clean_title:
            clean_title = clean_title.split(sep)[0]
    return clean_title.strip()

# --- EMAIL TEMPLATE GENERATOR ---
def create_email(sender_email, lead):
    # 1. Analyze Site LIVE
    print(f"   🕵️ Analyzing {lead['domain']}...")
    analysis = analyze_website_live(lead['domain'])
    niche = analysis['niche']
    print(f"   👉 Detected: {niche} | Missing Chatbot: {analysis['missing_chatbot']}")
    
    # Extract Company Name
    company_name = clean_company_name(lead.get('title', ''))
    if len(company_name) > 30 or len(company_name) < 2:
        company_name = lead['domain']

    # 2. Select Template based on Niche & Gaps
    # HIT: High Intent Titles (Curiosity + Relevance)
    subject_variations = [
        f"Pregunta rápida sobre {company_name}",  # Classic Curiosity
        f"¿{company_name} acepta clientes de CDMX?", # Market Relevance
        f"Idea para el sitio web de {company_name}", # Value Proposition
        f"Vi su propiedad en {company_name}", # Hyper-Specific (if Real Estate)
        f"Oportunidad de IA para {company_name} 🤖", # Tech Curiosity
        f"Feedback sobre {company_name} (Constructivo) 📝", # Ego Bait
        f"Marketing para {company_name} en 2025 🚀" # Urgency
    ]
    subject = random.choice(subject_variations)
    
    # Needs-Based Personalization (AI & Pain Points)
    if niche == "LUXURY":
        pain_point = "En el sector de lujo, una respuesta lenta o una web genérica le cuesta ventas millonarias cada mes. 💸"
        solution_focus = "AI Concierge & Diseño Premium: Un agente digital que atiende a VIPs 24/7."
    elif niche == "INVESTMENT":
        pain_point = "Los inversionistas no esperan. Si su web no muestra ROI y confianza en 3 segundos, el capital se va. 📉"
        solution_focus = "AI Sales Agents: Captura, califica y agenda citas con inversionistas en automático."
    elif niche == "ECO":
        pain_point = "Vender un estilo de vida sustentable requiere una conexión emocional que una web estática no logra. 🌿"
        solution_focus = "Storytelling Inmersivo con IA: Experiencias web que enamoran y convierten."
    else:
        pain_point = "La competencia es brutal. Seguir dependiendo de procesos manuales es el camino lento a la obsolescencia. 🐢"
        solution_focus = "Ecosistema de Ventas con IA: Automatice su seguimiento y multiplique sus cierres."

    # Specific Observation Hook (Tech Gap)
    if analysis['missing_chatbot']:
        observation = f"noté que su sitio no tiene un asistente virtual activo 🤖. Está perdiendo leads nocturnos de Europa/USA."
        specific_offer = "**Chatbots con IA (tipo ChatGPT)**: Atienda a 50 clientes a la vez, en cualquier idioma, sin dormir."
    else:
        observation = f"vi que tienen chat, pero ¿realmente está cerrando ventas o solo saluda? 🤔"
        specific_offer = "**Optimización de IA**: Convierta su chat actual en una máquina de ventas que califica prospectos sola."

    # 3. Build Body
    greetings = [
        f"Hola equipo de **{company_name}** 👋,",
        f"Buen día {lead.get('emails', '').split('@')[0]} ☀️,",
        f"Qué tal equipo de **{company_name}**,"
    ]
    
    # Dynamic Openers using Scraped Business Knowledge
    openers = [
        f"Estuve analizando **{analysis['offering']}** en su sitio web y **{observation}** 👀.",
        f"Revisando su web, me interesó mucho **{analysis['offering']}**, pero **{observation}** 🤔.",
        f"Analicé su sitio web enfocado en **{analysis['offering']}** y detecté una oportunidad clave. 💡"
    ]
    
    body = f"""{random.choice(greetings)}

{random.choice(openers)}

{pain_point} 📉

En **JegoDigital**, utilizamos **Inteligencia Artificial de Vanguardia (Cutting-Edge AI)** para ayudar a empresas como **{company_name}** a dominar su mercado.

Para su negocio ({niche.title() if niche != 'GENERAL' else 'Inmobiliario'}), proponemos:
1.  ✨ **{solution_focus}**
2.  🚀 **Dominio en Google (SEO)**: Para aparecer justo cuando el cliente busca.
3.  🤖 **{specific_offer}**

**¿Le interesaría ver una demo en vivo?** 👀
Puede probar nuestros **Agentes y Chatbots** directamente en nuestra web:
👉 https://jegodigital.com/#demos 🌐

**¿Hablemos de negocios?** 🤝
Escríbame directo por WhatsApp: **+52 998 202 3263** 📲
O responda a este correo.

Saludos,

Alex Jego
Director, JegoDigital
🌐 https://jegodigital.com/
WhatsApp: +52 998 202 3263"""

    msg = MIMEMultipart()
    msg['From'] = f"Alex Jego <{sender_email}>"
    msg['To'] = lead['emails'].split(',')[0]
    msg['Subject'] = subject
    msg['Reply-To'] = "jegoalexdigital@gmail.com"
    msg.attach(MIMEText(body, 'plain'))
    return msg

# --- MAIN ENGINE ---
def main():
    print(f"🚀 LAUNCHING CAMPAIGN: {Total_Target} Emails across {len(SENDERS)} Accounts")
    print(f"⏱️  Natural Delay: {DELAY_MIN}-{DELAY_MAX} seconds between sends\n")

    # 1. Load Sent Emails & Track Sender Usage
    sent_emails = set()
    sender_usage = {s['email']: 0 for s in SENDERS}
    
    try:
        with open(LOG_FILE, 'r') as f:
            for line in f:
                # Track Recipient (Avoid Duplicates)
                if "-> To:" in line:
                    email_sent = line.split("-> To:")[1].strip()
                    sent_emails.add(email_sent)
                
                # Track Sender Usage (Strict Limits)
                if "From:" in line:
                    parts = line.split("From:")
                    if "->" in parts[1]:
                        sender_email = parts[1].split("->")[0].strip()
                        if sender_email in sender_usage:
                            sender_usage[sender_email] += 1

        print(f"📜 Found {len(sent_emails)} sent emails.")
        print(f"📊 Sender Usage Today: {sender_usage}")
        
    except FileNotFoundError:
        pass

    # 2. Load Leads
    leads = []
    with open(LEADS_FILE, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        leads = [row for row in reader if row.get('emails')]
    
    print(f"📋 Loaded {len(leads)} leads available.")
    
    if len(leads) < Total_Target:
        print("⚠️ Warning: Not enough leads for full target. Sending to all available.")

    # 3. Iterate Senders
    lead_index = 0
    total_sent_session = 0
    
    for sender in SENDERS:
        if lead_index >= len(leads) or total_sent_session >= Total_Target:
            break

        email_user = sender['email']
        email_pass = sender['pass']
        
        # Check Quota
        start_count = sender_usage.get(email_user, 0)
        if start_count >= EMAILS_PER_ACCOUNT:
            print(f"⚠️ {email_user} hit daily limit ({start_count}/{EMAILS_PER_ACCOUNT}). Skipping.")
            continue
            
        if "PASTE_APP_PASSWORD" in email_pass: # Only skip default placeholder
            print(f"❌ SKIPPING {email_user}: Password not configured.")
            continue

        print(f"\n📧 Connecting Account: {email_user} (Used: {start_count}/{EMAILS_PER_ACCOUNT})...")
        
        try:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
                server.login(email_user, email_pass)
                
                # Send Remaining Quota
                count_account = start_count
                while count_account < EMAILS_PER_ACCOUNT and lead_index < len(leads):
                    lead = leads[lead_index]
                    target_email = lead['emails'].split(',')[0]
                    
                    # DUPLICATE CHECK
                    if target_email in sent_emails:
                        print(f"   ⏩ Skipping {target_email} (Already Sent)")
                        lead_index += 1
                        continue

                    try:
                        msg = create_email(email_user, lead)
                        server.send_message(msg)
                        
                        log_msg = f"✅ SENT [{lead_index+1}/{Total_Target}] | From: {email_user} -> To: {target_email}"
                        print(log_msg)
                        with open(LOG_FILE, "a") as log:
                            log.write(log_msg + "\n")
                            
                        # Natural Delay
                        wait_time = random.randint(DELAY_MIN, DELAY_MAX)
                        print(f"   💤 Waiting {wait_time}s...")
                        time.sleep(wait_time)
                        
                        count_account += 1
                        total_sent_session += 1
                        lead_index += 1
                    except Exception as e:
                        print(f"   ❌ Failed to send to {target_email}: {e}")
                        lead_index += 1 # Skip lead
                        
        except Exception as e:
            print(f"❌ Login Failed for {email_user}: {e}")

if __name__ == "__main__":
    main()
