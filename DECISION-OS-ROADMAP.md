# TENTARE DECISION OS — ROADMAP TÉCNICO (FASE 8)

**Versión:** 1.0 · **Fecha:** 11 julio 2026 · **Estado:** Pendiente de aprobación
**Prerrequisitos:** Fases 1–4 y 7 aprobadas.

> Estimaciones en **sesiones de trabajo** (una sesión = un bloque de implementación conmigo, con tests verdes y verificación al cierre). Cada fase termina con un checkpoint verificable — nunca se avanza con algo roto (tu regla de las 9 fases, aplicada también dentro de la implementación).

---

## VISIÓN GLOBAL

```
0 · Gate de datos ──→ A · Núcleo puro ──→ B · Pipeline + APIs ──→ C · Centro de Control ──→ D · Lanzamiento
   (ya pasado MVP)       (2-3 ses.)          (2 ses.)                (2-3 ses.)              (1-2 ses.)
                                       MVP COMPLETO ≈ 7-10 sesiones
──────────────────────────────────────────────────────────────────────────────────────────────────────────
E · Reactividad + Finanzas/Agenda/Marketing      F · Equipo, calibración %, nivel 3, grafo derivado, A/B
                  (post-MVP)                              G · Business Intelligence Layer (CEO Agent)
```

---

## FASE 0 — GATE DE DATOS (prioridad P0 · 0 sesiones — ya superado)

**Qué:** por cada especialista que entra al roadmap, la tabla obligatorio/opcional de [DECISION-OS-MODELO-DATOS.md](DECISION-OS-MODELO-DATOS.md) §0 antes de escribir una línea. Retención (R1-R4) e Ingresos (I1-I2) ya la pasan al 100% de obligatorios — MVP desbloqueado. R5 (estacional) queda correctamente bloqueada (dato de 13 meses, snapshot da 6) y no entra en Fase A.
**Checkpoint:** la tabla existe y está firmada antes de que un especialista nuevo (Finanzas/Agenda/Marketing en Fase E, Equipo en F) reciba código.

## FASE A — NÚCLEO PURO (prioridad P0 · 2-3 sesiones)

**Qué:** migración `0003_decision_os.sql` + todo `lib/decision/` puro: tipos, señales, Retención (R1–R4 — la R5 estacional pasa a fase E por ventana de datos), Ingresos (I1–I2), memoria, confianza, prioridad, director, outcomes — con su batería completa de tests (mapas F3 §11 + F4 §10), incluido el **fixture "mockup"** y el pipeline completo `ejecutarAnalisis`.

**Dependencias:** ninguna (ni DB ni red — el núcleo se desarrolla contra snapshots sintéticos).
**Checkpoint de salida:** `npm test` verde con ~40–60 tests nuevos (los 107 actuales intactos); migración aplicada en Supabase (CLI) y verificada con RLS; revisión de código.
**Riesgos:** calibrar umbrales sin datos reales (mitigado: constantes centralizadas en `PESOS`/tablas de criterios, ajustables sin tocar lógica) · sobre-detección en estudios con datos irregulares (mitigado: modo aprendizaje + confianza BAJA silenciosa).

## FASE B — PIPELINE + APIs (P0 · 2 sesiones)

**Qué:** adaptadores (`snapshot`, `db`, `redaccion`) + 4 funciones Inngest + 4 rutas API + los 6 puntos de contacto additivos (EVENTS, serve, entitlements, permisos — sidebar y redirect quedan para C).

**Dependencias:** Fase A.
**Checkpoint:** análisis end-to-end real en tu estudio de pruebas vía Inngest Dev Server — recomendaciones en tabla, resumen materializado, aprobar → email/cobro de prueba → outcome programado. Sentry capturando. `npm test` + typecheck verdes.
**Riesgos:** límites Inngest free (mitigado: concurrency 3 + horarios desplazados — decidido en F2 §6) · coste/latencia Anthropic (mitigado: lote único + cache + fallback) · snapshot pesado en estudios grandes (mitigado: ventanas acotadas; medimos duración real en este checkpoint).

## FASE C — CENTRO DE CONTROL (P0 · 2-3 sesiones)

**Qué:** página + 7 componentes sobre primitivos existentes + `useDecisiones()` (aprobar/rechazar optimista) + sidebar + redirect condicional + empty states (modo aprendizaje y "todo en orden") + dark mode + responsive (desktop prioridad, móvil gestión rápida) + E2E Playwright.

**Dependencias:** Fase B (la API es su contrato).
**Checkpoint:** flujo completo en navegador (preview verificado): entrar → resumen del Director → aprobar una prioridad → tarjeta pasa a ejecutada → "una decisión menos". Cero regresiones visuales en el resto del panel (los 6 puntos de contacto revisados uno a uno). Checklist de calidad del Design System (doc 5 §25) pasada pantalla a pantalla.
**Riesgos:** tentación de inventar componentes (mitigado: solo `RecommendationCard`/`SpecialistCard` como compuestos nuevos, tokens existentes) · densidad visual (la Bible manda aire: ≤3 prioridades, ≤10 actividad — ya es contrato de API, no decisión de UI).

