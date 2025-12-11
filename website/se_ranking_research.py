import requests
import json
import os

# Configuration
DATA_API_KEY = "3a07cc91-aedc-3f2f-9729-a12566a18a37"
URL = "https://api.seranking.com/v1/keywords/export"
KEYWORDS_FILE = "/Users/mac/.gemini/antigravity/brain/6cb056b2-9a95-4aed-8591-60f4a3a2fa5f/raw_keywords_50.txt"
OUTPUT_FILE = "keyword_research_data.json"

def load_keywords():
    try:
        if os.path.exists(KEYWORDS_FILE):
            with open(KEYWORDS_FILE, 'r') as f:
                return [line.strip() for line in f if line.strip()]
        else:
            print(f"Keywords file not found at: {KEYWORDS_FILE}")
            return []
    except Exception as e:
        print(f"Error loading keywords: {e}")
        return []

def fetch_data(keywords):
    if not keywords:
        print("No keywords provided.")
        return

    print(f"Fetching data for {len(keywords)} keywords from SE Ranking Data API...")
    print(f"Targeting Market: Mexico (mx)")

    # Prepare payload as JSON
    payload = {
        "source": "mx",
        "keywords": keywords
    }

    # Try Authorization: Token <key>
    headers = {
        "Authorization": f"Token {DATA_API_KEY}",
        "Content-Type": "application/json"
    }

    try:
        print(f"Sending POST request to {URL} with JSON payload...")
        response = requests.post(URL, json=payload, headers=headers)
        
        print(f"Response Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            # Save raw JSON
            with open(OUTPUT_FILE, 'w') as f:
                json.dump(data, f, indent=2)
            
            print(f"Success! Data saved to {OUTPUT_FILE}")
            
            # Basic analysis if list
            if isinstance(data, list):
                print(f"\nRetrieved metrics for {len(data)} keywords.")
                # sort by volume if available
                # Schema often: [{'keyword': 'foo', 'volume': 100}, ...]
                # Let's try to print top 5
                try:
                    # Normalized access checking
                    sorted_data = sorted(data, key=lambda x: x.get('volume', 0), reverse=True)
                    print("\n--- Top 10 Keywords by Volume ---")
                    for item in sorted_data[:10]:
                        kw = item.get('keyword')
                        vol = item.get('volume')
                        diff = item.get('difficulty', 'N/A')
                        cpc = item.get('cpc', 'N/A')
                        print(f"{kw}: Volume={vol}, Difficulty={diff}, CPC=${cpc}")
                except Exception as e:
                    print(f"Could not parse/sort detailed metrics: {e}")
                    
            elif isinstance(data, dict):
                 print("Received dictionary response. Check output file for structure.")
                 
        else:
            print(f"Failed to fetch data. Response: {response.text}")
            
    except Exception as e:
        print(f"Exception during request: {e}")

if __name__ == "__main__":
    keywords = load_keywords()
    fetch_data(keywords)
