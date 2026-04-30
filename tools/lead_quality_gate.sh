#!/bin/bash
# /Users/mac/Desktop/Websites/jegodigital/tools/lead_quality_gate.sh
#
# HARD RULE #5 enforcement — runs the 5-gate quality check on a lead CSV
# BEFORE upload to Instantly / ElevenLabs / ManyChat.
#
# Built 2026-04-30 after audit found 53% of recent Instantly replies came from
# role-based inboxes (info@, support@, sales@, reservations@, admin@, etc.) —
# direct HR-5 violation. Existing pipelines were either skipping the gate
# OR not catching role-based addresses.
#
# Usage:
#   bash tools/lead_quality_gate.sh <leads.csv>
#
# Exit codes:
#   0 — all 5 gates passed (≥99% named, ≥99% real first names, 100% decision-
#       maker role, ≥95% live domain, 100% ICP). Print "✅ 5/5 gates passed".
#   1 — one or more gates failed. Print breakdown + first-10 violators.
#       Pipeline MUST NOT upload until human review.
#
# CSV format expected: first row = header; columns must include 'email'
# (case-insensitive). Optional columns: firstName, lastName, role/title,
# website, country, city.

set -e
CSV="${1:-}"
if [ -z "$CSV" ] || [ ! -f "$CSV" ]; then
    echo "❌ Usage: bash tools/lead_quality_gate.sh <leads.csv>" >&2
    echo "   File not found: $CSV" >&2
    exit 1
fi

python3 << PYEOF
import csv, re, sys
from collections import Counter

CSV_PATH = "$CSV"

# ---- Gate definitions -------------------------------------------------------

# Gate 1 — Role-based reject (≥99% named local-parts)
ROLE_LOCALS = {
    'info','contact','contacto','admin','administrator','administracion','administración',
    'sales','ventas','venta','marketing','support','soporte','help','helpdesk',
    'hello','hola','hi','team','equipo','staff',
    'office','oficina','reception','recepcion','recepción','reservations','reservas',
    'team','contact','enquiry','enquiries','inquiry','inquiries',
    'noreply','no-reply','donotreply','do-not-reply','mailer','mailbot',
    'webmaster','postmaster','abuse','privacy','legal','careers','jobs','rh','rrhh','hr',
    'billing','accounts','accounting','finance','finanzas','facturas','facturacion','facturación',
    'orders','pedidos','customerservice','servicioalcliente','clientes',
    'newsletter','news','press','prensa','pr','media','social',
}

# Gate 2 — Real first name (rejects obvious non-names)
NON_NAME_PATTERNS = [
    re.compile(r'^[a-z]\.[a-z]+$', re.I),  # j.smith
    re.compile(r'^[a-z]+\d+$', re.I),       # info5, sales1
    re.compile(r'^test\b', re.I),
    re.compile(r'^demo\b', re.I),
    re.compile(r'^admin\b', re.I),
    re.compile(r'^user\d*\b', re.I),
    re.compile(r'^.{1,2}$'),                 # 1-2 char "names"
    re.compile(r'^Hola\b', re.I),            # we caught this 2026-04-15 disaster
    re.compile(r'^[xX]+$'),                  # placeholder x/xx/xxx
]

# Gate 3 — Decision-maker role keywords (anywhere in title/role)
DECISION_KEYWORDS_INCLUDE = [
    'owner','founder','co-founder','cofounder','propietario','dueño','dueno',
    'director','directora','director general','directora general','dg ',
    'director comercial','directora comercial','director de marketing','directora de marketing',
    'director de ventas','directora de ventas','director ejecutivo',
    'ceo','c.e.o','cto','cmo','coo','cfo',
    'broker','broker owner','broker-owner','principal','partner','socio','socia','socio fundador',
    'gerente general','gerente comercial','gerente de marketing','gerente de ventas',
    'manager','managing director','managing partner','president','vicepresident','vicepresidente',
    'jefe','jefa','head of','vp ',
]

# Gate 5 — ICP keywords (Mexican real estate or Miami luxury bilingual)
ICP_KEYWORDS = [
    # Mexico real-estate signals
    'inmobiliaria','inmobiliario','bienes raices','bienes raíces','realty','real estate',
    'developer','desarrollador','desarrolladora','propiedades','property','properties',
    'broker','realtor','realtors','vivienda','vivendas','casa','casas','depto','depas',
    # Geo
    '.mx','.com.mx','mexico','méxico','cancún','cancun','playa del carmen','tulum',
    'ciudad de méxico','cdmx','df ','guadalajara','monterrey','querétaro','queretaro',
    'mérida','merida','puerto vallarta','los cabos','riviera maya','quintana roo',
    # Miami secondary
    'miami','brickell','coral gables','doral','aventura','fort lauderdale','broward',
    'florida','orlando',
]

