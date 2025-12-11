import requests
import json

SYSTEM_API_KEY = "5952409e4b0769e3a1cad5b0d26e976de79e70b8"
SITE_ID = 11026910
BASE_URL = "https://api4.seranking.com/sites"

headers = {
    "Authorization": f"Token {SYSTEM_API_KEY}",
    "Content-Type": "application/json"
}

endpoints = [
    f"{BASE_URL}/{SITE_ID}/positions",
    f"{BASE_URL}/{SITE_ID}/stat",
    f"{BASE_URL}/{SITE_ID}/rankings"
]

print(f"Testing endpoints for Site ID: {SITE_ID}...\n")

for url in endpoints:
    print(f"--- Testing {url} ---")
    try:
        response = requests.get(url, headers=headers)
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            print("Success! Response preview:")
            print(response.text[:500])
        else:
            print(f"Error: {response.status_code}")
    except Exception as e:
        print(f"Exception: {e}")
    print("\n")
