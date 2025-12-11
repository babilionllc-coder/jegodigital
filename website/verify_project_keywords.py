import requests
import json

# System Key (Project API) - Verified Working
SYSTEM_API_KEY = "5952409e4b0769e3a1cad5b0d26e976de79e70b8"
SITE_ID = 11026910 # From previous execution for JEGODIGITAL.COM
URL = f"https://api4.seranking.com/sites/{SITE_ID}/keywords"

headers = {
    "Authorization": f"Token {SYSTEM_API_KEY}",
    "Content-Type": "application/json"
}

print(f"Fetching keywords for Site ID: {SITE_ID}...")

try:
    # Get first page of keywords
    response = requests.get(URL, headers=headers, params={"limit": 10})
    
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print("Success! Checking for volume data...")
        
        # Dump first item to see structure
        if data and len(data) > 0:
            first_kw = data[0]
            print(json.dumps(first_kw, indent=2))
            
            if 'volume' in first_kw:
                print("\n✅ Volume data is available via Project API!")
                print(f"Example Volume: {first_kw['volume']}")
            else:
                print("\n❌ Volume data missing from Project API response.")
        else:
            print("No keywords found in project.")
            
    else:
        print(f"Error: {response.text}")

except Exception as e:
    print(f"Exception: {e}")
