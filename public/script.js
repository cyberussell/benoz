(function () {
  var themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var explicit = document.documentElement.getAttribute('data-theme');
      var current = explicit === 'light' || explicit === 'dark'
        ? explicit
        : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      var next = current === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
    });
  }

  document.querySelectorAll('[data-char-count-for]').forEach(function (counter) {
    var target = document.getElementById(counter.getAttribute('data-char-count-for'));
    if (!target) return;
    var paragraphs = target.querySelectorAll('p');
    var text = paragraphs.length
      ? Array.prototype.map.call(paragraphs, function (p) { return p.textContent.trim(); }).join('\n\n')
      : target.textContent.trim();
    var length = text.length;
    counter.textContent = length.toLocaleString() + ' character' + (length === 1 ? '' : 's');
  });

  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav-list a[data-nav]'));
  var sections = navLinks
    .map(function (link) {
      var id = link.getAttribute('href').slice(1);
      return document.getElementById(id);
    })
    .filter(Boolean);

  if ('IntersectionObserver' in window && sections.length) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var id = entry.target.id;
          navLinks.forEach(function (link) {
            link.classList.toggle('active', link.getAttribute('href') === '#' + id);
          });
        });
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 }
    );

    sections.forEach(function (section) {
      observer.observe(section);
    });
  }
})();
