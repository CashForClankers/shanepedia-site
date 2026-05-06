// No innerHTML is used — all snippet content is built via DOM APIs to avoid XSS.

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

function activateCurrentNav() {
  var currentPath = window.location.pathname;
  document.querySelectorAll('.sidebar a').forEach(function(link) {
    try {
      var resolved = new URL(link.getAttribute('href'), window.location.href);
      if (resolved.pathname === currentPath) {
        link.classList.add('current-page');
        var details = link.closest('details.nav-group');
        if (details) details.open = true;
      }
    } catch (_) {}
  });
}

function scoreItem(item, terms) {
  var t = item.title.toLowerCase();
  var g = (item.tags || []).join(' ').toLowerCase();
  var s = (item.summary || '').toLowerCase();
  var b = (item.text || '').toLowerCase();
  var score = 0;
  terms.forEach(function(term) {
    if (!term) return;
    if (t.includes(term)) score += 5;
    if (g.includes(term)) score += 3;
    if (s.includes(term)) score += 2;
    if (b.includes(term)) score += 1;
  });
  return score;
}

function buildSnippetNode(text, terms) {
  if (!text || !terms.length) return null;
  var lower = text.toLowerCase();
  var best = -1;
  for (var i = 0; i < terms.length; i++) {
    var idx = lower.indexOf(terms[i]);
    if (idx !== -1 && (best === -1 || idx < best)) best = idx;
  }
  if (best === -1) return null;
  var s0 = Math.max(0, best - 50);
  var s1 = Math.min(text.length, best + 140);
  var snip = text.slice(s0, s1);
  var snipLow = lower.slice(s0, s1);
  var marks = [];
  terms.forEach(function(t) {
    var p = 0;
    while (p < snipLow.length) {
      var i = snipLow.indexOf(t, p);
      if (i === -1) break;
      marks.push([i, i + t.length]);
      p = i + 1;
    }
  });
  marks.sort(function(a, b) { return a[0] - b[0]; });
  var merged = [];
  marks.forEach(function(m) {
    if (merged.length && m[0] <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], m[1]);
    } else { merged.push(m.slice()); }
  });
  var wrap = document.createElement('div');
  wrap.className = 'result-snippet';
  if (s0 > 0) wrap.appendChild(document.createTextNode('\u2026'));
  var cur = 0;
  merged.forEach(function(m) {
    if (m[0] > cur) wrap.appendChild(document.createTextNode(snip.slice(cur, m[0])));
    var mk = document.createElement('mark');
    mk.textContent = snip.slice(m[0], m[1]);
    wrap.appendChild(mk);
    cur = m[1];
  });
  if (cur < snip.length) wrap.appendChild(document.createTextNode(snip.slice(cur)));
  if (s1 < text.length) wrap.appendChild(document.createTextNode('\u2026'));
  return wrap;
}

function renderResults(results, terms, metaText) {
  var list = document.getElementById('results');
  var meta = document.getElementById('searchmeta');
  if (!list) return;
  list.replaceChildren();
  if (!results.length) { if (meta) meta.textContent = metaText || ''; return; }
  if (meta) meta.textContent = metaText || (results.length + ' result' + (results.length === 1 ? '' : 's'));
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
    if (terms && terms.length) {
      var snip = buildSnippetNode(item.text || '', terms);
      if (snip) li.appendChild(snip);
    }
    ul.appendChild(li);
  });
  list.appendChild(ul);
}

