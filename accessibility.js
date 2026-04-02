(function () {
  function ensureLiveRegion() {
    let region = document.getElementById('sr-live');
    if (!region) {
      region = document.createElement('div');
      region.id = 'sr-live';
      region.setAttribute('aria-live', 'assertive');
      region.setAttribute('aria-atomic', 'true');
      region.style.position = 'absolute';
      region.style.left = '-9999px';
      document.body.appendChild(region);
    }
    return region;
  }

  function getCardData() {
    // USE APP STATE — NOT DOM TEXT GUESSING
    if (!window.currentDeck || !window.currentIndex) return null;

    const card = window.currentDeck[window.currentIndex];
    if (!card) return null;

    return {
      index: window.currentIndex + 1,
      total: window.currentDeck.length,
      target: card.target,
      taboo: card.taboo
    };
  }

  function announce() {
    const region = ensureLiveRegion();
    const data = getCardData();

    if (!data) return;

    const text =
      'Card ' + data.index + ' of ' + data.total + '. ' +
      'Target word: ' + data.target + '. ' +
      'Taboo words: ' + data.taboo.join(', ');

    region.textContent = '';
    setTimeout(() => {
      region.textContent = text;
    }, 50);
  }

  function hookNavigation() {
    window.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        setTimeout(announce, 100);
      }
    });
  }

  function hookInit() {
    setTimeout(announce, 300);
  }

  window.addEventListener('DOMContentLoaded', function () {
    ensureLiveRegion();
    hookNavigation();
    hookInit();
  });
})();
