import fs from 'node:fs';
import path from 'node:path';

const villains = [
  // TELUGU
  {
    id: "khadra",
    name: "Khadra",
    actor: "Bhimaraju",
    movie: "Kashmora (1986)",
    language: "Telugu",
    year: 1986,
    practice: "Kshudra Vidya (Lethal Black Magic)",
    role: "Practices human sacrifice (Nara Bali) to gain dark powers, inadvertently engineering the creature Darkha.",
    queries: ["Bhimaraju Kashmora 1986", "Kashmora 1986 Telugu movie", "Kashmora 1986 film poster"]
  },
  {
    id: "darkha",
    name: "Darkha",
    actor: "Rajendra Prasad",
    movie: "Kashmora (1986)",
    language: "Telugu",
    year: 1986,
    practice: "Occult Creation / Golem Rites",
    role: "Created via sorcery to terrorize a family, but undergoes a moral crisis and seeks redemption.",
    queries: ["Rajendra Prasad Kashmora 1986", "Rajendra Prasad Darkha Kashmora", "Kashmora 1986 Rajendra Prasad"]
  },
  {
    id: "marthanda",
    name: "Marthanda",
    actor: "Rami Reddy",
    movie: "Ammoru (1995)",
    language: "Telugu",
    year: 1995,
    practice: "Demonic Rituals & Evil Tantra",
    role: "Tortures villagers and locks a divine soul away until he faces direct wrath from the Goddess Ammoru.",
    queries: ["Rami Reddy Ammoru", "Ammoru Rami Reddy villain", "Rami Reddy Ammoru movie"]
  },
  {
    id: "bhairav",
    name: "Bhairav",
    actor: "Rahul Dev",
    movie: "Devi (1999)",
    language: "Telugu",
    year: 1999,
    practice: "Shape-shifting Serpent Necromancy",
    role: "An evil snake demon who uses dark arts to target and possess a divine woman (Nagakanya).",
    queries: ["Rahul Dev Devi 1999 Telugu", "Rahul Dev Devi movie villain", "Rahul Dev Devi 1999"]
  },
  {
    id: "ghora",
    name: "Ghora",
    actor: "Mukesh Rishi",
    movie: "Anji (2004)",
    language: "Telugu",
    year: 2004,
    practice: "Graveyard Sorcery & Artifact Hunting",
    role: "Obsessed with retrieving the sacred Atmalingam to achieve godlike immortality.",
    queries: ["Mukesh Rishi Ghora Anji", "Mukesh Rishi Anji", "Anji movie Mukesh Rishi villain"]
  },
  {
    id: "pasupathi",
    name: "Pasupathi",
    actor: "Sonu Sood",
    movie: "Arundhati (2009)",
    language: "Telugu",
    year: 2009,
    practice: "Aghora Necromancy & Ghostly Possession",
    role: "A banished sadist who masters graveyard black magic to enact ancestral revenge across generations.",
    queries: ["Sonu Sood Arundhati Pasupathi", "Pasupathi Arundhati Sonu Sood", "Arundhati Sonu Sood aghora"]
  },
  {
    id: "mahendra_varma",
    name: "Mahendra Varma",
    actor: "Satya Prakash",
    movie: "Nagavalli (2010)",
    language: "Telugu",
    year: 2010,
    practice: "Tantric Subjugation & Royal Tyranny",
    role: "A sadistic historical king who used black magic and fear to abuse women and bind spirits.",
    queries: ["Satya Prakash Nagavalli", "Nagavalli Mahendra Varma Satya Prakash", "Satya Prakash Nagavalli king"]
  },
  {
    id: "the_tantrik",
    name: "The Tantrik",
    actor: "Harish Uthaman",
    movie: "Virupaksha (2023)",
    language: "Telugu",
    year: 2023,
    practice: "Lethal Village Curses (Chetapadi)",
    role: "Unfurls a multi-layered death curse upon an entire sealed village to avenge a past injustice.",
    queries: ["Virupaksha Harish Uthaman", "Virupaksha movie Harish Uthaman tantrik", "Harish Uthaman Virupaksha 2023"]
  },

  // TAMIL
  {
    id: "tantrik_swamiji",
    name: "Tantrik Swamiji",
    actor: "Nassar / Charuhasan",
    movie: "Jai Hind & Early 90s Horror",
    language: "Tamil",
    year: 1994,
    practice: "Vashikaran (Hypnotic Mind Control)",
    role: "Uses dark ash-covered appearance to subjugate innocent families under supernatural blackmail.",
    queries: ["Nassar Jai Hind villain", "Nassar Jai Hind 1994", "Charuhasan horror movie"]
  },
  {
    id: "dr_rudra_ancestor",
    name: "Dr. Rudra's Ancestor",
    actor: "Nassar",
    movie: "Aayirathil Oruvan (2009)",
    language: "Tamil",
    year: 2009,
    practice: "Ancient Necromancy & Royal Curses",
    role: "Serves as a terrifying, immortal protector of hidden royal relics through blood sacrifices.",
    queries: ["Nassar Aayirathil Oruvan", "Aayirathil Oruvan Nassar", "Aayirathil Oruvan 2010 Nassar"]
  },
  {
    id: "pandi_sorcerers",
    name: "Pandi / Rogue Sorcerers",
    actor: "Pradeep Rawat",
    movie: "Muni / Kanchana Series",
    language: "Tamil",
    year: 2007,
    practice: "Soul Trapping & Voodoo Talismans",
    role: "Corrupt local shamans who are hired by corporate villains to trap restless ghosts or create deadly charms.",
    queries: ["Pradeep Rawat Muni", "Pradeep Rawat Kanchana", "Pradeep Rawat Tamil villain"]
  },
  {
    id: "raj_nayak",
    name: "Raj Nayak",
    actor: "Karthi",
    movie: "Kaashmora (2016)",
    language: "Tamil",
    year: 2016,
    practice: "Bloodthirsty Phantom Warlord Magic",
    role: "A tyrannical ancient military commander whose spirit remains trapped in a cursed, dark dimension.",
    queries: ["Karthi Raj Nayak Kaashmora", "Raj Nayak Kaashmora Karthi", "Kaashmora Raj Nayak"]
  },

  // HINDI
  {
    id: "saamri",
    name: "Tantrik Baba / Saamri",
    actor: "Sadashiv Amrapurkar / Raza Murad",
    movie: "Purana Mandir (1984) / Veerana (1988)",
    language: "Hindi",
    year: 1984,
    practice: "Demonic Worship & Graveyard Sacrifices",
    role: "Classic Ramsay Brothers sorcerers who bargain with ancient demons for everlasting life and power.",
    queries: ["Saamri Purana Mandir", "Purana Mandir Saamri monster", "Veerana Baba Ramsay"]
  },
  {
    id: "bhairavnath",
    name: "Bhairavnath",
    actor: "Amrish Puri",
    movie: "Nagina (1986)",
    language: "Hindi",
    year: 1986,
    practice: "Tantric Serpent Control (Been Rites)",
    role: "Driven by absolute greed to steal the mystical Nagmani stone for global domination and immortality.",
    queries: ["Amrish Puri Bhairavnath Nagina", "Amrish Puri Nagina been", "Amrish Puri Nagina tantrik"]
  },
  {
    id: "gorakhnath",
    name: "Gorakhnath",
    actor: "Anupam Kher",
    movie: "Nigahen: Nagina Part II (1989)",
    language: "Hindi",
    year: 1989,
    practice: "Inherited Dark Arts & Serpent Grudges",
    role: "The vengeful disciple of Bhairavnath who seeks to complete his deceased master's dark mission.",
    queries: ["Anupam Kher Nigahen Nagina", "Anupam Kher Gorakhnath Nigahen", "Nigahen 1989 Anupam Kher"]
  },
  {
    id: "lajja_shankar",
    name: "Lajja Shankar Pandey",
    actor: "Ashutosh Rana",
    movie: "Sangharsh (1999)",
    language: "Hindi",
    year: 1999,
    practice: "Child Sacrifice to Goddess Kali",
    role: "An unstable, ululating fanatic who abducts children to achieve spiritual transcendence and physical immortality.",
    queries: ["Ashutosh Rana Sangharsh", "Lajja Shankar Pandey Sangharsh", "Ashutosh Rana Sangharsh ululation"]
  },
  {
    id: "vanraj",
    name: "Vanraj",
    actor: "R. Madhavan",
    movie: "Shaitaan (2024)",
    language: "Hindi",
    year: 2024,
    practice: "Telepathic Vashikaran & Puppetry",
    role: "A modern, clean-cut incarnation of pure evil who uses hypnotic sound triggers to turn daughters into self-harming puppets.",
    queries: ["R Madhavan Shaitaan Vanraj", "Madhavan Shaitaan villain", "R Madhavan Shaitaan 2024"]
  },

  // KANNADA
  {
    id: "digambara",
    name: "Digambara / Tantrik",
    actor: "Ramesh Bhat / Doddanna",
    movie: "Aapthamitra (2004)",
    language: "Kannada",
    year: 2004,
    practice: "High-Stakes Exorcism & Dark Energy",
    role: "Evil or rogue practitioners who try to manipulate or bind the furious spirit of Nagavalli.",
    queries: ["Aapthamitra Doddanna tantrik", "Aapthamitra Ramesh Bhat", "Aapthamitra 2004 Kannada movie"]
  },
  {
    id: "ohmkar",
    name: "Ohmkar / Aghori",
    actor: "Charan Raj",
    movie: "Kalpana (2012) / Nagarahavu (2016)",
    language: "Kannada",
    year: 2012,
    practice: "Macabre Incantations & Totem Magic",
    role: "Antagonists searching for hidden cosmic gems or trying to bend ancient protector spirits to their will.",
    queries: ["Charan Raj Kalpana Kannada", "Charan Raj Kannada actor", "Nagarahavu 2016 villain"]
  },
  {
    id: "brahmashri_mantrik",
    name: "Brahmashri Mantrik",
    actor: "Avinash",
    movie: "Shivalinga (2016)",
    language: "Kannada",
    year: 2016,
    practice: "Criminal Cover-up Sorcery",
    role: "A corrupt occultist hired to forcefully bind a murder victim's soul into a pigeon to hide a high-profile crime.",
    queries: ["Avinash Shivalinga Kannada", "Avinash Shivalinga 2016", "Avinash Kannada actor Shivalinga"]
  },

  // ENGLISH
  {
    id: "lo_pan",
    name: "Lo Pan",
    actor: "James Hong",
    movie: "Big Trouble in Little China (1986)",
    language: "English",
    year: 1986,
    practice: "Ancient Chinese Sorcery & Flesh Curses",
    role: "An immortal, fleshless ghost-sorcerer who must sacrifice a green-eyed woman to regain his physical body and conquer the world.",
    queries: ["James Hong David Lo Pan Big Trouble in Little China", "David Lo Pan Big Trouble in Little China", "James Hong Lo Pan"]
  },
  {
    id: "imhotep",
    name: "Imhotep",
    actor: "Arnold Vosloo",
    movie: "The Mummy (1999)",
    language: "English",
    year: 1999,
    practice: "Ancient Egyptian Necromancy & Plagues",
    role: "A resurrected high priest who controls the sands, summons plagues, and drains victims' life forces to resurrect his lost lover.",
    queries: ["Arnold Vosloo Imhotep The Mummy 1999", "Imhotep The Mummy 1999", "Arnold Vosloo Mummy"]
  },
  {
    id: "lord_blackwood",
    name: "Lord Blackwood",
    actor: "Mark Strong",
    movie: "Sherlock Holmes (2009)",
    language: "English",
    year: 2009,
    practice: "Dark Occult Rituals & Feigned Magic",
    role: "A sadistic aristocrat who performs human sacrifices and uses chemical tricks under the guise of dark magic to seize political power.",
    queries: ["Mark Strong Lord Blackwood Sherlock Holmes", "Lord Blackwood Sherlock Holmes 2009", "Mark Strong Sherlock Holmes"]
  },
  {
    id: "bathsheba",
    name: "Bathsheba Sherman",
    actor: "Joseph Bishara",
    movie: "The Conjuring (2013)",
    language: "English",
    year: 2013,
    practice: "Satanic Witchcraft & Child Sacrifice",
    role: "A 19th-century witch who cursed her land and hangs around as a demonic spirit to force mothers into murdering their children.",
    queries: ["Bathsheba Sherman The Conjuring", "The Conjuring Bathsheba witch", "Joseph Bishara Bathsheba The Conjuring"]
  },
  {
    id: "mother_malkin",
    name: "Mother Malkin",
    actor: "Julianne Moore",
    movie: "Seventh Son (2014)",
    language: "English",
    year: 2014,
    practice: "Dark Animistic Shape-shifting & Blood Magic",
    role: "A powerful witch queen who marshals an army of dark sorcerers to unleash destruction on humanity during a blood moon.",
    queries: ["Julianne Moore Mother Malkin Seventh Son", "Mother Malkin Seventh Son", "Julianne Moore Seventh Son witch"]
  },
  {
    id: "black_phillip",
    name: "The Witch (Black Phillip)",
    actor: "Wahab Chaudhry",
    movie: "The Witch (2015)",
    language: "English",
    year: 2015,
    practice: "Satanic Covenants & Isolation Hexes",
    role: "A demonic entity that slowly manipulates a puritanical family into paranoia, ultimately recruiting the eldest daughter into a dark coven.",
    queries: ["Black Phillip The Witch 2015", "The Witch 2015 Black Phillip goat", "The VVitch Black Phillip"]
  }
];

