# Auditoría 36ª pasada — 2026-09-09

## Área elegida y por qué

**Decision OS / "Tentare Brain"** (`lib/decision/**`, `lib/inngest/decision.ts`,
`app/api/decisiones/**`) — el motor de especialistas (Ingresos, Finanzas,
Equipo, Agenda, Captación, Retención, Onboarding...) que analiza cada estudio
a diario, genera recomendaciones, las prioriza en "El Umbral" (mensaje único
del día), y las ejecuta cuando el propietario aprueba o cuando el piloto
automático las auto-ejecuta.

No estaba en la lista de zonas ya barridas de esta ronda (POS/Bizum,
SEPA/dunning/nómina, gamificación, checkout/matrícula/legal, OAuth,
comunidad/mensajería de estudio, Veri*Factu, reservas/penalizaciones,
Tentare Network). Es de las zonas con más actividad reciente real del repo
(Fase 2 del Umbral con calibración adaptativa, P2-5 rediseño de
especialistas, Fase 3 de dinero con `COBRAR_RECIBOS`) y con superficie de
dinero genuina: la recomendación `RECUPERAR_PAGOS` del especialista
INGRESOS (`lib/decision/especialistas/ingresos.ts:154`) emite una acción
`COBRAR_RECIBOS` que, al aprobarse, dispara un cargo REAL a la tarjeta
guardada de la socia vía `cobrarReciboOffSession` (Stripe Connect
direct-charge) — contradice la lectura superficial de
`.claude/tentare-os.md` ("Las reglas de dinero avisan, nunca cobran.
Ninguna emite COBRAR_RECIBOS"), que en realidad describe una nota distinta
(`confianzaRiesgoDeCobro`, F3 del apartado de tarjetas) y no cubre I2.

**Metodología**: se leyó el pipeline completo (`lib/inngest/decision.ts`),
la capa de persistencia (`lib/decision/db.ts`), la puerta de piloto
automático (`lib/decision/autonomia.ts`) y los 6 endpoints de
`app/api/decisiones/`, cruzando cada uno contra el patrón de guardas ya
documentado en `.claude/tentare-os.md` (rol PROPIETARIO, `studioId` del
propio estudio, transición condicional PENDIENTE→X). La mayoría de la
superficie de aprobación/rechazo/posponer está bien defendida (comprobación
de rol, de tenant, y transición atómica `UPDATE ... WHERE estado = X`). El
camino de cobro (`cobrarReciboOffSession`) también está muy bien defendido
(cruce estudio+socia+recibo, guard de modo Stripe test/live, idempotencia
por recibo). Se encontró un hallazgo real en la capa de upsert de
recomendaciones que afecta a **cualquier** tipo de acción aprobada (incluida
`COBRAR_RECIBOS`), no solo a dinero.

---

## 🟠 [D-1] El re-análisis diario puede revertir en silencio una recomendación ya APROBADA de vuelta a PENDIENTE, borrando quién la aprobó y con qué datos — antes de que se ejecute

**Archivos**:
- `lib/decision/db.ts:129-151` (`dbUpsertRecomendacion`)
- `lib/decision/db.ts:107-120` (`construirRecomendacion`, siempre `estado: 'PENDIENTE'`, `resueltoEn: null`, `resueltoPor: null`)
- `lib/inngest/decision.ts:164-167` (`for (...) await step.run(..., () => dbUpsertRecomendacion(r))`, una vez por candidata en CADA pasada diaria)
- `lib/inngest/decision.ts:415-422` (`ejecutarRecomendacion`, guard `if (recomendacion.estado !== 'APROBADA') return { ok: false, motivo: 'Estado inesperado' }`)
- Acción con dinero real afectada: `lib/decision/especialistas/ingresos.ts:154` (`accion: { tipo: 'COBRAR_RECIBOS', reciboIds: ... }`, dedupeKey fijo `INGRESOS:RECUPERAR_PAGOS:${studioId}` — una única candidata por estudio, se regenera cada día con el conjunto de recibos vencidos DE ESE DÍA).

**Qué pasa**: `dbUpsertRecomendacion` decide si INSERTa o ACTUALIZA buscando
una fila existente por `(studio_id, dedupe_key)` con
`.in('estado', ['PENDIENTE', 'APROBADA'])` (línea 135). Si la encuentra —
es decir, si la recomendación de ayer sigue en `APROBADA` porque el
propietario ya dio el visto bueno pero `ejecutarRecomendacion` (disparada
por evento Inngest) todavía no ha corrido o ha tardado en reintentar—, el
código comentado dice explícitamente que **"id/creado_en nunca se pisan al
refrescar una PENDIENTE/APROBADA viva"** (línea 141) — pero eso es todo lo
que se protege. El resto de la fila (`row = recomendacionToDb(r)`, línea
139) sale de una candidata **recién construida por `construirRecomendacion`**,
que siempre tiene `estado: 'PENDIENTE'`, `resueltoEn: null`,
`resueltoPor: null` (línea 117-118) y una `accion`/`datosUsados` recalculados
con los datos de HOY. El `UPDATE` de la línea 145 escribe eso encima de la
fila `APROBADA` — incluida la columna `estado`, que vuelve a `PENDIENTE`, y
`resuelto_por`/`resuelto_en`, que vuelven a `NULL`. La aprobación del
propietario desaparece de la base de datos sin dejar rastro de que existió.

**Por qué es explotable de verdad, no solo teórico**: el especialista
INGRESOS agrega TODOS los recibos vencidos con tarjeta en **una sola
candidata por estudio** con un `dedupeKey` fijo
(`INGRESOS:RECUPERAR_PAGOS:${studioId}`, sin fecha ni ids en la clave). Eso
significa que la recomendación de "cobrar estos recibos" de HOY y la de
MAÑANA son, a ojos del upsert, *la misma fila* mientras siga
PENDIENTE/APROBADA — el propio patrón que el comentario de la línea 122-127
describe como intencionado ("refresca la existente"). El dispatcher corre
una vez al día (`30 14 * * *`, `lib/inngest/decision.ts:47`); el
`ejecutarRecomendacion` que dispara `POST /aprobar` es asíncrono
(`retries: 3`, línea 416) y no se espera a que termine antes de que el
siguiente ciclo diario pueda correr. Si el cobro tarda en resolverse —
Stripe con latencia/caída temporal, cola de Inngest con backlog (el propio
`.claude/tentare-os.md` documenta que Inngest corre "al ~84% del plan
free")— la fila puede seguir en `APROBADA` cuando el análisis del día
siguiente escribe encima.

**Consecuencia concreta**:
1. El propietario aprueba "cobrar 3 recibos, 45€" desde el Centro de
   Control. La API devuelve `{ estado: 'APROBADA' }` (`app/api/decisiones/[id]/aprobar/route.ts:31`) — el propietario da el asunto por resuelto.
2. Si la ejecución no ha terminado (o falló y está reintentando) cuando
   corre el análisis del día siguiente, `dbUpsertRecomendacion` sobrescribe
   esa fila: `estado` vuelve a `PENDIENTE`, `accion.reciboIds` pasa a ser el
   conjunto de recibos vencidos de HOY (puede tener menos, más, o recibos
   distintos — cualquiera que se haya cobrado por otra vía deja de estar
   `PENDIENTE`/`FALLIDO` y sale del cálculo de `pagosEnRiesgo`), y
   `resuelto_por`/`resuelto_en` quedan en `NULL` — la aprobación de ayer no
   dejó ninguna huella.
3. Cuando `ejecutarRecomendacion` finalmente procesa el evento
   `DECISION_APPROVED` de ayer y hace `dbGetRecomendacion(recomendacionId)`,
   encuentra `estado: 'PENDIENTE'` (no `'APROBADA'`) y aborta sin cobrar
   nada (`lib/inngest/decision.ts:422`) — así que no se produce un cargo
   incorrecto ni duplicado (el guardia de estado sí protege el dinero en sí),
   pero la intención del propietario se pierde en silencio: no hay error
   visible, no hay entrada en el feed de actividad, y la próxima vez que
   abra el Centro de Control verá la MISMA tarjeta "recuperar pagos" como si
   nunca la hubiera aprobado — con una cifra distinta a la que aprobó ayer,
   sin explicación de por qué "ya la había aprobado".

**Alcance**: no es exclusivo de `COBRAR_RECIBOS` — afecta a cualquier
recomendación aprobada cuyo tipo tenga un `dedupeKey` estable entre pasadas
(los especialistas de agregación por estudio, como I2, son los que más
fácil lo disparan porque generan la misma clave cada día automáticamente;
uno con `dedupeKey` por socia/sesión concreta también podría chocar si esa
socia/sesión sigue generando señal al día siguiente).

**Arreglo propuesto**: en `dbUpsertRecomendacion`, cuando la fila existente
está en `APROBADA` (o, más en general, en cualquier estado que no sea
`PENDIENTE`), **no tocarla en absoluto** — la recomendación ya está en vuelo
hacia su ejecución y no debe usarse el motor de ese día para refrescarla.
Cambiar el `.in('estado', ['PENDIENTE', 'APROBADA'])` de la línea 135 por un
`.eq('estado', 'PENDIENTE')`, y dejar que una candidata con el mismo
`dedupeKey` mientras la anterior sigue `APROBADA` simplemente no se
persista ese día (se recalculará al día siguiente si para entonces ya
transicionó a `EJECUTADA`/`FALLIDA`). Alternativa más conservadora si se
quiere seguir refrescando el contenido informativo de una `APROBADA` viva:
excluir explícitamente `estado`, `resuelto_en` y `resuelto_por` del objeto
`actualizable` cuando `existente` está en `APROBADA`.

---

## Zonas revisadas sin hallazgos nuevos (para no repetir en próximas pasadas)

- **Piloto automático (`lib/decision/autonomia.ts`)**: doble guardia
  allowlist-global + allowlist-de-estudio, `COBRAR_RECIBOS` excluido de
  `TIPOS_AUTONOMIA_PERMITIDOS` de forma incondicional (no depende de config
  de servidor), tope diario acotado (`MAX_DIARIO_TOPE = 50`),
  `sanitizarConfig` descarta cualquier tipo fuera de la allowlist aunque el
  body del PUT lo pida explícitamente. Sin hallazgos.
- **`app/api/decisiones/autonomia/route.ts`, `[id]/aprobar`, `[id]/rechazar`,
  `[id]/posponer`**: los cuatro comprueban sesión + `rol === 'PROPIETARIO'`
  + `recomendacion.studioId === sesion.studioId` antes de cualquier
  escritura, y usan transición condicional (`dbTransicionarRecomendacion`/
  `dbPosponerRecomendacion`, `UPDATE ... WHERE estado = X`) para el
  "doble-clic-seguro". Sin hallazgos.
- **`cobrarReciboOffSession` (`lib/billing/stripe-cobros.ts`)**: cruce
  estudio+socia+recibo (`recibo.socio_id !== params.socioId` → 404),
  idempotencyKey Stripe anclada a recibo+intento, guard de modo Stripe
  (`comprobarModoStripe`) para no cobrar con clave equivocada. El comentario
  del propio fichero documenta un hallazgo YA CERRADO de una pasada anterior
  (recibo de A cobrado a tarjeta de B en dos callers distintos) — no
  reabierto aquí porque no toca esta ruta (Decision OS sí pasa `socioId`
  cruzado con el `recibo` que se acaba de leer para construir la
  recomendación).
- **`dbCountAutonomasHoy` (línea 708-718)**: usa límite de día en UTC en vez
  de `TZ_ESTUDIO` (patrón que este repo normalmente respeta en
  `franjaLocalDe`/`claveFranjaDe`). Revisado y descartado como hallazgo de
  severidad relevante: el dispatcher corre una única vez al día a hora fija
  (14:30 UTC) y este contador solo se lee dentro de esa misma pasada para
  aplicar el tope diario de autonomía — el corte UTC-vs-local podría, como
  mucho, desplazar unas horas cuándo se considera "hoy" para el tope de 50,
  sin ninguna consecuencia de seguridad ni de dinero (el tope es un límite
  de ritmo, no una garantía dura).
- **`lib/decision/umbral.ts` (El Umbral, Fases 1 y 2)**: las cinco puertas
  son deterministas y puras; la calibración por estudio
  (`calibrarUmbral`) usa datos reales de seguimiento con mínimo de 5
  muestras y está acotada en ambas direcciones. `UNIQUE(studio_id, fecha)`
  en `decision_mensajes_dia` refuerza en esquema el límite de un mensaje al
  día. Sin hallazgos.
- **Especialistas de contenido puro (Agenda, Equipo, Captación, Retención,
  Onboarding, Marketing)**: no mueven dinero ni ejecutan acciones fuera de
  `ENVIAR_EMAIL`/`CONTACTO_MANUAL`/`MARCAR_GESTIONADO`; revisados por
  encima para confirmar que ninguno emite `COBRAR_RECIBOS` aparte de I2. Sin
  hallazgos nuevos — no se auditó la lógica de negocio interna de cada
  regla en profundidad (ya cubierta por P2-5 y las fases del Umbral
  documentadas en `.claude/tentare-os.md`).

## Conclusión

Un hallazgo sustancial (🟠). El bug no permite un cobro incorrecto en sí
mismo — el guardia de estado en `ejecutarRecomendacion`
(`recomendacion.estado !== 'APROBADA'`) sigue protegiendo contra eso — pero
sí permite que una decisión explícita del propietario (incluida "cobra
estos recibos ya") se pierda en silencio sin que quede ningún rastro de que
existió, y que la tarjeta que ve al volver al Centro de Control cambie de
cifra sin explicación. Es el mismo patrón de fondo que otras auditorías de
este repo ya han encontrado en distintas formas ("escritura optimista sin
comprobar el resultado real", aquí invertido: una escritura *posterior* que
pisa sin comprobar el estado que se va a destruir) — pero en una zona
(Decision OS / recomendaciones de dinero) donde no constaba como hallazgo
previo.
