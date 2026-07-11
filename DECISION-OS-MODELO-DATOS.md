# TENTARE DECISION OS — MODELO DE DATOS COMPLETO (DOCUMENTO 9)

**Versión:** 1.0 · **Fecha:** 11 julio 2026 · **Estado:** Pendiente de aprobación
**Prerrequisitos:** Fases 1–4, 7 y 8 aprobadas (revisión adversarial pasada). Este documento **enmienda** puntualmente Arquitectura §3/§4 y Núcleo §5.3 — no las contradice, las completa.
**Origen:** revisión externa (nivel Staff/CTO) sobre los 6 documentos previos. Este es el documento único que define las 13 entidades del núcleo, su ciclo de vida y sus reglas — el corazón del sistema antes de programarlo.

> Convención: 🆕 = entidad nueva no presente en documentos 1-8 · ✏️ = entidad existente, enriquecida aquí · ⚪ = valor embebido, deliberadamente NO es una entidad propia (con motivo).

---

## 0. FASE 0 — PRODUCT VALIDATION GATE

Antes de Fase A (núcleo puro), gate de datos: ¿tenemos lo que cada especialista MVP necesita? Formaliza y cierra lo que Análisis §4-5 dejó disperso.

### 0.1 Contrato de datos — Retención (MVP)

| Campo | Obligatorio/Opcional | ¿Existe? | Tabla.columna |
|---|---|---|---|
| Asistencia (fecha última) | Obligatorio | ✅ | `reservas.estado='ASISTIDA'` + `creado_en` |
| Cancelaciones | Obligatorio | ✅ | `reservas.estado='CANCELADA'` |
| Frecuencia histórica | Obligatorio | ✅ (derivado) | `reservas` agregada por socia |
| Renovación (fecha fin) | Obligatorio | ✅ | `suscripciones.fecha_fin` |
| Antigüedad | Obligatorio | ✅ | `socios.fecha_alta` |
| Pagos (para R2 tarjeta) | Obligatorio | ✅ | `socios.stripe_payment_method_id` |
| Contacto previo (dedupe) | Obligatorio | ✅ | `automation_logs` |
| Vacaciones declaradas | Opcional | ❌ **falta** | — |
| Lesiones | Opcional | ❌ **falta** | — |
| Conversaciones (WhatsApp/email) | Opcional | ❌ **falta** (infra, Análisis §5.2) | — |
| Notas del profesor | Opcional | 🟡 parcial | `notas_internas` (texto libre, no estructurado) |
| Profesor/clase favorita | Opcional | ✅ | `preferencias_socio` |
| Histórico estacional (>12 meses) | Opcional (bloquea solo R5) | ❌ **falta** (ventana snapshot 180d) | ver Núcleo §1, Especialistas R5 |

**Veredicto: 7/7 obligatorios cubiertos → Retención R1-R4 tiene luz verde para Fase A.** R5 (estacional) queda bloqueada por dato faltante — correctamente diferida a Fase E, no falsa promesa.

### 0.2 Contrato de datos — Ingresos (MVP)

| Campo | Obligatorio/Opcional | ¿Existe? | Tabla.columna |
|---|---|---|---|
| Ocupación por franja | Obligatorio | ✅ | `sesiones` + `reservas` |
| Lista de espera | Obligatorio | ✅ | `reservas.estado='LISTA_ESPERA'` + `posicion_espera` |
| Recibos pendientes | Obligatorio | ✅ | `recibos.estado='PENDIENTE'` |
| Tarjeta guardada | Obligatorio | ✅ | `socios.stripe_payment_method_id` |
| Precio/plan | Obligatorio | ✅ | `planes_tarifa` |
| Salas (aforo físico) | Obligatorio (I1) | ✅ | `salas` — **ya corregido en Arquitectura §3 tras revisión adversarial (M5)** |
| Festivos | Opcional (F2 Agenda) | ❌ **falta** | — |

**Veredicto: 6/6 obligatorios cubiertos → Ingresos I1-I2 tiene luz verde.**

### 0.3 Regla de la Fase 0 (aplica a toda fase futura)

