"""Recorta as fotos das peças para a arara.

Cada foto (PNG/WebP com fundo transparente, peça num cabide) é recortada com o
gancho do cabide no centro do topo, e todas saem na mesma escala e altura, para
as peças ficarem do tamanho certo umas em relação às outras na arara.

Uso:
  python3 tools/prepare_photos.py mapa.json assets/products

mapa.json:
  { "fake": { "front": "fotos/fake-frente.png", "back": "...", "side": "..." }, ... }

Imprime o `aspect` de cada foto para colar em js/products.js.
"""
import json
import sys

import numpy as np
from PIL import Image

HEIGHT = 1000  # altura final, em px
PAD = 4        # folga acima do gancho


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
        canvas.save(f"{out}/{pid}-{view}.webp", "WEBP", quality=84, method=6)
        aspects.setdefault(pid, {})[view] = round(canvas.width / canvas.height, 4)
    print(json.dumps(aspects, indent=2))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
