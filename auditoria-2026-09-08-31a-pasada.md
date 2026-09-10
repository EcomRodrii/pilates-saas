# Auditoría 31ª pasada — 2026-09-08

**Área elegida: gamificación por créditos (`reward_rules`/`reward_catalog`/
`member_credits`/`reward_actions`/`achievement_definitions`/
`challenge_definitions`) y su punto de contacto con el TPV (`ventas_pos`).**

Motivo de la elección: es la única área señalada explícitamente en la memoria
de sesión como *"auditar antes de programar"* (`gamificacion-creditos-encargo-pendiente.md`,
encargo grande recibido el 7-sep-2026 y aparcado a propósito), tiene la
superficie de migraciones más reciente de todo el repo (ocho migraciones
`20260907*`/`20260908*`, la última aplicada esta misma tarde — S-1 de la 27ª
pasada, dentro de las 24h anteriores a esta auditoría), y cruza dinero real
por dos caminos: créditos proporcionales a lo cobrado en el TPV
(`otorgar_creditos_compra`) y recompensas que producen un derecho real dentro
del producto (`recompensa_clase_gratis` → `crear_recuperacion`). No se ha
tocado POS/Bizum, SEPA, dunning ni liquidaciones — ya barridas en las
pasadas 27ª-30ª.

Contrastado contra `.claude/tentare-os.md`, la memoria de sesión
(`gamificacion-creditos-encargo-pendiente.md`, `pos-rediseno-server-authoritative.md`)
y las auditorías `auditoria-2026-09-08-{28,29,30}a-pasada.md` para no repetir
hallazgos ya cerrados — ninguna de las tres menciona `asignar_venta_pos_a_socia`,
`ventas sin ficha` ni `evaluarLogrosServidor`/`evaluarRetosServidor`.

**No se ha aplicado ningún fix — solo el informe, como se pidió.**

---

## 🔴 Hallazgo 1 — Asignar a una clienta una venta del TPV que ya fue devuelta por completo le regala un bono real y créditos, por dinero que el estudio ya no tiene

**Ficheros:**
- `supabase/migrations/20260907170322_pos_venta_sin_ficha.sql:423-472` (RPC `asignar_venta_pos_a_socia`).
- `lib/pos/venta-servidor.ts:56-231` (`entregarVentaPOS`, en particular el bucle de líneas `PLAN` en 94-137 y el paso de créditos en 204-227).
- `app/api/pos/venta/asignar/route.ts` (llama a ambas sin comprobar nada más).
- `components/pos/hoja-ventas.tsx:195-207` — el botón «Asignar a una clienta» se pinta con `detalle.venta.estado === 'PAGADA' && detalle.venta.socioId == null`, **sin excluir las devueltas**, aunque la misma pantalla ya sabe pintar el badge «Devuelta» (línea 157-161) sobre esa misma venta.

