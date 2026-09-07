# Auditoría Tentare — 26ª pasada (7 sep 2026)

Sobre `origin/main` @ `27c4f84b` (#1708). El árbol local iba **8 por delante / 60 por
detrás**, así que auditar ahí habría sido auditar código que no existe (5ª vez).

Rama entregada: **`audit/2026-09-07`** (`c04b369a`), empujada al repo **local** de Marco,
sin subir a GitHub. Parche: `audit-07sep.patch`.
Una migración **aplicada y verificada en producción** (`20260907075400`).

---

## ESTADO REAL DE TENTARE

**Lo estructural sigue bien y no ha recaído.** Cuatro auditores en paralelo con acceso
SQL a producción encontraron: **0 tablas sin RLS con grants**, **0 policies de escritura
sin condición de tenant**, y el aislamiento entre estudios **probado en vivo con control
positivo** (como propietaria de `studio-demo` contra `studio-1`: ve sus 6 socias, ve 0
filas ajenas, incluidas las tablas nuevas de Comunidad y los datos de salud). La fuga de
PII de `red_perfiles` del 14-ago sigue cerrada de verdad. El despliegue tampoco atasca: la
rama del 6-sep no se fusionó, pero **todos sus arreglos llegaron a main por PRs propios**
(verificado fichero a fichero) — todos menos uno, y ese uno importa (ver abajo).

**Lo que no está bien es más incómodo: el riesgo se ha mudado del código a la operación.**

El hallazgo mayor de esta pasada no es un bug de programación. Es que una funcionalidad
desplegada el 5 de septiembre —bloquear la reserva a quien tiene un impago— lleva **dos
días bloqueando a una socia real a la que el estudio le había DEVUELTO su dinero**, y la
única salida que el producto le ofrecía a la propietaria era falsear los libros. No lo dijo
ningún test ni ninguna alerta: lo dijo un `select` contra producción.

* **Estado general:** el código nuevo es bueno; el problema es lo que ocurre **entre**
  piezas correctas.
* **Riesgo técnico:** medio. Sin deuda estructural nueva.
* **Riesgo de seguridad:** bajo, y esta vez con pruebas, no con impresiones.
* **Riesgo de datos:** bajo.
* **Riesgo de negocio:** **el más alto de la pasada** — el impago, la matrícula que no se
  cobra online y las 34 facturas que faltan son todos dinero, y ninguno saltaba en Sentry.
* **Áreas más problemáticas:** el borde entre cobrar y entregar; y las promesas de la UI
  que ninguna capa cumple.

### La clase de fallo de esta pasada

Las pasadas anteriores la nombraron «gemelos divergentes» → «camino normal vs red de
rescate». Hoy ha mutado otra vez, y a algo más caro:

> **La regla vive en dos capas y solo se actualiza una — y la que se queda vieja es la que
> le da la SALIDA al usuario.**

No es que se olvide un endpoint. Es que se arregla el sitio que **prohíbe** y no el que
**permite salir de la prohibición**. Tres de los cuatro 🔴/🟠 principales son eso:

| Lo que prohíbe | Lo que debería dar salida | Estado |
|---|---|---|
| `socio_tiene_impago` bloquea reservar | `/api/stripe/checkout` deja pagar | exigía `PENDIENTE`: **sin salida** |
| `cobertura.ts` promete «incluida en tu cuota» | `elegirBono` decide qué descontar | descontaba igual: **promesa falsa** |
| `reservar_plaza` rechaza con un código | la escalera TS lo traduce | 4 códigos sin brazo: **jerga interna** |

---

# 🔴 CRÍTICOS

### [A-1] Un reembolso convertía a la socia en morosa, y no había forma de pagarlo

**Severidad:** 🔴 · **Área:** pagos + reservas · **Estado:** ✅ SOLUCIONADO (migración en prod)

**Archivos:** `supabase/migrations/20260905151515_bloqueo_reserva_por_impago.sql:63`
(función viva en prod) · `app/api/stripe/checkout/route.ts:138` ·
`lib/billing/procesar-reembolso.ts:94` · `lib/studio-context.tsx:3958`

**Evidencia (cuerpo real leído de producción):**

```sql
select exists (
  select 1 from recibos r
   where r.studio_id = p_studio_id and r.socio_id = p_socio_id
     and r.estado in ('FALLIDO', 'DEVUELTO')   -- ← sin más matices
);
```

```ts
// app/api/stripe/checkout/route.ts:138 — el ÚNICO sitio por el que paga la socia
if (recibo.estado !== 'PENDIENTE') { ... 409 'Este recibo ya no está pendiente de cobro' }
```

**Qué ocurre.** `DEVUELTO` son **dos cosas distintas en la misma casilla**:

* «**Devuelto por el banco**» — lo escribe `marcarDevuelto` desde el panel, y así lo llama
  la propia UI de Cobros (`panel-pendientes.tsx:150`). El dinero nunca llegó: es deuda.
* «**Le devolvimos su dinero**» — lo escribe `procesar-reembolso.ts` (botón Devolver de la
  ficha, y `charge.refunded` desde el webhook). El dinero salió de la caja **hacia** la
  socia.

El gate los trataba igual. Y el único camino por el que la socia puede saldar la deuda la
rechazaba con un 409, porque **#1694 amplió dos de los tres escritores y se dejó el
tercero** — justamente el suyo.

**Medido en producción, no supuesto:**

| recibo | socia | estado | importe | devuelto | veredicto |
|---|---|---|---|---|---|
| `rec-web-a1ePvXflC7jvEEm5B6esEc7z` | `soc-1783527760312-1pnly` | DEVUELTO | 1,00 € | **1,00 €** | reembolso íntegro → **bloqueada por error** |
| `rec-6` | `soc-7` | DEVUELTO | 36,00 € | 0,00 € | devuelto por el banco → deuda real |
| `zzp-recibo-fallido` | `zzp-impago` | FALLIDO | 70,00 € | 0,00 € | deuda real (fila de prueba) |

`studio-1` es el único estudio con `bloquear_reserva_impago = true`. Total: **107 €** sin
vía de pago online desde el 5-sep, y una socia bloqueada por dinero que se le devolvió.

**Por qué es peor de lo que parece.** El mensaje que lee el mostrador
(`lib/reservas/errores-rpc.ts:30`) dice literalmente «*Tiene un recibo sin cobrar.
**Márcalo como cobrado desde Cobros** y vuelve a apuntarla*». Sobre un recibo
**reembolsado**, eso es falsear la contabilidad — y el Veri*Factu cuelga de ahí. El
producto empujaba a la propietaria a mentir en sus libros para desbloquear a una clienta.

**Solución aplicada.** El discriminante no se inventa: `recibos.importe_devuelto` (numeric
not null default 0) ya lo mantiene `registrar-devolucion.ts`, y `reembolso_stripe_id` /
`reembolso_solicitado_en` los escribe `procesar-reembolso.ts` en cuanto se pide el
reembolso (así un reembolso **en curso** tampoco bloquea).

```sql
and r.estado in ('FALLIDO', 'DEVUELTO')
and coalesce(r.importe_devuelto, 0) < r.importe
and r.reembolso_stripe_id is null
and r.reembolso_solicitado_en is null
```

Y su gemelo en TypeScript, `lib/billing/deuda-recibo.ts`, del que ahora tiran los tres
escritores del camino online. **Lo que bloquea por deuda tiene que poder pagarse.**

**Verificación en producción tras aplicar (con control positivo):**

```
soc-7                             DEVUELTO dev=0.00  bloqueada=true   ✓ deuda real
soc-1783527760312-1pnly           DEVUELTO dev=1.00  bloqueada=false  ✓ desbloqueada
zzp-impago                        FALLIDO  dev=0.00  bloqueada=true   ✓ deuda real
CONTROL_POSITIVO socia sin deuda                     bloqueada=false  ✓
```

---

### [A-2] La pantalla decía «Incluida en tu cuota» y el servidor gastaba una sesión del bono

**Severidad:** 🔴 (latente hoy) · **Área:** reservas/créditos · **Estado:** ✅ SOLUCIONADO

**Archivos:** `lib/reservar/cobertura.ts:112` vs `lib/bono-logic.ts:88` (`elegirBono`),
consumido en `lib/db/supabase-data-admin.ts:2135`

`cobertura.ts` promete desde que existe:

```ts
// La mensual gana: si la cubre, no se le descuenta ninguna sesión de bono, y
// decirle "te quedan 3" cuando no se le va a restar nada sería mentira.
if (plan.tipo === 'MENSUAL') return { estado: 'MENSUAL', planNombre: plan.nombre };
```

Y lo cumplía **ella sola**. `elegirBono` filtraba los planes MENSUAL como no candidatos y
se quedaba con el bono:

```ts
if (!plan || (plan.tipo !== 'BONO' && plan.tipo !== 'PUNTUAL')) return false;
```

Socia con cuota MENSUAL + un bono suelto, ambos cubriendo la clase: la pantalla dice
«Incluida en tu cuota» y `consumirBonoServidor` descuenta una sesión. Sin error, sin
recibo, sin nada que se lo cuente a nadie.

**Y hay un segundo daño, peor.** `reservar_plaza` consume una **recuperación** al topar el
límite semanal de la mensual, y `crearReservaPublica` llama a `consumirBonoServidor` dos
líneas después sin mirar nada: **la misma clase se pagaba dos veces**, con recuperación y
con sesión de bono.

Es la familia de #1690 («elegir el mismo bono que va a gastar el servidor»), cerrada para
bono-vs-bono y no para mensual-vs-bono. Y deja de ser el caso raro con la cuota combinada
(#1702): tener una mensual con techo por actividad y un bono para el resto es exactamente
lo que esa funcionalidad viene a vender.

**Medido:** hoy **ninguna socia** tiene MENSUAL activa y BONO con saldo a la vez. Latente,
no sangrando — por eso se arregla ahora, antes de que la cuota combinada se venda.

**Solución.** La regla va al **cuerpo común** de `elegirBono`, no a `bonoConsumible`: si la
mensual cubre y no se descuenta al reservar, tampoco puede devolverse al cancelar, o la
cancelación **regala** una sesión que nunca se gastó.

**Test que lo blinda** (`lib/reservar/cobertura.test.ts`): no enumera casos, **recorre una
matriz y deriva la invariante de lo que diga `coberturaDeClase`**. Incluye control
negativo (mensual caducada → el bono SÍ paga) y control positivo de la propia matriz (si
un refactor dejara todos los casos en `SIN_PLAN`, los asserts pasarían sin comprobar
nada). Mutado 2 veces, 2 rojas.

---

# 🟠 IMPORTANTES — arreglados

| ID | Problema | Archivo |
|---|---|---|
| **A-3** | Cobrado y sin plaza, con el motivo en jerga interna. `CONFLICTO_HORARIO`, `LIMITE_SEMANAL(_ACTIVIDAD)` y `NECESITA_AUTORIZACION` caían al comodín: el aviso al mostrador y el Sentry (nivel `error`) llevaban el código crudo de la RPC. Los códigos se contrastaron **uno a uno con el `prosrc` vivo**, no de memoria. | `lib/db/supabase-data-admin.ts:2262` |
| **A-4** | `/api/notifications` devolvía `{ok:true}` pasara lo que pasara, y 200 + `{items:[], unread:0}` («estás al día») ante un fallo de BD. El cliente **ya tenía la defensa escrita** (`perfil-y-avisos.ts:57`: «un fallo del servidor NO es "no tienes avisos"») pero solo se activa con `!res.ok`, que nunca llegaba. La defensa estaba en la capa equivocada. | `app/api/notifications/route.ts` |
| **A-5** | «Marcar leídas» no apagaba el punto de la campana. `invalidarNoLeidas` tenía **cero llamantes** pese a que su comentario decía quién la usaba, y encima era un placebo: vaciaba el caché sin avisar a los oyentes ni releer. | `lib/student/no-leidas.ts` |
| **A-6** | «Máx. 3/semana» donde el servidor entiende «2 de Máquina y 1 de Gyrotonic». El sublímite por actividad (#1702) viajaba hasta el cliente y **ninguna pantalla lo decía**: la alumna lo descubría al reservar la tercera, con el dinero pagado. | `lib/student/tienda.ts` |
| **A-7** | Aceptar una oferta de lista de espera y fallar dejaba la pantalla mintiendo: la RPC **ya había cancelado** la reserva y creado una recuperación, y la socia seguía leyendo «en lista de espera» hasta recargar a mano. | `app/portal/[slug]/mis-reservas/page.tsx:127` |
| **A-8** | La 2ª renovación de un bono el mismo mes devolvía el id de un recibo **ya cobrado** (el 23505 se trataba como éxito) → el checkout responde 409 y la socia lo lee como avería. Venta perdida con cara de fallo del sistema. | `app/api/public/renovar-plan/route.ts:69` |
| **A-9** | Un código de descuento agotado se aplicaba igual y no dejaba rastro: `consumir_codigo_descuento` es un `UPDATE … RETURNING` con el tope en su WHERE, así que 0 filas **no es error** — y `data` se descartaba. El tope se rebasaba en silencio. | `lib/billing/confirmar-cobro.ts:211` |

---

# 🔴🟠 PENDIENTES — con el motivo, no como lista de deseos

### [P-1] 🔴 La matrícula se promete en el panel y NO se cobra en ningún canal online

`grep -c matricula` sobre los **cinco** caminos de compra online da **0**. La cobra
únicamente el alta a mano desde el panel (`lib/studio-context.tsx:2166`). El estudio
pierde la cuota de alta de **todo el canal que capta socias nuevas**, que es exactamente
para quien existe la matrícula. La UI ya lo anuncia («+ 30 € de matrícula si es su primer
plan»).

**Por qué no lo he tocado:** el importe hay que **sumarlo antes de cobrar**, en
`checkout-embebido` y `stripe/checkout`, o se factura más de lo que se cobra. Y decidir si
la matrícula es una línea del mismo cargo o un segundo recibo es una decisión de producto
y fiscal, no un parche. **Medido:** 0 planes con `matricula > 0` hoy — la columna se creó
el 7-sep. El agujero se abre en cuanto una propietaria toque el toggle.

### [P-2] 🟠 I-3, tercer día abierto: el conciliador no guarda el método de pago

`lib/inngest/conciliar-cobros.ts:392`. Su propia cabecera dice que este cron entregó **4 de
cada 6 cobros reales**: no es un plan B teórico. Sin `stripe_payment_method_id`,
`renovaciones.ts:179` deja `proximo_reintento` en null y `dunning.ts` exige `not is null`
→ **un MENSUAL rescatado por el conciliador se cobra el primer ciclo y nunca más**. Es el
agujero que cerró #1668, reabierto por la red de rescate.

**Por qué no lo he tocado:** copiar el bloque por tercera vez reproduce la enfermedad. Toca
extraer `lib/billing/guardar-metodo-de-compra.ts` y llamarlo desde los tres sitios, como se
hizo con `confirmarCobroRecibo`. Es un refactor del camino del dinero y no cabe con
garantías al final de una pasada. **Contexto medido, y es peor que el hallazgo:** **16 de
16 suscripciones MENSUAL activas no tienen ningún método de pago guardado**, y en toda la
BD hay **0 socias con tarjeta guardada**. La renovación automática nunca ha cobrado a
nadie.

### [P-3] 🟠 34 de 62 cobros no tienen factura, y nada lo detecta

`reintentarFacturasPendientesDeSellar` solo mira las últimas 72 h, así que los cobros
anteriores a que `entregarPlanComprado` sellara factura quedaron fuera para siempre.
Medido: 11 `rec-web-*` (ventas online reales) y 6 `rec-renov-*` entre el 26-jul y el
20-ago, más 17 de mostrador/siembra.

**Por qué no lo he tocado:** sellar hoy una factura de agosto tiene implicación de
trimestre fiscal (lo dice la cabecera de `confirmar-cobro.ts`), así que **no** hay que
ampliar la ventana del cron. Lo que falta es la **señal**: una consulta diaria en
`conciliarCobrosVigilancia` que cuente COBRADO-sin-factura, igual que ya hace
`vigilarCadenaVerifactu`. Eso sí es seguro y cabe en el próximo PR.

### [P-4] 🟠 El cierre del centro solo cierra UNA puerta

`materializar_plazas_fijas` y `promocionar_siguiente_espera` (cuerpos leídos de prod) no
llaman a `fecha_en_cierre`. Si el estudio declara un cierre y luego extiende el calendario,
el cron de las 02:00 materializa plazas fijas CONFIRMADAS en días cerrados **y avisa a la
socia de que tiene clase**. La propia migración justifica el gate en SQL porque «tiene que
seguir siendo cierto para una sesión creada DESPUÉS de declarar el cierre» — y ese
razonamiento se aplicó a un solo camino.

**Por qué no lo he tocado:** son dos `create or replace` de funciones grandes, y el 29-ago
un parche así se aplicó en verde y reventó en la primera llamada (una columna sin
cualificar dentro de un `RETURNS TABLE`). **No hay urgencia:** 0 filas en `cierres_estudio`
hoy. Merece su propio PR con verificación en `pg_temp` y control positivo.

### [P-5] 🟠 Un código de descuento sin tope es reutilizable infinitas veces por la misma socia

`codigos_descuento_consumos` tiene tres columnas y **ninguna es `socio_id`** (verificado en
prod). La única barrera es el tope global, y `usos_max` es opcional desde el panel. Con un
código sin tope, la misma socia compra bono tras bono con el descuento cada vez.
**Por qué no lo he tocado:** requiere columna nueva + UNIQUE + decidir si «sin tope»
significa «ilimitado por campaña» o «una vez por socia». Decisión de producto.

### [P-6] 🟠 `red_perfiles_alumna`: la única policy de lectura de datos de socias sin tenant

```
using: ((estado = 'published') AND ((SELECT current_studio_id()) IS NOT NULL))
```

Solo exige «pertenezco a ALGÚN estudio». La tabla **no tiene columna `studio_id`**, así que
no hay contra qué comparar, y las 13 columnas son legibles por `authenticated` —incluidas
**lat/lng**—. **Hoy no expone nada: 0 filas.** Puerta abierta sobre una habitación vacía;
en cuanto reciba el primer perfil, pasa a 🔴.
**Por qué no lo he tocado:** si el directorio de compañeras es global **por diseño de
producto**, la policy es correcta y lo que sobra es el grant de geolocalización. Es tu
decisión, Marco, no una que pueda deducir del código.

### [P-7] 🟡 `import 'server-only'` en `supabase-admin.ts` — **NO se puede aplicar tal cual**

Lo propuso el auditor de seguridad como defensa en profundidad. **Lo he descartado tras
comprobarlo:** `lib/supabase-data.ts:8` importa `getSupabaseAdmin` como **valor**, y
`lib/studio-context.tsx` (`'use client'`) importa de `supabase-data`. Añadir `server-only`
**rompe el build**. El patrón `getSupabaseAdmin() ?? supabase` es isomorfismo deliberado
(el propio código lo dice: «en el navegador `getSupabaseAdmin()` devuelve null»). No es
fuga: Next solo inlinea `NEXT_PUBLIC_*` y `next.config.ts` no tiene bloque `env:`. Para
cerrarlo habría que partir `supabase-data.ts` primero.

### [P-8] 🟡 Deriva de migraciones, ejemplar nuevo

`20260905213836_toggle_like_post_portal.sql` en el repo; en la BD está aplicada como
`20260905213945`. Un `db push` desde limpio la reaplicaría, y
`scripts/comprobar-deriva-migraciones.mjs` **le pasa en verde** porque normaliza quitando
el prefijo. Es lo mismo que arreglaron #1693 y #1701. *(Mi propia migración cayó en esta
trampa: el cliente la registró como `20260907075400` y el fichero se llamaba
`20260907120000`. Renombrada en el mismo PR — commit `c04b369a`.)*

### [P-9] 🟡 Dos comentarios apuntan a una migración fantasma

`lib/billing/matricula-solo-una-vez.test.ts:8` y `lib/planes/formulario.ts:50` citan «migr
20260907120000» para `planes_tarifa.matricula`. Esa versión **no existe como fichero**: la
columna la creó `20260907031555`. No lo he corregido para no meter ruido no relacionado en
el diff.

---

## REFUTADO — con prueba, para que no se vuelva a mirar

1. **El broadcast de aforo anónimo NO filtra datos personales ni cruza estudios en su
   payload.** Ensayo en vivo contra prod con rollback: tocar una reserva real produjo dos
   mensajes, ambos `topic = 'aforo:studio-1'`, payload `{"id":…,"sesionId":…}`. Ni
   `socio_id`, ni nombre, ni email, ni aforo. Lo único observable por un anónimo que
   conozca el id de otro estudio es el **ritmo** de actividad — decisión explícita y
   documentada en la cabecera de `20260907042134`. *(Sigue siendo 🟡 acotable: la policy
   `aforo_broadcast_lectura_anonima` no filtra por estudio y su gemela `authenticated`
   sí.)*
2. **Nadie puede inyectar avisos falsos de aforo:** `anon` tiene GRANT INSERT sobre
   `realtime.messages`, pero las 4 policies son **todas `polcmd = 'r'`**. Sin policy de
   INSERT, RLS deniega.
3. **La familia del `codigo` de rechazo NO ha reaparecido en el camino principal.** Los 15
   `raise exception` de `reservar_plaza` y los 3 de `cancelar_reserva_plaza`, uno a uno:
   mostrador y app de alumna los cubren **todos**. El único hueco era el gemelo del
   webhook (A-3, arreglado).
4. **Los tres sitios del límite semanal por actividad cuentan igual.** Cuerpos comparados
   carácter a carácter en prod: misma `date_trunc('week', … at time zone 'Europe/Madrid')`,
   mismos estados, mismo `coalesce(cancelada,false)`.
5. **`rec-renov-…-{mes}` NO está roto para TRIMESTRAL/ANUAL.** #1701 los implementó como
   `periodicidad_meses` (CHECK `in (1,3,6,12)`), no como tipo nuevo: los ciclos caen en
   meses distintos. Solo BONO/PUNTUAL colisionaba.
6. **#1704 (cancelar suscripción) está cerrado de verdad**, y es la suscripción del
   *estudio a Tentare*, no la de la alumna. **#1694** tampoco permite doble cobro: clave de
   idempotencia por recibo+intento, guard de estado, y `202 + COBRADO_SIN_PERSISTIR`
   pintado como error.
7. **La cola Veri*Factu SÍ se consume:** cron cada 10 min en `vercel.json`. *(No verificado:
   si `transmisionConfigurada()` es cierto en prod — no tengo las env vars.)*
8. **#1703 (invitar a una amiga) tiene los dos extremos**, verificados: `?ref=` →
   `sessionStorage` con revalidación → comprobación en servidor contra la base → premio
   otorgado en **los dos** caminos de check-in.
9. **`anon` no lee `studios` por PostgREST:** `has_table_privilege` = false, RLS activa, 0
   policies para `anon`. El grant de columna que quedaba es letra muerta.
10. **`id text primary key` sin default:** comprobadas las 8 tablas de dinero. Todos los
    INSERT pasan id explícito. Sin ejemplar nuevo.

---

## LA REVISIÓN INDEPENDIENTE, OTRA VEZ, PAGÓ

Dos revisores en paralelo (dinero/BD y portal/reservas) sobre el diff **encontraron 6
fallos en mis 9 arreglos**, con typecheck, lint y 3.969 tests **en verde**. Es la sexta
pasada seguida. Lo que cazaron:

| # | Qué estaba mal en MI arreglo | Gravedad |
|---|---|---|
| 1 | **A-1 abría el checkout a `DEVUELTO` y `confirmarCobroRecibo` seguía sin aceptarlo.** La socia habría pagado de verdad y el UPDATE habría tocado 0 filas: sin bono, sin factura, sin email, sin renovación **y todavía bloqueada**. Cobrado y sin entregar — peor que el problema original. | 🔴 |
| 2 | **Mi test «que deriva del SQL» hacía match contra la CABECERA de comentarios.** Borrar las tres cláusulas del cuerpo y dejar el comentario lo dejaba **en verde**. Validaba la explicación, no el código. | 🔴 |
| 3 | **A-8: mi sufijo aleatorio quitaba la única defensa atómica** contra dos recibos de renovación vivos; el huérfano lo adopta el cron y el dunning le pasa la tarjeta off-session. Arreglaba un caso y abría un doble cobro. | 🟠 |
| 4 | **A-6 era un NO-OP perfecto:** lo apliqué sobre `lib/portal-tema/datos.ts`, que **no lo importa nadie** (resto del kit de tema borrado en #1591). | 🟠 |
| 5 | **A-2: `tipoClaseId` nulo daba «cubierta» por defecto.** Permisivo ante la duda es correcto para el DERECHO y **regala la clase** en el CONSUMO — y cuatro llamantes reales pueden pasar null. | 🟠 |
| 6 | **A-5: el `if (enVuelo) return` reinstalaba el conteo VIEJO** y volvía a encender el punto. Fix inerte. **A-7: `reintentar()` desmontaba la lista** bajo un esqueleto y tapaba con un `ErrorState` el toast que explicaba la recuperación. | 🟠 |

Los seis, corregidos y re-verificados (commit `2aac4962`). Nota de método nueva y cara:
**los comentarios de este repo citan el código que sustituyen**, así que un test
estructural tiene que quitar comentarios antes de hacer match — falla en las dos
direcciones. Lo descubrí porque mi propio test nuevo se puso rojo con el arreglo aplicado.

---

## RESUMEN FINAL

**Encontrados:** 🔴 2 · 🟠 13 · 🟡 ~20 (más ~12 refutados con prueba)

* **Solucionados y verificados:** **9** (A-1 … A-9), más **6 correcciones** de mis propios
  arreglos tras la revisión independiente, más el renombrado de migración.
* **Pendientes con motivo escrito:** 9 (P-1 … P-9). Tres esperan **decisión tuya**, no
  trabajo: la matrícula (fiscal), el tope por socia de los descuentos (producto) y si el
  directorio de compañeras es global (producto).
* **No verificado:** el bundle construido (`next build` no corre en el sandbox: falta el
  SWC de linux-arm64 y no hay red al registro); si `transmisionConfigurada()` es cierto en
  prod; ~39 rutas de staff sin comprobación de **rol** —la mayoría legítimas, pero tres
  merecen mirada: `integrations/kisi/abrir` (abre la puerta física desde cualquier rol),
  `emails/send` y `comunidad/posts`—; y Storage de Supabase, sin auditar en ninguna pasada.

**Checks:**

| | resultado |
|---|---|
| Tests | **PASS** — 3.974/3.974 (desde el árbol final, no desde el de trabajo) |
| Tests nuevos | **12** (2 de invariante derivada + 2 de contrato entre escritores + 8 de comportamiento) |
| Typecheck | **PASS** — `tsc --noEmit` sobre `lib/** + app/** + components/**` |
| Lint | **PASS** — los 17 ficheros tocados |
| Build | **NO VERIFICABLE** desde el sandbox (motivo arriba). No lo disimulo. |
| E2E | **NO EJECUTADO** — Playwright no arranca aquí |
| Migración en prod | **APLICADA y verificada** con control positivo |

### Nivel de confianza

**Alto en lo que he tocado, medio en lo que no.**

Alto en A-1 y A-2: los dos tienen la mitad SQL verificada contra producción con control
positivo, tests que **derivan** la invariante en vez de enumerar ejemplares, y los dos
pasaron por dos revisores que encontraron seis fallos reales y los vieron corregidos.

Medio en el resto del producto, y quiero ser preciso sobre por qué: **el hallazgo más caro
de esta pasada llevaba dos días en producción, con todos los checks en verde, y lo
encontró un `select`, no un test.** Eso significa que la cobertura de tests de Tentare
—3.974, que es mucha— no cubre la clase de fallo que más daño hace: el estado real de los
datos de producción contra las reglas del código.

### Lo que haría antes de poner Tentare delante de cientos de estudios

1. **Fusionar `audit/2026-09-07`.** Hay una socia real desbloqueada solo a medias: la
   migración ya está en prod, pero sin la mitad de TypeScript los otros dos recibos de
   deuda siguen sin poder pagarse online.
2. **P-2 (I-3), el conciliador.** Es el único pendiente que **pierde dinero de forma
   continuada**: 16 de 16 suscripciones mensuales sin método de pago guardado significa que
   la renovación automática, que es el modelo de negocio, no ha cobrado nunca.
3. **La señal de P-3.** No para arreglar las 34 facturas de agosto — para enterarse la
   próxima vez el mismo día.
4. **Una comprobación diaria del estado de los DATOS, no del código.** Un puñado de
   consultas de invariante (recibos cobrados sin factura, socias bloqueadas por reembolso,
   suscripciones mensuales sin método, códigos por encima de su tope) corriendo como cron y
   avisando. Las tres pasadas anteriores y esta encontraron su hallazgo mayor así, a mano.
   Es lo que convertiría cuatro auditorías en un guardián.
