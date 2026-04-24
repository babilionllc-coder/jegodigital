"""
offer_b_audit_tool_wiring.py
=============================
Fixes Offer B agent (Sofia — Free Audit) so the audit promise is actually
fulfilled. Before this script: agent promises "audit in 60 min" but has no
tool to fire submitAuditRequest — every confirmed lead was a broken promise.

What this script does:
1. Creates a new webhook tool `submit_audit_request` that POSTs to the
   deployed Cloud Function submitAuditRequest with website_url + name +
   email + city.
2. Attaches the new tool to Offer B agent (tool_ids + inline tools).
3. Adds `website_url` as a dynamic_variable_placeholder (so the caller
   script can pass the lead's site URL).
4. Rewrites Offer B's system prompt to REQUIRE the tool call at the
   cierre step, BEFORE saying goodbye. If the tool call fails, Sofia
   apologizes and promises Alex will follow up manually.

Run: python3 offer_b_audit_tool_wiring.py
Safe to re-run — updates in place.
"""
import os, sys, json, requests, time

ELEVEN_KEY = os.environ.get(
    "ELEVENLABS_API_KEY",
    "sk_b9293d3a3860e09a003d337243506863bf7cf579095e5c9e",
)
AGENT_ID = "agent_4701kq0drd9pf9ebbqcv6b3bb2zw"  # Offer B — Free Audit
CLOUD_FN = "https://us-central1-jegodigital-e02fb.cloudfunctions.net/submitAuditRequest"

HEADERS = {"xi-api-key": ELEVEN_KEY, "Content-Type": "application/json"}


# ---------- 1. Tool definition --------------------------------------------
SUBMIT_AUDIT_TOOL = {
    "tool_config": {
        "type": "webhook",
        "name": "submit_audit_request",
        "description": (
            "Llama este tool EN EL CIERRE de la llamada, ANTES de despedirte, "
            "cuando el prospecto haya confirmado su email. Crea la solicitud de "
            "auditoría en Firestore y dispara el pipeline que enviará el reporte "
            "a su correo en los próximos 60 minutos. Si el tool responde con "
            "error, discúlpate y dile que Alex le escribirá personalmente. "
            "NUNCA termines la llamada sin llamar este tool si el lead aceptó."
        ),
        "response_timeout_secs": 20,
        "disable_interruptions": False,
        "force_pre_tool_speech": False,
        "assignments": [],
        "tool_call_sound": None,
        "tool_call_sound_behavior": "auto",
        "tool_error_handling_mode": "auto",
        "dynamic_variables": {"dynamic_variable_placeholders": {}},
        "execution_mode": "immediate",
        "api_schema": {
            "request_headers": {},
            "url": CLOUD_FN,
            "method": "POST",
            "path_params_schema": {},
            "query_params_schema": None,
            "request_body_schema": {
                "type": "object",
                "required": ["website_url", "name", "email"],
                "description": "Datos para generar auditoría gratuita",
                "properties": {
                    "website_url": {
                        "type": "string",
                        "description": (
                            "URL del sitio web de la inmobiliaria. Usa {{website_url}} "
                            "a menos que el lead haya dado una URL diferente. "
                            "Formato https://... OBLIGATORIO."
                        ),
                        "enum": None,
                        "is_system_provided": False,
                        "dynamic_variable": "",
                        "constant_value": "",
                    },
                    "name": {
                        "type": "string",
                        "description": (
                            "Nombre completo del prospecto. Usa {{lead_name}} a menos "
                            "que el lead haya dado un nombre diferente. OBLIGATORIO."
                        ),
                        "enum": None,
                        "is_system_provided": False,
                        "dynamic_variable": "",
                        "constant_value": "",
                    },
                    "email": {
                        "type": "string",
                        "description": (
                            "Correo confirmado por el lead. Usa {{lead_email}} si lo "
                            "confirmaron, o el nuevo email si dieron uno diferente. "
                            "OBLIGATORIO."
                        ),
                        "enum": None,
                        "is_system_provided": False,
                        "dynamic_variable": "",
                        "constant_value": "",
                    },
                    "city": {
                        "type": "string",
                        "description": (
                            "Ciudad del lead. Usa {{city}} a menos que el lead haya "
                            "mencionado otra ciudad durante la llamada."
                        ),
                        "enum": None,
                        "is_system_provided": False,
                        "dynamic_variable": "",
                        "constant_value": "",
                    },
                },
            },
            "auth_connection": None,
            "request_body": None,
        },
    }
}