var activeTag = null;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function hashString(value) {
  var hash = 0;
  for (var i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function parseHomeDate(value) {
  if (!value) return 0;
  var parsed = Date.parse(value.length === 10 ? value + 'T00:00:00' : value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function loadHomeState() {
  try {
    var raw = window.localStorage.getItem('shanepedia-home-state-v1');
    var parsed = raw ? JSON.parse(raw) : {};
    return {
      visits: parsed.visits || {},
      sections: parsed.sections || {}
    };
  } catch (_) {
    return { visits: {}, sections: {} };
  }
}

function saveHomeState(state) {
  try {
    window.localStorage.setItem('shanepedia-home-state-v1', JSON.stringify(state));
  } catch (_) {}
}

function pruneOldVisits(visits) {
  var now = Date.now();
  Object.keys(visits).forEach(function(path) {
    if (now - visits[path] > 1000 * 60 * 60 * 24 * 45) delete visits[path];
  });
}

function extractYouTubeId(url) {
  if (!url) return '';
  var match = String(url).match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : '';
}

function createYouTubePreview(id, title) {
  if (!id) return null;
  var wrap = document.createElement('div');
  wrap.className = 'youtube-preview';
  wrap.dataset.youtubeId = id;
  wrap.dataset.youtubeTitle = title || 'YouTube spark';

  var image = document.createElement('img');
  image.src = 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
  image.alt = title ? title + ' preview' : 'YouTube video preview';
  image.loading = 'lazy';
  wrap.appendChild(image);

  var button = document.createElement('button');
  button.className = 'youtube-preview-button';
  button.type = 'button';
  button.setAttribute('aria-label', 'Play ' + (title || 'YouTube spark'));
  var play = document.createElement('span');
  play.textContent = 'Play';
  button.appendChild(play);
  wrap.appendChild(button);

  var caption = document.createElement('span');
  caption.className = 'youtube-preview-title';
  caption.textContent = title || 'YouTube spark';
  wrap.appendChild(caption);
  return wrap;
}

function playYouTubePreview(wrap) {
  var id = wrap && wrap.dataset ? wrap.dataset.youtubeId : '';
  if (!id) return;
  var title = wrap.dataset.youtubeTitle || 'YouTube video player';
  var iframe = document.createElement('iframe');
  iframe.src = 'https://www.youtube.com/embed/' + id + '?autoplay=1&rel=0';
  iframe.title = title;
  iframe.loading = 'lazy';
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  iframe.allowFullscreen = true;
  wrap.replaceChildren(iframe);
}

function hydrateYouTubePreviews(scope) {
  (scope || document).querySelectorAll('.youtube-preview').forEach(function(wrap) {
    if (wrap.dataset.youtubeReady === 'true') return;
    wrap.dataset.youtubeReady = 'true';
    var button = wrap.querySelector('.youtube-preview-button');
    if (button) {
      button.addEventListener('click', function() {
        playYouTubePreview(wrap);
      });
    }
  });
}

function initializeCheckIn() {
  var note = document.getElementById('home-checkin-note');
  var save = document.getElementById('home-checkin-save');
  var clear = document.getElementById('home-checkin-clear');
  var status = document.getElementById('home-checkin-status');
  if (!note || !save) return;
  var storageKey = 'shanepedia-home-checkin-v1';
  try {
    var saved = JSON.parse(window.localStorage.getItem(storageKey) || '{}');
    if (saved.text) note.value = saved.text;
    if (saved.savedAt && status) status.textContent = 'Saved ' + saved.savedAt;
  } catch (_) {}
  save.addEventListener('click', function() {
    var stamp = new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ text: note.value, savedAt: stamp }));
      if (status) status.textContent = 'Saved ' + stamp;
    } catch (_) {
      if (status) status.textContent = 'Could not save locally';
    }
  });
  if (clear) {
    clear.addEventListener('click', function() {
      note.value = '';
      try { window.localStorage.removeItem(storageKey); } catch (_) {}
      if (status) status.textContent = 'Cleared';
    });
  }
}

function trackVisits() {
  var state = loadHomeState();
  pruneOldVisits(state.visits);
  state.visits[window.location.pathname] = Date.now();
  saveHomeState(state);
  document.addEventListener('click', function(e) {
    var link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!link) return;
    var href = link.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:')) return;
    try {
      var resolved = new URL(href, window.location.href);
      if (resolved.origin !== window.location.origin) return;
      var nextState = loadHomeState();
      pruneOldVisits(nextState.visits);
      nextState.visits[resolved.pathname] = Date.now();
      saveHomeState(nextState);
    } catch (_) {}
  });
}

