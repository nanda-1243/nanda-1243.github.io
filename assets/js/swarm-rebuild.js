/*!
 * swarm-rebuild.js — the page draws itself in front of the visitor.
 *
 * A flock of named cursors rebuilds the LIVE page element by element: a
 * drag-drawn frame (with ruler guides and a size readout) for anything that
 * has its own paint, a typed sweep for text, a crossed placeholder for media.
 * The DOM is never repainted or cloned — not-yet-drawn elements are simply
 * `visibility: hidden` (they keep their box, so nothing reflows), which means
 * videos, web fonts, any script's shaping and the page's own animations keep
 * running underneath.
 *
 *  - Tour: it scrolls itself, slowly, waiting for the cursors to catch up.
 *    Any wheel / touch / key hands control back to the visitor.
 *  - Scrub: the build follows the scroll position. Scroll back up and the
 *    cursors un-draw what falls below the line; scroll down and they redraw.
 *  - Reaching the bottom with everything drawn "goes live": the overlay fades
 *    and the page is completely normal again.
 *
 * Never runs under prefers-reduced-motion, in a hidden tab, or under
 * automation (navigator.webdriver) unless forced with ?swarm=1. ?swarm=off
 * disables it. Esc, Tab, or the "Show it now" pill end it at once.
 *
 * Original implementation (clean-room). MIT licence. No dependencies.
 * Portfolio copy: adds the `endWhenDrawn` option (section-scoped builds).
 *
 * Usage
 *   <script src="swarm-rebuild.js" data-auto></script>          // whole body
 *   SwarmRebuild.start({ root: el, tour: true, reverse: true }) // returns { stop }
 *   if (SwarmRebuild.shouldRun()) SwarmRebuild.start(...)
 */