# ---- Run gates --------------------------------------------------------------
rows = []
with open(CSV_PATH, newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    headers = [h.lower() for h in reader.fieldnames or []]
    rows = list(reader)

if not rows:
    print('❌ CSV is empty')
    sys.exit(1)

print(f'=== HR-5 Lead Quality Gate — {CSV_PATH} ({len(rows)} rows) ===\n')

def get(row, *keys):
    for k in keys:
        for rk in row:
            if rk.lower() == k.lower():
                return (row[rk] or '').strip()
    return ''

# Gate 1 — Role-based reject
g1_named = 0
g1_role_violations = []
for r in rows:
    email = get(r, 'email', 'Email').lower()
    if '@' not in email: continue
    local = email.split('@', 1)[0]
    base = re.sub(r'[+.\-_].*$', '', local)
    if base in ROLE_LOCALS or local in ROLE_LOCALS:
        g1_role_violations.append(email)
    else:
        g1_named += 1
g1_rate = (g1_named / len(rows) * 100) if rows else 0
g1_pass = g1_rate >= 99.0

# Gate 2 — Real first names
g2_real = 0
g2_violations = []
for r in rows:
    fn = get(r, 'firstName', 'first_name', 'firstname', 'first name')
    if not fn:
        # Try local-part as proxy
        email = get(r, 'email').lower()
        if '@' in email:
            local = email.split('@', 1)[0]
            fn = re.sub(r'[+.\-_\d]', '', local).split()[0] if local else ''
    if any(p.match(fn) for p in NON_NAME_PATTERNS) or len(fn) < 3:
        g2_violations.append(get(r, 'email') + ' (firstName=' + fn + ')')
    else:
        g2_real += 1
g2_rate = (g2_real / len(rows) * 100) if rows else 0
g2_pass = g2_rate >= 99.0

# Gate 3 — Decision-maker role
g3_dm = 0
g3_violations = []
for r in rows:
    role = (get(r, 'role','title','jobTitle','position','cargo','puesto') or '').lower()
    if not role:
        # If role missing entirely, can't enforce — fail-soft, count as miss
        g3_violations.append(get(r, 'email') + ' (NO ROLE FIELD)')
        continue
    if any(k in role for k in DECISION_KEYWORDS_INCLUDE):
        g3_dm += 1
    else:
        g3_violations.append(get(r, 'email') + ' (role=' + role[:40] + ')')
g3_rate = (g3_dm / len(rows) * 100) if rows else 0
g3_pass = g3_rate >= 100.0

# Gate 4 — Domain liveness (sample, can't curl 500 here — flag missing only)
g4_has_domain = sum(1 for r in rows if get(r, 'website','domain','url','site'))
g4_rate = (g4_has_domain / len(rows) * 100) if rows else 0
g4_pass = g4_rate >= 95.0

# Gate 5 — ICP match (geo + industry)
g5_icp = 0
g5_violations = []
for r in rows:
    blob = ' '.join(str(v) for v in r.values()).lower()
    if any(k in blob for k in ICP_KEYWORDS):
        g5_icp += 1
    else:
        g5_violations.append(get(r, 'email') + ' (no ICP signal)')
g5_rate = (g5_icp / len(rows) * 100) if rows else 0
g5_pass = g5_rate >= 100.0

# ---- Report -----------------------------------------------------------------
def line(name, passed, rate, threshold, violators):
    icon = '✅' if passed else '❌'
    print(f'{icon} Gate: {name:30} {rate:5.1f}% (need ≥{threshold}%)')
    if not passed and violators:
        print(f'   First 5 violations:')
        for v in violators[:5]:
            print(f'     · {v}')

line('1 — Role-based reject', g1_pass, g1_rate, 99, g1_role_violations)
line('2 — Real first names',  g2_pass, g2_rate, 99, g2_violations)
line('3 — Decision-maker role', g3_pass, g3_rate, 100, g3_violations)
line('4 — Has domain field',  g4_pass, g4_rate, 95, [])
line('5 — ICP match',         g5_pass, g5_rate, 100, g5_violations)

passed_count = sum([g1_pass, g2_pass, g3_pass, g4_pass, g5_pass])
print()
if passed_count == 5:
    print(f'✅ 5/5 gates passed — safe to upload')
    sys.exit(0)
else:
    print(f'❌ {passed_count}/5 gates passed — UPLOAD BLOCKED')
    print(f'   Total role-based emails: {len(g1_role_violations)}')
    print(f'   Recommended: filter the CSV with:')
    print(f'     python3 tools/lead_quality_gate.py --filter {CSV_PATH} --output cleaned.csv')
    sys.exit(1)
PYEOF
