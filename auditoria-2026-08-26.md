# Auditoría integral de Tentare — 26 de agosto de 2026

**17ª pasada.** Base auditada: `origin/main`, de `8bd08acf` a `69edd523` (main avanzó
41 commits durante la auditoría; los fixes se rebasaron sobre el HEAD final).
Rama entregada: **`audit/2026-08-26`** en tu repo local, sobre `69edd523`.

---

## ESTADO REAL DE TENTARE

**Estado general.** El producto está en un ritmo de entrega alto y sano: 41 commits en
36 horas, todos con PR propio, y el atasco de despliegue que dominó las pasadas del 19
al 23 de agosto sigue roto. Los hallazgos del 25-ago que se dieron por cerrados **lo
están de verdad**: lo comprobé contra producción con control positivo, no por el
`success: true` de la migración.

**Riesgo de seguridad: alto y concentrado en un solo patrón.** Por cuarta vez, la
defensa de una señal de confianza del marketplace vivía en el código de la API y no en
la base de datos. Como `authenticated` habla con PostgREST directamente, eso no es
defensa en profundidad: es la única defensa, puesta en el sitio equivocado. Esta vez el
detalle era más fino y por eso sobrevivió: el trigger que se puso el 13-ago **sí**
existía, pero era `BEFORE UPDATE`, y nadie comprobó el INSERT. Verificado explotable en
producción antes de tocar nada.

**Riesgo de dinero: alto, y por una causa incómoda.** Los dos 🔴 de pagos son
**regresiones de los fixes del 25-ago**. `I-8` convirtió el camino de compra sin login
—el flujo estrella— en «cobrar y no entregar nada» en cuanto el email ya existe, que es
el caso normal. Pasó typecheck, lint y 3.358 tests porque **ninguno de sus 17 tests
modela los índices únicos reales de la tabla**. La lección no es «hubo un bug», es que
un fix del camino del dinero no debería darse por cerrado sin un test que corra contra
el esquema de verdad.

**Riesgo de datos:** medio. El aislamiento entre estudios aguanta: revisé las 9 Server
Actions implementadas y las rutas de pago y no encontré ninguna que acepte un
`estudioId` del cliente. Lo que falla no es el tenant, es el *ownership fino* dentro del
mismo estudio (el recibo de A cobrado a la tarjeta de B).

**Deuda técnica: creciente y con una fuente clara.** `lib/actions/**` tiene 264
ficheros, 6.749 líneas y **9 implementados**. De los 255 restantes, ninguno lo importa
nadie. Es andamiaje que sombrea rutas de API vivas y cuyo `Migrated from:` invita a
creer que la ruta ya está migrada.

**Áreas más problemáticas**, por orden: (1) el motor de reembolsos y disputas, que
declara una red de recuperación que no recupera nada; (2) el scaffold de Server Actions;
(3) la máquina de estados del widget de reserva, con cinco arreglos consecutivos sobre
el mismo sitio; (4) las señales de confianza de Network.

---

# 🔴 CRÍTICOS

### [C-1] El sello «Perfil verificado» del marketplace era auto-otorgable por INSERT

**Severidad:** 🔴 · **Área:** Network / RLS · **Estado:** ✅ SOLUCIONADO Y VERIFICADO

**Archivos:** `supabase/migrations/20260813135453_red_endurecimiento_ultrareview.sql:50`,
`supabase/migrations/20260813111206_...sql:108`

**Evidencia (producción, antes del fix):**
```
has_column_privilege('authenticated','red_experiencias','estado_verificacion','INSERT') => true
has_column_privilege('authenticated','red_experiencias','studio_id','INSERT')           => true
```

**Qué ocurre.** El trigger que impide auto-otorgarse la verificación es
`create trigger ... before update`. Un INSERT directo a PostgREST con el JWT propio no
lo dispara, y `red_experiencias_insert_propio` solo comprueba que la fila es tuya.
Cualquiera con cuenta podía hacer:

```
POST /rest/v1/red_experiencias
{"perfil_id":"<el mío>", "nombre_estudio":"Studio Y",
 "estado_verificacion":"confirmada", "studio_id":"<un estudio real ajeno>"}
```

**Impacto.** El badge de confianza principal del marketplace, más la atribución de haber
trabajado en un estudio real que no te ha verificado, más el filtro
`soloExperienciaVerificada` del buscador y puntos extra en `lib/network/ranking.ts`. La
tabla hermana lo hace bien: `red_certificaciones_insert_propio` sí exige
`estado = 'pendiente' and resuelto_en is null` en su `WITH CHECK`.

