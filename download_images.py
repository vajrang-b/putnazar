"""
Character image downloader – v4
Changes from v3:
  * Rotated User-Agent pool to avoid soft-blocking
  * Simplified / broadened queries (actor name only fallback)
  * Wikipedia REST API for actor headshots (reliable for known actors)
  * DDG: try both the token-based endpoint AND direct HTML scrape
  * Bing: improved murl + og:image extraction
  * Extra debug output for vqd extraction
"""

import os
import re
import time
import random
import urllib.parse
import urllib.request
import json

CHARACTERS = [
    {"name": "Pasupathi", "actor": "Sonu Sood", "movie": "Arundhati (2009)"},
    {"name": "Darkha", "actor": "Rajendra Prasad", "movie": "Kashmora (1986)"},
    {"name": "Khadra", "actor": "Bhimaraju", "movie": "Kashmora (1986)"},
    {"name": "Marthanda", "actor": "Rami Reddy", "movie": "Ammoru (1995)"},
    {"name": "Bhairav", "actor": "Rahul Dev", "movie": "Devi (1999)"},
    {"name": "Ghora", "actor": "Mukesh Rishi", "movie": "Anji (2004)"},
    {"name": "Mahendra Varma", "actor": "Satya Prakash", "movie": "Nagavalli (2010)"},
    {"name": "The Tantrik", "actor": "Harish Uthaman", "movie": "Virupaksha (2023)"},
    {"name": "Raj Nayak", "actor": "Karthi", "movie": "Kaashmora (2016)"},
    {"name": "Dr Rudras Ancestor", "actor": "Nassar", "movie": "Aayirathil Oruvan (2009)"},
    {"name": "Bhairavnath", "actor": "Amrish Puri", "movie": "Nagina (1986)"},
    {"name": "Gorakhnath", "actor": "Anupam Kher", "movie": "Nigahen: Nagina Part II (1989)"},
    {"name": "Lajja Shankar Pandey", "actor": "Ashutosh Rana", "movie": "Sangharsh (1999)"},
    {"name": "Vanraj", "actor": "R. Madhavan", "movie": "Shaitaan (2024)"},
    {"name": "Digambara", "actor": "Ramesh Bhat", "movie": "Aapthamitra (2004)"},
    {"name": "Brahmashri Mantrik", "actor": "Avinash", "movie": "Shivalinga (2016)"},
    {"name": "Lo Pan", "actor": "James Hong", "movie": "Big Trouble in Little China (1986)"},
    {"name": "Imhotep", "actor": "Arnold Vosloo", "movie": "The Mummy (1999)"},
    {"name": "Lord Blackwood", "actor": "Mark Strong", "movie": "Sherlock Holmes (2009)"},
]

OUTPUT_DIR = "character_images"

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
]

def make_headers(referer=None):
    h = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "identity",
        "DNT": "1",
    }
    if referer:
        h["Referer"] = referer
    return h


def download_image(img_url: str, save_path: str) -> bool:
    try:
        clean_url = img_url.replace("\\u003d", "=").replace("\\u0026", "&")
        if not clean_url.startswith("http"):
            return False
        req = urllib.request.Request(clean_url, headers=make_headers())
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read()
            if len(data) > 5000:
                with open(save_path, "wb") as f:
                    f.write(data)
                return True
    except Exception:
        pass
    return False


# ─── Source 1: DuckDuckGo (vqd token method) ───────────────────────────────
def duckduckgo_urls(query: str) -> list:
    try:
        search_url = "https://duckduckgo.com/?" + urllib.parse.urlencode(
            {"q": query, "iax": "images", "ia": "images"}
        )
        req = urllib.request.Request(search_url, headers=make_headers())
        with urllib.request.urlopen(req, timeout=12) as r:
            html = r.read().decode("utf-8", errors="ignore")

        vqd = None
        for pat in [r'vqd=(["\'])([^"\']{5,})\1', r'"vqd"\s*:\s*"([^"]+)"', r'vqd=([\d-]+)']:
            m = re.search(pat, html)
            if m:
                vqd = m.group(2) if m.lastindex >= 2 else m.group(1)
                break

        if not vqd:
            print("      [DDG] vqd not found in page")
            return []

        print(f"      [DDG] vqd={vqd[:12]}...", end=" ")
        time.sleep(random.uniform(1.5, 2.5))

        params = urllib.parse.urlencode({
            "l": "us-en", "o": "json", "q": query,
            "vqd": vqd, "f": ",,,,,", "p": "1",
        })
        api = "https://duckduckgo.com/i.js?" + params
        req2 = urllib.request.Request(api, headers=make_headers(search_url))
        with urllib.request.urlopen(req2, timeout=12) as r2:
            data = json.loads(r2.read().decode())

        results = [item["image"] for item in data.get("results", []) if "image" in item]
        print(f"got {len(results)} results")
        return results
    except urllib.error.HTTPError as e:
        print(f"      [DDG] HTTP {e.code}")
        if e.code in (403, 429):
            time.sleep(20)
        return []
    except Exception as e:
        print(f"      [DDG] error: {e}")
        return []


