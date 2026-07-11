# TENTARE DECISION OS — ARQUITECTURA TÉCNICA (FASE 2)

**Versión:** 1.0 · **Fecha:** 11 julio 2026 · **Estado:** Pendiente de aprobación
**Prerrequisito:** [DECISION-OS-ANALISIS.md](DECISION-OS-ANALISIS.md) (Fase 1, aprobado)

> Documento de diseño. No hay código de producción aquí: los bloques TypeScript/SQL son **contratos** que la Fase 9 implementará literalmente.
> Alcance: arquitectura de sistema. Los internos de cada motor se detallan en Fase 3; las reglas de cada especialista, en Fase 4.

---

## 1. VISIÓN ARQUITECTÓNICA

### 1.1 Diagrama de capas

```
┌─────────────────────────────────────────────────────────────────────┐
│  PRESENTACIÓN                                                        │
│  /centro-de-control (nueva) · sidebar +1 item · resto del SaaS igual │
└────────────────────────┬────────────────────────────────────────────┘
                         │ GET /api/decisiones · POST aprobar/rechazar/analizar
┌────────────────────────▼────────────────────────────────────────────┐
│  API (route handlers)                                                │
│  auth: verificarSesionStaff + rol PROPIETARIO + tieneFeature         │
└────────────────────────┬────────────────────────────────────────────┘
                         │ lee tablas / emite eventos Inngest
┌────────────────────────▼────────────────────────────────────────────┐
│  ORQUESTACIÓN (Inngest — durable, idempotente, fan-out por tenant)   │
│  decision/studio.analyze · recommendation.approved · outcome.measure │
└────────────────────────┬────────────────────────────────────────────┘
                         │ snapshot in → recomendaciones out
┌────────────────────────▼────────────────────────────────────────────┐
│  NÚCLEO lib/decision/ — TypeScript PURO (sin React, sin Supabase,    │
│  sin red). Determinista y testeable con node:test.                   │
│  señales → especialistas → memoria → confianza → prioridad → director│
└────────────────────────┬────────────────────────────────────────────┘
                         │ puertos (interfaces)
┌────────────────────────▼────────────────────────────────────────────┐
│  ADAPTADORES                                                         │
│  snapshot (fetchAllStudioData) · db.ts (4 tablas nuevas) ·           │
│  redaccion.ts (Anthropic, fallo suave) · ejecutores (Resend/Stripe)  │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Principios (heredados del código que ya funciona)

1. **Núcleo puro.** Como `automation-engine.ts` y `verifactu.ts`: funciones deterministas `(datos, now) → resultado`, testeadas con `node:test`. Todo efecto (DB, email, IA, Stripe) vive fuera, en adaptadores.
2. **La IA nunca calcula; solo redacta.** Números, fechas e importes salen del motor con fórmula declarada. Patrón `redactarConIA` con fallback: si Anthropic cae, el producto sigue.
3. **Doble vía, un solo motor.** Cron e "Ejecutar ahora" comparten el mismo pipeline (lección aprendida de automatizaciones).
4. **Idempotencia end-to-end.** IDs deterministas + `dedupe_key` + Idempotency-Key en efectos externos. Un replay de Inngest jamás duplica una recomendación ni reenvía un email.
5. **Aislamiento por tenant.** Fan-out un-evento-por-estudio con `concurrency`; un estudio que falla no arrastra a los demás.
6. **Additive-only.** Ninguna tabla existente se altera; ningún motor existente cambia de comportamiento. Lista exhaustiva de puntos de contacto en §12.

---

## 2. ESTRUCTURA DE MÓDULOS

```
lib/decision/
├── tipos.ts               · Todos los contratos de dominio (§3). Cero imports externos.
├── snapshot.ts            · Tipo SnapshotEstudio + adaptador desde fetchAllStudioData
│                            (única frontera con supabase-data; acota ventana temporal)
├── senales.ts             · Hechos derivados: díasSinVenir(), ocupaciónPorFranja(),
│                            renovaciónPróxima(), pagoEnRiesgo()… puras, compartibles
├── especialistas/
│   ├── contrato.ts        · interface Especialista + registro ESPECIALISTAS[]
│   ├── retencion.ts       · MVP (Fase 4 define reglas)
│   ├── ingresos.ts        · MVP
│   └── (finanzas|agenda|marketing|equipo).ts  · fases 2-3 del roadmap
├── memoria.ts             · Memory Engine: aplica memoria_socio (veto/ajuste/canal)
├── confianza.ts           · Confidence Engine: nivel + evidencia + autonomía máxima
├── prioridad.ts           · Priority Engine: score interno → CRITICA/ALTA/MEDIA/BAJA,
│                            corte ≤3 críticas (regla Bible)
├── director.ts            · Estado general + resumen ejecutivo + "mientras dormías"
├── outcomes.ts            · Reglas de medición diferida (¿reservó/pagó/renovó?)
├── redaccion.ts           · ADAPTADOR IA: prompts por especialista, JSON estricto,
│                            fallback al texto del motor. Único archivo que toca Anthropic.
├── db.ts                  · ADAPTADOR DB: mappers Row↔dominio + dbInsert/dbUpdate de las
│                            4 tablas nuevas (server-only; NO engorda supabase-data.ts)
└── *.test.ts              · Tests unitarios del núcleo (patrón npm test existente)

