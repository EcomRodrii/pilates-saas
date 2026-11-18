# Benchmark Shopify — Fase 1 (exploración, 18-nov-2026)

Alcance real: marketing público (`shopify.com/es-es`) y un admin de PRUEBA con la tienda vacía
(inicio, productos, configuración). No se creó cuenta ni se suscribió a nada. Sin datos en la tienda no
se han podido ver tablas con filas, gráficos, filtros activos, selección múltiple ni toasts:
esas partes quedan **pendientes** (A-H marcado abajo).

## Observado (verificado en el navegador)

### Estructura (A)
- Marco oscuro (casi negro) con un **lienzo blanco redondeado** flotando dentro: el sidebar y la barra
  superior son el marco, el contenido es la tarjeta. Es la seña de identidad del admin actual.
- Sidebar: buscador `⌘K` arriba, módulos con icono + texto, **submódulos anidados bajo el activo**
  (Productos → Colecciones, Inventario, Órdenes de compra, Transferencias, Tarjetas de regalo),
  «Configuración» y la tienda abajo, y un aviso de prueba con CTA fijo al pie.
- **Configuración sustituye la navegación**: el sidebar pasa a una columna de ajustes con «‹ Configuración»
  para volver, buscador propio y la rail de iconos del admin queda a la izquierda.
- Cabecera del lienzo mínima: título de página con icono a la izquierda, acción secundaria a la derecha
  («Ver como»). Sin breadcrumbs en las pantallas raíz.
- Carga: **esqueleto del marco completo** (sidebar y lienzo) antes del contenido, sin spinner.

### Dashboard / inicio (B)
- Estado nuevo: título centrado + **barra de comando de IA** (Sidekick, siempre disponible abajo como
  píldora flotante «Trabaja con Sidekick») y 3 tarjetas de siguiente paso con ilustración (producto,
  diseño, pagos). Una acción obvia por tarjeta.

### Listados y vacíos (C, E, H)
- Productos vacío: pestaña «Todos» + `+` (vistas guardadas), iconos de búsqueda/filtro/orden a la derecha,
  **estado vacío con ilustración, 1 CTA primario negro + 1 secundario**, y debajo un bloque gris
  de oportunidad. La tabla no aparece hasta que hay datos.

### Elementos visuales (F) — tokens Polaris leídos en vivo
- Tipo: **Inter** (ShopifyInter), **13 px** base en admin; 12/13 px en la UI densa. Landing: 96 px peso 300.
- Fondo `#fff`, superficie secundaria `#f7f7f7`, borde `#ddd`, texto `#101010`, secundario `#4a4a4a`.
- Radios: 8 px (`--p-border-radius-200`) y 12 px (`-300`). Espaciado base 4 px (`space-400` = 16 px).
- Sombra: **pila de 7 capas muy suaves** (la última es un anillo de 1 px al 6 %): elevación sin "efecto sombra".
- Botón primario: **negro sólido**, sin color de marca. El color solo aparece en ilustraciones y estados.

### Formulario largo y búsqueda global (D, C) — añadido tras decidir seguir sin datos
Se abrió «Agregar producto» sin guardar nada.
- **Página de dos columnas**: columna principal ancha (medios, título, descripción, variantes, precio,
  inventario, envío, metacampos) y **columna lateral estrecha** con estado, canales, categoría, tipo,
  proveedor, colecciones y etiquetas. Lo que define «qué es» va a un lado; lo que lo describe, al centro.
- Cabecera: botón `‹` + **breadcrumb** «Productos / Agregar producto» (aquí sí hay breadcrumb: pantallas hijas).
- **Título como campo grande sin caja** (se escribe directamente), editor de texto enriquecido con barra
  compacta de iconos, zona de subida con 4 miniaturas 3D decorativas y un `+`.
- **Secciones = tarjetas apiladas** con título, interruptor a la derecha (inventario, envío) y
  **divulgación progresiva**: lo opcional es botón `+ SKU`, `+ Códigos de barras`, `+ Origen`, `+ Código SA`
  (píldoras pequeñas) en vez de campos vacíos.
- Campos con **unidad pegada dentro del input** (`0,0 | kg`, `L × A × H | cm`, «0 | Disponible»): el valor y su
  unidad se leen como uno. Selector que resume su contenido en una línea («Predeterminado de la tienda · Caja…»).
- **Sin botón Guardar a la vista en la parte inferior de la página**: la barra de guardado vive arriba y solo
  aparece al haber cambios (no verificado: no se editó nada).
- Asistente flotante persistente abajo al centro sobre el contenido, con `+`, micrófono y panel lateral.
- **Búsqueda `⌘K`**: diálogo centrado, campo grande, **filtros por tipo como píldoras** (Apps, Clientes, Pedidos,
  Productos, Canales), icono de filtro, estado vacío «Busca cualquier cosa en…», pista de teclado «Abrir ↵».
  El fondo se atenúa pero el marco sigue visible.
