# Arara PALLACIO

As peças ficam penduradas numa arara: passe o mouse para virar cada uma, arraste para balançar, clique para abrir a página da peça (frente/costas, tamanhos, sacola). No celular, o primeiro toque vira a peça e o segundo abre.

HTML, CSS e JS puros, sem build. Para ver: `python3 -m http.server` na raiz e abra http://localhost:8000.

- `js/products.js` — as peças, preços, tamanhos e qual vista aparece na arara
- `js/rail.js` — a física da arara, a etiqueta e a página da peça
- `css/rail.css` — visual
- `assets/products/` — fotos recortadas
- `tools/prepare_photos.py` — recorta fotos novas (gancho centralizado, mesma escala)

## Adicionar uma peça

1. Três fotos PNG com fundo transparente, no cabide: frente, costas e perfil.
2. Rode o script e cole o `aspect` impresso em `js/products.js`, com nome, preço e tamanhos.
