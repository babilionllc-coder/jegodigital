import requests
import json
import os

API_KEY = "5952409e4b0769e3a1cad5b0d26e976de79e70b8"
BASE_URL = "https://api4.seranking.com"
KEYWORDS_FILE = "/Users/mac/.gemini/antigravity/brain/6cb056b2-9a95-4aed-8591-60f4a3a2fa5f/raw_keywords_50.txt"

def get_headers():
    return {
        "Authorization": f"Token {API_KEY}",
        "Content-Type": "application/json"
    }

def list_projects():
    url = f"{BASE_URL}/sites"
    response = requests.get(url, headers=get_headers())
    if response.status_code == 200:
        return response.json()
    else:
        print(f"Error listing projects: {response.status_code} - {response.text}")
        return None

def add_keywords(site_id, keywords):
    url = f"{BASE_URL}/sites/{site_id}/keywords"
    
    # Format: [{"keyword": "kw1"}, {"keyword": "kw2"}]
    payload = [{"keyword": kw.strip()} for kw in keywords if kw.strip()]
    
    # The API might have a limit on keywords per request (often 100 or 50). 
    # We have ~50, so one batch should be fine, but let's chunk it just in case.
    chunk_size = 50
    for i in range(0, len(payload), chunk_size):
        chunk = payload[i:i + chunk_size]
        response = requests.post(url, headers=get_headers(), json=chunk)
        if response.status_code == 200 or response.status_code == 201:
             print(f"Successfully added batch of {len(chunk)} keywords.")
             print(response.json())
        else:
            print(f"Error adding keywords batch: {response.status_code} - {response.text}")

def main():
    print("Fetching projects...")
    projects = list_projects()
    
    if not projects:
        print("No projects found or error occurred.")
        return

    target_project = None
    print("\nAvailable Projects:")
    for p in projects:
        print(f"ID: {p.get('id')} | Title: {p.get('title')} | URL: {p.get('name')}")
        # Simple heuristic to find the right project
        if "jego" in p.get('title', '').lower() or "jego" in p.get('name', '').lower():
            target_project = p

    if target_project:
        print(f"\nFound target project: {target_project['title']} (ID: {target_project['id']})")
        
        # Read keywords
        try:
            with open(KEYWORDS_FILE, 'r') as f:
                keywords = f.readlines()
            
            print(f"Read {len(keywords)} keywords from file.")
            
            # Since this is an agentic run, I will proceed to add them if the project is clear.
            print("Adding keywords...")
            add_keywords(target_project['id'], keywords)
            
        except FileNotFoundError:
            print(f"Keywords file not found at {KEYWORDS_FILE}")
            
    else:
        print("\nCould not automatically identify the 'JegoDigital' project. Please specify the Site ID manually.")

if __name__ == "__main__":
    main()
