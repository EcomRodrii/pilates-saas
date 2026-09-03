# Student PWA — DESIGN CONFLICTS

Conflictos entre el paquete de Claude Design y el backend/realidad de Tentare.
Cada uno dice qué pide el diseño, qué impone el repo y qué se hizo.

---

## DC-1 · Disciplinas del estudio · RESUELTO

**Diseño** · La portada de acceso pinta `disciplinas.join(' · ') + ' · ' + ciudad`
(«Pilates · Yoga · Barcelona»), y `StudioConfig.disciplinas` es obligatorio.

**Backend** · El concepto NO existe: `disciplina` no aparece en ninguna de las
164 tablas (0 coincidencias en `lib/db-types.ts`).

**Solución** · Se enseña solo la ciudad y `disciplinas: []` queda documentado en
`lib/student/estudio.ts`. Derivarlas de `tipos_clase` exigiría una consulta más
en la pantalla de login para una línea decorativa.

---

## DC-2 · Estado `PENDIENTE_APROBACION` · RESUELTO

**Diseño** · La máquina tiene once estados y ninguno cubre «el estudio tiene que
aprobar tu reserva».

**Backend** · `studios.reserva_requiere_aprobacion` existe y `reservar_plaza`
devuelve ese estado.

**Solución** · Se mapea a `waitlisted`: describe la situación real (está apuntada
y espera respuesta) y su copy —«te avisamos al momento»— encaja sin mentir.
Pintarlo como `confirmed` sería decirle que tiene plaza cuando no la tiene.

---

## DC-3 · Ventana de cancelación · RESUELTO

**Diseño** · `StudioConfig.politicaCancelacionHoras` es UN número, y
`cancelable()` decide en el navegador con `Date.now()` si se devuelve el crédito.

**Backend** · La ventana real es una cascada
`tipos_clase.ventana_cancelacion_horas ?? studios.cancelacion_ventana_horas`, y
quien decide si el bono vuelve es `cancelar_reserva_plaza`, que lo devuelve como
columna.

**Solución** · La función se renombra a `avisoCancelacion()` y su campo a
`devolveriaCredito`. Solo sirve para ESCRIBIR el aviso previo; no habilita ni
bloquea nada. La decisión es del servidor.

---

## DC-4 · `?state=` y `?outcome=` · RESUELTO

**Diseño** · `?outcome=` fuerza el desenlace de una reserva y `?state=` el de la
pantalla de confirmación, que además cae en `'confirmed'` por defecto.

**Solución** · `?outcome=` no existe. En la confirmación, un valor ausente o
desconocido cae en `error`, no en `confirmed`: enseñar una confirmación que
nadie ha confirmado es justo lo que el resto de la fase impide. El handoff
(§K.8) ya pedía quitarlos.

---

## DC-5 · Aforo del cliente ≠ aforo real · ASUMIDO

**Diseño** · `Clase.plazasLibres` se usa para decidir qué se puede reservar.

**Backend** · El aforo vendible es `aforo_efectivo(sesion_id)`, que resta las
máquinas averiadas (`bloqueos_maquina`) — y ese dato NO viaja en ningún payload
público.

**Solución** · El número se enseña igual, pero NADA depende de él: quien decide
es el servidor, y su rechazo tiene pantalla propia (`full`). Exponer
`bloqueos_maquina` sería la alternativa; es una decisión de backend pendiente.

---

## DC-6 · Contraste del eyebrow del héroe · RESUELTO

**Diseño** · La línea «estudio · fecha» sobre la foto de Inicio usa
`--accent-deep-muted`, que es el token de las etiquetas sobre la superficie
OSCURA («Tu próxima clase»).

**Problema medido** · Sobre una foto no funciona, y bajo white-label menos: el
token se deriva de la marca del estudio. Con Pilates Boutique (marca azul) sale
`#A1A2D8` sobre un fondo de luminancia 90/255 → **3,55:1**, por debajo del 4,5:1
exigido. En la captura la línea no se lee.

**Solución** · Pasa a la misma familia crema que el saludo, un punto por debajo
en opacidad para conservar la jerarquía: **5,17:1**. La legibilidad deja de
depender de la foto y del color de marca.

---

## DC-7 · Contraste de las micro-etiquetas · ABIERTO — decisión de producto

**Diseño** · `.t-label` (10px, versalitas) usa `--subtle-foreground: #98A093`
sobre el crema `#FAF9F5`.

**Medido** · **2,56:1**. El mínimo de WCAG AA para texto normal es 4,5:1 (3:1
para texto grande, y 10px no lo es).

**Por qué no se ha tocado** · El handoff marca los tokens como «no cambiar»
(§L), y `--subtle-foreground` alimenta las micro-etiquetas de las 21 pantallas:
cambiarlo es una decisión visual del producto, no un arreglo técnico. Afecta a
«4 clases · Hoy», a los contadores de sección y a los pies de las tarjetas.

**Opciones** · (a) oscurecer el token a ~`#6E7A6B` (4,6:1) manteniendo el tono;
(b) subir esas etiquetas a 12px y peso 600, que las llevaría al umbral de texto
grande; (c) asumirlo como decisión consciente.

---

## DC-8 · Botones secundarios por debajo de 44px · ABIERTO

