# 06 · Roadmap 24 meses · 100 mejoras por ROI · IA · Conclusión final

> Parte 6. Priorización Impacto × Esfuerzo. P0 = crítico/bloqueante · P1 = muy importante · P2 = importante · P3 = deseable.
> Estimación de impacto en: 💰 ingresos · 🔁 retención · 😍 NPS · 🎯 adquisición · ⚙️ eficiencia operativa.

## A. Principios de fundadores +100M ARR aplicados a Tentare

De Stripe/Shopify/Linear/Notion/HubSpot — **principios, no features**:

- **Stripe:** la corrección del dinero y la calidad de los errores ES el producto. → Tu Verifactu/idempotencia van por ahí; ahora **haz que los informes no mientan** (truncado a 1000) y que **SEPA/dunning sean impecables**.
- **Linear:** oponte a la superficie. Velocidad y opinión > amplitud. → **Mata o esconde el 30% de tu superficie** (gamificación, integraciones-fachada, tipos muertos) y haz 3 cosas excepcionales.
- **Shopify:** el ecosistema y el onboarding son el motor de adquisición. → **Trial/free tier + migración asistida gratis** como gancho de switching.
- **Notion/Figma:** una primitiva potente > cien features. → Tu primitiva potente candidata: **el loop demand-aware (llenar clase + reducir no-show + retener) unificado**, no 20 pantallas.
- **HubSpot:** land-and-expand con freemium + CRM. → Free tier limitado que capta, y expansión a ESTUDIO/CADENA con Decision OS que **de verdad genera ingreso**.

**Qué construirían / eliminarían / retrasarían / automatizarían:**
- **Construirían:** SEPA+dunning nativo, capa de datos server-side, loop de retención con "mensaje personal IA", app nativa.
- **Eliminarían:** gamificación pesada, integraciones-fachada, tipos de recomendación muertos, la mitad de las 13 tabs de config.
- **Retrasarían:** franquicia/royalties, marketplace propio, TicketBAI (fase 2), multi-país.
- **Automatizarían con IA:** no-show scoring, waitlist fill, churn+win-back, next-best-offer, conciliación contable.
- **Nunca construirían:** un chatbot genérico "pregúntame lo que quieras"; un marketplace que compita con la marca del estudio.

## B. Roadmap 24 meses

### 🔴 FASE 0 — Cimientos y verdad (meses 0-3) · P0
*"Antes de crecer, deja de mentir y deja de romperte."*
1. **Agregación server-side + paginación** en informes/dashboard/pagos → matar el truncado a 1000 filas. 💰🔁⚙️ (datos correctos = confianza)
2. **Índices FK faltantes** (instructor_id ×6, socio_id ×11, sala/tipo/plan/spot) + **CHECKs** + **UNIQUE email por estudio**. ⚙️
3. **Reconciliar `schema.sql`** con migraciones de seguridad + **revocar grants anon** (4 tablas) + **CHECK en `rol`**. (cierre de riesgo de seguridad)
4. **Verificar en prod** aplicación de `0029`/`0030` (script `verify-rls-salud.sql`) + numeración de facturas atómica/única.
5. **Cablear última milla de integraciones** (PayPal como método en checkout, Zoom atado a clases) — NO son fachadas: los clientes API son reales y el badge es honesto; solo falta la última milla. Cablear la 1-2 que aporten. ⚙️
6. **Borrar código muerto** (tipos de recomendación muertos, dead code documentado).

### 🟠 FASE 1 — Foso español y adquisición (meses 3-6) · P0/P1
*"Gana el mercado español por compliance + pagos + switching."*
7. **SEPA CORE nativo**: gestión de mandatos + recibos domiciliados + **motor de dunning de impagos** (reintentos, bloqueo tras N impagos). 💰🔁 **El flujo de cobro nº1 en España — probable mayor gap.**
8. **Bizum real** verificado (Stripe/Redsys) para pagos puntuales/bonos/primer pago. 💰🎯
9. **Casar recurrencia ↔ Verifactu**: factura hasheada+QR por ciclo automáticamente. ⚙️ (compliance sin fricción)
10. **Trial 14-30 días o free tier** (≤X socios). 🎯 (elimina la fricción de cobro día 1)
11. **Migración asistida gratis** (importador robusto Mindbody/bsport/Eversports + **portabilidad de tarjetas tokenizadas**). 🎯 (disuelve el lock-in de los rivales)
12. **Rehacer reserva pública** con patrones Acuity/Calendly: sin cuenta, auto-timezone, self-reschedule por link, buffers por servicio, deep-link con prefill, **SSR/SEO**. 🎯😍

