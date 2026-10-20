# Sistema de diseño de la web pública

`tokens.css` (los valores) y `armazon.css` (isla, paneles, menú móvil y pie) los
importan `IslaWeb.tsx` y `PieWeb.tsx`, que monta TODA página pública: home,
funcionalidades, soluciones, comparativas, recursos, precios, glosario, sobre,
seguridad, ayuda y legales. Aquí van las decisiones, no lo que se lee en el CSS.

## Decisiones

- **Prefijo `--w-` y solo propiedades personalizadas.** Next no descarga una hoja
  global al navegar: si alguien pasa de la web al panel, esto viaja con él. Con
  un prefijo propio y sin selectores no cambia nada allí. No es `brand/` (el
  panel), donde la oliva está retirada.
- **Paleta del fundador (fase 1, 19-oct-2026):** Olive `#343825`, Sand `#D9C29E`,
  Cream `#F6F4EF`, Ink `#22261F`. El degradado azul-magenta vive solo en el logo.
  `--w-piedra` (`#EEEEE8`) es el fondo de página de HOY: se retira cuando cada
  sección pase a Cream (pasos 2–4), no antes, para no cambiar a medias fotos y
  velos medidos contra él.
- **Contraste medido, no supuesto** (WCAG, relación de luminancias):

  | Token | Sobre Cream | Sobre Ink | Uso |
  |---|---|---|---|
  | `--w-texto` (Ink) | 14,0 | — | titulares y texto principal |
  | `--w-texto-2` `#4A4E3F` | 7,8 | — | cuerpo secundario |
  | `--w-texto-3` `#5C604F` | 5,9 (5,6 sobre Piedra) | — | el mínimo para texto pequeño |
  | `--w-sobre-noche` (Cream) | — | 14,0 | títulos del pie |
  | `--w-sobre-noche-2` `#C9C6B8` | — | 9,0 | enlaces del pie |
  | `--w-sobre-noche-3` `#A9A797` | — | 6,4 | el mínimo para texto pequeño sobre Ink |
  | Sand sobre Olive (botón) | — | — | 7,0 |
  | `--w-exito` / `--w-aviso` / `--w-error` | 5,7 / 5,4 / 6,2 | — | estados |

  El pie anterior no llegaba: `#5A5A52` sobre `#0F0F0F` (2,76:1) y `#6E6E68`
  (3,74:1) a 11–12 px. El texto de la isla va en Ink: sobre el vidrio encima de
  una banda oscura sigue por encima de 6,5:1.
- **Tipografía:** la sans ya cargada (Plus Jakarta Sans), titulares en 600 con
  tracking negativo y sin negritas de 800 a gran tamaño; nada por debajo de 13 px
  (`--w-fs-mini`). Sin serif cursiva de acento ni etiquetas en mono mayúscula
  (#2458, «sin pinta de IA»).
- **Cortes 640 / 1024 / 1280.** Las propiedades personalizadas no valen dentro de
  `@media`, así que se escriben con su número. La isla: menú tras el botón por
  debajo de 1024, «Entrar» fuera por debajo de 640, y «Cambiarme a Tentare»
  fuera por debajo de 1180 (la única excepción: es lo que mide la isla con todo).
- **Vidrio solo en la isla y su panel**, en un `::before`: un elemento con
  `backdrop-filter` corta el de sus hijos y el panel no desenfocaría nada. El
  panel va algo más opaco (`--w-vidrio-panel`, 0,86 frente a 0,72): lleva texto
  de 13–14 px y en las interiores cae sobre el héroe oscuro.
- **Movimiento:** los `--motion-*` de `app/globals.css`. La isla conserva su
  resorte al alargarse (su firma), y con «reducir movimiento» no hay transición.
- **Objetivo táctil de 44 px** en todo lo que se pulsa en la isla y el menú.

## Pendiente (pasos siguientes de la fase 2)

Solo se pasaron a tokens los componentes de este paso: la isla, el pie, la banda
final de la home (`SeccionCtaFinal`) y el layout legal. Siguen con colores a mano
(se migran en su paso): las secciones de la home (paso 2), `components/soluciones`
(paso 3), `components/funcionalidades`, `components/comparativa`, `PageShell`,
precios, sobre y seguridad (paso 4) y `components/recursos` (fase 3, blog).
