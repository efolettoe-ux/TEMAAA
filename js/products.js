/* As peças da arara, na ordem em que aparecem.

   Fotos em assets/products/<id>-<vista>.webp, recortadas por tools/prepare_photos.py:
   todas com o gancho do cabide no centro do topo e na mesma escala.
     rail  — a vista que aparece quando a peça vira na arara (a da estampa)
     front / back — as duas vistas da página da peça
     side  — o perfil, como a peça fica pendurada de lado
   `aspect` é largura / altura de cada foto (o script imprime os valores).
   `turn: -1` gira para o outro lado (quando o perfil mostra a frente virada para a esquerda).
   `scale` corrige peças fotografadas mais de perto (os shorts): 1 = escala das camisetas.
   `price: null` mostra "Em breve" e não deixa adicionar à sacola.
   `stock` é opcional, por tamanho (0 = esgotado). */
window.PRODUCTS = [
  { id: "fake",          name: "FAKE T-SHIRT",           kind: "Camiseta", colour: "Azul Marinho", price: 199.90, cut: "tee",
    sizes: ["PP", "P", "M", "G", "GG", "XG"], rail: "back",
    aspect: { front: 0.765, back: 0.766, side: 0.233 } },
  { id: "matcha",        name: "MATCHA T-SHIRT",         kind: "Camiseta", colour: "Branca",       price: 199.90, cut: "tee",
    sizes: ["PP", "P", "M", "G", "GG", "XG"], rail: "back",
    aspect: { front: 0.766, back: 0.768, side: 0.239 } },
  { id: "maybach",       name: "MAYBACH HALF-ZIP",       kind: "Moletom",  colour: "Off White",    price: null,   cut: "sweat",
    sizes: ["P", "M", "G", "GG"], rail: "back",
    aspect: { front: 0.748, back: 0.762, side: 0.304 } },
  { id: "perignon",      name: "PERIGNON VERDE HOODIE",  kind: "Moletom",  colour: "Preta",        price: 329.90, cut: "sweat",
    sizes: ["P", "M", "G", "GG"], rail: "back",
    aspect: { front: 0.765, back: 0.756, side: 0.331 } },
  { id: "capri",         name: "CAPRI T-SHIRT",          kind: "Camiseta", colour: "Preta",        price: 229.90, cut: "tee",
    sizes: ["PP", "P", "M", "G", "GG", "XG"], rail: "back",
    aspect: { front: 0.763, back: 0.766, side: 0.201 } },
  { id: "mediterranean", name: "MEDITERRANEAN SHORTS",   kind: "Shorts",   colour: "Azul Marinho", price: null,   cut: "shorts",
    sizes: ["P", "M", "G", "GG"], rail: "front", scale: 0.68, turn: -1,
    aspect: { front: 0.759, back: 0.775, side: 0.327 } },
  { id: "limone",        name: "LIMONE SHORTS",          kind: "Shorts",   colour: "Listrado Branco e Azul Claro", price: null, cut: "shorts",
    sizes: ["P", "M", "G", "GG"], rail: "front", scale: 0.68, turn: -1,
    aspect: { front: 0.732, back: 0.762, side: 0.325 } }
];

window.PRODUCTS.forEach(function (p) {
  p.img = {};
  ["front", "back", "side"].forEach(function (v) { p.img[v] = "assets/products/" + p.id + "-" + v + ".webp"; });
  p.img.rail = p.img[p.rail];
  p.aspect.rail = p.aspect[p.rail];
});
