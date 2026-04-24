#!/usr/bin/env python3
"""
JegoClay Module 1 — email_verifier.py
Self-hosted email verification. Replaces NeverBounce / MillionVerifier.

Pipeline per email:
  0. Syntax check (regex)
  1. Disposable-domain blocklist check (10minutemail, mailinator, etc.)
  2. Role-based prefix check (info@, ventas@, sales@) — flag but don't reject here
     (HR-5 gate handles rejection; verifier just flags)
  3. DNS MX lookup — does the domain even have mail servers?
  4. SMTP handshake — RCPT TO check (does the inbox actually exist?)

Returns:
  { ok: bool, confidence: "high"|"medium"|"low"|"invalid",
    reason: str, mx_hosts: [str], smtp_accepts: bool|None,
    is_disposable: bool, is_role: bool }

Accuracy target: ~95% of NeverBounce with $0 cost.
Caveat: some mail servers block verification attempts from random IPs
  (greylisting). For those, `confidence="medium"` with `smtp_accepts=None`
  means "syntactically valid + MX exists but can't confirm inbox".

Usage:
  from jegoclay.email_verifier import verify_email
  result = verify_email("alex@jegodigital.com")
"""
import re
import socket
import smtplib
import logging
from typing import Optional

# Configure minimal logging to avoid noise in the pipeline
logging.getLogger("smtplib").setLevel(logging.ERROR)

# ---------- Config ----------
SMTP_TIMEOUT = 8  # seconds — keep short; some servers are slow
HELO_NAME    = "jegodigital.com"
MAIL_FROM    = "verify@jegodigital.com"

# Email syntax (RFC 5322 simplified — matches 99% of real-world emails)
EMAIL_RE = re.compile(
    r"^[a-zA-Z0-9._%+\-]+@([a-zA-Z0-9.\-]+\.[a-zA-Z]{2,24})$"
)

# Role-based prefixes — not "invalid" but flagged so outreach can route differently
# (these are for shared inboxes, not decision-makers)
ROLE_PREFIXES = {
    "info", "contact", "contacto", "admin", "hello", "hola", "ventas",
    "sales", "support", "soporte", "marketing", "team", "equipo",
    "noreply", "no-reply", "webmaster", "postmaster", "recepcion",
    "recepción", "office", "oficina", "hr", "rh", "rrhh", "recursos",
    "finance", "finanzas", "accounting", "contabilidad", "billing",
    "legal", "juridico", "jurídico", "abuse", "security", "help",
    "ayuda", "atencion", "atención", "servicio", "customer",
}

# Disposable email domains (top offenders — full list loaded from file if exists)
DISPOSABLE_DOMAINS_FALLBACK = {
    "10minutemail.com", "mailinator.com", "guerrillamail.com", "tempmail.com",
    "throwaway.email", "trashmail.com", "yopmail.com", "maildrop.cc",
    "getnada.com", "sharklasers.com", "mohmal.com", "fakeinbox.com",
    "dispostable.com", "mytemp.email", "tempmailo.com", "temp-mail.org",
    "email-temp.com", "tmail.ws", "tmailer.net", "0-mail.com",
    "temp-mail.io", "mail-temp.com", "moakt.com", "generator.email",
    "inboxkitten.com", "getairmail.com",
}

def load_disposable_domains(filepath: Optional[str] = None) -> set:
    """Load disposable domains from file if provided, else use fallback."""
    if filepath:
        try:
            with open(filepath) as f:
                return {line.strip().lower() for line in f if line.strip() and not line.startswith("#")}
        except FileNotFoundError:
            pass
    return DISPOSABLE_DOMAINS_FALLBACK

DISPOSABLE_DOMAINS = load_disposable_domains()

# ---------- Core checks ----------

def check_syntax(email: str) -> tuple[bool, Optional[str]]:
    """Returns (is_valid, domain_or_None)."""
    if not email or not isinstance(email, str):
        return False, None
    email = email.strip().lower()
    m = EMAIL_RE.match(email)
    if not m:
        return False, None
    return True, m.group(1)

def is_role_based(email: str) -> bool:
    """Returns True if email is role-based (info@, ventas@, etc.)"""
    if "@" not in email:
        return False
    prefix = email.split("@")[0].lower()
    # Strip trailing digits/dots (e.g., info2@, info.sales@)
    base = re.sub(r"[\d\.\-_]+$", "", prefix)
    return base in ROLE_PREFIXES or prefix in ROLE_PREFIXES

def is_disposable_domain(domain: str) -> bool:
    """Returns True if domain is a known disposable email provider."""
    return domain.lower() in DISPOSABLE_DOMAINS

def lookup_mx(domain: str) -> list:
    """Returns sorted list of MX hostnames for the domain. Empty list = no mail server."""
    try:
        import dns.resolver
        answers = dns.resolver.resolve(domain, "MX", lifetime=5)
        # Sort by priority (lower = higher priority)
        mx_records = sorted(
            [(int(a.preference), str(a.exchange).rstrip(".")) for a in answers],
            key=lambda x: x[0]
        )
        return [host for (_, host) in mx_records]
    except ImportError:
        # dnspython not installed — fallback to socket MX via gethostbyname_ex of the domain itself
        # This is a weak fallback — just checks if domain resolves, not actual MX
        try:
            socket.gethostbyname(domain)
            return [domain]  # treat domain itself as "probably has mail"
        except Exception:
            return []
    except Exception:
        return []

