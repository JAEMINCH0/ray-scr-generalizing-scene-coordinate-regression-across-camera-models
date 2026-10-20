// Restore the chosen theme before the page is painted.
(() => {
  let theme = 'dark';
  try {
    if (localStorage.getItem('ray-scr-theme') === 'light') theme = 'light';
  } catch {
    // Storage may be unavailable; the toggle still works for this visit.
  }
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content =
    theme === 'light' ? '#ffffff' : '#090909';
})();
