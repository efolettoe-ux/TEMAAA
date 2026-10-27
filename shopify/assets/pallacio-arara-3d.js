/* PALLACIO: Arara 3D (section pallacio-arara-3d).

   Peças penduradas num cano, com uma física simples. Cada peça tem molas
   independentes:
     - o gancho desliza pelo cano até a sua vaga (as vizinhas abrem espaço
       quando uma peça vira de frente);
     - o cabide gira de lado para de frente, e a barra vem depois dos ombros,
       passa do ponto e volta;
     - a peça balança como um pêndulo, empurrada pelo deslizar do gancho, pelo
       cursor que passa e quando você a arrasta; barras vizinhas se batem.
   Com WebGL (pallacio-arara-3d-gl.js), cada foto vira uma superfície curva em
   3D; sem WebGL, as mesmas fotos se mexem por CSS.

   Desktop: passar o mouse vira a peça, clicar abre. Celular: deslizar o dedo
   pela arara vira as peças, tocar abre. A peça aberta mostra frente/costas,
   tamanhos da cor da foto e adiciona ao carrinho da loja.

   Versão para o tema do js/rail.js do repositório TEMAAA: várias arara por
   página, dados vindos do Liquid, carrinho de verdade. */
(function () {
  "use strict";

  var SUB = 1 / 120, HALF_PI = Math.PI / 2;
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  var small = matchMedia("(max-width: 760px)");
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function root() { return (window.Shopify && Shopify.routes && Shopify.routes.root) || "/"; }

  function loaded(im) {
    if (im.complete && im.naturalWidth) return Promise.resolve();
    return new Promise(function (r) { im.addEventListener("load", r, { once: true }); im.addEventListener("error", r, { once: true }); });
  }

  function Arara(el) {
    var self = this;
    this.el = el;
    try { this.P = JSON.parse(el.querySelector("[data-pa3d-data]").textContent || "[]"); } catch (e) { this.P = []; }
    this.P = this.P.filter(function (p) { return p.img.rail && p.img.side; });
    if (!this.P.length) return;
    this.N = this.P.length;
    el.style.setProperty("--n", this.N);
    this.q = function (s) { return el.querySelector(s); };
    this.rail = this.q("[data-pa3d-rail]");
    this.geo = { w: 0, h: 0, slot: 0 };
    this.active = -1; this.yawAim = 0; this.clock = 0;
    this.hand = { on: false, x: 0, y: 0, vx: 0, t: 0 };
    this.grab = null; this.down = null; this.suppressClick = false;
    this.running = false; this.gl = null; this.open = false;
    this.build();
    var ims = [];
    this.G.forEach(function (g) { ims.push(g.front, g.side); });
    /* as proporções saem das próprias fotos, então espera todas carregarem */
    Promise.all(ims.map(loaded)).then(function () {
      self.G.forEach(function (g) {
        g.p.aspect = { rail: g.front.naturalWidth / g.front.naturalHeight || 0.76, side: g.side.naturalWidth / g.side.naturalHeight || 0.25 };
      });
      self.start();
    });
  }

  /* ---------------- Montagem ---------------- */
  Arara.prototype.build = function () {
    var self = this;
    this.G = this.P.map(function (p, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "pa3d__hang";
      b.setAttribute("aria-label", p.name + (p.priceLabel ? ", " + p.priceLabel : ""));
      b.innerHTML = '<span class="pa3d__swing"><img class="pa3d__side" alt="" draggable="false"><img class="pa3d__front" alt="" draggable="false"></span>';
      var front = b.querySelector(".pa3d__front"), side = b.querySelector(".pa3d__side");
      front.crossOrigin = side.crossOrigin = "anonymous"; /* o WebGL precisa ler as fotos */
      front.src = p.img.rail; side.src = p.img.side;
      self.rail.appendChild(b);
      return {
        i: i, p: p, el: b, sw: b.querySelector(".pa3d__swing"), front: front, side: side,
        x: 0, vx: 0, tx: 0, w: 0, py: 0, vy: 0, delay: 0,
        t: 0, vt: 0, th: 0, vth: 0, a: 0, va: 0, b: 0, vb: 0, lift: 0, vl: 0, yaw: 0,
        face: false, hidden: false, Wf: 0, Ws: 0, Hs: 0
      };
    });
  };

  Arara.prototype.measure = function () {
    var geo = this.geo;
    geo.w = this.rail.clientWidth;
    geo.h = this.rail.clientHeight - 6;
    geo.slot = geo.w / this.N;
    this.G.forEach(function (g) {
      g.Hs = geo.h * (g.p.scale || 1);
      g.Wf = g.p.aspect.rail * g.Hs;
      g.Ws = g.p.aspect.side * g.Hs;
      g.el.style.width = g.Wf + "px";
      g.el.style.height = geo.h + "px";
      g.front.style.width = g.Wf + "px";
      g.side.style.width = g.Ws + "px";
      g.front.style.height = g.side.style.height = g.Hs + "px";
    });
    if (this.gl) this.gl.resize(geo);
  };

  /* Cada peça quer a sua vaga, alargada até a largura da frente conforme
     vira. O que ela ganha sai das outras, na proporção do quanto ainda estão
     de lado, então a soma é sempre exatamente o cano. */
  Arara.prototype.layout = function () {
    var geo = this.geo, cap = small.matches ? geo.w * 0.74 : Infinity, want = [], extra = 0, give = 0;
    this.G.forEach(function (g) {
      var f = clamp(g.t, 0, 1);
      var w = geo.slot + Math.max(0, Math.min(g.Wf * 0.9, cap) - geo.slot) * f;
      want.push(w); extra += w - geo.slot; give += 1 - f;
    });
    var cur = 0;
    this.G.forEach(function (g, i) {
      var f = clamp(g.t, 0, 1);
      g.w = want[i] - (give > 0 ? extra * (1 - f) / give : 0);
      g.tx = cur + g.w / 2; cur += g.w;
    });
  };

  function halfWidth(g) {
    var f = clamp(g.t, 0, 1);
    return 0.5 * (g.Ws * 0.75 * (1 - f) + g.Wf * 0.72 * f);
  }

  Arara.prototype.settleAll = function () {
    var self = this;
    this.G.forEach(function (g) {
      g.t = g.th = g.i === self.active ? 1 : 0; g.vt = g.vth = 0;
      g.face = g.t > 0.5;
      g.a = g.va = g.b = g.vb = 0;
      g.lift = g.i === self.active && !small.matches ? 1 : 0; g.vl = 0;
      g.py = g.vy = 0; g.delay = 0;
    });
    this.layout();
    this.G.forEach(function (g) { g.x = g.tx; g.vx = 0; });
  };

  /* ---------------- Física ---------------- */
  Arara.prototype.step = function (dt) {
    var geo = this.geo, G = this.G, grab = this.grab, hand = this.hand;
    this.clock += dt;
    this.layout();
    var L = geo.h * 0.55;
    for (var i = 0; i < this.N; i++) {
      var g = G[i], on = i === this.active;

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
      g.yaw += ((on ? this.yawAim : 0) - g.yaw) * Math.min(1, 10 * dt);

      /* o pêndulo */
      var aa = -22 * Math.sin(g.a) - (on ? 6 : 3.2) * g.va + (ax / L) * Math.cos(g.a) * 0.6;
      if (grab && grab.g === g) {
        var dx = grab.x - g.x, dy = Math.max(20, grab.y - g.py);
        aa += 160 * (clamp(Math.atan2(-dx, dy), -1.1, 1.1) - g.a) - 14 * g.va;
      }
      g.va += aa * dt; g.a = clamp(g.a + g.va * dt, -1.3, 1.3);

      /* a barra atrasada */
      var ab = 70 * (g.a - g.b) - 6 * g.vb;
      g.vb += ab * dt; g.b += g.vb * dt;

      if (hand.on && !on && !grab) this.brush(g, dt);
    }
    if (hand.on) hand.vx *= Math.max(0, 1 - 10 * dt);
    this.collide();
  };

  /* O cursor passando pelo tecido arrasta a peça junto, nunca mais rápido do
     que ele mesmo: devagar afasta as roupas, rápido faz balançar. */
  Arara.prototype.brush = function (g, dt) {
    var hand = this.hand, y = hand.y - g.py;
    if (y < this.geo.h * 0.18 || y > this.geo.h) return;
    var cx = g.x - y * Math.sin(g.a);
    if (Math.abs(hand.x - cx) > halfWidth(g) + 6) return;
    g.va += (-hand.vx / y - g.va) * (1 - Math.exp(-5 * dt)) * 0.55;
  };

  Arara.prototype.collide = function () {
    var Lh = this.geo.h * 0.85, G = this.G;
    for (var i = 0; i < this.N - 1; i++) {
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
  };

  Arara.prototype.moving = function () {
    for (var i = 0; i < this.N; i++) {
      var g = this.G[i];
      if (Math.abs(g.vx) > 0.3 || Math.abs(g.tx - g.x) > 0.3 || Math.abs(g.vy) > 0.3 || g.delay > 0 || Math.abs(g.py) > 0.3) return true;
      if (Math.abs(g.vt) > 0.003 || Math.abs(g.vth) > 0.003 || Math.abs((i === this.active ? 1 : 0) - g.th) > 0.002) return true;
      if (Math.abs(g.va) > 0.002 || Math.abs(g.a) > 0.002 || Math.abs(g.vb) > 0.002 || Math.abs(g.vl) > 0.003) return true;
    }
    return false;
  };

  Arara.prototype.kick = function () {
    var self = this;
    if (reduced) { this.settleAll(); this.draw(); return; }
    if (this.running) return;
    this.running = true;
    var last = performance.now(), accum = 0;
    function frame(now) {
      var dt = clamp((now - last) / 1000 || 0.016, 0, 0.05), n = 0;
      last = now; accum += dt;
      while (accum >= SUB && n < 8) { self.step(SUB); accum -= SUB; n++; }
      if (n === 8) accum = 0;
      self.draw();
      if ((self.grab || self.moving()) && !document.hidden) requestAnimationFrame(frame);
      else self.running = false;
    }
    requestAnimationFrame(frame);
  };

  /* ---------------- Desenho ---------------- */
  Arara.prototype.draw = function () {
    var self = this;
    this.G.forEach(function (g) { g.el.style.transform = "translate3d(" + (g.x - g.Wf / 2).toFixed(2) + "px," + g.py.toFixed(2) + "px,0)"; });
    if (this.gl && this.gl.ready) { this.gl.render(this.G, this.active, this.clock); return; }
    this.G.forEach(function (g) {
      var f = clamp(g.t, -0.1, 1.1), dir = g.p.turn || 1, lag = clamp(g.b - g.a, -0.3, 0.3);
      g.el.style.zIndex = g.i === self.active ? 30 : g.face ? 20 : 10;
      g.el.classList.toggle("is-away", g.hidden);
      g.sw.style.transform = "rotate(" + g.a.toFixed(4) + "rad) skewX(" + (-lag).toFixed(4) + "rad) scale(" + (1 + 0.045 * g.lift).toFixed(4) + ")";
      g.front.style.opacity = g.face ? 1 : 0;
      g.side.style.opacity = g.face ? 0 : 1;
      g.front.style.transform = "translateX(-50%) rotateY(" + (dir * (1 - f) * 86 + g.yaw).toFixed(2) + "deg)";
      g.side.style.transform = "translateX(-50%) rotateY(" + (-dir * f * 70).toFixed(2) + "deg)";
    });
  };

  /* ---------------- Escolher uma peça ---------------- */
  Arara.prototype.setActive = function (i) {
    if (i === this.active) return;
    this.active = i;
    if (i >= 0) {
      this.q("[data-pa3d-live]").textContent = this.P[i].name + (this.P[i].priceLabel ? ", " + this.P[i].priceLabel : "");
      if (!reduced) this.G[i].vy -= this.geo.h * 0.25;
    }
    this.readout();
    this.kick();
  };

  Arara.prototype.xy = function (e) {
    var r = this.rail.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top - 6];
  };

  /* Qual peça está sob x, pela posição real de cada uma agora. A que está de
     frente é larga, então o cursor fica nela até sair de verdade. */
  Arara.prototype.hit = function (x) {
    var G = this.G, best = -1, dist = Infinity, k, d;
    if (x < -24 || x > this.geo.w + 24) return -1;
    for (k = 0; k < this.N; k++) { d = Math.abs(x - G[k].x); if (d <= G[k].w / 2 && d < dist) { best = k; dist = d; } }
    if (best >= 0) return best;
    for (k = 0; k < this.N; k++) { d = Math.abs(x - G[k].x); if (d < dist) { best = k; dist = d; } }
    return best;
  };

  /* faixa opcional embaixo da arara (nome e preço da peça virada); a section atual não tem */
  Arara.prototype.readout = function () {
    var btn = this.q("[data-pa3d-readout-btn]");
    if (!btn) return;
    if (this.active < 0) {
      this.q("[data-pa3d-readout-name]").textContent = this.el.getAttribute("data-idle-title") || "";
      this.q("[data-pa3d-readout-sub]").textContent = this.el.getAttribute("data-idle-hint") || "";
      btn.hidden = true;
      return;
    }
    var p = this.P[this.active];
    this.q("[data-pa3d-readout-name]").textContent = p.name;
    this.q("[data-pa3d-readout-sub]").textContent = [p.priceLabel, p.colour].filter(Boolean).join(" · ");
    btn.hidden = false;
  };

  Arara.prototype.bind = function () {
    var self = this, rail = this.rail, G = this.G;
    rail.addEventListener("pointermove", function (e) {
      if (self.open) return;
      var p = self.xy(e), now = performance.now(), hand = self.hand;
      if (!reduced) {
        if (hand.on && now > hand.t) hand.vx += (clamp((p[0] - hand.x) / ((now - hand.t) / 1000), -2600, 2600) - hand.vx) * 0.5;
        hand.on = true; hand.x = p[0]; hand.y = p[1]; hand.t = now;
      }
      var down = self.down;
      /* No toque, deslizar o dedo pela arara faz o papel do mouse. Cada peça
         tem uma faixa igual da largura, assim a peça virada (larga) não
         segura o dedo e cada uma vira na sua vez. */
      if (down && e.pointerType !== "mouse" && (down.scrub || Math.abs(e.clientX - down.cx) > 7)) {
        if (!down.scrub) { down.scrub = true; try { rail.setPointerCapture(e.pointerId); } catch (err) {} }
        var was = self.active, f = clamp(p[0] / self.geo.w, 0, 0.9999) * self.N;
        self.setActive(Math.floor(f));
        self.yawAim = (f % 1 - 0.5) * 20;
        if (self.active !== was && navigator.vibrate) try { navigator.vibrate(6); } catch (err) {}
        self.kick();
        return;
      }
      if (down && !self.grab && !reduced && down.i >= 0 && e.pointerType === "mouse" && Math.hypot(e.clientX - down.cx, e.clientY - down.cy) > 7) {
        self.grab = { g: G[down.i], x: p[0], y: p[1] };
        rail.classList.add("is-grabbing");
        try { rail.setPointerCapture(e.pointerId); } catch (err) {}
      }
      if (self.grab) { self.grab.x = p[0]; self.grab.y = p[1]; self.kick(); return; }
      if (e.pointerType === "mouse" && finePointer.matches && !small.matches) {
        self.setActive(self.hit(p[0]));
        if (self.active >= 0) self.yawAim = clamp((p[0] - G[self.active].x) / (G[self.active].w / 2), -1, 1) * 14;
      }
      self.kick();
    });
    rail.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      self.down = { cx: e.clientX, cy: e.clientY, i: self.hit(self.xy(e)[0]) };
    });
    function release() {
      if ((self.down && self.down.scrub) || self.grab) {
        self.suppressClick = true;
        setTimeout(function () { self.suppressClick = false; }, 0);
      }
      if (self.down && self.down.scrub) self.yawAim = 0;
      self.down = null;
      if (self.grab) { self.grab = null; rail.classList.remove("is-grabbing"); }
      self.kick();
    }
    rail.addEventListener("pointerup", release);
    rail.addEventListener("pointercancel", release);
    rail.addEventListener("pointerleave", function () {
      self.hand.on = false; self.hand.vx = 0;
      if (!self.grab && !self.open && finePointer.matches) { self.setActive(-1); self.yawAim = 0; }
    });
    rail.addEventListener("click", function (e) {
      if (self.suppressClick) return;
      var h = e.target.closest(".pa3d__hang");
      var i = e.detail === 0 && h ? G.map(function (g) { return g.el; }).indexOf(h) : self.hit(self.xy(e)[0]);
      if (i < 0) return;
      /* toque: o primeiro vira a peça, o segundo abre */
      if (!finePointer.matches && self.active !== i) { self.setActive(i); return; }
      self.show(i, e.detail === 0);
    });
    G.forEach(function (g, i) {
      g.el.addEventListener("focus", function () {
        if (!self.open && !g.el.matches(":hover")) { self.yawAim = 0; self.setActive(i); }
      });
    });
    rail.addEventListener("focusout", function (e) {
      if (!rail.contains(e.relatedTarget) && !self.open && !rail.matches(":hover")) self.setActive(-1);
    });
    rail.addEventListener("keydown", function (e) {
      var i = G.map(function (g) { return g.el; }).indexOf(document.activeElement);
      if (i < 0 || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
      e.preventDefault();
      G[(i + (e.key === "ArrowRight" ? 1 : self.N - 1)) % self.N].el.focus();
    });
    document.addEventListener("pointerdown", function (e) {
      if (!finePointer.matches && self.active >= 0 && !self.el.contains(e.target) && !self.open) self.setActive(-1);
    });
    var readoutBtn = this.q("[data-pa3d-readout-btn]");
    if (readoutBtn) readoutBtn.addEventListener("click", function () { if (self.active >= 0) self.show(self.active); });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) self.kick(); });
    var resizeT = null;
    addEventListener("resize", function () {
      clearTimeout(resizeT);
      resizeT = setTimeout(function () { self.measure(); self.settleAll(); self.draw(); self.kick(); }, 120);
    });
    small.addEventListener("change", function () { self.setActive(-1); });
    this.bindView();
  };

  /* ---------------- Peça aberta ---------------- */
  Arara.prototype.bindView = function () {
    var self = this;
    /* o painel vai para o body: assim nenhum transform do tema prende o position: fixed */
    this.view = this.q("[data-pa3d-view]");
    document.body.appendChild(this.view);
    var q = function (s) { return self.view.querySelector(s); };
    this.vimg = q("[data-pa3d-vimg]");
    this.sizeGrid = q("[data-pa3d-sizes]");
    this.addBtn = q("[data-pa3d-add]");
    this.sizeGrid.addEventListener("click", function (e) {
      var b = e.target.closest(".pa3d__size");
      if (!b || b.disabled) return;
      self.picked = Number(b.getAttribute("data-size"));
      self.sizes();
      self.addBtn.focus({ preventScroll: true });
    });
    this.addBtn.addEventListener("click", function () { self.add(); });
    Array.prototype.forEach.call(this.view.querySelectorAll("[data-face]"), function (b) {
      b.addEventListener("click", function () { self.face(b.getAttribute("data-face")); });
    });
    q("[data-pa3d-prev]").addEventListener("click", function () { self.stepTo(-1); });
    q("[data-pa3d-next]").addEventListener("click", function () { self.stepTo(1); });
    q("[data-pa3d-close]").addEventListener("click", function () { self.hide(); });
    q("[data-pa3d-stage]").addEventListener("click", function (e) { if (e.target === e.currentTarget) self.hide(); });
    document.addEventListener("keydown", function (e) {
      if (!self.open) return;
      if (e.key === "Escape") self.hide();
      else if (e.key === "ArrowRight") self.stepTo(1);
      else if (e.key === "ArrowLeft") self.stepTo(-1);
    });
  };

  Arara.prototype.fill = function (i) {
    var p = this.P[i], v = this.view;
    this.current = i; this.picked = null;
    this.vimg.alt = p.name;
    this.vimg.style.setProperty("--s", p.scale || 1);
    this.face(p.rail);
    v.querySelector("[data-pa3d-count]").textContent = pad(i + 1) + " / " + pad(this.N);
    v.querySelector("[data-pa3d-kind]").textContent = [p.kind, p.colour].filter(Boolean).join(" · ");
    v.querySelector("[data-pa3d-name]").textContent = p.name;
    v.querySelector("[data-pa3d-price]").textContent = p.priceLabel || "";
    var link = v.querySelector("[data-pa3d-link]");
    link.href = p.url || "#"; link.hidden = !p.url;
    v.querySelector("[data-pa3d-faces]").hidden = !(p.img.front && p.img.back);
    this.status("");
    this.sizes();
  };

  /* frente ou costas */
  Arara.prototype.face = function (which) {
    var p = this.P[this.current];
    this.vimg.src = p.img[which] || p.img.rail;
    Array.prototype.forEach.call(this.view.querySelectorAll("[data-face]"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-face") === which));
    });
  };

  Arara.prototype.sizes = function () {
    var p = this.P[this.current], picked = this.picked, soldOut = this.el.getAttribute("data-sold-out") || "";
    this.sizeGrid.innerHTML = p.sizes.map(function (s, k) {
      var out = !s.available;
      return '<button class="pa3d__size" type="button" data-size="' + k + '" aria-pressed="' + (picked === k) + '"' + (out ? " disabled" : "") +
        ' aria-label="' + s.label + (out ? ", " + soldOut : "") + '"><span>' + s.label + "</span>" + (out ? "<small>" + soldOut + "</small>" : "") + "</button>";
    }).join("");
    var none = !p.sizes.length || !p.sizes.some(function (s) { return s.available; });
    this.addBtn.disabled = picked === null || none;
    this.addBtn.textContent = none ? (this.el.getAttribute("data-unavailable") || "")
      : picked === null ? (this.el.getAttribute("data-pick") || "")
      : (this.el.getAttribute("data-add") || "") + " " + p.sizes[picked].label + (p.priceLabel ? " — " + p.priceLabel : "");
  };

  Arara.prototype.status = function (html) {
    var s = this.view.querySelector("[data-pa3d-status]");
    s.innerHTML = html; s.hidden = !html;
  };

  /* Adiciona ao carrinho da loja. Depois avisa o tema (eventos que o Impact
     usa para atualizar e abrir o carrinho); o link "ver sacola" fica de
     reserva caso o carrinho lateral não abra sozinho. */
  Arara.prototype.add = function () {
    var self = this, p = this.P[this.current], s = p.sizes[this.picked];
    if (!s) return;
    this.addBtn.disabled = true;
    fetch(root() + "cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ items: [{ id: s.id, quantity: 1 }] })
    }).then(function (r) {
      return r.json().then(function (d) { if (!r.ok) throw new Error(d.description || d.message || ""); return d; });
    }).then(function (added) {
      return fetch(root() + "cart.js").then(function (r) { return r.json(); }).then(function (cart) {
        var html = document.documentElement;
        html.dispatchEvent(new CustomEvent("variant:add", { bubbles: true, detail: { items: added.items || [added], cart: cart } }));
        html.dispatchEvent(new CustomEvent("cart:refresh", { bubbles: true, detail: { cart: cart } }));
        self.status((self.el.getAttribute("data-added") || "") + ' <a href="' + root() + 'cart">' + (self.el.getAttribute("data-view-cart") || "") + "</a>");
        self.sizes();
      });
    }).catch(function (err) {
      self.status(err && err.message ? err.message : (self.el.getAttribute("data-error") || ""));
      self.sizes();
    });
  };

  Arara.prototype.markAway = function (i) {
    this.G.forEach(function (g, k) { g.hidden = k === i; });
    this.draw();
  };

  Arara.prototype.show = function (i, byKeyboard) {
    var self = this;
    if (this.open) return;
    this.open = true;
    this.byKeyboard = !!byKeyboard;
    this.fill(i);
    this.setActive(i); this.markAway(i);
    this.lastFocus = document.activeElement;
    document.documentElement.classList.add("pa3d-lock");
    this.view.hidden = false;
    requestAnimationFrame(function () { self.view.classList.add("is-open"); });
    if (!reduced && this.vimg.animate) this.vimg.animate([{ opacity: 0, transform: "translateY(-24px) rotate(-3deg)" }, { opacity: 1, transform: "none" }], { duration: 600, easing: "cubic-bezier(.16,1,.3,1)" });
    setTimeout(function () { self.view.querySelector("[data-pa3d-close]").focus({ preventScroll: true }); }, 60);
  };

  Arara.prototype.hide = function () {
    var self = this;
    if (!this.open) return;
    this.open = false;
    this.view.classList.remove("is-open");
    document.documentElement.classList.remove("pa3d-lock");
    setTimeout(function () { if (!self.open) self.view.hidden = true; }, reduced ? 0 : 450);
    this.markAway(-1);
    if (!finePointer.matches) this.setActive(-1);
    /* o foco volta para a peça só se ela foi aberta pelo teclado */
    if (this.byKeyboard) this.G[this.current].el.focus({ preventScroll: true });
    else if (document.activeElement && this.view.contains(document.activeElement)) document.activeElement.blur();
    this.kick();
  };

  Arara.prototype.stepTo = function (dir) {
    var i = (this.current + dir + this.N) % this.N;
    this.fill(i); this.setActive(i); this.markAway(i);
    if (!reduced && this.vimg.animate) this.vimg.animate([{ opacity: 0, transform: "translateX(" + dir * 50 + "px) rotate(" + dir * 2.5 + "deg)" }, { opacity: 1, transform: "none" }], { duration: 480, easing: "cubic-bezier(.16,1,.3,1)" });
  };

  /* ---------------- Início ---------------- */
  Arara.prototype.start = function () {
    var self = this;
    this.measure();
    this.settleAll();
    if (!reduced) this.G.forEach(function (g, i) { g.py = -self.geo.h * 0.22; g.delay = 0.12 + i * 0.07; });
    this.bind();
    this.readout();
    this.el.classList.add("is-ready");
    this.draw();
    this.kick();
    if (window.PallacioRailGL) {
      var gl = window.PallacioRailGL(this.rail, this.G, reduced);
      if (gl) gl.load().then(function () {
        self.gl = gl; gl.resize(self.geo); self.rail.classList.add("is-gl"); self.draw(); self.kick();
      }).catch(function () {});
    }
  };

  function boot() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-pa3d]"), function (el) {
      if (!el._pa3d) el._pa3d = new Arara(el);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  document.addEventListener("shopify:section:load", boot);
})();
