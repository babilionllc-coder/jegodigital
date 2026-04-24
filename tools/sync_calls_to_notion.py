#!/usr/bin/env python3
"""
Sync ElevenLabs cold-call conversations to Notion with audio + transcript.

Pipeline per conversation:
  1. Fetch conversation metadata + transcript from ElevenLabs
  2. Download audio (audio/mpeg) → /Users/mac/Desktop/Websites/jegodigital/call-recordings/YYYY-MM-DD/{slug}_{conv_id}.mp3
  3. Upload MP3 to catbox.moe for a public Notion-embeddable URL
  4. Return a dict with all fields ready for Notion upsert

Usage:
  python3 tools/sync_calls_to_notion.py [--since 2026-04-23] [--conv conv_xxx,...]

Env vars needed:
  ELEVENLABS_API_KEY (from website/functions/.env)
"""
from __future__ import annotations
import os, sys, json, re, urllib.request, urllib.parse, subprocess
from pathlib import Path
from datetime import datetime, timezone, timedelta

# Use relative path so it works in both sandbox (/sessions/.../mnt/jegodigital/) and user's Mac (/Users/mac/Desktop/Websites/jegodigital/)
ROOT = Path(os.environ.get('JEGO_ROOT', '.')).resolve()
RECORDINGS = ROOT / 'call-recordings'

EL_BASE = 'https://api.elevenlabs.io/v1/convai'
CATBOX = 'https://catbox.moe/user/api.php'

AGENT_NAMES = {
    'agent_0701kq0drf5ceq6t5md9p6dt6xbb': 'A - SEO Pitch',
    'agent_4701kq0drd9pf9ebbqcv6b3bb2zw': 'B - Free Audit',
    'agent_2701kq0drbt9f738pxjem3zc3fnb': 'C - Trojan Free Setup',
    'agent_1101kq0dradtfhc8fzq96kp4hth7': 'D - Inbound Receptionist',
}


def slug(s: str, maxlen: int = 40) -> str:
    s = re.sub(r'[^a-zA-Z0-9]+', '-', s or '').strip('-').lower()
    return s[:maxlen] or 'unknown'


def el_get(path: str, api_key: str) -> dict:
    req = urllib.request.Request(f'{EL_BASE}{path}', headers={'xi-api-key': api_key})
    return json.loads(urllib.request.urlopen(req, timeout=20).read())


def el_audio_download(conv_id: str, api_key: str, out_path: Path) -> bool:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(f'{EL_BASE}/conversations/{conv_id}/audio',
                                 headers={'xi-api-key': api_key})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
            out_path.write_bytes(data)
            return len(data) > 1000
    except Exception as e:
        print(f'  audio download err: {e}', file=sys.stderr)
        return False


def catbox_upload(mp3_path: Path) -> str | None:
    """Returns public catbox.moe URL or None on failure."""
    try:
        result = subprocess.run(
            ['curl', '-s', '-F', 'reqtype=fileupload',
             '-F', f'fileToUpload=@{mp3_path}', CATBOX],
            capture_output=True, text=True, timeout=60
        )
        url = result.stdout.strip()
        return url if url.startswith('https://files.catbox.moe/') else None
    except Exception as e:
        print(f'  catbox upload err: {e}', file=sys.stderr)
        return None


def classify_outcome(transcript: list[dict], duration: int, summary: str) -> tuple[str, str]:
    """Return (call_status, call_outcome) based on evidence."""
    user_turns = [t for t in transcript if t.get('role') == 'user']
    user_text = ' '.join((t.get('message') or '') for t in user_turns).lower()
    summ = (summary or '').lower()

    # Check for tool calls
    tools_called = []
    for t in transcript:
        for tc in (t.get('tool_calls') or []):
            tools_called.append(tc.get('tool_name', ''))

    if 'submit_audit_request' in tools_called:
        return ('Done', 'Positive Reply')  # audit delivered — strongest signal
    if duration == 0:
        return ('No Answer', 'Pending')
    if 'buzón' in user_text or 'buzon' in user_text or 'mensaje después' in user_text or 'voicemail' in summ:
        return ('Voicemail', 'Voicemail Left' if len([t for t in transcript if t.get('role')=='agent' and len((t.get('message') or '').strip()) > 50]) > 0 else 'Voicemail Left')
    if any(k in user_text for k in ['marque', 'oprima', 'presion', 'permanece en línea', 'un asesor', 'ejecutivo se comunicará']):
        return ('Done', 'Wrong Number')  # IVR
    if any(k in user_text for k in ['no está', 'no se encuentra', 'no soy', 'el dueño no', 'en junta']):
        return ('Done', 'Gatekeeper')
    if duration <= 7:
        return ('Done', 'Short Hangup')
    if duration >= 30 and len(user_turns) >= 2:
        return ('Done', 'Real Conversation')
    return ('Done', 'Success')


def extract_transcript_text(transcript: list[dict]) -> str:
    lines = []
    for t in transcript:
        role = t.get('role', '?')
        msg = (t.get('message') or '').strip()
        tc = t.get('tool_calls') or []
        if tc:
            tc_names = [c.get('tool_name', '?') for c in tc]
            lines.append(f'[{role}] 🔧 {tc_names}')
        if msg:
            lines.append(f'[{role}] {msg[:300]}')
    return '\n'.join(lines)[:1900]  # Notion text field limit


