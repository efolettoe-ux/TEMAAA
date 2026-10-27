/* Desenho da arara em WebGL2.

   Cada foto vira uma malha que o vertex shader dobra em 3D:
     - gira em torno do gancho; o ângulo vai do dos ombros (topo) ao da
       barra (embaixo), então a peça torce enquanto vira;
     - a frente tem volume: o peito sai um pouco para fora, as mangas não;
     - balança como pêndulo e a barra atrasa em relação aos ombros;
     - ondula de leve só enquanto se mexe;
     - recebe luz pela normal da superfície, então escurece de lado e clareia
       quando encara a luz.
   Antes das peças, a mesma malha é desenhada achatada na parede, com a foto
   desfocada, como sombra.
   Devolve null sem WebGL2, e a arara segue com o desenho em CSS.
   Cópia de js/rail-gl.js do repositório TEMAAA, com o nome global trocado. */
(function () {
  "use strict";

  var VS = [
    "#version 300 es",
    "precision highp float;",
    "in vec2 aUV;",
    "uniform vec3 uHook;",          // gancho, em px do rail (z para você)
    "uniform vec2 uSize;",          // largura e altura da foto, em px
    "uniform float uApex;",         // onde o gancho apoia no cano, em fração da altura da foto
    "uniform vec2 uTurn;",          // ângulo nos ombros e na barra (rad, 0 = de frente)
    "uniform vec2 uSwing;",         // balanço nos ombros e na barra (rad)
    "uniform float uPlane;",        // 0 = frente; ±1 = perfil, com o sinal do sentido do giro
    "uniform float uBulge, uFlutter, uTime, uShadow, uWallZ, uShadeK;",
    "uniform vec3 uCam;",           // centro da perspectiva (x, y) e distância
    "uniform vec4 uView;",          // origem do canvas no rail (x, y) e tamanho (w, h)",
    "out vec2 vUV; out float vShade;",
    "vec3 surf(vec2 uv) {",
    "  float x = (uv.x - 0.5) * uSize.x, y = (uv.y - uApex) * uSize.y;",
    "  float k = smoothstep(0.1, 1.0, uv.y);",
    "  float phi = mix(uTurn.x, uTurn.y, k) - uPlane * 1.5707963;",
    "  float body = smoothstep(0.08, 0.22, uv.y) * (1.0 - 0.35 * uv.y);",
    "  float q = clamp((uv.x - 0.5) / 0.34, -1.0, 1.0);",
    "  float z = (1.0 - abs(uPlane)) * uBulge * (1.0 - q * q) * body;",
    "  z += uFlutter * sin(uv.x * 17.0 + uv.y * 8.0 - uTime * 7.0) * sin(uv.y * 3.14159);",
    "  float X = x * cos(phi) + z * sin(phi), Z = -x * sin(phi) + z * cos(phi);",
    "  float s = mix(uSwing.x, uSwing.y, uv.y);",
    "  return uHook + vec3(X * cos(s) - y * sin(s), X * sin(s) + y * cos(s), Z);",
    "}",
    "vec4 project(vec3 p) {",
    "  float w = uCam.z / (uCam.z - p.z);",
    "  vec2 s = uCam.xy + (p.xy - uCam.xy) * w - uView.xy;",
    "  return vec4(s.x / uView.z * 2.0 - 1.0, 1.0 - s.y / uView.w * 2.0, 0.0, 1.0);",
    "}",
    "void main() {",
    "  vUV = aUV;",
    "  vec3 p = surf(aUV);",
    "  if (uShadow > 0.5) {",
    "    p.xy += vec2(0.22, 0.3) * (p.z - uWallZ); p.z = uWallZ;",
    "    vShade = 1.0; gl_Position = project(p); return;",
    "  }",
    "  vec3 n = normalize(cross(surf(aUV + vec2(0.01, 0.0)) - p, surf(aUV + vec2(0.0, 0.01)) - p));",
    "  if (n.z < 0.0) n = -n;",
    "  vec3 L = normalize(vec3(-0.3, -0.35, 0.89));",
    "  vShade = 1.0 - uShadeK * (1.0 - clamp(dot(n, L) / L.z, 0.45, 1.06));",
    "  gl_Position = project(p);",
    "}"
  ].join("\n");

  var FS = [
    "#version 300 es",
    "precision highp float;",
    "uniform sampler2D uTex; uniform float uShadow;",
    "in vec2 vUV; in float vShade;",
    "out vec4 o;",
    "void main() {",
    "  vec4 c = texture(uTex, vUV);",
    "  if (uShadow > 0.5) {",
    "    float edge = smoothstep(0.04, 0.14, vUV.y) * smoothstep(0.0, 0.06, 1.0 - vUV.y) * smoothstep(0.0, 0.05, vUV.x) * smoothstep(0.0, 0.05, 1.0 - vUV.x);",
    "    o = vec4(0.04, 0.05, 0.08, 1.0) * c.a * edge * 0.16; return;",
    "  }",
    "  o = vec4(c.rgb * vShade, c.a);",
    "}"
  ].join("\n");

  /* Medido nas fotos: a parte de dentro da curva do gancho fica a 0,9% do
     topo da foto. O cano passa exatamente ali (css: .rail::before). */
  var APEX = 0.009;

  var NAMES = ["uHook", "uSize", "uTurn", "uSwing", "uPlane", "uBulge", "uFlutter", "uTime", "uShadow", "uWallZ", "uShadeK", "uApex", "uCam", "uView", "uTex"];

  window.PallacioRailGL = function (rail, G, reduced) {
    var canvas = document.createElement("canvas");
    canvas.className = "rail-gl";
    canvas.setAttribute("aria-hidden", "true");
    var gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) return null;

    var prog, U = {}, meshes = {}, geo = null, view = { mx: 0, mt: 0, cw: 0, ch: 0 };
    try {
      prog = gl.createProgram();
      [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]].forEach(function (d) {
        var sh = gl.createShader(d[0]); gl.shaderSource(sh, d[1]); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
        gl.attachShader(prog, sh);
      });
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) {
      if (window.console) console.warn("Arara: sem WebGL —", e.message);
      return null;
    }
    NAMES.forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

    function grid(cols, rows) {
      var uv = [], idx = [];
      for (var r = 0; r <= rows; r++) for (var c = 0; c <= cols; c++) uv.push(c / cols, r / rows);
      for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
        var a = r * (cols + 1) + c, b = a + cols + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
      var vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(prog, "aUV");
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      return { vao: vao, count: idx.length };
    }
    meshes.front = grid(26, 40);
    meshes.side = grid(6, 40);

    function texture(src) {
      var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      var an = gl.getExtension("EXT_texture_filter_anisotropic");
      if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, 4);
      return t;
    }
    /* a silhueta desfocada, para a sombra: só o alfa, desfocado aqui mesmo
       (o filtro de desfoque do canvas não existe em todo navegador) */
    function soft(im) {
      var c = document.createElement("canvas"), w = 96, h = Math.round(96 * im.naturalHeight / im.naturalWidth);
      c.width = w; c.height = h;
      var x = c.getContext("2d"); x.drawImage(im, 0, 0, w, h);
      var d = x.getImageData(0, 0, w, h), a = new Float32Array(w * h), b = new Float32Array(w * h), R = 3, i, j, k, sum;
      for (i = 0; i < w * h; i++) a[i] = d.data[i * 4 + 3];
      for (var pass = 0; pass < 2; pass++) {
        for (j = 0; j < h; j++) for (i = 0; i < w; i++) {
          sum = 0; for (k = -R; k <= R; k++) sum += a[j * w + Math.min(w - 1, Math.max(0, i + k))];
          b[j * w + i] = sum / (2 * R + 1);
        }
        for (j = 0; j < h; j++) for (i = 0; i < w; i++) {
          sum = 0; for (k = -R; k <= R; k++) sum += b[Math.min(h - 1, Math.max(0, j + k)) * w + i];
          a[j * w + i] = sum / (2 * R + 1);
        }
      }
      for (i = 0; i < w * h; i++) { d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = 0; d.data[i * 4 + 3] = a[i]; }
      return d;
    }
    /* Quanto a luz escurece a peça de lado. Em tecido claro a mesma sombra
       vira cinza sujo, então peças claras recebem bem menos. */
    function shadeStrength(im) {
      var c = document.createElement("canvas"); c.width = c.height = 24;
      var x = c.getContext("2d"); x.drawImage(im, 0, 0, 24, 24);
      var d = x.getImageData(0, 0, 24, 24).data, sum = 0, n = 0;
      for (var i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; n++; }
      var luma = n ? sum / n : 0.5, t = Math.min(1, Math.max(0, (luma - 0.35) / 0.5));
      return 0.6 - 0.42 * t * t * (3 - 2 * t);
    }
    /* Pendurada, a peça gira até o peso ficar embaixo do gancho. Nas fotos de
       perfil o corpo às vezes sai um pouco para o lado; este é o ângulo que
       o recoloca embaixo do gancho, para todas ficarem na mesma posição. */
    function restTilt(im) {
      var w = 64, h = Math.round(64 * im.naturalHeight / im.naturalWidth), c = document.createElement("canvas");
      c.width = w; c.height = h;
      var x = c.getContext("2d"); x.drawImage(im, 0, 0, w, h);
      var d = x.getImageData(0, 0, w, h).data, sx = 0, sy = 0, n = 0;
      for (var j = Math.round(h * 0.15); j < h; j++) for (var i = 0; i < w; i++) {
        if (d[(j * w + i) * 4 + 3] > 128) { sx += i + 0.5 - w / 2; sy += j - APEX * h; n++; }
      }
      return n ? Math.atan2(sx / n, sy / n) : 0;
    }
    function decoded(im) {
      if (im.complete && im.naturalWidth) return Promise.resolve();
      return im.decode ? im.decode().catch(function () {}) : new Promise(function (r) { im.onload = im.onerror = r; });
    }

    var api = { ready: false, shadow: true, canvas: canvas };

    function prepare(g) {
      g.shadeK = shadeStrength(g.front);
      g.sideTilt = restTilt(g.side);
      g.tex = { front: texture(g.front), side: texture(g.side), frontSoft: texture(soft(g.front)), sideSoft: texture(soft(g.side)) };
    }

    api.load = function () {
      var ims = [];
      G.forEach(function (g) { ims.push(g.front, g.side); });
      return Promise.all(ims.map(decoded)).then(function () {
        if (ims.some(function (im) { return !im.naturalWidth; })) throw new Error("foto não carregou");
        G.forEach(prepare);
        rail.appendChild(canvas);
        api.ready = true;
      });
    };

    /* uma peça a mais depois de carregado (o pop-up prepara cada foto quando precisa) */
    api.add = function (g) {
      return Promise.all([decoded(g.front), decoded(g.side)]).then(function () {
        if (!g.front.naturalWidth || !g.side.naturalWidth) throw new Error("foto não carregou");
        if (!g.tex) prepare(g);
        return g;
      });
    };

    /* o canvas passa das bordas do cano, para caber o balanço e a sombra */
    api.resize = function (g) {
      geo = g;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      view.mx = Math.round(geo.h * 0.6); view.mt = Math.round(geo.h * 0.12);
      view.cw = geo.w + view.mx * 2; view.ch = geo.h + view.mt + Math.round(geo.h * 0.55);
      canvas.style.left = -view.mx + "px"; canvas.style.top = -view.mt + "px";
      canvas.style.width = view.cw + "px"; canvas.style.height = view.ch + "px";
      canvas.width = Math.round(view.cw * dpr); canvas.height = Math.round(view.ch * dpr);
    };

    function garment(g, shadow, clock) {
      var face = g.face, h = geo.h;
      var dir = g.p.turn || 1;
      var top = dir * (1 - g.t) * Math.PI / 2 + g.yaw * Math.PI / 180, hem = dir * (1 - g.th) * Math.PI / 2 + g.yaw * 0.6 * Math.PI / 180;
      var motion = Math.abs(g.vt) + Math.abs(g.vth) + Math.abs(g.va) * 2;
      /* o ponto de apoio fica em cima do cano; é dele que a peça gira e balança */
      gl.uniform3f(U.uHook, g.x, 6 + APEX * h + g.py, g.lift * h * 0.09);
      gl.uniform1f(U.uApex, APEX);
      gl.uniform2f(U.uTurn, top, hem);
      /* de lado, o corpo fica bem embaixo do gancho; some conforme vira */
      var rest = g.sideTilt * (1 - Math.min(1, Math.max(0, g.t)));
      gl.uniform2f(U.uSwing, g.a + rest, g.b + rest);
      gl.uniform1f(U.uFlutter, reduced ? 0 : Math.min(1, motion * 0.15) * h * 0.012);
      gl.uniform1f(U.uTime, clock);
      gl.uniform1f(U.uPlane, face ? 0 : dir);
      gl.uniform1f(U.uBulge, g.Hs * 0.05);
      gl.uniform1f(U.uShadeK, shadow ? 0 : g.shadeK);
      gl.uniform2f(U.uSize, face ? g.Wf : g.Ws, g.Hs);
      gl.bindTexture(gl.TEXTURE_2D, face ? (shadow ? g.tex.frontSoft : g.tex.front) : (shadow ? g.tex.sideSoft : g.tex.side));
      var m = face ? meshes.front : meshes.side;
      gl.bindVertexArray(m.vao);
      gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
    }

    api.render = function (G, active, clock) {
      if (!api.ready || !geo) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.activeTexture(gl.TEXTURE0); gl.uniform1i(U.uTex, 0);
      gl.uniform3f(U.uCam, geo.w / 2, 6 + geo.h * 0.45, geo.h * 3.2);
      gl.uniform4f(U.uView, -view.mx, -view.mt, view.cw, view.ch);
      gl.uniform1f(U.uWallZ, -geo.h * 0.28);
      var shown = G.filter(function (g) { return !g.hidden; });
      gl.uniform1f(U.uShadow, 1);
      if (api.shadow) shown.forEach(function (g) { garment(g, true, clock); });
      gl.uniform1f(U.uShadow, 0);
      shown.slice().sort(function (a, b) { return (a.lift - b.lift) || ((a.i === active) - (b.i === active)); })
        .forEach(function (g) { garment(g, false, clock); });
      gl.bindVertexArray(null);
    };

    canvas.addEventListener("webglcontextlost", function (e) {
      e.preventDefault(); api.ready = false; rail.classList.remove("gl");
    });
    return api;
  };
})();
