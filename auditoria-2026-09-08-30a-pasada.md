# Auditoría 30ª pasada — 2026-09-08

Alcance dirigido explícitamente por el usuario: **SEPA, dunning (reintentos
de cobro fallido) y liquidaciones/nómina de instructoras** — áreas que la
27ª/28ª/29ª pasada no tocaron (centradas en POS/Bizum). Contrastado contra
`.claude/tentare-os.md` (sección "Decisiones ya cerradas" y el bloque
completo de Fase 3/dunning del Brain) y la memoria de sesión, en particular
`liquidacion-instructoras-nomina.md`, `default-acl-service-role-solo-no-basta-revoke-public.md`,
`anon-rpc-nueva-firma-hereda-grant.md` y `rls-roles-solo-en-el-menu.md`, para
no repetir hallazgos ya cerrados.

**No se ha aplicado ningún fix — solo el informe, como se pidió.**

---

## 🟠 Hallazgo 1 — RLS de `instructor_tarifas` y `liquidaciones_instructoras` no reproduce el guard de fila que sí tiene la API: un MANAGER puede leer/alterar la tarifa y la liquidación de la PROPIETARIA o de otro MANAGER saltándose el endpoint

**Ficheros:**
- `supabase/migrations/20260731110000_instructor_tarifas.sql:24-43` (política `tarifas_gestion`, función `puede_gestionar_equipo()`).
- `supabase/migrations/20260804180132_liquidaciones_instructoras.sql:71-92` (política `liquidaciones_gestion`).
- Comparar con `app/api/equipo/liquidaciones/route.ts` (POST/PATCH/GET) y `app/api/equipo/tarifas/route.ts`, que sí filtran con `puedeGestionarFichaDe(sesion.rol, ficha.rol)`.

La propia memoria de sesión (`liquidacion-instructoras-nomina.md`) documenta
que un `/code-review` encontró y corrigió que un MANAGER podía generar,
confirmar y marcar como PAGADA la liquidación de la PROPIETARIA o de otro
MANAGER, porque `/api/equipo/liquidaciones` no reproducía el guard
`rolesQuePuedeAsignar('MANAGER')` que ya tenía `/api/equipo/tarifas`. La nota
dice explícitamente: *"Arreglado con el mismo guard en ambos métodos"* — es
decir, el arreglo se aplicó **en la capa de aplicación (las rutas Next.js)**,
no en SQL.

Comprobado en el código actual: el arreglo de aplicación sigue en pie (los
tres verbos de `/api/equipo/liquidaciones` y `/api/equipo/tarifas` llaman a
`puedeGestionarFichaDe` antes de tocar la fila de otra persona). Pero la
regla explícita y repetida de este repo es *"la RLS es la cerradura real, la
UI nunca es el límite de seguridad"* y *"cualquier permiso nuevo se
implementa en ambos sitios o no está terminado"* (`.claude/tentare-os.md`,
sección Seguridad). Aquí no se cumple: las políticas RLS de ambas tablas
comprueban únicamente `public.puede_gestionar_equipo()`, que es

```sql
CREATE OR REPLACE FUNCTION public.puede_gestionar_equipo() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  ...
    SELECT public.current_rol() IN ('PROPIETARIO', 'MANAGER');
```

— es decir, **rol del que llama, sin ninguna distinción de a qué fila (a
qué `instructor_id`) se aplica**. Ni `tarifas_gestion` ni
`liquidaciones_gestion` acotan por el rol de la ficha objetivo como sí hace
`puedeGestionarFichaDe` en TypeScript. Se verificó que ninguna migración
posterior (`20260813111206_red_perfiles_experiencias_verificaciones.sql`,
`20260904194535_instructor_horas_contrato.sql`, las dos únicas que tocan
después estas tablas) añade esa restricción.

**Cómo se explota**: cualquier usuaria con sesión `MANAGER` válida (JWT de
Supabase) puede saltarse por completo `/api/equipo/liquidaciones` y
`/api/equipo/tarifas` llamando directamente al REST de PostgREST
(`https://<project>.supabase.co/rest/v1/liquidaciones_instructoras` /
`instructor_tarifas`, con su propio `Authorization: Bearer <jwt>` +
`apikey`), algo trivial con curl o con la consola del navegador — no hace
falta más acceso que el que ya tiene como MANAGER autenticado. Con eso puede:
- Leer `tarifa_hora` / `base_mensual_eur` / `recargo_sustitucion_pct` de la
  PROPIETARIA o de otro MANAGER — el dato salarial que `instructor_tarifas`
  se separó de `instructores` precisamente para no filtrar (mismo motivo
  documentado para `mandatos_sepa`).
- `UPDATE`/`INSERT`/`DELETE` esas mismas filas, o las de
  `liquidaciones_instructoras` — incluido pasar una liquidación de la
  PROPIETARIA a `PAGADA` con un `referencia_pago` inventado, sin que la app
  lo hubiera permitido nunca.

