/* Page behaviour: navigation, scrollspy, reveals, the motion switch, the
   data-path and queue animations, skill cross-links, the Projects swarm and
   the contact link. No dependencies. */
(function () {
  "use strict";

  var reduceMQ = matchMedia("(prefers-reduced-motion: reduce)");
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
    sget: function (k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
    sset: function (k, v) { try { sessionStorage.setItem(k, v); } catch (_) {} },
  };

  /* ------------------------------------------------------------ navbar
     One <nav>: a native popover when the links don't fit, inline when they
     do. Script measures the real row instead of guessing a breakpoint. */
  var header = $("#site-header"), inner = $("#header-inner"), menu = $("#site-menu");
  if (header && inner && menu) {
    var isWide = false, collapsedAt = 0;
    var measure = function () {
      var width = inner.clientWidth;
      if (!isWide && collapsedAt && width <= collapsedAt) return; // collapsed: only remeasure when grown
      var wasOpen = menu.matches(":popover-open");
      header.classList.add("is-measuring", "is-wide");
      menu.removeAttribute("popover");
      var fits = inner.scrollWidth <= inner.clientWidth;
      isWide = fits;
      if (!fits) {
        header.classList.remove("is-wide");
        menu.setAttribute("popover", "auto");
        collapsedAt = width;
        if (wasOpen && menu.showPopover) menu.showPopover();
      }
      requestAnimationFrame(function () { header.classList.remove("is-measuring"); });
    };
    var ro = new ResizeObserver(measure);
    ro.observe(header);
    ro.observe(menu);
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a") && menu.matches(":popover-open")) menu.hidePopover();
    });
  }

  /* ------------------------------------------------------------ scrollspy
     Native :target-current where supported; aria-current mirrors it. */
  var links = $$("#site-menu a");
  if (CSS.supports("scroll-target-group: auto")) {
    var syncCurrent = function () {
      var cur = $("#site-menu a:target-current");
      links.forEach(function (l) { l.setAttribute("aria-current", l === cur ? "true" : "false"); });
    };
    syncCurrent();
    document.addEventListener("scrollend", syncCurrent);
  } else {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var id = en.target.id;
        links.forEach(function (l) {
          var on = l.getAttribute("href") === "#" + id;
          l.classList.toggle("target-current", on);
          l.setAttribute("aria-current", on ? "true" : "false");
        });
      });
    }, { rootMargin: "-50% 0px -50% 0px", threshold: 0 });
    $$("main > section[id]:not(#top)").forEach(function (s) { spy.observe(s); });
  }

  /* ------------------------------------------------------------ progress fallback */
  var progress = $("#progress");
  if (progress && !CSS.supports("animation-timeline", "scroll()") && !reduceMQ.matches) {
    var ticking = false;
    var paint = function () {
      ticking = false;
      var max = document.documentElement.scrollHeight - innerHeight;
      progress.style.transform = "scaleX(" + (max > 0 ? scrollY / max : 0) + ")";
    };
    addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(paint); } }, { passive: true });
    paint();
  }

  /* ------------------------------------------------------------ reveal fallback */
  if (!CSS.supports("(animation-timeline: view()) and (animation-range: entry)") && !reduceMQ.matches) {
    var revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); revealIO.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    $$(".reveal").forEach(function (el) {
      // Only what is still below the fold, so nothing on screen blinks out.
      if (el.getBoundingClientRect().top > innerHeight) { el.classList.add("io"); revealIO.observe(el); }
    });
  }

  /* ------------------------------------------------------------ motion switch
     WCAG 2.2.2: everything that moves on its own can be paused. */
  var motionBtn = $("#motion-toggle");
  var paused = store.get("pf:motion") === "paused";
  var applyMotion = function () {
    document.documentElement.classList.toggle("motion-paused", paused);
    if (motionBtn) motionBtn.textContent = paused ? "Play motion" : "Pause motion";
    if (window.OpPicture) window.OpPicture.setPaused(paused);
    syncQueue();
  };
  if (motionBtn) {
    motionBtn.hidden = reduceMQ.matches;
    reduceMQ.addEventListener("change", function () { motionBtn.hidden = reduceMQ.matches; syncQueue(); });
    motionBtn.addEventListener("click", function () {
      paused = !paused;
      store.set("pf:motion", paused ? "paused" : "running");
      applyMotion();
    });
  }

  /* ------------------------------------------------------------ data path */
  var dp = $("#dp");
  if (dp) {
    new IntersectionObserver(function (es) { dp.classList.toggle("is-on", es[0].isIntersecting); }).observe(dp);
  }

  /* ------------------------------------------------------------ OPD queue illustration */
  var queue = $("#queue"), cols = queue ? $$(".q-list", queue) : [];
  var qState = [["T-07", "T-08"], ["T-04", "T-05", "T-06"], ["T-03"], ["T-01", "T-02"]];
  var qNext = 9, qTick = 0, qTimer = 0, qVisible = false, qHold = false;
  function renderQueue(movedTo, movedTok) {
    cols.forEach(function (ul, i) {
      ul.textContent = "";
      qState[i].forEach(function (tok) {
        var li = document.createElement("li");
        li.className = "q-chip" + (i === movedTo && tok === movedTok ? " new" : "");
        li.textContent = tok;
        ul.appendChild(li);
      });
    });
  }
  function advance() {
    // One move per tick, walking back from the last stage so the board never jams.
    var stage = 3 - (qTick % 4), tok;
    if (stage === 0) {
      tok = "T-" + String(qNext++).padStart(2, "0");
      if (qNext > 99) qNext = 1;
      qState[0].push(tok);
    } else if (qState[stage - 1].length) {
      tok = qState[stage - 1].shift();
      qState[stage].push(tok);
      if (stage === 3 && qState[3].length > 3) qState[3].shift();
    }
    qTick++;
    renderQueue(stage, tok);
  }
  function syncQueue() {
    // Held while the swarm draws the cards: re-rendered chips would start out hidden.
    var run = qVisible && !paused && !qHold && !reduceMQ.matches;
    if (run && !qTimer) qTimer = setInterval(advance, 1700);
    else if (!run && qTimer) { clearInterval(qTimer); qTimer = 0; }
  }
  if (queue) {
    renderQueue(-1);
    // Rendering-tied pause where supported; an observer otherwise.
    queue.addEventListener("contentvisibilityautostatechange", function (e) { qVisible = !e.skipped; syncQueue(); });
    new IntersectionObserver(function (es) { qVisible = es[0].isIntersecting; syncQueue(); }).observe(queue);
    var langBtn = $("#lang-toggle");
    if (langBtn) {
      var te = false;
      langBtn.addEventListener("click", function () {
        te = !te;
        $$(".q-col h4", queue).forEach(function (h) {
          h.textContent = te ? h.dataset.te : h.dataset.en;
          if (te) h.setAttribute("lang", "te"); else h.removeAttribute("lang");
        });
        langBtn.textContent = te ? "English" : "తెలుగు";
        langBtn.setAttribute("aria-label", te ? "Show stage names in English" : "Show stage names in Telugu");
        if (!te) langBtn.setAttribute("lang", "te"); else langBtn.removeAttribute("lang");
      });
      langBtn.setAttribute("lang", "te");
    }
  }
  applyMotion();

  /* ------------------------------------------------------------ skills → where used */
  var LABELS = {
    "netra": "WESEE · Trident – NETRA",
    "neemus-wesee": "Neemus · maritime tracking for WESEE",
    "ocf": "Neemus · asset tracking for OCF",
    "dysl": "DYSL-AT internship",
    "sjt": "Sanaathan Jeevan Trust platform",
    "observer": "Observer",
  };
  var note = $("#skill-note");
  var skills = $$(".skill[data-uses]");
  var targetsOf = function (btn) {
    return btn.dataset.uses.split(" ").map(function (id) { return $('[data-id="' + id + '"]'); }).filter(Boolean);
  };
  skills.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var on = btn.getAttribute("aria-pressed") !== "true";
      skills.forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
      $$(".is-linked").forEach(function (el) { el.classList.remove("is-linked"); });
      if (!on) { note.textContent = "Nothing selected yet."; return; }
      btn.setAttribute("aria-pressed", "true");
      var ids = btn.dataset.uses.split(" ");
      var els = targetsOf(btn);
      els.forEach(function (el) { el.classList.add("is-linked"); if (!el.id) el.id = "at-" + el.dataset.id; });
      note.textContent = "";
      var strong = document.createElement("strong");
      strong.textContent = btn.textContent.trim();
      note.append(strong, " — used in: ");
      ids.forEach(function (id, i) {
        var a = document.createElement("a");
        a.href = "#at-" + id;
        a.textContent = LABELS[id] || id;
        note.append(a);
        if (i < ids.length - 1) note.append(", ");
      });
    });
  });

  /* ------------------------------------------------------------ Projects: watch it build
     The swarm draws only the project cards, once per visit, as they scroll in.
     Skipped under reduced motion, in hidden tabs and under automation (unless
     ?swarm=1); Esc, Tab or "Skip" end it at once. */
  var list = $("#projects-list"), section = $("#projects"), replay = $("#rebuild-btn");
  var swarm = null;
  var swarmOpts = function () {
    return {
      root: list,
      tour: false,
      reverse: false,
      endWhenDrawn: true,
      speed: 0.85,
      agents: innerWidth >= 768 ? 12 : 6,
      accent: "#5fe0bd",
      names: ["Kalam", "Sarabhai", "Dhawan", "Bhabha", "Raman", "Ramanujan", "Hopper", "Lovelace",
        "Turing", "Hamilton", "Mercator", "Bowditch", "Harrison", "Zheng He", "Magellan", "Cook"],
      colors: ["#5fe0bd", "#f4b860", "#86b8f0", "#f08a7a", "#b9a3f0", "#7ad0e8", "#e8d36a", "#9fe07a"],
      labels: { building: "Drawing this section", touring: "", hint: "scroll to keep drawing", skip: "Skip" },
      onDone: function () { swarm = null; qHold = false; syncQueue(); },
    };
  };
  var runSwarm = function () {
    if (!window.SwarmRebuild || !list) return;
    if (swarm) swarm.stop();
    qHold = true;
    syncQueue();
    swarm = window.SwarmRebuild.start(swarmOpts());
  };
  if (list && section && window.SwarmRebuild) {
    var forced = window.SwarmRebuild.mode() === "on";
    var autoOK = function () {
      return window.SwarmRebuild.shouldRun({}) && !paused && (forced || store.sget("pf:projects-built") !== "1");
    };
    var io = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return;
      io.disconnect();
      if (!autoOK()) return;
      store.sset("pf:projects-built", "1");
      runSwarm();
    }, { threshold: 0 });
    io.observe(list);
  }
  if (replay) {
    if (!window.SwarmRebuild) replay.hidden = true;
    replay.addEventListener("click", function () {
      list.scrollIntoView({ behavior: reduceMQ.matches ? "auto" : "smooth", block: "start" });
      // Start once the scroll has settled so the cards being drawn are the ones on screen.
      var fired = false;
      var go = function () { if (fired) return; fired = true; document.removeEventListener("scrollend", go); runSwarm(); };
      if ("onscrollend" in window) { document.addEventListener("scrollend", go); setTimeout(go, 900); }
      else setTimeout(go, 600);
    });
  }

  /* ------------------------------------------------------------ contact + clock + year */
  var mail = $("#mail-link");
  if (mail) {
    var addr = mail.dataset.u + "@" + mail.dataset.d;
    mail.href = "mailto:" + addr;
    var t = $("#mail-text");
    if (t) t.textContent = addr;
  }
  var year = $("#year");
  if (year) year.textContent = String(new Date().getFullYear());
  var clock = $("#hud-clock");
  if (clock) {
    var tickClock = function () { if (document.visibilityState === "visible") clock.textContent = new Date().toISOString().slice(11, 19); };
    tickClock();
    setInterval(tickClock, 1000);
  }
})();
