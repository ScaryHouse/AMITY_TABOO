/**
 * Amity Games Taboo (accessible Taboo prompt player)
 *
 * SHEETS EXPECTED:
 * - ADMIN: settings
 * - Cards: master prompt list with header row:
 *     DIFFICULTY | TARGET | TABOO1..TABOO5 | SOURCE (SOURCE optional)
 */

const ADMIN_SHEET_NAME = 'ADMIN';
const CARDS_SHEET_NAME = 'Cards';

function doGet() {
  // Default to phone-first UI unless explicitly overridden with ?ui=app
  const ui = null;
  const filename = (ui === 'app') ? 'app' : 'phone';
  const html = HtmlService.createHtmlOutputFromFile(filename)
    .setTitle('Amity Games Taboo')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  return html;
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Returns one card at a given sheet row index (2-based; row 1 is header)
 * plus total card count.
 */
function getCard(row) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CARDS_SHEET_NAME);
  if (!sheet) {
    throw new Error(`Missing sheet: ${CARDS_SHEET_NAME}`);
  }

  const lastRow = sheet.getLastRow();
  const total = Math.max(0, lastRow - 1); // exclude header row
  if (total <= 0) {
    return { total: 0, target: '', taboo: [] };
  }

  const safeRow = Math.min(Math.max(2, Number(row) || 2), lastRow);
  const values = sheet.getRange(safeRow, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Expected columns:
  // A: DIFFICULTY, B: TARGET, C..G: TABOO1..TABOO5, H: SOURCE (optional)
  const target = (values[1] ?? '').toString().trim();
  const taboo = [];
  for (let i = 2; i <= 6; i++) {
    const v = (values[i] ?? '').toString().trim();
    if (v) taboo.push(v);
  }

  return {
    total,
    target,
    taboo
  };
}


/**
 * Build a 100-card deck based on ADMIN difficulty percentages.
 * Returns:
 * {
 *   deckId: string,
 *   total: number, // always 100 when possible
 *   cards: [{ index: number, rowId: number, target: string, taboo: string[] }]
 * }
 */
function buildDeck() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const admin = ss.getSheetByName(ADMIN_SHEET_NAME);
  const cardsSheet = ss.getSheetByName(CARDS_SHEET_NAME);
  if (!cardsSheet) throw new Error(`Missing sheet: ${CARDS_SHEET_NAME}`);

  const settings = _readAdminDifficultySettings_(admin);
  const easyPct = settings.easyPct;
  const mediumPct = settings.mediumPct;
  const hardPct = settings.hardPct;

  const lastRow = cardsSheet.getLastRow();
  const lastCol = cardsSheet.getLastColumn();
  if (lastRow < 2) return { deckId: _nonce_(), total: 0, cards: [] };

  const rows = cardsSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  const easy = [];
  const medium = [];
  const hard = [];
  const all = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const difficulty = (r[0] ?? '').toString().trim().toLowerCase();
    const target = (r[1] ?? '').toString().trim();
    const taboo = [];
    for (let t = 2; t <= 6; t++) {
      const v = (r[t] ?? '').toString().trim();
      if (v) taboo.push(v);
    }
    if (!target) continue;

    const rowId = i + 2; // sheet row number

    const card = { rowId, target, taboo };

    all.push(card);

    if (difficulty.includes('easy')) easy.push(card);
    else if (difficulty.includes('med')) medium.push(card);
    else if (difficulty.includes('hard')) hard.push(card);
    else {
      // Unlabeled difficulty goes to general pool
    }
  }

  _shuffleInPlace_(easy);
  _shuffleInPlace_(medium);
  _shuffleInPlace_(hard);

  const targetTotal = 100;

  let easyN = Math.round(targetTotal * (easyPct / 100));
  let mediumN = Math.round(targetTotal * (mediumPct / 100));
  let hardN = targetTotal - easyN - mediumN;

  if (hardN < 0) { hardN = 0; mediumN = targetTotal - easyN; }
  if (mediumN < 0) { mediumN = 0; easyN = targetTotal; }

  const picked = [];
  function take(fromArr, n) {
    while (n > 0 && fromArr.length > 0) {
      picked.push(fromArr.shift());
      n--;
    }
    return n;
  }

  let remEasy = take(easy, easyN);
  let remMed = take(medium, mediumN);
  let remHard = take(hard, hardN);

  // Fill any shortfall from remaining pools, then from all
  const pool = [].concat(easy, medium, hard);
  _shuffleInPlace_(pool);

  let missing = remEasy + remMed + remHard;
  while (missing > 0 && pool.length > 0) {
    picked.push(pool.shift());
    missing--;
  }

  if (missing > 0) {
    _shuffleInPlace_(all);
    const seen = new Set(picked.map(c => c.rowId));
    for (let i = 0; i < all.length && missing > 0; i++) {
      const c = all[i];
      if (seen.has(c.rowId)) continue;
      picked.push(c);
      missing--;
    }
  }

  const deckId = _nonce_();
  const cards = picked.slice(0, targetTotal).map((c, idx) => ({
    index: idx + 1,
    rowId: c.rowId,
    target: c.target,
    taboo: c.taboo
  }));

  return { deckId, total: cards.length, cards };
}

