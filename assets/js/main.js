/* ==========================================================================
   Personal Portfolio — behaviour
   --------------------------------------------------------------------------
   1. Header stuck state
   2. Mobile navigation
   3. Smooth scrolling (respects reduced motion)
   4. Scroll spy (aria-current on the active nav link)
   5. Reveal on scroll
   6. Subtle portrait parallax
   7. Footer year
   All features bail out cleanly if their DOM isn't present.
   ========================================================================== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var prefersReduced = function () { return reduceMotion.matches; };

  var $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ── 1. Header stuck state ───────────────────────────────────────────── */
  var header = $('#site-header');

  if (header) {
    var stuck = false;
    var syncHeader = function () {
      var next = window.scrollY > 24;
      if (next !== stuck) {
        stuck = next;
        header.classList.toggle('is-stuck', stuck);
      }
    };
    syncHeader();
    window.addEventListener('scroll', syncHeader, { passive: true });
  }

  /* ── 2. Mobile navigation ────────────────────────────────────────────── */
  var toggle = $('#nav-toggle');
  var nav    = $('#primary-nav');

  if (toggle && nav) {
    var setMenu = function (open) {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (header) header.classList.toggle('is-nav-open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    };

    var isOpen = function () { return toggle.getAttribute('aria-expanded') === 'true'; };

    toggle.addEventListener('click', function () { setMenu(!isOpen()); });

    // Close after choosing a destination
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a') && isOpen()) setMenu(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) {
        setMenu(false);
        toggle.focus();
      }
    });

    // Reset if the viewport grows back to the desktop layout
    var desktop = window.matchMedia('(min-width: 881px)');
    var onChange = function (e) { if (e.matches && isOpen()) setMenu(false); };
    desktop.addEventListener ? desktop.addEventListener('change', onChange)
                             : desktop.addListener(onChange);
  }

  /* ── 3. Smooth scrolling ─────────────────────────────────────────────── */
  var anchors = $$('a[href^="#"]').filter(function (a) {
    return a.getAttribute('href').length > 1 && a.id !== 'main';
  });

  anchors.forEach(function (link) {
    link.addEventListener('click', function (e) {
      var target = document.getElementById(link.getAttribute('href').slice(1));
      if (!target) return;

      e.preventDefault();
      target.scrollIntoView({
        behavior: prefersReduced() ? 'auto' : 'smooth',
        block: 'start'
      });

      // Keep the keyboard where the eye went, without a double jump
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });

      if (history.replaceState) history.replaceState(null, '', link.getAttribute('href'));
    });
  });

  /* ── 4. Scroll spy ───────────────────────────────────────────────────── */
  var navLinks = $$('.nav__link[href^="#"]');
  var spyTargets = navLinks
    .map(function (l) { return document.getElementById(l.getAttribute('href').slice(1)); })
    .filter(Boolean);

  if (spyTargets.length && 'IntersectionObserver' in window) {
    var visible = new Map();

    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { visible.set(entry.target.id, entry.isIntersecting); });

      var activeId = null;
      spyTargets.forEach(function (t) {
        if (visible.get(t.id)) activeId = t.id;   // last match wins (document order)
      });

      navLinks.forEach(function (l) {
        var on = activeId !== null && l.getAttribute('href') === '#' + activeId;
        if (on) l.setAttribute('aria-current', 'true');
        else l.removeAttribute('aria-current');
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

    spyTargets.forEach(function (t) { spy.observe(t); });
  }

  /* ── 5. Reveal on scroll ─────────────────────────────────────────────── */
  /* `.reveal-wipe` is deliberately NOT observed here - its clip-path leaves it
     with zero visible area, so IntersectionObserver would never report it.
     The heading wipe is driven by its parent wrapper instead (see styles.css). */
  var wipeables  = $$('.reveal-wipe');
  var righters  = $$('.reveal-right');
  var revealables = $$('.reveal');

  // Index chips so each can be offset by --i for a staggered pop-in
  $$('.chips').forEach(function (list) {
    $$('.chip', list).forEach(function (chip, i) { chip.style.setProperty('--i', i); });
  });

  var animatables = revealables.concat(righters);

  if (!animatables.length) {
    // nothing to do
  } else if (prefersReduced() || !('IntersectionObserver' in window)) {
    animatables.forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    var revealer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var delay = Number(el.dataset.revealDelay || 0);
        setTimeout(function () { el.classList.add('is-visible'); }, delay);
        obs.unobserve(el);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

    animatables.forEach(function (el) { revealer.observe(el); });

    /* Browsers restore the scroll position on reload, and a deep link can land
       mid-page. Anything already scrolled past would otherwise stay hidden
       until the visitor scrolled back up through it. */
    var revealPassed = function () {
      animatables.forEach(function (el) {
        if (el.getBoundingClientRect().bottom < 0) {
          el.classList.add('is-visible');
          revealer.unobserve(el);
        }
      });
    };
    revealPassed();
    window.addEventListener('pageshow', revealPassed);   // bfcache restore

    // Re-run visibility if the user turns reduced motion off mid-session
    var onMotionChange = function () {
      if (prefersReduced()) animatables.forEach(function (el) { el.classList.add('is-visible'); });
    };
    reduceMotion.addEventListener ? reduceMotion.addEventListener('change', onMotionChange)
                                  : reduceMotion.addListener(onMotionChange);
  }

  /* ── 6. Diagonal drift + subtle portrait parallax ────────────────────── */
  var portrait = $('#hero-portrait');
  var hero = $('.hero__stage');
  var introPanel = $('.hero__panel--intro');

  if (hero) {
    /* The diagonal edge drifts a few pixels as the hero scrolls away.
       Drives a transform (composited), never an animated clip-path.
       The value is NEGATIVE (upward): the panel is scaled 1.02 about its
       top-left corner, which covers 2% of the stage height at the bottom but
       nothing above the top. Drifting upward therefore keeps every edge
       covered; drifting down would expose a black sliver at the hero's top.
       The travel is a FRACTION of the stage height rather than a fixed pixel
       value, so it can never exceed the 2% the scale provides - a short
       viewport would otherwise out-travel its own headroom. */
    var DRIFT_FRAC = 0.015; // 1.5% of the stage height (scale allows 2%)
    var driftFrame = null;

    var applyDrift = function () {
      driftFrame = null;
      if (!introPanel) return;
      if (prefersReduced()) { introPanel.style.setProperty('--drift', '0px'); return; }
      var span = hero.offsetHeight || 1;
      var y = Math.min(Math.max(window.scrollY, 0), span);
      introPanel.style.setProperty('--drift', (-(y * DRIFT_FRAC)).toFixed(2) + 'px');
    };

    var requestDrift = function () {
      if (driftFrame) return;
      driftFrame = requestAnimationFrame(applyDrift);
    };

    applyDrift();
    window.addEventListener('scroll', requestDrift, { passive: true });
    window.addEventListener('resize', requestDrift, { passive: true });
    reduceMotion.addEventListener ? reduceMotion.addEventListener('change', applyDrift)
                                  : reduceMotion.addListener(applyDrift);
  }

  if (portrait && hero && !prefersReduced() && window.matchMedia('(pointer: fine)').matches) {
    var raf = null;

    var move = function (e) {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        var r = hero.getBoundingClientRect();
        var x = ((e.clientX - r.left) / r.width  - 0.5) * 2;  // -1 … 1
        var y = ((e.clientY - r.top)  / r.height - 0.5) * 2;
        portrait.style.setProperty('--px', (x * -9).toFixed(2) + 'px');
        portrait.style.setProperty('--py', (y * -6).toFixed(2) + 'px');
        raf = null;
      });
    };

    var reset = function () {
      portrait.style.setProperty('--px', '0px');
      portrait.style.setProperty('--py', '0px');
    };

    hero.addEventListener('pointermove', move, { passive: true });
    hero.addEventListener('pointerleave', reset);
  }

  /* ── 7. Footer year ──────────────────────────────────────────────────── */
  var year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());