Ningún especialista entra en el roadmap de implementación sin pasar esta tabla primero. Un especialista con <100% de obligatorios cubiertos no se activa — se documenta como bloqueado y se lista el dato que falta (patrón ya usado arriba con R5). **Esto es un gate, no un trámite**: Finanzas/Agenda/Marketing/Equipo (Fase E-F) deben rellenar su propia tabla antes de recibir una sola línea de código.

---

## 1. PRINCIPIO DEL MODELO: QUÉ SE PERSISTE Y QUÉ SE DERIVA

Antes del catálogo, la regla que decide si algo es una tabla o una función:

> **Se persiste** lo que constituye un hecho de negocio con valor propio en el tiempo (una recomendación, un resultado, un hecho de memoria). **Se deriva** lo que es 100% recomputable a partir de datos ya persistidos (una señal, una prioridad, un nivel de confianza) — persistirlo sería una copia que puede desincronizarse de su fuente, sin ganar nada.

Esto descarta de entrada la reificación de `Priority` y `Confidence` como tablas propias (siguen siendo valores embebidos, Núcleo §5/§7) y decide que `Signal` es un catálogo de código, no una tabla (§2.4). Es la misma disciplina que ya rechazó el "91% inventado" en Análisis §12.2 — no persistir lo que no se puede fundamentar.

---

## 2. CATÁLOGO DE LAS 13 ENTIDADES

### 2.1 Recommendation ✏️ (`recomendaciones`)

La entidad central. Sobre el diseño de Arquitectura §3/§4, se añaden 3 campos:

```ts
interface Recomendacion {
  // ... todo lo ya definido en Arquitectura §3 ...
  algorithmVersion: string;        // 🆕 "1.0.0" — versión de lib/decision en el momento del cálculo
  decisionSessionId: string;       // 🆕 FK a DecisionSession — qué ejecución la produjo
  vistaEn: string | null;          // 🆕 primera vez que el frontend la mostró (analítica, no bloqueante)
}
```

**Ciclo de vida unificado** — ver §3 (reconcilia el propuesto por la revisión con el ya aprobado en Núcleo §6, sin duplicar estado).

**Reglas de negocio (invariantes, verificadas por test):**
- `dedupeKey` único por `(studio_id, estado ∈ {PENDIENTE,APROBADA})` — Arquitectura §4, sin cambios.
- `algorithmVersion` es inmutable tras creación — una recomendación nunca "cambia de versión" a mitad de vida.
- Una candidata que no supera el suelo de confianza (Núcleo §5.1) **nunca genera fila** — no existe estado "rechazada por el sistema", eso se cuenta en `DecisionSession.nCandidatasDescartadas`.

### 2.2 Outcome (`recomendacion_outcomes`) — sin cambios sobre Arquitectura §4/Núcleo. Se referencia aquí por completitud del catálogo; ver ahí para el detalle.

### 2.3 Memory / HechoMemoria ✏️ (`memoria_socio`)

```ts
interface HechoMemoria {
  // ... campos ya definidos en Arquitectura §3 ...
  nivel: 'CORTO' | 'MEDIO' | 'LARGO';   // 🆕
  expiraEn: string | null;               // 🆕 null = LARGO (no caduca solo)
  confianza: NivelConfianza;             // 🆕 reutiliza el tipo existente — qué tan seguro está el hecho
  creadoPor: string | null;              // 🆕 id de usuario si origen=MANUAL; null si REGLA/FEEDBACK
}
```

**Los tres niveles y su expiración por defecto** (asignada por `clave`, no elegida libremente — evita inconsistencia):

| Nivel | Ventana | Claves que caen aquí | Racional |
|---|---|---|---|
| **CORTO** | 7 días | `NO_CONTACTAR_HASTA` cuando el motivo es táctico (p. ej. "acaba de recibir una llamada, dale una semana") | Vetos tácticos de corta vida — si no se renuevan, caducan solos |
| **MEDIO** | 90 días | `PREFIERE_WHATSAPP`, `PREFIERE_EMAIL`, `PREFIERE_LLAMADA`, `NUNCA_RESPONDE_EMAIL`, `NO_CONTACTAR_HASTA` estacional (R5) | Patrones de comportamiento — pueden cambiar, se re-verifican periódicamente (al expirar, si la señal se repite, la regla de escritura automática la vuelve a crear) |
| **LARGO** | indefinido (`expiraEn = null`) | `NO_OFRECER_DESCUENTOS` | Política de negocio explícita — solo se borra por acción `MANUAL` |

