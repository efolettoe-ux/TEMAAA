/* PALLACIO · Outfit completo
   Carrossel com setas e o pop-up do fit: cada peça com cor e tamanho, o total,
   e um botão que põe todas as peças escolhidas na sacola de uma vez. */
(function () {
  "use strict";

  /* as cores das peças, as mesmas da página do produto */
  var TONES = {
    "off white": "#f4f1e8", "offwhite": "#f4f1e8", "branca": "#ffffff", "branco": "#ffffff", "white": "#ffffff",
    "preta": "#000000", "preto": "#000000", "black": "#000000",
    "azul marinho": "#29466d", "marinho": "#29466d", "navy": "#29466d", "azul claro": "#9db9d1", "azul": "#315d8f",
    "bege": "#d5c6ad", "areia": "#d5c6ad", "verde": "#4c6b4f", "cinza": "#8f8f8f", "chumbo": "#4a4a4a", "vermelho": "#a3282b"
  };
  function tone(name) {
    var n = String(name || "").trim().toLowerCase();
    if (TONES[n]) return TONES[n];
    var first = n.split("/")[0].trim();
    return TONES[first] || "#cfcfcf";
  }
  function dark(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return false;
    var v = parseInt(m[1], 16);
    return 0.299 * (v >> 16) + 0.587 * (v >> 8 & 255) + 0.114 * (v & 255) < 110;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }

  /* formato de preço da loja (ex.: "R$ {{amount_with_comma_separator}}") */
  function money(cents, format) {
    var f = format || "R$ {{amount_with_comma_separator}}";
    var n = (cents / 100).toFixed(2), parts = n.split(".");
    var thousands = function (s, sep) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, sep); };
    return f.replace(/\{\{\s*(\w+)\s*\}\}/, function (_, k) {
      if (k === "amount_with_comma_separator") return thousands(parts[0], ".") + "," + parts[1];
      if (k === "amount_no_decimals_with_comma_separator") return thousands(String(Math.round(cents / 100)), ".");
      if (k === "amount_no_decimals") return thousands(String(Math.round(cents / 100)), ",");
      return thousands(parts[0], ",") + "." + parts[1];
    });
  }

  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function Outfit(root) {
    this.root = root;
    this.track = root.querySelector("[data-pof-track]");
    this.prev = root.querySelector("[data-pof-prev]");
    this.next = root.querySelector("[data-pof-next]");
    this.modal = root.querySelector("[data-pof-modal]");
    this.format = root.getAttribute("data-money-format");
    this.bindCarousel();
    this.bindModal();
  }

  /* ---------------- carrossel ---------------- */
  Outfit.prototype.bindCarousel = function () {
    var self = this, t = this.track;
    var update = function () {
      var max = t.scrollWidth - t.clientWidth - 2;
      self.prev.hidden = t.scrollLeft <= 2;
      self.next.hidden = t.scrollLeft >= max;
    };
    var page = function (dir) {
      var slide = t.querySelector(".pof__slide");
      var step = slide ? slide.getBoundingClientRect().width + parseFloat(getComputedStyle(t).columnGap || 0) : t.clientWidth;
      var per = Math.max(1, Math.floor((t.clientWidth + 2) / step));
      t.scrollBy({ left: dir * step * per, behavior: reduced ? "auto" : "smooth" });
    };
    this.prev.addEventListener("click", function () { page(-1); });
    this.next.addEventListener("click", function () { page(1); });
    t.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  };

  /* ---------------- pop-up do fit ---------------- */
  Outfit.prototype.bindModal = function () {
    var self = this, m = this.modal;
    document.body.appendChild(m);
    this.stage = m.querySelector("[data-pof-stage]");
    this.list = m.querySelector("[data-pof-items]");
    this.totalEl = m.querySelector("[data-pof-total]");
    this.addBtn = m.querySelector("[data-pof-add]");
    this.msg = m.querySelector("[data-pof-msg]");

    Array.prototype.forEach.call(this.root.querySelectorAll("[data-pof-open]"), function (card) {
      card.addEventListener("click", function () {
        var data = card.parentNode.querySelector("[data-pof-data]");
        try { self.open(JSON.parse(data.textContent), card); } catch (e) { if (window.console) console.warn("Outfit:", e); }
      });
    });
    Array.prototype.forEach.call(m.querySelectorAll("[data-pof-close]"), function (b) {
      b.addEventListener("click", function () { self.close(); });
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && self.isOpen) self.close(); });

    this.list.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b || b.disabled) return;
      var row = b.closest("[data-i]"), it = self.items[+row.getAttribute("data-i")];
      if (b.hasAttribute("data-toggle")) it.on = !it.on;
      else if (b.hasAttribute("data-opt")) {
        var k = +b.getAttribute("data-opt"), v = b.getAttribute("data-value");
        it.sel[k] = it.sel[k] === v && k !== it.colourIndex ? null : v;
        /* trocou a cor: se o tamanho escolhido não existe nessa cor, limpa */
        if (k === it.colourIndex) it.sel.forEach(function (s, j) { if (j !== k && s && !self.variantFor(it, j, s)) it.sel[j] = null; });
      }
      self.renderItem(row, it);
      if (b.hasAttribute("data-opt") && +b.getAttribute("data-opt") === it.colourIndex) self.restage(it);
      self.refresh();
    });
    this.addBtn.addEventListener("click", function () { self.add(); });
  };

  /* a variante que bate com o que foi escolhido (trocando a opção k por v, se vier) */
  Outfit.prototype.variantFor = function (it, k, v) {
    var sel = it.sel.slice();
    if (k != null) sel[k] = v;
    for (var i = 0; i < it.variants.length; i++) {
      var ok = true, o = it.variants[i].o;
      for (var j = 0; j < sel.length; j++) if (sel[j] != null && o[j] !== sel[j]) { ok = false; break; }
      if (ok && (k == null || it.variants[i].a)) return it.variants[i];
    }
    return null;
  };
  Outfit.prototype.chosen = function (it) {
    for (var j = 0; j < it.sel.length; j++) if (it.sel[j] == null) return null;
    var v = this.variantFor(it, null, null);
    return v && v.a ? v : null;
  };

  Outfit.prototype.open = function (data, card) {
    var self = this;
    this.card = card;
    this.items = data.items.map(function (raw) {
      var it = raw, n = it.options.length;
      it.sel = [];
      for (var j = 0; j < n; j++) {
        var vals = it.options[j].values;
        it.sel.push(vals.length === 1 ? vals[0] : null);
      }
      if (it.colourIndex >= 0) it.sel[it.colourIndex] = it.pre || (it.variants.filter(function (v) { return v.a; })[0] || it.variants[0]).o[it.colourIndex];
      it.soldOut = !it.variants.some(function (v) { return v.a; });
      it.on = !it.soldOut;
      return it;
    });
    this.modal.querySelector("[data-pof-name]").textContent = data.name;
    this.stage.innerHTML = card.querySelector("[data-pof-fit]").innerHTML;
    this.stage.classList.toggle("pof__fit--photo", !!this.stage.querySelector(".pof__look"));
    Array.prototype.forEach.call(this.stage.querySelectorAll("img"), function (img) { img.loading = "eager"; img.sizes = "(max-width: 799px) 62vw, 480px"; });
    this.list.innerHTML = this.items.map(function (it, i) { return '<li class="pof-item" data-i="' + i + '"></li>'; }).join("");
    Array.prototype.forEach.call(this.list.children, function (row, i) { self.renderItem(row, self.items[i]); });
    this.msg.textContent = "";
    this.refresh();

    this.isOpen = true;
    this.modal.hidden = false;
    document.documentElement.classList.add("pof-lock");
    requestAnimationFrame(function () { self.modal.classList.add("is-open"); });
    setTimeout(function () { self.modal.querySelector(".pof-modal__close").focus({ preventScroll: true }); }, 60);
  };

  Outfit.prototype.close = function () {
    var self = this;
    if (!this.isOpen) return;
    this.isOpen = false;
    this.modal.classList.remove("is-open");
    document.documentElement.classList.remove("pof-lock");
    setTimeout(function () { if (!self.isOpen) self.modal.hidden = true; }, reduced ? 0 : 380);
    if (this.card) this.card.focus({ preventScroll: true });
  };

  Outfit.prototype.renderItem = function (row, it) {
    var self = this, v = this.chosen(it) || this.variantFor(it, null, null) || it.variants[0];
    var img = (v && v.img) || it.image;
    var html = '<div class="pof-item__media">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : "") + "</div>";
    html += '<div class="pof-item__body"><div class="pof-item__head"><div><a class="pof-item__title" href="' + esc(it.url) + '">' + esc(it.title) + "</a>";
    html += '<span class="pof-item__price">' + money(v ? v.p : 0, this.format) + "</span></div>";
    html += '<button type="button" class="pof-item__toggle" data-toggle aria-pressed="' + it.on + '"' + (it.soldOut ? " disabled" : "") + "><i></i>" + (it.soldOut ? "Esgotado" : "No fit") + "</button></div>";
    if (!it.soldOut) it.options.forEach(function (opt, k) {
      if (opt.values.length === 1 && /^default/i.test(opt.values[0])) return;
      var isColour = k === it.colourIndex;
      html += '<div class="pof-opt"><div class="pof-opt__info"><span>' + esc(opt.name) + ":</span>";
      if (isColour) html += "<span>" + esc(it.sel[k] || "") + "</span>";
      html += '</div><div class="pof-opt__values" role="group" aria-label="' + esc(opt.name) + '">';
      opt.values.forEach(function (val) {
        var can = !!self.variantFor(it, k, val), on = it.sel[k] === val;
        if (isColour) {
          var c = tone(val);
          html += '<button type="button" class="pof-swatch' + (dark(c) ? " is-dark" : "") + '" style="--c:' + c + '" data-opt="' + k + '" data-value="' + esc(val) +
            '" aria-pressed="' + on + '" aria-label="' + esc(val) + '" title="' + esc(val) + '"' + (can ? "" : " disabled") + "></button>";
        } else {
          html += '<button type="button" class="pof-size" data-opt="' + k + '" data-value="' + esc(val) + '" aria-pressed="' + on + '"' + (can ? "" : " disabled") + ">" + esc(val) + "</button>";
        }
      });
      html += "</div></div>";
    });
    html += "</div>";
    row.innerHTML = html;
    row.classList.toggle("is-off", !it.on);
  };

  /* trocou a cor: a peça no look grande também troca */
  Outfit.prototype.restage = function (it) {
    var img = this.stage.querySelector(".pof__piece--" + it.role + " img");
    var v = this.variantFor(it, null, null), src = v && v.img;
    if (!img || !src) return;
    img.removeAttribute("srcset");
    img.src = src.replace(/([?&])width=\d+/, "$1width=900");
    if (img.animate && !reduced) img.animate([{ opacity: .3 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
  };

  Outfit.prototype.refresh = function () {
    var self = this, total = 0, missing = 0, picked = 0;
    this.items.forEach(function (it) {
      if (!it.on) return;
      var v = self.chosen(it);
      if (v) { total += v.p; picked++; }
      else { missing++; var g = self.variantFor(it, null, null) || it.variants[0]; total += g ? g.p : 0; }
    });
    this.totalEl.textContent = money(total, this.format);
    var label = this.root.getAttribute("data-label-add");
    if (missing) label = this.root.getAttribute("data-label-choose");
    this.addBtn.textContent = label;
    this.addBtn.disabled = !!missing || !picked;
  };

  Outfit.prototype.add = function () {
    var self = this, btn = this.addBtn;
    var items = this.items.filter(function (it) { return it.on; }).map(function (it) { return { id: self.chosen(it).id, quantity: 1 }; });
    if (!items.length || btn.classList.contains("is-busy")) return;
    btn.classList.add("is-busy");
    this.msg.textContent = "";
    var root = (window.Shopify && Shopify.routes && Shopify.routes.root) || "/";
    fetch(root + "cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ items: items })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, json: j }; }); }).then(function (res) {
      btn.classList.remove("is-busy");
      if (!res.ok) { self.msg.textContent = (res.json && (res.json.description || res.json.message)) || self.root.getAttribute("data-label-error"); return; }
      btn.textContent = self.root.getAttribute("data-label-added");
      var lines = res.json.items || [res.json];
      /* avisa o tema: abre a sacola e atualiza o contador */
      document.documentElement.dispatchEvent(new CustomEvent("variant:add", { bubbles: true, detail: { items: lines, blockCartDrawerOpening: false } }));
      document.dispatchEvent(new CustomEvent("cart:refresh"));
      setTimeout(function () { self.close(); }, 700);
    }).catch(function () {
      btn.classList.remove("is-busy");
      self.msg.textContent = self.root.getAttribute("data-label-error");
    });
  };

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-pof]:not([data-pof-ready])"), function (el) {
      el.setAttribute("data-pof-ready", "");
      new Outfit(el);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  document.addEventListener("shopify:section:load", init);
})();
