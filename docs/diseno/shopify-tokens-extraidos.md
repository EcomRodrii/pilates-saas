# Shopify admin — valores EXACTOS extraídos con DevTools (18-nov-2026)

Fuente: `shopify-diseno-<tienda>.json` generado con `docs/diseno/shopify-extractor-devtools.js` (2.248 variables, 81 elementos
únicos, 41 pseudoelementos, 221 `@keyframes`, 5 animaciones en marcha). Solo se copian valores de diseño, no marca, textos ni imágenes.

## Marco y menú
- Marco `#0a0a0a`; lienzo `#fff`, radio 16, a 4 px del borde. Cuerpo 13 px / línea 20 / **letter-spacing −0,01em**.
- Fila de menú: 30 px, radio 12, 13 px; **inactiva peso 450 `#dcdcdc`, activa peso 500 `#fcfcfc`**.
- Rótulos de grupo («Canales de ventas», «Apps»): 12 px / 500 / línea 16, `#a6a6a6`. «Agregar»: 13/500 `#aaa`, relleno 4×8, radio 8.
- **Vidrio** (`::before`, radio 13, sobresale `0.5px −6px`): activa `rgba(255,255,255,.11)`, buscador `.19`, hover de fila `.06`;
  sombras `inset 0 0 0 1px #fff05, inset 0 1px 1px #ffffff0f, inset 0 0 12px 1px #ffffff0f, 0 1px 2px #0000001a, 0 0 0 1px #0000001a`.
- **Brillo de abajo**: franja de 400 px `linear-gradient(rgba(70,131,17,0) 81.93%, rgba(70,131,17,.68) 96.87%, rgba(176,202,16,.68) 100%)`
  + haz `linear-gradient(90deg, lima 0 → .24 14% → .42 38% → .4 62% → .18 86% → 0)`, animación `trial-wave` 17,5 s lineal infinita
  (opacidad 0 → .35 → .35 → .16 → .3 → 0; `translate(-18%,8%) scale(.9)` → `(-2%,-6%) scale(1.08)` → `(18%,1%)` → `(4%,7%) scale(.94)`).
- Tarjeta de prueba: texto 13/500 blanco; botón blanco 12/500, 30 px, píldora, relleno 4×10, sombra `0 0 0 1px #00000012, 0 2px 20px #00000008, 0 5px 20px #00000008, 0 8px 60px #00000008`.

## Inicio
- Saludo 28 px / 500 / línea 33,6 / −0,7 px. Compositor: tarjeta blanca radio **26**, relleno 12, placeholder 13 `#757575`; el placeholder
  rota con **filtro blur 6 px ↔ 0 y opacidad, 0,5 s `cubic-bezier(.25,.1,.25,1)`**; debajo, pestaña gris `#f7f7f7` radio `26 26 0 0` («Recientes»), altura animada 0,3 s `cubic-bezier(.22,1,.36,1)`.
- Tarjeta de paso: título 15/500 (−0,15 px), texto 13 `#707070` línea 17,9, botón 12/500; imagen 286×140, radio 12, fondo `#f5f6f7` con textura y
  **bisel interior** `inset 0 0 0 1px #14181c17, inset 0 1px 0 #ffffffe0, inset 1px 0 0 #ffffff85, inset 0 -1px 0 #14181c14, inset -1px 0 0 #14181c0d`.
- Cierre `×` de tarjeta: 24 px, `rgba(255,255,255,.8)` + `backdrop-filter: blur(8px)`, sombra `0 2px 8px #0000001f`, opacidad .82.
- Chips sobre imagen: `rgba(0,0,0,.57)` + blur 8, radio 10, texto 12/500 blanco. Mosaicos de imagen: `translate` 0,8 s `cubic-bezier(.2,.8,0,1)`.

## Asistente (`aside#sidekick`)
- 347 × 553, fondo blanco, radio 16, a 7 px de arriba/abajo y 9 px del borde; el lienzo cede el ancho con `padding/margin-inline-end 0.5s cubic-bezier(.2,.8,0,1)`.

## Tokens Polaris leídos
- Radios: control 12, contenedor 20, popover 16, diálogo 24, banner 16, elemento 10, etiqueta/badge 8, opción 12, casilla 4.
- Tipografía: body 13 (−.01em), body-large 15, display S/M/L 22/26/29 (−.02em), heading-large 15, botón 12; pesos 400/500/600.
- Superficies: `#fff`, secundaria `#f7f7f7`, hover `#f2f2f2`, activa `#ebebeb`; borde `#ddd`; texto `#101010`, secundario `#4a4a4a`, enlace `oklch(48.4% .2413 262.8)`.
- Movimiento: overlays 500 ms `cubic-bezier(.19,1,.22,1)` y cierre 150 ms `cubic-bezier(.4,0,1,1)`; fundidos 0,5 s `cubic-bezier(.25,.1,.25,1)`; contenido 0,35 s `cubic-bezier(.32,.72,0,1)`; hover de fila 0,15 s.
- Sombras: `--p-shadow-100…500` en el JSON (`variables`).
- Tipografía de marca: `ShopifyInter` (pesos 100–900) = Inter. **Pendiente**: Tentare usa Schibsted Grotesk en el panel.