**Regla de aplicación:** el Memory Engine (Núcleo §3) ignora todo hecho con `expiraEn < now` — no hace falta un job de limpieza para que deje de tener efecto (aunque un cron de housekeeping puede borrarlas físicamente en Fase E, no bloquea nada).

### 2.4 Signal 🆕 (catálogo de código — NO es tabla)

Se formaliza el contrato pedido, pero como especificación en `lib/decision/senales.ts` (ya diseñado en Núcleo §1), no como entidad persistida — persistir cada cálculo de `diasSinVenir()` sería una copia derivada de `reservas` que se desincroniza en cuanto pasa un día. El "contrato" que pides existe como **tipo + test**, no como fila:

```ts
interface SignalSpec {
  nombre: string;                          // "ausenciaAnomala"
  inputs: (keyof SnapshotEstudio)[];       // ["socios", "reservas"]
  output: 'boolean' | 'number' | 'string' | 'Map<string, unknown>';
  formula: string;                          // documentación legible, va en el JSDoc de la función
  usadaPor: EspecialistaId[];               // ["RETENCION"] — trazabilidad inversa
}
```

Este catálogo vive como comentario estructurado sobre cada función en `senales.ts` (verificable por lint de convención en Fase A) — mismo principio que ya rige `datosUsados` en `Candidata`: la señal es siempre trazable a su fórmula, sin necesitar una tabla para probarlo.

### 2.5 Event (Inngest — catálogo, no tabla nueva)

Ya definido en Arquitectura §6. Se añade aquí solo la correlación: todo evento `decision/studio.analyze` lleva `decisionSessionId` en el payload desde el instante en que `DecisionSession` se crea (primer paso del pipeline, antes del snapshot) — así un log de Inngest se cruza con su sesión sin ambigüedad.

### 2.6 Specialist ✏️ (catálogo de código + tabla de activación)

Metadata (pregunta, KPI, reglas) sigue siendo **código**, no DB — es el contrato de comportamiento de Especialistas §0 y no cambia por estudio. Lo que sí es por-estudio es si está **encendido**, lo cual vive en la nueva tabla `decision_feature_flags` (§2.11) — no se crea una tabla `especialistas` redundante con el enum `EspecialistaId` ya tipado.

### 2.7 Priority ⚪ — value object embebido en `Recomendacion.prioridad`. No es entidad: se recalcula en cada análisis a partir del score (Núcleo §7), persistir su historial por separado no aporta nada que `DecisionSession` (§2.13) no capture ya vía sus estadísticas agregadas.

### 2.8 Confidence ⚪ — value object embebido en `Recomendacion.confianza` (`{nivel, evidencia[], autonomiaMaxima}`). Mismo motivo que Priority. El histórico para calibración (Núcleo §5.3) se reconstruye por join `recomendaciones ⋈ recomendacion_outcomes`, agrupado por `algorithmVersion` — no necesita tabla propia.

### 2.9 Action ⚪ — `AccionDecision`, embebida en `Recomendacion.accion` (jsonb). Ya definida en Arquitectura §3, sin cambios.

### 2.10 Automation (relación con el sistema legado, no entidad nueva)

Dos sistemas coexisten a propósito (decisión ya tomada en Inventario §5.3): `automation_rules`/`automation_logs` (motor operativo pre-existente: recordatorios, reglas simples) y el pipeline de ejecución del Decision OS (F3 `ejecutarRecomendacion`, Arquitectura §6) que **consume** una `Recomendacion` aprobada y ejecuta su `AccionDecision`. No se crea una entidad "Automation" nueva — sería un sinónimo confuso de dos cosas ya nombradas.

### 2.11 Feature Flag 🆕 (`decision_feature_flags`)