**Solución aplicada.** El trigger pasa a `before insert or update` y en el INSERT fuerza
`estado_verificacion := 'sin_solicitar'` y `studio_id := null` para todo lo que no sea
`service_role`. Trigger y no policy, por el mismo motivo que en 20260813135453: una
policy no puede acotar columnas dentro de una fila.

**Verificación.** Prueba funcional en producción dentro de una transacción con rollback:
un INSERT como `authenticated` pidiendo `'confirmada'` queda en `sin_solicitar` con
`studio_id` NULL, y —control positivo— un UPDATE como `service_role` sí puede
confirmarla.

---

### [C-2] El badge «Referencia profesional» no necesitaba ningún referente

**Severidad:** 🔴 · **Área:** Network / RLS · **Estado:** ✅ SOLUCIONADO Y VERIFICADO

**Archivos:** `supabase/migrations/20260813111231_...sql:39` y `:52`,
`app/api/public/network/referencia/route.ts`

**Evidencia (producción, antes del fix):** `estado` era INSERT-able **y** UPDATE-able por
`authenticated`, sin trigger de ningún tipo. Y además:
`has_column_privilege('authenticated','red_referencias','token','SELECT') => true`.

**Qué ocurre.** Todo el flujo real —token de un solo uso, caducidad de 7 días, rate
limit— vive en la API. Por REST directo bastaba un `PATCH .../red_referencias?id=eq.<mía>
{"estado":"confirmada"}`. **Y aunque se cerrase esa puerta, quedaba la principal:** la
dueña podía leer el `token` de su propia solicitud y confirmarse a sí misma llamando al
endpoint público legítimo. El GET de `app/api/network/referencias` ya excluía `token` de
su lista de columnas — pero eso era una decisión de la API, no de la base de datos.

**Solución aplicada.** Trigger `before insert or update` que congela
`estado`/`resuelto_en`/`token`/`token_expira_en` fuera de `service_role`, **más** revoke
de tabla + grant por columna dejando `token` ilegible para `authenticated`.

**Verificación.** `has_column_privilege(...,'token','SELECT') => false` con control
positivo (`nombre_referente` sigue en `true`), y prueba funcional del trigger con
rollback.

---

### [C-3] «Cobrado y sin entregar» en el flujo de compra sin login

**Severidad:** 🔴 · **Área:** Pagos · **Estado:** ✅ SOLUCIONADO Y VERIFICADO

**Archivo:** `lib/billing/entregar-plan-comprado.ts:177-215`

**Qué ocurre.** El fix I-8 del 25-ago introdujo
`const debeCrearFichaNueva = compra.esInvitada`, saltándose la búsqueda por email. Pero
`socios` tiene **dos** índices únicos y el código asumía que solo había uno:

```
socios_pkey            (id)                       → reintento real de Stripe
uq_socios_studio_email (studio_id, lower(email))  → el email ya existe
```

El 23505 del segundo se trataba como «reintento benigno», `socioId` quedaba apuntando a
una ficha que no existe, y el insert de `suscripciones` moría después con 23503 (FK).

**Por qué no es un caso borde.** El flujo estrella «pagar y reservar sin login»
(`app/reservar/[slug]/page.tsx:1601`) nunca manda `socioId`, solo email → `esInvitada`
es **siempre** true. Se rompía en los dos casos más frecuentes: una socia ya dada de
alta que compra sin loguearse, y una invitada que compra por segunda vez.

**Impacto.** Paga, y no recibe bono, ni recibo, ni la plaza que acaba de pagar. **Y no
hay rescate:** el 200 ya se envió (Stripe no reintenta desde el cambio de I-5) y el
conciliador reintenta cada hora contra exactamente el mismo choque.

**Solución aplicada.** Distinguir los dos 23505: primero se busca la ficha por
`ids.socioId` (¿es el reintento?); si no existe, se busca la dueña del email y se le
entrega. Reutilizar esa ficha no suplanta a nadie: le da su bono a quien es dueña de ese
correo. El daño que I-8 quería impedir —guardar el método de pago sobre ficha ajena— lo
cierra `identidadDemostradaEnCompra` en el webhook, no esta rama.

**Verificación.** Test nuevo con un fake que **sí** modela los dos índices únicos y la FK.
Comprobado que **falla al revertir el fix** y que su gemelo (reintento por PK) pasa en
ambos casos — o sea, que no es un test trivialmente verde.

---

### [C-4] El informe de rendimiento del equipo estaba inventado

**Severidad:** 🔴 · **Área:** Equipo / Server Actions · **Estado:** ✅ SOLUCIONADO

**Archivo:** `lib/actions/equipo/equipoRendimientoAction.ts:23-30`

