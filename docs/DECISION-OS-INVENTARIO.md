# TENTARE DECISION OS — INVENTARIO FUNCIONAL (FASE 7)

**Versión:** 1.0 · **Fecha:** 11 julio 2026 · **Estado:** Pendiente de aprobación
**Prerrequisitos:** Fases 1–4 aprobadas. La Fase 6 (Analytics intocable) queda garantizada por construcción y se ratifica en §6.

---

## 1. TODO LO QUE EXISTE HOY (y sigue funcionando exactamente igual)

### Operación del estudio
| Funcionalidad | Dónde vive | Decision OS la… |
|---|---|---|
| Agenda / calendario (sesiones, series, salas, spots físicos) | `/calendario`, `calendar-logic.ts`, RPCs atómicas | **lee** (ocupación, franjas) |
| Reservas + lista de espera con promoción atómica | `booking-logic.ts`, `crear_reserva_atomica`, `reservar_plaza` | **lee** |
| Citas privadas (fisio/eval/online) | `/citas` | no toca (F2 Agenda la leerá) |
| Check-in / kiosko / QR | `/kiosk`, `qr-svg.ts` | no toca |
| Clientes (socias): fichas, tags, lead stage, import CSV | `/socios`, `/socios/importar`, `csv.ts` | **lee** |
| Equipo (instructores, roles, chat interno) | `/equipo`, `/chat`, `mensajes_equipo` | no toca (F3 Equipo lo leerá) |

### Dinero
| Funcionalidad | Dónde vive | Decision OS la… |
|---|---|---|
| Planes, bonos, suscripciones (sesiones restantes) | `planes_tarifa`, `suscripciones`, `bono-logic.ts` | **lee** |
| Recibos y cobros (Stripe Connect, off-session, reintentos) | `/pagos`, `recibos`, `stripe/charge-off-session` | **lee y ejecuta cobros vía la ruta existente** (I2) |
| Facturación Veri*Factu (cadena de huellas AEAT) | `/facturas`, `verifactu.ts`, `facturas/sellar` | no toca **jamás** |
| POS + productos + datáfono (Stripe Terminal) | `/pos`, `/productos`, `terminal/*` | **lee** ventas (señal ingresos) |
| Billing del propio SaaS (planes BASE/ESTUDIO/CADENA) | `/suscripcion`, `billing/*`, `entitlements.ts` | **se gatea con él** (feature `decisiones`) |

### Engagement
| Funcionalidad | Dónde vive | Decision OS la… |
|---|---|---|
| Marketing: campañas + asistente IA de campañas | `/marketing`, `campanas`, `ai/campana-asistente` | no toca (F2 Marketing preparará borradores ahí) |
| Automatizaciones IA (4 triggers, aprobación 1 toque) | `/automatizaciones`, `automation-engine.ts`, Inngest | **coexiste** — ver §5.3 |
| Notificaciones + actividad reciente | `/notificaciones`, `notificaciones`, `actividad_reciente` | **lee** (Mientras Dormías, Actividad) |
| Mensajería a socias (email Resend + plantillas) | `/mensajeria`, `emails/send`, `lib/emails/` | **reutiliza** para enviar |
| Gamificación completa (logros, retos, niveles, rachas, créditos, recompensas) | 12 tablas + engines | no toca |
| Comunidad, vídeo on-demand | `/comunidad`, `/ondemand` | no toca |
| Portal de miembros (web app socias) + reserva pública | `/portal`, `/reservar`, `api/public/*` | no toca |

### Análisis e infraestructura
| Funcionalidad | Dónde vive | Decision OS la… |
|---|---|---|
| Dashboard actual (KPIs, gráficos custom, onboarding) | `/dashboard`, `dashboard-chart-engine.ts` | **queda intacto** — deja de ser la ruta por defecto para propietarios con la feature (redirect condicional, reversible) |
| Informes/Analytics (MRR, retención, cohortes, export) | `/informes` | **intocable** (§6) |
| Backups R2, crons (backups/no-shows/recordatorios), Sentry | `api/cron/*`, `backup-engine`, R2 | no toca |
| Google Calendar sync, códigos descuento, soporte | `integrations/*`, etc. | no toca |

**Nada de esta tabla cambia de comportamiento.** Las celdas "lee" son lecturas vía snapshot (Fase 2 §5) sin efectos.

---

## 2. TODO LO NUEVO (archivo a archivo)

