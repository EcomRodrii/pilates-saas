# Onboarding de Shopify — flujo y medidas (19-nov-2026)

Observado en directo en el Chrome del fundador, solo lectura, viewport 1600×699. Solo medidas y estructura: ni textos de marca,
ni imágenes, ni código de Shopify se copian. Los textos de Tentare son propios.

## Flujo (4 pantallas, todas saltables con «Skip»)
1. **Suscripción** `/signup/<id>/subscribe/checkout` — oferta de precio + pago. (Skip → 2)
2. **¿Qué quieres hacer?** `/subscribe/store-details` — chips multiselección. (Skip → 3)
3. **Bienvenida** `/store?welcome` — pantalla en blanco con titular centrado que, a los ~6 s, da paso a…
4. **Inicio con tarjetas de arranque** — compositor del asistente, carrusel de categorías, «Otras formas de empezar» (5 tarjetas).

Lo que lo hace sentir ligero: nada es obligatorio (Skip en 1 y 2), el panel real aparece ya con la prueba corriendo
(píldora «Obtén 3 meses…» arriba, tarjeta de prueba abajo en el menú), y las tareas siguientes son tarjetas, no un asistente.

## Pantallas 1 y 2: «modo foco» (sin panel)
- Fondo página `rgb(26,26,26)` sobre degradado radial casi negro-verdoso; logo arriba-izquierda (x 38, y 38); cuerpo `ShopifyInter`.
- **«Skip»**: píldora 71×44 (x 1501, y 28), fondo `rgb(40,49,51)`, texto blanco 16/20 peso 500, letter-spacing −0,512 px, relleno 12×20.
- **Flecha atrás** (pantalla 2): círculo 44×44 `rgb(40,49,51)`, a 12 px a la izquierda de la tarjeta.

### 1 · Suscripción
- Tarjeta partida 818×421 (x 391, y 112), radio **28**, fondo `rgb(2,16,18)` + degradado 123° (`rgba(92,107,108,.18)` 5 % → `rgba(4,16,18,.18)` 53 %),
  borde 0,55 px `rgb(56,70,73)`, sombra `0 0 30px #000`, relleno 8.
- Mitad izquierda: titular 29/36 peso 500, −0,58 px; tabla de 3 filas con separador fino (hoy / fecha / fecha), 16 px.
- Mitad derecha: 433×404, fondo `rgb(253,253,253)`, radio **20**. Botones de pago 184×40 píldora (negro; azul `rgb(0,112,186)`),
  dos columnas con 8 de hueco. Campos de tarjeta en un bloque 377×96, radio 12, sombra `0 0 0 1px #0000001f, 0 3px 4px -1.5px #0000000a…`.
- **Botón principal**: 377×38 píldora, `rgb(16,16,16)`, 13/500, −0,512 px, sombra interior
  `inset 0 0 12px -6px rgba(255,255,255,.75), inset 0 0 4px 2px rgba(255,255,255,.1)` (brillo de vidrio).
- Pie: «Estoy vendiendo desde [país]» con selector píldora oscuro.

### 2 · «¿Qué podemos ayudarte a hacer?»
- Titular 29/36 peso 500, −1 px, `rgb(250,252,252)`, centrado (y 100); subtítulo 18/24 peso 420, `rgb(192,192,192)`, −0,576 px (y 146).
- Tarjeta blanca (x 552, y 198, **496 de ancho**), radio **20**, relleno 24, hueco 24, sombra suave de 3 capas (`0 5px 5px -2.5px #00000008…`).
- **Chips** de multiselección: píldora, altura 41, relleno 10×16, hueco 8, 16/20, icono `+` (o `✓` si está activo). Activo = fondo oscuro
  `rgb(11,19,20)` y texto claro; inactivo = gris claro. Uno preseleccionado.
- «Continuar»: mismo botón de vidrio negro, ancho completo (≈ 440×38).

## Pantalla 3 y 4: panel con el menú oscuro (ya documentado en `shopify-tokens-extraidos.md`)
- Marco negro `#0a0a0a`, lienzo blanco radio 16; menú 215 px de ancho.
- **Bienvenida**: solo el titular a 2 líneas centrado en el lienzo, ~26 px peso 500 (nombre de la tienda subrayado con puntos = editable).
  Duración ≈ 6 s antes de aparecer el resto.
- **Píldora superior** (x 232, y 19, 294×36): negra, dos zonas separadas por una línea fina («Obtén 3 meses por 1 €/mes | Suscribirse»);
  a la derecha, «¿Dudas? teléfono» como texto enlace.
- **Compositor del asistente**: tarjeta 608×~100 centrada, radio ~26, fondo blanco con sombra suave; placeholder gris; abajo icono morado a la
  izquierda y, a la derecha, «Recientes», `+`, micrófono, onda.
- **Carrusel «Descubre…»**: 6 tarjetas verticales ≈ 160×230 con foto, inclinadas ±2° y solapadas ~12 px, radio ~18, etiqueta debajo.
- **«Otras formas de empezar»**: rejilla de 3 columnas (≈ 296 px, hueco 14); tarjeta blanca radio 20, borde 1 px muy claro + sombra suave;
  título 15/500, descripción 13 gris `#707070`, botón secundario píldora 12/500 (alto 26). Fila 1: tarjetas solo-texto (alto ≈ 144);
  fila 2: tarjetas con imagen 280×137 radio 12 sobre fondo gris `#f5f5f5` (alto ≈ 338) y botón abajo.
- **Menú, parte baja**: «Configuración», fila de tienda con avatar y campana con punto rojo, y la **tarjeta de prueba**:
  «La prueba termina en 2 días» + botón píldora blanco «Suscribirse», sobre el brillo verde-lima de abajo.

## Pendiente (JSON del extractor v2)
Responsive a 390 / 768 / 1349 y sombras/transiciones exactas de pantallas 3-4: se sacan pegando
`shopify-extractor-devtools-v2.js` en DevTools (descarga un JSON por ancho).
