function preferredTheme() {
  var saved = window.localStorage.getItem('shanepedia-theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  var toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
    toggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  }
}

function initializeThemeToggle() {
  applyTheme(preferredTheme());
  var toggle = document.getElementById('theme-toggle');
  if (!toggle) return;
  toggle.addEventListener('click', function() {
    var nextTheme = (document.documentElement.dataset.theme || preferredTheme()) === 'dark' ? 'light' : 'dark';
    window.localStorage.setItem('shanepedia-theme', nextTheme);
    applyTheme(nextTheme);
  });
}

async function loadSearch() {
  var prefix = window.SHANEPEDIA_ROOT_PREFIX || '';
  var res = await fetch(prefix + 'search-index.json');
  return await res.json();
}

function renderResults(results) {
  var list = document.getElementById('results');
  var meta = document.getElementById('searchmeta');
  if (!list) return;
  list.replaceChildren();
  if (!results.length) { meta.textContent = ''; return; }
  meta.textContent = results.length + ' result' + (results.length === 1 ? '' : 's');
  var ul = document.createElement('ul');
  results.forEach(function(item) {
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = item.href;
    a.textContent = item.title;
    li.appendChild(a);
    var path = document.createElement('div');
    path.className = 'result-path';
    path.textContent = item.path;
    li.appendChild(path);
    ul.appendChild(li);
  });
  list.appendChild(ul);
}

function activateCurrentNav() {
  document.querySelectorAll('.sidebar a').forEach(function(link) {
    try {
      var resolved = new URL(link.getAttribute('href'), window.location.href);
      if (resolved.pathname === window.location.pathname) {
        link.classList.add('current-page');
      }
    } catch (_) {}
  });
}

initializeThemeToggle();
activateCurrentNav();

loadSearch().then(function(index) {
  var input = document.getElementById('search');
  if (!input) return;
  input.addEventListener('input', function() {
    var q = input.value.trim().toLowerCase();
    if (!q) return renderResults([]);
    var ranked = index
      .map(function(item) {
        var hay = (item.title + ' ' + item.summary + ' ' + item.text).toLowerCase();
        var score = q.split(/\s+/).reduce(function(acc, term) { return acc + (hay.includes(term) ? 1 : 0); }, 0);
        return { item: item, score: score };
      })
      .filter(function(row) { return row.score > 0; })
      .sort(function(a, b) { return b.score - a.score || a.item.title.localeCompare(b.item.title); })
      .map(function(row) { return row.item; })
      .slice(0, 15);
    renderResults(ranked);
  });
}).catch(function(error) {
  console.error('Shanepedia search failed to load', error);
});