def process_conversation(conv_id: str, api_key: str, skip_audio: bool = False) -> dict | None:
    """Returns a dict with all fields for Notion upsert."""
    try:
        full = el_get(f'/conversations/{conv_id}', api_key)
    except Exception as e:
        print(f'{conv_id}: fetch err: {e}', file=sys.stderr)
        return None

    meta = full.get('metadata', {}) or {}
    anal = full.get('analysis', {}) or {}
    phone_call = meta.get('phone_call', {}) or {}
    cid_data = meta.get('conversation_initiation_client_data', {}) or {}
    dyn = cid_data.get('dynamic_variables', {}) if isinstance(cid_data, dict) else {}
    transcript = full.get('transcript', []) or []

    # Extract core fields
    agent_id = full.get('agent_id', '')
    agent_label = AGENT_NAMES.get(agent_id, full.get('agent_name', 'unknown'))
    company = dyn.get('company_name', '') or '(unknown)'
    city = dyn.get('city', '')
    email = dyn.get('lead_email', '')
    website = dyn.get('website_url', '')
    lead_name = dyn.get('lead_name', '')
    phone = phone_call.get('external_number') or phone_call.get('to_number') or ''
    direction = phone_call.get('direction', 'outbound')
    duration = meta.get('call_duration_secs', 0)
    start_ts = full.get('start_time_unix_secs') or meta.get('start_time_unix_secs') or 0
    start_iso = datetime.fromtimestamp(start_ts, tz=timezone.utc).isoformat() if start_ts else ''
    summary = (anal.get('transcript_summary') or '')[:500]
    call_successful = anal.get('call_successful', 'unknown')

    # Audio
    audio_url = None
    if not skip_audio and duration > 0:
        date_str = datetime.fromtimestamp(start_ts).strftime('%Y-%m-%d') if start_ts else datetime.now().strftime('%Y-%m-%d')
        mp3_path = RECORDINGS / date_str / f'{slug(company)}_{conv_id}.mp3'
        if mp3_path.exists() and mp3_path.stat().st_size > 1000:
            print(f'  [audio] existing: {mp3_path.name}', file=sys.stderr)
        else:
            print(f'  [audio] downloading {conv_id}...', file=sys.stderr)
            if el_audio_download(conv_id, api_key, mp3_path):
                print(f'  [audio] saved: {mp3_path} ({mp3_path.stat().st_size} bytes)', file=sys.stderr)
        if mp3_path.exists() and mp3_path.stat().st_size > 1000:
            print(f'  [catbox] uploading...', file=sys.stderr)
            audio_url = catbox_upload(mp3_path)
            if audio_url:
                print(f'  [catbox] → {audio_url}', file=sys.stderr)

    # Classify outcome
    call_status, call_outcome = classify_outcome(transcript, duration, summary)

    # Build transcript text
    transcript_text = extract_transcript_text(transcript)

    # ElevenLabs dashboard direct link
    dashboard_url = f'https://elevenlabs.io/app/conversational-ai/history/{conv_id}' if agent_id else ''

    # Tools fired
    tools_fired = []
    for t in transcript:
        for tc in (t.get('tool_calls') or []):
            tools_fired.append(tc.get('tool_name', ''))
    audit_fired = 'submit_audit_request' in tools_fired

    return {
        'conv_id': conv_id,
        'agent_id': agent_id,
        'agent_label': agent_label,
        'company': company,
        'city': city,
        'email': email,
        'website': website,
        'lead_name': lead_name,
        'phone': phone,
        'direction': direction,
        'duration': duration,
        'start_iso': start_iso,
        'summary': summary,
        'call_successful': call_successful,
        'call_status': call_status,
        'call_outcome': call_outcome,
        'transcript': transcript_text,
        'audio_url': audio_url,
        'dashboard_url': dashboard_url,
        'tools_fired': tools_fired,
        'audit_delivered': audit_fired,
    }


def main():
    api_key = os.environ.get('ELEVENLABS_API_KEY')
    if not api_key:
        print('ERROR: ELEVENLABS_API_KEY missing. source website/functions/.env first.', file=sys.stderr)
        sys.exit(1)

    # Parse args
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--since', type=str, help='YYYY-MM-DD — pull conversations since this date')
    ap.add_argument('--conv', type=str, help='Comma-separated list of conv IDs to process')
    ap.add_argument('--skip-audio', action='store_true')
    ap.add_argument('--output', type=str, default='/tmp/calls_sync.json')
    args = ap.parse_args()

    conv_ids: list[str] = []
    if args.conv:
        conv_ids = [c.strip() for c in args.conv.split(',') if c.strip()]
    elif args.since:
        dt = datetime.strptime(args.since, '%Y-%m-%d').replace(tzinfo=timezone.utc)
        since_ts = int(dt.timestamp())
        listing = el_get(f'/conversations?call_start_after_unix={since_ts}&page_size=100', api_key)
        conv_ids = [c['conversation_id'] for c in listing.get('conversations', [])]
    else:
        # Default: today's calls
        now = datetime.now(timezone.utc)
        today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        listing = el_get(f'/conversations?call_start_after_unix={int(today_start.timestamp())}&page_size=100', api_key)
        conv_ids = [c['conversation_id'] for c in listing.get('conversations', [])]

    print(f'Processing {len(conv_ids)} conversations...', file=sys.stderr)

    results = []
    for i, cid in enumerate(conv_ids, 1):
        print(f'[{i}/{len(conv_ids)}] {cid}', file=sys.stderr)
        r = process_conversation(cid, api_key, skip_audio=args.skip_audio)
        if r:
            results.append(r)

    Path(args.output).write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(f'Saved: {args.output}', file=sys.stderr)
    # Summary
    audit_count = sum(1 for r in results if r['audit_delivered'])
    audio_count = sum(1 for r in results if r.get('audio_url'))
    print(f'\nSummary:', file=sys.stderr)
    print(f'  total:              {len(results)}', file=sys.stderr)
    print(f'  audit_delivered:    {audit_count}', file=sys.stderr)
    print(f'  audio uploaded:     {audio_count}', file=sys.stderr)


if __name__ == '__main__':
    main()
