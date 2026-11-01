import fs from 'node:fs';
import path from 'node:path';

const villains = [
  'khadra', 'darkha', 'marthanda', 'bhairav', 'ghora', 'pasupathi', 'mahendra_varma', 'the_tantrik',
  'tantrik_swamiji', 'dr_rudra_ancestor', 'pandi_sorcerers', 'raj_nayak',
  'saamri', 'bhairavnath', 'gorakhnath', 'lajja_shankar', 'vanraj',
  'digambara', 'ohmkar', 'brahmashri_mantrik',
  'lo_pan', 'imhotep', 'lord_blackwood', 'bathsheba', 'mother_malkin', 'black_phillip'
];

console.log('Total characters:', villains.length);
let allOk = true;
for (const id of villains) {
  const filePath = path.resolve('assets/villains', `${id}.jpg`);
  if (!fs.existsSync(filePath)) {
    console.log(`[MISSING] ${id}.jpg`);
    allOk = false;
  } else {
    const sz = fs.statSync(filePath).size;
    console.log(`[OK] ${id}.jpg - ${(sz / 1024).toFixed(1)} KB`);
  }
}
console.log('All present?', allOk);
