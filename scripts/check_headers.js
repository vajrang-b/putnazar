import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('assets/villains');
const files = fs.readdirSync(dir);
for (const f of files) {
  const buf = fs.readFileSync(path.join(dir, f));
  const isJpg = buf[0] === 0xFF && buf[1] === 0xD8;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  const isWebp = buf.slice(8, 12).toString() === 'WEBP';
  const isValid = isJpg || isPng || isWebp;
  console.log(f, isValid ? 'VALID' : 'INVALID HEADER', (buf.length / 1024).toFixed(1) + 'KB');
}
