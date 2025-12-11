import requests
import json
import time

# Configuration
API_KEY = "39c16810bfmshfc4c4adcb1500eep1bf650jsn71479cd17018"
HOST = "semrush-keyword-magic-tool.p.rapidapi.com"

# The endpoint from the screenshot appears to be global-volume, but for "Magic" suggestions 
# we usually want /keywords-data or similar. 
# Let's try to hit the 'keyword-magic-tool' endpoint if possible, or standard keyword extraction.
# Based on common RapidAPI structures for this specific API (kakame reddy):
# It usually supports a GET request to search for keywords.
# Let's try to find relevant keywords for our niche.

SEARCH_TERMS = [
    "marketing digital cancun",
    "agencia seo mexico",
    "real estate marketing ai",
    "tulum real estate"
]

def check_keyword_data(keyword):
    """
    Fetches data for a specific keyword to see volume and difficulty.
    Using the 'global-volume' endpoint seen in the screenshot as a safe bet first.
    """
    url = "https://semrush-keyword-magic-tool.p.rapidapi.com/global-volume"
    
    querystring = {"keyword": keyword, "country": "mx"} # Targeting Mexico for local relevance
    
    headers = {
        "x-rapidapi-key": API_KEY,
        "x-rapidapi-host": HOST
    }
    
    try:
        response = requests.get(url, headers=headers, params=querystring)
        print(f"Status for '{keyword}': {response.status_code}")
        if response.status_code == 200:
            return response.json()
        else:
            print(f"Error: {response.text}")
            return None
    except Exception as e:
        print(f"Exception: {e}")
        return None

results = {}
print("--- Starting Keyword Analysis ---")

for term in SEARCH_TERMS:
    print(f"Analyzing: {term}...")
    data = check_keyword_data(term)
    if data:
        results[term] = data
    time.sleep(1) # Be nice to the API rate limit

print("--- Analysis Complete ---")
print(json.dumps(results, indent=2))

# Save for review
with open('keyword_api_results.json', 'w') as f:
    json.dump(results, f, indent=2)