| Pieza | Archivos | Fase impl. |
|---|---|---|
| Migración SQL (4 tablas + RLS + índices) | `supabase/migrations/0003_decision_os.sql` | A |
| Contratos de dominio | `lib/decision/tipos.ts` | A |
| Señales compartidas | `lib/decision/senales.ts` (+`.test.ts`) | A |
| Especialistas MVP | `lib/decision/especialistas/{contrato,retencion,ingresos}.ts` (+tests) | A |
| Motores | `lib/decision/{memoria,confianza,prioridad,director,outcomes}.ts` (+tests) | A |
| Adaptador snapshot | `lib/decision/snapshot.ts` | B |
| Adaptador DB (mappers + dbXxx de las 4 tablas) | `lib/decision/db.ts` | B |
| Adaptador IA (prompts §8 F4, lote, cache, fallback) | `lib/decision/redaccion.ts` | B |
| Pipeline Inngest (4 funciones) | `lib/inngest/decision.ts` | B |
| APIs | `app/api/decisiones/{route.ts, [id]/aprobar, [id]/rechazar, analizar}` | B |
| Centro de Control | `app/(dashboard)/centro-de-control/page.tsx` | C |
| Componentes | `components/decision/{recommendation-card, specialist-card, executive-summary, while-you-slept, activity-list, quick-actions, empty-state}.tsx` + `useDecisiones()` | C |
| Tests E2E | `e2e/centro-de-control.spec.ts` | C |

## 3. LO QUE SE AMPLÍA (los únicos 7 puntos de contacto — Fase 2 §12)

`lib/inngest/client.ts` (+3 EVENTS) · `app/api/inngest/route.ts` (+4 registros) · `lib/entitlements.ts` (+feature `decisiones`: BASE false / ESTUDIO true / CADENA true) · `components/layout/sidebar.tsx` (+1 item, 3 arrays) · `lib/permisos.ts` (+1 ruta, solo PROPIETARIO) · `app/(dashboard)/page.tsx` (redirect condicional con fallback intacto) · `app/api/stripe/charge-off-session/route.ts` (**el único refactor**: extraer la lógica de cobro a `lib/stripe-cobros.ts` con Idempotency-Key Stripe; la ruta la consume con semántica idéntica).

## 4. LO QUE SE ELIMINA

**Nada.** Cero borrados, cero deprecaciones en el MVP.

## 5. DEPENDENCIAS Y DECISIONES DE CONVIVENCIA

### 5.1 Externas (todas ya en producción — cero dependencias npm nuevas)
Supabase (RLS + service role) · Inngest (⚠️ plan free: concurrency compartida 5 — decisiones usa 3 + horarios desplazados; primer cuello de botella al escalar) · Anthropic Haiku (fallo suave; sin la key el producto funciona con textos del motor) · Resend (idempotencia por clave) · Stripe (cobros vía rutas existentes).

### 5.2 Internas (orden de construcción)
`0003.sql` → `tipos.ts` → `señales` → `especialistas`+`motores` (paralelo) → adaptadores → pipeline → APIs → UI. El núcleo (Fase A) es implementable y testeable **sin tocar DB ni red** — el orden de fases del roadmap sale de este grafo.

### 5.3 Convivencia con Automatizaciones (decisión explícita)
**MVP: coexisten sin solaparse.** `/automatizaciones` sigue igual (sus triggers CLASE_MANANA y logs de email son además fuente de "Mientras Dormías"). Los triggers de *detección de negocio* (AUSENCIA_DIAS crítico → oferta, CLASE_LLENA_RECURRENTE, PAGO_PENDIENTE con tarjeta) quedarán **duplicados conceptualmente** con R2/I1/I2 durante el MVP. Mitigación de ruido: el Centro de Control es la Home y las recomendaciones del Decision OS llevan el dedupe; el usuario que use ambas pantallas verá la misma realidad, no acciones dobles (las aprobaciones de automatizaciones siguen en su página). **Post-MVP (fase E del roadmap): decisión de producto** — migrar esos 3 triggers al Decision OS y dejar `/automatizaciones` solo para reglas operativas (recordatorios). Se documenta hoy para que la duplicación sea deliberada, no accidental.

### 5.4 Datos
Migración **solo de esquema** (4 CREATE TABLE — sin backfill: el sistema arranca frío por diseño, modo aprendizaje Fase 3 §9). Reversible con DROP de las 4 tablas sin afectar a nada existente. Sin cambios en tablas actuales: riesgo de migración ≈ cero.

## 6. RATIFICACIÓN FASE 6 — ANALYTICS

Ninguna pieza nueva escribe, importa ni modifica `/informes`, `/dashboard`, `dashboard-chart-engine.ts` ni `ocupacion.ts`. Sentido único: el Decision OS **lee** las mismas fuentes. Cuando haya masa de outcomes, Analytics podrá añadir (como ampliación suya, fuera de este proyecto) métricas leyendo `recomendaciones`/`recomendacion_outcomes`: cancelaciones evitadas, € recuperados, tasa de acierto por especialista.