function personalizeHomeSections() {
  var home = document.querySelector('.home-page');
  if (!home) return;
  var state = loadHomeState();
  pruneOldVisits(state.visits);
  var today = todayKey();
  var now = Date.now();

  // ── Unified Discovery Stream (Infinite Scroll) ──
  var streamList = document.querySelector('#discovery-stream .home-list');
  if (streamList) {
    loadSearch().then(function(index) {
      // Create a unified stream of all content
      var stream = index.map(function(item) {
        var score = scoreHomeItem({
          dataset: {
            homeRank: '0',
            homeDate: item.surface_date || '',
            homePath: item.path,
            homeKey: item.path
          }
        }, 'discovery', today, now, state.visits, {});
        return { item: item, score: score };
      }).sort(function(a, b) { return b.score - a.score; });

      var pageSize = 12;
      var loadedCount = 0;

      function loadMore() {
        var nextBatch = stream.slice(loadedCount, loadedCount + pageSize);
        nextBatch.forEach(function(row) {
          var item = row.item;
          var li = document.createElement('li');
          li.className = 'home-item';
          li.dataset.homeKey = item.path;
          li.dataset.homePath = item.path;

          var group = item.group_label || 'Main';
          var summary = (item.summary || '').slice(0, 180);

          var kicker = document.createElement('span');
          kicker.className = 'home-item-kicker';
          kicker.textContent = group;
          li.appendChild(kicker);

          var top = document.createElement('div');
          top.className = 'home-item-top';
          var main = document.createElement('div');
          main.className = 'home-item-main';
          var link = document.createElement('a');
          link.href = item.href;
          link.textContent = item.title;
          main.appendChild(link);
          top.appendChild(main);
          var meta = document.createElement('span');
          meta.className = 'home-item-meta';
          meta.textContent = item.surface_date || '';
          top.appendChild(meta);
          li.appendChild(top);

          if (summary) {
            var summaryNode = document.createElement('p');
            summaryNode.className = 'home-item-summary';
            summaryNode.textContent = summary;
            li.appendChild(summaryNode);
          }

          var ytId = extractYouTubeId(item.youtube_url || '');
          var preview = createYouTubePreview(ytId, item.title);
          if (preview) li.appendChild(preview);

          streamList.appendChild(li);
        });
        hydrateYouTubePreviews(streamList);
        loadedCount += nextBatch.length;
        if (loadedCount >= stream.length) {
          window.removeEventListener('scroll', handleScroll);
          var end = document.createElement('p');
          end.className = 'stream-end';
          end.textContent = 'You have reached the end of the stream.';
          streamList.parentElement.appendChild(end);
        }
      }

      function handleScroll() {
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
          loadMore();
        }
      }

      window.addEventListener('scroll', handleScroll);
      loadMore(); // Initial load
    });
  }

  home.querySelectorAll('.home-section[data-home-section]:not(#discovery-stream)').forEach(function(section) {
    if (section.dataset.personalize === 'false') return;
    var sectionId = section.dataset.homeSection || '';
    var limit = parseInt(section.dataset.displayLimit || '0', 10);
    if (!sectionId || !limit) return;
    var list = section.querySelector('.home-list');
    if (!list) return;
    var items = Array.prototype.slice.call(list.querySelectorAll('.home-item'));
    if (!items.length) return;
    var history = state.sections[sectionId] || [];
    history = history.filter(function(entry) { return entry && entry.day && entry.shown; }).slice(-4);
    var recentlySurfaced = {};
    history.forEach(function(entry) {
      if (entry.day === today) return;
      (entry.shown || []).forEach(function(key) { recentlySurfaced[key] = true; });
    });
    items.sort(function(a, b) {
      return scoreHomeItem(b, sectionId, today, now, state.visits, recentlySurfaced) - scoreHomeItem(a, sectionId, today, now, state.visits, recentlySurfaced);
    });
    items.forEach(function(item, index) {
      list.appendChild(item);
      var visible = index < limit;
      item.dataset.homeVisible = visible ? 'true' : 'false';
      item.dataset.homeFresh = '';
      if (visible && state.visits[item.dataset.homePath]) item.dataset.homeFresh = 'return';
    });
    var shownKeys = items.slice(0, limit).map(function(item) { return item.dataset.homeKey; });
    history = history.filter(function(entry) { return entry.day !== today; });
    history.push({ day: today, shown: shownKeys });
    state.sections[sectionId] = history.slice(-4);
  });
  saveHomeState(state);
}

function scoreHomeItem(item, sectionId, today, now, visits, recentlySurfaced) {
  var score = 1000 - (parseInt(item.dataset.homeRank || '0', 10) * 28);
  var dateValue = parseHomeDate(item.dataset.homeDate || '');
  if (dateValue) {
    var ageDays = Math.floor((now - dateValue) / (1000 * 60 * 60 * 24));
    if (ageDays <= 2) score += 140;
    else if (ageDays <= 7) score += 90;
    else if (ageDays <= 21) score += 40;
  }
  var visitTs = visits[item.dataset.homePath || ''] || 0;
  if (visitTs) {
    var daysSinceVisit = Math.floor((now - visitTs) / (1000 * 60 * 60 * 24));
    if (daysSinceVisit <= 1) score -= 260;
    else if (daysSinceVisit <= 6) score -= 130;
    else if (daysSinceVisit <= 20) score -= 55;
  }
  if (recentlySurfaced[item.dataset.homeKey || '']) score -= 110;
  score += hashString(today + '|' + sectionId + '|' + (item.dataset.homeKey || '')) % 67;
  return score;
}

