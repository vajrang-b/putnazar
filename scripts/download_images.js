import fs from 'node:fs';
import path from 'node:path';

async function getDDGImages(query) {
  try {
    const pageRes = await fetch('https://duckduckgo.com/?q=' + encodeURIComponent(query), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    const html = await pageRes.text();
    let vqd = null;
    const m = html.match(/vqd=([0-9-]+)/) || html.match(/vqd=["']([0-9-]+)["']/);
    if (m) {
      vqd = m[1];
    } else {
      const m2 = html.match(/vqd:\s*["']([0-9-]+)["']/);
      if (m2) vqd = m2[1];
    }
    if (!vqd) {
      console.log('No vqd found for', query);
      return [];
    }

    const imgRes = await fetch(`https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://duckduckgo.com/',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
      }
    });
    if (!imgRes.ok) {
      console.log('imgRes not ok:', imgRes.status);
      return [];
    }
    const data = await imgRes.json();
    return data.results || [];
  } catch (err) {
    console.error('Error fetching DDG images:', err.message);
    return [];
  }
}

async function test() {
  const results = await getDDGImages('Sonu Sood Arundhati Pasupathi');
  console.log('Found:', results.length);
  if (results.length > 0) {
    console.log(results.slice(0, 3).map(r => ({ title: r.title, url: r.image })));
  }
}

test();
