# F2 · Paso 3 — `reservar_plaza` transaccional (el canje atómico, D10)

> **Estado:** Paso 3a (límite semanal) hecho y en prod (PR #285). El resto (3b) reevaluado a **baja prioridad** — ver la corrección de abajo.
>
> **⚠️ CORRECCIÓN (2026-07-23): NO existe el "G2 money-leak" que este doc afirmaba.** Al revisar el flujo entero se confirmó que **ambos** caminos de cancelación YA consumen el bono de la socia promovida: servidor `ejecutarCancelacionReserva` (`consumirBonoServidor(promSocioId)`, `lib/supabase-data.ts:1955`) y panel (`consumirSesionBono(promovidaSocioId)`, `lib/studio-context.tsx:1613`). La afirmación original vino de una lectura incompleta (parar en la l.1949). **Lo tachado como G2 más abajo es falso.** Lo único real que quedaba (G1) es una ventana estrecha de no-atomicidad que el código ya tolera y loguea → cerrarla es alto riesgo / valor marginal, **no se hace por ahora**.

---

## 1. Objetivo

Hoy **reservar y consumir el bono son dos pasos separados y no atómicos.** Este paso mueve el **canje del entitlement DENTRO de `reservar_plaza`/`cancelar_reserva_plaza`** (una sola transacción), cierra los huecos que eso abre, y **activa el enforcement del límite semanal** (el dato entró en el Paso 1 pero nadie lo aplica). Es el prerrequisito del canje de **recuperaciones** (Paso 5): sin un consumo atómico, no se puede canjear una recuperación de forma segura.

---

## 2. El flujo real hoy (verificado en el código)

Dos caminos idénticos en forma: **servidor/portal** (`admin`, service-role) y **panel** (`supabase`, browser, vía `studio-context`).

**Reservar** (`ejecutarReservaConGamificacion`, `lib/supabase-data.ts:1820+`):
1. Gate JS: `tieneEntitlementActivo()` (bono-logic) si la política exige plan + `maxSimultaneas`.
2. `reservar_plaza` RPC — **atómico**: `FOR UPDATE` sobre la sesión, `aforo_efectivo` (Paso 2), inserta CONFIRMADA o LISTA_ESPERA.
3. **Sólo si `estado==='CONFIRMADA'` → `consumirBonoServidor()`** — un **segundo** paso (`rpc('consumir_sesion_bono')`, `:1464`), fuera de la transacción de la reserva.

**Cancelar** (`ejecutarCancelacionReserva`, `:1917+`):
1. `cancelar_reserva_plaza` RPC — **atómico**: cancela y **promociona** la primera de LISTA_ESPERA a CONFIRMADA; devuelve `era_confirmada` + `promovida_socio_id`.
2. **Sólo si `era_confirmada` y la política lo permite → `devolverBonoServidor()`** — segundo paso, fuera de la transacción.

`bono-logic.ts` (`bonoConsumible`/`calcularDevolucionBono`/`tieneEntitlementActivo`) es hoy **la autoridad JS** de *qué* suscripción descontar/devolver.

---

## 3. Los tres huecos

| # | Hueco | Consecuencia |
|---|---|---|
| **G1** | **No atómico.** Reserva y consumo/devolución son 2 RPC en 2 pasos. | Si el proceso muere entre medias (o falla el paso 2), la reserva existe pero el saldo no se descontó (o al revés). Saldo y reservas divergen. |
| ~~**G2**~~ ❌ FALSO | ~~La promoción de lista de espera NO consume bono.~~ **Corrección: SÍ lo consume** — ambos paths lo hacen (`ejecutarCancelacionReserva:1955`, `studio-context.tsx:1613`). No hay hueco. | ~~Inconsistencia de dinero.~~ **Ninguna.** |
| **G3** | **Límite semanal sin aplicar.** `planes_tarifa.limite_semanal` existe (Paso 1) pero ningún sitio lo comprueba. | El tope semanal del bono es decorativo. |

---

## 4. Diseño propuesto

Todo el canje pasa a la MISMA transacción que ya tiene el `FOR UPDATE` de la sesión.

### 4.1 · `reservar_plaza` absorbe el consumo (+ límite semanal)

Tras decidir CONFIRMADA (dentro de la TX, ya con el lock):
1. **Límite semanal** (G3): contar reservas `CONFIRMADA`/`ASISTIDA` de la socia cuyas sesiones caen en la **misma semana ISO** que ésta; si `>= plan.limite_semanal` → `raise exception 'LIMITE_SEMANAL'`. (Ver **P2**.)
2. **Consumir** (G1): seleccionar en SQL la suscripción de bono canjeable — réplica de `bonoConsumible`: `estado='ACTIVA'` + plan `BONO`/`PUNTUAL` + `sesiones_restantes>0` + no caducada (`fecha_fin is null or fecha_fin>=hoy`) — y `sesiones_restantes -= 1`. MENSUAL vigente → no consume. Sin bono canjeable y sin mensual → ya lo corta el gate previo.
3. Si `LISTA_ESPERA` → **no** consume (correcto: la espera no ocupa plaza).
4. **Nuevo `RETURNS`**: `estado, posicion_espera, suscripcion_consumida text, nuevo_saldo int` → la app repinta el saldo **sin** llamar a `consumir_sesion_bono`.

> **Orden de consumo (D9)** para pasos 4-5: `plaza fija → recuperación → bono → mensual`. En el Paso 3 sólo existen **bono/mensual**; dejo el punto de extensión comentado para enchufar recuperación (Paso 5) y plaza fija (Paso 4) sin volver a tocar la estructura.

### 4.2 · `cancelar_reserva_plaza` absorbe devolución + consumo de la promovida

En la misma TX en la que ya cancela y promociona:
- Si `era_confirmada` **y** la política devuelve → `sesiones_restantes += 1` (tope `plan.sesiones`) a la **canceladora** (G1).
- Si **promovió** a alguien (`promovida_socio_id`) → **descontar el bono de la promovida** (G2), misma selección que 4.1.
- La **política de ventana** (tardía / `devolverBonoTardia`) vive hoy en JS (`esCancelacionTardia`/`debeDevolverBono` con `pol.ventanaHoras`). Para mantener la política configurable en JS y el efecto atómico en SQL: **pasar los flags ya resueltos como parámetros** (`p_devolver_bono boolean`) — el JS decide *si* devolver, la RPC lo hace atómicamente. Alternativa (mover toda la política a SQL) = más acoplamiento; **no recomendada**.

### 4.3 · `bono-logic.ts` pasa a derivar, no a mandar

`bonoConsumible`/`calcularDevolucionBono` dejan de ser la autoridad de escritura; la verdad transaccional es la RPC. `tieneEntitlementActivo` **se queda** como pre-check de UX (mostrar "necesitas un plan", deshabilitar el botón) — barato y bueno para el usuario, pero ya no es lo único que protege.

### 4.4 · Callers y limpieza

- Los 2 callers de `reservar_plaza` (`:1852` servidor, `:3503` panel) dejan de llamar a `consumirBono*`; usan `nuevo_saldo` del return.
- Los 2 de `cancelar_reserva_plaza` (`:1921`, `:3515`) dejan de llamar a `devolverBono*`; pasan el flag de política.
- `consumir_sesion_bono` + los wrappers `consumirBonoServidor`/`devolverBonoServidor` quedan **huérfanos** → los dejo **deprecados un ciclo** y los retiro en un PR posterior (menos riesgo que borrarlos a la vez). El descuento optimista en `studio-context` se reconcilia con `nuevo_saldo`.

---

## 5. Decisiones de producto — ACORDADAS ("luego haz el resto", 2026-07-23)

| # | Decisión | Acordado (mi recomendación) |
|---|---|---|
| **P1** | Al **promocionar** desde lista de espera, ¿se consume su bono? Y si **no le queda saldo**, ¿se la promociona igual? | **Sí consume**; si no tiene saldo, **se promociona igual sin bloquear** (el descuento simplemente no encuentra bono canjeable y no hace nada). Coherente con "sin penalizaciones", nunca dejar plaza vacía. |
| **P2** | Reserva que **supera el límite semanal** | **Rechazar** con mensaje claro (`LIMITE_SEMANAL`). |
| **P3** | ¿Retiramos `consumir_sesion_bono` en este PR? | **No; un ciclo después.** Aquí sólo se deja de llamar (3c posterior). |

> **Limitación conocida (heredada, no la introduce este paso):** la devolución/consumo elige el bono **activo actual** de la socia (no traza qué suscripción concreta se consumió al reservar), igual que hoy. Trazarlo requeriría `reservas.suscripcion_id` — follow-up, fuera del Paso 3.

---

## 6. Riesgo y rollout

- **Camino crítico de dinero + concurrencia.** Es el cambio con más impacto de F2. Red: la **suite E2E de reserva** (5 tests, corre en CI) + **drill en prod** (reservar/cancelar/promocionar con una socia de prueba y comprobar saldo).
- **Retrocompatibilidad del `RETURNS`:** los campos nuevos (`suscripcion_consumida`, `nuevo_saldo`) son **aditivos**; `estado`/`posicion_espera` no cambian → los callers viejos siguen leyendo lo mismo hasta que se actualicen.
- **Idempotencia y orden:** `CREATE OR REPLACE` de las 2 funciones + migración versionada; aplicar y verificar en prod (mismo proceso). Número: siguiente libre (**⚠️ ya hay dos `0075` y `0076` está usado** → toca **`0077`**).
- **Fuera de alcance del Paso 3:** recuperaciones y plaza fija (pasos 4-5) — sólo se deja el punto de extensión.

---

## 7. Plan de implementación (revisado tras aterrizar en el código)

Al aterrizarlo aparecieron dos cosas que reparten el trabajo en piezas de riesgo muy distinto:

1. **3a-límite (✅ HECHO, PR #285)** — enforcement del **límite semanal** dentro de `reservar_plaza` (G3). Aditivo, una sola RPC, retrocompatible, cubierto por la E2E. Era la pieza segura y de valor inmediato (cerró el pendiente del Paso 1).
2. **3b — NO se hace por ahora.** Su justificación principal (G2) resultó **falsa** (ver la corrección de arriba). Lo único que quedaba (G1, la ventana estrecha de no-atomicidad) ya está tolerado y logueado por el código, y cerrarlo implica cirugía del camino del dinero entrelazada con dunning → **alto riesgo, valor marginal**. Se aparca.
3. **3c** — irrelevante mientras no se haga 3b.

> **Lección:** afirmé un "bug de dinero" (G2) sin leer el flujo entero. Antes de tocar el camino del dinero, verificar la función completa. El valor real del Paso 3 (límite semanal) se entregó en 3a; el resto no compensa el riesgo.

Cada sub-fase es un PR con su verificación en prod. Si algo se tuerce en 3a (lo más sensible), se revierte solo esa RPC sin arrastrar el resto.

---

## 8. Qué necesito de ti

1. **P1, P2, P3** (o "tus recomendaciones").
2. ¿Arranco por **3a** (`reservar_plaza` + límite semanal) como primer PR, con la E2E de reserva como red y verificación en prod?
