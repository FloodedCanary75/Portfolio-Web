/* ============================================================
   portfolio.js — all behaviour for Ariane's portfolio.
   Moved out of index.html so the page is HTML + CSS + JS.
   index.html loads it with: <script src="portfolio.js" defer></script>

   Three parts, in this order:
     1. page chrome  — rope dividers, scroll reveal, header, counts,
                       achievement filter / "show all" / details, copy email
     2. the level    — Cut the Rope playground (canvas + Verlet physics)
     3. lightbox     — the "See certificate" viewer
   ============================================================ */

/* ============ 1. PAGE CHROME ============ */
(function () {
  'use strict';

  /* ---------- rope separators ---------- */
  document.querySelectorAll('.rope-sep').forEach(function (el) {
    var d = 'M24 20 C 200 60, 380 60, 600 40 C 820 20, 1000 20, 1176 20';
    el.innerHTML =
      '<div class="rope-sep-in">' +
        '<svg viewBox="0 0 1200 64" preserveAspectRatio="none" aria-hidden="true">' +
          '<path class="rope-path" d="' + d + '"></path>' +
          '<path class="rope-twist" d="' + d + '"></path>' +
        '</svg>' +
        '<span class="grommet g1"></span><span class="grommet g2"></span>' +
      '</div>';
  });

  /* ---------- reveal on scroll ---------- */
  var revealEls = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window) {
    var revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); revealIO.unobserve(e.target); }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(function (el) { revealIO.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---------- header: progress stars + active link ---------- */
  var hud = document.getElementById('hud');
  var hudStarEls = Array.prototype.slice.call(document.querySelectorAll('#hud-stars .star'));
  var hudStarsWrap = document.getElementById('hud-stars');
  var hudPct = document.getElementById('hud-pct');
  var scrollQueued = false;

  function updateHud() {
    scrollQueued = false;
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    if (hud) hud.classList.toggle('is-scrolled', y > 14);
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var p = max > 40 ? Math.min(1, Math.max(0, y / max)) : 0;
    var filled = p >= 0.88 ? 3 : p >= 0.55 ? 2 : p >= 0.22 ? 1 : 0;
    hudStarEls.forEach(function (s, i) { s.classList.toggle('is-on', i < filled); });
    if (hudPct) hudPct.textContent = Math.round(p * 100) + '%';
    if (hudStarsWrap) hudStarsWrap.setAttribute('aria-label', filled + ' of 3 stars explored');
  }
  function queueHud() {
    if (!scrollQueued) { scrollQueued = true; window.requestAnimationFrame(updateHud); }
  }
  window.addEventListener('scroll', queueHud, { passive: true });
  window.addEventListener('resize', queueHud, { passive: true });
  updateHud();

  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.hud-nav a[href^="#"]'));
  var navSections = navLinks.map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);
  if (navSections.length) {
    /* The current section is the last one whose top has passed the reading
       line. The page bottom is pinned to the last section on purpose: Contact
       is short, so it never reaches the line, and the old band-based observer
       left "Play" lit while you were reading Contact. */
    var navQueued = false;
    var syncNav = function () {
      navQueued = false;
      var line = window.scrollY + window.innerHeight * 0.42;
      var atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      var current = atBottom ? navSections[navSections.length - 1] : null;
      if (!atBottom) {
        navSections.forEach(function (s) {
          if (s.getBoundingClientRect().top + window.scrollY <= line) current = s;
        });
      }
      var id = current ? '#' + current.id : '';
      navLinks.forEach(function (a) {
        a.classList.toggle('is-active', id !== '' && a.getAttribute('href') === id);
      });
    };
    var queueNav = function () {
      if (navQueued) return;
      navQueued = true;
      window.requestAnimationFrame(syncNav);
    };
    window.addEventListener('scroll', queueNav, { passive: true });
    window.addEventListener('resize', queueNav, { passive: true });
    syncNav();
  }

  /* ---------- mobile menu ---------- */
  var menuBtn = document.getElementById('hud-menu');
  if (menuBtn && hud) {
    var closeMenu = function () {
      hud.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
    };
    menuBtn.addEventListener('click', function () {
      var open = hud.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(open));
    });
    Array.prototype.forEach.call(document.querySelectorAll('.hud-nav a'), function (a) {
      a.addEventListener('click', closeMenu);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
    document.addEventListener('click', function (e) { if (!hud.contains(e.target)) closeMenu(); });
  }

  /* ---------- counts ----------
     Every count on the page is derived here, never written into the HTML,
     so adding an achievement, a leadership role or a project updates the
     lede, the counter, the buttons and the panel headings by itself. */
  var NUMWORD = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  var countWord = function (n) { return NUMWORD[n] || String(n); };

  /* ---------- achievements: filter, show all, details ---------- */
  var achGrid = document.getElementById('ach-grid');
  if (achGrid) {
    var INITIAL = 3;   /* how many cards show before "Show all" */
    var cards = Array.prototype.slice.call(achGrid.querySelectorAll('.ach'));
    var filters = Array.prototype.slice.call(document.querySelectorAll('#ach-filters .filter'));
    var countEl = document.getElementById('ach-count');
    var moreBtn = document.getElementById('ach-more');
    var moreLabel = moreBtn ? moreBtn.querySelector('span') : null;
    var emptyEl = document.getElementById('ach-empty');
    var footEl = document.getElementById('ach-footer');
    var ledeEl = document.getElementById('ach-lede');
    var activeFilter = 'all';
    var expanded = false;

    var renderAch = function () {
      var listed = 0, shown = 0;
      cards.forEach(function (card) {
        var matches = activeFilter === 'all' || card.getAttribute('data-cat') === activeFilter;
        var visible = false;
        if (matches) {
          listed++;
          visible = expanded || listed <= INITIAL;
          if (visible) shown++;
        }
        card.hidden = !visible;
      });
      /* the sentence counts the cards actually in the HTML, so adding one updates it */
      if (ledeEl) ledeEl.textContent = cards.length === 1 ? 'One thing' : countWord(cards.length) + ' things';
      if (countEl) countEl.textContent = listed ? 'Showing ' + shown + ' of ' + listed : '';
      if (emptyEl) emptyEl.hidden = listed > 0;
      if (footEl) footEl.hidden = listed === 0;
      if (moreBtn) {
        moreBtn.hidden = listed <= INITIAL;
        moreBtn.setAttribute('aria-expanded', String(expanded));
        if (moreLabel) moreLabel.textContent = expanded ? 'Show fewer' : 'Show all ' + listed;
        var ic = moreBtn.querySelector('.ico');
        if (ic) ic.style.transform = expanded ? 'rotate(180deg)' : '';
      }
    };

    filters.forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeFilter = btn.getAttribute('data-filter');
        expanded = false;
        filters.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
        renderAch();
      });
    });

    if (moreBtn) {
      moreBtn.addEventListener('click', function () {
        expanded = !expanded;
        renderAch();
        if (!expanded) {
          var sec = document.getElementById('achievements');
          if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }

    achGrid.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.ach-toggle') : null;
      if (!btn) return;
      var card = btn.closest('.ach');
      var open = card.getAttribute('data-open') === 'true';
      card.setAttribute('data-open', String(!open));
      btn.setAttribute('aria-expanded', String(!open));
      var label = btn.querySelector('span');
      if (label) label.textContent = open ? 'Details' : 'Close';
    });

    renderAch();
  }

  /* ---------- every count on the page, derived from the markup ----------
     Counting the cards here means the hero figures, the panel heading and the
     project lede follow the HTML: add or delete an item and they all move. */
  var achItems = document.querySelectorAll('#achievements .ach').length;
  var othItems = document.querySelectorAll('#others .oth-list > li').length;
  var projItems = document.querySelectorAll('#projects .proj').length;

  var othCountEl = document.getElementById('oth-count');
  if (othCountEl) othCountEl.textContent = countWord(othItems);

  var projLedeEl = document.getElementById('proj-lede');
  if (projLedeEl) projLedeEl.textContent = projItems === 1 ? 'One thing' : countWord(projItems) + ' things';

  var statAchEl = document.getElementById('stat-ach');
  if (statAchEl) statAchEl.textContent = achItems;
  var statProjEl = document.getElementById('stat-proj');
  if (statProjEl) statProjEl.textContent = projItems;
  var statLeadEl = document.getElementById('stat-leads');
  if (statLeadEl) statLeadEl.textContent = othItems;

  /* ---------- copy email ---------- */
  var copyBtn = document.getElementById('copy-email');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var email = copyBtn.getAttribute('data-email') || '';
      var label = copyBtn.querySelector('.btn-label');
      var done = function () {
        copyBtn.classList.add('is-done');
        if (label) label.textContent = 'Copied!';
        setTimeout(function () {
          copyBtn.classList.remove('is-done');
          if (label) label.textContent = 'Copy address';
        }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(email).then(done, function () { fallback(); });
      } else { fallback(); }
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = email;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (err) { if (label) label.textContent = email; }
        document.body.removeChild(ta);
      }
    });
  }

  /* ---------- hero Om Nom ---------- */
  var heroStage = document.getElementById('hero-stage');
  var heroOm = document.getElementById('hero-omnom');
  var HERO_POSES = {
    standard: 'Om%20nom/sprite_standard.webp',
    blink: 'Om%20nom/sprite_blink.webp',
    mouth: 'Om%20nom/sprite_mouth.webp'
  };
  var heroPose = 'standard';
  function setHeroPose(p) {
    if (!heroOm || heroPose === p || !HERO_POSES[p]) return;
    heroPose = p;
    heroOm.src = HERO_POSES[p];
  }
  if (heroStage && heroOm) {
    Object.keys(HERO_POSES).forEach(function (k) { var i = new Image(); i.src = HERO_POSES[k]; });
    heroStage.addEventListener('pointerenter', function () { setHeroPose('mouth'); });
    heroStage.addEventListener('pointerleave', function () { setHeroPose('standard'); });
    setInterval(function () {
      if (heroStage.matches(':hover')) return;
      setHeroPose('blink');
      setTimeout(function () { if (!heroStage.matches(':hover')) setHeroPose('standard'); }, 900);
    }, 5200);
  }
})();

