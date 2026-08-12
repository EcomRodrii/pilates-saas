# Imágenes por defecto de un estudio

Lo que ve una socia cuando su estudio todavía no ha subido ninguna foto.

**No se guardan en la base de datos.** `studios.imagen_bienvenida_url` y
`tipos_clase.foto_url` siguen naciendo `NULL`: estas fotos son un fallback al
pintar, resuelto en `lib/imagenes-por-defecto.ts`. Por eso mil estudios
comparten un archivo y cambiar una foto mañana es sustituir el fichero, sin
tocar ningún componente.

Se sirven desde `/public`, así que van ya optimizadas: nada de `next/image`
aquí. El portal y el widget usan `<img>` crudo por decisión ya documentada
(fondos con `position:absolute` + `object-fit:cover`, donde el optimizador no
aporta y sí obliga a medidas fijas).

## Los cinco archivos

| Archivo | Medidas | Ratio | Dónde se ve |
|---|---|---|---|
| `estudio-hero.webp` | 1600×1000 | 16:10 | portada de acceso · hero del widget · imagen al compartir |
| `estudio-vertical.webp` | 1200×1600 | 3:4 | bienvenida a pantalla completa · tarjeta grande del Inicio |
| `estudio-banda.webp` | 1600×592 | 27:10 | cabecera de las pantallas Clases y Bonos |
| `estudio-banner.webp` | 1600×770 | 2.08:1 | banner «Invita a una amiga» · banners de contenido |
| `clase.webp` | 1600×900 | 16:9 | cualquier clase sin foto propia |

## Lo que hay que respetar al sustituirlas

Cada una se recorta en varios sitios a la vez, y tres de las cinco llevan un
velo encima que las tiñe. No son fotos que se vean tal cual:

- **`estudio-hero`** se pinta en **duotono** (blanco y negro + multiply al 72 %
  sobre el color de marca del estudio). Tiene que funcionar sin color. Libre el
  15 % superior/inferior y el 12 % de cada lado.
- **`estudio-vertical`**: motivo en la mitad superior — la inferior la tapa la
  tarjeta de cristal y su degradado. Libre el 20 % de cada lado.
- **`estudio-banda`** es la **única que se ve limpia**, sin velo ni degradado.
- **`estudio-banner`**: motivo a la **derecha**. El 42 % izquierdo lo cubre un
  degradado sólido donde va el texto.
- **`clase`** se tiñe con el color del tipo de clase al 93 % → se lee como
  textura, no como fotografía: formas grandes, sin detalle fino ni caras
  reconocibles. Y en el listado del portal se recorta a un **cuadrado de
  52×52**, así que lo que cuente la foto va en el cuadrado central.

## Cómo se añaden

Se entregan en JPG o PNG a esas medidas exactas, en sRGB. El `.webp` que se
sirve sale de un script (~120 KB por archivo), mismo criterio que
`scripts/regenerar-marca.mjs` con la marca.

## Deliberadamente sin foto por defecto

- **Caras** (instructoras, propietaria, socias): una modelo de catálogo
  haciéndose pasar por quien da la clase es peor que las iniciales de hoy.
- **Retos del portal**: decisión ya documentada en `lib/portal-home-bloques.ts`
  — la tarjeta lleva un conteo real de participantes y mezclarlo con gente de
  archivo lo convierte en decorado.
- **Listados de clases**: la misma foto ocho veces en una pantalla se lee como
  un error; el color del tipo de clase distingue mejor.
- **Galería y banners que la propietaria crea a propósito**: son huecos que
  decide abrir ella.