(function () {
  "use strict";
  if (typeof window === "undefined" || window.SwarmRebuild) return;

  var BUILT = "data-swarm-built";
  var UI = "data-swarm-ui";
  var MEDIA = { IMG: 1, VIDEO: 1, CANVAS: 1, PICTURE: 1, IFRAME: 1, svg: 1 };

  var DEFAULTS = {
    root: null, //            element or selector; default document.body
    agents: null, //          cursor count; null = 16 desktop / 8 under 768px
    speed: 0.6, //            pace multiplier: <1 slower, >1 faster
    tour: true, //            scroll itself through the page
    tourSpeed: 60, //         px/s while touring (scaled by speed)
    tourDelay: 900, //        ms to linger on the first screen before moving
    reverse: true, //         scrolling up un-draws what falls below the line
    frontier: 0.82, //        how far down the viewport counts as "drawn" (0..1)
    maxMs: 300000, //         hard stop: go live after this long regardless
    once: false, //           only once per browser session
    zIndex: 2147482000,
    accent: "#E8A33D", //     HUD button colour
    names: [
      "Ada", "Grace", "Alan", "Hedy", "Linus", "Radia", "Ken", "Barbara",
      "Dennis", "Frances", "Edsger", "Margaret", "Tim", "Katherine", "Donald", "Joan",
    ],
    colors: [
      "#E8833A", "#7FA36B", "#D9A441", "#5BA4C9", "#C8664F", "#9B7FC9",
      "#4FB39A", "#E0698C", "#B9A03C", "#6C8FE0", "#D2783F", "#58B0B0",
    ],
    labels: {
      building: "Drawing this page",
      touring: "auto-scrolling — scroll to take over",
      hint: "scroll to keep going",
      skip: "Show it now",
    },
    scrollBy: null, //        fn(dy) — adapter for smooth-scroll libraries (Lenis etc.)
    onDone: null, //          fn() — called once the page is live
    endWhenDrawn: false, //   go live as soon as everything under root is drawn,
    //                        instead of waiting for the bottom of the page
    //                        (for a single section rather than the whole page)
  };

  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

  function merge(o) {
    var r = {}, k;
    for (k in DEFAULTS) r[k] = DEFAULTS[k];
    for (k in o || {}) if (o[k] !== undefined) r[k] = o[k];
    r.labels = Object.assign({}, DEFAULTS.labels, (o && o.labels) || {});
    return r;
  }

  /** ?swarm=off|0 → "off", ?swarm=on|1 → "on", else "auto". */
  function mode(search) {
    var v = null;
    try { v = new URLSearchParams(search == null ? location.search : search).get("swarm"); } catch (_) {}
    if (v === "off" || v === "0") return "off";
    if (v === "on" || v === "1") return "on";
    return "auto";
  }

  function shouldRun(opts) {
    var o = merge(opts), m = mode();
    if (m === "off" || document.visibilityState !== "visible") return false;
    if (m === "on") return true;
    try { if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false; } catch (_) {}
    if (navigator.webdriver) return false;
    if (o.once) { try { if (sessionStorage.getItem("swarm:done") === "1") return false; } catch (_) {} }
    return true;
  }

  function alpha(c) {
    if (!c || c === "transparent") return 0;
    var s = c.match(/\/\s*([\d.]+)(%?)\s*\)/);
    if (s) return parseFloat(s[1]) / (s[2] ? 100 : 1);
    var m = c.match(/^rgba\(([^)]+)\)/);
    if (m) { var p = m[1].split(","); return p.length > 3 ? parseFloat(p[3]) : 1; }
    return 1;
  }

  function paints(cs) {
    if (alpha(cs.backgroundColor) > 0.02 || cs.backgroundImage !== "none") return true;
    if (cs.boxShadow !== "none") return true;
    var sides = ["top", "right", "bottom", "left"];
    for (var i = 0; i < 4; i++) {
      var s = sides[i];
      if (parseFloat(cs.getPropertyValue("border-" + s + "-width")) > 0 &&
          cs.getPropertyValue("border-" + s + "-style") !== "none" &&
          alpha(cs.getPropertyValue("border-" + s + "-color")) > 0.02) return true;
    }
    return false;
  }

  function ownText(el) {
    var n = 0;
    for (var c = el.firstChild; c; c = c.nextSibling)
      if (c.nodeType === 3) n += (c.textContent || "").trim().length;
    return n;
  }

  function injectStyle(o) {
    var st = document.createElement("style");
    st.setAttribute(UI, "");
    st.textContent =
      ".swarm-building :not([" + BUILT + "]):not(svg *):not([" + UI + "]):not([" + UI + "] *){visibility:hidden!important}" +
      ".swarm-canvas{position:fixed;inset:0;width:100vw;height:100vh;z-index:" + o.zIndex + ";pointer-events:none;transition:opacity .45s ease}" +
      ".swarm-hud{position:fixed;z-index:" + (o.zIndex + 1) + ";left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);" +
      "display:flex;align-items:center;gap:12px;width:max-content;max-width:calc(100vw - 32px);padding:7px 7px 7px 16px;border-radius:999px;" +
      "background:rgba(14,12,10,.84);border:1px solid rgba(255,255,255,.16);color:#d6d0c6;font:500 12.5px/1.3 system-ui,-apple-system,'Segoe UI',sans-serif;" +
      "-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);font-variant-numeric:tabular-nums;transition:opacity .3s}" +
      ".swarm-hud span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".swarm-hud button{flex:none;border:0;border-radius:999px;padding:7px 14px;cursor:pointer;background:" + o.accent + ";color:#1a1108;font:inherit;font-weight:700}" +
      ".swarm-hud button:focus-visible{outline:2px solid #fff;outline-offset:2px}";
    document.head.appendChild(st);
    return st;
  }

  function start(opts) {
    var o = merge(opts);
    var root = typeof o.root === "string" ? document.querySelector(o.root) : o.root || document.body;
    if (!root) return { stop: function () {} };
    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d");
    if (!ctx) return { stop: function () {} };

    var speed = Math.max(0.1, o.speed);
    var items = [];
    var seen = new WeakSet();
    var fixedOf = new WeakMap();
    var done = false, raf = 0, last = 0;
    var started = performance.now();
    var tour = o.tour ? "wait" : "off"; // wait → run → end | off
    var tourAcc = 0;
    var lastSy = scrollY, dirUp = false;
    var finishing = 0;

    var style = injectStyle(o);
    root.classList.add("swarm-building");
    canvas.className = "swarm-canvas";
    canvas.setAttribute(UI, "");
    canvas.setAttribute("aria-hidden", "true");
    var hud = document.createElement("div");
    hud.className = "swarm-hud";
    hud.setAttribute(UI, "");
    hud.setAttribute("role", "status");
    var hudText = document.createElement("span");
    var skip = document.createElement("button");
    skip.type = "button";
    skip.textContent = o.labels.skip;
    skip.setAttribute("data-testid", "swarm-skip");
    hud.appendChild(hudText);
    hud.appendChild(skip);
    document.body.appendChild(canvas);
    document.body.appendChild(hud);

    var dpr = 1;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(innerWidth * dpr);
      canvas.height = Math.round(innerHeight * dpr);
    }
    resize();

    function measure(it, sy) {
      var r = it.el.getBoundingClientRect();
      it.top = r.top + (it.fixed ? 0 : sy);
      it.bottom = r.bottom + (it.fixed ? 0 : sy);
    }

    function scan() {
      var sy = scrollY, all = root.querySelectorAll("*");
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (seen.has(el)) continue;
        seen.add(el);
        if (el.closest("[" + UI + "]")) continue;
        if (el instanceof SVGElement && el.tagName !== "svg") continue; // rides with its <svg>
        var cs = getComputedStyle(el);
        var fixed = cs.position === "fixed" || (el.parentElement && fixedOf.get(el.parentElement)) || false;
        fixedOf.set(el, fixed);
        var r = el.getBoundingClientRect();
        var chars = ownText(el);
        var kind = MEDIA[el.tagName] ? "media" : chars > 0 ? "text" : paints(cs) ? "box" : null;
        if (!kind || cs.display === "none" || r.width < 2 || r.height < 2) {
          el.setAttribute(BUILT, ""); // layout-only or invisible: nothing to draw
          continue;
        }
        var fs = parseFloat(cs.fontSize) || 16, lh = parseFloat(cs.lineHeight);
        items.push({
          el: el, kind: kind, fixed: fixed, top: 0, bottom: 0,
          ownClip: cs.clipPath !== "none", chars: chars,
          lineH: isFinite(lh) ? lh : fs * 1.25,
          prog: 0, agent: null, prevClip: undefined,
        });
        measure(items[items.length - 1], sy);
      }
      // Layout shifts (images, fonts, lazy content): refresh every position.
      for (var j = 0; j < items.length; j++) if (!items[j].agent) measure(items[j], sy);
      items.sort(function (a, b) { return a.fixed === b.fixed ? a.top - b.top : a.fixed ? -1 : 1; });
    }
    scan();
    var rescan = setInterval(scan, 1000);

    var n = o.agents || (innerWidth >= 768 ? 16 : 8);
    var agents = [];
    for (var i = 0; i < n; i++) {
      var edge = i % 4;
      var x = edge === 0 ? -30 : edge === 1 ? innerWidth + 30 : Math.random() * innerWidth;
      var y = edge === 2 ? -30 : edge === 3 ? innerHeight + 30 : Math.random() * innerHeight;
      agents.push({
        name: o.names[i % o.names.length], color: o.colors[i % o.colors.length],
        x: x, y: y, item: null, phase: "idle", t0: 0, dur: 0, fx: x, fy: y,
        wx: Math.random() * innerWidth, wy: Math.random() * innerHeight,
      });
    }

    function shape(it, r, p) {
      if (it.kind === "text") {
        var lines = Math.max(1, Math.round(r.height / it.lineH));
        var total = p * lines;
        var li = Math.min(lines - 1, Math.floor(total));
        var frac = p >= 1 ? 1 : total - li;
        var y1 = (li * r.height) / lines, y2 = ((li + 1) * r.height) / lines, xx = frac * r.width;
        return {
          x: r.left + xx, y: r.top + (y1 + y2) / 2, y1: y1, y2: y2,
          clip: "polygon(0 0," + r.width + "px 0," + r.width + "px " + y1 + "px," + xx + "px " + y1 + "px," + xx + "px " + y2 + "px,0 " + y2 + "px)",
        };
      }
      var q = (1 - p) * 100;
      return { x: r.left + p * r.width, y: r.top + p * r.height, y1: 0, y2: 0, clip: "inset(0 " + q + "% " + q + "% 0)" };
    }

    /** Single source of truth for how an element looks at progress p. */
    function setProg(it, p, r) {
      it.prog = p;
      var el = it.el;
      if (p <= 0) {
        el.removeAttribute(BUILT);
      } else if (p >= 1 || it.ownClip) {
        if (p >= 1) el.setAttribute(BUILT, ""); else el.removeAttribute(BUILT);
      } else {
        if (it.prevClip === undefined) it.prevClip = el.style.clipPath;
        el.setAttribute(BUILT, "");
        el.style.clipPath = shape(it, r || el.getBoundingClientRect(), ease(p)).clip;
        return;
      }
      if (it.prevClip !== undefined) { el.style.clipPath = it.prevClip; it.prevClip = undefined; }
    }

    function durationOf(it, r, backlog) {
      var base = it.kind === "text"
        ? clamp(220 + it.chars * 14, 260, 1300)
        : clamp(320 + Math.sqrt(r.width * r.height) * 0.9, 380, 1100) + (it.kind === "media" ? 120 : 0);
      return (base / speed) * (backlog > agents.length * 4 ? 0.55 : 1);
    }

    function stop(fade) {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      clearInterval(rescan);
      removeEventListener("resize", resize);
      removeEventListener("keydown", onKey, true);
      removeEventListener("wheel", takeOver);
      removeEventListener("touchstart", takeOver);
      removeEventListener("pointerdown", takeOver);
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.prevClip !== undefined) { it.el.style.clipPath = it.prevClip; it.prevClip = undefined; }
      }
      root.classList.remove("swarm-building");
      var b = root.querySelectorAll("[" + BUILT + "]");
      for (var j = 0; j < b.length; j++) b[j].removeAttribute(BUILT);
      hud.remove();
      style.remove();
      try { sessionStorage.setItem("swarm:done", "1"); } catch (_) {}
      if (typeof o.onDone === "function") { try { o.onDone(); } catch (_) {} }
      if (!fade) return canvas.remove();
      canvas.style.opacity = "0";
      setTimeout(function () { canvas.remove(); }, 480);
    }

    function takeOver() { if (tour !== "off") tour = "off"; }
    function onKey(e) {
      // Hidden content cannot take focus: a keyboard user never lands in a half-drawn page.
      if (e.key === "Escape" || e.key === "Tab") return stop(true);
      if (/^(Arrow(Up|Down)|Page(Up|Down)|Home|End| )$/.test(e.key)) takeOver();
    }
    addEventListener("keydown", onKey, true);
    addEventListener("resize", resize);
    addEventListener("wheel", takeOver, { passive: true });
    addEventListener("touchstart", takeOver, { passive: true });
    addEventListener("pointerdown", takeOver, { passive: true });
    skip.addEventListener("click", function () { stop(true); });

    function scrollStep(dy) {
      tourAcc += dy;
      var whole = tourAcc >= 1 ? Math.floor(tourAcc) : 0;
      if (!whole) return;
      tourAcc -= whole;
      if (typeof o.scrollBy === "function") o.scrollBy(whole);
      else window.scrollBy(0, whole);
    }

    var frontierMax = 0;

    function tick(now) {
      var dt = Math.min(50, now - (last || now));
      last = now;
      var vw = innerWidth, vh = innerHeight, sy = scrollY;
      if (now - started > o.maxMs) return stop(true);
      if (sy < lastSy - 1) dirUp = true; else if (sy > lastSy + 1) dirUp = false;
      lastSy = sy;

      var docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      var atBottom = sy + vh >= docH - 2;
      var frontier = atBottom ? Infinity : sy + vh * o.frontier;
      if (!o.reverse) frontier = frontierMax = Math.max(frontierMax, frontier);

      // What each element should be (drawn or not); off-screen changes snap.
      var builds = [], erases = [], visiblePending = 0, sum = 0;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        sum += it.prog;
        var tgt = it.fixed || it.top < frontier ? 1 : 0;
        if (it.prog === tgt || it.agent) continue;
        var inView = it.fixed || (it.bottom > sy && it.top < sy + vh);
        if (!inView) { setProg(it, tgt); continue; }
        visiblePending++;
        (tgt ? builds : erases).push(it);
      }
      erases.reverse(); // un-draw bottom-up

      var queues = dirUp ? [erases, builds] : [builds, erases];
      for (var a = 0; a < agents.length; a++) {
        var ag = agents[a];
        if (ag.phase !== "idle") continue;
        var list = queues[0].length ? queues[0] : queues[1];
        if (!list.length) break;
        // Of the next few in order, the one nearest this cursor.
        var best = 0, bestD = Infinity;
        for (var k = 0; k < Math.min(8, list.length); k++) {
          var rr = list[k].el.getBoundingClientRect();
          var d = Math.hypot(rr.left - ag.x, rr.top - ag.y);
          if (d < bestD) { bestD = d; best = k; }
        }
        var pick = list.splice(best, 1)[0];
        pick.agent = ag;
        ag.item = pick;
        ag.phase = "travel";
        ag.t0 = now;
        ag.fx = ag.x;
        ag.fy = ag.y;
        ag.dur = clamp(bestD / 1.8, 200, 620) / Math.sqrt(speed);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, vw, vh);

      for (var g = 0; g < agents.length; g++) {
        var A = agents[g], I = A.item;
        if (!I) {
          if (Math.hypot(A.wx - A.x, A.wy - A.y) < 8) {
            A.wx = clamp(A.x + (Math.random() - 0.5) * 240, 20, vw - 20);
            A.wy = clamp(A.y + (Math.random() - 0.5) * 200, 60, vh - 40);
          }
          A.x += (A.wx - A.x) * 0.02;
          A.y += (A.wy - A.y) * 0.02;
          continue;
        }
        var r = I.el.getBoundingClientRect();
        var want = I.fixed || I.top < frontier ? 1 : 0;
        if (A.phase === "travel") {
          var p = clamp((now - A.t0) / A.dur, 0, 1);
          var s0 = shape(I, r, ease(I.prog));
          var sx = I.kind === "text" || I.prog > 0 ? s0.x : r.left;
          var syy = I.kind === "text" ? s0.y : I.prog > 0 ? s0.y : r.top;
          A.x = A.fx + (sx - A.fx) * ease(p);
          A.y = A.fy + (syy - A.fy) * ease(p);
          if (p >= 1) { A.phase = "work"; A.dur = durationOf(I, r, visiblePending); }
          if (I.prog === want) release(A);
          continue;
        }
        // work: move progress toward whatever the scroll now asks for
        var step = dt / A.dur;
        var np = want > I.prog ? Math.min(1, I.prog + step) : Math.max(0, I.prog - step);
        setProg(I, np, r);
        var s = shape(I, r, ease(np));
        A.x = s.x;
        A.y = s.y;
        drawWork(I, r, s, A.color, ease(np), want === 0);
        if (np === want) release(A);
      }

      for (var c = 0; c < agents.length; c++) drawCursor(agents[c]);

      // Tour: glide down while the cursors keep up; pause when they fall behind.
      if (tour === "wait" && (now - started > o.tourDelay + 1200 || (visiblePending === 0 && now - started > o.tourDelay))) tour = "run";
      if (tour === "run") {
        if (atBottom) tour = "end";
        else if (visiblePending <= agents.length * 1.2) scrollStep((o.tourSpeed * speed * dt) / 1000);
      }

      var pct = Math.round((sum / Math.max(1, items.length)) * 100);
      var allDone = sum >= items.length - 1e-6 && agents.every(function (x) { return !x.item; });
      var tail = tour === "run" ? " — " + o.labels.touring : tour === "off" && !atBottom && !builds.length ? " — " + o.labels.hint : "";
      hudText.textContent = o.labels.building + " · " + pct + "%" + tail;
      if (allDone && (atBottom || o.endWhenDrawn)) {
        if (!finishing) finishing = now;
        if (now - finishing > 700) return stop(true);
      } else finishing = 0;
    }

    function release(A) {
      if (A.item) A.item.agent = null;
      A.item = null;
      A.phase = "idle";
      A.wx = A.x;
      A.wy = A.y;
    }

    function drawWork(it, r, s, color, p, erasing) {
      ctx.save();
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = color;
      if (erasing) ctx.setLineDash([3, 3]);
      if (it.kind === "text") {
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = color;
        ctx.fillRect(r.left, r.top + s.y1, s.x - r.left, s.y2 - s.y1);
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(s.x + 0.5, r.top + s.y1);
        ctx.lineTo(s.x + 0.5, r.top + s.y2);
        ctx.stroke();
        ctx.restore();
        return;
      }
      var w = s.x - r.left, h = s.y - r.top;
      if (!erasing) {
        // Ruler guides off the frame's corner, like snapping in a design tool.
        ctx.globalAlpha = 0.28 * (1 - p);
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, r.top + 0.5); ctx.lineTo(innerWidth, r.top + 0.5);
        ctx.moveTo(r.left + 0.5, 0); ctx.lineTo(r.left + 0.5, innerHeight);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      ctx.strokeRect(r.left + 0.5, r.top + 0.5, w, h);
      if (it.kind === "media") {
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.moveTo(r.left, r.top); ctx.lineTo(r.left + w, r.top + h);
        ctx.moveTo(r.left + w, r.top); ctx.lineTo(r.left, r.top + h);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      var label = Math.round(w) + " × " + Math.round(h);
      ctx.setLineDash([]);
      ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
      var tw = ctx.measureText(label).width + 10, lx = r.left + w / 2 - tw / 2, ly = r.top + h + 6;
      ctx.fillStyle = color;
      roundRect(lx, ly, tw, 16, 3);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(label, lx + 5, ly + 11.5);
      ctx.restore();
    }

    function roundRect(x, y, w, h, rad) {
      ctx.beginPath();
      if (ctx.roundRect) { ctx.roundRect(x, y, w, h, rad); return; }
      ctx.rect(x, y, w, h);
    }

    function drawCursor(A) {
      ctx.save();
      ctx.translate(A.x, A.y);
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(0, 16); ctx.lineTo(4.5, 12.2); ctx.lineTo(7.5, 18.5);
      ctx.lineTo(10, 17.4); ctx.lineTo(7.2, 11.2); ctx.lineTo(12.5, 11.2);
      ctx.closePath();
      ctx.fillStyle = A.color;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.25;
      ctx.fill();
      ctx.stroke();
      ctx.font = "600 11px system-ui, -apple-system, 'Segoe UI', sans-serif";
      var tw = ctx.measureText(A.name).width + 12;
      roundRect(12, 18, tw, 18, 4);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(A.name, 18, 31);
      ctx.restore();
    }

    function frame(now) {
      if (done) return;
      try { tick(now); } catch (err) { console.error("[swarm-rebuild]", err); stop(false); return; }
      if (!done) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return { stop: function () { stop(false); }, finish: function () { stop(true); } };
  }

  window.SwarmRebuild = { start: start, shouldRun: shouldRun, mode: mode, defaults: DEFAULTS };

  // <script src="swarm-rebuild.js" data-auto data-root="main" data-tour="false" data-speed="0.5">
  var me = document.currentScript;
  if (me && me.hasAttribute("data-auto")) {
    var ds = me.dataset;
    // Loaded from <head>: hide the page before its first paint, so it never
    // flashes up and then blanks. Lifted the moment start() takes over.
    var pre = null;
    if (shouldRun({ once: ds.once === "true" })) {
      pre = document.createElement("style");
      pre.setAttribute(UI, "");
      pre.textContent = "body{visibility:hidden}";
      document.head.appendChild(pre);
    }
    var go = function () {
      if (pre) pre.remove();
      var opts = {
        root: ds.root || null,
        tour: ds.tour ? ds.tour !== "false" : undefined,
        reverse: ds.reverse ? ds.reverse !== "false" : undefined,
        speed: ds.speed ? parseFloat(ds.speed) : undefined,
        once: ds.once === "true" || undefined,
      };
      if (shouldRun(opts)) start(opts);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go, { once: true });
    else go();
  }
})();
