#!/usr/bin/env python3
"""Create Audit_Trojan_MX_v1 campaign in Instantly via v2 API."""
import requests, json, sys

API = "https://api.instantly.ai/api/v2"
KEY = "YjM5MThkYzAtYzgxMS00MTRiLTg5ZmEtODBiNTlkM2MzZTIwOkNZVnVaTWp6a3RPSg=="
HDR = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

SENDING_ACCOUNTS = [
    "mail@aichatsy.com", "contact@aichatsy.com",
    "leads@jegoaeo.com", "info@jegoaeo.com", "alex@jegoaeo.com",
    "reply@jegoleads.com", "info@jegoleads.com", "alex@jegoleads.com",
]

SEQUENCE_STEPS = [
    {"type": "email", "delay": 0, "variants": [{
        "subject": "Auditamos {{website}}",
        "body": (
            "Hola {{firstName}},\n\n"
            "Auditamos tu sitio {{website}} hoy:\n\n"
            "- PageSpeed: {{pageSpeed}}/100\n"
            "- {{mainIssue}}\n"
            "- Tu agencia no aparece en ChatGPT ni Perplexity cuando buscan inmobiliarias en {{city}}\n\n"
            "GoodLife Tulum logró 300% más tráfico orgánico trabajando con nosotros.\n\n"
            "¿Te mando el audit completo en 60 minutos? Sin costo.\n\n"
            "Alex\nJegoDigital"
        )}]},
    {"type": "email", "delay": 4, "variants": [{
        "subject": "Recordatorio",
        "body": (
            "Hola {{firstName}},\n\n"
            "Te escribí hace unos días sobre la auditoría gratis de {{website}}.\n\n"
            "Un dato de mi correo anterior:\n- PageSpeed actual: {{pageSpeed}}/100\n\n"
            "Solo 1 de cada 20 inmobiliarias en México pasa 85/100. Cada punto debajo de eso son visitantes que se van antes de ver una sola propiedad.\n\n"
            "¿Te mando el audit? Contesta \"sí\" y lo tienes en tu correo en menos de una hora.\n\nAlex"
        )}]},
    {"type": "email", "delay": 5, "variants": [{
        "subject": "Caso real",
        "body": (
            "Hola {{firstName}},\n\n"
            "Rápido — un caso que puede interesarte:\n\n"
            "Flamingo Real Estate (Cancún) llegó a nosotros con el mismo perfil que {{companyName}}: buen inventario, sitio lento, invisibles en Google Maps.\n\n"
            "En 90 días:\n- #1 en Google Maps en su zona\n- 4.4x más visibilidad en búsquedas\n- 88% de sus leads ahora los atiende IA automáticamente\n\n"
            "La auditoría gratis de {{website}} te muestra exactamente qué replicar.\n\n"
            "¿Te la mando?\n\nAlex"
        )}]},
    {"type": "email", "delay": 7, "variants": [{
        "subject": "¿Error mío?",
        "body": (
            "Hola {{firstName}},\n\n"
            "Quizá no soy la persona correcta para esto en {{companyName}}.\n\n"
            "¿Me pasas el contacto de quien maneja el marketing digital? Les mando directo la auditoría gratis de {{website}} y los dejo en paz.\n\n"
            "Gracias.\n\nAlex\nJegoDigital"
        )}]},
    {"type": "email", "delay": 7, "variants": [{
        "subject": "Último mensaje",
        "body": (
            "Hola {{firstName}},\n\n"
            "Último correo de mi parte.\n\n"
            "La auditoría gratis de {{website}} se queda disponible por si cambia algo: solo responde \"audit\" a este correo y la envío.\n\n"
            "Si no es el momento, todo bien — gracias por tu tiempo.\n\nAlex\nJegoDigital"
        )}]},
]

def create():
    payload = {
        "name": "Audit_Trojan_MX_v1",
        "campaign_schedule": {"schedules": [{
            "name": "Weekdays",
            "timing": {"from": "09:00", "to": "17:00"},
            "days": {"0": False, "1": True, "2": True, "3": True, "4": True, "5": True, "6": False},
            "timezone": "America/Chicago",  # CST, same as Mexico City (confirmed API-valid)
        }]},
        "sequences": [{"steps": SEQUENCE_STEPS}],
        "email_list": SENDING_ACCOUNTS,
        "daily_limit": 60,
        "stop_on_reply": True,
        "stop_on_auto_reply": True,
        "open_tracking": True,
        "link_tracking": False,
        "allow_risky_contacts": False,
    }
    r = requests.post(f"{API}/campaigns", headers=HDR, json=payload, timeout=60)
    if r.status_code not in (200, 201):
        print(f"❌ HTTP {r.status_code}\n{r.text[:500]}")
        sys.exit(1)
    data = r.json()
    print(f"✅ Campaign created")
    print(f"   id:     {data.get('id')}")
    print(f"   name:   {data.get('name')}")
    print(f"   status: {data.get('status')}  (0=draft, 1=active, 2=paused)")
    steps = data.get("sequences", [{}])[0].get("steps", [])
    print(f"   steps:  {len(steps)}")
    return data

if __name__ == "__main__":
    out = create()
    with open("/sessions/exciting-charming-hamilton/mnt/jegodigital/audit_trojan_mx_v1.json", "w") as f:
        json.dump({"id": out.get("id"), "name": out.get("name"), "status": out.get("status")}, f, indent=2)
    print(f"   → saved to audit_trojan_mx_v1.json")
