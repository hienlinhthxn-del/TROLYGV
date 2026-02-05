import fs from 'fs';
const p = process.argv[2];
if (!p) {
  console.error('Usage: node scripts/check_file.js <path>'); process.exit(2);
}
try {
  const exists = fs.existsSync(p);
  console.log('exists:', exists);
  if (exists) {
    const stat = fs.statSync(p);
    console.log('size:', stat.size, 'bytes');
  }
} catch (e) { console.error('err', e); process.exit(1); }