**Qué ocurre.** La migración a Server Actions sustituyó el cálculo real por un `select`
de nombres. `lib/api-client.ts:1955` espera
`{instructorId, retencionPct, conversionPct, redSocialPct, datosInsuficientes}` y recibía
`{id, nombre, email, activo}`. `obtenerRendimientoInstructoras` seguía existiendo en
`lib/equipo/rendimiento-datos.ts:13` **sin un solo llamante**, con sus tests en verde
midiendo código muerto.

**Impacto.** `datosInsuficientes === undefined` es falsy → la pantalla **nunca** muestra
el aviso honesto «todavía no hay datos suficientes» y pinta la rejilla de métricas vacía
bajo el título «Retención, conversión de primerizas y red social — últimos 90 días». Una
propietaria evaluaba (y potencialmente remuneraba) a su equipo con un informe vacío que
la pantalla presenta como calculado. Es la familia «la UI miente al usuario», disfrazada:
no es un `{ok:true}`, es un payload con forma plausible.

**Solución aplicada.** Reconectar `obtenerRendimientoInstructoras`.

**Riesgo residual (🟡).** Esa función hace un `select` de **todas** las sesiones
históricas del estudio sin límite. Hasta ahora era código muerto; nunca se ha ejecutado a
escala real. Conviene acotarla antes de que un estudio grande la estrene.

---

### [C-5] El interruptor «Barra flotante» cambiaba el preview y no el portal

**Severidad:** 🔴 · **Área:** Theme Builder · **Estado:** ✅ SOLUCIONADO CON GUARDIÁN

**Archivos:** `lib/db/supabase-data-admin.ts:679` (ausencia), `lib/studio-context.tsx:979`

**Qué ocurre.** `studio-context` hace `setBarraFlotante(pub.barraFlotante === true)` y
`pub.barraFlotante` era **siempre** `undefined`, porque `camposTema` nunca lo emitía. La
rama `'floating'` de `portal-tema-marco.tsx:266` era código muerto en producción. En el
preview sí funcionaba, porque ahí el valor llega por el otro carril
(`lib/theme-preview-puente.ts:90`).

**Impacto.** En los tres temas cuyo `tab_bar_style` de fábrica es `classic` —Tentada,
Oliva, Noir— la propietaria activa el interruptor, lo ve cambiar, publica, y sus socias
siguen viendo la barra de siempre.

**Por qué sobrevivió.** El sistema de temas tiene **tres** carriles de transporte (CSS
`:root`, CSS `:root:root` del kit, y valores JS en `camposTema`) y solo dos tenían
guardián. El e2e que existía (`e2e/apariencia-tema.spec.ts:218`) comprueba el cuerpo del
PATCH de guardado — que el editor lo **guarda**, nunca que el portal lo **lee**.

**Solución aplicada.** Emitir el campo, más `lib/theme/payload-publico.test.ts`: un
guardián que extrae las dos listas **del código** (los ejes que declara
`CoreContextValue` y las claves que emite `camposTema`) y falla si divergen. Un eje nuevo
entra solo en la cobertura. Comprobado que falla al quitar el campo, con control positivo
y guarda anti-lista-vacía.

---

### [C-6] El widget embebido destruía la confirmación y el error justo al reservar (y al comprar)

**Severidad:** 🔴 · **Área:** Reservas / Widget Modo B · **Estado:** ✅ SOLUCIONADO

**Archivos:** `lib/widget/usar-datos-widget.ts` (4 llamadas),
`app/widget-bundle/main.tsx` (`onComprado`)

**Qué ocurre.** Tras la acción se llamaba a `recargar()` sin `{silencioso:true}`, que pone
`cargando` a true; `app/widget-bundle/main.tsx` sustituye entonces el árbol entero por el
esqueleto, **desmontando `<ReservaCalendario>`** en el mismo lote de estado en que la hoja
iba a pintar «¡Reserva confirmada!» o el motivo del rechazo.

**Impacto.** La socia pulsa Reservar, ve un parpadeo, y el calendario vuelve sin ficha,
sin confirmación y sin error. Un «no» del servidor —sin bono, tope semanal, clase ya
empezada— **se pierde en silencio**. Es el mismo fallo que
`components/reserva/reserva-calendario.tsx:898` documenta haber arreglado: arreglado en el
componente, reabierto por el hook que lo alimenta.

**Alcance real (encontrado en la revisión del propio parche).** No eran tres caminos sino
**cinco**, y el quinto es el peor: `onComprado` hacía lo mismo **tras un pago con éxito**,
así que la socia no llegaba a ver la confirmación de una compra ya cobrada. Se han
corregido los cuatro post-acción; la carga inicial sigue ruidosa a propósito.

