(function(){
  'use strict';

  // Base path of the site (works for both http:// and file:// protocols)
  var _base = location.href.slice(0, location.href.lastIndexOf('/') + 1);

  function isSameDir(url) {
    return url.startsWith(_base);
  }

  // XHR-based fetch (works with file:// where fetch() is blocked in Chrome)
  function getHTML(url) {
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.onload = function() {
        // status 0 = file:// protocol success
        if (xhr.status >= 200 && xhr.status < 300 || xhr.status === 0) {
          resolve(xhr.responseText);
        } else {
          reject(new Error('HTTP ' + xhr.status));
        }
      };
      xhr.onerror = reject;
      xhr.send();
    });
  }

  var revObs = null;
  var _lbKeydownFn = null;

  function isIndexUrl(url) {
    var path = url.slice(_base.length).split('#')[0];
    return path === '' || path === 'index.html';
  }

  function navigate(url, isPop) {
    getHTML(url)
      .then(function(html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');

        document.title = doc.title;

        // Swap inline <style> (carries orb colors, hero gradients, page CSS)
        var ns = doc.querySelector('head > style');
        var cs = document.querySelector('head > style');
        if (ns && cs) cs.textContent = ns.textContent;

        // Swap <main>
        var nm = doc.querySelector('main');
        var cm = document.querySelector('main');
        if (nm && cm) {
          // If navigating to index, hide loader immediately before paint to prevent flash
          if (isIndexUrl(url) && window._rsLoaderShown) {
            var tmpLoader = nm.querySelector('#loader');
            if (tmpLoader) tmpLoader.style.display = 'none';
          }
          cm.innerHTML = nm.innerHTML;
        }

        // Swap <nav> (homepage and case studies have different nav HTML)
        var nn = doc.querySelector('nav');
        var cn = document.querySelector('nav');
        if (nn && cn) cn.innerHTML = nn.innerHTML;

        // Swap lightbox overlay (lives outside <main>)
        var curLb = document.getElementById('lightbox');
        var newLb = doc.getElementById('lightbox');
        if (newLb) {
          var clone = newLb.cloneNode(true);
          if (curLb) curLb.replaceWith(clone);
          else {
            var ap = document.getElementById('audioPlayer');
            if (ap) ap.parentNode.insertBefore(clone, ap);
          }
        } else if (curLb) {
          curLb.remove();
        }

        if (!isPop) history.pushState({}, doc.title, url);

        var _hash = url.split('#')[1];
        if (_hash) {
          requestAnimationFrame(function() {
            var _el = document.getElementById(_hash);
            if (_el) _el.scrollIntoView({ behavior: 'smooth' });
          });
        } else {
          window.scrollTo({ top: 0, behavior: 'instant' });
        }

        if (isIndexUrl(url)) {
          initIndex();
        } else {
          initReveal();
          initLightbox();
          if (window._rsAP) window._rsAP.initDuck();
        }
      })
      .catch(function() { location.href = url; });
  }

  // ── Case study scroll reveals ──────────────────────────────────────────────
  function initReveal() {
    if (revObs) revObs.disconnect();
    revObs = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (!e.isIntersecting) return;
        e.target.style.transition = 'opacity .75s ease, transform .75s ease';
        e.target.style.opacity = 1;
        e.target.style.transform = 'translateY(0)';
        revObs.unobserve(e.target);
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(function(el) { revObs.observe(el); });
  }

  // ── Lightbox for case study pages ─────────────────────────────────────────
  function initLightbox() {
    var lb = document.getElementById('lightbox');
    if (_lbKeydownFn) { document.removeEventListener('keydown', _lbKeydownFn); _lbKeydownFn = null; }
    if (!lb) return;

    var lbImg   = document.getElementById('lbImg');
    var lbCount = document.getElementById('lbCount');
    var lbClose = document.getElementById('lbClose');
    var lbPrev  = document.getElementById('lbPrev');
    var lbNext  = document.getElementById('lbNext');
    var gallery = [], current = 0;

    function buildGalleries() {
      var groups = {};
      document.querySelectorAll('img[data-gallery]').forEach(function(img) {
        var g = img.dataset.gallery;
        if (!groups[g]) groups[g] = [];
        groups[g].push(img);
      });
      return groups;
    }
    var galleries = buildGalleries();

    function openAt(g, i) {
      gallery = galleries[g] || [];
      current = i;
      show();
      lb.classList.add('open');
      document.body.style.overflow = 'hidden';
      if (lbClose) lbClose.focus();
    }
    function show() {
      var img = gallery[current];
      if (!img || !lbImg) return;
      lbImg.src = img.src;
      lbImg.alt = img.alt || '';
      if (lbCount) lbCount.textContent = (current + 1) + ' / ' + gallery.length;
      if (lbPrev) lbPrev.style.display = gallery.length > 1 ? 'flex' : 'none';
      if (lbNext) lbNext.style.display = gallery.length > 1 ? 'flex' : 'none';
    }
    function close() {
      lb.classList.remove('open');
      document.body.style.overflow = '';
      if (lbImg) lbImg.src = '';
    }

    document.querySelectorAll('img[data-gallery]').forEach(function(img) {
      img.addEventListener('click', function() {
        openAt(img.dataset.gallery, parseInt(img.dataset.idx, 10) || 0);
      });
    });
    if (lbClose) lbClose.addEventListener('click', close);
    if (lbPrev) lbPrev.addEventListener('click', function() { current = (current - 1 + gallery.length) % gallery.length; show(); });
    if (lbNext) lbNext.addEventListener('click', function() { current = (current + 1) % gallery.length; show(); });
    lb.addEventListener('click', function(e) { if (e.target === lb) close(); });

    _lbKeydownFn = function(e) {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') { current = (current - 1 + gallery.length) % gallery.length; show(); }
      if (e.key === 'ArrowRight') { current = (current + 1) % gallery.length; show(); }
    };
    document.addEventListener('keydown', _lbKeydownFn);
  }

  // ── Homepage re-initialization ─────────────────────────────────────────────
  function revealHeroImmediate() {
    var loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';
    document.querySelectorAll('.hero .reveal').forEach(function(el) {
      el.style.transition = 'opacity .35s ease, transform .35s ease';
      el.style.opacity = 1;
      el.style.transform = 'translateY(0)';
    });
  }

  function runLoader() {
    var loader = document.getElementById('loader');
    if (!loader) { revealHeroImmediate(); return; }

    var introPaths = Array.from(document.querySelectorAll('.intro-logo .cls-1'));
    var sigPaths   = Array.from(document.querySelectorAll('.signature-mark .cls-1'));

    introPaths.forEach(function(el) { el.style.opacity = 0; });
    sigPaths.forEach(function(el) { el.style.opacity = 0; });

    introPaths.forEach(function(el, i) {
      setTimeout(function() {
        el.style.transition = 'opacity .55s ease';
        el.style.opacity = 1;
      }, 180 + i * 200);
    });

    setTimeout(function() { loader.classList.add('hide'); }, 2400);

    setTimeout(function() {
      loader.style.display = 'none';
      sigPaths.forEach(function(el, i) {
        setTimeout(function() {
          el.style.transition = 'opacity .5s ease';
          el.style.opacity = 1;
        }, i * 110);
      });
      document.querySelectorAll('.hero .reveal').forEach(function(el, i) {
        setTimeout(function() {
          el.style.transition = 'opacity .8s ease, transform .8s ease';
          el.style.opacity = 1;
          el.style.transform = 'translateY(0)';
        }, i * 130);
      });
    }, 3200);
  }

  function initIndex() {
    // Work filter tabs
    var tabs      = document.querySelectorAll('.work-tab');
    var workItems = document.querySelectorAll('.work-item');
    var emptyBox  = document.getElementById('workEmpty');
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        tabs.forEach(function(t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var filter = tab.dataset.filter;
        var visible = 0;
        workItems.forEach(function(item) {
          var show = filter === 'all' || item.dataset.category === filter;
          item.style.display = show ? 'block' : 'none';
          if (show) visible++;
        });
        if (emptyBox) emptyBox.classList.toggle('visible', visible === 0);
      });
    });

    // Skill bars
    var barObs = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (!e.isIntersecting) return;
        e.target.querySelectorAll('.skill-fill').forEach(function(fill) {
          fill.style.width = fill.dataset.width + '%';
        });
        barObs.unobserve(e.target);
      });
    }, { threshold: 0.3 });
    var skillList = document.querySelector('.skill-list');
    if (skillList) barObs.observe(skillList);

    // Section / CTA / stats reveals
    if (revObs) revObs.disconnect();
    revObs = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (!e.isIntersecting) return;
        e.target.style.transition = 'opacity .75s ease, transform .75s ease';
        e.target.style.opacity = 1;
        e.target.style.transform = 'translateY(0)';
        revObs.unobserve(e.target);
      });
    }, { threshold: 0.14 });
    document.querySelectorAll('.section .reveal, .cta-section .reveal, .stats-bar .stat').forEach(function(el) {
      revObs.observe(el);
    });

    // Stagger reveals (work cards, skills, about grid)
    var staggerObs = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (!e.isIntersecting) return;
        var group = e.target.closest('.caps-grid, .skill-list, .about-grid, .awards-grid');
        var items = group ? Array.from(group.querySelectorAll('.reveal-stagger')) : [e.target];
        items.forEach(function(el, i) {
          setTimeout(function() {
            el.style.transition = 'opacity .75s ease, transform .75s ease';
            el.style.opacity = 1;
            el.style.transform = 'translateY(0)';
          }, i * 110);
        });
        items.forEach(function(el) { staggerObs.unobserve(el); });
      });
    }, { threshold: 0.15 });
    document.querySelectorAll('.reveal-stagger').forEach(function(el) { staggerObs.observe(el); });

    // Loader / hero reveal
    if (window._rsLoaderShown) {
      revealHeroImmediate();
    } else {
      window._rsLoaderShown = true;
      runLoader();
    }
  }

  // ── Click interception ─────────────────────────────────────────────────────
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a[href]');
    if (!a) return;
    if (a.target === '_blank') return;
    var href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    var url = a.href;
    if (!isSameDir(url)) return;

    // Same page
    if (url.split('#')[0] === location.href.split('#')[0]) {
      var _h = url.split('#')[1];
      if (_h) {
        // Hash link on same page — let browser scroll natively
        var _target = document.getElementById(_h);
        if (_target) { e.preventDefault(); _target.scrollIntoView({ behavior: 'smooth' }); }
        return;
      }
      // No hash (e.g. logo click on homepage) → scroll to top
      window.scrollTo(0, 0);
      return;
    }

    e.preventDefault();
    navigate(url, false);
  });

  // Back/forward navigation
  window.addEventListener('popstate', function() {
    navigate(location.href, true);
  });
})();