lib/inngest/decision.ts    · Las 4 funciones Inngest (§6)
app/api/decisiones/…       · Route handlers (§7)
app/(dashboard)/centro-de-control/page.tsx + components/decision/*  · UI (§9, Fase 5)
```

**Regla de dependencias** (válida también para fases futuras): `especialistas/ → senales.ts → tipos.ts`. Nada en `lib/decision/` (salvo los adaptadores `snapshot|redaccion|db`) importa fuera del directorio. Los adaptadores nunca son importados por el núcleo — solo por Inngest y las rutas.

---

## 3. CONTRATOS DE DOMINIO (`lib/decision/tipos.ts`)

> **Enmendado por [DECISION-OS-MODELO-DATOS.md](DECISION-OS-MODELO-DATOS.md) §2.1** (Documento 9): `Recomendacion` gana `algorithmVersion`, `decisionSessionId`, `vistaEn`. Ese documento define también 2 entidades nuevas (`FeatureFlag`, `DecisionSession`) y aclara por qué `Priority`/`Confidence`/`Action` siguen siendo value objects embebidos, no tablas propias.

```ts
// ── Identidad de especialistas ───────────────────────────────────────────────
export type EspecialistaId =
  | 'RETENCION' | 'INGRESOS' | 'AGENDA' | 'MARKETING' | 'FINANZAS' | 'EQUIPO';
// El Director no es un especialista: es la síntesis. No genera candidatas.

// ── Catálogo cerrado de tipos de recomendación (crece por fase) ─────────────
export type TipoRecomendacion =
  // Retención (MVP)
  | 'RECUPERAR_SOCIA'            // contacto personal: llamada o WhatsApp manual
  | 'ENVIAR_REACTIVACION'        // email automático con oferta (aprobación previa)
  | 'CONGELAR_MEMBRESIA'         // proponer pausa antes de que cancele
  // Ingresos (MVP)
  | 'ABRIR_SESION'               // franja llena N semanas + lista de espera
  | 'RECUPERAR_PAGOS'            // lote de recibos con tarjeta guardada
  // Fase 2+ — CATÁLOGO ÚNICO: todo tipo nuevo de cualquier fase se añade AQUÍ:
  // COBRAR_PENDIENTE · PROPONER_RENOVACION_BONO · REVISAR_PRECIO · MOVER_HORARIO
  // · FUSIONAR_SESIONES · PREPARAR_CAMPANA …
  ;

export type NivelAutonomia = 0 | 1 | 2 | 3;          // Bible doc 2 §13
export type NivelConfianza = 'ALTA' | 'MEDIA' | 'BAJA'; // calibrable a % (análisis §12.2);
// por debajo del suelo de emisión (nivel interno NULA) la candidata no se emite.
export type Prioridad = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
export type EstadoEspecialista = 'EXCELENTE' | 'BUENO' | 'ATENCION' | 'CRITICO'; // badges doc 5 §13
export type Riesgo = 'PERDIDA' | 'OPORTUNIDAD'; // PERDIDA = dinero/socia en juego

export interface Impacto {
  valor: number;
  unidad: 'EUR_MES' | 'EUR' | 'PCT_OCUPACION';
  formula: string;   // legible: "cuota mensual de la socia (89€/mes)" — trazabilidad
}

export interface Confianza {
  nivel: NivelConfianza;
  evidencia: string[];      // ["21 días sin venir", "renovación en 5 días", ...]
  autonomiaMaxima: NivelAutonomia; // ALTA→2, MEDIA→1, BAJA→0 (MVP nunca emite 3)
}

// ── Lo que produce un especialista (aún sin priorizar ni redactar) ───────────
export interface Candidata {
  especialista: EspecialistaId;
  tipo: TipoRecomendacion;
  dedupeKey: string;              // p.ej. "RETENCION:RECUPERAR_SOCIA:socio-abc"
  tituloMotor: string;            // texto del motor — SIEMPRE válido sin IA
  motivoMotor: string;
  datosUsados: Record<string, string | number | boolean>; // hechos exactos
  riesgo: Riesgo;                 // gate de CRITICA en el Priority Engine
  impacto?: Impacto;              // opcional: sin € honesto compite solo por urgencia
  confianza: Confianza;
  accion: AccionDecision;
  socioId?: string; sesionId?: string; reciboId?: string;
  tiempoEstimadoMin: number;
  expiraEnDias: number;           // por tipo; el pipeline lo vuelve fecha
  urgencia: number;               // 0..1, entrada del Priority Engine (Fase 3)
  esfuerzo: number;               // 0..1
}

// ── Acción ejecutable al aprobar (payload cerrado por tipo) ─────────────────
export type AccionDecision =
  | { tipo: 'CONTACTO_MANUAL'; canal: 'LLAMADA' | 'WHATSAPP'; textoSugerido: string }
  | { tipo: 'ENVIAR_EMAIL'; plantilla: 'REACTIVACION' | 'RECORDATORIO_PAGO' | 'RENOVACION_BONO'; descuentoPct?: number }
  | { tipo: 'COBRAR_RECIBOS'; reciboIds: string[] }        // reutiliza off-session actual
  | { tipo: 'MARCAR_GESTIONADO' };                          // insights sin efecto (nivel 0)

// ── Recomendación persistida (fila de la tabla `recomendaciones`) ───────────
export interface Recomendacion extends Omit<Candidata, 'expiraEnDias' | 'urgencia' | 'esfuerzo'> {
  id: string; studioId: string;
  titulo: string; motivo: string;   // redacción final (IA o motor)
  score: number;                    // interno; JAMÁS se muestra
  prioridad: Prioridad;
  nivelAutonomia: NivelAutonomia;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'EXPIRADA' | 'EJECUTADA' | 'FALLIDA';
  expiraEn: string; creadoEn: string;
  resueltoEn: string | null; resueltoPor: string | null;
}

// ── Contrato de especialista ─────────────────────────────────────────────────
export interface Especialista {
  id: EspecialistaId;
  pregunta: string;                                  // la única que responde (Bible)
  detectar(s: SnapshotEstudio, m: MemoriaEstudio, now: Date): Candidata[];
}

// ── Memoria ──────────────────────────────────────────────────────────────────
export type ClaveMemoria =
  | 'NO_CONTACTAR_HASTA' | 'PREFIERE_WHATSAPP' | 'PREFIERE_EMAIL' | 'PREFIERE_LLAMADA'
  | 'NUNCA_RESPONDE_EMAIL' | 'NO_OFRECER_DESCUENTOS';
// (sin NOTA_LIBRE: el texto libre ya vive en notas_internas; UNIQUE(studio,socio,clave) exige catálogo cerrado)
export interface HechoMemoria {
  id: string; studioId: string; socioId: string;
  clave: ClaveMemoria; valor: Record<string, string | number | boolean>;
  origen: 'REGLA' | 'FEEDBACK' | 'MANUAL'; evidencia: string; activa: boolean;
}
export type MemoriaEstudio = Map<string /*socioId*/, HechoMemoria[]>;

