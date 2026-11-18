# Shopify admin — barrido sección por sección (18-nov-2026)

Fuente: admin de una tienda de prueba abierta en el Chrome del fundador, solo lectura. Medidas de DOM leídas
con JavaScript en las pantallas nativas y a ojo sobre capturas ampliadas donde la pantalla vive en un iframe
(Informes y estadísticas, Inicio de Crecimiento). Tienda vacía: no hay filas de datos ni conversaciones.
**Solo se copian estructura, medidas, comportamiento y movimiento. Ilustraciones, logo y textos de marca de Shopify no.**

## 1. Marco (shell)
| Dato | Medida |
|---|---|
| Menú | 220 px de ancho, fondo casi negro, logo arriba a la izquierda y botón de contraer a la derecha de la misma fila |
| «Buscar ⌘K» | Primera fila del menú, 36 px, fondo gris translúcido, radio 12, texto `#a6a6a6` 13 px |
| Fila del menú | 30 px de alto, 198 de ancho (margen 12), radio **12**, 13 px peso 450, hueco 2 px, padding `1 4 1 8` |
| Color de fila | inactiva `rgb(220,220,220)`, activa `rgb(252,252,252)` con relleno gris oscuro |
| Submenú | Cuelga del módulo activo, sin icono, indentado; el activo con el mismo relleno |
| Pie del menú | «Configuración», tienda + campana, y el aviso de prueba con CTA a todo el ancho |
| Lienzo | `x=220, y=4`, **4 px de margen** arriba, derecha y abajo, **radio 16**, fondo blanco |
| Carga | esqueleto de menú (iconos y barras grises) y lienzo blanco vacío; la animación de entrada se llama `as-enter`, **400 ms lineal** |
| Transiciones del lienzo | `padding-inline-end` y `margin-inline-end` **0,3–0,5 s `cubic-bezier(0.2, 0.8, 0, 1)`** (al abrir el asistente) |
| Cabecera de página | una fila de ~28 px: icono + título (13 px, 450) a la izquierda; acciones a la derecha (botón de contorno y/o el primario negro) |
| Acción principal | botón negro, píldora, 13 px |

## 2. Asistente (Sidekick)
- **Píldora flotante** abajo al centro de TODAS las pantallas: avatar, «Trabaja con …», `+`, micrófono, voz y un icono de panel.
- Al abrir el icono de panel, el asistente es una **columna fija a la derecha de ~356 px** y **el lienzo se encoge** (1666 → 1306 px)
  con la transición de 0,3 s de arriba. No hay overlay ni oscurecimiento.
- Cabecera de la columna: píldora «Recientes» (historial) a la izquierda; a la derecha ajustes, expandir y cerrar.
- Estado vacío: avatar centrado + «¿Por dónde empezamos?» (grande, ~20 px, peso 400) y el compositor abajo (alto 56 px,
  campo con el avatar, `+`, micrófono, voz).
- En Inicio el mismo compositor va **en medio de la página** bajo el saludo, con «Recientes» a la derecha.

## 3. Inicio
- Saludo centrado en dos líneas (~24 px, 500), compositor bajo él, y **rejilla de tarjetas de siguiente paso**: imagen arriba
  (fondo `#f7f7f7`), título 13 px peso 550, texto gris, botón de contorno pequeño; descartables con `×`.
- Aviso de prueba: píldora negra arriba a la izquierda «oferta | Suscribirse» y «¿Dudas? teléfono» a la derecha.

## 4. Listados (Productos, Colecciones, Inventario, Pedidos, Clientes…)
- Cabecera de página con icono; acción principal negra a la derecha (y secundarias de contorno: «Exportar», «Importar»).
- Barra de vista: **selector de vista «Todos ⇅»** (pestañas de vistas guardadas, con `+`) y **buscador integrado «Buscar y filtrar»**
  en la misma barra con borde, radio ~12; a la derecha icono de columnas.
- Tabla **sin tarjeta alrededor**: cabecera de columnas con fondo gris `#f7f7f7` y casilla de selección, filas de ~40–44 px
  con miniatura cuadrada redondeada, números alineados a la derecha, sin líneas verticales.
- Vacío: **un panel** en tarjeta con ilustración a un lado (Productos) o centrada (Pedidos, Descuentos), título, frase, 1 botón
  negro y a veces un enlace «Más información sobre …» fuera de la tarjeta, centrado.
