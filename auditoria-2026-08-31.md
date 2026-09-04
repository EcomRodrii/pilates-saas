# Auditoría Tentare — 31 ago 2026 (19ª pasada)

Base auditada: `origin/main` @ `c8b10195` (desplegado hoy). Producción Supabase
`dwqvdycjcffqwfkzapvi` (lectura + pruebas con rollback). Sentry
`tentare-software`, 14 días. Rama de arreglos: **`audit/2026-08-31`** (ya
empujada al repo local; falta subirla a GitHub).

---

## ESTADO REAL DE TENTARE

| | |
|---|---|
| **Estado general** | Sólido en el núcleo. Los fallos de hoy están en el **perímetro**, no en el corazón. |
| **Riesgo técnico** | **Bajo-medio.** Ninguna familia de fallos estructurales reabierta. |
| **Riesgo de seguridad** | **Bajo.** 0 fugas cross-tenant demostradas. 1 🟠 de fuerza bruta de OTP abierto. |
| **Riesgo de datos** | **Bajo.** 1 mina de RGPD cerrada hoy (datos de salud). |
| **Riesgo de negocio** | **Medio.** Un cobro real de Stripe pendiente contra un estudio ya suspendido. |
| **Deuda técnica** | Estable. 4 módulos congelados (~2.462 líneas), 39 lecturas que convierten errores en estados vacíos falsos. |
| **Áreas más problemáticas** | Suscripción del SaaS (billing propio), theme builder tras la retirada del kit de temas, y consentimiento en marketing. |

### Lo que cambió respecto a las pasadas anteriores

**El patrón de fallo ha cambiado, y a mejor.** Durante 10 días seguidos el
hallazgo dominante fue *"se arregló un endpoint y no su gemelo"*. Hoy los
gemelos que quedan son de segunda línea (comentarios que mienten, UI que tira
un dato nuevo), no fugas. Y por primera vez:

- **La escritura optimista (familia §1) sigue cerrada.** Revisadas las ~25
  acciones optimistas del repo: todas revierten en el `catch`. Cero `{ok:true}`
  falsos nuevos.
- **Las 15 tareas de `cron.job` coinciden EXACTAMENTE con las 7 migraciones que
  las declaran.** Cero huérfanos, cero migraciones sin aplicar. 0 fallos en
  ~17.700 ejecuciones desde el 11-ago, y `net._http_response` devuelve 244
  respuestas, todas 200: los crons no solo se disparan, la app responde.
- **Las 25 funciones de Inngest definidas están las 25 registradas.**
- **La BD y el repo están alineados en reservas.** Leí el `prosrc` real en
  producción de las 20 funciones del dominio: la migración del 29-ago está
  aplicada y su cuerpo es idéntico al del fichero, con `reservas.` cualificado.
  No hay ningún `42702` latente.
- **El despliegue ya no atasca.** Los fixes del 26 y del 29-ago están en `main`.

---

# 🔴 CRÍTICOS

### [R-1] El cron de mínimo de asistentes cancelaba las reservas ANTES de avisar → el aviso iba a NADIE ✅ SOLUCIONADO

**Área:** Reservas / Notificaciones
**Archivo:** `lib/db/supabase-data-admin.ts`, `cancelarSesionPorMinimoNoAlcanzado`, ~L2382-2401

**Evidencia:**
```ts
await admin.from('reservas').update({ estado: 'CANCELADA', ... })   // primero
...
await emitirClaseCancelada(admin, { ... });                          // después
```
`clase.cancelada` declara audiencia `socias-y-espera-e-instructora-de-la-sesion`
(`lib/notifications/catalog.ts:277`), que resuelve con
`sociasDeSesion(..., ['CONFIRMADA','LISTA_ESPERA','PENDIENTE_APROBACION'])`
(`recipients.ts:273-286`). Al cancelarlas primero, ese filtro devolvía **0 filas**.

**Verificado en producción, no deducido.** `pg_cron` jobid 3
`minimo-asistentes-cancelar` `*/15`, activo; 2 `tipos_clase` con
`minimo_asistentes_por_clase > 0`; ya disparó una vez sobre `ses-mt0gj5ug-1-j09j3`
(20-ago, con instructora asignada). Consulta a `notification`:
`event_type='clase.cancelada'` con ese `resource_id` → **0 filas**.

**Impacto:** la socia CONFIRMADA solo recibía el email transaccional (que usa el
snapshot previo). Quien estuviera en `LISTA_ESPERA` o `PENDIENTE_APROBACION` se
quedaba **sin email y sin push**: su reserva desaparecía en silencio. La
instructora tampoco recibía nada.

**Es el invariante que el propio repo documenta en cuatro sitios** — y este era
el único camino que lo violaba. Los gemelos lo hacen bien
(`app/api/sustituciones/route.ts:349`, `calendario/page.tsx:1251`,
`studio-context.tsx:2683`, `deleteSesion`).

