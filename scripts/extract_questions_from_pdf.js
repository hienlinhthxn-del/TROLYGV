import fs from 'fs';
import pdf from 'pdf-parse';

if (process.argv.length < 3) {
  console.error('Usage: node scripts/extract_questions_from_pdf.js <path-to-pdf>');
  process.exit(2);
}

const filePath = process.argv[2];

async function run() {
    const dataBuffer = fs.readFileSync(filePath);
    console.log('Read file:', filePath, 'size=', dataBuffer.length);
    try {
      console.log('Calling pdf-parse...');
      const data = await pdf(dataBuffer);
      console.log('pdf-parse finished: pages=', data.numpages);
    const text = data.text || '';

    // Heuristic parsing: split by question number patterns (e.g., "1.", "1)", "Câu 1.")
    // Normalize line endings
    const normalized = text.replace(/\r\n/g, '\n').replace(/\t/g, ' ').replace(/\u00A0/g, ' ');

    // Try to find a sequence like "1.", "2.", ... up to 100
    const parts = normalized.split(/(?=\n?\s*(?:Câu\s+)?\d+\s*[\.)\-])/gim).map(s => s.trim()).filter(Boolean);

    const questions = [];

    for (const p of parts) {
      // Try to detect number at start
      const m = p.match(/^(?:Câu\s+)?(\d+)\s*[\.)\-]?\s*(.*)$/is);
      if (!m) continue;
      const rest = m[2] || '';

      // Split options by lines that look like A., B., C. or (A) (B)
      const optionSplit = rest.split(/\n(?=[A-D]\.|\([A-D]\)|[A-D]\))/g);
      let questionText = optionSplit[0] || rest;
      const options = [];

      if (optionSplit.length > 1) {
        for (let i = 1; i < optionSplit.length; i++) {
          const opt = optionSplit[i].trim();
          // remove leading A. or (A)
          const t = opt.replace(/^[^A-Za-z0-9]*[A-D]\)?[\.\)]?\s*/i, '').trim();
          options.push({ text: t, image: '' });
        }
      } else {
        // try inline options separated by letters
        const inlineOpts = rest.match(/(?:A[)\.\s]|A\.)\s*([^B]+)/i);
      }

      questions.push({
        id: `q-${m[1]}`,
        type: 'Trắc nghiệm',
        question: questionText.replace(/\n+/g, ' ').trim(),
        image: '',
        options,
        answer: '',
        explanation: ''
      });
    }

    const out = { title: filePath.split('/').pop() || 'extracted', subject: '', questions };
    const outPath = filePath.replace(/\.pdf$/i, '.extracted.json');
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8');
    console.log(`Extracted ${questions.length} question blocks -> ${outPath}`);
    console.log('Sample:', JSON.stringify(questions.slice(0,3), null, 2));
  } catch (e) {
    console.error('PDF parse error:', e);
    process.exit(1);
  }
}

run();