No es explotable por una INSTRUCTOR normal (esa política ya restringe por
`instructor_id = current_instructor_id()` y `estado IN ('CONFIRMADA',
'PAGADA')`), ni cruza tenant (`studio_id = current_studio_id()` sigue
presente en ambas políticas). El riesgo es acotado a MANAGER→PROPIETARIA/
otro-MANAGER dentro del mismo estudio — el mismo perímetro que ya se
consideró grave la primera vez, solo que ahora por la puerta que la revisión
de seguridad de aquel PR no miró (la propia nota lo dice: *"confirmó RLS
correcta... el hallazgo real de escalada de rol se le pasó por alto a esa
revisión"* — se refería a la revisión previa al `/code-review`, y en efecto
el `/code-review` solo tocó las rutas, nunca volvió a pasar por SQL).

**Arreglo propuesto**: añadir a ambas políticas la misma condición de fila
que ya usa `puedeGestionarFichaDe` — necesita un helper SQL nuevo, p.ej.
`public.puede_gestionar_ficha_de(target_instructor_id text) RETURNS boolean`
que resuelva el rol de la fila `instructores` objetivo y aplique el mismo
mapa que `rolesQuePuedeAsignar` en TS (MANAGER solo puede tocar
RECEPCION/INSTRUCTOR; PROPIETARIO, todo). Sustituir `puede_gestionar_equipo()`
por esa función parametrizada en `tarifas_gestion` y `liquidaciones_gestion`
(`USING`/`WITH CHECK`), verificando después con una prueba en vivo
(`execute_sql`+`ROLLBACK`) que un JWT de MANAGER no puede tocar la fila de
la PROPIETARIA.

---

## SEPA — sin hallazgos nuevos genuinos

Se revisó el ciclo completo: alta del mandato (`app/api/stripe/setup-sepa/route.ts`),
elección de método (`lib/billing/metodo-cobro.ts`), el cargo off-session
(`lib/billing/stripe-cobros.ts`), y los tres eventos de webhook relevantes
(`checkout.session.completed` con `purpose=sepa_mandate`,
`payment_intent.payment_failed` con `origen=sepa_recibo`, `charge.refunded`).
Todo está ya fuertemente endurecido por pasadas anteriores (documentado en
`.claude/tentare-os.md`, sección Fase 3 del Brain y comentarios inline
extensos en el propio código):

- El guardia de estados de `registrarFalloCobro`/`confirmarCobroExitoso`
  admite explícitamente que un adeudo SEPA ya `COBRADO` vuelva a `FALLIDO`
  semanas después (R-transaction tardía) — el caso que pedía comprobar el
  encargo está ya resuelto y con comentarios que documentan por qué (líneas
  55-64 y 182-186 de `lib/billing/dunning-server.ts`).
- Una devolución SEPA tardía (hasta 8 semanas) llega como `charge.refunded`,
  no como `payment_intent.payment_failed`, y ese camino (`procesarChargeRefunded`)
  sí está cableado y cubre el caso "recibo ya cobrado, vuelve atrás".
- `cobrarReciboOffSession` valida `charges_enabled` de la cuenta Connect y usa
  una Idempotency-Key anclada a `reciboId + intentos_reintento`, así que un
  reintento del cron nunca duplica el cargo (ni de tarjeta ni de SEPA).
- El único hueco real que se buscó explícitamente — ¿qué pasa si el mandato
  se revoca entre que se crea el recibo y se ejecuta el cargo? — no tiene
  gestión activa (no hay handler de `mandate.updated`/`setup_intent.setup_failed`
  para marcar el mandato como inválido en `socios`), pero **no es explotable
  como bug de dinero**: un cargo contra un mandato revocado simplemente falla
  en Stripe y llega como `payment_intent.payment_failed`, que sí está
  manejado y hace avanzar el ciclo de dunning con normalidad (email a la
  socia, reintentos, FALLIDO al tercero). Es una mejora de UX posible (el
  mandato quedaría "listo" en la ficha aunque el banco ya lo haya revocado,
  hasta que el primer cobro falle), no un bug de cobro duplicado ni de dinero
  perdido — no se reporta como hallazgo de severidad.

## Dunning — sin hallazgos nuevos genuinos

Revisado `lib/billing/dunning.ts` (planificación pura, con tests),
`lib/billing/dunning-server.ts` y `lib/inngest/dunning.ts` (cron):

- Idempotencia ante solapamiento de ejecuciones: cada recibo es un
  `step.run` de Inngest con su propia clave, y el cargo real usa la
  Idempotency-Key de Stripe anclada a `intentos_reintento` — dos disparos
  concurrentes del mismo intento deduplican en Stripe, no en la app.