```sql
CREATE TABLE public.decision_feature_flags (
    id text PRIMARY KEY,
    studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    flag text NOT NULL CHECK (flag IN
      ('DECISIONES','RETENCION','INGRESOS','FINANZAS','AGENDA','MARKETING','EQUIPO')),
    activo boolean NOT NULL DEFAULT false,
    activado_en timestamptz,
    activado_por text,      -- usuario que hizo el cambio (auditoría)
    creado_en timestamptz DEFAULT now(),
    UNIQUE (studio_id, flag)
);
```

**Composición con entitlements (dos capas, no una redundancia):**
1. `entitlements.tieneFeature(studio, 'decisiones')` → **¿el plan del estudio permite esto?** (billing, Análisis §7)
2. `decision_feature_flags` → **¿está encendido para este estudio concreto ahora mismo?** (operación/rollout)

El flag maestro `DECISIONES` gatea todo (si está apagado, el resto no importa). Sin fila = apagado (fail-closed, coherente con el resto del sistema). Esto es exactamente lo que la Fase D (dogfooding) necesita: activar `DECISIONES+RETENCION` solo en tu estudio, dejar `INGRESOS` apagado hasta validar el primero — algo que el diseño anterior no permitía sin un despliegue de código.

### 2.12 Algorithm Version 🆕

```ts
// lib/decision/version.ts
export const ALGORITHM_VERSION = '1.0.0'; // semver: MAYOR.MENOR.PARCHE
```

**Regla de versionado (disciplina, no burocracia):**
- **PARCHE** (1.0.x): fix que no cambia scoring ni umbrales (p. ej. corregir un texto).
- **MENOR** (1.x.0): nueva regla o especialista que no altera el comportamiento de los existentes.
- **MAYOR** (x.0.0): cambio en `PESOS`, umbrales de confianza, o fórmula de score — **invalida la comparabilidad de outcomes previos para calibración**.

**Por qué esto corrige un gap real de Núcleo §5.3:** la calibración de porcentajes (`≥30 outcomes/tipo`) debe agrupar **solo dentro de la misma versión MAYOR** — `pctReal = f(outcomes WHERE algorithm_version LIKE '1.%')`. Sin esto, ajustar `PESOS` durante el dogfooding de la Fase D (que está planeado, no hipotético) mezclaría manzanas con peras en la propia muestra que se supone da honestidad al sistema. Se estampa en `Recomendacion.algorithmVersion` al crearse (§2.1) y en `DecisionSession.algorithmVersion` al iniciar (§2.13).

### 2.13 Decision Session 🆕 (`decision_sessions`)

Una fila por ejecución del pipeline (hay 2 al día por estudio, más las manuales/reactivas) — el eslabón de trazabilidad que faltaba entre "por qué salió esta tarjeta" y "qué pasó exactamente esa mañana".

```sql
CREATE TABLE public.decision_sessions (
    id text PRIMARY KEY,
    studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    disparado_por text NOT NULL CHECK (disparado_por IN ('CRON','MANUAL','REACTIVO')),
    algorithm_version text NOT NULL,
    iniciado_en timestamptz DEFAULT now(),
    finalizado_en timestamptz,
    snapshot_stats jsonb,          -- {socios: 84, sesiones: 32, recibosPendientes: 5, ...}
    n_candidatas_generadas integer NOT NULL DEFAULT 0,   -- todo lo que emitieron los especialistas
    n_candidatas_descartadas integer NOT NULL DEFAULT 0, -- caídas por confianza/memoria/cooldown
    n_recomendaciones_persistidas integer NOT NULL DEFAULT 0, -- las que llegaron a fila
    resumen_diario_id text,        -- FK opcional: qué resumen_diario produjo (upsert del día)
    errores jsonb,                 -- fallos parciales no fatales (p.ej. IA caída → fallback)
    estado text NOT NULL DEFAULT 'EN_CURSO' CHECK (estado IN ('EN_CURSO','COMPLETADA','FALLIDA'))
);
CREATE INDEX decision_sessions_studio_fecha ON public.decision_sessions (studio_id, iniciado_en DESC);
```

