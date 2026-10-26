# Arara PALLACIO

As peças ficam penduradas numa arara: passe o mouse para virar cada uma, arraste para balançar, clique para abrir a página da peça (frente/costas, tamanhos, sacola). No celular, o primeiro toque vira a peça e o segundo abre.

HTML, CSS e JS puros, sem build. Para ver: `python3 -m http.server` na raiz e abra http://localhost:8000.

- `js/products.js` — as peças, preços, tamanhos e qual vista aparece na arara
- `js/rail.js` — a física da arara e a página da peça
- `js/rail-gl.js` — o desenho 3D em WebGL (giro com torção, volume, luz e sombra na parede); sem WebGL a arara usa CSS
- `css/rail.css` — visual
- `assets/products/` — fotos recortadas
- `tools/prepare_photos.py` — recorta fotos novas (gancho centralizado, mesma escala)

## Adicionar uma peça

1. Três fotos PNG com fundo transparente, no cabide: frente, costas e perfil.
2. Rode o script e cole o `aspect` impresso em `js/products.js`, com nome, preço e tamanhos.

## Shopify (tema Impact)

`shopify/` tem a mesma arara como section do tema, sem mexer em nenhum arquivo do Impact:

- `sections/pallacio-arara-3d.liquid` — a section "Arara 3D", um bloco "Peça" por produto
- `assets/pallacio-arara-3d.css`, `pallacio-arara-3d.js`, `pallacio-arara-3d-gl.js` e as 21 fotos
- `templates/page.arara-3d.json` — página de pré-visualização (abre com `?view=arara-3d` em qualquer página)

Nome, preço e tamanhos vêm do produto da loja; "Cor da foto" filtra os tamanhos daquela cor. O botão
adiciona ao carrinho por `/cart/add.js` e avisa o tema com os eventos `variant:add` e `cart:refresh`.