- Cambio de plan/cancelación durante un dunning en curso: al agotar los 3
  reintentos, `debeAutoCancelarSuscripcion` cancela la suscripción con un
  `UPDATE ... WHERE estado = 'ACTIVA'` (no incondicional), así que es
  idempotente y no pisa una cancelación manual ya hecha por la propietaria.
  Si la socia cambia de plan a mitad de ciclo, el recibo pendiente sigue
  siendo del plan viejo — comportamiento intencionado y documentado en otras
  pasadas (no confundir con el "congelar suscripción sin carrera" ya
  cerrado).
- Backoff entre reintentos (`OFFSETS_REINTENTO_DIAS`, +3/+7 días, verificado
  en `lib/billing/dunning.test.ts`) es razonable — no reintenta el mismo día
  ni machaca una tarjeta ya rechazada en bucle.
- El backstop de reconciliación SEPA (recibos `EN_CURSO` >15 días) consulta
  Stripe directamente y aplica la MISMA función (`confirmarCobroExitoso`/
  `registrarFalloCobro`) que el webhook — no hay un camino divergente que
  pueda dejar un recibo en un estado que el webhook no reconocería después.
- Paginación: el `dispatcher` usa `fetchAllRows` para no perder estudios más
  allá de la fila 1000 de PostgREST (el bug de truncado ya documentado en
  otras pasadas) — aquí está bien aplicado.

No se encontró ningún camino de doble cobro, resurrección indebida de un
recibo cerrado, ni fustigo de una tarjeta ya rechazada. Es una de las áreas
más auditadas de todo el repo (el propio `.claude/tentare-os.md` dedica un
apartado completo — "Fase 3 (dinero) — construida, NO probada con un cobro
real") y esta pasada no encontró una grieta nueva.

## Liquidaciones/nómina de instructoras — un hallazgo (RLS, ver arriba); el resto sin hallazgos nuevos

- **Determinismo del cálculo**: `lib/equipo/liquidacion-logic.ts` es una
  función pura (sin `Date.now()`, sin red) que solo suma lo que le pasa la
  capa de datos — mismo patrón que `lib/decision/margen-clase.ts`. Mientras
  la liquidación está en `BORRADOR` es reproducible y recalculable a
  voluntad (`upsert` por `instructor_id+periodo`); una vez `CONFIRMADA` no se
  vuelve a tocar nunca — decisión de producto ya cerrada y documentada
  ("sin edición de una liquidación ya CONFIRMADA salvo una futura acción de
  reabrir, no construida"). Si una clase se cancela DESPUÉS de confirmar la
  liquidación de ese mes, el número confirmado queda desactualizado a
  propósito, coherente con "nunca se recalcula en silencio un documento que
  la instructora ya pudo ver" (comentario de la propia migración) — no se
  reabre esa decisión.
- **Fuga entre compañeras (además del hallazgo de arriba)**: se comprobó que
  el cálculo de sustituciones no duplica ni pierde horas — `sesiones.instructor_id`
  se reasigna a la sustituta al confirmar (`0040_sustituciones_confirmar.sql`),
  así que las horas cubiertas aparecen SOLO en la liquidación de quien
  finalmente dio la clase, nunca en las dos ni en ninguna.
- **Penalizaciones**: el join en dos pasos (`reserva_id → sesion_id →
  instructor_id`) ya fue corregido en su día para no depender de un `select`
  de `sesiones` sin paginar (comentario explícito en el propio fichero
  citando el bug del truncado a 1000 filas) — verificado que sigue acotado a
  los ids que hacen falta, no a la tabla entera.
- **Vía de acceso**: se comprobó que `liquidaciones_instructoras` /
  `instructor_tarifas` no se leen desde ningún sitio del cliente vía
  `supabase-data.ts` (el cliente autenticado normal) — solo desde
  `lib/api-client.ts`, que llama a las rutas `/api/equipo/...`. Esto confirma
  que hoy, EN LA APP, el guard de aplicación basta para el flujo normal — lo
  que hace el hallazgo de RLS de arriba un problema de "cerradura ausente",
  no de "puerta ya forzada en producción", pero sigue siendo la brecha real
  que el propio repo advierte que no hay que dejar abierta.

## Resultado

Un hallazgo nuevo genuino, de severidad 🟠 importante: la RLS de
`instructor_tarifas`/`liquidaciones_instructoras` no reproduce el guard de
fila (MANAGER no puede tocar PROPIETARIO/otro MANAGER) que sí existe en las
rutas API — contradice explícitamente la regla "RLS es la cerradura real"
del propio repo, y es la misma clase de escalada que ya se corrigió una vez
en la capa de aplicación pero nunca se replicó en SQL. SEPA y dunning no
arrojaron hallazgos nuevos: son de las áreas de dinero más auditadas del
repo y esta pasada confirma que siguen sólidas, incluyendo los escenarios
concretos pedidos (mandato revocado, devolución tardía del banco, reintento
solapado del cron, cambio de plan a mitad de ciclo).
