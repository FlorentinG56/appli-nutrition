// Photo → code-barres (ZXing) ou texte (Tesseract), tout se passe dans le téléphone.
// Les bibliothèques sont dans le dossier vendor/ et ne sont chargées qu'au premier usage.
import { offToFood } from './label.js';

const base = new URL('../', import.meta.url).href; // racine de l'appli
const loaded = {};
function loadScript(path) {
  loaded[path] ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = base + path;
    s.onload = resolve;
    s.onerror = () => { delete loaded[path]; reject(new Error('Chargement impossible (connexion ?)')); };
    document.head.append(s);
  });
  return loaded[path];
}

// Charge la photo, la réduit et la passe en niveaux de gris contrastés (meilleure lecture).
async function fileToCanvas(file, maxSide = 2000, enhance = false) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Photo illisible'));
      i.src = url;
    });
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, c.width, c.height);
    if (enhance) {
      const d = ctx.getImageData(0, 0, c.width, c.height);
      const px = d.data;
      let min = 255, max = 0;
      const gray = new Uint8ClampedArray(px.length / 4);
      for (let i = 0, j = 0; i < px.length; i += 4, j++) {
        const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        gray[j] = g;
        if (g < min) min = g;
        if (g > max) max = g;
      }
      const range = Math.max(1, max - min);
      for (let i = 0, j = 0; i < px.length; i += 4, j++) {
        const v = ((gray[j] - min) / range) * 255;
        px[i] = px[i + 1] = px[i + 2] = v;
      }
      ctx.putImageData(d, 0, 0);
    }
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function rotate(canvas, deg) {
  const c = document.createElement('canvas');
  const swap = deg % 180 !== 0;
  c.width = swap ? canvas.height : canvas.width;
  c.height = swap ? canvas.width : canvas.height;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return c;
}

// ---------- Code-barres ----------
export async function readBarcode(file) {
  await loadScript('vendor/zxing/zxing.min.js');
  const Z = window.ZXing;
  const hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const reader = new Z.MultiFormatReader();
  reader.setHints(hints);
  // Plusieurs essais : tailles et orientations différentes.
  for (const size of [1400, 900, 2200]) {
    const c0 = await fileToCanvas(file, size);
    for (const deg of [0, 90]) {
      const c = deg ? rotate(c0, deg) : c0;
      try {
        const src = new Z.HTMLCanvasElementLuminanceSource(c);
        const res = reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(src)));
        let code = res.getText();
        if (code.length === 12) code = '0' + code; // UPC-A → EAN-13
        return code;
      } catch { /* on essaie la variante suivante */ }
    }
  }
  return null;
}

// Fiche produit sur Open Food Facts (base publique et gratuite). null si inconnu.
export async function lookupBarcode(code) {
  const fields = 'product_name,product_name_fr,brands,nutriments,nova_group,serving_quantity,ingredients_text,ingredients_text_fr';
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts ne répond pas (${res.status})`);
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;
  const food = offToFood(data.product);
  return food.kcal == null && food.p == null ? { ...food, incomplete: true } : food;
}

// ---------- Lecture de texte (tableau nutritionnel, ingrédients) ----------
let workerPromise = null;
export async function readText(file, onProgress) {
  await loadScript('vendor/tesseract/tesseract.min.js');
  if (!workerPromise) {
    workerPromise = window.Tesseract.createWorker('fra', 1, {
      workerPath: base + 'vendor/tesseract/worker.min.js',
      corePath: base + 'vendor/tesseract/core/',
      langPath: base + 'vendor/tesseract/lang',
      gzip: true,
      logger: (m) => workerPromise.progress?.(m),
    }).catch((e) => { workerPromise = null; throw e; });
  }
  workerPromise.progress = (m) => {
    if (!onProgress) return;
    if (m.status === 'recognizing text') onProgress(`Lecture du texte… ${Math.round(m.progress * 100)} %`);
    else onProgress('Préparation de la lecture (la première fois, quelques secondes)…');
  };
  const worker = await workerPromise;
  const canvas = await fileToCanvas(file, 2000, true);
  const { data } = await worker.recognize(canvas);
  return data.text || '';
}