### 🟡 FASE 2 — Retención inteligente (IA que ejecuta) (meses 6-12) · P1
*"Convierte Decision OS de narrador en operador."*
13. **No-show risk scoring** + fee/waitlist inteligente. 💰⚙️
14. **Waitlist predictiva / auto-fill por demanda** (a quién probablemente diga "sí"). 💰
15. **Churn prediction + win-back automático** con **borrador de "mensaje personal" con voz del dueño → envío en 1 tap**. 🔁💰 (la palanca de retención más eficaz, escalada)
16. **Next-best-offer** (intro→mensualidad). 💰
17. **Fusionar Decision OS ↔ `/automatizaciones`** en un solo "operations layer"; quitar solape. ⚙️😍
18. **Financials para el gestor**: conciliación bruto/neto, export limpio, acceso de solo-lectura para el gestor. 🔁😍 (nadie lo clava)

### 🟢 FASE 3 — Experiencia y escala (meses 12-18) · P1/P2
19. **App nativa de socio branded** (React Native/Expo) reutilizando el portal. 😍🎯
20. **Fan-out de crons por tenant** (Inngest) + salir de free tier. ⚙️
21. **Refactor god files** completado (módulos de dominio). ⚙️ (velocidad de desarrollo)
22. **Programación dinámica de clases** desde demanda prevista. 💰⚙️
23. **Previsión de ingresos y caja**. 🔁

### 🔵 FASE 4 — Expansión (meses 18-24) · P2/P3
24. **TicketBAI + Navarra** (cobertura nacional). 🎯
25. **Integraciones de agregadores reales** (Wellhub/ClassPass/USC) como canal de leads. 🎯
26. **Franquicia/multi-sede con royalties** (si el segmento lo pide). 💰
27. **Marketplace ligero opcional** o doblar la apuesta "sin marketplace" como marca.

## C. Las 100 mejoras priorizadas por ROI

> Formato: `[Pn] descripción — impacto`. Ordenadas por ROI (impacto/esfuerzo) descendente dentro de bloques.

**Bloque 1 — Corrección y seguridad (P0, ROI máximo)**
1. [P0] Paginación + agregación server-side en informes → datos correctos.
2. [P0] Índices FK `instructor_id` (6 tablas).
3. [P0] Índices FK `socio_id` (11 tablas de historial).
4. [P0] Índices `sesiones.sala_id/tipo_clase_id`, `facturas.recibo_id`, `suscripciones.plan_id`, `reservas.spot_id`.
5. [P0] Reconciliar `schema.sql` con migraciones de seguridad.
6. [P0] `REVOKE ALL ... FROM anon` en las 4 tablas con grant frágil.
7. [P0] `CHECK` en `instructores.rol`/`usuarios.rol`.
8. [P0] `UNIQUE (studio_id, lower(email))` en socios.
9. [P0] CHECKs de no-negatividad en importes/aforo.
10. [P0] Verificar prod `0029`/`0030` + numeración factura única/atómica.
11. [P2] Cablear última milla de PayPal/Zoom (clientes API ya reales; solo falta wiring a checkout/clases).
12. [P0] Borrar tipos de recomendación muertos y dead code.
13. [P0] Purga programada de `rate_limits`/`webhook_events`.
14. [P0] `search_path` fijo en las ~8 funciones base.
15. [P0] Tests E2E de los flujos de dinero completos (cobro, reembolso, dunning).

**Bloque 2 — Foso español y adquisición (P0/P1)**
16. [P0] SEPA CORE: alta y almacenamiento de mandatos.
17. [P0] SEPA: generación de remesas de recibos domiciliados.
18. [P0] Motor de dunning de impagos SEPA (reintentos + bloqueo).
19. [P1] Bizum real (Stripe/Redsys) verificado.
20. [P1] Factura Verifactu automática por ciclo de recurrencia.
21. [P1] Trial 14-30 días.
22. [P1] Free tier limitado (≤X socios).
23. [P1] Importador de migración Mindbody/bsport/Eversports.
24. [P1] Portabilidad de tarjetas tokenizadas en migración.
25. [P1] Reserva pública SSR + SEO.
26. [P1] Auto-timezone invisible en reserva.
27. [P1] Reserva sin cuenta + self-reschedule por link de email.
28. [P1] Buffers antes/después por tipo de servicio.
29. [P1] Deep-link de reserva con prefill (email/clase/cupón).
30. [P1] Waitlist auto-fill visible + posición transparente.
31. [P1] Consentimiento explícito RGPD art. 9 con auditoría en ficha clínica.
32. [P1] Mensaje/landing con las fechas Verifactu correctas (2027).