// ── Salida del Director (fila de `resumen_diario`) ──────────────────────────
export interface ResumenDiario {
  studioId: string; fecha: string;                   // unique(studio_id, fecha)
  estadoGeneral: 'EXCELENTE' | 'ATENCION' | 'ACCION_INMEDIATA';
  saludo: string;                                    // tono mockup, redactado (fallback motor)
  mientrasDormias: { icono: string; texto: string; verificadoPor: string }[]; // solo hechos de logs
  nDecisiones: number; tiempoEstimadoMin: number;
  impactoTotal: Impacto | null; generadoEn: string;
}

// ── Outcome (fila de `recomendacion_outcomes`) ──────────────────────────────
export interface Outcome {
  id: string; studioId: string; recomendacionId: string;
  evento: 'APROBADA' | 'RECHAZADA' | 'IGNORADA' | 'EJECUTADA';
  outcome: 'POSITIVO' | 'NEGATIVO' | 'NEUTRO' | 'PENDIENTE';
  senalObservada: 'RESERVO' | 'PAGO' | 'RENOVO' | 'CANCELO' | 'SIN_RESPUESTA' | null;
  ventanaDias: number; medidoEn: string | null;
}
```

**`SnapshotEstudio`** (en `snapshot.ts`): subconjunto tipado de `fetchAllStudioData` — `socios, reservas (ventana 180d), sesiones (±90d), salas, recibos (180d), suscripciones, planesTarifa, tiposClase, instructores, automationLogs (90d), campanas`. Además del snapshot, el pipeline pasa al núcleo las recomendaciones `pendientes` y las `resueltas90d` (para dedupe, cooldowns y memoria-FEEDBACK) y los `outcomes` históricos. El adaptador acota ventanas al construirlo (mitiga la deuda de fetch ilimitado sin tocar el fetcher, análisis §10.3).

---

## 4. MODELO DE DATOS — MIGRACIÓN `0003_decision_os.sql`

> **Enmendado por [DECISION-OS-MODELO-DATOS.md](DECISION-OS-MODELO-DATOS.md) §4** (Documento 9): añade `algorithm_version`/`decision_session_id`/`vista_en` a `recomendaciones`, `nivel`/`confianza`/`creado_por`/`expira_en` a `memoria_socio`, y dos tablas nuevas (`decision_sessions`, `decision_feature_flags`). La migración de esa sección es la definitiva; la de aquí queda como base histórica.

Convenciones idénticas al esquema actual: IDs `text` (generados con `uid()` en app), `studio_id text NOT NULL`, timestamps `timestamptz DEFAULT now()`, CHECKs para enums, RLS con `current_studio_id()`/`current_rol()`.

```sql
CREATE TABLE public.recomendaciones (
    id text PRIMARY KEY,
    studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    especialista text NOT NULL CHECK (especialista IN
      ('RETENCION','INGRESOS','AGENDA','MARKETING','FINANZAS','EQUIPO')),
    tipo text NOT NULL,
    dedupe_key text NOT NULL,
    titulo text NOT NULL,
    motivo text NOT NULL,
    datos_usados jsonb NOT NULL DEFAULT '{}',
    riesgo text NOT NULL DEFAULT 'OPORTUNIDAD' CHECK (riesgo IN ('PERDIDA','OPORTUNIDAD')),
    impacto jsonb,                       -- {valor, unidad, formula} — NULL si no hay € honesto
    confianza jsonb NOT NULL,            -- {nivel, evidencia[], autonomiaMaxima}
    score numeric NOT NULL DEFAULT 0,
    prioridad text NOT NULL CHECK (prioridad IN ('CRITICA','ALTA','MEDIA','BAJA')),
    nivel_autonomia smallint NOT NULL DEFAULT 1 CHECK (nivel_autonomia BETWEEN 0 AND 3),
    accion jsonb NOT NULL,               -- AccionDecision serializada
    socio_id text REFERENCES public.socios(id) ON DELETE CASCADE,
    sesion_id text, recibo_id text,
    tiempo_estimado_min integer NOT NULL DEFAULT 2,
    estado text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN
      ('PENDIENTE','APROBADA','RECHAZADA','EXPIRADA','EJECUTADA','FALLIDA')),
    expira_en timestamptz NOT NULL,
    creado_en timestamptz DEFAULT now(),
    resuelto_en timestamptz, resuelto_por text
);
-- Un mismo hecho no genera dos recomendaciones vivas. El índice es parcial:
-- una vez resuelta (rechazada/expirada), el motor puede volver a proponer
-- pasado el cooldown del tipo (lo decide el engine, no la DB).
CREATE UNIQUE INDEX recomendaciones_dedupe_viva
  ON public.recomendaciones (studio_id, dedupe_key)
  WHERE estado IN ('PENDIENTE','APROBADA');