# ---------- 2. Updated system prompt --------------------------------------
# Adds website_url to dynamic context, requires tool call before goodbye.
NEW_PROMPT = """Eres Sofia, una asesora de marketing digital de JegoDigital que llama a agencias inmobiliarias en México para ofrecerles una auditoría GRATUITA de su negocio.

## TU MISIÓN
Llamar a {{lead_name}} de {{company_name}} en {{city}} y ofrecerle una auditoría gratuita personalizada de {{website_url}}. NO necesitas recopilar información — ya tienes su nombre, empresa, ciudad, sitio web y email ({{lead_email}}).

## FLUJO DE LA LLAMADA

### 1. APERTURA (máximo 15 segundos)
"Hola, ¿hablo con {{lead_name}}?"
- Si confirman: "Qué tal {{lead_name}}, soy Sofia de JegoDigital. Te llamo porque estuvimos analizando la presencia digital de inmobiliarias en {{city}} y revisamos {{company_name}}. Encontramos algunas cosas interesantes y me gustaría ofrecerte algo. ¿Tienes un minuto?"
- Si preguntan quién eres: "Soy Sofia de JegoDigital, una agencia de marketing digital especializada en inmobiliarias. Te llamo para ofrecerte algo completamente gratis para {{company_name}}."

### 2. PITCH DE LA AUDITORÍA (máximo 30 segundos)
"Mira, lo que hacemos es un análisis completo de {{company_name}} en 7 áreas clave: cómo apareces en Google cuando alguien busca inmobiliarias en {{city}}, si sales en Google Maps, qué pasa cuando buscan tu agencia en ChatGPT o inteligencia artificial, tu sitio web, tus redes sociales, qué tan rápido responden a leads nuevos, y cómo te comparas contra tu competencia directa en {{city}}. Todo esto te lo entregamos en un reporte con calificación del 0 al 100, completamente gratis, directo a tu email en menos de 60 minutos."

### 3. CIERRE (CRÍTICO — lee con atención)
"¿Te interesa recibirla? Solo necesito confirmar que tu email es correcto."
- Si dicen sí: "Perfecto. Tengo tu email como {{lead_email}}, ¿es correcto?"
  - **Cuando el lead confirme el email (o dé uno nuevo), LLAMA INMEDIATAMENTE el tool `submit_audit_request` con el website_url, nombre, email y ciudad.** NO te despidas antes de llamar el tool — si te despides sin llamarlo, el lead NUNCA recibirá la auditoría y será una promesa rota.
  - Después del tool call exitoso: "Excelente, en menos de 60 minutos vas a recibir tu auditoría completa de {{company_name}}. Te va a sorprender lo que encontramos sobre cómo estás posicionado en {{city}}. ¡Que tengas excelente día!"
  - Si el tool falla: "Una disculpa, parece que tuve un problema del lado técnico. Alex te va a escribir personalmente en las próximas horas con tu auditoría. Disculpa la molestia y excelente día."
- Si dudan: "Entiendo. Solo para que sepas, no tiene ningún costo ni compromiso. Es un análisis personalizado de {{company_name}} que normalmente cobramos pero lo estamos ofreciendo gratis esta semana para inmobiliarias en {{city}}. ¿Seguro que no te interesa ver cómo estás frente a tu competencia?"

### 4. OBJECIONES
- "¿Qué es JegoDigital?": "Somos una agencia de marketing digital especializada en inmobiliarias. Trabajamos con agencias como Flamingo Real Estate en Cancún, que logró ser número uno en Google Maps y triplicó su tráfico."
- "¿Por qué es gratis?": "Es nuestra forma de presentarnos. Queremos que veas con datos reales de {{company_name}} el valor de lo que hacemos, sin compromiso."
- "No tengo tiempo": "Lo entiendo. Solo toma un minuto ahora — nosotros hacemos todo el trabajo y te lo mandamos al email. ¿Te parece?"
- "¿Cuánto cuestan sus servicios?": "La auditoría es gratuita. Si después quieres platicar sobre cómo mejorar los resultados, agendamos una llamada con Alex. Pero primero lo primero — ¿te mando la auditoría de {{company_name}}?"

## REGLAS ESTRICTAS
1. NUNCA menciones precios
2. NUNCA digas que eres IA o bot
3. Máximo 2-3 oraciones por turno
4. Si se enojan, discúlpate y termina
5. Tono: cálido, profesional, entusiasta
6. SIEMPRE confirma el email antes de llamar el tool submit_audit_request
7. SIEMPRE llama submit_audit_request antes de despedirte cuando el lead aceptó — NO llamar el tool = promesa rota
8. Si detectas buzón de voz, cuelga inmediatamente
9. SIEMPRE menciona {{company_name}} y {{city}} para personalizar
10. NO intentes vender — solo ofrece la auditoría gratuita"""


