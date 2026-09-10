# 44ª pasada de auditoría — Liquidación/nómina de instructoras (2026-09-09)

Área: `instructor_tarifas` (PR #562) + `liquidaciones_instructoras` (fila 11 del
informe estratégico). Ficheros centrales:

- `lib/equipo/liquidacion-logic.ts` (núcleo puro de cálculo)
- `lib/equipo/liquidacion-datos.ts` (capa de datos server-only)
- `app/api/equipo/liquidaciones/route.ts` (autorización + endpoints)
- `app/(dashboard)/equipo/liquidaciones/page.tsx` (UI)
- `lib/actions/equipo/equipoTarifasAction.ts` + `app/api/equipo/tarifas/route.ts`
- `supabase/migrations/20260804180132_liquidaciones_instructoras.sql`,
  `20260731110000_instructor_tarifas.sql`,
  `20260908184657_rls_tarifas_liquidaciones_por_fila.sql` (30ª pasada, ya cerrada)

## Resumen ejecutivo

El sistema está construido con bastante disciplina y ya ha pasado por una
ronda de auditoría previa (30ª pasada, 2026-09-08) que cerró un hallazgo real
de RLS (falta de distinción de fila para MANAGER). Verificado en vivo contra
`dwqvdycjcffqwfkzapvi`:

- Las políticas RLS de `instructor_tarifas` y `liquidaciones_instructoras` sí
  están aplicadas en producción tal y como dicen las migraciones (`tarifas_gestion`,
  `tarifas_propia_lectura`, `liquidaciones_gestion`, `liquidaciones_propia_lectura`),
  con `puede_gestionar_ficha_instructor` distinguiendo fila correctamente.
- El único `SECURITY DEFINER` de esta área (`puede_gestionar_ficha_instructor`)
  es un helper de RLS puro (mismo patrón ya documentado como intencional:
  se ejecuta como `current_rol()`/`current_studio_id()` del JWT de quien
  llama, así que `anon` teniendo EXECUTE no da nada útil sin sesión — no es
  el gotcha de `reservar_numero_factura`/`confirmar_sustitucion`).
- El cruce sustitución->sesión (`sesiones.instructor_id` se reasigna a la
  sustituta al confirmar, `0040/0048/0042_sustituciones_*.sql`) coincide con
  lo ya confirmado en la 40ª pasada: no hay doble cobro entre titular y
  sustituta.
- Autorización en servidor coherente con `puedeGestionarFichaDe`/
  `puedeGestionarEquipo` tanto en la Server Action de tarifas como en la API
  de liquidaciones, con mirror SQL verificado.
- Solo 4 filas en `liquidaciones_instructoras` en producción, todas a 0,00
  euros (datos de prueba del 2026-08-21) — el sistema no ha movido ninguna
  cifra real todavía, coherente con "sin pago real" ya documentado.

No hay hallazgos rojos. Dos hallazgos naranjas (uno de proceso/UX que puede
producir un pago fantasma, y una laguna de reconciliación con penalizaciones
revertidas) y dos amarillos menores.

## Hallazgos

### [NARANJA] 1 — Una liquidación BORRADOR se puede CONFIRMAR sin recalcular, aunque una clase se haya cancelado después de generarla

`lib/equipo/liquidacion-datos.ts:152-167` (`transicionarLiquidacion`, acción
`'confirmar'`) solo cambia `estado` — nunca vuelve a leer `sesiones`/
`sustituciones`/`penalizaciones`. El cálculo real vive exclusivamente en
`generarLiquidacionBorrador` (líneas 67-150), que sí filtra `cancelada = false`
en el momento de generarse.

**Escenario**: la propietaria genera el BORRADOR de agosto para una
instructora el día 1 de septiembre (incluye una clase del 30 de agosto). El 2
de septiembre esa clase se cancela con carácter retroactivo (p. ej.
corrección de un error de calendario, o
`cancelarSesionPorMinimoNoAlcanzado` la marca cancelada después). El día 5,
la propietaria entra a la pantalla de Liquidaciones, ve el BORRADOR ya
calculado (la UI no vuelve a llamar a `generarLiquidacionBorrador` al abrir
la pantalla — solo `fetchLiquidaciones`, que hace un SELECT simple,
`lib/equipo/liquidacion-datos.ts:178-184`) y pulsa directamente "Confirmar"
sin pulsar antes "Recalcular" (son dos botones independientes en
`app/(dashboard)/equipo/liquidaciones/page.tsx:179-190`, nada obliga a
recalcular antes de confirmar). El importe de esa clase cancelada queda
confirmado y, después, pagado — un pago fantasma por una clase que nunca se
dio.

Esto no es el patrón clásico de escritura optimista (el servidor sí guarda lo
que calculó), pero sí es el mismo defecto de fondo que la regla de dinero del
repo pide evitar: una acción de "confirmar pago" que no revalida contra el
estado actual de los datos que dicen justificarlo.

