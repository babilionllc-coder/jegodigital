import requests
import json

API_KEY = "3a07cc91-aedc-3f2f-9729-a12566a18a37"
API_URL = "https://api.seranking.com/v1/keywords/export"

headers = {"Authorization": f"Token {API_KEY}"}

def test(name, data):
    print(f"\nTest {name}:")
    try:
        r = requests.post(API_URL, headers=headers, data=data)
        print(f"Status: {r.status_code}")
        if r.status_code != 200:
            print(r.text)
        else:
            print("SUCCESS")
    except Exception as e:
        print(e)

# Test 1: Comma separated string
test("Comma String", {
    "source": "mx", 
    "keywords": "renta de yates cancun,boda cancun"
})

# Test 2: Comma separated string with brackets key
test("Comma String Brackets", {
    "source": "mx", 
    "keywords[]": "renta de yates cancun,boda cancun"
})

# Test 3: List with brackets key (standard PHP/Rails style)
test("List Brackets", {
    "source": "mx", 
    "keywords[]": ["renta de yates cancun", "boda cancun"]
})

# Test 4: List without brackets (standard Python requests style)
test("List No Brackets", {
    "source": "mx", 
    "keywords": ["renta de yates cancun", "boda cancun"]
})

# Test 5: US Source
test("US Source", {
    "source": "us", 
    "keywords": "test"
})