function buildTagCloud(index) {
  var cloud = document.getElementById('tag-cloud');
  if (!cloud) return;
  var browser = cloud.closest('.tag-browser');
  var counts = {};
  index.forEach(function(item) {
    (item.tags || []).forEach(function(tag) { counts[tag] = (counts[tag] || 0) + 1; });
  });
  var tags = Object.keys(counts).sort();
  if (!tags.length) return;
  var label = document.createElement('span');
  label.className = 'tag-cloud-label';
  label.textContent = 'Popular tags';
  cloud.appendChild(label);
  tags.forEach(function(tag) {
    var btn = document.createElement('button');
    btn.className = 'tag-pill';
    btn.dataset.tag = tag;
    btn.textContent = tag;
    btn.title = counts[tag] + ' page' + (counts[tag] === 1 ? '' : 's');
    btn.addEventListener('click', function() {
      if (browser) browser.open = true;
      activeTag = (activeTag === tag) ? null : tag;
      document.querySelectorAll('#tag-cloud .tag-pill').forEach(function(p) {
        p.classList.toggle('active', p.dataset.tag === activeTag);
      });
      var input = document.getElementById('search');
      if (activeTag) {
        if (input) input.value = '';
        var matched = index
          .filter(function(item) { return (item.tags || []).includes(activeTag); })
          .sort(function(a, b) { return a.title.localeCompare(b.title); });
        renderResults(matched, [], matched.length + ' page' + (matched.length === 1 ? '' : 's') + ' tagged \u201c' + activeTag + '\u201d');
      } else {
        renderResults([], [], '');
      }
    });
    cloud.appendChild(btn);
  });
}

async function loadSearch() {
  var prefix = window.SHANEPEDIA_ROOT_PREFIX || '';
  var res = await fetch(prefix + 'search-index.json');
  return await res.json();
}

initializeThemeToggle();
activateCurrentNav();
initializeKeyboardShortcuts();
trackVisits();
personalizeHomeSections();
hydrateYouTubePreviews(document);
initializeCheckIn();

function initializeKeyboardShortcuts() {
  document.addEventListener('keydown', function(e) {
    var tag = (e.target && e.target.tagName) || '';
    var typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable);
    if (e.key === 'Escape') {
      var input = document.getElementById('search');
      if (input && document.activeElement === input) {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.blur();
        e.preventDefault();
      }
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '/') {
      var input = document.getElementById('search');
      if (input) {
        e.preventDefault();
        input.focus();
        input.select();
      }
    } else if (e.key === 't') {
      var btn = document.getElementById('theme-toggle');
      if (btn) { e.preventDefault(); btn.click(); }
    } else if (e.key === 'g') {
      window.__shanepediaGoto = true;
      setTimeout(function() { window.__shanepediaGoto = false; }, 1200);
    } else if (window.__shanepediaGoto) {
      var prefix = window.SHANEPEDIA_ROOT_PREFIX || '';
      if (e.key === 'h') { e.preventDefault(); window.location.href = prefix + 'index.html'; }
      else if (e.key === 'b') { e.preventDefault(); window.location.href = prefix + 'browse/index.html'; }
      window.__shanepediaGoto = false;
    }
  });
}

loadSearch().then(function(index) {
  buildTagCloud(index);
  var input = document.getElementById('search');
  if (!input) return;
  input.addEventListener('input', function() {
    var q = input.value.trim().toLowerCase();
    activeTag = null;
    document.querySelectorAll('#tag-cloud .tag-pill').forEach(function(p) { p.classList.remove('active'); });
    if (!q) return renderResults([], [], '');
    var terms = q.split(/\s+/).filter(Boolean);
    var ranked = index
      .map(function(item) { return { item: item, score: scoreItem(item, terms) }; })
      .filter(function(row) { return row.score > 0; })
      .sort(function(a, b) { return b.score - a.score || a.item.title.localeCompare(b.item.title); })
      .map(function(row) { return row.item; })
      .slice(0, 15);
    renderResults(ranked, terms, '');
  });
}).catch(function(error) {
  console.error('Shanepedia search failed to load', error);
});