**Propuesta**: antes de aceptar `accion: 'confirmar'`, recalcular
internamente (reutilizando la misma query de `generarLiquidacionBorrador`) y
comparar el total contra el guardado; si difiere, rechazar con un error que
obligue a recalcular explícitamente primero (mismo principio que ya usa el
propio código para no pisar una liquidación ya CONFIRMADA/PAGADA).
Alternativa más simple: hacer que `PATCH ... accion=confirmar` llame primero
a `generarLiquidacionBorrador` (que ya es idempotente y solo toca BORRADOR) y
confirme el resultado fresco, en vez de fiarse del último SELECT.

### [NARANJA] 2 — Una penalización ya repartida en una liquidación no se descuenta si se revierte después

`lib/equipo/liquidacion-datos.ts:99-125` suma `penalizaciones.importe` con
`estado = 'COBRADA'` dentro del rango del periodo. El catálogo de estados de
`penalizaciones`
(`supabase/migrations/20260730225253_penalizacion_cancelacion_no_show.sql:34`)
no tiene ningún estado de "cobrada y luego devuelta" (a diferencia de
`OMITIDA_REVERTIDA`, que solo aplica ANTES de cobrar) — no existe ningún
endpoint `app/api/penalizaciones/**` para revertir un cobro ya hecho; un
reembolso de una penalización ya cobrada solo puede hacerse hoy fuera de la
app (Stripe dashboard) o vía el módulo genérico de `app/api/reembolsos`, que
no toca `penalizaciones.estado`.

**Escenario**: una penalización de 10 euros se cobra a una socia por error
(o se revierte por buena voluntad comercial). El
`instructor_reparto_penalizacion_pct` del estudio es 50%; la liquidación de
esa instructora ya sumó 5 euros por esa penalización y llegó a
CONFIRMADA/PAGADA antes de que se resolviera el reembolso. No hay ningún
mecanismo que reste esos 5 euros de una liquidación posterior ni que avise
de la discrepancia — queda una diferencia silenciosa entre lo que se pagó a
la instructora y lo que realmente entró.

Esto es un caso límite (el propio catálogo de Fase 3 ya documenta una laguna
hermana — `OMITIDA_REVERTIDA` sin regenerar detección — como "límite
conocido, no resuelto por diseño"), y no bloquea el cierre de esta pasada,
pero conviene dejarlo escrito porque toca dinero de la instructora, no solo
de la socia.

**Propuesta** (no urgente, para cuando haya cobros reales): añadir un estado
`REEMBOLSADA` a `penalizaciones` y, al detectarlo, marcar cualquier
liquidación `CONFIRMADA` (no `PAGADA`) que la incluyera como "requiere
revisión" — sin tocar liquidaciones ya `PAGADA` en frío (ajuste manual, como
el resto del sistema).

### [AMARILLO] 3 — `transicionarLiquidacion` es leer-y-escribir, no compare-and-set

`lib/equipo/liquidacion-datos.ts:152-176`: primero SELECT estado, en JS se
comprueba `actual.estado !== 'CONFIRMADA'`/`!== 'BORRADOR'`, y solo después
se hace el UPDATE — sin `WHERE estado = 'BORRADOR'` (o `'CONFIRMADA'`) en la
propia sentencia SQL, y sin comprobar rows affected. Dos peticiones PATCH
casi simultáneas con la misma `accion` (p. ej. doble clic muy rápido que
burla el `disabled={procesandoId === i.id}` de la UI, o dos pestañas)
podrían ambas superar el chequeo en memoria y ejecutar el mismo UPDATE dos
veces.

El impacto real es bajo porque el propio UPDATE es idempotente en el campo
que importa (`estado` termina en el mismo valor final las dos veces) y no
hay ningún evento de notificación enganchado a esta transición (confirmado
con grep: no hay ningún `LIQUIDACION_*` en `lib/notificaciones`/
`lib/eventos`) — así que no hay riesgo de aviso duplicado ni de fila
duplicada (no hay INSERT aquí). El único efecto secundario observable es
que, con `accion: 'marcar_pagada'`, la segunda petición podría sobrescribir
`referencia_pago` con un valor distinto si el usuario tecleó dos referencias
distintas en el `window.prompt()` de dos pestañas — un detalle cosmético, no
una pérdida de dinero.