**Solución aplicada:** el `emitirClaseCancelada` sube por encima del UPDATE **y
por encima del corte `if (!afectadas?.length) return`** — la instructora también
está en la audiencia y también se queda sin clase aunque no se apuntara nadie.

---

### [N-1] Aviso comercial por WhatsApp sin comprobar consentimiento ✅ SOLUCIONADO

**Área:** Marketing / Cumplimiento
**Archivo:** `app/api/marketing/hueco/avisar/route.ts:113-117`

**Evidencia:** la palabra `consentimiento` no aparecía en el fichero. Era la
**única de las seis vías de mensajería comercial** que se saltaba
`lib/marketing/consentimiento.ts`. Las otras cinco sí lo aplican
(`lib/inngest/campanas.ts:85`, `marketing-automation-engine.ts:122`,
`automation-engine.ts:202/226/491`, Mailchimp `:59`, Klaviyo `:58`).

**Impacto:** mensaje comercial no solicitado ("Se ha quedado un hueco… resérvalo
aquí") a hasta 30 socias, a un clic desde el panel principal
(`dashboard/page.tsx:751`). No estaba congelado ni tras feature flag. Infringe
art. 21 LSSI y art. 7 RGPD. El único filtro era `socio_excepciones/SIN_AVISO_HUECO`,
una exclusión que decide la dueña, **no un consentimiento que da la socia**.

**Atenuante:** `select * from avisos_hueco` → 0 filas. Nunca se ejecutó en
producción. Exposición armada, no brecha consumada.

**Solución aplicada:** filtro `filtrarPorConsentimientoMarketing` con select
propio de `consentimiento_marketing_texto`, más `sinConsentimiento` en la
respuesta **y en la UI** — sin eso, "Aviso enviado a 0 socias" no tenía
explicación (en producción solo 1 de 40 socias tiene consentimiento).

---

### [F-1] El editor de apariencia deja entrar a MANAGER y luego le tira todo su trabajo, en silencio y en bucle ✅ SOLUCIONADO (la mitad honesta)

**Área:** Theme builder / UX de error
**Archivos:** `components/theme/theme-editor-fullscreen.tsx:309`,
`components/theme/use-autoguardado.ts:216-229`, `lib/actions/theme.ts:26`

La misma pantalla tiene **dos permisos para sus dos mitades**:

| Mitad | Quién puede |
|---|---|
| Bloques del portal (`/api/portal-bloques`) | `PROPIETARIO \|\| MANAGER` |
| Ajustes del tema (`guardarThemeAction`) | **solo `PROPIETARIO`** |

Y la puerta de la UI usaba el permiso **más flojo**. El autoguardado trataba
como terminal solo el 401, así que **un 403 se reintentaba para siempre**
(backoff hasta 60 s, sin rendirse nunca) bajo el texto
`'No se ha podido guardar — se sigue intentando'`. Agravantes: `avisarAlSalir`
incluía ese estado, así que el `beforeunload` quedaba pegado; y `peorEstado`
hacía que el error del tema **tapase el "Guardado" de los bloques**.

**Producción tiene 1 MANAGER hoy.** Variante latente idéntica con el plan `BASE`
(entitlement `marca`), hoy sin estudios en ese plan.

**Solución aplicada:** nuevo `ErrorSinPermiso` en `lib/api-client.ts` mapeado en
las **cinco** funciones de la familia (las tres del brief más `publicarBloquesApi`
y `guardarLayoutApi`, que el revisor independiente encontró sin mapear), nuevo
estado terminal `{tipo:'permiso', mensaje}` que enseña el motivo real del
servidor, y corte del reintento **y de la reprogramación por tecleo** en los dos
hooks. 3 tests guardianes nuevos.

**⏳ Queda pendiente** la decisión de producto: ¿debería una MANAGER poder editar
la marca (alinear `guardarThemeAction` con `puedeGestionarPortalHome`), o no
debería poder entrar al editor (alinear la puerta a `PROPIETARIO`)? Hoy la
pantalla ya no miente, pero la incoherencia sigue ahí. **No la toco: es tuya.**

---

# 🟠 IMPORTANTES

### [M-1] Suspender un estudio no cancela su suscripción de Stripe — hay un cobro real el 21-sep ⏳ PENDIENTE

`app/api/interno/estudios/[id]/acciones/route.ts`, rama `suspender` (~L67-94):
escribe tres columnas y nada más. No hay ninguna llamada a
`stripe.subscriptions.cancel` asociada (grep sobre `suspendido_en`: los 25 usos
restantes son filtros `.is(..., null)` en crons).

**Evidencia en producción:**

| studio | suspendido_en | motivo | subscription_id | status | próximo cobro |
|---|---|---|---|---|---|
| `studio-1rx5a5z1dg8y3h` | 22-ago | "Impago de 8 meses…" | `sub_1U6xxYFJXbvx0C345SsIv1ai` | `active` | **21-sep-2026** |

Se suspendió a un cliente por impago y su suscripción sigue viva: **Stripe le
volverá a cobrar un producto al que no puede entrar** (`evaluarSuspension` corta
el acceso sin mirar `billingEnforced`). El desenlace natural es una disputa
contra Tentare.

**Acción inmediata, manual y tuya:** cancelar esa suscripción en Stripe antes
del 21-sep. **No la ejecuto yo**: mover dinero o cancelar cobros de un cliente
real no es una acción que deba tomar sin ti.

### [M-2] El alta de plan CADENA cancela la suscripción anterior ANTES de cobrar la nueva ⏳ PENDIENTE

`app/api/billing/checkout/route.ts:121-127`. Tres problemas en cinco líneas:
(1) `stripe.subscriptions.cancel` es inmediato y va **antes** del checkout — si
la propietaria cierra la pestaña se queda sin ninguna suscripción y con el
periodo pagado perdido; (2) `.catch(() => {})` se traga un 5xx de Stripe y crea
**dos suscripciones cobrando en paralelo**, justo lo que dice evitar; (3) la
rama CADENA hace `return` antes del guardia anti-doble-suscripción de la L172.
**Forma correcta:** cancelar en el webhook `customer.subscription.created` de la
nueva, o `cancel_at_period_end` + reconciliación. **No lo toco: es un cambio de
comportamiento de negocio en el camino del dinero.**

### [M-3] El conciliador de reembolsos no puede recuperar una disputa PERDIDA ⏳ PENDIENTE

`lib/inngest/conciliar-reembolsos.ts:214` filtra `stripe.disputes.list({created})`
con `VENTANA_HORAS = 24`. `dispute.created` es la fecha de **apertura**, no la
del cierre, y una disputa se resuelve entre 30 y 75 días después. Por tanto
**ninguna transición `charge.dispute.closed` con `status='lost'` entrará jamás en
la ventana.** Es el mismo bug que la cabecera del propio fichero presume de haber
arreglado para los refunds. Si el webhook no la entrega (y responde 200 antes de
procesar, así que Stripe no reintenta), el recibo queda **COBRADO con el dinero
ya revertido por el banco**. La API de disputas no tiene filtro por fecha de
actualización: hay que ampliar la ventana o barrer las disputas abiertas
conocidas. **No lo toco sin decidir cuál de las dos.**

### [M-4] Nada impedía volver a publicar la clave SECRETA de Stripe en el bundle público ⚠️ PARCIALMENTE SOLUCIONADO

El incidente ocurrió (Sentry `JAVASCRIPT-NEXTJS-1P`, 19-ago). **Está cerrado por
rotación, no por código** — los 266 errores `Expired API Key provided: sk_live_…XUaBvx`
confirman que la clave vieja está muerta. Lo que seguía abierto es que
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` se inyectaba en tres bundles de cliente
—incluido `public/widget.js`, servido a webs de terceros— **sin comprobar que
empiece por `pk_`**, mientras el mismo script sí valida las otras variables.

**Solución aplicada:** guardia de forma en `scripts/build-widget-bundle.mjs`.
Como `"build": "npm run build:widget && next build"`, el `process.exit(1)`
también corta el build de Next, donde se inlinea en `/reservar/[slug]` y
`/portal/[slug]/compras`. **🔎 No verificado:** sin salida de red no pude
descargar el `widget.js` desplegado hoy para confirmar qué clave lleva.

### [A-1] `/api/auth/otp/reenviado` anula, sin autenticar, el cerrojo anti-fuerza-bruta del OTP de cualquier email ⏳ PENDIENTE

`app/api/auth/otp/reenviado/route.ts:21-34` borra `rate_limits` para un email
arbitrario. Sin JWT, sin captcha, sin prueba de que el reenvío ocurriera. Su
comentario dice *«se llama justo después de un reenvío que YA tuvo éxito»* —
pero eso es una convención del cliente, no una comprobación de servidor.

`app/api/auth/otp/verificar/route.ts:7-18` **documenta que ese cerrojo es la
única defensa real**, porque gotrue solo limita por IP. Con este endpoint, por
IP se pasa de 6 intentos a 30, y **con rotación de IP —el modelo de amenaza que
el propio comentario nombra— el cerrojo desaparece.**

**Por qué no lo arreglo yo:** el arreglo correcto es mover el reset al camino de
servidor que ya hace el reenvío (donde el captcha ya se validó) o exigir el
mismo captcha aquí. Ambas cosas tocan el flujo de alta y no son reparables con
rate-limit. Necesita tu criterio sobre dónde vive el captcha.

### [A-2] Los datos de salud se leían sin comprobar el consentimiento ✅ SOLUCIONADO

`respuestas_cuestionario_salud` tenía `tiene_consentimiento_salud(socio_id)` en
el INSERT pero **no en SELECT/UPDATE/DELETE**. Su gemela `condiciones_salud` lo
tiene en las cuatro. `lib/types.ts:479` documenta la intención; la
implementación no la cumplía.

**Impacto hoy: nulo** (0 filas en producción). Era una mina: en cuanto la pieza
se use, respuestas de cuestionario de salud (categoría especial RGPD) serían
legibles por PROPIETARIO/INSTRUCTOR de socias que revocaron o nunca dieron
consentimiento. De referencia, `condiciones_salud` tiene 4 filas y **2 sin
consentimiento** — el caso ocurre en datos reales.

**Migración aplicada y verificada en producción con control positivo**
(INSERT temporal + rollback por `raise exception`, como INSTRUCTOR del estudio):
`con consentimiento = 1 · sin consentimiento = 0 · otro estudio = 0`.
Sin control positivo esto no vale, y es exactamente el error del 14-ago.

### [B-1] Candidaturas de una vacante visibles para RECEPCION ⚠️ PARCIALMENTE SOLUCIONADO

`app/api/network/vacantes/[id]/candidaturas/route.ts` solo exigía
`verificarSesionStaff`. Sus cuatro hermanas de la familia sí exigen
`puedeGestionarEquipo`, y la cabecera de `vacantes/route.ts:15` afirma que la
familia entera lo tiene. **Gate añadido.**

**Lo que queda:** `GET /api/network/vacantes` (el listado) **sigue sin gate**, y
`/network` no está en `BLOQUEADO_RECEPCION`, así que RECEPCION sigue viendo la
lista de vacantes con su contador de candidaturas. Además, con el gate nuevo esa
misma RECEPCION recibe un 403 que `fetchCandidaturasVacanteNetwork` convierte en
`[]` **sin mensaje**. Cerrar el listado es una decisión de producto (¿debe
recepción ver vacantes?), no un arreglo evidente. Lo dejé documentado en el
propio fichero para que el comentario no vuelva a mentir.

### [Q-1] Sin mecanismo de baja en el marketing por SMS/WhatsApp ⏳ PENDIENTE

`unsubscribeUrl` solo se inyecta en `AutomatizacionEmail`. Las ramas de teléfono
(`lib/inngest/campanas.ts:117`, `automatizaciones.ts:309`) construyen el cuerpo
en crudo. `/api/marketing/baja` solo es alcanzable desde un correo. El art. 21.2
LSSI exige un medio sencillo y gratuito de oposición **en cada comunicación**.
Latente hoy (0 automatizaciones activas), se arma al pulsar "Activar".
**No lo toco:** implementar `BAJA` por SMS exige tocar el webhook de Twilio
entrante y decidir el texto legal.

### [Q-2] Sin reintento en Twilio, y la campaña se marca "ENVIADA" igualmente ⏳ PENDIENTE

`lib/twilio.ts:66-76` no inspecciona el status: un 429 de throttling y un número
inválido permanente se tratan igual. El camino de email sí distingue por lista
blanca de códigos transitorios (`lib/emails/resend-reintentos.ts:17-25`). Y en
`lib/inngest/campanas.ts` el paso `marcar-enviada` estampa `ENVIADA` aunque los
envíos hayan fallado, sin log por destinataria.

### [T-1] Cinco 🟠 de reservas ⏳ PENDIENTE (documentados, no tocados)

1. **"Asignar clienta a este reformer" es un no-op silencioso.** `spot-map.tsx:154-169`
   ofrece a todas las socias *excepto* las que tienen plaza; `studio-context.tsx:3316`
   exige que tengan reserva. Conjuntos casi disjuntos → error para casi cualquier
   selección, y el error se descarta en tres capas (`onAsignarSpot?: () => void`).
2. **`asignarSpot` no valida ni sala ni `activo`**, mientras sus dos gemelos sí
   (`asignarSpotReserva` y la RPC `reservar_plaza`). Hoy hay 0 spots inactivos.
3. **Un `spot_id` en una fila `LISTA_ESPERA` puede reventar la cancelación
   entera después** (el índice único es parcial; `promocionar_siguiente_espera`
   no toca `spot_id` → 23505 que aborta la transacción). Hoy 0 filas así.
4. **`ofrecerPlazaLibre` comprueba el aforo con read-then-write sin candado**
   (`supabase-data-admin.ts:2139-2201`). Es la única sobreventa posible que
   encontré; el resto del dominio es atómico de verdad. Hoy 0 sesiones con
   `confirmadas > aforo_efectivo`.
5. **`crear_reserva_atomica` sigue viva y ejecutable por `authenticated`**, con
   `aforo_maximo` crudo y sin ninguna regla de 2026. No concede privilegio nuevo
   (es INVOKER y RLS la acota a staff del propio estudio), pero es una segunda
   puerta al aforo. Recomendación: `drop function`.

**Por qué no los toco:** los 1-3 son la misma raíz (una función que acepta
estados que no debería) y arreglarlos bien pide decidir qué debe hacer el panel
cuando la recepcionista elige a alguien sin reserva — decisión de producto. El 4
pide un candado y el 5 un borrado; ambos superan el listón de "pequeño y
reversible" en el camino de las reservas.

### [C-1] El contenido del portal sigue preso del caché de 60 s y **no se puede invalidar** ⏳ PENDIENTE

El tema y el layout se sacaron de `conCacheCatalogo` precisamente por esto, pero
`contenido_portal` (`:517`), `contenido_portal_banners` (`:523`) y
`novedades_estudio` (`:530`) se quedaron dentro. Y no es que falte la llamada a
`invalidarCatalogoPublico`: **no se puede hacer** — esas tres se escriben desde
el NAVEGADOR (`studio-context.tsx:1697-1724` → cliente Supabase con RLS), así que
ningún proceso de servidor se entera. Cambiar un banner y verlo en el portal
tarda hasta 60 s por instancia caliente. **Arreglarlo pide mover esas escrituras
a servidor: cambio de arquitectura, no un parche.**

### [C-2] Callejones sin salida del theme builder tras retirar el kit de temas (27-ago) ⏳ PENDIENTE

- El editor a pantalla completa **no tiene salida**: `RUTA_BIBLIOTECA =
  '/configuracion/apariencia'` y esa ruta hace `redirect()` **al propio editor**.
  Y `dashboard-shell.tsx:201` quita Sidebar y Topbar en esa ruta. Único escape:
  el botón "atrás" del navegador. Mismo fallo tres veces más en `editor-zip.tsx`,
  incluidos los dos estados de error.
- **La importación de temas ZIP quedó sin punto de entrada.** `ImportarTemaZip`
  no se monta en ningún sitio (grep: cero). Queda huérfana la tabla
  `theme_imports`, la subida a R2, el origen `imports.tentare.app` y la ruta
  `editor-zip/[id]`. **Producción tiene 1 fila en `theme_imports`**: se llegó a
  usar y ahora ni su dueña puede volver a ella.

### [C-3] 39 lecturas convierten cualquier fallo en `[]` → estados vacíos que afirman cosas falsas ⏳ PENDIENTE

Patrón `if (!res.ok) return []` en `lib/api-client.ts`; 25 de los 39 casos son de
Network. Consumidor verificado: un 500 en `/api/network/buscar` se pinta como
**«Todavía no hay profesionales publicadas en tu zona»**. Es justo el fallo
contra el que `dashboard-shell.tsx:94` se protege, pero solo en la carga del
panel. Arreglarlo bien es un cambio de contrato en 39 sitios.

---

# 🟡 MEJORAS (resumen)

- **12 de 18 recibos COBRADO con TARJETA no tienen `stripe_payment_intent_id`**
  (anteriores al fix). `/api/reembolsos` responde `SIN_RASTRO_STRIPE`: **no se
  pueden devolver desde el panel**, hay que hacerlo en Stripe a mano.
- **Un reembolso no cancela la plaza pagada** (`calcularReversion` solo toca
  `suscripciones`; la reserva `res-web-…` sigue CONFIRMADA).
- **El conciliador de reembolsos no cubre las ventas POS** (el webhook sí). Bajo
  hoy: `/pos` está congelada, pero `/api/terminal/*` y `/api/stripe/pos-bizum`
  siguen vivos y cobrando.
- **GMV duplicado en Bizum presencial** (`via:'checkout'` + `via:'bizum'` cuentan
  el mismo cobro). Solo analítica.
- **`/api/stripe/checkout` no valida `socioEmail`** mientras su gemelo
  `checkout-embebido` sí. Daño tapado aguas abajo, pero la asimetría está ahí.
- **El aviso de Sentry "la cuenta Connect no corresponde al estudio" es un FALSO
  POSITIVO**, diagnosticado: Stripe entrega `checkout.session.completed` a todos
  los destinos, así que el checkout del SaaS llega también al webhook de Connect
  y salta un `captureMessage` a nivel `error` en **cada alta de estudio**. Las 2
  únicas filas atascadas de 38 en `webhook_events` son este caso. Sin pérdida de
  dinero. Fix: quitar ese evento del destino de Connect en el dashboard de Stripe.
- **`error.message` de Postgres al cliente** en 3 rutas de `/api/interno`
  (solo alcanzables por admins de plataforma).
- **~50 tablas con GRANT a `anon`** (incluidas `socios`, `recibos`, `facturas`,
  `reservas`). **Hoy son letra muerta**: 0 policies para `anon` sobre ellas,
  comprobado empíricamente (anon lee 0 filas; solo 3 policies `anon` en todo el
  esquema, las tres de contenido público). Pero la única cosa entre esas tablas
  e Internet es *la ausencia* de una policy. Recomiendo `REVOKE ALL … FROM anon`
  salvo las tres públicas — y comprobarlo después con `has_table_privilege`.
- **El contador de no leídas se calcula sobre una página truncada de 60**
  (`app/api/notifications/route.ts:99`). Máximo hoy: 53 filas por usuario.
- **`retry()` de notificaciones no tiene ningún llamador** pese a que un
  comentario afirma que "ya existe"; y si se cableara tal cual, no comprueba
  propiedad ni estudio.
- **Faltan plantillas `#MANAGER`** para `reserva.creada` y
  `automatizacion.disparada` (se descartan en silencio). El test de cobertura
  recorre ~6 eventos elegidos a mano en vez de `Object.entries(REGLAS)`.
- **Sistema de diseño: la fuente única existe y casi nadie la usa.** `<button>`
  crudo: **1.315** · `<Button>` de `components/ui`: **74**. Modales con
  `fixed inset-0` fuera de `components/ui`: **23 ficheros** frente a 39 que sí
  usan `ui/dialog`. Más una tercera familia solo para el widget
  (`lib/reservar/botones.ts`).
- **Restos del kit de temas:** `THEME_DEFINITIONS` con una sola entrada y sin
  importadores; `elegirTema` exportada y sin llamantes; `themeIdPublicado` viaja
  del servidor a props y **nadie lo lee**; y hay borradores en producción
  apuntando a temas borrados (`sereno`, `tentada`) que `themeIdSchema = z.string()`
  no valida.
- **Doble envío al editar una instructora** (`equipo/page.tsx:357`: la rama
  `editId` no toca `guardando`).
- **Publicación parcial posible** en `publicarTodo`: publica el tema y después
  los bloques, sin transacción ni rollback, y el `catch` genérico no dice cuál falló.

---

# Hallazgos REFUTADOS (para que no se re-auditen)

- **Los 6 `permission denied ... TO anon` de Sentry NO son una fuga.** Son 14
  eventos con el mismo timestamp (30-ago 01:24:06-07Z), una sola ráfaga de un
  segundo, un navegador, `users: 0`, repartida entre dos releases. El error **es
  la cerradura funcionando**: esas tablas no tienen GRANT para `anon`. Prueba
  positiva como `anon` con rollback: `socios=0 recibos=0 notas_internas=0`.
- **`automation_logs` sin escrituras desde el 25-jul NO es un motor muerto.** Las
  14 `automation_rules` y las 5 `automatizaciones` están **todas `activa=false`**.
  El dispatcher corre a diario y termina sin candidatos, que es lo correcto.
- **Los 266 `Expired API Key` NO dejaron trabajo a medias.** Los provocó
  `conciliar-cobros.ts:71` en una ventana de 11 h del 22-ago (clave rotada,
  despliegue con la vieja). Cayeron en el `try/catch` por estudio;
  `conciliarCobrosVigilancia` (ventana de **72 h**) corrió el 23-ago con la clave
  nueva y **cubrió todo el hueco**; Sentry no tiene ni un evento
  `tipo: 'fuera-de-ventana'`. La red de seguridad funcionó.
- **`notification_delivery` con RLS y CERO policies no rompe nada.** El `drop
  policy` es intencional (una instructora podía leer la tabla entera) y los 5
  puntos de lectura usan service-role.
- **`dbDeleteCampana` sin `.eq('studio_id')` no es fuga**: la policy
  `owner_campanas` es `ALL` con `current_rol()='PROPIETARIO' AND studio_id =
  current_studio_id()`.
- **El trigger `red_perfiles_proteger_verificacion` es decorativo** (`authenticated`
  no tiene GRANT de INSERT/UPDATE sobre esa tabla), pero la cerradura real —el
  whitelist de columnas de `app/api/network/perfil/route.ts:66-127`— sí es correcta.
- **Preview y producción del portal usan el MISMO renderizador.** No existe el 🟠
  estructural de los dos caminos.
- **Los 4 casos de "spot de otra sala"** en producción son datos de demo de mayo.
- **Las 7 reservas activas sobre clases canceladas** son residuo de julio; el
  código de hoy ya no las genera.

---

# MAPA DE DEUDA TÉCNICA

| Área | Estado | Riesgo | Prioridad |
|---|---|---|---|
| Arquitectura | God-files documentados y congelados por decisión | Bajo | — |
| Frontend | 39 lecturas que mienten al fallar; DS sin adoptar (1.315 vs 74) | Medio | 3 |
| Backend | Sólido; asimetrías entre gemelos residuales | Bajo | 4 |
| Base de datos | Alineada con el repo en reservas; 380 migraciones | Bajo | — |
| RLS | Aislamiento correcto y verificado; ~50 tablas con GRANT `anon` inútil | Bajo | 3 |
| Auth | Correcto salvo el reset de OTP (A-1) | **Medio** | **1** |
| Pagos | Núcleo correcto; perímetro (suspensión, cadena, disputas) flojo | **Medio** | **1** |
| Reservas | Atómicas de verdad; 5 🟠 latentes en el panel | Medio | 2 |
| Calendario | Zonas horarias y clases pasadas correctas | Bajo | — |
| Automatizaciones | Cadena completa y viva; 0 activas hoy | Bajo | 4 |
| UX | Callejones sin salida en el theme builder | Medio | 2 |
| Rendimiento | No auditado a fondo esta pasada | 🔎 | — |
| Seguridad | 0 fugas cross-tenant demostradas | Bajo | 2 |
| Tests | 3.354, y cubren lo peligroso | Bajo | — |
| Infraestructura | 15 crons alineados, 0 fallos en 17.700 ejecuciones | Bajo | — |

---

# PLAN DE LIMPIEZA

**FASE 1 — Esta semana (dinero y cuentas)**
1. Cancelar en Stripe `sub_1U6xxYFJXbvx0C345SsIv1ai` **antes del 21-sep** [M-1].
2. Decidir y arreglar el reset de OTP [A-1].
3. Subir `audit/2026-08-31` a GitHub y fusionarla.

**FASE 2 — Estabilización**
4. Cancelar la suscripción del estudio suspendido *desde el código* [M-1].
5. Reordenar el alta de CADENA [M-2] y ampliar la ventana de disputas [M-3].
6. Decidir el permiso del theme builder (MANAGER sí o no) [F-1].
7. Devolver la salida al editor de apariencia y recuperar la importación ZIP [C-2].

**FASE 3 — Refactorización**
8. Mover a servidor las escrituras de `contenido_portal` para poder invalidar [C-1].
9. Consolidar los 5 🟠 de spots en una sola función con estados válidos [T-1].
10. `REVOKE ALL FROM anon` en las ~50 tablas sin policy `anon`.

**FASE 4 — Calidad**
11. Baja en SMS/WhatsApp [Q-1] y reintentos de Twilio por código [Q-2].
12. Sustituir los 39 `return []` por un contrato que distinga vacío de fallo [C-3].

**FASE 5 — Mejoras**
13. Adopción incremental de `components/ui` (sin refactor masivo).
14. Limpiar los restos del kit de temas y `crear_reserva_atomica`.

---

# REPARACIONES REALIZADAS

| ID | Problema | Archivo(s) | Verificación | Estado |
|---|---|---|---|---|
| R-1 | Aviso de cancelación a nadie | `lib/db/supabase-data-admin.ts` | Cadena `publish→crearInApp→resolverDestinatarios` es **síncrona** (revisor la verificó); tests | ✅ |
| N-1 | WhatsApp comercial sin consentimiento | `app/api/marketing/hueco/avisar/route.ts` + `dashboard/page.tsx` | `filtrarPorConsentimientoMarketing` es la misma que usan las otras 5 vías; UI actualizada | ✅ |
| F-1 | Autoguardado que reintenta un 403 para siempre | `lib/api-client.ts`, `lib/theme/autoguardado.ts`, `use-autoguardado.ts` (×2), `theme-editor-fullscreen.tsx` | 3 tests guardianes nuevos; 5 funciones de la familia mapeadas | ✅ (mitad honesta) |
| A-2 | Datos de salud sin comprobar consentimiento | migración `20260831120000` | **Control positivo en prod con rollback**: 1 / 0 / 0 | ✅ |
| B-1 | Candidaturas visibles para RECEPCION | `app/api/network/vacantes/[id]/candidaturas/route.ts` | Gate igual al de sus 4 hermanas | ⚠️ |
| M-4 | Clave secreta de Stripe al bundle público | `scripts/build-widget-bundle.mjs` | Corta también `next build` por el encadenado del script | ⚠️ |
| — | Deep link roto de candidatura | `lib/notifications/emit.ts` + `candidaturas/route.ts` | Confirmado el daño en prod (`deep_link='/network/vacantes/'`) | ✅ |
| — | `publicarThemeApi` tiraba el motivo del 403 | `lib/api-client.ts` | Gemela de `guardarThemeBorrador` | ✅ |
| — | Instructora sin aviso si la clase no tenía reservas | `lib/db/supabase-data-admin.ts` | Emit por encima del corte | ✅ |

## PARCIALMENTE SOLUCIONADOS

| ID | Qué se arregló | Qué queda | Motivo |
|---|---|---|---|
| F-1 | La pantalla ya no miente ni reintenta en bucle | ¿Debe MANAGER editar la marca? | Decisión de producto |
| B-1 | El endpoint de candidaturas | `GET /api/network/vacantes` sin gate; 403 invisible para RECEPCION | `/network` no está en `BLOQUEADO_RECEPCION`: quitarle el listado es producto |
| M-4 | Guardia de forma en el build | Confirmar qué clave lleva el `widget.js` desplegado hoy | Sin salida de red |

## PENDIENTES

M-1, M-2, M-3, A-1, Q-1, Q-2, T-1 (×5), C-1, C-2, C-3 — cada uno con su motivo
explícito arriba. Ninguno se omite por comodidad: o piden una decisión de
producto, o son un cambio de arquitectura, o mueven dinero de un cliente real.

---

# LO QUE ENCONTRÓ EL REVISOR INDEPENDIENTE (6ª pasada seguida en que paga)

Con typecheck, lint y 3.354 tests **en verde**, la revisión independiente
encontró 4 de mis 9 fixes "a medias". Los cuatro se cerraron antes de entregar:

1. **N-1**: el filtro era correcto pero **la UI tiraba el dato nuevo** y seguía
   prometiendo un número exacto. Con 1 de 40 socias consentidas, la dueña habría
   visto "Aviso enviado a 0 socias" sin explicación. → Confirmación y toast
   reescritos.
2. **B-1**: mi comentario afirmaba "mismo gate que sus cuatro hermanas (vacantes
   GET/POST…)" y **era falso**: el GET del listado no lo tiene. → Comentario
   corregido y el hueco documentado en el propio fichero.
3. **F-1**: dos gemelas de la misma familia (`publicarBloquesApi`,
   `guardarLayoutApi`) seguían sin mapear el 403 — el fallo de gemelos **dentro
   del fix que dice combatirlo**, otra vez. → Mapeadas.
4. **F-1**: cortar el backoff no bastaba: **el efecto de debounce seguía
   programando un PUT por cada tecla**. → Guard por ref, solo para `permiso`
   (`sesion` se deja a propósito: ahí sí hay recuperación).

También cazó un 🟡 real en R-1 (la instructora se quedaba sin aviso si nadie se
había apuntado) y una nota importante sobre A-2: **la migración no queda
registrada en `supabase_migrations.schema_migrations`**. Es idempotente, así que
un `db push` posterior no romperá, pero el estado no es reproducible desde el
repo. Lección conocida (#3), sin resolver.

---

# RESUMEN FINAL

**Problemas encontrados:** 🔴 3 · 🟠 14 · 🟡 ~25 · Refutados 8

- **Solucionados y verificados:** 6 (R-1, N-1, F-1 mitad honesta, A-2, deep link, `publicarThemeApi`)
- **Parcialmente solucionados:** 3 (F-1, B-1, M-4)
- **Pendientes:** 14, todos con motivo explícito
- **No verificados (🔎):** 5 — el `widget.js` desplegado, las env de Vercel
  (`BILLING_ENFORCED`), los destinos configurados en el dashboard de Stripe, la
  facturación fiscal (`sellar-factura-server.ts`, `verifactu`, `fiskaly`: 558+
  líneas de dinero-adyacente sin auditar), y el rendimiento real en Vercel.

**Archivos modificados:** 13 (12 de código + 1 migración) · +272 / −23
**Tests:** 3.354 ejecutados · **3.354 pasan** · 0 fallan · **3 nuevos** (guardianes de F-1)
**Typecheck:** ✅ **PASS** sobre `lib/**`, `app/**`, `components/theme/**`
(2 errores restantes son `react-leaflet` y `leaflet` ausentes del `node_modules`
de esta máquina — están declarados en `package.json`, es entorno, no repo, y
están en un fichero que no toqué)
**Lint:** ✅ **PASS** (exit 0) sobre los 12 ficheros tocados
**Build:** 🔎 **NO VERIFICADO** — `next build` no cabe en el límite de tiempo por
comando de este entorno, y el `node_modules` disponible está incompleto
**E2E:** 🔎 **NO VERIFICADO** — Playwright necesita servidor y navegador

## ESTADO REAL POST-AUDITORÍA

**Cómo estaba al empezar.** Mejor que en ninguna pasada anterior en lo
estructural: cero fugas cross-tenant, escritura optimista cerrada, crons y BD
alineados con el repo, despliegue desatascado. Los tres 🔴 eran de una clase
nueva y más incómoda: **funcionalidad que existe, se ejecuta y no hace lo que
dice.** El cron cancelaba clases y avisaba a nadie. El botón de "avisar a
candidatas" mandaba publicidad sin consentimiento. El editor de apariencia decía
"se sigue intentando" a alguien a quien el servidor nunca iba a dejar guardar.
Ninguno de los tres habría salido en un log de errores: los tres devuelven éxito.

**Qué sigue abierto.** El riesgo mayor no es técnico, es un cobro: un estudio
suspendido por impago tiene una suscripción de Stripe activa que **volverá a
cobrar el 21 de septiembre**. Eso pide una acción tuya en Stripe, no un commit.
Después, el reset del cerrojo de OTP, que es la única vía de toma de cuenta que
he encontrado. Y el conciliador de disputas, que no puede recuperar precisamente
el caso en el que se pierde el dinero.

**Nivel de confianza.** Alto en lo que verifiqué contra producción (RLS con
control positivo, cuerpos reales de las funciones de Postgres, crons, recibos,
`webhook_events`). Medio en lo que solo leí. **Bajo en lo que no toqué**: la
facturación fiscal, el rendimiento y el build no están auditados y no debes
tratarlos como verdes.

**Antes de ponerlo delante de cientos de estudios**, por orden: (1) cerrar el
perímetro del billing propio —suspensión, alta de cadena, disputas—, porque hoy
es lo único que puede costar dinero de verdad; (2) A-1; (3) hacer que 39
lecturas dejen de decirle a la gente que no hay nada cuando lo que hay es un
error; (4) auditar la facturación fiscal, que es el hueco más grande que dejo.

**No he encontrado X después de revisar Y.** No puedo demostrar la ausencia de
bugs, y no la afirmo. Lo que sí puedo afirmar, con la evidencia de arriba, es
que las tres familias que dominaron agosto —escritura optimista, gemelos con
fugas, y migraciones que no llegaban a producción— no reaparecieron hoy.
