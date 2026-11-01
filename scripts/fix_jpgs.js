import fs from 'node:fs';
import path from 'node:path';

async function searchBing(query) {
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
}

async function downloadJpgOnly(query, destPath) {
  const candidates = await searchBing(query);
  for (const url of candidates) {
    if (!url.toLowerCase().includes('.jpg') && !url.toLowerCase().includes('.jpeg')) continue;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf[0] === 0xFF && buf[1] === 0xD8 && buf.length > 15000) {
        fs.writeFileSync(destPath, buf);
        console.log(`Successfully downloaded true JPG for ${destPath}: ${buf.length} bytes`);
        return true;
      }
    } catch {}
  }
  return false;
}

async function fix() {
  await downloadJpgOnly('Arnold Vosloo Imhotep Mummy', 'assets/villains/imhotep.jpg');
  await downloadJpgOnly('James Hong Lo Pan Big Trouble', 'assets/villains/lo_pan.jpg');
  await downloadJpgOnly('Nassar Jai Hind actor', 'assets/villains/tantrik_swamiji.jpg');
  await downloadJpgOnly('Doddanna actor Kannada', 'assets/villains/digambara.jpg');
}

fix();
