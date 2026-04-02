/**
 * Amity Games Taboo
 *
 * Sheets expected in the bound spreadsheet:
 * 1. ADMIN - optional difficulty mix settings.
 * 2. Cards - prompt source with a header row.
 *
 * Cards columns:
 * A = DIFFICULTY
 * B = TARGET
 * C:G = TABOO1:TABOO5
 * H = SOURCE (optional)
 */

const ADMIN_SHEET_NAME = 'ADMIN';
const CARDS_SHEET_NAME = 'Cards';
const TARGET_DECK_SIZE = 100;

/**
 * Routes either to the phone UI or to the JSON deck API.
 *
 * Supported query parameters:
 * - ?api=deck  -> returns a freshly built deck as JSON
 * - default    -> serves phone.html
 */
function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};

  if (params.api === 'deck') {
    return ContentService
      .createTextOutput(JSON.stringify(buildDeck()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return HtmlService.createHtmlOutputFromFile('phone')
    .setTitle('Amity Taboo')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Builds one shuffled deck from the Cards sheet.
 *
 * When ADMIN percentages are available, the picker tries to honor them.
 * If a pool runs short, the builder fills from the remaining cards.
 *
 * Return shape:
 * {
 *   deckId: string,
 *   total: number,
 *   cards: [{ index, rowId, target, taboo }]
 * }
 */
function buildDeck() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const adminSheet = ss.getSheetByName(ADMIN_SHEET_NAME);
  const cardsSheet = ss.getSheetByName(CARDS_SHEET_NAME);

  if (!cardsSheet) {
    throw new Error(`Missing sheet: ${CARDS_SHEET_NAME}`);
  }

  const lastRow = cardsSheet.getLastRow();
  const lastCol = cardsSheet.getLastColumn();
  if (lastRow < 2) {
    return { deckId: _nonce_(), total: 0, cards: [] };
  }

  const settings = _readAdminDifficultySettings_(adminSheet);
  const sourceRows = cardsSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  const pools = {
    easy: [],
    medium: [],
    hard: [],
    all: []
  };

  sourceRows.forEach((row, index) => {
    const card = _cardFromSheetRow_(row, index + 2);
    if (!card) {
      return;
    }

    pools.all.push(card);

    if (card.difficulty.includes('easy')) {
      pools.easy.push(card);
    } else if (card.difficulty.includes('med')) {
      pools.medium.push(card);
    } else if (card.difficulty.includes('hard')) {
      pools.hard.push(card);
    }
  });

  _shuffleInPlace_(pools.easy);
  _shuffleInPlace_(pools.medium);
  _shuffleInPlace_(pools.hard);

  const requestedCounts = _getDifficultyPickCounts_(settings, TARGET_DECK_SIZE);
  const picked = [];

  const remaining = {
    easy: _takeCards_(picked, pools.easy, requestedCounts.easy),
    medium: _takeCards_(picked, pools.medium, requestedCounts.medium),
    hard: _takeCards_(picked, pools.hard, requestedCounts.hard)
  };

  let missing = remaining.easy + remaining.medium + remaining.hard;

  if (missing > 0) {
    const fallbackPool = [].concat(pools.easy, pools.medium, pools.hard);
    _shuffleInPlace_(fallbackPool);
    missing = _takeCards_(picked, fallbackPool, missing);
  }

  if (missing > 0) {
    _shuffleInPlace_(pools.all);
    const seenRowIds = new Set(picked.map(card => card.rowId));
    for (let i = 0; i < pools.all.length && missing > 0; i++) {
      const card = pools.all[i];
      if (seenRowIds.has(card.rowId)) {
        continue;
      }
      picked.push(card);
      seenRowIds.add(card.rowId);
      missing--;
    }
  }

  const cards = picked.slice(0, TARGET_DECK_SIZE).map((card, index) => ({
    index: index + 1,
    rowId: card.rowId,
    target: card.target,
    taboo: card.taboo
  }));

  return {
    deckId: _nonce_(),
    total: cards.length,
    cards
  };
}

/**
 * Converts one sheet row into a normalized card object.
 * Returns null when the row does not contain a target prompt.
 */
function _cardFromSheetRow_(row, rowId) {
  const difficulty = (row[0] ?? '').toString().trim().toLowerCase();
  const target = (row[1] ?? '').toString().trim();
  if (!target) {
    return null;
  }

  const taboo = [];
  for (let columnIndex = 2; columnIndex <= 6; columnIndex++) {
    const value = (row[columnIndex] ?? '').toString().trim();
    if (value) {
      taboo.push(value);
    }
  }

  return {
    rowId,
    difficulty,
    target,
    taboo
  };
}

/**
 * Calculates how many cards to request from each difficulty pool.
 */
function _getDifficultyPickCounts_(settings, deckSize) {
  let easy = Math.round(deckSize * (settings.easyPct / 100));
  let medium = Math.round(deckSize * (settings.mediumPct / 100));
  let hard = deckSize - easy - medium;

  if (hard < 0) {
    hard = 0;
    medium = deckSize - easy;
  }
  if (medium < 0) {
    medium = 0;
    easy = deckSize;
  }

  return { easy, medium, hard };
}

/**
 * Moves up to n cards from one pool into the destination array.
 * Returns the remaining unfilled count.
 */
function _takeCards_(destination, source, n) {
  while (n > 0 && source.length > 0) {
    destination.push(source.shift());
    n--;
  }
  return n;
}

/**
 * Reads ADMIN difficulty percentages with tolerant parsing.
 * Defaults to 34/33/33 when settings are missing or invalid.
 */
function _readAdminDifficultySettings_(adminSheet) {
  const defaults = { easyPct: 34, mediumPct: 33, hardPct: 33 };
  if (!adminSheet) {
    return defaults;
  }

  const values = adminSheet.getDataRange().getValues();
  if (!values || values.length === 0) {
    return defaults;
  }

  const keyValueSettings = {};
  values.forEach(row => {
    const key = (row[0] ?? '').toString().trim().toLowerCase();
    if (!key) {
      return;
    }
    keyValueSettings[key] = row[1];
  });

  function toPercentNumber(value) {
    const parsed = Number(String(value).replace('%', '').trim());
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function findPercent(name) {
    const keys = Object.keys(keyValueSettings);

    for (const key of keys) {
      const looksLikePercentKey = key.includes('%') || key.includes('percent') || key.includes('pct');
      if (key.includes(name) && looksLikePercentKey) {
        const parsed = toPercentNumber(keyValueSettings[key]);
        if (Number.isFinite(parsed) && parsed >= 0) {
          return parsed;
        }
      }
    }

    for (const key of keys) {
      if (key === name || key.includes(name + ' ')) {
        const parsed = toPercentNumber(keyValueSettings[key]);
        if (Number.isFinite(parsed) && parsed >= 0) {
          return parsed;
        }
      }
    }

    return NaN;
  }

  let easyPct = findPercent('easy');
  let mediumPct = findPercent('medium');
  let hardPct = findPercent('hard');

  if (![easyPct, mediumPct, hardPct].some(Number.isFinite) && values.length > 1) {
    const headerRow = values[0].map(cell => (cell ?? '').toString().trim().toLowerCase());
    const firstDataRow = values[1] || [];

    function headerIndex(term) {
      return headerRow.findIndex(header => header.includes(term));
    }

    const easyIndex = headerIndex('easy');
    const mediumIndex = headerIndex('med');
    const hardIndex = headerIndex('hard');

    if (easyIndex >= 0) easyPct = toPercentNumber(firstDataRow[easyIndex]);
    if (mediumIndex >= 0) mediumPct = toPercentNumber(firstDataRow[mediumIndex]);
    if (hardIndex >= 0) hardPct = toPercentNumber(firstDataRow[hardIndex]);
  }

  if (!Number.isFinite(easyPct)) easyPct = defaults.easyPct;
  if (!Number.isFinite(mediumPct)) mediumPct = defaults.mediumPct;
  if (!Number.isFinite(hardPct)) hardPct = defaults.hardPct;

  const total = easyPct + mediumPct + hardPct;
  if (!Number.isFinite(total) || total <= 0) {
    return defaults;
  }

  easyPct = (easyPct / total) * 100;
  mediumPct = (mediumPct / total) * 100;
  hardPct = (hardPct / total) * 100;

  return {
    easyPct: Math.round(easyPct),
    mediumPct: Math.round(mediumPct),
    hardPct: Math.max(0, 100 - Math.round(easyPct) - Math.round(mediumPct))
  };
}

/** Fisher-Yates shuffle. */
function _shuffleInPlace_(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
  return array;
}

function _nonce_() {
  return Utilities.getUuid();
}
