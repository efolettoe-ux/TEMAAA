"""Recorta as fotos das peças para a arara.

Cada foto (PNG/WebP com fundo transparente, peça num cabide) é recortada com o
gancho do cabide no centro do topo, e todas saem na mesma escala e altura, para
as peças ficarem do tamanho certo umas em relação às outras na arara.

Uso:
  python3 tools/prepare_photos.py mapa.json assets/products

mapa.json:
  { "fake": { "front": "fotos/fake-frente.png", "back": "...", "side": "..." }, ... }

Nas fotos de perfil, o gancho foi fotografado de frente (um "?"), mas numa
arara ele fica de lado, como a peça. Por isso o gancho é apagado e redesenhado
de lado: um arame fino que sobe do cabide e passa por cima do cano, igual em
todas as peças.

Imprime o `aspect` de cada foto para colar em js/products.js.
"""
import json
import sys

import numpy as np
from PIL import Image

HEIGHT = 1000  # altura final, em px
PAD = 4        # folga acima do gancho
APEX = 0.009   # onde o gancho apoia no cano (fração da altura); igual a js/rail-gl.js
WIRE = 6       # espessura do arame, em px na altura final


def neck_of(a):
    """Linha e centro onde o arame encontra o cabide, numa foto de perfil."""
    w = (a > 100).sum(1)
    stem = next(y for y in range(20, len(w)) if w[y] <= 16)  # abaixo da curva do gancho
    neck = next(y for y in range(stem + 10, len(w)) if w[y] > 20)
    xs = np.nonzero(a[neck - 4] > 100)[0]
    return neck, (xs.min() + xs.max() + 1) / 2


def edge_on_hook(im):
    """Troca o gancho de frente por um de lado, centrado no meio da foto."""
    a = np.array(im)
    neck, nx = neck_of(a[:, :, 3])
    a[:neck - 2] = 0
    shift = int(round(a.shape[1] / 2 - nx))
    pad = abs(shift)
    out = np.zeros((a.shape[0], a.shape[1] + 2 * pad, 4), np.uint8)
    out[:, pad + shift:pad + shift + a.shape[1]] = a
    cx = out.shape[1] / 2
    top = round(APEX * a.shape[0]) - WIRE // 2
    for y in range(top, neck + 3):
        for x in range(int(cx - WIRE / 2) - 1, int(cx + WIRE / 2) + 2):
            u = (x + 0.5 - cx) / (WIRE / 2)          # -1..1 através do arame
            if y < top + WIRE / 2:                    # ponta arredondada
                v = (top + WIRE / 2 - y - 0.5) / (WIRE / 2)
                if u * u + v * v > 1:
                    continue
            cover = min(1.0, max(0.0, 1.0 - (abs(u) - 1) * WIRE / 2))
            if cover <= 0:
                continue
            tone = int(16 + 46 * max(0.0, 1 - abs(u + 0.3)))  # brilho de leve à esquerda
            px = out[y, x]
            alpha = int(255 * cover)
            if alpha >= px[3]:
                out[y, x] = (tone, tone, tone + 3, alpha)
    return Image.fromarray(out)


def measure(path):
    im = Image.open(path).convert("RGBA")
    a = np.array(im)[:, :, 3]
    ys, xs = np.where(a > 20)
    top = ys.min()
    hook_x = np.where(a[top:top + 12] > 20)[1].mean()  # a ponta do gancho
    return im, xs.min(), top, xs.max(), ys.max(), hook_x


def main(mapping, out):
    shots = json.load(open(mapping))
    boxes = {(pid, v): measure(p) for pid, views in shots.items() for v, p in views.items()}
    tall = max(b[4] - b[2] for b in boxes.values()) + 2 * PAD
    scale = HEIGHT / tall
    aspects = {}
    for (pid, view), (im, x0, top, x1, _bottom, hx) in boxes.items():
        half = int(np.ceil(max(hx - x0, x1 - hx))) + PAD
        cx = int(round(hx))
        canvas = Image.new("RGBA", (2 * half, tall), (0, 0, 0, 0))
        canvas.paste(im.crop((cx - half, top - PAD, cx + half, min(im.height, top - PAD + tall))), (0, 0))
        canvas = canvas.resize((round(2 * half * scale), HEIGHT), Image.LANCZOS)
        if view == "side":
            canvas = edge_on_hook(canvas)
        canvas.save(f"{out}/{pid}-{view}.webp", "WEBP", quality=84, method=6)
        aspects.setdefault(pid, {})[view] = round(canvas.width / canvas.height, 4)
    print(json.dumps(aspects, indent=2))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