/* ── 8. Reading progress + back to top ───────────────────────────────── */
  var bar = $('#progress-bar');
  var toTop = $('#to-top');

  if (bar || toTop) {
    var syncScrollUI = function () {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var pct = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0;

      if (bar) bar.style.setProperty('--progress', pct.toFixed(4));

      if (toTop) {
        var show = window.scrollY > window.innerHeight * 0.9;
        if (show !== toTop.classList.contains('is-visible')) {
          toTop.classList.toggle('is-visible', show);
        }
      }
    };

    var scrollUIQueued = false;
    var queueScrollUI = function () {
      if (scrollUIQueued) return;
      scrollUIQueued = true;
      requestAnimationFrame(function () { scrollUIQueued = false; syncScrollUI(); });
    };

    syncScrollUI();
    window.addEventListener('scroll', queueScrollUI, { passive: true });
    window.addEventListener('resize', queueScrollUI, { passive: true });

    if (toTop) {
      toTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: prefersReduced() ? 'auto' : 'smooth' });
        // Return focus to the top of the document for keyboard users
        var brand = $('.brand');
        if (brand) { brand.setAttribute('tabindex', '-1'); brand.focus({ preventScroll: true }); }
      });
    }
  }

/* ── 8. Project filters + expandable card details ──────────────────── */
  var CATEGORIES = { web: 'Web', mobile: 'Mobile', uiux: 'UI/UX' };

  var filterBar = $('#filters');
  var cardList = $('#cards');

  if (filterBar && cardList) {
    var cards = $$('.card', cardList);

    // Build the tab bar from the categories actually in use, so there is
    // nothing to keep in sync by hand. One category = no bar at all.
    var used = [];
    cards.forEach(function (c) {
      var k = c.dataset.cat;
      if (k && CATEGORIES[k] && used.indexOf(k) === -1) used.push(k);
    });
    used.sort(function (a, b) {
      return Object.keys(CATEGORIES).indexOf(a) - Object.keys(CATEGORIES).indexOf(b);
    });

    if (used.length > 1) {
      var applyFilter = function (cat) {
        cards.forEach(function (c) {
          c.hidden = cat !== 'all' && c.dataset.cat !== cat;
        });
        $$('.filter', filterBar).forEach(function (b) {
          b.setAttribute('aria-pressed', String(b.dataset.filter === cat));
        });
      };

      var makeTab = function (key, label) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'filter';
        b.dataset.filter = key;
        b.textContent = label;
        b.setAttribute('aria-pressed', String(key === 'all'));
        b.addEventListener('click', function () { applyFilter(key); });
        return b;
      };

      filterBar.appendChild(makeTab('all', 'All'));
      used.forEach(function (k) { filterBar.appendChild(makeTab(k, CATEGORIES[k])); });
    }
  }

  // "Details" buttons expand the panel named by data-more
  $$('[data-more]').forEach(function (btn) {
    var panel = document.getElementById(btn.dataset.more);
    if (!panel) return;
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      panel.hidden = open;
    });
  });

})();