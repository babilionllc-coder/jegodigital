#!/usr/bin/env python3
"""
Queue manager for daily lead top-up.

Operates on two files:
  leads/queue/pending.csv   — leads waiting to be processed
  leads/queue/consumed.csv  — leads already pushed to Instantly

Commands:
  python3 queue_manager.py take N output.csv
    → pull top N rows from pending.csv into output.csv
  python3 queue_manager.py mark-consumed output.csv
    → move those N rows from pending.csv to consumed.csv
  python3 queue_manager.py status
    → show queue depth + recent activity
  python3 queue_manager.py enqueue source.csv
    → append source.csv rows to pending.csv (dedupe by prospect_linkedin)
"""
import csv, os, sys

PENDING  = "leads/queue/pending.csv"
CONSUMED = "leads/queue/consumed.csv"

def ensure_files():
    os.makedirs("leads/queue", exist_ok=True)
    for f in (PENDING, CONSUMED):
        if not os.path.exists(f):
            open(f, "w").close()

def read_rows(path):
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        return [], []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        rows = list(reader)
        if not rows: return [], []
        return rows[0], rows[1:]

def write_rows(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if header: w.writerow(header)
        w.writerows(rows)

def cmd_status():
    ensure_files()
    p_hdr, p_rows = read_rows(PENDING)
    c_hdr, c_rows = read_rows(CONSUMED)
    print(f"Pending:  {len(p_rows)} leads")
    print(f"Consumed: {len(c_rows)} leads")
    print(f"Queue depth (days @ 200/day): {len(p_rows) // 200}")

def cmd_take(n, output):
    ensure_files()
    hdr, rows = read_rows(PENDING)
    if not rows:
        print(f"ERROR: pending queue is empty"); sys.exit(1)
    n = min(n, len(rows))
    taken = rows[:n]
    write_rows(output, hdr, taken)
    print(f"Wrote {n} leads → {output}")

def cmd_mark_consumed(output_that_was_processed):
    """After successful processing, move the first N rows from pending to consumed."""
    ensure_files()
    _, taken_rows = read_rows(output_that_was_processed)
    n = len(taken_rows)
    if n == 0:
        print("Nothing to mark consumed"); return

    p_hdr, p_rows = read_rows(PENDING)
    c_hdr, c_rows = read_rows(CONSUMED)
    # Move first n rows from pending to consumed
    moved = p_rows[:n]
    remaining = p_rows[n:]
    write_rows(PENDING, p_hdr, remaining)
    # Header for consumed = pending header (assumed same)
    write_rows(CONSUMED, p_hdr, c_rows + moved)
    print(f"Moved {n} rows pending → consumed")
    print(f"  New pending depth: {len(remaining)}")
    print(f"  New consumed total: {len(c_rows) + n}")

def cmd_enqueue(source_csv):
    """Append source CSV to pending, deduping by prospect_linkedin (falls back to email + company)."""
    ensure_files()
    src_hdr, src_rows = read_rows(source_csv)
    if not src_rows:
        print("Source empty"); return
    p_hdr, p_rows = read_rows(PENDING)
    c_hdr, c_rows = read_rows(CONSUMED)
    # Combine pending + consumed headers — use source header if pending empty
    if not p_hdr: p_hdr = src_hdr
    # Build dedupe key set — prefer prospect_linkedin, fallback to email/company
    def key_of(row, hdr):
        idx = {h:i for i,h in enumerate(hdr)}
        li = idx.get("prospect_linkedin", -1)
        em = idx.get("prospect_company_website", -1)
        co = idx.get("prospect_company_name", -1)
        fn = idx.get("prospect_full_name", -1)
        if li >= 0 and li < len(row) and row[li]: return row[li].lower()
        parts = []
        if fn >= 0 and fn < len(row): parts.append(row[fn].lower())
        if co >= 0 and co < len(row): parts.append(row[co].lower())
        return "|".join(parts)
    existing = {key_of(r, p_hdr) for r in p_rows + c_rows}
    added = 0
    for r in src_rows:
        # map source row onto pending header order
        src_idx = {h:i for i,h in enumerate(src_hdr)}
        mapped = [r[src_idx[h]] if h in src_idx and src_idx[h] < len(r) else "" for h in p_hdr]
        k = key_of(mapped, p_hdr)
        if k in existing: continue
        p_rows.append(mapped)
        existing.add(k)
        added += 1
    write_rows(PENDING, p_hdr, p_rows)
    print(f"Enqueued {added} new leads ({len(src_rows)-added} dedup-skipped). Pending depth: {len(p_rows)}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    cmd = sys.argv[1]
    if cmd == "status":
        cmd_status()
    elif cmd == "take":
        if len(sys.argv) < 4: print("take N output.csv"); sys.exit(1)
        cmd_take(int(sys.argv[2]), sys.argv[3])
    elif cmd == "mark-consumed":
        if len(sys.argv) < 3: print("mark-consumed processed.csv"); sys.exit(1)
        cmd_mark_consumed(sys.argv[2])
    elif cmd == "enqueue":
        if len(sys.argv) < 3: print("enqueue source.csv"); sys.exit(1)
        cmd_enqueue(sys.argv[2])
    else:
        print(f"Unknown command: {cmd}"); sys.exit(1)