**Relación con `resumen_diario` (aclaración explícita — no son lo mismo):** `resumen_diario` es un **upsert por `(studio,fecha)`** — refleja el resultado de la *última* sesión del día (el análisis de las 14:30 sobreescribe el de las 06:30). `decision_sessions` es el **log completo, nunca se sobreescribe** — permite responder "¿qué vio el sistema a las 06:30 antes de que aprobaras el pago pendiente?" incluso después de que el de las 14:30 haya refrescado el resumen. Es el registro de auditoría que hace el "por qué se calculó así" verificable un año después, tal como pedías.

---

## 3. CICLO DE VIDA UNIFICADO DE `RECOMMENDATION`

Reconciliación entre el propuesto en la revisión y el ya aprobado (Núcleo §6) — sin estados redundantes:

```
                    ┌─ (nunca llega aquí: confianza < suelo → conteo en DecisionSession) ─┐
                    │                                                                        │
  [Especialista genera Candidata] ──candidatasGeneradas++──────────────────────────────────┘
                    │
                    │ supera confianza + no vetada por memoria
                    ▼
              ┌──────────┐  vistaEn se rellena la primera vez
              │ PENDIENTE │◄─ que aparece en GET /api/decisiones (no bloqueante,
              └────┬─────┘   solo analítica — no es un gate del flujo)
                    │
        ┌───────────┼───────────────┐
        │ aprobar    │ rechazar       │ expira_en vencido
        ▼            ▼               ▼
   ┌─────────┐  ┌───────────┐  ┌──────────┐
   │APROBADA │  │RECHAZADA  │  │ EXPIRADA │
   └────┬────┘  └─────┬─────┘  └────┬─────┘
        │             │              │
        ▼             │              │  outcome: evento=RECHAZADA/IGNORADA
   ┌──────────┐        │              │  outcome=NEUTRO ("aprendida" = true,
   │ejecutor  │        │              │   ver más abajo)
   └────┬─────┘        │              │
        │              │              │
   ┌────┴────┐          │              │
   ▼         ▼          │              │
EJECUTADA  FALLIDA       │              │
   │         │           │              │
   └────┬────┘           │              │
        │  step.sleepUntil(T+N) — "ESPERANDO_RESULTADO" es este intervalo,
        │  representado por Outcome.outcome = 'PENDIENTE', no una columna nueva
        ▼
   [medirOutcome] → Outcome.outcome = POSITIVO | NEGATIVO | NEUTRO
                     ─────────────────────────────────────────────
                     "APRENDIDA" = estado DERIVADO, no persistido:
                     aprendida(r) := outcome(r).outcome != 'PENDIENTE'
```

**Por qué "APRENDIDA" es derivada y no una columna:** si la reifico como estado propio de `Recomendacion.estado`, tengo dos fuentes de verdad para el mismo hecho (el estado y el outcome) que pueden desincronizarse si un paso falla a mitad. Consultarla como `outcome.outcome != PENDIENTE` en cada query es una línea de SQL y cero riesgo de inconsistencia — la misma disciplina que ya aplico contra los "91% inventados": no persistir lo que se puede derivar con garantía.

**"GENERADA" tampoco es un estado de `Recomendacion`** por el mismo motivo que "silencio es un resultado válido" (Núcleo §9): una candidata que no llega a fila no tiene id que trackear. Su existencia se cuenta en `DecisionSession.nCandidatasGeneradas` — el nivel correcto de esa información es la sesión, no la recomendación individual (que, por definición, no existe si no pasa el filtro).

---

## 4. MIGRACIÓN SQL DEFINITIVA — `0003_decision_os.sql`

**Esta sección sustituye a Arquitectura §4** (que queda marcada como enmendada — ver §7). Mismas convenciones (id `text`, `studio_id` + RLS, timestamps `timestamptz`).