const TARGET_DIR = path.resolve('assets/villains');
if (!fs.existsSync(TARGET_DIR)) {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
}

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
    console.error(`Bing search error for "${query}":`, err.message);
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
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('image') && !contentType.includes('octet-stream')) {
      return false;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 8000) return false; // Must be at least 8KB
    fs.writeFileSync(destPath, buf);
    return true;
  } catch {
    clearTimeout(timeout);
    return false;
  }
}

async function main() {
  console.log(`Starting image acquisition for ${villains.length} occult villains...`);
  const statusLog = [];

  for (let i = 0; i < villains.length; i++) {
    const v = villains[i];
    const outPath = path.join(TARGET_DIR, `${v.id}.jpg`);

    // If already downloaded and > 10KB, check if valid
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 10000) {
      console.log(`[${i+1}/${villains.length}] ${v.name} (${v.movie}) already present (${fs.statSync(outPath).size} bytes). Skipping.`);
      statusLog.push({ id: v.id, name: v.name, size: fs.statSync(outPath).size, success: true });
      continue;
    }

    console.log(`[${i+1}/${villains.length}] Searching for ${v.name} (${v.actor} in ${v.movie})...`);
    let downloaded = false;

    for (const query of v.queries) {
      const candidates = await searchBing(query);
      console.log(`  Query: "${query}" -> ${candidates.length} candidates`);

      for (const imgUrl of candidates.slice(0, 10)) {
        if (imgUrl.endsWith('.svg') || imgUrl.endsWith('.gif')) continue;
        const ok = await downloadFile(imgUrl, outPath);
        if (ok) {
          const sz = fs.statSync(outPath).size;
          console.log(`  -> SUCCESS: ${imgUrl.slice(0, 75)}... (${sz} bytes)`);
          downloaded = true;
          statusLog.push({ id: v.id, name: v.name, size: sz, success: true });
          break;
        }
      }
      if (downloaded) break;
      await new Promise(r => setTimeout(r, 400));
    }

    if (!downloaded) {
      console.log(`  -> FAILED to download for ${v.name}`);
      statusLog.push({ id: v.id, name: v.name, size: 0, success: false });
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log("\n==================== ACQUISITION REPORT ====================");
  console.log(`Total Villains: ${villains.length}`);
  const successful = statusLog.filter(s => s.success);
  console.log(`Successfully Downloaded: ${successful.length} / ${villains.length}`);
  if (successful.length < villains.length) {
    const failed = statusLog.filter(s => !s.success);
    console.log("Failed characters:", failed.map(f => f.name));
  }
}

main();
