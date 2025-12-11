import requests
import json
from datetime import datetime

# Configuration
SYSTEM_API_KEY = "5952409e4b0769e3a1cad5b0d26e976de79e70b8"
SITE_ID = 11026910
URL = f"https://api4.seranking.com/sites/{SITE_ID}/positions"

def fetch_rankings():
    print(f"--- JegoDigital SEO Command Center ---")
    print(f"Fetching live rankings for Site ID: {SITE_ID}...")
    
    headers = {
        "Authorization": f"Token {SYSTEM_API_KEY}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.get(URL, headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            process_rankings(data)
        else:
            print(f"Error fetching data: {response.status_code}")
            print(response.text)
            
    except Exception as e:
        print(f"System Error: {e}")

def process_rankings(data):
    if not data:
        print("No data received.")
        return

    # Data structure is a list of objects, one per search engine
    # We want the main one (likely Google Mexico)
    for engine in data:
        engine_id = engine.get('site_engine_id')
        keywords = engine.get('keywords', [])
        
        print(f"\nSearch Engine ID: {engine_id}")
        print(f"Total Keywords Tracked: {len(keywords)}")
        print(f"{'KEYWORD':<50} | {'RANK':<10} | {'CHANGE':<10}")
        print("-" * 75)
        
        # Sort by position (ascending, 1 is best) but put 0 (unranked) last
        # Python sort trick: (is_zero, value) tuple
        sorted_kws = sorted(keywords, key=lambda k: (
            k['positions'][0]['pos'] == 0, 
            k['positions'][0]['pos']
        ))
        
        ranked_count = 0
        
        for kw in sorted_kws:
            name = kw.get('name')
            # Positions is a list of recent checks, [0] is latest
            latest_pos = kw['positions'][0]
            rank = latest_pos.get('pos')
            change = latest_pos.get('change', 0)
            
            # Format Rank
            rank_display = str(rank) if rank > 0 else "-"
            if rank > 0:
                ranked_count += 1
            
            # Format Change
            if change > 0:
                change_display = f"↑ {change}"
            elif change < 0:
                change_display = f"↓ {abs(change)}"
            else:
                change_display = "-"
                
            print(f"{name:<50} | {rank_display:<10} | {change_display:<10}")
            
        print("-" * 75)
        print(f"Summary: {ranked_count}/{len(keywords)} keywords are ranking in Top 100.")

if __name__ == "__main__":
    fetch_rankings()