**Diseño** · El handoff (§K.9) dice «touch targets ≥44px», pero sus propios
componentes usan `height: 40` en `btn--sm` y en la acción de `EmptyState`, y 36
en la acción de `PageHeader`.

**Estado** · Se respetan las medidas del paquete. El conflicto está DENTRO del
paquete, así que resolverlo por mi cuenta sería elegir cuál de sus dos reglas
gana.

---

## DC-9 · «Descargar recibo» · ABIERTO — decisión de producto y cumplimiento

**Diseño** · La pantalla de recibo (§A.15) tiene un botón «Descargar recibo».

**Backend** · NO existe ninguna ruta que sirva a una alumna su recibo o su
factura. Las dos de `app/api/facturas/*` son `verificarSesionStaff` (rectificar
y sellar), y la factura es un documento fiscal sellado con Veri*Factu.

**Estado** · El botón NO se ha puesto. Ponerlo con un toast de «pendiente» sería
prometer algo que no va a pasar. En su lugar, la pantalla dice a quién pedir la
factura, con el contacto del estudio.

**Para hacerlo** · Hace falta una ruta pública que valide `socioAutenticado`,
compruebe que el recibo es SUYO y entregue el PDF (`lib/factura-pdf.ts` ya
existe). Es un endpoint que entrega documentos fiscales: merece su propia
revisión, no colarlo en una fase de pantallas.

---

## DC-10 · «Intentar el pago de nuevo» · ABIERTO

**Diseño** · Un pago fallido ofrece reintentarlo desde la app.

**Backend** · El reintento con la tarjeta guardada existe —
`POST /api/stripe/charge-off-session`— pero es de PERSONAL:
`verificarSesionStaff` + `puedeMoverDinero(sesion.rol)`. No hay puerta de
alumna para cobrar con el método guardado sin redirect.

**Estado** · El botón NO se ha puesto. La pantalla explica el estado real («no
se ha hecho ningún cargo») y remite al estudio. Abrir un camino de cobro nuevo
para la alumna es trabajo de backend con su propia revisión de dinero.

---

## DC-11 · Retornos de Stripe · RESUELTO

**Problema** · `setup-tarjeta`, `setup-sepa` y la rama `'portal'` de
`origen-pago` devolvían a `/portal/<slug>/compras`, que no existe en el árbol
nuevo — y el catch-all de compatibilidad redirige TIRANDO la query. O sea: la
clienta guardaba su tarjeta y aterrizaba en una página que no le decía nada.

**Solución** · Los tres apuntan a `/portal/<slug>/pagos`, que sí existe. La rama
de compra de bono ya apuntaba a `/bonos`, que también existe ahora.

Y las pantallas ACUSAN el retorno, que es la otra mitad: `?tarjeta=ok`,
`?sepa=ok`, `?pago=ok|cancelado` y `?compra=cancelada` enseñan su aviso.

**⚠️ `?compra=ok` se COMPRUEBA, no se celebra.** El propio backend lo avisa por
escrito: significa «Stripe cobró», no «el bono está» — lo entrega el webhook y
puede tardar. La pantalla de bonos reintenta hasta ~12 s buscando la suscripción
del plan comprado y solo entonces dice que está; si no llega, dice que está
tardando, que no es lo mismo que un fallo.

---

## DC-12 · Los cuatro interruptores de preferencias · RESUELTO

**Diseño** · «Recordatorio de clase», «Plaza liberada», «Novedades del estudio»
y «Recibos por email»: cuatro interruptores inventados.

**Backend** · El modelo es CATEGORÍA × CANAL. Las categorías de una socia son
`reservas`, `clases`, `pagos` y `marketing` (`CATEGORIAS_POR_ROL.SOCIA`), y los
canales in-app, push, email, WhatsApp y SMS. Ausencia de fila = encendido.

**Solución** · Se respetan los NOMBRES del diseño —son mejores para una alumna
que «categoría reservas»— pero cada uno gobierna su categoría REAL. Inventarlos
habría producido una pantalla que guarda preferencias que el motor no lee.

---

## DC-13 · Cambiar el email · RESUELTO

**Diseño** · El email es editable, con el hint «te enviaremos un código de
verificación».

**Backend** · `actualizarSociaPublica` lo RECHAZA por escrito: cambiarlo
exigiría sincronizarlo con Supabase Auth y su flujo de confirmación, que no
existe.

**Solución** · El campo se enseña bloqueado y dice a quién pedirlo. El hint del
paquete promete un flujo que no está construido.

---

## DC-14 · Los tipos de notificación · RESUELTO

**Diseño** · Cinco tipos con icono: 'plaza-liberada', 'recordatorio', 'bono',
'estudio', 'valorar'.

**Backend** · No existen: hay categorías por rol. Se mapean por lo que
significan y lo que no encaja cae en 'estudio', que es el icono neutro (📣).

⚠️ Y los ENLACES de las filas ya emitidas apuntan al portal borrado — el deep
link se calcula al insertar y se persiste, así que reescribir el catálogo solo
arregla las nuevas. Se traducen al LEER (`lib/student/deep-links.ts`, 6 tests),
que es lo único que alcanza a lo ya emitido. Lo que no se sabe traducir se deja
SIN enlace: una notificación que no lleva a ninguna parte es mejor que una que
lleva al sitio equivocado. Y las 52 rutas de STAFF del catálogo se descartan
explícitamente.