CREATE INDEX recomendaciones_home
  ON public.recomendaciones (studio_id, estado, prioridad, creado_en DESC);

CREATE TABLE public.recomendacion_outcomes (
    id text PRIMARY KEY,
    studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    recomendacion_id text NOT NULL REFERENCES public.recomendaciones(id) ON DELETE CASCADE,
    evento text NOT NULL CHECK (evento IN ('APROBADA','RECHAZADA','IGNORADA','EJECUTADA')),
    outcome text NOT NULL DEFAULT 'PENDIENTE' CHECK (outcome IN
      ('POSITIVO','NEGATIVO','NEUTRO','PENDIENTE')),
    senal_observada text CHECK (senal_observada IN
      ('RESERVO','PAGO','RENOVO','CANCELO','SIN_RESPUESTA')),
    ventana_dias integer NOT NULL DEFAULT 14,
    medido_en timestamptz,
    creado_en timestamptz DEFAULT now()
);
CREATE INDEX outcomes_calibracion
  ON public.recomendacion_outcomes (studio_id, recomendacion_id);

CREATE TABLE public.memoria_socio (
    id text PRIMARY KEY,
    studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    socio_id text NOT NULL REFERENCES public.socios(id) ON DELETE CASCADE,
    clave text NOT NULL,
    valor jsonb NOT NULL DEFAULT '{}',
    origen text NOT NULL CHECK (origen IN ('REGLA','FEEDBACK','MANUAL')),
    evidencia text NOT NULL DEFAULT '',
    activa boolean NOT NULL DEFAULT true,
    creado_en timestamptz DEFAULT now(),
    actualizado_en timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX memoria_socio_clave ON public.memoria_socio (studio_id, socio_id, clave);

CREATE TABLE public.resumen_diario (
    id text PRIMARY KEY,
    studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    fecha date NOT NULL,
    estado_general text NOT NULL CHECK (estado_general IN
      ('EXCELENTE','ATENCION','ACCION_INMEDIATA')),
    saludo text NOT NULL,
    mientras_dormias jsonb NOT NULL DEFAULT '[]',
    n_decisiones integer NOT NULL DEFAULT 0,
    tiempo_estimado_min integer NOT NULL DEFAULT 0,
    impacto_total jsonb,
    generado_en timestamptz DEFAULT now(),
    UNIQUE (studio_id, fecha)   -- upsert: cada análisis del día lo refresca
);

-- RLS: mismas políticas que automation_* (solo PROPIETARIO del estudio).
ALTER TABLE public.recomendaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recomendacion_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memoria_socio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumen_diario ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_recomendaciones ON public.recomendaciones TO authenticated
  USING (current_rol() = 'PROPIETARIO' AND studio_id = current_studio_id())
  WITH CHECK (current_rol() = 'PROPIETARIO' AND studio_id = current_studio_id());
-- (idéntica para las otras tres tablas)
```

Los pipelines de servidor (Inngest/rutas) escriben con el cliente admin (service role), igual que el cron actual — la RLS protege el acceso desde el navegador.

---

## 5. PUERTOS Y REPOSITORIOS

Sin framework nuevo — dos adaptadores finos al estilo de la casa:

- **Lectura (snapshot):** `construirSnapshot(studioId): Promise<SnapshotEstudio>` en `snapshot.ts`. Internamente llama a `fetchAllStudioData` (reutilización total de mappers) y recorta ventanas. El núcleo solo conoce el tipo `SnapshotEstudio` — si mañana se optimiza con queries acotadas en SQL, el núcleo ni se entera.
- **Escritura (`lib/decision/db.ts`):** `dbUpsertRecomendaciones(batch)`, `dbResolverRecomendacion(id, estado, por)`, `dbUpsertResumenDiario(r)`, `dbInsertOutcome(o)`, `dbUpdateOutcome(id, patch)`, `dbListMemoria(studioId)`, `dbUpsertMemoria(hecho)` + fetchers para la API (`dbGetDecisionesHome(studioId)`). Mappers Row↔dominio en el mismo archivo (convención `mapXxx` existente). **`supabase-data.ts` no crece.**

---

## 6. PIPELINE INNGEST (`lib/inngest/decision.ts`)

Nuevos eventos en `EVENTS` (`lib/inngest/client.ts`, cambio additivo):

```ts
DECISION_ANALYZE:  'decision/studio.analyze',
DECISION_APPROVED: 'decision/recommendation.approved',
DECISION_MEASURE:  'decision/outcome.measure',
```

### F1 · `decisionDispatcher` — cron `30 6,14 * * *` (2×/día)
Clon de `automatizacionesDispatcher`: lista estudios **con feature `decisiones` activa** (filtra por plan+subscription_status en la query) y hace `step.sendEvent` fan-out de `decision/studio.analyze`. Horarios desplazados del cron de automatizaciones (07:00) para no solapar concurrencia del plan free.

### F2 · `analizarEstudio` — trigger `decision/studio.analyze`, `concurrency:{limit:3}`, `retries:3`
```
step 'snapshot'    → construirSnapshot(studioId) + dbListMemoria + pendientes actuales
(en memoria, puro) → señales → especialistas MVP → memoria (vetos) → confianza
                     → prioridad (score, corte) → director (borrador resumen)
step 'redactar'    → redaccion.ts: lote ÚNICO a Haiku con las ≤N visibles
                     (fallback: textos del motor). Cacheado por dedupe_key:
                     si la pendiente ya existía con mismos datos_usados, no re-redacta.
step 'persistir'   → dbUpsertRecomendaciones (upsert por dedupe viva: refresca
                     datos/score de las existentes, inserta nuevas, expira las que
                     el motor ya no detecta) — determinista, replay-safe
step 'resumen'     → dbUpsertResumenDiario (upsert studio+fecha)
step 'expirar'     → PENDIENTE con expira_en vencido → EXPIRADA (evento IGNORADA, outcome NEUTRO)
```
IDs deterministas: `rec-{studioId}-{hash(dedupeKey)}-{fecha}` — mismo patrón `logIdCandidato`.

### F3 · `ejecutarRecomendacion` — trigger `decision/recommendation.approved`, `retries:3`
Por `accion.tipo`:
- `ENVIAR_EMAIL` → render react-email + Resend con `idempotencyKey = recomendacionId` (infra actual).
- `COBRAR_RECIBOS` → un `step.run` por recibo → `cobrarReciboOffSession()` — lógica **extraída** de `app/api/stripe/charge-off-session/route.ts` a `lib/stripe-cobros.ts` (refactor quirúrgico declarado en §12: la ruta pasa a consumir la misma función, semántica idéntica) con `idempotencyKey` de Stripe determinista (`{recomendacionId}-{reciboId}`): un replay de Inngest jamás cobra dos veces.
- `CONTACTO_MANUAL` / `MARCAR_GESTIONADO` → sin efecto externo; estado → EJECUTADA directamente.
Al terminar: estado → `EJECUTADA` (o `FALLIDA` con detalle) + `step.sendEvent(DECISION_MEASURE, {ventanaDias})`.

### F4 · `medirOutcome` — trigger `decision/outcome.measure`
`step.sleepUntil(ejecutadoEn + ventanaDias)` → consulta señal observable (¿reserva ASISTIDA posterior? ¿recibo COBRADO? ¿suscripción renovada/cancelada?) → `dbUpdateOutcome` POSITIVO/NEGATIVO/NEUTRO. Ventanas por tipo: `RECUPERAR_PAGOS` 3d · contacto/reactivación/congelación 14d · `ABRIR_SESION` 21d. Este es el dato que calibrará los porcentajes de confianza (análisis §12.2).

**Fase 2 (reactivo):** el webhook Stripe (pago fallido) y la RPC de cancelación emiten `decision/studio.analyze` con `{motivo:'REACTIVO'}`; Inngest debounce por studioId (10 min) evita tormentas. Cero cambios en MVP.

---

## 7. CONTRATOS DE API

Todas: `verificarSesionStaff` → rol `PROPIETARIO` → `tieneFeature(studio,'decisiones')` → 403 si falla.

**`GET /api/decisiones`** → `200`
```json
{
  "resumen": { /* ResumenDiario | null (null → empty state de onboarding) */ },
  "prioridades": [ /* ≤3 Recomendacion CRITICA/ALTA, orden score desc */ ],
  "porEspecialista": [
    { "especialista": "RETENCION", "pendientes": 4, "impactoTotal": {"valor":320,"unidad":"EUR_MES"}, "estado": "BUENO" }
  ],
  "actividad": [ /* ≤10 items de actividad_reciente relevante (tipos filtrados) */ ]
}
```

**`POST /api/decisiones/[id]/aprobar`** → valida `estado==='PENDIENTE'` y no expirada (409 si no) → estado `APROBADA` + outcome `APROBADA` + `inngest.send(DECISION_APPROVED)` → `200 {estado:'APROBADA'}`. Doble clic seguro: la transición de estado es condicional en SQL (`WHERE estado='PENDIENTE'`).

**`POST /api/decisiones/[id]/rechazar`** body `{motivo?: string}` → estado `RECHAZADA` + outcome `RECHAZADA` (el motivo alimenta memoria/aprendizaje en fases futuras).

**`POST /api/decisiones/analizar`** → `inngest.send(DECISION_ANALYZE, {studioId, motivo:'MANUAL'})` → `202`. Rate-limit sencillo: rechaza si hay un análisis del estudio en curso <5 min (misma semántica que "Ejecutar ahora" actual).

---

## 8. FLUJO END-TO-END (secuencia MVP)

```
06:30  cron → dispatcher → analyze(estudio) ── snapshot → núcleo puro → redacta → persiste
08:1x  Marco abre / → redirect Centro de Control → GET /api/decisiones (lee tablas: <1s)
       "Buenos días, Marco. Solo hay 2 cosas en las que quiero tu opinión."
08:1x  Aprueba "Recuperar pagos (180€)" → POST aprobar → F3 cobra off-session
       → EJECUTADA → F4 programado T+3d
08:1x  Rechaza "Enviar reactivación a Ana" → RECHAZADA (señal de aprendizaje)
14:30  Segundo análisis: refresca pendientes, expira obsoletas, actualiza resumen
T+3d   F4 mide: recibos COBRADOS → outcome POSITIVO  ← el sistema aprende
```

---

## 9. ARQUITECTURA FRONTEND (contrato para Fase 5)

- **Ruta:** `app/(dashboard)/centro-de-control/page.tsx` + componentes en `components/decision/`. **No consume `studio-context`** para sus datos (análisis §10.4): hook propio `useDecisiones()` → `GET /api/decisiones` + revalidación al aprobar/rechazar (optimista, con rollback).
- **Home:** `app/(dashboard)/page.tsx` pasa de `redirect('/dashboard')` a: propietario + feature `decisiones` → `/centro-de-control`; resto → `/dashboard` (intacto). Un cambio de ~5 líneas, reversible.
- **Sidebar:** +1 item `{href:'/centro-de-control', label:'Centro de Control', icon:Compass}` al inicio de `navSections` + entrada en `ESSENTIAL_HREFS` + `bottomNavItems` (móvil). `permisos.ts`: visible solo PROPIETARIO.
- **Componentes:** todos sobre primitivos existentes (Card, Badge, Button, Dialog, skeletons). Los únicos compuestos nuevos: `RecommendationCard` (plantilla única de la Bible: recomendación→motivo→impacto→confianza→tiempo→acción) y `SpecialistCard`. Tokens actuales; cero CSS nuevo global.
- **Empty state** (sin datos suficientes / primer día): mensaje honesto + acciones sugeridas (crear clase, importar socias) — patrón Bible doc 5 §20.

---

## 10. SEGURIDAD

- RLS owner-only en las 4 tablas (idéntica a `automation_*`).
- Rutas: sesión staff + rol + feature, todo en servidor. El `id` de recomendación siempre se filtra además por `studio_id` de la sesión (defensa en profundidad, patrón actual).
- Acciones ejecutables = catálogo cerrado `AccionDecision` validado en servidor — imposible inyectar una acción arbitraria vía API.
- Sin datos nuevos sensibles: todo deriva de tablas ya existentes del mismo tenant. La IA recibe solo los `datos_usados` mínimos (nombre de pila, cifras), como hoy.

## 11. RENDIMIENTO, ESCALA Y COSTE

- **Home <1s:** lee tablas materializadas; nunca ejecuta el pipeline on-demand (análisis §12.6).
- **Análisis:** núcleo puro O(snapshot) con índices Map (patrón P0-19 ya aplicado); coste dominado por el fetch. Ventanas acotadas en snapshot.
- **IA:** 1 llamada por análisis (lote de ≤10 redacciones + saludo del Director), Haiku, ~2k tokens → coste marginal/estudio/día de céntimos. Cache por `dedupe_key` evita re-redactar pendientes sin cambios.
- **Inngest free:** el límite de cuenta (5 concurrentes) es **compartido** con automatizaciones; `concurrency 3` + horarios desplazados reducen el solape pero no lo eliminan — si coinciden, Inngest encola sin perder trabajos (más lento, nunca roto). Al escalar: subir plan, no rediseñar.
- **Presupuesto de latencia F2:** snapshot ≤5s (hoy el cron ya lo paga), núcleo <100ms, redacción ≤6s, persistencia ≤2s.

## 12. PUNTOS DE CONTACTO CON CÓDIGO EXISTENTE (lista exhaustiva)

| Archivo | Cambio | Riesgo |
|---|---|---|
| `lib/inngest/client.ts` | +3 constantes en `EVENTS` | Nulo |
| `app/api/inngest/route.ts` | Registrar 4 funciones nuevas en el serve | Nulo |
| `lib/entitlements.ts` | +feature `decisiones` (BASE:false, ESTUDIO:true, CADENA:true) | Nulo (additivo) |
| `components/layout/sidebar.tsx` | +1 item en `navSections`, `ESSENTIAL_HREFS`, `bottomNavItems` | Bajo |
| `lib/permisos.ts` | `/centro-de-control` solo PROPIETARIO | Bajo |
| `app/(dashboard)/page.tsx` | Redirect condicional (fallback `/dashboard`) | Bajo, reversible |
| `app/api/stripe/charge-off-session/route.ts` | Extraer la lógica de cobro a `lib/stripe-cobros.ts` (la ruta la consume, semántica idéntica) + Idempotency-Key Stripe — el único refactor del proyecto, quirúrgico | Bajo (cubierto por tests + verify) |

**Todo lo demás es archivo nuevo.** Ningún motor, tabla, página o componente existente cambia de comportamiento.

## 13. TESTING Y OBSERVABILIDAD

- **Unit (npm test):** núcleo completo — especialistas con snapshots sintéticos, prioridad (corte ≤3, orden estable), confianza (mapeo evidencia→nivel→autonomía), memoria (vetos), director (estados), dedupe/cooldown, outcomes. Mismo patrón que `automation-engine.test.ts` / `verifactu.test.ts` (107 tests actuales siguen intactos).
- **Contrato:** fixtures de `AccionDecision` ↔ validador de la ruta aprobar.
- **E2E (Playwright, existente):** flujo Centro de Control → aprobar → estado cambia.
- **Sentry:** ya envuelve Inngest y rutas (P0-38); los errores del pipeline llegan solos. Métrica de negocio: los KPIs de especialistas (Bible) = queries sobre `recomendaciones` + `recomendacion_outcomes` — sin infra nueva.

---

## DECISIONES QUE FIJARÁ LA FASE 3 (no bloquean esta aprobación)

1. Fórmula exacta de `score` y pesos (impacto€ normalizado × urgencia × confianza ÷ esfuerzo) + reglas de corte por prioridad.
2. Mapeo evidencia→nivel de confianza por tipo de recomendación (tabla de criterios).
3. Cooldowns por tipo (¿cuánto espera el motor antes de re-proponer algo rechazado?).
4. Prompts de redacción por especialista (tono mockup) + saludo del Director.

**Siguiente paso (Fase 3):** diseño interno de los motores — Decision→Priority→Confidence→Memory→Automation, con sus algoritmos, tablas de criterios y casos borde.