## FASE D — ENDURECIMIENTO Y LANZAMIENTO (P0 · 1-2 sesiones)

**Qué:** golden tests de prompts congelados · pruebas de replay/idempotencia Inngest (re-runs no duplican ni reenvían) · pruebas de los 9 casos borde (F3 §9) contra entorno real · revisión de seguridad (RLS probada con usuario no-propietario, 403s de API) · `/code-review` + `/verify` de todo el diff · **rollout**: activar `decisiones` solo en tu estudio (dogfooding) → 1–2 semanas observando calidad de recomendaciones y ajustando `PESOS` → activar para plan ESTUDIO/CADENA.

**Checkpoint = definición de "MVP lanzado":** 2 semanas de dogfooding con >80% de recomendaciones revisadas (métrica de éxito doc 4) y cero incidencias Sentry del pipeline.
**Riesgos:** recomendaciones "obvias" que decepcionen (el riesgo #1 de producto — mitigado por el periodo de dogfooding con ajuste de umbrales ANTES de exponerlo a clientes).

---

## POST-MVP

### FASE E — REACTIVIDAD + 3 ESPECIALISTAS (P1 · 4-6 sesiones)
Eventos reactivos (PaymentFailed/ReservationCancelled/WaitlistJoined con debounce — diseño F2 §6) · **R5 estacional de Retención** (ventana de snapshot extendida a 13 meses solo para esa señal) · Especialista **Finanzas** (F1–F4, absorbe de I2 los casos >30d/sin tarjeta) · **Agenda** (A1–A4, + tabla de festivos ES) · **Marketing** (M1–M3 sobre el asistente de campañas existente) · registro de promociones de lista de espera en `actividad_reciente` (tipo `LISTA_ESPERA_PROMOVIDA` — habilita su línea en "Mientras Dormías") · migración de los 3 triggers de negocio de `/automatizaciones` al Decision OS (decisión de convivencia F7 §5.3) · UI de memoria por socia (ver/editar/borrar hechos).
**Dependencias:** MVP lanzado + datos de outcomes acumulándose. **Riesgo:** más especialistas = más ruido si el Priority Engine no aprieta — los caps son innegociables.

### FASE F — INTELIGENCIA MADURA (P2 · continua)
Calibración de porcentajes reales agrupada por `algorithm_version` mayor (≥30 outcomes/tipo, Laplace+Wilson — Núcleo §5.3, enmendado por Modelo de Datos §2.12) · nivel 3 de autonomía con opt-in por tipo (solo reversibles) · Especialista **Equipo** (requiere horas contratadas en configuración) · resumen agregado multi-centro (CADENA) · benchmarking anónimo entre estudios · predicciones · **vista de grafo derivada** en `lib/decision/` sobre el snapshot existente (Modelo de Datos §5-6 — no migración a base de grafos) · **A/B de pesos de prioridad** una vez haya historial limpio por versión (Modelo de Datos §5).
**Regla de entrada a F:** ningún porcentaje visible ni automatización nivel 3 sin datos que los respalden — es la promesa de honestidad del producto.

### FASE G — BUSINESS INTELLIGENCE LAYER (P3 · exploratoria)
El "CEO Agent": capa conversacional que responde preguntas de causa-raíz cruzando especialistas ("¿por qué cayó la ocupación?" → analiza Agenda + Profesores + Cancelaciones + Pagos + Marketing y sintetiza). La idea más ambiciosa de todo el proyecto — y la más peligrosa de construir pronto: sin especialistas maduros y meses de outcomes reales (Fase E-F completas), sería un agente conversando sobre una base de datos vacía. Entrada a G condicionada a que F esté produciendo calibración real.

---

## TABLA RESUMEN

| Fase | Prioridad | Estimación | Depende de | Riesgo mayor | Checkpoint |
|---|---|---|---|---|---|
| A · Núcleo | P0 | 2-3 ses. | — | umbrales sin datos reales | tests verdes + migración aplicada |
| B · Pipeline | P0 | 2 ses. | A | límites Inngest free | análisis e2e real funcionando |
| C · UI | P0 | 2-3 ses. | B | regresiones visuales | flujo completo en navegador + checklist DS |
| D · Lanzamiento | P0 | 1-2 ses. | C | recomendaciones decepcionantes | 2 sem. dogfooding, >80% revisadas |
| E · Reactividad+3 esp. | P1 | 4-6 ses. | D + outcomes | ruido acumulado | caps intactos + convergencia automatizaciones |
| F · Madurez | P2 | continua | E + masa de datos | prometer sin datos | % calibrados y nivel 3 con opt-in |

**Camino crítico del MVP: A → B → C → D ≈ 7–10 sesiones.**
Primer valor visible: al final de la Fase B ya se puede ver un análisis real por Inngest; la magia completa, al final de C.