/* ============ 2. CUT THE ROPE: the level ============ */
(function initCutTheRope() {
  var canvas = document.getElementById('physics-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var stage = document.getElementById('stage');
  var scoreCounter = document.getElementById('score-counter');
  var starCounter = document.getElementById('star-counter');
  var btnReTether = document.getElementById('btn-re-tether');
  var omnomSvg = document.getElementById('omnom-svg');
  var plankEl = document.getElementById('omnom-plank');
  var chewBloom = document.getElementById('chew-bloom');
  var sliceTrail = document.getElementById('slice-trail');
  var stageToast = document.getElementById('stage-toast');
  var stageStars = Array.prototype.slice.call(document.querySelectorAll('#stage-stars .star'));

  var POSES = {
    standard: 'Om%20nom/sprite_standard.webp',
    blink: 'Om%20nom/sprite_blink.webp',
    mouth: 'Om%20nom/sprite_mouth.webp'
  };
  var omnomPose = 'standard';
  var omnomBusy = false;
  var omnomNear = false;

  function setOmNomPose(pose) {
    if (!omnomSvg || omnomPose === pose || !POSES[pose]) return;
    omnomPose = pose;
    omnomSvg.src = POSES[pose];
  }

  /* idle beat: every 4s the excited pose holds for 1s */
  setInterval(function () {
    if (omnomBusy || omnomNear) return;
    setOmNomPose('blink');
    setTimeout(function () {
      if (!omnomBusy && !omnomNear) setOmNomPose('standard');
    }, 1000);
  }, 4000);

  var width = 0, height = 0, sizedW = 0, sizedH = 0;

  function sizeCanvas() {
    if (!stage) return false;
    width = stage.clientWidth;
    height = stage.clientHeight;
    if (!width || !height) return false;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sizedW = width;
    sizedH = height;
    return true;
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!stage) return;
      if (Math.abs(stage.clientWidth - sizedW) < 1 &&
          Math.abs(stage.clientHeight - sizedH) < 1) return;
      resetStage();
    }, 120);
  });

  /* Light gravity: the candy is a pendulum on whichever cords are taut, so a
     smaller pull = longer period = a lazier, wider swing. Scaled in resetStage
     so the swing keeps its tempo at any stage size. */
  var gravity = 0.22;
  var candiesFedCount = 0;
  var starsCollected = 0;
  var isDraggingCandy = false;
  var dragOffset = { x: 0, y: 0 };
  var isSlicing = false;
  var slicePoints = [];

  /* Level geometry, measured off the reference level.
     x is a fraction of stage width, y a fraction of stage height.
     The third pin is solved at runtime (see resetStage) so the candy's swing
     always lands on Om Nom's mouth; the stars sit on that swing. */
  var LEVEL = {
    anchors: [[0.428, 0.058], [0.732, 0.058]],
    candy: [0.693, 0.283],
    stars: [[0.693, 0.400], [0.693, 0.550], [0.760, 0.800]]
  };

  var u = 1, pinR = 13.5, ropeW = 3.7, starR = 31, omNomSize = 135;

  var candy = { x: 0, y: 0, oldX: 0, oldY: 0, radius: 27, eaten: false };
  var ropes = [];
  var stars = [];
  var sparks = [];

  /* Ground height at x: the plank where there is one, else the box floor. */
  function groundY(x) {
    var r = candy.radius;
    if (plankEl) {
      var pr = plankEl.getBoundingClientRect();
      var cr = canvas.getBoundingClientRect();
      var left = pr.left - cr.left;
      var right = pr.right - cr.left;
      if (x > left - r * 0.4 && x < right + r * 0.4) return pr.top - cr.top;
    }
    return height;
  }

  function renderStageStars() {
    stageStars.forEach(function (s, i) { s.classList.toggle('is-on', i < starsCollected); });
  }

  function resetStage() {
    if (!sizeCanvas()) return;

    omnomBusy = false;
    omnomNear = false;
    setOmNomPose('standard');

    starsCollected = 0;
    if (starCounter) starCounter.textContent = '0 / 3';
    renderStageStars();

    u = height / 520;
    pinR = 13.5 * u;
    ropeW = 3.7 * u;
    starR = 31 * u;
    candy.radius = 27 * u;
    omNomSize = 135 * u;
    gravity = 0.22 * u;

    /* Om Nom and his plank are sized as a percentage of the stage WIDTH,
       which only lines up with the physics on the reference 2.12:1 stage.
       A phone stage is far squarer, so there he would be smaller than the
       mouth the physics aims at. Tie both to u instead - and restore the
       CSS values on a reference-shaped stage, so desktop is untouched. */
    var refStage = width >= height * 2.12 * 0.92;
    if (omnomSvg) omnomSvg.style.width = refStage ? '' : (omNomSize / width * 100).toFixed(2) + '%';
    if (plankEl) plankEl.style.width = refStage ? '' : (omNomSize * 1.08 / width * 100).toFixed(2) + '%';

    var cx = LEVEL.candy[0] * width;
    var cy = LEVEL.candy[1] * height;
    candy.x = cx;
    candy.y = cy;
    candy.oldX = cx;
    candy.oldY = cy;
    candy.eaten = false;

    /* One rigid cord per anchor. rest is the exact anchor->candy distance, so
       at load every cord is precisely taut.

       The third pin is solved, not copied: cutting cords leaves exactly one, so
       the candy can only travel the circle of that cord, and that circle must
       pass through Om Nom's mouth - the pin sits on the perpendicular bisector
       of candy->mouth. Solving it from the live mouth each reset is what keeps
       the swing landing at any stage size. */
    var mouth = getOmNomMouthCenter();
    var mdx = mouth.x - cx;
    var mdy = mouth.y - cy;
    var mL = Math.sqrt(mdx * mdx + mdy * mdy) || 1;
    var pinOffset = 0.232 * mL;
    var pins = LEVEL.anchors.map(function (f) { return [f[0] * width, f[1] * height]; });
    var pad = pinR * 1.5;
    pins.push([
      Math.min(Math.max((cx + mouth.x) / 2 + pinOffset * (mdy / mL), pad), width - pad),
      Math.min(Math.max((cy + mouth.y) / 2 - pinOffset * (mdx / mL), pad), height - pad)
    ]);
    ropes = pins.map(function (p) {
      return {
        ax: p[0],
        ay: p[1],
        rest: Math.sqrt((cx - p[0]) * (cx - p[0]) + (cy - p[1]) * (cy - p[1])),
        cut: false,
        stub: null
      };
    });

    /* Stars are placed by fraction, but Om Nom is a bottom-right sprite sized
       off the stage: on a narrow stage his box swallows the third star's slot.
       Any star that would land inside him slides to his left edge. */
    var cr = canvas.getBoundingClientRect();
    var omRect = omnomSvg ? omnomSvg.getBoundingClientRect() : { left: cr.right, top: 0, bottom: 0 };
    var omL = omRect.left - cr.left;
    var omT = omRect.top - cr.top;
    var omB = omRect.bottom - cr.top;
    stars = LEVEL.stars.map(function (f, i) {
      var x = f[0] * width;
      var y = f[1] * height;
      if (y > omT - starR && y < omB + starR && x + starR > omL) {
        x = Math.max(starR * 1.5, omL - starR * 1.9);
      }
      return { x: x, y: y, collected: false, pulse: i * 2.1 };
    });

    sparks = [];
    if (stageToast) stageToast.classList.remove('show');
  }

  resetStage();

  /* Segment/segment intersection returning the hit point (or null). */
  function segmentHit(p0, p1, a, b) {
    var s1x = p1.x - p0.x, s1y = p1.y - p0.y;
    var s2x = b.x - a.x, s2y = b.y - a.y;
    var den = -s2x * s1y + s1x * s2y;
    if (Math.abs(den) < 1e-9) return null;
    var s = (-s1y * (p0.x - a.x) + s1x * (p0.y - a.y)) / den;
    var t = (s2x * (p0.y - a.y) - s2y * (p0.x - a.x)) / den;
    if (s < 0 || s > 1 || t < 0 || t > 1) return null;
    return { x: a.x + s2x * t, y: a.y + s2y * t };
  }

  function checkSlice(pt1, pt2) {
    var candyPt = { x: candy.x, y: candy.y };
    ropes.forEach(function (r) {
      if (!r.cut) {
        var hit = segmentHit(pt1, pt2, { x: r.ax, y: r.ay }, candyPt);
        if (hit) {
          cutRope(r, hit);
          triggerSliceSheen();
          return;
        }
      }
      if (r.stub && r.stub.length > 1) {
        for (var i = 0; i < r.stub.length - 1; i++) {
          var hit2 = segmentHit(pt1, pt2, r.stub[i], r.stub[i + 1]);
          if (hit2) {
            cutStub(r, i);
            triggerSliceSheen();
            break;
          }
        }
      }
    });
  }

  var STUB_NODES = 8;

  function makeStub(ropeObj, ux, uy, len) {
    var seg = Math.max(2, len / STUB_NODES);
    var nodes = [];
    for (var i = 0; i <= STUB_NODES; i++) {
      var t = i / STUB_NODES;
      var x = ropeObj.ax + ux * seg * STUB_NODES * t;
      var y = ropeObj.ay + uy * seg * STUB_NODES * t;
      nodes.push({
        x: x,
        y: y,
        oldX: x - ux * 2 * u,
        oldY: y - uy * 2 * u,
        pinned: i === 0,
        seg: seg
      });
    }
    return nodes;
  }

  function cutRope(ropeObj, hit) {
    ropeObj.cut = true;
    var dx = candy.x - ropeObj.ax;
    var dy = candy.y - ropeObj.ay;
    var d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    var ux = dx / d, uy = dy / d;
    /* The stub keeps only the part from the anchor down to the cut. */
    var t = ((hit.x - ropeObj.ax) * ux + (hit.y - ropeObj.ay) * uy) / d;
    t = Math.min(Math.max(t, 0.2), 0.95);
    ropeObj.stub = makeStub(ropeObj, ux, uy, ropeObj.rest * t);
    createSparks(hit.x, hit.y, '#e07a5f', 12);
  }

  function cutStub(ropeObj, index) {
    ropeObj.stub = ropeObj.stub.slice(0, index + 1);
  }

  function triggerSliceSheen() {
    if (!sliceTrail) return;
    sliceTrail.setAttribute('opacity', '1');
    setTimeout(function () { sliceTrail.setAttribute('opacity', '0'); }, 180);
  }

  function createSparks(x, y, color, count) {
    count = count || 16;
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = (Math.random() * 5 + 2) * u;
      sparks.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        color: color || '#f59e0b',
        size: (Math.random() * 3 + 2) * u
      });
    }
  }

  function getOmNomMouthCenter() {
    /* Aim at the sprite's mouth: centre column, 67% down the art (between the
       eye whites and the fangs). The container box ends at the plank, so
       measuring that put the mouth at his feet - outside the candy's reach no
       matter which cord you cut. */
    var el = omnomSvg;
    if (!el) return { x: width - 80, y: height - 70 };
    var rect = el.getBoundingClientRect();
    var canvasRect = canvas.getBoundingClientRect();
    return {
      x: (rect.left + rect.width / 2) - canvasRect.left,
      y: (rect.top + rect.height * 0.67) - canvasRect.top
    };
  }

  var toastTimer = null;
  function showToast() {
    if (!stageToast) return;
    stageToast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { stageToast.classList.remove('show'); }, 2600);
  }

  function chewCandy() {
    if (candy.eaten) return;
    candy.eaten = true;
    candiesFedCount++;
    if (scoreCounter) scoreCounter.textContent = candiesFedCount;

    var mouth = getOmNomMouthCenter();
    createSparks(mouth.x, mouth.y, '#f59e0b', 24);
    createSparks(mouth.x, mouth.y, '#22c55e', 24);

    if (omnomSvg) {
      omnomBusy = true;
      setOmNomPose('mouth');
      omnomSvg.style.transform = 'scale(1.22) translateY(-14px)';
      setTimeout(function () {
        omnomSvg.style.transform = 'scale(0.92) translateY(5px)';
        setTimeout(function () {
          omnomSvg.style.transform = 'scale(1)';
        }, 140);
      }, 150);
    }

    if (chewBloom) {
      chewBloom.style.opacity = '1';
      setTimeout(function () { chewBloom.style.opacity = '0'; }, 450);
    }

    if (starsCollected >= 3) showToast();

    setTimeout(resetStage, 1300);
  }

  function getPointerPos(e) {
    var rect = canvas.getBoundingClientRect();
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    var clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  canvas.addEventListener('mousedown', function (e) {
    var pos = getPointerPos(e);
    if (!candy.eaten) {
      var dist = Math.sqrt((pos.x - candy.x) * (pos.x - candy.x) + (pos.y - candy.y) * (pos.y - candy.y));
      /* 22px floor: a finger cannot aim at less, and at 2.12:1 a 320px phone
         draws the candy at a 7px radius. Invisible, so the level is unchanged. */
      if (dist < Math.max(candy.radius * 1.25, 22)) {
        isDraggingCandy = true;
        dragOffset.x = candy.x - pos.x;
        dragOffset.y = candy.y - pos.y;
        return;
      }
    }
    isSlicing = true;
    slicePoints = [pos];
  });

  window.addEventListener('mousemove', function (e) {
    var pos = getPointerPos(e);
    if (isDraggingCandy && !candy.eaten) {
      candy.x = pos.x + dragOffset.x;
      candy.y = pos.y + dragOffset.y;
      candy.oldX = candy.x;
      candy.oldY = candy.y;
    } else if (isSlicing) {
      var last = slicePoints[slicePoints.length - 1];
      slicePoints.push(pos);
      if (slicePoints.length > 8) slicePoints.shift();
      if (last) checkSlice(last, pos);
      if (sliceTrail) {
        sliceTrail.setAttribute('points', slicePoints.map(function (p) {
          return p.x + ',' + p.y;
        }).join(' '));
        sliceTrail.setAttribute('opacity', '1');
      }
    }
  });

  window.addEventListener('mouseup', function () {
    isDraggingCandy = false;
    isSlicing = false;
    slicePoints = [];
    if (sliceTrail) sliceTrail.setAttribute('opacity', '0');
  });

  canvas.addEventListener('touchstart', function (e) {
    var pos = getPointerPos(e);
    if (!candy.eaten) {
      var dist = Math.sqrt((pos.x - candy.x) * (pos.x - candy.x) + (pos.y - candy.y) * (pos.y - candy.y));
      if (dist < Math.max(candy.radius * 1.4, 26)) {
        isDraggingCandy = true;
        dragOffset.x = candy.x - pos.x;
        dragOffset.y = candy.y - pos.y;
        return;
      }
    }
    isSlicing = true;
    slicePoints = [pos];
  }, { passive: true });

  window.addEventListener('touchmove', function (e) {
    var pos = getPointerPos(e);
    if (isDraggingCandy && !candy.eaten) {
      candy.x = pos.x + dragOffset.x;
      candy.y = pos.y + dragOffset.y;
      candy.oldX = candy.x;
      candy.oldY = candy.y;
    } else if (isSlicing) {
      var last = slicePoints[slicePoints.length - 1];
      slicePoints.push(pos);
      if (slicePoints.length > 8) slicePoints.shift();
      if (last) checkSlice(last, pos);
    }
  }, { passive: true });

  window.addEventListener('touchend', function () {
    isDraggingCandy = false;
    isSlicing = false;
    slicePoints = [];
  });

  if (btnReTether) btnReTether.addEventListener('click', resetStage);

  function updatePhysics() {
    if (!candy.eaten) {
      if (!isDraggingCandy) {
        var vx = (candy.x - candy.oldX) * 0.992;
        var vy = (candy.y - candy.oldY) * 0.992;
        candy.oldX = candy.x;
        candy.oldY = candy.y;
        candy.x += vx;
        candy.y += vy + gravity;
      }

      /* Rigid cords: massless and inextensible, they resist stretching but
         allow slack. Solving them jointly on the shared candy position is what
         keeps the cords dead straight. */
      if (!isDraggingCandy) {
        var live = ropes.filter(function (r) { return !r.cut; });
        var ITERS = 14;
        for (var it = 0; it < ITERS; it++) {
          for (var k = 0; k < live.length; k++) {
            var rod = live[k];
            var dx = candy.x - rod.ax;
            var dy = candy.y - rod.ay;
            var d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
            var err = d - rod.rest;
            if (err > 0) {
              candy.x -= (dx / d) * err;
              candy.y -= (dy / d) * err;
            }
          }
        }
      }

      if (candy.x < candy.radius) { candy.x = candy.radius; candy.oldX = candy.x; }
      if (candy.x > width - candy.radius) { candy.x = width - candy.radius; candy.oldX = candy.x; }
      var floor = groundY(candy.x) - candy.radius;
      if (candy.y > floor) {
        candy.y = floor;
        candy.oldY = candy.y + 1;
        /* Ground friction: bleed most horizontal speed on contact so the candy
           settles where it lands instead of sliding away. */
        candy.oldX = candy.x - (candy.x - candy.oldX) * 0.15;
      }
    }

    /* Cut cord stubs swing free under their own weight. */
    for (var ri = 0; ri < ropes.length; ri++) {
      var ropeObj = ropes[ri];
      var stub = ropeObj.stub;
      if (!stub || stub.length < 2) continue;
      var seg = stub[0].seg;

      for (var i = 0; i < stub.length; i++) {
        var n = stub[i];
        if (n.pinned) continue;
        var nvx = (n.x - n.oldX) * 0.992;
        var nvy = (n.y - n.oldY) * 0.992;
        n.oldX = n.x;
        n.oldY = n.y;
        n.x += nvx;
        n.y += nvy + gravity;
      }

      for (var step = 0; step < 10; step++) {
        for (var j = 0; j < stub.length - 1; j++) {
          var a = stub[j];
          var b = stub[j + 1];
          var sdx = b.x - a.x;
          var sdy = b.y - a.y;
          var dd = Math.sqrt(sdx * sdx + sdy * sdy) || 1e-6;
          var diff = (seg - dd) / dd * 0.5;
          if (!a.pinned) {
            a.x -= sdx * diff;
            a.y -= sdy * diff;
          }
          b.x += sdx * diff;
          b.y += sdy * diff;
        }
      }
    }

    /* Star collection */
    stars.forEach(function (s) {
      s.pulse += 0.05;
      if (!s.collected && !candy.eaten) {
        var dist = Math.sqrt((candy.x - s.x) * (candy.x - s.x) + (candy.y - s.y) * (candy.y - s.y));
        if (dist < candy.radius + 18 * u) {
          s.collected = true;
          starsCollected++;
          if (starCounter) starCounter.textContent = starsCollected + ' / 3';
          renderStageStars();
          createSparks(s.x, s.y, '#eab308', 20);
        }
      }
    });

    /* Mouth opens while the candy is closing in, well before the bite */
    var mouth = getOmNomMouthCenter();
    var dxm = candy.x - mouth.x;
    var dym = candy.y - mouth.y;
    var distToMouth = Math.sqrt(dxm * dxm + dym * dym);
    var nearMouth = !candy.eaten && distToMouth < omNomSize * 1.4;
    if (nearMouth !== omnomNear) {
      omnomNear = nearMouth;
      if (!omnomBusy) setOmNomPose(nearMouth ? 'mouth' : 'standard');
    }

    /* Eat detection: a fraction of the sprite (0.44 x 135 = 60 at the reference
       size) rather than a fixed 60px, so the miss does not grow with the stage. */
    if (distToMouth < omNomSize * 0.44 && !candy.eaten) chewCandy();

    for (var si = sparks.length - 1; si >= 0; si--) {
      var sp = sparks[si];
      sp.x += sp.vx;
      sp.y += sp.vy;
      sp.vy += 0.15 * u;
      sp.life -= 0.025;
      /* Kept on the cardboard: a burst at the mouth sits bottom-right, so
         unclamped sparks trailed off the stage onto the page. */
      if (sp.x < 0) { sp.x = 0; sp.vx *= -0.5; }
      if (sp.x > width) { sp.x = width; sp.vx *= -0.5; }
      if (sp.y > height) { sp.y = height; sp.vy *= -0.5; }
      if (sp.life <= 0) sparks.splice(si, 1);
    }
  }

  function drawStar(x, y, scale, pulse) {
    ctx.save();
    ctx.translate(x, y);

    var outer = starR * 0.5 * scale;
    var inner = outer * 0.467;
    var glow = outer * 0.93 + Math.sin(pulse) * 4 * u;
    var grad = ctx.createRadialGradient(0, 0, outer * 0.27, 0, 0, glow + outer * 0.67);
    grad.addColorStop(0, 'rgba(250, 204, 21, 0.7)');
    grad.addColorStop(0.5, 'rgba(234, 179, 8, 0.25)');
    grad.addColorStop(1, 'rgba(234, 179, 8, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, glow + outer * 0.67, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fef08a';
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = Math.max(2, outer * 0.16);
    ctx.beginPath();
    var points = 5;
    for (var i = 0; i < points * 2; i++) {
      var r = i % 2 === 0 ? outer : inner;
      var a = (i * Math.PI) / points - Math.PI / 2;
      var px = Math.cos(a) * r;
      var py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-2, -3, 2.5 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /* Glossy blue bead. Reference pin: light cyan core, medium blue body, dark
     rim, soft contact shadow. */
  function drawGrommet(x, y) {
    var r = pinR;
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = 'rgba(60, 35, 10, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.8, r * 0.95, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    var body = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.08, 0, 0, r);
    body.addColorStop(0, '#c8ecf9');
    body.addColorStop(0.42, '#63b6da');
    body.addColorStop(1, '#2a6b93');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    var lw = Math.max(1, r * 0.12);
    ctx.strokeStyle = 'rgba(26, 52, 72, 0.85)';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(0, 0, r - lw * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.3, -r * 0.36, r * 0.28, r * 0.16, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawCandy(x, y) {
    var r = candy.radius;

    ctx.save();
    ctx.translate(x, y);

    ctx.shadowColor = 'rgba(40, 15, 5, 0.4)';
    ctx.shadowBlur = r * 0.55;
    ctx.shadowOffsetY = r * 0.28;

    var grad = ctx.createRadialGradient(-r * 0.25, -r * 0.25, r * 0.1, 0, 0, r * 1.08);
    grad.addColorStop(0, '#f97316');
    grad.addColorStop(0.6, '#ea580c');
    grad.addColorStop(1, '#9a3412');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = 'transparent';

    /* Pinwheel swirl, clipped to the sphere. Cream, not white: the reference
       swirl samples at rgb(254,230,184). */
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();

    ctx.strokeStyle = '#fde8c8';
    ctx.lineCap = 'round';
    ctx.lineWidth = r * 0.15;
    for (var arm = 0; arm < 3; arm++) {
      var base = (arm * Math.PI * 2) / 3;
      ctx.beginPath();
      for (var t = 0; t <= 1.0001; t += 0.04) {
        var a = base + t * Math.PI * 1.25;
        var rr = r * (0.14 + t * 0.93);
        var px = Math.cos(a) * rr;
        var py = Math.sin(a) * rr;
        if (t === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.33, -r * 0.33, r * 0.29, r * 0.17, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#7c2d12';
    ctx.lineWidth = Math.max(1.2, r * 0.075);
    ctx.beginPath();
    ctx.arc(0, 0, r - ctx.lineWidth * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    ropes.forEach(function (rod) { drawGrommet(rod.ax, rod.ay); });

    stars.forEach(function (s) {
      if (!s.collected) drawStar(s.x, s.y, 1, s.pulse);
    });

    /* Live cords are single straight lines; cut cords keep a limp stub that
       dangles from the pin. */
    ctx.save();
    ctx.strokeStyle = '#3b2413';
    ctx.lineWidth = ropeW;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ropes.forEach(function (rod) {
      if (!rod.cut && !candy.eaten) {
        ctx.beginPath();
        ctx.moveTo(rod.ax, rod.ay);
        ctx.lineTo(candy.x, candy.y);
        ctx.stroke();
      }
      var stub = rod.stub;
      if (stub && stub.length > 1) {
        ctx.beginPath();
        ctx.moveTo(stub[0].x, stub[0].y);
        for (var i = 1; i < stub.length; i++) ctx.lineTo(stub[i].x, stub[i].y);
        ctx.stroke();
      }
    });
    ctx.restore();

    if (!candy.eaten) drawCandy(candy.x, candy.y);

    for (var i = 0; i < sparks.length; i++) {
      var sp = sparks[i];
      ctx.save();
      ctx.globalAlpha = sp.life;
      ctx.fillStyle = sp.color;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /* Don't burn frames while the level is scrolled out of view. */
  var animating = true;
  if ('IntersectionObserver' in window && stage) {
    new IntersectionObserver(function (entries) {
      animating = entries[0].isIntersecting;
    }, { threshold: 0.02 }).observe(stage);
  }

  function loop() {
    if (animating && !document.hidden) {
      updatePhysics();
      draw();
    }
    window.requestAnimationFrame(loop);
  }
  window.requestAnimationFrame(loop);
})();

/* ============ 3. achievement certificates: the "See certificate" lightbox ============ */
(function initLightbox() {
  var lb = document.getElementById('lb');
  if (!lb) return;

  var stageEl = document.getElementById('lb-stage');
  var fullImg = document.getElementById('lb-img');
  var ghostImg = document.getElementById('lb-ghost');
  var titleEl = document.getElementById('lb-title');
  var metaEl = document.getElementById('lb-meta');
  var countEl = document.getElementById('lb-count');
  var openLink = document.getElementById('lb-open');
  var prevBtn = document.getElementById('lb-prev');
  var nextBtn = document.getElementById('lb-next');
  var closeBtn = document.getElementById('lb-close');

  /* Only real buttons (data-proof) join the gallery; the PDF link does not. */
  var triggers = Array.prototype.slice.call(document.querySelectorAll('.ach-proof[data-proof]'));
  if (!triggers.length) return;

  var index = 0;
  var lastFocus = null;

  function show(i) {
    index = (i % triggers.length + triggers.length) % triggers.length;
    var el = triggers[index];
    var src = el.getAttribute('data-proof');
    var thumb = el.querySelector('.ach-proof-thumb');

    lb.classList.remove('is-ready');
    fullImg.removeAttribute('src');
    fullImg.alt = el.getAttribute('data-proof-alt') || '';
    ghostImg.src = thumb ? thumb.getAttribute('src') : '';
    titleEl.textContent = el.getAttribute('data-proof-title') || 'Certificate';
    metaEl.textContent = el.getAttribute('data-proof-meta') || '';
    if (openLink) openLink.href = src;
    countEl.textContent = triggers.length > 1 ? (index + 1) + ' / ' + triggers.length : '';
    prevBtn.hidden = nextBtn.hidden = triggers.length < 2;

    /* The blurred thumbnail holds the space while the real scan arrives:
       on a phone that is the difference between "loading" and "there". */
    fullImg.onload = function () { lb.classList.add('is-ready'); };
    fullImg.onerror = function () { lb.classList.add('is-ready'); };
    fullImg.src = src;
  }

  function openLightbox(i) {
    lastFocus = document.activeElement;
    lb.classList.add('is-open');
    document.body.classList.add('lb-open');
    show(i);
    closeBtn.focus();
  }

  function closeLightbox() {
    lb.classList.remove('is-open');
    document.body.classList.remove('lb-open');
    fullImg.removeAttribute('src');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  triggers.forEach(function (el, i) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      openLightbox(i);
    });
  });

  closeBtn.addEventListener('click', closeLightbox);
  prevBtn.addEventListener('click', function () { show(index - 1); });
  nextBtn.addEventListener('click', function () { show(index + 1); });
  lb.addEventListener('click', function (e) {
    if (e.target === lb || e.target === stageEl) closeLightbox();
  });
  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') show(index - 1);
    else if (e.key === 'ArrowRight') show(index + 1);
  });
})();