---

# 🟠 IMPORTANTES

### [I-1] `slug`, `lat` y `lng` de Network eran escribibles por `authenticated` — ✅ SOLUCIONADO

Moderación solo genera el slug `if (fila && !fila.slug)`
(`app/api/interno/network/perfiles/route.ts:77`), así que una instructora en `draft` podía
fijarse su URL pública por REST y moderación la respetaba al publicar — incluido hacer
squatting del slug de otra, por el `unique`. Con `lat`/`lng` a mano se aparece en
cualquier búsqueda «cerca de mí» sin estar allí. Cerrado con la misma técnica de
20260825074240 (revoke de tabla + grant por columna), verificado con control positivo.

### [I-2] `red_verificaciones_experiencia`: el gemelo — ✅ SOLUCIONADO

Encontrado **al revisar mi propio parche**. Misma forma que C-1: la policy de INSERT solo
mira la propiedad de la fila y `estado` admite `'confirmada'`. El daño directo estaba
acotado (el badge lo decide `red_experiencias`, ya blindado), pero hay un
`unique (experiencia_id)`: una fila auto-insertada **bloquea la solicitud legítima
posterior**. Trigger `before insert` únicamente — el UPDATE es el camino por el que el
estudio resuelve la solicitud y tocarlo sería cambiar comportamiento de negocio.

### [I-3] El recibo de A se podía cobrar a la tarjeta guardada de B — ✅ SOLUCIONADO

`lib/billing/stripe-cobros.ts:74` valida que el recibo es del estudio y que la socia es
del estudio, pero **nunca que el recibo sea de esa socia**. Dos de sus seis llamantes
(`/api/stripe/charge-off-session` y `/api/cobros/cobrar-online`) toman `socioId` del body
sin cruzarlo con nada. Un cargo real a una tarjeta ajena por un identificador que llega
del cliente; un typo en la UI basta. Verificado que ninguno de los seis llamantes pasa
legítimamente un `socioId` distinto del del recibo, y que no existe el concepto de cuenta
familiar pagadora.

### [I-4] El formulario de acceso se quedaba pegado tras entrar con contraseña — ✅ SOLUCIONADO

`app/widget-bundle/main.tsx:137`. `onListo()` solo lo llama el registro;
`onLoginPassword` no, confiando en un comentario que dice que «el padre deja de mostrar
este formulario solo». No lo hacía: al entrar, la cabecera cambia a la rama «Mi cuenta» y
el botón «Ver clases sin iniciar sesión» —el único que bajaba `accesoAbierto`— desaparece.
Socia dentro, con el formulario de login pintado encima del calendario para siempre. Es la
otra mitad de #1408.

### [I-5] Reloj congelado en Modo B — ✅ SOLUCIONADO

`lib/widget/usar-datos-widget.ts:134`. De `nowMs` sale `slots`, que filtra
`inicio > nowMs`. El widget **sí** refresca datos cada 60 s, así que traía clases frescas
y las medía contra la hora del montaje, ofreciendo clases ya empezadas que el servidor
rechaza después. El comentario justificaba el valor fijo diciendo que «no hay reloj en
pantalla» — describía el caso feliz, no lo que hacía cierta la decisión. Es el bug que el
Modo A arregló (`page.tsx:451`) y que a este lado no llegó.

### [I-6] Comodines de ILIKE y parámetro `ciudad` sin validar — ✅ SOLUCIONADO

`/network/instructoras/ciudad/%25` llegaba a `ilike('ciudad','%%%')` y devolvía todos los
perfiles. Como el guardia de indexación mide «¿hay resultados?», una URL con comodín
**siempre** los tenía y quedaba indexable: espacio de URLs ilimitado bajo `tentare.app`
con `<title>` y `<h1>` de texto arbitrario. No es XSS (React escapa), es doorway content
y amplificación de consultas.

Cerrado en los dos sitios: validación del parámetro (`lib/network/ciudad-param.ts`, antes
duplicado literal en los dos `page.tsx`) y escapado en la consulta. El escapado se
consolidó en `lib/escapar-like.ts` porque **era la misma lógica escrita tres veces** —
`lib/billing/socia-nueva.ts` ya la tenía, con el mismo razonamiento sobre `*`, y a la que
faltaba (la de entregar el plan) le costaba dinero.

### [I-7] El panel de salud prometía un rescate que no existe — ✅ SOLUCIONADO (texto)