- Vacío por filtro (Inventario): lupa grande, «No se encontró …», sugerencia y botón negro «Borrar búsqueda y filtros».
- Bloque secundario gris bajo el vacío con oferta («Encuentra productos para vender»).

## 5. Tarjetas de resumen (Contenido › Metaobjetos)
- Fila de tarjetas con título + conteo («0 entradas») y una tarjeta **alta de «Entradas recientes»** a la derecha (lista título ↔ tipo).
- Barra de filtro debajo («Personalizado ⇅ | Buscando en definiciones de metaobjeto…») y vacío centrado sin ilustración.

## 6. Informes y estadísticas (gráficos)
- Cabecera: título + «Se actualizó hoy a las 10:32» en gris; a la derecha `⋯`, «Probar objetivos ⌄» (contorno) y «Nueva exploración» (negro).
- Banner informativo **celeste** de radio 16 con icono `i` azul y enlace «Más información».
- **Pastillas de filtro** grises (`#ebebeb`), 28 px de alto, radio completo: calendario + «Hoy ⌄», «17 nov 2026 ⌄», «EUR €».
- **KPI**: 4 tarjetas en fila (`Ventas brutas`, `Tasa de clientes habituales`, `Pedidos preparados`, `Pedidos`): radio ~16, borde 1 px muy claro
  + sombra suave, **título 13 px semibold con subrayado punteado** (es una definición), valor debajo (13 px bold) y un **sparkline azul** abajo a la derecha.
- **Gráfico principal** (2/3 del ancho) + **desglose** (1/3): título con subrayado punteado, **cifra grande** (~20 px bold), cuadrícula de líneas
  horizontales muy claras, etiquetas del eje Y a la izquierda (`10 €`, `5 €`, `0 €`) y del eje X abajo, leyenda con puntos azules (periodo actual / anterior).
  El desglose es una lista de enlaces azules con importe a la derecha y `···` por fila.
- Debajo, más tarjetas en rejilla (por canal, valor medio, por producto).
- Submenú: «Informes» y «Vista en tiempo real».

## 7. Crecimiento (marketing)
- Banner héroe sin tarjeta: titular grande (~24 px), frase, **botón negro + botón de contorno**, imagen a la derecha y `×` para descartar.
- «Rendimiento de marketing» con selector de periodo en píldora («Últimos 30 días ⌄») y «Ver detalles»; tarjeta con cifra grande,
  gráfico de área plano y leyenda; bloque «Sesiones por tipo de tráfico» con su vacío dentro de la tarjeta.
- Submenú: Atribución, Autopilot, Campañas.

## 8. Mercados
- Barra de búsqueda con icono de panel a la izquierda y filtros/orden a la derecha; tabla con **badge verde «Activo»**; **sugerencias en bandas
  violetas** («Crear mercado Unión Europea +») con `×` para descartar.

## 9. Finanzas
- Página **estrecha centrada** (~640 px): título grande «Finanzas», dos columnas pequeñas («Impuestos», «Saldo de pagos» con cifra y selector de divisa),
  enlace «Ver pagos». Selector «Documentos ⌄» arriba a la derecha.

## 10. Configuración
- Al entrar, el menú se sustituye por una **columna de ajustes** con «‹ Configuración», buscador propio y lista (Plan, Facturación, Usuarios, Pagos,
  Cuentas de cliente, Envío…), tienda arriba con su URL y la cuenta del usuario abajo; la rail de iconos del admin queda a la izquierda.

## 11. Estados e interacción comunes
- Esqueleto del marco en la carga, nunca spinner. Transiciones de layout 0,3–0,5 s con `cubic-bezier(0.2, 0.8, 0, 1)`; entrada de contenido 400 ms lineal.
- Pestañas/selector: máx. ancho animado a 0,3 s `cubic-bezier(0.42, 0, 0.58, 1)` (ease-in-out).
- Botón primario: negro sólido; secundario: contorno claro; terciario: texto/enlace azul.
- Campo de búsqueda sin borde propio dentro de la barra con borde; casillas de 16 px.

## Pendiente de ver (no se pudo con la tienda vacía)
Filas reales, selección múltiple y barra de acciones masivas, menús `···`, modales de borrado, toasts, formularios de pedido, Sidekick con una
conversación, vista de producto con datos, tema (Online Store) y `Configuración › cada sección` con su formulario.