def smtp_verify_inbox(email: str, mx_hosts: list, timeout: int = SMTP_TIMEOUT) -> tuple[Optional[bool], str]:
    """
    SMTP handshake to verify inbox existence.
    Returns (accepts, reason):
      True  = RCPT TO accepted (inbox exists)
      False = RCPT TO rejected (inbox doesn't exist)
      None  = inconclusive (server blocked us, timeout, greylist, catch-all suspected)
    """
    if not mx_hosts:
        return False, "no_mx_hosts"

    # Try up to first 3 MX hosts (primary + backups)
    for mx in mx_hosts[:3]:
        try:
            with smtplib.SMTP(mx, 25, timeout=timeout) as server:
                server.helo(HELO_NAME)
                # Some servers require EHLO first
                try:
                    server.ehlo(HELO_NAME)
                except smtplib.SMTPHeloError:
                    pass
                server.mail(MAIL_FROM)
                code, msg = server.rcpt(email)
                msg_str = msg.decode() if isinstance(msg, bytes) else str(msg)

                # 250 = accepted, 251 = user not local but forwarded
                if code in (250, 251):
                    return True, f"rcpt_accepted:{code}"
                # 550 = user doesn't exist, 551 = not local
                if code in (550, 551, 553):
                    return False, f"rcpt_rejected:{code}:{msg_str[:80]}"
                # 450/451/452 = temporary reject (greylisting)
                if code in (450, 451, 452):
                    return None, f"greylisted:{code}"
                # Any other = inconclusive
                return None, f"inconclusive:{code}:{msg_str[:80]}"
        except smtplib.SMTPServerDisconnected:
            continue  # try next MX
        except smtplib.SMTPConnectError:
            continue
        except socket.timeout:
            continue
        except socket.gaierror:
            continue
        except ConnectionRefusedError:
            continue
        except OSError as e:
            # Often blocked by ISP (port 25 outbound blocked) or firewall
            return None, f"connection_blocked:{str(e)[:60]}"
        except Exception as e:
            return None, f"smtp_error:{type(e).__name__}:{str(e)[:60]}"

    return None, "all_mx_unreachable"

# ---------- Main verify function ----------

def verify_email(email: str, skip_smtp: bool = False) -> dict:
    """
    Verify an email address end-to-end.

    Args:
      email: email address to verify
      skip_smtp: if True, skip the SMTP handshake (faster, lower accuracy)

    Returns:
      dict with keys: ok, confidence, reason, domain, mx_hosts, smtp_accepts,
                      is_disposable, is_role, email_normalized
    """
    result = {
        "email_normalized": (email or "").strip().lower(),
        "ok": False,
        "confidence": "invalid",
        "reason": "",
        "domain": None,
        "mx_hosts": [],
        "smtp_accepts": None,
        "is_disposable": False,
        "is_role": False,
    }

    # Step 1 — syntax
    valid, domain = check_syntax(result["email_normalized"])
    if not valid:
        result["reason"] = "syntax_invalid"
        return result
    result["domain"] = domain

    # Step 2 — role-based check (flag only)
    result["is_role"] = is_role_based(result["email_normalized"])

    # Step 3 — disposable domain check (hard reject)
    if is_disposable_domain(domain):
        result["is_disposable"] = True
        result["reason"] = "disposable_domain"
        return result

    # Step 4 — MX lookup
    mx_hosts = lookup_mx(domain)
    result["mx_hosts"] = mx_hosts
    if not mx_hosts:
        result["reason"] = "no_mx_record"
        return result

    # Step 5 — SMTP verification (optional — can be slow or blocked)
    if skip_smtp:
        result["ok"] = True
        result["confidence"] = "medium"
        result["reason"] = "syntax_and_mx_ok_smtp_skipped"
        return result

    accepts, smtp_reason = smtp_verify_inbox(result["email_normalized"], mx_hosts)
    result["smtp_accepts"] = accepts
    result["reason"] = smtp_reason

    if accepts is True:
        result["ok"] = True
        result["confidence"] = "high"
    elif accepts is False:
        result["ok"] = False
        result["confidence"] = "invalid"
    else:
        # Inconclusive — greylisted, blocked, catch-all
        result["ok"] = True  # treat as probably-valid since MX exists
        result["confidence"] = "medium"

    return result

# ---------- CLI ----------
if __name__ == "__main__":
    import sys, json
    if len(sys.argv) < 2:
        print("Usage: python3 email_verifier.py <email> [email2] ...")
        print("       python3 email_verifier.py --skip-smtp <email>")
        sys.exit(1)

    skip_smtp = False
    args = sys.argv[1:]
    if args[0] == "--skip-smtp":
        skip_smtp = True
        args = args[1:]

    for email in args:
        r = verify_email(email, skip_smtp=skip_smtp)
        print(json.dumps(r, indent=2))
        print()