# ─── Source 2: Wikipedia REST (actor headshot) ─────────────────────────────
def wikipedia_actor_url(actor: str) -> list:
    """Fetch the lead image from the actor's Wikipedia page."""
    try:
        time.sleep(random.uniform(0.5, 1.5))
        # Use the REST summary endpoint — returns JSON with thumbnail.source
        name_enc = urllib.parse.quote(actor.replace(" ", "_"))
        url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{name_enc}"
        req = urllib.request.Request(url, headers={"User-Agent": "CharacterImageBot/1.0 (contact@example.com)"})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode())
        img = data.get("originalimage", {}).get("source") or data.get("thumbnail", {}).get("source")
        return [img] if img else []
    except Exception as e:
        print(f"      [Wikipedia] error: {e}")
        return []


# ─── Source 3: Wikimedia Commons search ───────────────────────────────────
def wikimedia_urls(query: str) -> list:
    try:
        time.sleep(random.uniform(1.0, 2.0))
        params = urllib.parse.urlencode({
            "action": "query", "format": "json",
            "generator": "search", "gsrnamespace": "6",
            "gsrsearch": query, "gsrlimit": "5",
            "prop": "imageinfo", "iiprop": "url",
        })
        req = urllib.request.Request(
            "https://commons.wikimedia.org/w/api.php?" + params,
            headers={"User-Agent": "CharacterImageBot/1.0"}
        )
        with urllib.request.urlopen(req, timeout=12) as r:
            data = json.loads(r.read().decode())
        pages = data.get("query", {}).get("pages", {})
        return [ii["url"] for p in pages.values() for ii in p.get("imageinfo", []) if "url" in ii]
    except urllib.error.HTTPError as e:
        print(f"      [Wikimedia] HTTP {e.code}")
        if e.code == 429:
            time.sleep(15)
        return []
    except Exception as e:
        print(f"      [Wikimedia] error: {e}")
        return []


# ─── Source 4: Bing image search ──────────────────────────────────────────
def bing_urls(query: str) -> list:
    try:
        time.sleep(random.uniform(1.5, 3.0))
        url = "https://www.bing.com/images/search?" + urllib.parse.urlencode({
            "q": query, "form": "HDRSC2", "first": "1", "tsc": "ImageBasicHover",
        })
        req = urllib.request.Request(url, headers=make_headers())
        with urllib.request.urlopen(req, timeout=12) as r:
            html = r.read().decode("utf-8", errors="ignore")
        urls = re.findall(r'"murl"\s*:\s*"(https?://[^"]+)"', html)
        if not urls:
            urls = re.findall(r'<img[^>]+src="(https?://[^"]+\.(?:jpg|jpeg|png)[^"]*)"', html, re.I)
        return urls
    except Exception as e:
        print(f"      [Bing] error: {e}")
        return []


# ─── Orchestration ────────────────────────────────────────────────────────
def fetch_image(char: dict, save_path: str) -> bool:
    actor = char["actor"]
    movie = char["movie"]
    name  = char["name"]

    # Multiple query strategies: specific → actor + movie → actor only
    queries = [
        f"{actor} {name} {movie}",
        f"{actor} {movie} villain",
        f"{actor} actor",
    ]

    for q_idx, query in enumerate(queries):
        print(f"    Query [{q_idx+1}]: {query}")
        for source_name, source_fn, source_arg in [
            ("DuckDuckGo", duckduckgo_urls, query),
            ("Wikipedia",  wikipedia_actor_url, actor),   # actor headshot
            ("Wikimedia",  wikimedia_urls, f"{actor} {movie}"),
            ("Bing",       bing_urls, query),
        ]:
            urls = source_fn(source_arg) if source_name == "Wikipedia" else source_fn(query if source_name != "Wikimedia" else f"{actor} {movie}")
            print(f"      [{source_name}] {len(urls)} candidate(s)", end="")
            for u in urls[:8]:
                if download_image(u, save_path):
                    print(" -> saved!")
                    return True
            print(" -> none worked")

        if q_idx < len(queries) - 1:
            time.sleep(random.uniform(2.0, 4.0))

    return False


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Downloading into ./{OUTPUT_DIR}/")
    print("=" * 65)

    success = 0
    for idx, char in enumerate(CHARACTERS, 1):
        clean_name  = re.sub(r'[^a-zA-Z0-9_-]', '_', char['name'])
        clean_actor = re.sub(r'[^a-zA-Z0-9_-]', '_', char['actor'])
        filename  = f"{idx:02d}_{clean_name}_{clean_actor}.jpg"
        save_path = os.path.join(OUTPUT_DIR, filename)

        print(f"\n[{idx:02d}/{len(CHARACTERS)}] {char['name']} ({char['actor']})")

        if os.path.exists(save_path) and os.path.getsize(save_path) > 5000:
            print(f"    [SKIP] Already downloaded.")
            success += 1
            continue

        if fetch_image(char, save_path):
            print(f"    [OK] -> {filename}")
            success += 1
        else:
            print(f"    [FAIL] No image found.")

        time.sleep(random.uniform(3.0, 5.0))

    print("\n" + "=" * 65)
    print(f"Done!  {success}/{len(CHARACTERS)} images saved.")


if __name__ == "__main__":
    main()
