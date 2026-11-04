// Lecture minimale d'un classeur Excel (.xlsx) dans le navigateur, sans dépendance.
// Un .xlsx est une archive ZIP de fichiers XML : on lit la première feuille
// et on la renvoie sous forme de lignes de cellules (texte).

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function inflateRaw(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Contenu d'une archive ZIP : Map(nom → fonction async qui renvoie le texte). */
function readZip(buf) {
  const b = new Uint8Array(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not-zip');
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const entries = new Map();
  const dec = new TextDecoder();
  for (let n = 0; n < count && u32(b, p) === 0x02014b50; n++) {
    const method = u16(b, p + 10);
    const size = u32(b, p + 20);
    const nameLen = u16(b, p + 28);
    const local = u32(b, p + 42);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + u16(b, p + 30) + u16(b, p + 32);
    entries.set(name, async () => {
      const start = local + 30 + u16(b, local + 26) + u16(b, local + 28);
      const raw = b.subarray(start, start + size);
      return dec.decode(method === 0 ? raw : await inflateRaw(raw));
    });
  }
  return entries;
}

const parseXml = (text) => new DOMParser().parseFromString(text, 'application/xml');
const byTag = (node, tag) => [...node.getElementsByTagNameNS('*', tag)];

function colIndex(ref) {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const DATE_FORMATS = new Set([14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 34, 35, 36, 50, 51, 52, 53, 54, 57, 58]);

function isDateFormat(id, code) {
  if (DATE_FORMATS.has(id)) return true;
  if (!code) return false;
  const c = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
  return /[dmy]/i.test(c) && !/[#0?]/.test(c);
}

function serialToDate(serial) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86400) * 1000);
  const pad = (x) => String(x).padStart(2, '0');
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** Lit la première feuille d'un fichier .xlsx → tableau de lignes (tableaux de chaînes). */
export async function readXlsx(buf) {
  const zip = readZip(buf);
  const text = async (name) => (zip.has(name) ? zip.get(name)() : null);

  // Première feuille du classeur.
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = await text('xl/workbook.xml');
  const rels = await text('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const first = byTag(parseXml(wb), 'sheet')[0];
    const rid = first && [...first.attributes].find((a) => a.localName === 'id')?.value;
    const rel = byTag(parseXml(rels), 'Relationship').find((r) => r.getAttribute('Id') === rid);
    if (rel) {
      const target = rel.getAttribute('Target');
      sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    }
  }
  const sheet = await text(sheetPath);
  if (!sheet) throw new Error('no-sheet');

  const sstXml = await text('xl/sharedStrings.xml');
  const strings = sstXml
    ? byTag(parseXml(sstXml), 'si').map((si) => byTag(si, 't')
      .filter((t) => t.parentNode.localName !== 'rPh')
      .map((t) => t.textContent).join(''))
    : [];

  // Styles : quelles cellules sont des dates ?
  const dateStyles = new Set();
  const stylesXml = await text('xl/styles.xml');
  if (stylesXml) {
    const st = parseXml(stylesXml);
    const codes = new Map(byTag(st, 'numFmt').map((f) => [Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode')]));
    const xfs = byTag(st, 'cellXfs')[0];
    if (xfs) {
      [...xfs.children].forEach((xf, i) => {
        const id = Number(xf.getAttribute('numFmtId') || 0);
        if (isDateFormat(id, codes.get(id))) dateStyles.add(i);
      });
    }
  }

  const rows = [];
  for (const row of byTag(parseXml(sheet), 'row')) {
    const cells = [];
    let next = 0;
    for (const c of byTag(row, 'c')) {
      const ref = c.getAttribute('r');
      const idx = ref ? colIndex(ref) : next;
      next = idx + 1;
      const type = c.getAttribute('t');
      const v = byTag(c, 'v')[0]?.textContent ?? '';
      let value;
      if (type === 's') value = strings[Number(v)] ?? '';
      else if (type === 'inlineStr') value = byTag(c, 't').map((t) => t.textContent).join('');
      else if (type === 'b') value = v === '1' ? 'VRAI' : 'FAUX';
      else if (type === 'str' || type === 'e') value = v;
      else if (v !== '' && dateStyles.has(Number(c.getAttribute('s') || 0))) value = serialToDate(Number(v));
      else value = v;
      cells[idx] = value;
    }
    rows.push(Array.from(cells, (x) => (x ?? '').trim()));
  }
  return rows.filter((r) => r.some((x) => x));
}
