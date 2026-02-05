import fs from 'fs';
import pdf from 'pdf-parse';
const p = process.argv[2];
if (!p) { console.error('Usage: node scripts/dump_pdf_text.js <pdf>'); process.exit(2); }
const buf = fs.readFileSync(p);
(async()=>{
  const data = await pdf(buf);
  console.log('pages:', data.numpages);
  const text = data.text || '';
  // Show first 5000 chars
  console.log('\n--- TEXT PREVIEW (first 5000 chars) ---\n');
  console.log(text.slice(0,5000));
  // Also print a split by pages (rough)
  const pages = text.split('\n\n').slice(0,10).map((s,i)=>`--- PAGE_SPLIT ${i+1} ---\n${s.slice(0,500)}`);
  console.log('\n--- ROUGH PAGE SPLITS ---\n', pages.join('\n'));
})();