**Bloque 3 — Retención e IA que ejecuta (P1)**
33. [P1] No-show risk scoring.
34. [P1] Fee de cancelación tardía/no-show con enforcement.
35. [P1] Waitlist predictiva (targeting de "probable sí").
36. [P1] Churn prediction por socio.
37. [P1] Win-back automático con secuencia por timing.
38. [P1] "Mensaje personal IA" con voz del dueño → 1 tap.
39. [P1] Next-best-offer intro→mensualidad.
40. [P1] Fusionar Decision OS ↔ automatizaciones.
41. [P1] Decision OS ejecuta acciones (no solo recomienda).
42. [P1] Conciliación bruto/neto para el gestor.
43. [P1] Export contable limpio + acceso solo-lectura del gestor.
44. [P1] Segmentación de marketing por asistencia/gasto con escalado SMS.
45. [P2] Previsión de ingresos y caja.
46. [P2] Programación dinámica de clases desde demanda.
47. [P2] Alertas de "clase en riesgo de no llenarse" con acción sugerida.

**Bloque 4 — UX y simplificación (P1/P2)**
48. [P1] Refactor `configuracion` (13 tabs → progressive disclosure).
49. [P1] Virtualización de listas largas (socios, transacciones).
50. [P1] Acciones destructivas visibles en táctil (no solo hover).
51. [P1] Estados vacíos y textos que no prometan lo que no ocurre.
52. [P2] Command palette pulida (ya existe `global-search`).
53. [P2] Onboarding checklist con activación guiada.
54. [P2] Mejorar primer-paint del panel (menos carga al montar).
55. [P2] Micro-copys de errores tipo Stripe (accionables).
56. [P2] Modo recepción/tablet optimizado (kiosk ya existe).
57. [P2] Revisar consistencia de theming en portal/kiosk.

**Bloque 5 — Arquitectura y escala (P1/P2)**
58. [P1] Romper `supabase-data.ts` en módulos de dominio.
59. [P1] Romper `studio-context.tsx` (menos estado global).
60. [P1] Sustituir `select('*')` por columnas explícitas.
61. [P1] Vistas/RPC de agregación para KPIs e informes.
62. [P1] Eliminar `STUDIO_ID` singleton (paso explícito).
63. [P2] Fan-out de crons por tenant (Inngest).
64. [P2] Salir de Inngest free (concurrencia).
65. [P2] Partición de tablas de crecimiento no acotado (a futuro).
66. [P2] Backups fuera de la DB que protegen (ya en R2 — verificar restore transaccional).
67. [P2] Convención de numeración de migraciones + verificación post-deploy.
68. [P2] Reconciliar contadores denormalizados (job).

**Bloque 6 — Producto/plataforma (P2/P3)**
69. [P2] App nativa de socio (Expo).
70. [P2] Notificaciones push nativas.
71. [P2] Integración real de 1 agregador (Wellhub o USC) para leads.
72. [P2] Integración contable (Holded/QuickBooks/Xero).
73. [P3] TicketBAI (Álava/Bizkaia/Gipuzkoa).
74. [P3] Navarra (sistema propio).
75. [P3] Multi-sede/franquicia con royalties.
76. [P3] Reciprocidad entre sedes.
77. [P3] Marketplace ligero opcional.
78. [P3] API pública documentada.
79. [P3] Zapier/webhooks públicos.
80. [P3] Multi-idioma/multi-país (post-España).

**Bloque 7 — Confianza, soporte y marca (P1/P2)**
81. [P1] SLA de soporte humano en español < 3h como promesa de marca.
82. [P1] Centro de ayuda + IA de soporte entrenada en tus docs (interna, no chatbot público inútil).
83. [P2] Página de estado/uptime pública.
84. [P2] Garantía "tus datos son tuyos, exporta cuando quieras" explícita.
85. [P2] Precios públicos mantenidos + comparador honesto vs incumbentes.
86. [P2] Programa de switching (migración gratis + 1er mes) dirigido a huérfanos de Fitogram/subidas Glofox/Timp.

**Bloque 8 — Verticalización Pilates/wellness (P1/P2)**
87. [P1] Spot map como feature estrella de marketing (Reformer/mat).
88. [P1] Ficha clínica como diferenciador (rehab/fisio/embarazo).
89. [P2] Semi-privados y paquetes de privados de primera clase.
90. [P2] Plantillas de clase/serie con recurrencia robusta (arreglar bug tz si sigue).
91. [P2] Gestión de sustitutos de instructor (como Walla).
92. [P2] Detección de conflicto sala/instructor (ya parcial).