# ---------- 3. API helpers -------------------------------------------------
def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}")


def get_agent():
    r = requests.get(
        f"https://api.elevenlabs.io/v1/convai/agents/{AGENT_ID}", headers=HEADERS,
    )
    r.raise_for_status()
    return r.json()


def list_tools():
    r = requests.get("https://api.elevenlabs.io/v1/convai/tools", headers=HEADERS)
    r.raise_for_status()
    return r.json().get("tools", [])


def create_tool(tool_cfg):
    r = requests.post(
        "https://api.elevenlabs.io/v1/convai/tools",
        headers=HEADERS,
        json=tool_cfg,
    )
    if r.status_code >= 400:
        log(f"Tool create failed HTTP {r.status_code}: {r.text[:500]}")
        r.raise_for_status()
    return r.json()


def patch_agent(new_prompt, tool_ids, dyn_vars):
    # Fetch current, strip id from each inline tool (required per memory gotcha)
    agent = get_agent()
    cfg = agent["conversation_config"]
    prompt_block = cfg["agent"]["prompt"]
    # Strip tool IDs from inline tools AND remove tool_ids to avoid "both" error
    inline_tools = prompt_block.get("tools", [])
    for t in inline_tools:
        t.pop("id", None)

    payload = {
        "conversation_config": {
            "agent": {
                "dynamic_variables": {"dynamic_variable_placeholders": dyn_vars},
                "prompt": {
                    **{k: v for k, v in prompt_block.items() if k != "tools"},
                    "prompt": new_prompt,
                    "tool_ids": tool_ids,
                    # explicitly empty inline tools so we don't collide
                    "tools": [],
                },
            }
        }
    }

    r = requests.patch(
        f"https://api.elevenlabs.io/v1/convai/agents/{AGENT_ID}",
        headers=HEADERS,
        json=payload,
    )
    if r.status_code >= 400:
        log(f"Agent PATCH failed HTTP {r.status_code}: {r.text[:800]}")
        r.raise_for_status()
    return r.json()


# ---------- 4. Main --------------------------------------------------------
def main():
    log("Loading current Offer B agent...")
    agent = get_agent()
    cur_prompt_block = agent["conversation_config"]["agent"]["prompt"]
    cur_tool_ids = list(cur_prompt_block.get("tool_ids", []))
    log(f"Current tool_ids: {cur_tool_ids}")

    # Check if submit_audit_request already exists
    existing = [t for t in list_tools() if t.get("tool_config", {}).get("name") == "submit_audit_request"]
    if existing:
        tool_id = existing[0]["id"]
        log(f"Re-using existing submit_audit_request tool: {tool_id}")
    else:
        log("Creating new submit_audit_request tool...")
        created = create_tool(SUBMIT_AUDIT_TOOL)
        tool_id = created["id"]
        log(f"Created tool: {tool_id}")

    # Attach
    new_tool_ids = cur_tool_ids + ([tool_id] if tool_id not in cur_tool_ids else [])

    # Dynamic var placeholders: add website_url; keep existing
    cur_dyn = (
        agent["conversation_config"]["agent"]
        .get("dynamic_variables", {})
        .get("dynamic_variable_placeholders", {})
    )
    new_dyn = {**cur_dyn, "website_url": "https://example.com"}

    log("Patching Offer B agent (new prompt + tool + website_url var)...")
    patch_agent(NEW_PROMPT, new_tool_ids, new_dyn)
    log("DONE — Offer B wired to fire audits on lead confirmation")
    log(f"Next: update outbound-call trigger to pass website_url dynamic var")


if __name__ == "__main__":
    main()
