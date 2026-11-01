import fs from 'node:fs';
import path from 'node:path';

const TARGET_DIR = path.resolve('assets/villains');

async function searchBing(query) {
  try {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });
    const text = await res.text();
    const matches = [...text.matchAll(/murl&quot;:&quot;(https?:[^&]+)&quot;/g)];
    return matches.map(m => m[1]);
  } catch (err) {
    return [];
  }
}

async function downloadFile(url, destPath) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      }
    });
    clearTimeout(timeout);
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 10000) return false;
    fs.writeFileSync(destPath, buf);
    return true;
  } catch {
    clearTimeout(timeout);
    return false;
  }
}

async function refine() {
  const targets = [
    {
      id: 'pandi_sorcerers',
      queries: ['actor Pradeep Rawat villain Muni', 'Pradeep Rawat villain', 'Pradeep Rawat actor eyes']
    },
    {
      id: 'digambara',
      queries: ['Doddanna Aapthamitra', 'Aapthamitra tantrik', 'actor Doddanna Kannada villain', 'Ramesh Bhat Aapthamitra']
    },
    {
      id: 'brahmashri_mantrik',
      queries: ['Avinash actor Shivalinga', 'actor Avinash Kannada villain', 'Avinash Shivalinga movie']
    },
    {
      id: 'khadra',
      queries: ['Kashmora 1986 film', 'Kashmora 1986 movie poster', 'Bhimaraju Kashmora']
    }
  ];

  for (const t of targets) {
    const dest = path.join(TARGET_DIR, `${t.id}.jpg`);
    console.log(`Refining ${t.id}...`);
    for (const q of t.queries) {
      const candidates = await searchBing(q);
      console.log(`  Query: ${q} -> ${candidates.length} candidates`);
      let found = false;
      for (const url of candidates.slice(0, 10)) {
        if (url.includes('wipro') || url.includes('mynt') || url.includes('pusthaka')) continue;
        const ok = await downloadFile(url, dest);
        if (ok) {
          console.log(`  -> Downloaded refined: ${url.slice(0, 80)} (${fs.statSync(dest).size} bytes)`);
          found = true;
          break;
        }
      }
      if (found) break;
    }
  }
}

refine();
