import csv
import subprocess
import concurrent.futures
import re

INPUT_FILE = "b2b_leads_tulum_realestate.csv"
OUTPUT_FILE = "b2b_leads_verified_clean.csv"

def get_domain(email):
    try:
        return email.split('@')[1].strip()
    except:
        return None

def check_mx_record(domain):
    """
    Checks if a domain has valid MX records using system nslookup.
    Returns True if valid, False otherwise.
    """
    if not domain:
        return False
        
    try:
        # Run nslookup -type=MX domain.com
        # Timeout after 5 seconds to avoid hanging
        result = subprocess.run(
            ["nslookup", "-type=MX", domain],
            capture_output=True,
            text=True,
            timeout=5
        )
        output = result.stdout
        
        # Check for successful answer
        if "mail exchanger" in output.lower() and "NXDOMAIN" not in output:
            return True
        return False
    except Exception as e:
        return False

def verify_lead(row):
    """
    Verifies a row of lead data.
    Returns (params, is_valid, reason)
    """
    raw_emails = row.get('emails', '')
    if not raw_emails:
        return row, False, "No Email"
        
    # Split multiple emails
    email_list = [e.strip() for e in raw_emails.split(',')]
    valid_emails = []
    
    for email in email_list:
        start_time = 0
        domain = get_domain(email)
        
        # 1. Syntax Check (Basic)
        if not domain or '.' not in domain:
            continue
            
        # 2. MX Record Check (The Anti-Bounce Shield)
        has_mx = check_mx_record(domain)
        
        if has_mx:
            valid_emails.append(email)
            
    if valid_emails:
        # Update row with only valid emails
        row['emails'] = ", ".join(valid_emails)
        return row, True, "OK"
    else:
        return row, False, "Invalid Domain (No MX)"

def main():
    print(f"🛡️  Starting Lead Verification on {INPUT_FILE}...")
    
    leads = []
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        leads = list(reader)
        
    print(f"📋 Loaded {len(leads)} raw leads. Checking MX records...")
    
    valid_leads = []
    invalid_count = 0
    
    # Run verification in parallel
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        results = executor.map(verify_lead, leads)
        
        for row, is_valid, reason in results:
            if is_valid:
                valid_leads.append(row)
                print(f"✅ Valid: {row['domain']}")
            else:
                invalid_count += 1
                print(f"❌ Invalid: {row['domain']} ({reason})")

    # Save Safe List
    fieldnames = ["title", "url", "domain", "emails", "phones"]
    with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(valid_leads)
        
    print(f"\n🎯 VERIFICATION COMPLETE")
    print(f"--------------------------------")
    print(f"Input:    {len(leads)} leads")
    print(f"Valid:    {len(valid_leads)} leads (Safe to Send)")
    print(f"Removed:  {invalid_count} leads (High Bounce Risk)")
    print(f"Saved to: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