```sql
-- ═══ recomendaciones (Arquitectura §4, + 3 columnas de este documento) ═══
CREATE TABLE public.recomendaciones (
    id text PRIMARY KEY,
    studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    decision_session_id text NOT NULL,              -- 🆕 FK lógica a decision_sessions
    algorithm_version text NOT NULL,                -- 🆕
    especialista text NOT NULL CHECK (especialista IN
      ('RETENCION','INGRESOS','AGENDA','MARKETING','FINANZAS','EQUIPO')),
    tipo text NOT NULL,
    dedupe_key text NOT NULL,
    titulo text NOT NULL,
    motivo text NOT NULL,
    datos_usados jsonb NOT NULL DEFAULT '{}',
    riesgo text NOT NULL DEFAULT 'OPORTUNIDAD' CHECK (riesgo IN ('PERDIDA','OPORTUNIDAD')),
    impacto jsonb,
    confianza jsonb NOT NULL,
    score numeric NOT NULL DEFAULT 0,
    prioridad text NOT NULL CHECK (prioridad IN ('CRITICA','ALTA','MEDIA','BAJA')),
    nivel_autonomia smallint NOT NULL DEFAULT 1 CHECK (nivel_autonomia BETWEEN 0 AND 3),
    accion jsonb NOT NULL,
    socio_id text REFERENCES public.socios(id) ON DELETE CASCADE,
    sesion_id text, recibo_id text,
    tiempo_estimado_min integer NOT NULL DEFAULT 2,
    estado text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN
      ('PENDIENTE','APROBADA','RECHAZADA','EXPIRADA','EJECUTADA','FALLIDA')),
    vista_en timestamptz,                            -- 🆕
    expira_en timestamptz NOT NULL,
    creado_en timestamptz DEFAULT now(),
    resuelto_en timestamptz, resuelto_por text
);
CREATE UNIQUE INDEX recomendaciones_dedupe_viva
  ON public.recomendaciones (studio_id, dedupe_key) WHERE estado IN ('PENDIENTE','APROBADA');
CREATE INDEX recomendaciones_home
  ON public.recomendaciones (studio_id, estado, prioridad, creado_en DESC);
CREATE INDEX recomendaciones_calibracion
  ON public.recomendaciones (tipo, algorithm_version);  -- 🆕 acelera la calibración por versión

-- ═══ recomendacion_outcomes (Arquitectura §4, sin cambios) ═══
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
CREATE INDEX outcomes_calibracion ON public.recomendacion_outcomes (studio_id, recomendacion_id);

-- ═══ memoria_socio (Arquitectura §4, + 4 columnas de este documento) ═══
CREATE TABLE public.memoria_socio (
    id text PRIMARY KEY,
    studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    socio_id text NOT NULL REFERENCES public.socios(id) ON DELETE CASCADE,
    clave text NOT NULL,
    valor jsonb NOT NULL DEFAULT '{}',
    nivel text NOT NULL DEFAULT 'MEDIO' CHECK (nivel IN ('CORTO','MEDIO','LARGO')),  -- 🆕
    confianza text NOT NULL DEFAULT 'MEDIA' CHECK (confianza IN ('ALTA','MEDIA','BAJA')), -- 🆕
    origen text NOT NULL CHECK (origen IN ('REGLA','FEEDBACK','MANUAL')),
    creado_por text,                                 -- 🆕
    evidencia text NOT NULL DEFAULT '',
    activa boolean NOT NULL DEFAULT true,
    expira_en timestamptz,                            -- 🆕 null = LARGO
    creado_en timestamptz DEFAULT now(),
    actualizado_en timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX memoria_socio_clave ON public.memoria_socio (studio_id, socio_id, clave);

-- ═══ resumen_diario (Arquitectura §4, sin cambios) ═══
CREATE TABLE public.resumen_diario (
    id text PRIMARY KEY,
    studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    fecha date NOT NULL,
    estado_general text NOT NULL CHECK (estado_general IN ('EXCELENTE','ATENCION','ACCION_INMEDIATA')),
    saludo text NOT NULL,
    mientras_dormias jsonb NOT NULL DEFAULT '[]',
    n_decisiones integer NOT NULL DEFAULT 0,
    tiempo_estimado_min integer NOT NULL DEFAULT 0,
    impacto_total jsonb,
    generado_en timestamptz DEFAULT now(),
    UNIQUE (studio_id, fecha)
);

-- ═══ decision_sessions 🆕 (este documento, §2.13) ═══
CREATE TABLE public.decision_sessions (
    id text PRIMARY KEY,
    studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    disparado_por text NOT NULL CHECK (disparado_por IN ('CRON','MANUAL','REACTIVO')),
    algorithm_version text NOT NULL,
    iniciado_en timestamptz DEFAULT now(),
    finalizado_en timestamptz,
    snapshot_stats jsonb,
    n_candidatas_generadas integer NOT NULL DEFAULT 0,
    n_candidatas_descartadas integer NOT NULL DEFAULT 0,
    n_recomendaciones_persistidas integer NOT NULL DEFAULT 0,
    resumen_diario_id text,
    errores jsonb,
    estado text NOT NULL DEFAULT 'EN_CURSO' CHECK (estado IN ('EN_CURSO','COMPLETADA','FALLIDA'))
);
CREATE INDEX decision_sessions_studio_fecha ON public.decision_sessions (studio_id, iniciado_en DESC);

-- ═══ decision_feature_flags 🆕 (este documento, §2.11) ═══
CREATE TABLE public.decision_feature_flags (
    id text PRIMARY KEY,
    studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    flag text NOT NULL CHECK (flag IN
      ('DECISIONES','RETENCION','INGRESOS','FINANZAS','AGENDA','MARKETING','EQUIPO')),
    activo boolean NOT NULL DEFAULT false,
    activado_en timestamptz,
    activado_por text,
    creado_en timestamptz DEFAULT now(),
    UNIQUE (studio_id, flag)
);

-- RLS idéntica en las 6 tablas (owner-only, patrón automation_*)
ALTER TABLE public.recomendaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recomendacion_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memoria_socio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumen_diario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_recomendaciones ON public.recomendaciones TO authenticated
  USING (current_rol() = 'PROPIETARIO' AND studio_id = current_studio_id())
  WITH CHECK (current_rol() = 'PROPIETARIO' AND studio_id = current_studio_id());
-- (idéntica para las otras 5 tablas)
```

