import requests

API_KEY = "3a07cc91-aedc-3f2f-9729-a12566a18a37"

ENDPOINTS = [
    ("https://api4.seranking.com/research/keywords/suggestions", "GET"),
    ("https://api4.seranking.com/research/keywords/suggestions", "POST"),
    ("https://api.seranking.com/v1/keywords/export", "POST"),
]

HEADERS_TEMPLATES = [
    ("Token", {"Authorization": f"Token {API_KEY}"}),
    ("Bearer", {"Authorization": f"Bearer {API_KEY}"}),
    ("Raw", {"Authorization": API_KEY}),
    ("HeaderKey", {"Token": API_KEY}),
]

PAYLOAD = {
    "keyword": "test", 
    "keywords": ["test"], 
    "source": "mx", 
    "region_id": 484,
    "limit": 1
}

print("Starting Brute Force Connection Test...")

for url, method in ENDPOINTS:
    for name, headers in HEADERS_TEMPLATES:
        headers["Content-Type"] = "application/json"
        
        print(f"\nTrying: {method} {url} | Auth: {name}")
        try:
            if method == "GET":
                r = requests.get(url, headers=headers, params=PAYLOAD)
            else:
                r = requests.post(url, headers=headers, json=PAYLOAD)
            
            print(f"Status: {r.status_code}")
            if r.status_code != 400:
                print(f"SUCCESS! Body: {r.text[:200]}")
            else:
                print(f"Fail (400).")
                
        except Exception as e:
            print(f"Ex: {e}")
