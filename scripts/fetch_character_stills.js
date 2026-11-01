import fs from 'node:fs';
import path from 'node:path';

const villains = [
  {
    id: "khadra",
    name: "Khadra",
    queries: [
      "Kashmora 1986 film villain Bhimaraju",
      "Kashmora 1986 movie scene sorcerer",
      "Kashmora 1986 Telugu movie Khadra",
      "Kashmora 1986 film still"
    ]
  },
  {
    id: "darkha",
    name: "Darkha",
    queries: [
      "Rajendra Prasad Kashmora 1986 character still",
      "Rajendra Prasad Darkha Kashmora movie scene",
      "Rajendra Prasad Kashmora 1986 still",
      "Rajendra Prasad Kashmora"
    ]
  },
  {
    id: "marthanda",
    name: "Marthanda",
    queries: [
      "Rami Reddy Ammoru villain still face",
      "Rami Reddy Ammoru movie scene",
      "Rami Reddy Ammoru character",
      "Rami Reddy Ammoru"
    ]
  },
  {
    id: "bhairav",
    name: "Bhairav",
    queries: [
      "Rahul Dev Devi 1999 villain still",
      "Rahul Dev Devi 1999 movie scene",
      "Rahul Dev Devi villain Telugu",
      "Rahul Dev villain Devi"
    ]
  },
  {
    id: "ghora",
    name: "Ghora",
    queries: [
      "Mukesh Rishi Anji movie still villain",
      "Mukesh Rishi Ghora Anji character",
      "Mukesh Rishi Anji 2004",
      "Mukesh Rishi Anji villain"
    ]
  },
  {
    id: "pasupathi",
    name: "Pasupathi",
    queries: [
      "Sonu Sood Pasupathi Arundhati still face",
      "Sonu Sood Arundhati aghora character",
      "Sonu Sood Arundhati villain still",
      "Sonu Sood Arundhati face"
    ]
  },
  {
    id: "mahendra_varma",
    name: "Mahendra Varma",
    queries: [
      "Satya Prakash Nagavalli king character still",
      "Satya Prakash Nagavalli movie scene",
      "Satya Prakash Nagavalli king still",
      "Satya Prakash Nagavalli"
    ]
  },
  {
    id: "the_tantrik",
    name: "The Tantrik",
    queries: [
      "Harish Uthaman Virupaksha movie still",
      "Virupaksha Harish Uthaman character scene",
      "Harish Uthaman Virupaksha still",
      "Virupaksha movie tantrik scene"
    ]
  },
  {
    id: "tantrik_swamiji",
    name: "Tantrik Swamiji",
    queries: [
      "Nassar Jai Hind movie still villain",
      "Nassar Jai Hind 1994 still",
      "Nassar Swamiji villain",
      "Charuhasan horror movie still"
    ]
  },
  {
    id: "dr_rudra_ancestor",
    name: "Dr. Rudra's Ancestor",
    queries: [
      "Nassar Aayirathil Oruvan character still",
      "Aayirathil Oruvan Nassar Chola priest still",
      "Nassar Aayirathil Oruvan still",
      "Aayirathil Oruvan Nassar scene"
    ]
  },
  {
    id: "pandi_sorcerers",
    name: "Pandi / Rogue Sorcerers",
    queries: [
      "Pradeep Rawat villain still Muni",
      "Pradeep Rawat Muni character still",
      "Pradeep Rawat Kanchana villain still",
      "Pradeep Rawat villain face"
    ]
  },
  {
    id: "raj_nayak",
    name: "Raj Nayak",
    queries: [
      "Karthi Raj Nayak Kaashmora bald beard face",
      "Karthi Raj Nayak Kaashmora still",
      "Kaashmora Raj Nayak character face",
      "Karthi Kaashmora Raj Nayak"
    ]
  },
  {
    id: "saamri",
    name: "Tantrik Baba / Saamri",
    queries: [
      "Saamri Purana Mandir monster face Ramsay",
      "Saamri Purana Mandir still",
      "Purana Mandir monster Saamri Ramsay",
      "Purana Mandir Saamri face"
    ]
  },
  {
    id: "bhairavnath",
    name: "Bhairavnath",
    queries: [
      "Amrish Puri Nagina been tantrik face",
      "Amrish Puri Nagina been still",
      "Amrish Puri Bhairavnath Nagina character still",
      "Amrish Puri Nagina tantrik"
    ]
  },
  {
    id: "gorakhnath",
    name: "Gorakhnath",
    queries: [
      "Anupam Kher Nigahen Nagina tantrik still",
      "Anupam Kher Nigahen Nagina 2 character",
      "Anupam Kher Gorakhnath Nigahen still",
      "Anupam Kher Nigahen 1989"
    ]
  },
  {
    id: "lajja_shankar",
    name: "Lajja Shankar Pandey",
    queries: [
      "Ashutosh Rana Sangharsh ululation still",
      "Ashutosh Rana Sangharsh red saree face",
      "Ashutosh Rana Sangharsh character still",
      "Ashutosh Rana Sangharsh face"
    ]
  },
  {
    id: "vanraj",
    name: "Vanraj",
    queries: [
      "Madhavan Shaitaan smile villain still",
      "R Madhavan Shaitaan character still",
      "R Madhavan Vanraj Shaitaan scene",
      "Madhavan Shaitaan villain face"
    ]
  },
  {
    id: "digambara",
    name: "Digambara / Tantrik",
    queries: [
      "Doddanna Aapthamitra tantrik character still",
      "Aapthamitra tantrik scene",
      "Aapthamitra Doddanna still",
      "Ramesh Bhat Aapthamitra scene"
    ]
  },
  {
    id: "ohmkar",
    name: "Ohmkar / Aghori",
    queries: [
      "Charan Raj Kalpana Aghori character still",
      "Charan Raj Kalpana Kannada still",
      "Charan Raj Aghori still",
      "Charan Raj villain Kalpana"
    ]
  },
  {
    id: "brahmashri_mantrik",
    name: "Brahmashri Mantrik",
    queries: [
      "Avinash Shivalinga mantrik character still",
      "Avinash Shivalinga movie scene",
      "Avinash Shivalinga still",
      "Shivalinga Kannada movie Avinash"
    ]
  },
  {
    id: "lo_pan",
    name: "David Lo Pan",
    queries: [
      "David Lo Pan Big Trouble in Little China glowing eyes",
      "David Lo Pan glowing eyes Big Trouble",
      "James Hong David Lo Pan wedding still",
      "Lo Pan Big Trouble in Little China character still"
    ]
  },
  {
    id: "imhotep",
    name: "High Priest Imhotep",
    queries: [
      "Arnold Vosloo Imhotep Mummy scream face",
      "Arnold Vosloo Imhotep The Mummy 1999 still",
      "Imhotep The Mummy 1999 face character",
      "Arnold Vosloo Imhotep Mummy face"
    ]
  },
  {
    id: "lord_blackwood",
    name: "Lord Blackwood",
    queries: [
      "Mark Strong Lord Blackwood Sherlock Holmes still face",
      "Mark Strong Lord Blackwood Sherlock Holmes character",
      "Lord Blackwood Sherlock Holmes 2009 still",
      "Mark Strong Lord Blackwood"
    ]
  },
  {
    id: "bathsheba",
    name: "Bathsheba Sherman",
    queries: [
      "Bathsheba Sherman The Conjuring face scary",
      "The Conjuring Bathsheba wardrobe still",
      "The Conjuring Bathsheba witch face",
      "Bathsheba The Conjuring still"
    ]
  },
  {
    id: "mother_malkin",
    name: "Mother Malkin",
    queries: [
      "Julianne Moore Mother Malkin Seventh Son character still",
      "Julianne Moore Mother Malkin Seventh Son witch still",
      "Mother Malkin Seventh Son face",
      "Julianne Moore Seventh Son witch"
    ]
  },
  {
    id: "black_phillip",
    name: "The Witch (Black Phillip)",
    queries: [
      "The Witch 2015 Black Phillip goat still",
      "Black Phillip goat The Witch movie still",
      "The VVitch Black Phillip goat horn still",
      "The Witch 2015 Black Phillip"
    ]
  }
];

