import requests
import json

API_KEY = "3a07cc91-aedc-3f2f-9729-a12566a18a37"
API_URL = "https://api.seranking.com/v1/keywords/export"

print("\nTesting Form Data POST Method:")
try:
    # Try 1: Token in Header, Data as Form
    headers = {
        "Authorization": f"Token {API_KEY}"
    }
    # Note: requests 'data' param sends form-encoded
    payload = {
        "source": "mx",
        "keywords[]": ["renta de yates cancun", "boda cancun"] 
        # Note: keys often need brackets for arrays in form-data
    }
    r = requests.post(API_URL, headers=headers, data=payload)
    print(f"Test 1 (Header Auth, Form Data): {r.status_code}")
    if r.status_code != 200:
        print(r.text)

    # Try 2: Token in Query, Data as Form
    r = requests.post(API_URL, params={"token": API_KEY}, data=payload)
    print(f"Test 2 (Query Auth, Form Data): {r.status_code}")
    if r.status_code != 200:
        print(r.text)
        
except Exception as e:
    print(e)
