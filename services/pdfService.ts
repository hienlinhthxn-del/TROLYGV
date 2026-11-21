export interface PdfImage { inlineData: { data: string; mimeType: string }; dataUrl?: string }

const base64ToUint8Array = (data: string) => {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const trimCanvasWhitespace = (sourceCanvas: HTMLCanvasElement) => {
  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) return sourceCanvas;
  const { width, height } = sourceCanvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      if (a > 10 && (r < 245 || g < 245 || b < 245)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (minX >= maxX || minY >= maxY) return sourceCanvas;

  const croppedWidth = maxX - minX + 1;
  const croppedHeight = maxY - minY + 1;
  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = croppedWidth;
  croppedCanvas.height = croppedHeight;
  const croppedCtx = croppedCanvas.getContext('2d');
  if (!croppedCtx) return sourceCanvas;
  croppedCtx.drawImage(sourceCanvas, minX, minY, croppedWidth, croppedHeight, 0, 0, croppedWidth, croppedHeight);
  return croppedCanvas;
};

let cachedPdfWorkerBlobUrl: string | null = null;

const injectScriptTag = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script ${src}`));
    document.head.appendChild(script);
  });

export const loadPdfJsLibrary = async (): Promise<any> => {
  const mainUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const workerUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  if (!(window as any).pdfjsLib) {
    try {
      await injectScriptTag(mainUrl);
    } catch {
      await injectScriptTag('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js');
    }
  }
  if (!(window as any).pdfjsWorker) {
    try {
      await injectScriptTag(workerUrl);
    } catch {
      try {
        await injectScriptTag('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js');
      } catch {
        // Ignore if worker script cannot be injected; blob or fake worker will handle
      }
    }
  }

  let pdfjsLib = (window as any).pdfjsLib;
  if (!pdfjsLib) {
    // @ts-ignore
    const mod = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/+esm');
    pdfjsLib = mod?.default || mod;
  }

  if (!cachedPdfWorkerBlobUrl) {
    try {
      const resp = await fetch(workerUrl);
      if (resp.ok) {
        const workerCode = await resp.text();
        const blob = new Blob([workerCode], { type: 'text/javascript' });
        cachedPdfWorkerBlobUrl = URL.createObjectURL(blob);
      }
    } catch {
      cachedPdfWorkerBlobUrl = workerUrl;
    }
  }

  if (pdfjsLib?.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = cachedPdfWorkerBlobUrl || workerUrl;
  }
  return pdfjsLib;
};

export const convertPdfToImages = async (base64: string, maxPagesLimit = 30): Promise<PdfImage[]> => {
  try {
    const pdfjsLib = await loadPdfJsLibrary();

    const loadingTask = pdfjsLib.getDocument({ data: base64ToUint8Array(base64) });
    const pdf = await loadingTask.promise;
    const images: PdfImage[] = [];
    const maxPages = Math.min(pdf.numPages, maxPagesLimit);
    let scale = 1.5;
    let quality = 0.8;
    if (pdf.numPages > 2) { scale = 1.2; quality = 0.7; }
    if (pdf.numPages > 5) { scale = 1.0; quality = 0.6; }
    if (pdf.numPages > 10) { scale = 0.9; quality = 0.5; }

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: context!, viewport: viewport }).promise;

      const trimmedCanvas = trimCanvasWhitespace(canvas);
      const imgData = trimmedCanvas.toDataURL('image/jpeg', quality);
      const base64Jpeg = imgData.split(',')[1];
      images.push({ inlineData: { data: base64Jpeg, mimeType: 'image/jpeg' }, dataUrl: `data:image/jpeg;base64,${base64Jpeg}` });
    }
    return images;
  } catch (e) {
    console.error('PDF Convert Error:', e);
    return [];
  }
};

export const ocrImages = async (dataUrls: string[], lang = 'vie+eng'): Promise<string[]> => {
  try {
    // Try to use Tesseract if available via CDN
    let Tesseract: any = (window as any).Tesseract;
    if (!Tesseract) {
      try {
        // @ts-ignore
        const mod = await import('https://cdn.jsdelivr.net/npm/tesseract.js@2.1.5/dist/tesseract.min.js');
        Tesseract = (window as any).Tesseract || mod.Tesseract || mod;
      } catch (err) {
        console.warn('Tesseract import failed, OCR disabled', err);
        return dataUrls.map(() => '');
      }
    }

    const results: string[] = [];
    for (let i = 0; i < dataUrls.length; i++) {
      const url = dataUrls[i];
      try {
        const res: any = await Tesseract.recognize(url, lang, { logger: () => { } });
        const text = (res && (res.data?.text || res.text)) ? (res.data?.text || res.text) : '';
        results.push(text.trim());
      } catch (err) {
        console.warn('OCR failed for page', i, err);
        results.push('');
      }
    }
    return results;
  } catch (e) {
    console.error('OCR Error:', e);
    return dataUrls.map(() => '');
  }
};
