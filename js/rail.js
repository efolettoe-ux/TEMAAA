/* O rail: peças penduradas num cano, com uma física simples.

   Cada peça tem quatro molas independentes:
     - o gancho desliza pelo cano até a sua vaga (as vizinhas abrem espaço
       quando uma peça vira de frente);
     - o cabide gira de lado (perfil) para de frente;
     - a peça balança como um pêndulo, empurrada pelo deslizar do gancho,
       pelo cursor que passa, por uma brisa leve e quando você a arrasta;
     - a barra atrasa em relação aos ombros, o que dá o ar de tecido.
   O giro também torce: os ombros viram primeiro e a barra vem depois, passa
   do ponto e volta. Barras vizinhas não se atravessam: uma peça arremessada
   bate na próxima. Com WebGL, cada foto vira uma superfície curva em 3D
   (js/rail-gl.js); sem WebGL, as mesmas fotos se mexem por CSS. */
(function () {
  "use strict";

  var PRODUCTS = window.PRODUCTS;
  var N = PRODUCTS.length, SUB = 1 / 120, LOW_STOCK = 3, HALF_PI = Math.PI / 2;
  var FABRIC = { "Camiseta": "Algodão penteado premium, 180 g/m²", "Moletom": "Moletom 3 cabos, 310 g/m²" };

  function $(id) { return document.getElementById(id); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function brl(n) { return n == null ? "Em breve" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  var body = document.body;
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  var small = matchMedia("(max-width: 760px)");

  /* ---------------- Montagem ---------------- */
  var rail = $("rail");
  var G = PRODUCTS.map(function (p, i) {
    var el = document.createElement("button");
    el.type = "button";
    el.className = "hang";
    el.setAttribute("aria-label", p.name + ", " + brl(p.price));
    el.innerHTML = '<span class="swing"><img class="v-side" alt="" draggable="false"><img class="v-front" alt="" draggable="false"></span>';
    var front = el.querySelector(".v-front"), side = el.querySelector(".v-side");
    front.src = p.img.rail;
    side.src = p.img.side;
    rail.appendChild(el);
    return {
      i: i, p: p, el: el, sw: el.querySelector(".swing"), front: front, side: side,
      x: 0, vx: 0, tx: 0, w: 0, py: 0, vy: 0, delay: 0,
      t: 0, vt: 0, th: 0, vth: 0, a: 0, va: 0, b: 0, vb: 0, lift: 0, vl: 0, yaw: 0,
      face: false, hidden: false, Wf: 0, Ws: 0
    };
  });

  var geo = { w: 0, h: 0, slot: 0 };
  var active = -1, yawAim = 0, clock = 0, heroVisible = true;
  var hand = { on: false, x: 0, y: 0, vx: 0, t: 0 };
  var grab = null, down = null, suppressClick = false;

  function measure() {
    geo.w = rail.clientWidth;
    geo.h = rail.clientHeight - 6;
    geo.slot = geo.w / N;
    G.forEach(function (g) {
      g.Wf = g.p.aspect.rail * geo.h;
      g.Ws = g.p.aspect.side * geo.h;
      g.el.style.width = g.Wf + "px";
      g.el.style.height = geo.h + "px";
      g.front.style.width = g.Wf + "px";
      g.side.style.width = g.Ws + "px";
    });
    if (gl) gl.resize(geo);
  }

  /* Cada peça quer a sua vaga, alargada até a largura da frente conforme
     vira. O que ela ganha sai das outras, na proporção do quanto ainda estão
     de lado, então a soma é sempre exatamente o cano. */
  function layout() {
    var cap = small.matches ? geo.w * 0.74 : Infinity, want = [], extra = 0, give = 0;
    G.forEach(function (g) {
      var f = clamp(g.t, 0, 1);
      var w = geo.slot + Math.max(0, Math.min(g.Wf * 0.9, cap) - geo.slot) * f;
      want.push(w); extra += w - geo.slot; give += 1 - f;
    });
    var cur = 0;
    G.forEach(function (g, i) {
      var f = clamp(g.t, 0, 1);
      g.w = want[i] - (give > 0 ? extra * (1 - f) / give : 0);
      g.tx = cur + g.w / 2; cur += g.w;
    });
  }

  function halfWidth(g) {
    var f = clamp(g.t, 0, 1);
    return 0.5 * (g.Ws * 0.75 * (1 - f) + g.Wf * 0.72 * f);
  }

  function settleAll() {
    G.forEach(function (g) {
      g.t = g.th = g.i === active ? 1 : 0; g.vt = g.vth = 0;
      g.face = g.t > 0.5;
      g.a = g.va = g.b = g.vb = 0;
      g.lift = g.i === active && !small.matches ? 1 : 0; g.vl = 0;
      g.py = g.vy = 0; g.delay = 0;
    });
    layout();
    G.forEach(function (g) { g.x = g.tx; g.vx = 0; });
  }

  /* ---------------- Física ---------------- */
  function step(dt) {
    clock += dt;
    layout();
    var L = geo.h * 0.55;
    for (var i = 0; i < N; i++) {
      var g = G[i], on = i === active;

      /* o gancho no cano */
      var ax = 90 * (g.tx - g.x) - 15 * g.vx;
      g.vx += ax * dt; g.x += g.vx * dt;

      /* entrada: cada peça cai no cano, uma depois da outra */
      if (g.delay > 0) g.delay -= dt;
      else { var ay = 240 * -g.py - 20 * g.vy; g.vy += ay * dt; g.py += g.vy * dt; }

      /* virar de frente: um pouco subamortecido, passa do ponto e volta */
      var at = 230 * ((on ? 1 : 0) - g.t) - (on ? 26 : 21) * g.vt;
      g.vt += at * dt; g.t = clamp(g.t + g.vt * dt, -0.12, 1.1);
      /* a barra segue os ombros com atraso, por uma mola mais solta */
      var ath = 150 * (g.t - g.th) - 7 * g.vth;
      g.vth += ath * dt; g.th = clamp(g.th + g.vth * dt, -0.2, 1.2);
      /* Qual foto aparece: troca de uma vez, no ângulo em que a frente girada
         fica tão estreita quanto o perfil, com folga para não piscar. */
      var mean = 1 - 0.5 * (g.t + g.th), swap = Math.acos(clamp(g.Ws / g.Wf, 0, 1)) / HALF_PI;
      if (!g.face && mean < swap - 0.03) g.face = true;
      else if (g.face && mean > swap + 0.03) g.face = false;

      /* aproxima de você a peça escolhida */
      var al = 120 * ((on && !small.matches ? 1 : 0) - g.lift) - 20 * g.vl;
      g.vl += al * dt; g.lift += g.vl * dt;
      g.yaw += ((on ? yawAim : 0) - g.yaw) * Math.min(1, 10 * dt);

      /* o pêndulo */
      var wind = !reduced && heroVisible
        ? 0.5 * (on ? 0.3 : 1) * (Math.sin(clock * 0.83 + i * 1.7) * 0.6 + Math.sin(clock * 1.9 + i * 0.6) * 0.4)
        : 0;
      var aa = -22 * Math.sin(g.a) - (on ? 6 : 1.4) * g.va + (ax / L) * Math.cos(g.a) * 0.6 + wind;
      if (grab && grab.g === g) {
        var dx = grab.x - g.x, dy = Math.max(20, grab.y - g.py);
        var want = clamp(Math.atan2(-dx, dy), -1.1, 1.1);
        aa += 160 * (want - g.a) - 14 * g.va;
      }
      g.va += aa * dt; g.a = clamp(g.a + g.va * dt, -1.3, 1.3);

      /* a barra atrasada */
      var ab = 70 * (g.a - g.b) - 6 * g.vb;
      g.vb += ab * dt; g.b += g.vb * dt;

      if (hand.on && !on && !grab) brush(g, dt);
    }
    if (hand.on) hand.vx *= Math.max(0, 1 - 10 * dt);
    collide();
  }

  /* O cursor passando pelo tecido arrasta a peça junto, nunca mais rápido do
     que ele mesmo: devagar afasta as roupas, rápido faz balançar. */
  function brush(g, dt) {
    var y = hand.y - g.py;
    if (y < geo.h * 0.18 || y > geo.h) return;
    var cx = g.x - y * Math.sin(g.a);
    if (Math.abs(hand.x - cx) > halfWidth(g) + 6) return;
    var target = -hand.vx / y;
    g.va += (target - g.va) * (1 - Math.exp(-5 * dt)) * 0.55;
  }

  function collide() {
    var Lh = geo.h * 0.85;
    for (var i = 0; i < N - 1; i++) {
      var A = G[i], B = G[i + 1];
      if (A.hidden || B.hidden) continue;
      var minSep = Math.min((B.x - A.x) * 0.92, 0.8 * (halfWidth(A) + halfWidth(B)));
      var d = (B.x - Lh * Math.sin(B.a)) - (A.x - Lh * Math.sin(A.a));
      if (d >= minSep) continue;
      var c = (minSep - d) / Lh * 0.5;
      A.a += c; B.a -= c;
      if (B.va > A.va) {
        var m = (A.va + B.va) / 2;
        A.va = m - 0.45 * (A.va - m); B.va = m - 0.45 * (B.va - m);
      }
    }
  }

  function moving() {
    for (var i = 0; i < N; i++) {
      var g = G[i];
      if (Math.abs(g.vx) > 0.3 || Math.abs(g.tx - g.x) > 0.3 || Math.abs(g.vy) > 0.3 || g.delay > 0 || Math.abs(g.py) > 0.3) return true;
      if (Math.abs(g.vt) > 0.003 || Math.abs(g.vth) > 0.003 || Math.abs((i === active ? 1 : 0) - g.th) > 0.002) return true;
      if (Math.abs(g.va) > 0.002 || Math.abs(g.a) > 0.002 || Math.abs(g.vb) > 0.002 || Math.abs(g.vl) > 0.003) return true;
    }
    return false;
  }

  var running = false, lastT = 0, accum = 0;
  function frame(now) {
    var dt = clamp((now - lastT) / 1000 || 0.016, 0, 0.05);
    lastT = now; accum += dt;
    var n = 0;
    while (accum >= SUB && n < 8) { step(SUB); accum -= SUB; n++; }
    if (n === 8) accum = 0;
    draw();
    if ((grab || moving() || (!reduced && heroVisible)) && !document.hidden) requestAnimationFrame(frame);
    else running = false;
  }
  function kick() {
    if (reduced) { settleAll(); draw(); return; }
    if (!running) { running = true; lastT = performance.now(); requestAnimationFrame(frame); }
  }

  /* ---------------- Desenho ---------------- */
  var gl = null;
  function draw() {
    if (gl && gl.ready) {
      G.forEach(function (g) { g.el.style.transform = "translate3d(" + (g.x - g.Wf / 2).toFixed(2) + "px," + g.py.toFixed(2) + "px,0)"; });
      gl.render(G, active, clock);
      return;
    }
    G.forEach(function (g) {
      var f = clamp(g.t, -0.1, 1.1);
      g.el.style.transform = "translate3d(" + (g.x - g.Wf / 2).toFixed(2) + "px," + g.py.toFixed(2) + "px,0)";
      g.el.style.zIndex = g.i === active ? 30 : g.face ? 20 : 10;
      g.el.classList.toggle("is-away", g.hidden);
      var lag = clamp(g.b - g.a, -0.3, 0.3);
      g.sw.style.transform = "rotate(" + g.a.toFixed(4) + "rad) skewX(" + (-lag).toFixed(4) + "rad) scale(" + (1 + 0.045 * g.lift).toFixed(4) + ")";
      g.front.style.opacity = g.face ? 1 : 0;
      g.side.style.opacity = g.face ? 0 : 1;
      g.front.style.transform = "translateX(-50%) rotateY(" + ((1 - f) * 86 + g.yaw).toFixed(2) + "deg)";
      g.side.style.transform = "translateX(-50%) rotateY(" + (-f * 70).toFixed(2) + "deg)";
    });
  }

  function left(p, k) { return (p.stock ? p.stock[k] : Infinity) - Bag.count(p.id, p.sizes[k]); }

  /* ---------------- Escolher uma peça ---------------- */
  var live = $("rail-live");
  function setActive(i) {
    if (i === active) return;
    active = i;
    if (i >= 0) {
      live.textContent = PRODUCTS[i].name + ", " + brl(PRODUCTS[i].price);
      if (!reduced) G[i].vy -= geo.h * 0.25;
    }
    updateReadout();
    kick();
  }

  function railXY(e) {
    var r = rail.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top - 6];
  }
  /* Qual peça está sob x, pela posição real de cada uma agora. A que está de
     frente é larga, então o cursor fica nela até sair de verdade. */
  function hitTest(x) {
    if (x < -24 || x > geo.w + 24) return -1;
    var best = -1, dist = Infinity, k, d;
    for (k = 0; k < N; k++) { d = Math.abs(x - G[k].x); if (d <= G[k].w / 2 && d < dist) { best = k; dist = d; } }
    if (best >= 0) return best;
    for (k = 0; k < N; k++) { d = Math.abs(x - G[k].x); if (d < dist) { best = k; dist = d; } }
    return best;
  }

  rail.addEventListener("pointermove", function (e) {
    if (body.classList.contains("view-open")) return;
    var p = railXY(e), now = performance.now();
    if (!reduced) {
      if (hand.on && now > hand.t) hand.vx += (clamp((p[0] - hand.x) / ((now - hand.t) / 1000), -2600, 2600) - hand.vx) * 0.5;
      hand.on = true; hand.x = p[0]; hand.y = p[1]; hand.t = now;
    }
    if (down && !grab && !reduced && down.i >= 0 && Math.hypot(e.clientX - down.cx, e.clientY - down.cy) > 7) {
      grab = { g: G[down.i], x: p[0], y: p[1] };
      rail.classList.add("grabbing");
      try { rail.setPointerCapture(e.pointerId); } catch (err) {}
    }
    if (grab) { grab.x = p[0]; grab.y = p[1]; kick(); return; }
    if (e.pointerType === "mouse" && finePointer.matches && !small.matches) {
      setActive(hitTest(p[0]));
      if (active >= 0) yawAim = clamp((p[0] - G[active].x) / (G[active].w / 2), -1, 1) * 14;
    }
    kick();
  });
  rail.addEventListener("pointerdown", function (e) {
    if (e.button !== 0) return;
    down = { cx: e.clientX, cy: e.clientY, i: hitTest(railXY(e)[0]) };
  });
  function release() {
    down = null;
    if (grab) {
      grab = null; suppressClick = true; rail.classList.remove("grabbing");
      setTimeout(function () { suppressClick = false; }, 0); kick();
    }
  }
  rail.addEventListener("pointerup", release);
  rail.addEventListener("pointercancel", release);
  rail.addEventListener("pointerleave", function () {
    hand.on = false; hand.vx = 0;
    if (!grab && !body.classList.contains("view-open") && finePointer.matches) { setActive(-1); yawAim = 0; }
  });
  rail.addEventListener("click", function (e) {
    if (suppressClick) return;
    var h = e.target.closest(".hang");
    var i = e.detail === 0 && h ? G.map(function (g) { return g.el; }).indexOf(h) : hitTest(railXY(e)[0]);
    if (i < 0) return;
    /* toque: o primeiro vira a peça, o segundo abre */
    if (!finePointer.matches && active !== i) { setActive(i); return; }
    View.open(i);
  });
  G.forEach(function (g, i) {
    g.el.addEventListener("focus", function () {
      if (!body.classList.contains("view-open") && !g.el.matches(":hover")) { yawAim = 0; setActive(i); }
    });
  });
  rail.addEventListener("focusout", function (e) {
    if (!rail.contains(e.relatedTarget) && !body.classList.contains("view-open") && !rail.matches(":hover")) setActive(-1);
  });
  rail.addEventListener("keydown", function (e) {
    var i = G.map(function (g) { return g.el; }).indexOf(document.activeElement);
    if (i < 0 || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
    e.preventDefault();
    G[(i + (e.key === "ArrowRight" ? 1 : N - 1)) % N].el.focus();
  });
  document.addEventListener("pointerdown", function (e) {
    if (!finePointer.matches && active >= 0 && !rail.contains(e.target) && !e.target.closest("#readout") && !body.classList.contains("view-open")) setActive(-1);
  });

  /* Telas pequenas: uma linha embaixo do rail faz o papel da etiqueta */
  var readoutBtn = $("readout-btn");
  function updateReadout() {
    if (active < 0) {
      $("readout-name").textContent = "A arara";
      $("readout-sub").textContent = "Toque numa peça para virá-la";
      readoutBtn.hidden = true;
      return;
    }
    var p = PRODUCTS[active];
    $("readout-name").textContent = p.name;
    $("readout-sub").textContent = brl(p.price) + " · " + p.kind + " · " + p.colour;
    readoutBtn.hidden = false;
  }
  readoutBtn.addEventListener("click", function () { if (active >= 0) View.open(active); });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { heroVisible = es[0].isIntersecting; if (heroVisible) kick(); }).observe(rail);
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) kick(); });
  var resizeT = null;
  addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { measure(); settleAll(); draw(); kick(); }, 120);
  });
  small.addEventListener("change", function () { setActive(-1); });

  /* ---------------- Sacola (em memória) ---------------- */
  var Bag = (function () {
    var lines = [];
    function count(id, size) {
      for (var k = 0; k < lines.length; k++) if (lines[k].id === id && lines[k].size === size) return lines[k].qty;
      return 0;
    }
    function total() { return lines.reduce(function (s, l) { return s + l.qty; }, 0); }
    function add(p, size) {
      var l = lines.filter(function (x) { return x.id === p.id && x.size === size; })[0];
      if (l) l.qty += 1; else lines.push({ id: p.id, size: size, qty: 1 });
      var c = $("bag-count"), n = total();
      c.textContent = n; c.classList.add("on");
      c.classList.remove("pop"); void c.offsetWidth; c.classList.add("pop");
      $("bag-btn").setAttribute("aria-label", "Sacola, " + n + (n === 1 ? " item" : " itens"));
    }
    return { count: count, add: add };
  })();

  /* ---------------- Vista da peça ---------------- */
  var View = (function () {
    var current = 0, picked = null, img = $("view-img");
    var addBtn = $("add-btn"), sizeGrid = $("size-grid");

    function fill(i) {
      var p = PRODUCTS[i];
      img.alt = p.name;
      show(p.rail);
      $("view-count").textContent = pad(i + 1) + " / " + pad(N);
      $("view-kind").textContent = p.kind + " · " + p.colour;
      $("view-name").textContent = p.name;
      $("view-price").textContent = brl(p.price);
      $("view-fit").textContent = FABRIC[p.kind] || "";
      picked = null;
      sizes();
    }
    /* frente ou costas */
    function show(face) {
      img.src = PRODUCTS[current].img[face];
      Array.prototype.forEach.call(document.querySelectorAll("[data-face]"), function (b) {
        b.setAttribute("aria-pressed", String(b.getAttribute("data-face") === face));
      });
    }
    function sizes() {
      var p = PRODUCTS[current];
      sizeGrid.innerHTML = p.sizes.map(function (s, k) {
        var n = left(p, k), note = n <= 0 ? "Esgotado" : n <= LOW_STOCK ? (n === 1 ? "Última" : n + " restam") : "";
        return '<button class="size" type="button" data-size="' + k + '" aria-pressed="' + (picked === k) + '"' + (n <= 0 ? " disabled" : "") +
          ' aria-label="' + s + (note ? ", " + note : "") + '"><span>' + s + "</span>" + (note ? '<small class="' + (n > 0 ? "low" : "") + '">' + note + "</small>" : "") + "</button>";
      }).join("");
      addBtn.disabled = picked === null || p.price == null;
      addBtn.textContent = p.price == null ? "Em breve" : picked === null ? "Escolha um tamanho" : "Adicionar " + p.sizes[picked] + " — " + brl(p.price);
    }
    function markAway(i) { G.forEach(function (g, k) { g.hidden = k === i; }); draw(); }

    function open(i) {
      if (body.classList.contains("view-open")) return;
      current = i; fill(i);
      setActive(i); markAway(i);
      body.classList.add("view-open");
      $("view").setAttribute("aria-hidden", "false");
      if (!reduced && img.animate) img.animate([{ opacity: 0, transform: "translateY(-24px) rotate(-3deg)" }, { opacity: 1, transform: "none" }], { duration: 600, easing: "cubic-bezier(.16,1,.3,1)" });
      setTimeout(function () { $("view-close").focus({ preventScroll: true }); }, 60);
    }
    function close() {
      if (!body.classList.contains("view-open")) return;
      body.classList.remove("view-open");
      $("view").setAttribute("aria-hidden", "true");
      markAway(-1);
      if (!finePointer.matches) setActive(-1);
      G[current].el.focus({ preventScroll: true });
      kick();
    }
    function stepTo(dir) {
      current = (current + dir + N) % N;
      fill(current); setActive(current); markAway(current);
      if (!reduced && img.animate) img.animate([{ opacity: 0, transform: "translateX(" + dir * 50 + "px) rotate(" + dir * 2.5 + "deg)" }, { opacity: 1, transform: "none" }], { duration: 480, easing: "cubic-bezier(.16,1,.3,1)" });
    }

    sizeGrid.addEventListener("click", function (e) {
      var b = e.target.closest(".size");
      if (!b || b.disabled) return;
      picked = Number(b.getAttribute("data-size"));
      sizes();
      addBtn.focus({ preventScroll: true });
    });
    addBtn.addEventListener("click", function () {
      if (picked === null) return;
      Bag.add(PRODUCTS[current], PRODUCTS[current].sizes[picked]);
      close();
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-face]"), function (b) {
      b.addEventListener("click", function () { show(b.getAttribute("data-face")); });
    });
    $("view-prev").addEventListener("click", function () { stepTo(-1); });
    $("view-next").addEventListener("click", function () { stepTo(1); });
    $("view-close").addEventListener("click", close);
    $("view-stage").addEventListener("click", function (e) { if (e.target.id === "view-stage") close(); });
    document.addEventListener("keydown", function (e) {
      if (!body.classList.contains("view-open")) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") stepTo(1);
      else if (e.key === "ArrowLeft") stepTo(-1);
    });
    return { open: open };
  })();

  /* ---------------- Início ---------------- */
  measure();
  settleAll();
  if (!reduced) {
    /* as peças caem no cano uma depois da outra */
    G.forEach(function (g, i) { g.py = -geo.h * 0.22; g.delay = 0.12 + i * 0.07; g.va = (i % 2 ? 1 : -1) * 0.25; });
  }
  updateReadout();
  draw();
  kick();
  if (window.RailGL) {
    gl = window.RailGL(rail, G, reduced);
    if (gl) gl.load().then(function () { gl.resize(geo); rail.classList.add("gl"); draw(); kick(); });
  }
})();
