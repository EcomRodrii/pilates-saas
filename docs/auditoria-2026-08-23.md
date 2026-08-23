# Auditoría Tentare — 23 ago 2026 (15ª pasada)

> Auditado contra `main` REAL de producción (`4777184e`), no contra el árbol local.
> Base de datos consultada en vivo (`dwqvdycjcffqwfkzapvi`).

---

## ESTADO REAL DE TENTARE

**El hallazgo principal de hoy no es un bug. Es que los bugs de ayer siguen ahí.**

La rama `audit/2026-08-22` —15 fallos arreglados, revisados, con 6 tests nuevos y
todos los checks en verde— **nunca se subió a origin**. Existe únicamente en el
portátil de Marco. Verifiqué los 15 fallos uno por uno contra el `main` de
producción: **los 15 siguen vivos**. Ninguno se arregló por otra vía.

Es la **tercera pasada consecutiva** con el mismo desenlace:

| Pasada | Qué produjo | Qué llegó a producción |
|---|---|---|
| 19-ago | 8 fixes en `audit/2026-08-19` | sí, más tarde |
| 21-ago | 9 fixes en `audit/2026-08-21` (PR #1341) | **no** — reimplementados a mano el 23-ago (`4777184e`) |
| 22-ago | 15 fixes en `audit/2026-08-22` | **no** — ni siquiera se subió |

El coste ya es medible: el 23-ago alguien tuvo que **reimplementar desde cero**
los 3 críticos del 21-ago porque la rama estaba demasiado desactualizada para
rebasar. Se pagó dos veces por el mismo trabajo. Con la rama del 22-ago va a
pasar lo mismo si no se sube esta semana.

- **Estado general:** el código que se escribe es bueno; el que llega a producción va tres días por detrás.
- **Riesgo técnico:** medio-alto — no por lo que se escribe, sino por el desfase.
- **Riesgo de seguridad:** alto — dos endpoints de método de pago sin comprobar quién llama.
- **Riesgo de datos:** medio — `backups/create` sin rol, con poda destructiva.
- **Riesgo de negocio:** alto — el webhook por el que entra el dinero de las socias puede quedarse mudo.
- **Deuda técnica:** concentrada en un solo patrón, ver abajo.
- **Área más problemática:** **el despliegue**, no el código.

### El patrón que domina Tentare

Cuatro pasadas seguidas encuentran **la misma clase de fallo**: *se arregla un
camino y no su gemelo.*

- `reservar_plaza` excluye clases canceladas del cupo → `resolver_reserva_pendiente` no (🔴 vivo hoy, verificado en la BD).
- `/api/billing/webhook` deja de fallar mudo (`e45f765c`) → `/api/stripe/webhook` sigue mudo (🔴 vivo hoy).
- `/api/public/checkout-embebido` valida `socioId` → `/api/stripe/checkout` no lo hacía (cerrado el 23-ago).
- `/api/backups/restore` exige PROPIETARIO → `/api/backups/create` no (🟠 vivo hoy).
- El botón *Cancelar* del calendario devuelve bono → el botón *Eliminar*, a su lado, no (🟠 vivo hoy).

**Esto ya no es casualidad, es una propiedad del sistema.** La recomendación de
producto, más abajo, va dirigida a eso.

---

## 🔴 CRÍTICOS

### [C-1] La rama con 15 fixes verificados nunca llegó a producción
**Severidad:** 🔴 · **Área:** proceso / despliegue

**Evidencia:** `git ls-remote --heads origin 'refs/heads/audit/*'` devuelve
`audit/2026-08-19` y `audit/2026-08-21`. `audit/2026-08-22` no está. Sus 4
commits (incluido `6ba9e2b7`, con los 15 fixes) existen solo en local.
`git log main..origin/audit/2026-08-22` → 1.250 líneas de diff sin fusionar.

**Impacto:** los 15 fallos siguen en producción, entre ellos 2 🔴 y 6 🟠.
Además, el check de deriva de migraciones (`.github/workflows/deriva-migraciones.yml`)
probablemente esté indultando migraciones aplicadas en prod cuya definición no
está en el repo, por la vía del "PR abierto".

**Solución:** subir la rama y abrir PR. Se entrega el trabajo de hoy como
parche aplicable precisamente porque el sandbox no tiene credenciales para
empujarlo (ver *Entregables*).

---

### [C-2] El webhook por el que entra el dinero de las socias se tragaba la firma inválida en doble silencio
**Severidad:** 🔴 · **Área:** pagos · **Estado: ✅ SOLUCIONADO**

**Archivo:** `app/api/stripe/webhook/route.ts:112-121`

**Evidencia (antes):**
```ts
try { event = stripe.webhooks.constructEvent(body, sig, webhookSecret ?? ''); }
catch {
  try { event = stripe.webhooks.constructEvent(body, sig, connectWebhookSecret ?? ''); }
  catch { return NextResponse.json({ error: 'Webhook signature inválida' }, { status: 400 }); }
}
```
Ni log, ni Sentry, ni fila en `webhook_events` (la idempotencia va después).

**Por qué importa ahora:** `e45f765c` arregló **este mismo patrón** en
`/api/billing/webhook` hace días, tras un incidente de 3 días. Por el gemelo sin
arreglar entra lo que de verdad duele: bonos, recibos, reembolsos y disputas de
las socias. Y `STRIPE_SECRET_KEY` se ha rotado **dos veces en tres días**
(`84d921c5`, `92ff8e9f`): si en alguna rotación se toca el endpoint de Connect
sin actualizar el secreto en Vercel, deja de entregar y nadie se entera.

**Impacto:** una alumna paga 60 €, Stripe cobra, la firma no verifica, el 400 se
pierde. El bono no se entrega, no hay recibo, no hay reserva. La propietaria no
ve el cobro; la alumna se planta en la puerta creyendo que tiene plaza.

**Solución aplicada:** `Sentry.captureMessage` en el catch interior (el exterior
no reporta a propósito: ahí fallar es lo normal), con `tags` que distinguen
"secreto no configurado" de "firma no verifica". Comportamiento intacto: sigue
devolviendo 400.

---

### [C-3] `setup-tarjeta` y `setup-sepa` dejaban secuestrar el método de pago de una socia ajena
**Severidad:** 🔴 · **Área:** pagos / multi-tenancy · **Estado: ✅ SOLUCIONADO**

**Archivos:** `app/api/stripe/setup-tarjeta/route.ts`, `app/api/stripe/setup-sepa/route.ts`

**Evidencia (antes):** la única defensa era
```ts
if (socio.studio_id !== body.studioId) return 403;
```
No había **ninguna** comprobación de quién llama. `grep -n "verificarUsuario\|socioAutenticado\|Bearer"` en ambos ficheros: vacío.

**Qué ocurre:** conocer (o acertar) un `socioId` del estudio bastaba para abrir
un Checkout de autorización y que el webhook escribiera el
`stripe_payment_method_id` de quien llama sobre la ficha ajena. No mueve dinero
en ese momento: secuestra el instrumento con el que se cobrará después. Además,
el 404 «Socia no encontrada» servía de oráculo para enumerar ids.

**Solución aplicada:** fuente única en `lib/billing/socia-autorizada.ts` (staff
del estudio por sesión, o la propia socia por su JWT), usada por **los dos**
gemelos, y colocada **antes** de leer la ficha para cerrar el oráculo.

> ⚠️ **Corregí una premisa falsa de la rama del 22-ago.** Su comentario afirmaba
> que `postCheckout` adjunta el JWT del portal por su cuenta. **No lo hace** — lo
> recibe como tercer argumento, e `iniciarDomiciliacionSepa` no se lo pasaba.
> Portar aquel fix tal cual **habría roto la domiciliación SEPA de todas las
> socias**. Se añade la cabecera en `lib/api-client.ts` como parte del cambio.
> Es exactamente el riesgo que ya documenta el método de auditoría: *hay que
> revisar los propios fixes.*

---

### [C-4] `resolver_reserva_pendiente` cuenta las clases canceladas en el cupo semanal
**Severidad:** 🔴 · **Área:** reservas / BD · **Estado: ⚠️ PARCIAL — migración escrita, NO aplicada**

**Verificado en producción**, no inferido del repo:
```sql
select count(*) into v_semana from reservas r join sesiones ss on ss.id = r.sesion_id
 where r.socio_id = v_socio_id and r.studio_id = p_studio_id
   and r.estado in ('CONFIRMADA','ASISTIDA')
   and ss.inicio >= v_semana_ini ...
```
Falta `and coalesce(ss.cancelada, false) = false`. Su gemelo `reservar_plaza` la
tiene desde el 21-ago. La cabecera de la migración del 20-ago afirmaba ser
«copia literal del bloque vigente en producción» — y se dejó la línea fuera.

**Impacto:** al aprobar una reserva a mano, las plazas de clases **que el propio
estudio canceló** gastan cupo del plan. O la socia recibe un `LIMITE_SEMANAL`
falso, o —peor, porque es silencioso— la función le **quema una recuperación**
marcándola `USADA` sin avisar a nadie.

**Solución:** `supabase/migrations/20260823090000_resolver_pendiente_ignora_clases_canceladas.sql`.
**Verificación fuerte:** normalicé el cuerpo de la migración quitando la línea
añadida y comparé su MD5 con el de `pg_get_functiondef` en producción:
`45dc08150b196e3ff8a5354a55d8f2e2` en ambos. Es decir, **el único cambio de
comportamiento es esa línea**. No aplicada a la BD a propósito (misma convención
que las pasadas anteriores: las migraciones las aplica quien despliega).

---

## 🟠 IMPORTANTES

### [I-1] Los cuatro `error.tsx` apagaban la alarma en vez de encenderla — ✅ SOLUCIONADO
`app/(dashboard)/error.tsx`, `app/network/error.tsx`, `app/portal/[slug]/error.tsx`, `app/reservar/[slug]/error.tsx`.

Los cuatro hacían solo `console.error`. El único que reporta a Sentry es
`app/global-error.tsx` — y **en cuanto un `error.tsx` de segmento ATRAPA el
error, el global-error ya no se monta**. Resultado: las cuatro superficies
grandes (panel, Network, portal de la clienta, widget de reservas) podían
romperse sin que el equipo se enterara nunca, con una pantalla bonita dando
sensación de estar cubierto. **Es peor que no tener boundary.** La más cara es
`/reservar`: una socia con el widget roto se va y no lo cuenta.
**Solución:** `capturarExcepcion(error, { tags: { area }, extra: { digest } })` en el `useEffect` que ya existía.

### [I-2] `/api/backups/create` no miraba el rol, y su poda borra de R2 — ✅ SOLUCIONADO
El comentario del fichero decía «crear una copia no es una operación
destructiva». **Es falso:** dos líneas más abajo `podarBackupsAntiguos` borra de
R2 todo lo que pase de `RETENCION.MANUAL`. Cualquier miembro del staff con
sesión podía disparar un volcado completo del negocio con service-role (saltando
RLS) — cuando la propia policy `admin_read_backups` exige PROPIETARIO para
siquiera *leer* la lista, y la UI ya lo restringía
(`components/configuracion/tab-backups.tsx:47`). El servidor no, que es donde cuenta.

### [I-3] Zoom creaba una reunión nueva cada 15 minutos, para siempre — ✅ SOLUCIONADO
`lib/zoom.ts:151` devolvía `{ ok: true, id: data.id ?? 0 }`. El `0` es *falsy*,
se guardaba en `zoom_meeting_id`, y el cron entra por `if (!fila.zoom_meeting_id)`
→ otra reunión, cada ciclo, contra la cuenta de Zoom de la propietaria. Y
`actualizarReunionZoom` haría `PATCH /meetings/0`.

### [I-4] «Eliminar clase» no devuelve el bono — el gemelo del botón de al lado — ⏳ PENDIENTE
`lib/studio-context.tsx:2496` · `app/(dashboard)/calendario/page.tsx:2352 y :2356`

`aa7130ab` (P-1) hizo configurable la devolución de bono al cancelar una clase, y
la cubrió en tres caminos. Pero en el calendario hay **dos botones pegados**:
*Cancelar* (pasa por la política) y *Eliminar* (no). `deleteSesion` borra la
sesión y el `ON DELETE CASCADE` se lleva las reservas: la sesión de bono
consumida desaparece **sin devolverse y sin dejar rastro para repararlo a mano**.
El flag `cancelacion_clase_devuelve_bono` ni se lee.

*Por qué no lo he arreglado:* toca lógica de negocio y hay que decidir si
*Eliminar* debe comportarse como *Cancelar* o si los dos botones deberían
fusionarse — es una decisión de producto, no de código.

### [I-5] La devolución de P-1 no excluye las plazas fijas: crea saldo de la nada — ⏳ PENDIENTE
`lib/db/supabase-data-admin.ts:959` · `app/api/sustituciones/route.ts:373` · `lib/studio-context.tsx:2458`

El camino de reserva suelta tiene el guard `!reservaId.startsWith('res-pf-')`,
con el motivo documentado («cancelar una plaza fija regalaba una sesión de bono +
una recuperación»). P-1 propagó la devolución a los tres caminos de clase
completa **sin copiar el guard**. Las filas `res-pf-` nacen CONFIRMADAS sin
consumir bono (`0084_materializar_plazas_fijas.sql:74`), así que devolverlas
inventa saldo. **Latente hoy:** verifiqué que hay 0 reservas `res-pf-` en
producción. Se dispara con el primer estudio que active plazas fijas.

*Fix recomendado:* mover el guard **dentro** de `devolverBonosPorCancelacionClase`
en vez de repetirlo en tres sitios — así ningún llamante futuro puede olvidarlo.
Es el antídoto al patrón del gemelo.

### [I-6] Cancelar una serie devuelve `{ ok: true }` a ciegas — ⏳ PENDIENTE
`lib/studio-context.tsx:2458-2476, 2612`. La función es `void`, su rama de error
sale en silencio (`if (!('ok' in res)) return`) y la devolución del bono va
`void devolverSesionBono(...)`. Antes de P-1 el coste era una reserva fantasma;
**ahora es dinero.** La propietaria cancela la serie de agosto, lee "Serie
cancelada", cierra el portátil, y ninguna de sus 30 alumnas recupera la sesión.
*Por qué no lo he arreglado:* cambiar la firma a `async` propaga a varios
llamantes — pasa del límite de líneas acordado.

### [I-7] Tres integraciones leen socias sin paginar (corte a 1.000) — ⏳ PENDIENTE
`mailchimp/sync`, `klaviyo/sync` y `gmail/sync-contacts`. El helper `fetchAllRows`
**existe** (`lib/supabase-data.ts:199`) y se usa en ~30 sitios; estas tres se
quedaron fuera. En Gmail es especialmente grave: la lectura truncada es
**la que deduplica**, así que las socias por encima del corte se reimportan como
clientas nuevas — duplicados reales que además consumen cupo de plan.

**Hallazgo nuevo, no cubierto por la rama del 22-ago:** el mismo patrón aparece
en sitios que tocan dinero.
`lib/inngest/renovaciones.ts:66` lee los socios con método de cobro sin paginar;
el `Set` sale incompleto y **los recibos de las socias por encima del corte nunca
entran al dunning** — renovaciones que no se cobran, en silencio. También en
`lib/inngest/campanas.ts:77`, `lib/inngest/automatizaciones.ts:462`,
`app/api/automatizaciones/run/route.ts:80`, `lib/instructor-dependency.ts:99`,
`lib/equipo/rendimiento-datos.ts:23` y `lib/db/supabase-data-admin.ts:1211/1278`
(estas dos **sin filtro de `studio_id`**: el corte es a escala de toda la plataforma).

### [I-8] Review Boost promete un 20% que puede no existir — ⏳ PENDIENTE
`components/growth/review-boost-modal.tsx:48-55, 106-117` y
`app/api/growth/review-boost/feedback/route.ts:75-83`.
El cliente descarta el `res.ok`; el servidor responde `positivo` aunque la
concesión del cupón haya fallado (`catch` con `console.error` solo). La tabla
tiene `unique(studio_id)`: **no hay segunda oportunidad**. La propietaria lee
«20% reservado en tu cuenta», va a contratar y paga el precio completo. Un fallo
de red además deja el modal muerto, con las estrellas `disabled` y sin mensaje.

### [I-9] El onboarding puede ser un callejón sin salida — ⏳ PENDIENTE
`components/onboarding/pantalla-bienvenida.tsx:532-543`. `guardadoRef.current = true`
se pone **antes** de escribir, y el resultado de `updateStudio` se descarta
(`updateStudio` no lanza: devuelve `{ok:false}`). Si el UPDATE se rechaza, la
propietaria pulsa «Entrar al panel», no pasa nada, y **el segundo clic sale por
el cerrojo**. Queda encerrada en el onboarding a pantalla completa; recargar la
devuelve al mismo sitio. Es el primer minuto de vida de la cuenta.

### [I-10] Spinner infinito tras cobrar en `/reservar` — ⏳ PENDIENTE
`app/reservar/[slug]/page.tsx:1345-1367`. `handlePagoExitoso` pone
`confirmacionPago = 'confirmando'` a ciegas; el efecto de polling sale por
`if (!pi || !email || !studioId) return` sin tocar el estado, y el techo de ~35 s
que degradaría a `'tardando'` vive **dentro** del polling que nunca corre. La
socia acaba de pagar de verdad y ve el spinner para siempre.

### [I-11] `TRUNCATE` y `TRIGGER` concedidos a `anon` en todo el esquema — ⏳ PENDIENTE
Verificado en producción (`information_schema.role_table_grants`): `socios`,
`recibos`, `reservas`, `suscripciones`, `sesiones` e `integraciones` conceden
`TRUNCATE, TRIGGER, REFERENCES` a `anon` y `authenticated`. **`TRUNCATE` bypasea
RLS.** El repo lo sabe y lo dejó abierto a propósito
(`20260821145056_menu_novedades_revoke_truncate.sql` lo cierra en una sola tabla
y lo documenta). **No es explotable hoy** —PostgREST no expone TRUNCATE— pero es
defensa en profundidad ausente, y el *default* del proyecto hace que **cada
tabla nueva nazca con el problema**.

*Fix:* `revoke ... on all tables in schema public` **+** `alter default privileges
... revoke` (lo segundo es lo que corta la reincidencia). No aplicado: es un
cambio global de privilegios en producción y el 17-ago ya hubo un `revoke` que
resultó ser un no-op y se dio por cerrado tres días.

---

## 🟡 MEJORAS

- **[M-1] El repo local de Marco tiene git bloqueado.** `.git/index.lock`,
  `.git/ORIG_HEAD.lock` y `.git/packed-refs.lock` quedaron de un proceso
  reventado hoy a las 09:07. Ningún commit, stash ni merge funciona ahí hasta
  borrarlos. **Es lo primero que hay que hacer**, ver *Entregables*.
- **[M-2] El árbol local iba 59 commits por detrás de `main`.** Segunda vez
  (ya pasó el 19-ago con 265). Auditar ahí es auditar código que no existe.
- **[M-3] Renombrado cosmético de 2 migraciones** (`studios_sitio_web`,
  `review_boost`) a su timestamp real de aplicación. **No afecta al check de
  deriva** (normaliza quitando el prefijo), así que su único valor es que el
  orden de ficheros coincida con el de producción si alguien reconstruye la BD.

---

## MAPA DE DEUDA TÉCNICA

| Área | Estado | Riesgo | Prioridad |
|---|---|---|---|
| **Despliegue / proceso** | 🔴 roto | 3 pasadas sin llegar a prod | **1** |
| Pagos | 🟠 2 🔴 cerrados hoy, 1 🟠 abierto | dinero perdido en silencio | 2 |
| Reservas / calendario | 🟠 3 🟠 abiertos (P-1 incompleto) | saldo inventado / no devuelto | 2 |
| Observabilidad | ✅ mejorada hoy (4 error.tsx + webhook) | era ciega en 4 superficies | 3 |
| Base de datos / RLS | 🟠 RLS correcta; grants laxos | no explotable hoy | 4 |
| Integraciones | 🟠 sin paginar | duplicados + dunning incompleto | 3 |
| Multi-tenancy | ✅ sin fugas nuevas encontradas | — | — |
| Seguridad de secretos | ✅ clave rotada, sin refs en cliente | cerrado | — |
| UX de errores | 🟠 3 callejones sin salida | onboarding y pago | 3 |
| Tests | ✅ 3.322 en verde | buena base | — |

---

## PLAN DE LIMPIEZA

**FASE 1 — hoy, 10 minutos**
1. Borrar los tres `.lock` del repo local.
2. Subir `audit/2026-08-22` y el parche del 23-ago. Abrir PR.
3. Aplicar la migración del cupo semanal al desplegar.

**FASE 2 — estabilización**
4. I-4 e I-5: cerrar P-1 de verdad (el botón *Eliminar* y el guard `res-pf-`),
   moviendo el guard **dentro** de `devolverBonosPorCancelacionClase`.
5. I-7: paginar `renovaciones.ts` primero (es dinero), luego el resto.
6. I-9 e I-10: los dos callejones sin salida.

**FASE 3 — refactorización**
7. I-6: `cancelarReservasDeSesiones` → `async` con `ResultadoEscritura`.
8. I-11: revoke global + `alter default privileges`, **verificando después**.

---

## RECOMENDACIÓN COMO CTO

Dejo de recomendar bugs concretos por un momento, porque el problema real es otro.

**1. El cuello de botella no es encontrar fallos, es fusionarlos.** Tres pasadas
seguidas produciendo trabajo verificado que no llega a producción. Cada día que
una rama espera, `main` se aleja y el coste del rebase sube hasta que hay que
reescribir — que es literalmente lo que pasó el 23-ago con los 3 críticos del
21-ago. **Propongo: ninguna auditoría nueva hasta que la del 22-ago esté en
`main`.** Auditar por encima de fixes sin fusionar multiplica el trabajo.

**2. El patrón del "gemelo" merece una defensa estructural, no más vigilancia.**
Cinco instancias documentadas en cuatro pasadas. La vigilancia manual ya falló
cinco veces. Lo que sí funciona es **hacer imposible el olvido**: guard dentro de
la función compartida (como propongo en I-5), fuente única de autorización (como
he hecho hoy en `socia-autorizada.ts`), y un test que recorra *todos* los
endpoints de una familia en vez de uno.

**3. No añadir funcionalidad hasta cerrar P-1.** Hay una feature de gamificación
a medias en el árbol local (logros, retos, niveles). P-1 —dinero de las
clientas— está incompleto en dos caminos. Primero se termina lo que toca el
saldo de las alumnas.

---

## RESUMEN FINAL

**Problemas encontrados:** 🔴 4 · 🟠 11 · 🟡 3 — **18 en total**

- ✅ **Solucionados y verificados:** 5 (C-2, C-3, I-1, I-2, I-3)
- ⚠️ **Parcial:** 1 (C-4 — migración escrita y verificada contra prod, sin aplicar por convención)
- ⏳ **Pendientes:** 11 (C-1 requiere credenciales; 10 documentados con su motivo)
- 🔎 **No verificados:** 1 (si `audit/2026-08-22` figura como PR abierto — solo se ve en GitHub)

**Archivos modificados:** 12 · **~110 líneas de código** + 1 migración de 143.

| Check | Resultado |
|---|---|
| Typecheck (`tsc --noEmit`) | ✅ **PASS**, 0 errores |
| Lint (`eslint`) | ✅ **PASS**, 0 errores |
| Tests (`npm test`) | ✅ **PASS** — 3.322/3.322 |
| Build | ⚠️ **NO VERIFICADO** |
| E2E | ⚠️ **NO EJECUTADO** (Playwright necesita navegadores y servidor) |

**Sobre el build:** falla con 9 errores, **todos** de `next/font` no pudiendo
descargar de `fonts.googleapis.com` — el sandbox no tiene salida a ese dominio.
Ninguno procede de los ficheros tocados. No puedo afirmar que el build pase;
tampoco tengo indicio de que falle por estos cambios.

### Qué NO he podido verificar

- El build y los E2E (arriba).
- Si `audit/2026-08-22` está abierto como PR — determina si el check de deriva
  está en rojo o indultado.
- El comportamiento en vivo de los caminos de UI (I-8, I-9, I-10): los he leído,
  no los he ejecutado en un navegador.

### Nivel de confianza

**Alto** en lo que he tocado: cada fix tiene evidencia de código, C-4 está
verificado contra la base de datos real por MD5, y los tres checks que sí pude
ejecutar están limpios.

**Bajo en el conjunto del producto**, y no por el código: mientras el desfase
entre lo arreglado y lo desplegado sea de tres días, el estado de `main` no
refleja el trabajo hecho. **Antes de poner Tentare delante de cientos de
estudios, lo que hay que arreglar primero no es un bug: es que los arreglos
lleguen.**