`lib/salud/comprobaciones.ts:125` decía «Lo rescata el conciliador». Es cierto solo para
entregas de plan y recibo. No lo es para reembolsos, disputas, `refund.failed`, SEPA,
dunning ni sellado de factura. Quien leyera el panel tras uno de esos eventos concluiría
que ya se arregló solo.

### [I-8] Enlace sin sanear en la ficha pública de estudio — ✅ SOLUCIONADO

`app/network/estudios/[slug]/page.tsx:116` pintaba `href={estudio.sitioWeb}` crudo, con
`hrefCanal()` existiendo justo al lado y los otros dos consumidores sí usándolo. React 19
lanza error ante `javascript:`, así que el vector clásico lo tapaba el framework, no el
código — queda el open-redirect y la regresión el día que cambie el framework.

---

# ⏳ PENDIENTES (con motivo)

### [P-1] 🔴 La red de recuperación de reembolsos y disputas es un placebo

**Archivo:** `lib/inngest/conciliar-reembolsos.ts` · **Por qué no lo he arreglado:**
requiere extraer las ramas `charge.refunded`/`charge.dispute.*` del webhook a un módulo
compartido y reescribir el cron. Es un cambio de arquitectura de la conciliación, no un
fix localizado, y toca el camino del dinero.

El commit `56355b21` («red de recuperación para reembolsos y disputas») registró una fila
en `webhook_reembolsos` y **nada más**: no marca el recibo `DEVUELTO`, no llama a
`registrarDevolucion`, no emite `PAGO_DEVUELTO`. Peor: esas tablas **solo las escribe este
cron**, así que la primera pasada inserta la fila y todas las siguientes la ven y hacen
`continue` — el reembolso queda marcado «procesado» para siempre sin que se haya aplicado
nada. Y tres defectos más: `stripe.charges.list` va **sin `{stripeAccount}`** (los cobros
de socias son direct charges en cuentas Connect, así que el barrido ve ~cero), el filtro
mira la fecha del cargo y no la del reembolso, y `recibo_id` nunca se rellena.

**Consecuencia abierta:** se devuelve un cobro, el `after()` muere, y el recibo se queda
COBRADO con el dinero ya fuera. Ingresos inflados, bono activo, propietaria sin enterarse.
**Mientras no se arregle, es más honesto borrar el cron que dejarlo**: hoy da falsa
sensación de cobertura y quema la señal.

### [P-2] 🟠 Un reembolso de venta POS no revierte nada

`ORIGENES_CON_RECIBO` (`app/api/stripe/webhook/route.ts:27`) no incluye `pos_terminal` ni
`pos_bizum`. Devolver un cobro de datáfono o Bizum presencial no marca `ventas_pos`, no
deja fila en `devoluciones` y no avisa a nadie: los ingresos del cierre para la gestoría
quedan inflados. No es añadir dos strings a la lista —las ventas POS no generan
`recibos`—, hace falta una rama propia. Decisión de producto pendiente.

### [P-3] 🟠 El scaffold de Server Actions: 255 módulos huérfanos

264 ficheros, 9 implementados, y **ningún componente cliente importa nada** de
`lib/actions/**`: los 9 llamantes reales son rutas de API. `requireAuthInServerAction` lee
la cookie `sb-<projectId>-auth-token` que **este repo nunca escribe** (supabase-js persiste
en `localStorage`), así que solo autentica por cabecera — o sea, el patrón está validado a
través de la capa HTTP que el sprint quiere eliminar. Falla en cerrado, no es explotable,
pero «Server Actions migration complete» describe un refactor que no puede usarse como
Server Action. Además hay 12 pares de stubs con nombres casi idénticos junto a las
implementaciones reales: un autocompletado equivocado sustituye la implementación por un
`throw`.

**No lo he tocado** porque borrar 255 ficheros es una decisión de producto sobre un sprint
en curso.

**Comprobación que recomiendo hacer ya:** `npm run build && jq 'keys' .next/server/server-reference-manifest.json`.
Si las 9 acciones vivas aparecen ahí, son invocables por POST con cabecera `Next-Action`
saltándose el route handler — y entonces el rate limit de `/api/equipo/reclamar` (20/min)
queda puenteado, porque vive fuera de la acción.

### [P-4] 🟠 Siete acciones de `decisiones/` devuelven éxito falso sin marcador

`lib/actions/decisiones/*Action.ts` devuelven `{ok:true}` sin tocar la base de datos y
**sin ningún `TODO`**, así que un `grep` no las encuentra y `accionSinImplementar` tampoco.
Solo comprueban `requireAuth`, ningún rol: un `INSTRUCTOR` «aprobaría» decisiones del
Decision OS el día que alguien las conecte. Hoy están huérfanas.

