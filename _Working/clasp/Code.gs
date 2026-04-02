function getConfig() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Cards");

  const total = Number(sheet.getRange("B1").getValue());
  const easyPct = Number(sheet.getRange("B2").getValue()) / 100;
  const mediumPct = Number(sheet.getRange("B3").getValue()) / 100;
  const hardPct = Number(sheet.getRange("B4").getValue()) / 100;
  const deckSize = Number(sheet.getRange("B5").getValue());

  return { total, easyPct, mediumPct, hardPct, deckSize };
}

function getCards() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Cards");
  const data = sheet.getRange(8, 1, sheet.getLastRow() - 7, 7).getValues();

  return data
    .filter(r => r[1])
    .map(r => ({
      difficulty: String(r[0]).toLowerCase(),
      target: r[1],
      taboo: [r[2], r[3], r[4], r[5], r[6]].filter(Boolean)
    }));
}

function buildDeck_() {
  const { easyPct, mediumPct, hardPct, deckSize } = getConfig();
  const cards = getCards();

  const easy = cards.filter(c => c.difficulty === 'easy');
  const medium = cards.filter(c => c.difficulty === 'medium');
  const hard = cards.filter(c => c.difficulty === 'hard');

  function shuffle_(a) {
    const arr = a.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function take(pool, count) {
    return shuffle_(pool).slice(0, count);
  }

  let easyCount = Math.round(deckSize * easyPct);
  let mediumCount = Math.round(deckSize * mediumPct);
  let hardCount = Math.round(deckSize * hardPct);

  let totalPicked = easyCount + mediumCount + hardCount;

  while (totalPicked < deckSize) {
    easyCount++;
    totalPicked++;
  }

  const deck = [
    ...take(easy, easyCount),
    ...take(medium, mediumCount),
    ...take(hard, hardCount)
  ];

  return shuffle_(deck).slice(0, deckSize);
}