/**
 * Reads ADMIN difficulty percentages with tolerant parsing.
 * Defaults to 34/33/33 if not found or invalid.
 */
function _readAdminDifficultySettings_(adminSheet) {
  const def = { easyPct: 34, mediumPct: 33, hardPct: 33 };
  if (!adminSheet) return def;

  const values = adminSheet.getDataRange().getValues();
  if (!values || values.length === 0) return def;

  // Strategy 1: key/value in first two columns
  const kv = {};
  for (let r = 0; r < values.length; r++) {
    const k = (values[r][0] ?? '').toString().trim().toLowerCase();
    const v = values[r][1];
    if (!k) continue;
    kv[k] = v;
  }

  function num(x) {
    const n = Number(String(x).replace('%','').trim());
    return Number.isFinite(n) ? n : NaN;
  }

  function findPct(name) {
    // look for any key containing name + percent-ish
    const keys = Object.keys(kv);
    for (const k of keys) {
      if (k.includes(name) && (k.includes('%') || k.includes('percent') || k.includes('pct'))) {
        const n = num(kv[k]);
        if (Number.isFinite(n) && n >= 0) return n;
      }
    }
    // look for exact name key
    for (const k of keys) {
      if (k === name || k.includes(name + ' ')) {
        const n = num(kv[k]);
        if (Number.isFinite(n) && n >= 0) return n;
      }
    }
    return NaN;
  }

  let easyPct = findPct('easy');
  let mediumPct = findPct('medium');
  let hardPct = findPct('hard');

  // Strategy 2: header row "Easy/Medium/Hard" with next row values
  if (![easyPct, mediumPct, hardPct].some(Number.isFinite)) {
    const header = values[0].map(x => (x ?? '').toString().trim().toLowerCase());
    const row1 = values[1] || [];
    function headerIdx(term) {
      return header.findIndex(h => h.includes(term));
    }
    const ei = headerIdx('easy');
    const mi = headerIdx('med');
    const hi = headerIdx('hard');
    if (ei >= 0) easyPct = num(row1[ei]);
    if (mi >= 0) mediumPct = num(row1[mi]);
    if (hi >= 0) hardPct = num(row1[hi]);
  }

  if (!Number.isFinite(easyPct)) easyPct = def.easyPct;
  if (!Number.isFinite(mediumPct)) mediumPct = def.mediumPct;
  if (!Number.isFinite(hardPct)) hardPct = def.hardPct;

  // Normalize if totals are off
  let sum = easyPct + mediumPct + hardPct;
  if (!Number.isFinite(sum) || sum <= 0) return def;

  easyPct = (easyPct / sum) * 100;
  mediumPct = (mediumPct / sum) * 100;
  hardPct = (hardPct / sum) * 100;

  return {
    easyPct: Math.round(easyPct),
    mediumPct: Math.round(mediumPct),
    hardPct: Math.max(0, 100 - Math.round(easyPct) - Math.round(mediumPct))
  };
}

function _shuffleInPlace_(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function _nonce_() {
  return Utilities.getUuid();
}