**Propuesta**: por coherencia con la regla de "compare-and-set, no escritura
optimista" del resto del repo, añadir `.eq('estado', accion === 'confirmar'
? 'BORRADOR' : 'CONFIRMADA')` al propio UPDATE y comprobar que devolvió fila
(el patrón que ya usan otras rutas de dinero de este repo, p. ej.
`cancelar_reserva_plaza`).

### [AMARILLO] 4 — `handleGuardarTarifa` actualiza el estado local antes de que el PATCH confirme, sin revertir si falla

`app/(dashboard)/equipo/liquidaciones/page.tsx:80-91`:

```
setTarifas(prev => ({ ...prev, [instructorId]: siguiente }));  // optimista
const r = await actualizarTarifaInstructor(...);
if (!r.ok) showToast(r.error ?? 'No se pudo guardar');          // sin revertir
```

Esto es, literalmente, el patrón que este repo tiene identificado como el
bug más repetido en flujos de dinero: escribir el estado en la UI antes de
confirmar el resultado real, y no deshacer el cambio si el servidor lo
rechaza (p. ej. TARIFA_MAX superado, 403 por `puedeGestionarFichaDe`, o
caída de red).

**Impacto real, medido**: bajo, porque el input de esa fila usa
`defaultValue={tarifa?.tarifaHora ?? ''}` (línea 147, no `value`), es decir,
es un campo no controlado — una vez montado, cambiar `tarifas[i.id]` en el
estado de React no vuelve a pintar ese input (React ignora `defaultValue` en
re-renders). Y ningún otro cálculo del cliente lee `tarifas[instructorId]`
para derivar cifras — el importe real que se paga sale siempre de una
lectura fresca a `instructor_tarifas` dentro de `generarLiquidacionBorrador`
(servidor), nunca del estado optimista del navegador. Por eso esto no
cambia ningún número de la liquidación real. Aun así, sí dejaría el estado
de React `tarifas` internamente inconsistente con la BD tras un fallo
(invisible hoy solo porque nada más lo consulta), y viola la regla del repo
tal cual está escrita — vale la pena corregirlo antes de que alguien
reutilice `tarifas` en otro sitio de esa pantalla dando por hecho que
refleja la BD.

**Propuesta**: mover el `setTarifas` optimista a después de `r.ok`, o
revertir a `actual` en el `else`.

## Lo que se comprobó y quedó bien

- RLS de `instructor_tarifas`/`liquidaciones_instructoras` verificada en
  vivo (no solo leída en migración): `tarifas_gestion`/`liquidaciones_gestion`
  usan `puede_gestionar_ficha_instructor(instructor_id)` con distinción de
  fila real (PROPIETARIO todo, MANAGER solo RECEPCION/INSTRUCTOR);
  `tarifas_propia_lectura`/`liquidaciones_propia_lectura` acotan a
  `instructor_id = current_instructor_id()` y, en liquidaciones, a
  `estado IN ('CONFIRMADA','PAGADA')` — nunca un BORRADOR mutable.
- `resolverPropioInstructorId` (tanto en la Server Action de tarifas como en
  la API de liquidaciones) filtra por `studio_id`, así que una instructora
  con fichas en varias sedes de la misma cadena (P2-14) no puede ver la
  tarifa/liquidación de "otra ella misma" en otra sede por accidente.
- El guard `puedeGestionarFichaDe` (MANAGER no gestiona PROPIETARIO/otro
  MANAGER) está aplicado tanto en POST/PATCH/GET de liquidaciones como en
  PATCH de tarifas, con el mismo criterio que su espejo SQL — sin
  divergencia entre TS y SQL.
- No hay doble contabilización estructural entre clase propia y
  sustitución: `sesiones.instructor_id` se reasigna a la sustituta al
  confirmarse (`0040/0042/0048_sustituciones_*.sql`), así que la query
  `sesiones.eq('instructor_id', instructorId)` de
  `generarLiquidacionBorrador` ya trae solo las sesiones que le tocan a esta
  instructora, y el Set de `sustituciones.sesion_id` solo sirve para
  clasificar cada una como "propia" o "sustitución cubierta", no para
  sumarlas dos veces a instructoras distintas.
- `generarLiquidacionBorrador` rechaza explícitamente recalcular sobre una
  liquidación ya CONFIRMADA/PAGADA (protege el documento que la instructora
  ya pudo haber visto) — coherente con el comentario de la migración
  original.
- El cálculo puro (`calcularLiquidacion`) tiene test unitario para los seis
  casos relevantes (base sola, sustitución con recargo, sin tarifa fijada,
  reparto de penalizaciones activo/inactivo, mezcla realista) — no se
  encontró ninguna discrepancia entre el test y la implementación.
- Sin gemelos divergentes: la única fuente de verdad del importe es
  `liquidaciones_instructoras` vía `liquidacion-datos.ts`; no existe un
  segundo cálculo de "cuánto se le debe a la instructora" en el dashboard de
  instructora ni en ningún otro sitio del repo (grep de `liquidacion`/
  `nomina` no encontró ninguna otra vía de cálculo, solo referencias a
  "liquidación" como palabra en textos de UX no relacionados — ver
  `lib/decision/especialistas/retencion.ts`, `lib/no-show.ts`, que hablan de
  "liquidar" en otro sentido de negocio, no de nómina).

## Nota metodológica

No se repite el hallazgo de RLS por fila (ya auditado y cerrado el
2026-09-08, 30ª pasada) ni el de sustituciones/sobrepago (40ª pasada) —
ambos verificados de nuevo en vivo aquí solo para confirmar que el fix sigue
desplegado, no como hallazgo nuevo.