---

## 5. LO QUE RECHAZO — Y POR QUÉ (con alternativa técnica)

| Propuesta | Por qué no ahora | Alternativa que sí construyo |
|---|---|---|
| Knowledge Graph (base de datos de grafos) | Postgres+FKs ya modela el grafo; lo que falta es dato (lesiones/vacaciones/conversaciones), no tecnología. Migrar sería un refactor gigante prohibido por tus propias reglas | Vista de grafo **derivada en memoria** dentro de `lib/decision/` para traversal puntual (Fase F, §6) — cero cambio de infraestructura |
| A/B testing de pesos ahora | Sin outcomes acumulados no hay potencia estadística — sería ruido con apariencia de rigor | Se habilita en Fase F, **después** de que `algorithm_version` (§2.12) dé datos limpios para comparar |

## 6. LO QUE ACEPTO Y REUBICO EN EL ROADMAP

- **Fase G — Business Intelligence Layer (CEO Agent):** la idea es genuinamente la mejor de toda la revisión a largo plazo — un agente conversacional que cruza Agenda+Profesores+Cancelaciones+Pagos+Marketing para responder "¿por qué cayó la ocupación?". Depende de tener especialistas maduros y meses de outcomes — construirla antes sería un agente sin nada que decir. Se añade al roadmap como fase posterior a F.
- **Vista de grafo derivada** (respuesta al punto de Knowledge Graph): Fase F, construida sobre el snapshot ya existente, sin tocar la base de datos.
- **A/B de pesos**: Fase F, una vez `algorithm_version` tenga historial limpio.

## 7. IMPACTO EN LOS DOCUMENTOS ANTERIORES

Ningún documento 1-8 queda invalidado. Enmiendas puntuales (aplicadas justo después de este documento):
- **Arquitectura §3/§4**: nota de puntero a este documento como versión ampliada de los tipos/migración.
- **Núcleo §5.3**: la calibración se agrupa por `algorithm_version` (mayor), no solo por tipo.
- **Especialistas**: puntero a §0 de este documento como el gate de datos formal.
- **Roadmap**: se añade Fase 0 (gate, ya pasado para Retención/Ingresos MVP) al principio, y Fase G al final.
