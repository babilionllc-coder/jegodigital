import requests

API_KEY = "3a07cc91-aedc-3f2f-9729-a12566a18a37"
# Note: api4.seranking.com might be for V4, but docs say api.seranking.com for general. 
# Trying api.seranking.com first.
API_URL_V1 = "https://api.seranking.com/v1/keywords/export"

print("\nTesting V1 POST Method:")
try:
    headers = {
        "Token": API_KEY, # Some docs say just 'Token: <key>' as header? 
        # But usually Authorization: Token <key>
        "Authorization": f"Token {API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "source": "mx", # Mexico
        "keywords": ["renta de yates cancun", "boda cancun"]
    }
    r = requests.post(API_URL_V1, headers=headers, json=payload)
    print(f"Status: {r.status_code}")
    print(r.text)
except Exception as e:
    print(e)
