import requests
import json

DATA_API_KEY = "3a07cc91-aedc-3f2f-9729-a12566a18a37"
BASE_URL = "https://api.seranking.com/v1/databases"

print("Testing SE Ranking Data API Connectivity...")

# Test 1: GET Databases with Token
print("\n--- Test 1: GET /databases with 'Token' ---")
headers_token = {"Authorization": f"Token {DATA_API_KEY}"}
try:
    r = requests.get(BASE_URL, headers=headers_token)
    print(f"Status: {r.status_code}")
    print(f"Response: {r.text[:300]}")
except Exception as e:
    print(f"Error: {e}")

# Test 3: GET /databases with Query Param
print("\n--- Test 3: GET /databases with ?token=KEY ---")
try:
    r = requests.get(f"{BASE_URL}?token={DATA_API_KEY}")
    print(f"Status: {r.status_code}")
    print(f"Response: {r.text[:300]}")
except Exception as e:
    print(f"Error: {e}")

# Test 4: GET /databases with Raw Header
print("\n--- Test 4: GET /databases with Raw Header ---")
headers_raw = {"Authorization": DATA_API_KEY}
try:
    r = requests.get(BASE_URL, headers=headers_raw)
    print(f"Status: {r.status_code}")
    print(f"Response: {r.text[:300]}")
except Exception as e:
    print(f"Error: {e}")