**Bloque 9 — Higiene y foco (P2/P3)**
93. [P2] Decidir destino de gamificación (medir uso; recortar si no se usa).
94. [P2] Auditar features por uso real (analytics de producto) y podar.
95. [P3] Consolidar `citas` vs `calendario` si hay solape conceptual.
96. [P3] Unificar mensajería/comunidad/chat si el uso no lo justifica.
97. [P3] Revisar si vídeo on-demand aporta o distrae.
98. [P2] Instrumentar embudo de activación y retención (para decidir con datos).
99. [P2] Panel de métricas de negocio propias (MRR, churn, NRR) para ti.
100. [P3] Playbook de precios/packaging por segmento (autónomo vs estudio vs cadena).

## D. Funcionalidades de IA con ventaja competitiva real (no chatbots)

Prioridad de construcción (todas atacan JTBD reales y son atribuibles a ingreso/retención):
1. **No-show scoring + auto-fill de waitlist** — llena la plaza de mayor riesgo con quien dirá que sí. 💰
2. **Churn + win-back con "mensaje personal IA"** — escala la intervención más eficaz del dueño. 🔁💰
3. **Next-best-offer** — el momento de conversión de mayor margen, hoy a ojo. 💰
4. **Conciliación contable IA** — mata el ritual CSV→Excel; handoff al gestor. ⚙️
5. **Previsión de ingresos/caja** — visibilidad forward que nadie da. 🔁
6. **Ficha clínica: resumen pre-clase IA** (ya lo tienes) — mantener, es diferencial vertical.

**Regla de oro (de Momence):** la IA que se paga es la que **hace el trabajo** (agente operativo), no la que **escribe texto** (commodity). Decision OS debe **ejecutar**, no narrar.

## E. Conclusión final — "Si este SaaS fuera mío, esto es lo que haría en 12 meses"

**Diagnóstico brutal en 5 frases:**
1. Has construido la **amplitud de Mindbody con los recursos de una startup pre-PMF**, y esa amplitud es precisamente lo que el mercado odia de Mindbody.
2. Tu seguridad y corrección de dinero están **sorprendentemente bien** (mérito real, muchos P0 ya cerrados); tu **arquitectura de datos es el pasivo** que hará que los informes mientan con el primer estudio serio.
3. Tu único foso estructural difícil de copiar es **la combinación vertical: Pilates (spot map) + clínica (ficha) + fiscal ES (Verifactu) + precio público** — **no** las 20 features sueltas.
4. **Verifactu ya no te diferencia de Timp ni Eversports** (ambos lo tienen); tu diferenciación real es **ese paquete combinado + soporte humano en español + SEPA/Bizum bien hechos + migración sin miedo**.
5. Tu mayor riesgo no es técnico: es **foco**. Estás repartido en 20 superficies mediocres cuando el mercado premia 3 excepcionales.

**Lo que haría, en orden, los próximos 12 meses:**

- **Meses 0-3 — Dejar de mentir y romperse.** Agregación server-side (informes correctos), índices, cerrar los huecos de seguridad menores, reconciliar `schema.sql`, ocultar integraciones-fachada, borrar código muerto. *Sin esto, todo lo demás se construye sobre arena.*
- **Meses 3-6 — Ganar España.** SEPA CORE + dunning nativo (tu gap de cobro nº1), Bizum real, Verifactu por ciclo, **trial/free tier**, **migración asistida gratis con portabilidad de tarjetas**, y rehacer la reserva pública con los patrones de Acuity/Calendly. *Aquí es donde conviertes leads (huérfanos de Fitogram, víctimas de subidas de Glofox/Timp).*
- **Meses 6-12 — IA que llena la clase.** Convertir Decision OS de narrador en **operador**: no-show scoring + auto-fill, churn + win-back con mensaje personal, next-best-offer, financials para el gestor. Fusionar con automatizaciones. *Esto es lo que te hace 10x, no otro módulo.*
- **En paralelo, todo el año — Podar.** Medir uso real y **matar o esconder el 30% de la superficie** (gamificación pesada, tabs de config, vídeo si no se usa). Menos producto, mejor producto.
- **Marca:** "El software de gestión que sí habla tu idioma: Verifactu incluido, Bizum y SEPA, precio público sin permanencia, soporte humano que responde el lunes a primera hora." Y **soporte humano en español < 3h como promesa central** — porque la queja nº1 de toda la categoría es el soporte, y ahí los incumbentes se están hundiendo.

**Lo que NO haría este año:** marketplace propio, franquicia/royalties, TicketBAI, multi-país, más gamificación, más integraciones-fachada. Todo eso es sprawl que retrasa el foso.

Si ejecutas Fase 0-2 con disciplina, en 12 meses tienes **el mejor software de gestión para estudios boutique de Pilates en España** — no por tener más features que Eversports, sino por ser **el único que combina fit vertical Pilates + clínica + fiscal español nativo + pagos españoles + soporte humano + migración sin miedo, a precio transparente**. Ese es un producto que se puede ganar el mercado. Las 20 features mediocres no.
