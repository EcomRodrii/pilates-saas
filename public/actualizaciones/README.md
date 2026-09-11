# La foto de «Actualizaciones»

Un archivo, un sitio: el fondo del bloque destacado de `/actualizaciones`
(`components/actualizaciones/previews.tsx`).

**Está aparte de `public/por-defecto/` a propósito.** Aquellas son la foto que
Tentare le PRESTA a un estudio que todavía no ha subido la suya: se recortan en
cinco encuadres, tres van bajo un velo que las tiñe, y su README prohíbe las
caras porque una modelo de catálogo haciéndose pasar por la instructora que da
la clase es peor que unas iniciales. Ésta es Tentare hablando de su propio
producto, se ve entera y no la hereda ningún estudio. Compartir carpeta la
habría dejado a un `imagenDeEstudio()` de distancia de acabar siendo la portada
del portal de una clienta.

| Archivo | Medidas | Peso |
|---|---|---|
| `estudio.webp` | 1200×800 (3:2) | 73 KB |

## Al sustituirla

- **El motivo va a la derecha.** El tercio izquierdo lo ocupan las tarjetas
  flotantes; lo que cuente la foto tiene que sobrevivir a que le tapen esa
  franja.
- **Se ve limpia**, sin duotono ni tinte: solo un degradado corto en el borde
  izquierdo para deshacer la costura con la columna del texto.
- **Se recorta a ~1,45:1** en el panel (400 px de ancho). Deja aire arriba y
  abajo.
- Sale de un PNG/JPG en sRGB con
  `cwebp -q 84 -resize 1200 0 -m 6 -sharp_yuv origen.png -o estudio.webp`.