### [P-5] 🟠 Las rutas de equipo devuelven el `message` de Postgres en crudo

`lib/actions/equipo/equipoAction.ts:121,206,249` hacen `throw error` con el
`PostgrestError` tal cual y la ruta lo serializa entero. Se perdió `errorInterno`, así que
(a) nombres de constraint y políticas RLS viajan al navegador, (b) **no queda ningún
`captureException`**: un fallo de alta/baja de personal es invisible en Sentry, y (c) el
status volvió a deducirse por `message.includes()`, mal: un 403 legítimo sale como 500 y
**cada denegación de permisos se reporta a Sentry como error de aplicación**. En
`/api/equipo/reclamar` los cuatro textos de `MENSAJE_RECHAZO` no casan con ningún
substring del mapeo, así que los cuatro son 500.

Es un bloque coherente de ~40 líneas en 5 rutas; lo dejo fuera para no mezclarlo con los
🔴 en el mismo PR.

### [P-6] 🟠 La máquina de estados del widget Modo A

Cinco arreglos consecutivos sobre el mismo sitio (#1390, #1393, #1403, #1408, #1416/#1417)
son síntoma de dos causas estructurales: la exclusión mutua se expresa como una condición
booleana replicada en vez de como un estado único, y Modo A y Modo B tienen capas de datos
gemelas escritas por separado. Quedan vivos: tres bloques sin `enVistaReserva` (ficha
+ login pintados a la vez, alcanzable desde un enlace `?sesion=`), tres copias incompletas
de la transición «abrir login» que dejan a una walk-in autenticada en un callejón sin
salida, y `handleSignContract` sin cerrojo ni error visible (dos pulsaciones crean **dos
fichas de socia**). El cambio que corta la serie es un `type VistaWidget` único; **excede
el límite de 150 líneas**, así que lo dejo propuesto.

### [P-7] 🟠 Otros, con evidencia en el informe largo

- La rama SEPA del webhook escribe sin acotar por estudio; su gemela de tarjeta, 30 líneas
  más arriba, sí lo hace. Hoy no explotable (`autorizarSobreSocia` cierra el origen).
- `GET /api/equipo/liquidaciones`: un `MANAGER` puede leer la liquidación de cualquier
  instructora del estudio, incluida la de la propietaria, sin el `puedeGestionarFichaDe`
  que sí aplican POST y PATCH.
- Compra suelta de bono: la clave de idempotencia usa una ventana de un minuto, así que
  dos pestañas separadas por más de 60 s siguen produciendo dos cargos. Autodocumentado en
  `lib/billing/clave-checkout-embebido.ts:156`.
- No existe ningún ledger de cargos: si una propietaria dice «me han cobrado dos veces» por
  un **recibo**, la única evidencia es un mensaje de Sentry (90 días de retención). Una
  tabla `cargos_stripe(payment_intent_id PK, ...)` lo resolvería, junto con la clave natural
  que le falta a `webhook_reembolsos`.
- `red_perfiles_alumna` no tiene la cláusula de estado que sí tiene `red_perfiles`: un
  perfil suspendido podría autorrestaurarse. Latente (ninguna ruta escribe esa tabla).
- El publicado de tema invalida solo la instancia que atendió el POST; hasta 60 s de
  desfase en otras. Mitigado sacando el tema del caché. El widget embebido **nunca** ve un
  tema nuevo (la personalización viaja congelada en el snippet) — deliberado, pero conviene
  que el panel lo diga.

---

# 🟡 MEJORAS

- `lib/auth-server-action.test.ts` verifica que el fichero **contiene ciertos comentarios**
  (`assert.ok(fuente.includes('I-4 (RESUELTO)'))`), no comportamiento. Está en verde
  afirmando que la cookie funciona, cuando la cookie no existe.
- `EJES_BOOLEANOS` en `lib/theme-preview-vars.test.ts:14` sigue escrito a mano; derivarlo de
  `CAMPOS_BARRA_PORTAL` lo cierra igual que #1413 hizo con los enums.
- `ThemePreview` no envía `varsKitMap`, a diferencia de los otros dos emisores de preview.
  Hoy inocuo, mañana el hueco por el que se cuela el siguiente `barraFlotante`.
- La referencia profesional no comprueba que el referente no sea la propia instructora.
- `instagram`/`linkedin`/`web` de Network se guardan y **no se renderizan en ningún sitio**:
  dato muerto hoy, trampa el día que alguien los pinte sin `hrefCanal`.
- `Vitoria-Gasteiz` → slug `vitoria-gasteiz` → vuelve como `Vitoria Gasteiz` y el `ilike` no
  casa con el guion de la BD: la página existe y sale vacía. Preexistente.
- **Tu `node_modules` local lleva 4 días desincronizado** (es del 22-ago): `leaflet` y
  `react-leaflet` están en `package.json` y no instalados, así que un `tsc` o un `next
  build` en tu máquina falla por eso. Un `npm install` lo arregla.

---

# MAPA DE DEUDA TÉCNICA

| Área | Estado | Riesgo | Prioridad |
|---|---|---|---|
| Arquitectura | Sólida en lo nuclear; el scaffold de Server Actions es una capa muerta encima | Medio | Media |
| Frontend | Widget Modo A es un god-file de 3.768 líneas con 49 `useState` | Alto | Alta |
| Backend | Rutas de pago disciplinadas; las de equipo perdieron el manejo de errores | Medio | Media |
| Base de datos | Esquema coherente, RPCs atómicas donde importa (reserva, bono) | Bajo | Baja |
| **RLS** | Cuarta repetición del mismo patrón; los 4 huecos de esta pasada, cerrados | **Alto** | **Alta** |
| Auth | Aislamiento entre estudios verificado y correcto | Bajo | Baja |
| **Pagos** | Idempotencia y ownership bien resueltos; **la recuperación no existe** | **Alto** | **Alta** |
| Reservas | Atómicas en Postgres, sin overbooking ni doble consumo | Bajo | Baja |
| Calendario | Zonas horarias correctas (UTC + huso del estudio en el tope semanal) | Bajo | Baja |
| Automatizaciones | No auditadas a fondo esta pasada | No verificado | Media |
| UX | Errores que desaparecen en silencio en varios caminos del widget | Medio | Alta |
| Rendimiento | `rendimiento-datos.ts` sin límite; O(n²) del calendario documentado | Medio | Baja |
| Seguridad | Sin secretos en cliente; el vector es RLS, no exfiltración | Medio | Alta |
| Tests | 3.379, pero los mocks no modelan índices ni FK — de ahí C-3 | Medio | Alta |
| Infraestructura | Despliegue fluido, 41 commits en 36 h | Bajo | Baja |

---

# PLAN DE LIMPIEZA

**Fase 1 — Críticos.** Fusionar `audit/2026-08-26`. Después, **P-1**: decidir si se
reescribe el conciliador de reembolsos o se borra el cron. Mientras se decide, subir a
`error` la alerta de `webhooks-sin-completar`.

**Fase 2 — Estabilización.** P-5 (manejo de errores de las rutas de equipo, ~40 líneas),
P-2 (reembolso de POS), el ownership de `liquidaciones` GET, y la tabla `cargos_stripe`
como base de reconciliación.

**Fase 3 — Refactorización.** El `type VistaWidget` único del widget y la unificación de la
capa de datos de Modo A y Modo B. Es el cambio que corta la serie de cinco fixes. Y la
decisión sobre los 255 módulos huérfanos de `lib/actions/**`.

**Fase 4 — Calidad.** Tests de pagos que corran contra el esquema real (un `execute_sql` +
`ROLLBACK` basta, y el repo ya sabe hacerlo). Sustituir el test de `auth-server-action` que
verifica comentarios. Derivar `EJES_BOOLEANOS` del catálogo.

**Fase 5 — Mejoras.** El resto de 🟡.

---

# REPARACIONES REALIZADAS

| ID | Problema | Archivo(s) | Verificación | Estado |
|---|---|---|---|---|
| C-1 | Sello verificado auto-otorgable por INSERT | migración 20260826090000 | INSERT real como `authenticated` + rollback, con control positivo `service_role` | ✅ |
| C-2 | Referencia auto-confirmable + token legible | migración 20260826090000 | `has_column_privilege` con control positivo + prueba funcional | ✅ |
| C-3 | Cobrado sin entregar (I-8) | `entregar-plan-comprado.ts` | Test nuevo; **falla al revertir el fix** | ✅ |
| C-4 | Informe de rendimiento inventado | `equipoRendimientoAction.ts` | Contrato cotejado campo a campo con `api-client` y la pantalla | ✅ |
| C-5 | `barraFlotante` no llega al portal | `supabase-data-admin.ts` | Guardián nuevo; **falla al quitar el campo** | ✅ |
| C-6 | Modo B destruye confirmación y error (5 caminos) | `usar-datos-widget.ts`, `main.tsx` | Lectura del ciclo de montaje; **no verificado en navegador** | ✅ |
| I-1 | `slug`/`lat`/`lng` escribibles | migración 20260826090000 | Control positivo | ✅ |
| I-2 | `red_verificaciones_experiencia` (gemelo) | migración (§5) | Prueba funcional con rollback | ✅ |
| I-3 | Recibo de A cobrado a tarjeta de B | `stripe-cobros.ts` | 6 llamantes revisados uno a uno | ✅ |
| I-4 | Formulario de acceso pegado | `main.tsx` | Camino real confirmado en `usar-sesion-widget.ts` | ✅ |
| I-5 | Reloj congelado Modo B | `usar-datos-widget.ts` | Filtro `inicio > nowMs` rastreado hasta `construir-slots` | ✅ |
| I-6 | Comodines ILIKE + ciudad sin validar | 7 ficheros, helper unificado | Semántica del escape verificada **en la BD real**; tests | ✅ |
| I-7 | Texto de salud engañoso | `comprobaciones.ts` | Revisión de qué cubre cada conciliador | ✅ |
| I-8 | `href` sin sanear | `estudios/[slug]/page.tsx` | Helper existente, patrón idéntico a los otros 2 consumidores | ✅ |

**Hallazgos de la revisión independiente del propio parche (6, todos corregidos antes de
entregar):** el regex de ciudad 404eaba URLs que el propio sitemap publica
(`L'Hospitalet`, `Nucia, la`, `Donostia/San Sebastián`); dos gemelos sin
`{silencioso:true}`, uno de ellos el de **compra completada**; `ilike` sin escapar y
`maybeSingle()` en la rama nueva de I-8 (con `_` en el email volvía a «cobrado sin
entregar»); un comentario que se contradecía con el código; el gemelo
`red_verificaciones_experiencia`; y la salvedad de los dumps en los triggers.

---

# RESUMEN FINAL

**Problemas encontrados:** 🔴 6 · 🟠 17 · 🟡 12

**Solucionados y verificados:** 14 · **Pendientes:** 21 · **Parciales:** 0

**Archivos modificados:** 22 (+692 / −40). Rama `audit/2026-08-26` sobre `69edd523`.
Parche también en `audit-26ago.patch`.

**Migraciones aplicadas a producción:** 2, ambas verificadas con control positivo y con
prueba funcional dentro de transacción con rollback.

| Check | Resultado |
|---|---|
| Tests | **PASS** — 3.379/3.379 (3.359 antes; +20 nuevos, 0 fallos) |
| Tests nuevos | 9 (2 de pagos, 4 de escapado/ciudad, 3 de guardián de tema) |
| Typecheck | **PASS** — sin errores nuevos. Quedan 2 preexistentes de entorno: `leaflet`/`react-leaflet` declarados en `package.json` y no instalados en tu `node_modules` (del 22-ago) |
| Lint | **PASS** — `eslint .` sobre el proyecto entero, 0 avisos |
| Build del widget | **NO VERIFICADO** — el binario de esbuild de tu `node_modules` es de macOS y no corre en el sandbox. Typecheck y lint sí cubren el fichero y no se han añadido imports nuevos |
| `next build` | **NO VERIFICADO** — bloqueado por las dependencias no instaladas |
| E2E | **NO EJECUTADO** — Playwright necesita navegadores y un servidor levantado |

### Estado real post-auditoría

Tentare llegó a esta pasada mejor de lo que ha estado nunca en velocidad de entrega y
peor de lo que parecía en dos sitios concretos, los dos por el mismo motivo: **un fix se
dio por cerrado sin comprobar el escalón siguiente**. El trigger de confianza existía pero
no cubría el INSERT. La red de recuperación de reembolsos existía pero no recuperaba. I-8
arreglaba la suplantación pero rompía la entrega. Los tres pasaron todos los checks.

Lo que sí puedo afirmar con evidencia: los cuatro huecos de RLS de esta pasada están
cerrados y **probados ejecutándolos contra producción**, no por inspección; el aislamiento
entre estudios aguanta en las rutas que he revisado; las reservas y el consumo de bonos son
atómicos en Postgres y no encontré ni overbooking ni doble consumo; ningún endpoint de
cobro toma el importe del cliente.

Lo que **no** puedo afirmar: que no haya más agujeros de la misma familia en las ~15 tablas
`red_*` que no he recorrido una a una; que las automatizaciones y el CRM funcionen (no los
he auditado esta vez); que el build de producción pase; que los E2E pasen.

**Antes de ponerlo delante de cientos de estudios**, el que me quitaría el sueño no es
ninguno de los que he arreglado: es **P-1**. Hoy, si Stripe entrega un reembolso y el
`after()` muere, el dinero sale de la cuenta del estudio y el recibo sigue diciendo
COBRADO — y el sistema cree que un cron lo está vigilando. Un fallo silencioso que se cree
cubierto es peor que uno descubierto.