const TARGET_DIR = path.resolve('assets/villains');

async function searchBing(query) {
  try {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    if (!res.ok) return [];
    const text = await res.text();
    const matches = [...text.matchAll(/murl&quot;:&quot;(https?:[^&]+)&quot;/g)];
    return matches.map(m => m[1]);
  } catch (err) {
    return [];
  }
}

async function downloadJpg(url, destPath) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
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
    if (buf.length < 12000) return false;

    // Check if valid JPEG or WebP or PNG
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
    const isWebp = buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;

    if (!isJpg && !isWebp && !isPng) return false;

    fs.writeFileSync(destPath, buf);
    return true;
  } catch {
    clearTimeout(timeout);
    return false;
  }
}

// Function to filter out obvious posters and non-character images
function isLikelyPosterOrIrrelevant(url) {
  const lower = url.toLowerCase();
  const badWords = [
    'poster', 'jacket', 'amazon.com/images/p', 'walmart', 'iherb', 'myntra',
    'doctors.rush', 'speaker', 'wipro', 'pusthaka', 'book'
  ];
  return badWords.some(w => lower.includes(w));
}

async function run() {
  console.log(`Starting character profile picture replacement for ${villains.length} villains...`);

  for (let i = 0; i < villains.length; i++) {
    const v = villains[i];
    const dest = path.join(TARGET_DIR, `${v.id}.jpg`);
    console.log(`\n[${i+1}/${villains.length}] Searching character picture for: ${v.name}`);

    let replaced = false;
    for (const q of v.queries) {
      console.log(`  Query: "${q}"`);
      const candidates = await searchBing(q);
      console.log(`  Found ${candidates.length} candidates`);

      for (const url of candidates.slice(0, 12)) {
        if (isLikelyPosterOrIrrelevant(url)) continue;
        console.log(`    Trying candidate: ${url.slice(0, 75)}...`);
        const ok = await downloadJpg(url, dest);
        if (ok) {
          const sz = fs.statSync(dest).size;
          console.log(`    -> SUCCESS: Replaced ${v.id}.jpg (${sz} bytes)`);
          replaced = true;
          break;
        }
      }
      if (replaced) break;
      await new Promise(r => setTimeout(r, 400));
    }

    if (!replaced) {
      console.log(`    (Kept existing image for ${v.name})`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log("\nFinished updating all character profile pictures!");
}

run();