- Sin menú de notificaciones probado (campana junto a la tienda, no abierta).

### Ampliación (18-nov, sigue sin datos): vacíos, notificaciones, modal y móvil
- **Tres vacíos distintos, no uno**: (1) *Pedidos*: ilustración + explicación + CTA, y el motivo real del vacío
  («para recibir pedidos debes suscribirte»); (2) *Clientes*: **barra «Describe tu segmento» en lenguaje natural**
  sobre el buscador, acciones de cabecera `Exportar · Importar · [Agregar cliente]` (único botón negro) y el vacío
  es de *filtro* («no hay clientes que coincidan… edita el segmento»), no de datos; (3) *404*: ilustración propia con
  mensaje que remite al buscador. Cada submódulo (Borradores, Segmentos, Empresas) cuelga del módulo activo.
- **Notificaciones**: la campana (junto a la tienda, abajo) abre un **popover anclado** «Alertas» con icono de filtro,
  «Marcar todas como leídas» (desactivado sin alertas) y vacío en una línea. Sin pantalla aparte.
- **Modal de suscripción** (se abrió por un clic mío fallido en «Suscribirse»; se cerró con Esc, no se
  introdujo ningún dato): **diálogo ancho dividido 50/50**, izquierda oscura con la oferta y un enlace «Ver planes
  primero», derecha blanca con el pago embebido; cierre `×` arriba a la derecha. El precio y la renovación se dicen
  en el titular, no en letra pequeña.
- **Aviso de prueba** doble: píldora negra arriba («Obtén 3 meses por 1 €/mes | Suscribirse») y bloque fijo al pie del
  sidebar. Nunca bloquea el contenido.
- **Estado activo del menú**: pastilla redondeada (radio 12 px) sobre el marco oscuro, texto 13 px peso 450;
  `transition` por defecto y curva `cubic-bezier(0.2, 0.8, 0, 1)` (0,25 s en el ancho del sidebar, 0,5 s en
  márgenes): salida rápida, llegada suave.
- **Móvil (390 px)**: el sidebar desaparece; quedan **dos botones flotantes** abajo, hamburguesa a la izquierda y
  asistente a la derecha. El lienzo pasa a ancho completo sin marco oscuro, las tarjetas de «siguiente paso» se
  apilan a una columna y ganan un `×` para descartarlas. El título de bienvenida se alinea a la izquierda.
- **Aprendizajes de método**: coordenadas de un screenshot reducido ≠ coordenadas del marco real; un clic mal
  calculado cayó en un CTA de pago. Con acciones de dinero cerca, verificar el objetivo con `find` antes de pulsar.

## Qué traslada a Tentare (propuesta, sin tocar código)
1. Marco + lienzo: marco oscuro de sidebar, contenido en tarjeta blanca radio 12.
2. Una barra de comando global (`⌘K` ya existe) con el asistente como píldora, no como pantalla.
3. Vacíos con 1 CTA primario + 1 secundario y ilustración (Tenti **no** en pantallas de dinero).
4. Configuración como navegación propia con vuelta explícita.
5. Esqueleto de la estructura en carga, no spinners.
6. Sombras apiladas suaves en vez de una sola sombra fuerte.

## Choques con decisiones ya tomadas (hay que resolverlos antes de la Fase 2)
- **`brand/` manda sobre todo lo visual** (`.claude/tentare-os.md`): tokens `--t-*`, tipografía Schibsted Grotesk + DM Mono
  solo en el panel, Sand/Ink. Inter 13 px y botón negro de Shopify NO se adoptan tal cual: se toma el
  *principio*, no el valor. Los valores se cambian en `design-tokens.json`, nunca a mano.
- No tocar `rounded-3xl` ni `--radius-3xl` a la vez: migrar por componente (fase 6 de `brand/`).
- «Rebranding sobre una sola app role-gateada»: no hay split Manager/Core.
- Web comercial: el copy se PROPONE, no se cambia solo («Todo tu estudio. Bajo control.» es propuesta).
- Sin degradados salvo en los 3 sitios decididos; Tenti solo donde dice `donde-vive-tenti.test.ts`.

## Pendiente de explorar
Tablas con datos, filtros/orden/paginación, acciones masivas, calendarios y campos monetarios, formularios
largos y por pasos, modales/popovers/tooltips/menús de acciones, toasts, eliminaciones y confirmaciones,
centro de notificaciones, responsive/móvil. Hace falta una tienda de demostración con datos
(Shopify permite «Generar datos de prueba» desde el admin) o una cuenta con pedidos reales.