**El mecanismo**: el TPV permite cobrar «sin ficha» (venta anónima, #1723) y
asignarla después a una socia real cuando vuelve y se apunta
(`AsignarVenta`, comentario propio: *"la ficha llega después"*). Al asignar,
se reejecuta `entregarVentaPOS` — la misma función que entrega bono, recibo,
factura y créditos tras un cobro normal — porque hasta entonces la venta
`socio_id IS NULL` había saltado esos pasos (el bucle de bonos hace `if
(!venta.socio_id) { avisos.push(...); continue; }` y el de créditos
`if (venta.socio_id && total > 0)`).

Una venta del TPV se puede devolver (entera o en parte) **sin necesitar
socio asignado** (`app/api/pos/devolucion/route.ts` no lo exige). Y
`devolver_venta_pos` (`supabase/migrations/20260907151014_pos_textos_caja_con_acentos.sql:136`,
`RAISE EXCEPTION` si `v_estado <> 'PAGADA'`) **nunca cambia `ventas_pos.estado`**
— una devolución total solo escribe `importe_devuelto` y `devuelta_en`; el
`estado` de la fila se queda en `'PAGADA'` para siempre, por diseño (el
propio comentario del recibo dice que el estado de cobro y el de devolución
son cosas separadas).

`asignar_venta_pos_a_socia` solo comprueba `v_estado <> 'PAGADA'` y
`v_socio_actual IS NOT NULL` (líneas 449-450) — **no mira `devuelta_en` ni
`importe_devuelto`**. Y la UI que ofrece el botón de asignar tampoco: usa
`detalle.venta.estado === 'PAGADA'`, que sigue siendo cierto después de una
devolución total.

**Cómo se explota (accesible desde el panel normal, no hace falta API a
mano)**:
1. Alguien de mostrador (PROPIETARIO/MANAGER/RECEPCION — `puedeMoverDinero`)
   cobra sin ficha una venta con una línea `PLAN` (p. ej. un bono de 10
   clases) a una persona que entra de la calle.
2. Por el motivo que sea (precio mal marcado, cliente se arrepiente,
   error de cobro) se hace una devolución TOTAL desde `/api/pos/devolucion`.
   La venta queda en la lista de Caja con el badge «Devuelta», pero como
   sigue sin ficha, **también** sigue mostrando el badge «Bono por asignar»
   y el botón «Asignar a una clienta» sigue activo en su detalle.
3. Semanas después (o el mismo día, por confusión con otra venta similar),
   alguien de mostrador asigna esa venta devuelta a una socia real.
4. `entregarVentaPOS` se reejecuta: la línea `PLAN` todavía tiene
   `suscripcion_id IS NULL` (nunca se creó, porque en el paso 1 no había
   `socio_id`) y **el bucle no comprueba `devuelta_cantidad`** — crea una
   suscripción `ACTIVA` con las sesiones completas del plan, exactamente
   igual que si la venta nunca se hubiera devuelto. El paso de créditos
   (línea 209: `if (venta.socio_id && total > 0)`) usa `venta.total`, el
   importe ORIGINAL de la venta, sin restar `importe_devuelto` — así que
   también otorga los créditos completos de `otorgar_creditos_compra` por
   una compra cuyo dinero ya salió de caja.
5. El recibo ya existía desde el cobro original (se crea en el primer paso
   de `entregarVentaPOS`, con `socio_id` `null`, antes de que hubiera
   devolución) y ahora pasa a la ficha de la socia como un cobro `COBRADO`
   más en su historial — aunque el estudio ya le devolvió el dinero al
   cliente original.

Resultado: la socia recibe una suscripción `ACTIVA` con sesiones de verdad
que puede reservar y consumir por el camino normal (`consumir_sesion_bono`
no sabe de dónde salió el bono, por diseño — el mismo motivo por el que el
TPV reutiliza `suscripciones` en vez de un "vale" propio), y créditos de
gamificación reales, por una venta cuyo importe el estudio ya no tiene en
caja ni en la cuenta de Stripe. No hace falta ningún acceso fuera de lo
normal: el flujo entero pasa por dos pantallas ya existentes del panel
(Devolución + Asignar a una clienta) que un integrante de mostrador con
permiso de caja usa a diario.

**No es explotable por una socia ni cruza tenant** — la RPC valida
`p_studio_id`/`p_socio_id` contra el estudio de sesión y solo la llama
`service_role` desde una ruta gateada por `puedeMoverDinero`. El riesgo es
de fraude/error interno de mostrador (o de un empleado deshonesto haciendo
"devuelvo y luego asigno a mi cuenta/la de un amigo"), no de acceso externo.

**Arreglo propuesto**: en `asignar_venta_pos_a_socia`, añadir
`IF v_importe_devuelto > 0 THEN RAISE EXCEPTION 'VENTA_YA_DEVUELTA'; END IF;`
(leyendo `importe_devuelto` junto al resto de columnas en el `SELECT ...
FOR UPDATE` de la línea 443) — coherente con que una devolución total o
parcial ya "cerró" esa venta para efectos de entrega. Reforzar en la UI
(`hoja-ventas.tsx:202`) ocultando el botón cuando `v.importeDevuelto > 0`,
para que mostrador ni siquiera vea la opción. Si se quiere permitir asignar
una venta devuelta EN PARTE (para las líneas que sí siguen en pie), habría
que calcular la entrega por línea viva, no por venta entera — pero eso es
una decisión de producto nueva, no el arreglo mínimo de este hallazgo.

---

## 🟠 Hallazgo 2 — `evaluarLogrosServidor`/`evaluarRetosServidor` no comprueban el resultado de `ajustar_creditos`: el mismo anti-patrón que se corrigió hoy mismo para `otorgar_credito_disparador` sigue vivo en los logros y retos

**Ficheros:**
- `lib/db/supabase-data-admin.ts:4282-4290` (logros) y `4347-4355` (retos).
- Comparar con `supabase/migrations/20260907200500_otorgar_credito_devuelve_importe.sql:1-47`,
  cuya cabecera documenta EXACTAMENTE este defecto para `otorgar_credito_disparador`
  y lo corrige moviendo los dos apuntes del ledger DENTRO de la misma
  transacción SQL que mueve el saldo.

`evaluarLogrosServidor` y `evaluarRetosServidor` (llamadas desde el punto de
entrada único de gamificación tras cada reserva/asistencia) hacen, para cada
logro/reto recién completado:

```ts
await admin.rpc('ajustar_creditos', { p_socio_id: socioId, p_studio_id: studioId,
  p_delta_saldo: def.creditosRecompensa, p_delta_ganado: def.creditosRecompensa, p_delta_canjeado: 0 });
await admin.from('credit_transactions').insert({ ... });
```

**No se comprueba el resultado de la llamada a `ajustar_creditos`** (ni
siquiera se desestructura `{ error }`) antes de escribir el apunte del
ledger. Si `ajustar_creditos` fallara — por ejemplo `SOCIO_NO_PERTENECE_AL_STUDIO`
si el índice de socios que alimenta `ContextoGamificacion` estuviera
desincronizado, o cualquier error transitorio de red/DB — el código sigue
adelante e inserta en `credit_transactions` un apunte de "GANANCIA" que
**nunca se aplicó al saldo real**: el historial de la socia declararía
créditos que no tiene. Es el error inverso y simétrico al que motivó la
migración de hoy (*"si fallaban, el saldo se había movido y no quedaba
registro"*) — aquí puede quedar el registro sin que se haya movido el saldo.

Además, `achievement_progress`/`challenge_progress` ya se marcaron
`completado = true` en el paso anterior (líneas 4255-4261 / 4323-4328)
independientemente de si el crédito se otorgó — y como *"ya conseguido, no
se re-evalúa"* es la primera comprobación de la función (línea 4250/4318),
un logro que falló al pagar créditos **no se reintenta nunca**: la próxima
vez que se evalúe ese logro para esa socia, `existente?.completado` ya es
`true` y la función vuelve sin comprobar nada más.

**Cómo se explota / cuándo ocurre**: no es un vector de ataque (no hay
input de usuario que fuerce el error), es un defecto de fiabilidad — un
fallo transitorio de Postgres, un timeout de red entre Vercel y Supabase, o
una futura restricción añadida a `ajustar_creditos` (como ya ha pasado tres
veces en este mismo fichero de migraciones con roles/guards nuevos) deja a
una socia con un logro/reto marcado como conseguido en su historial de
`achievement_history`/`challenge_history` pero sin los créditos
correspondientes en `member_credits`, sin ninguna forma de que el sistema lo
repare solo.

**Arreglo propuesto**: mismo patrón que ya se aplicó para
`otorgar_credito_disparador` — crear una RPC `otorgar_credito_logro`/reusar
una variante que inserte `reward_actions` + actualice `member_credits` +
inserte `achievement_history`/`credit_transactions` en una sola transacción
SQL, o al menos comprobar el `{ error }` de `ajustar_creditos` en TS y, si
falla, no marcar el progreso como `completado` (dejar `completado_en` a
`null` para que se reintente en la siguiente evaluación) en vez de escribir
el apunte de todas formas.

---

## Otras piezas revisadas — sin hallazgos nuevos

- **`ajustar_creditos`/`ajustar_stock`/`cancelar_canje` (S-1, 27ª pasada,
  migr. `20260908170000`)**: el guard de rol añadido hoy (`puede_gestionar_clientas()`)
  está bien aplicado y no lo bypasea ningún caller nuevo revisado en esta
  pasada (`canjearRecompensaPublica` sigue yendo por `service_role`, donde
  `auth.uid()` es `null` y el guard no aplica, tal y como documenta la
  propia migración).
- **`otorgar_creditos_compra`/`retirar_creditos_compra`** (créditos por
  compra del TPV, migr. `20260907150546`): idempotencia correcta por
  `UNIQUE(studio_id, trigger, ref_id)`; el borrado de la marca de
  idempotencia en `retirar_creditos_compra` (para permitir una venta futura
  con el mismo id, que hoy no puede pasar) **no reabre** un hueco de doble
  cobro porque `entregarVentaPOS` solo se reinvoca desde caminos que ya
  comprueban `venta.estado === 'PAGADA'` sin volver a llamar a
  `otorgar_creditos_compra` una vez que el recibo ya existe — el hueco real
  de esta familia es el del Hallazgo 1, que pasa por un camino distinto
  (`asignar`, no `otorgar_creditos_compra`).
- **`canjearRecompensaPublica` (canje CLASE_GRATIS)**: la compensación
  atómica (reservar stock → cobrar créditos → conceder recuperación →
  deshacer todo si hay TOPE) está bien encadenada y cada paso comprueba el
  resultado del anterior antes de continuar — coherente con la regla de
  "cero escritura optimista" del repo. Único resto teórico: los pasos de
  compensación (`ajustar_stock +1` tras un `ajustar_creditos` fallido) no
  están en una sola transacción de base de datos — si la propia llamada de
  compensación fallara por una razón de red (no por lógica de negocio), el
  stock quedaría perdido sin dinero de por medio. No se reporta como
  hallazgo de severidad: no es dinero, es, como mucho, una unidad de stock
  descuadrada, y requiere dos fallos de red encadenados en la misma
  petición.
- **`otorgar_credito_disparador`** (migr. `20260907200500`, endurecida hoy):
  revisado el guard de `STUDIO_MISMATCH`/`SOCIO_NO_PERTENECE_AL_STUDIO`,
  confirma lo que ya documenta la 27ª pasada — una socia autenticada no
  puede llamarla directamente (`current_studio_id()` es `null` para ella),
  una INSTRUCTOR sí, pero cada rama revalida la condición real (reserva
  `ASISTIDA`, referido con asistencia real) contra la base de datos, así
  que no hay forma de fabricar créditos sin que el hecho subyacente sea
  cierto — solo se podría re-disparar un otorgamiento legítimo ya cubierto
  por el `UNIQUE` de `reward_actions`.
- **RLS de `member_credits`/`reward_redemptions`/`reward_actions`/
  `reward_catalog`/`reward_rules`**: no se encontró ninguna política que
  distinga mal de fila (el patrón de la 30ª pasada) — todas están cerradas
  a escritura directa desde `authenticated` (`20260729153000_gamificacion_cierra_escritura_directa.sql`)
  y solo se leen vía RPC/rutas API, nunca directo desde `supabase-data.ts`
  (el cliente autenticado normal) para nada que escriba.
- **Caducidad de créditos por fecha** (migr. `20260908020000`): revisado el
  trigger `member_credits_caducidad` y `saldo_vivo()`; `mapMemberCredits`
  (`lib/supabase-data.ts`) aplica el mismo espejo de `saldo_vivo` en TS que
  usa toda lectura de saldo (incluida `canjearRecompensaPublica`), así que
  el saldo bruto guardado en disco tras una expiración nunca se lee sin
  pasar por la función que lo colapsa a 0 — sin hallazgo.

## Resultado

Dos hallazgos nuevos genuinos en el área de gamificación por créditos y su
cruce con el TPV:

- 🔴 **Crítico**: asignar a una socia una venta del TPV ya devuelta por
  completo le entrega un bono real (sesiones consumibles) y créditos de
  gamificación por dinero que el estudio ya no tiene — alcanzable desde dos
  pantallas normales del panel (Devolución + Asignar a una clienta), sin
  necesitar acceso a la API cruda. Es la clase de bug de dinero más grave
  que puede darse en esta área: fabrica un entitlement real, no solo un
  número en una pantalla.
- 🟠 **Importante**: `evaluarLogrosServidor`/`evaluarRetosServidor` no
  comprueban el resultado de `ajustar_creditos` antes de escribir el apunte
  del ledger ni antes de marcar el logro/reto como conseguido para
  siempre — el mismo anti-patrón "saldo y ledger pueden divergir" que la
  propia sesión de hoy documentó y corrigió para `otorgar_credito_disparador`,
  sin que el arreglo se replicara en el código hermano.

El resto del área (créditos por compra del TPV, canje de recompensas con
efecto `CLASE_GRATIS`, el guard de rol añadido hoy a las tres RPC de
`ajustar_creditos`/`ajustar_stock`/`cancelar_canje`, y la caducidad de
créditos por fecha) está sólido: bien idempotente, con `saldo_vivo()`
aplicado de forma consistente en TS y SQL, y sin agujeros de RLS del tipo ya
encontrado en la 30ª pasada.
