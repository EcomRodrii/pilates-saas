# 00 · Resumen ejecutivo — Auditoría Total de Tentare (`pilates-saas`)

> Fecha: 2026-07-17 · Documento para consejo de administración.
> Producto: **Tentare** — SaaS multi-tenant de gestión para estudios boutique de Pilates/Fitness, mercado español. Next.js 16 · React 19 · Supabase · Stripe Connect · Verifactu.
> Método: lectura directa de código (157 archivos `lib/`, 58 tablas, 33 migraciones) + investigación de mercado de 17 competidores (G2/Capterra/Trustpilot/BBB/Reddit/App Stores) + marco fiscal español (AEAT/AEPD) + digest de auditorías técnicas previas.

## El veredicto en 30 segundos

Tentare es **mucho más maduro de lo que un observador esperaría** —seguridad RLS sólida, corrección de dinero correcta, Verifactu nativo, la mayoría de P0s de auditorías previas ya cerrados— **pero sufre dos enfermedades estratégicas que le impedirán ganar el mercado si no se corrigen:**

1. **Sobre-extensión (feature bloat):** ha construido la amplitud de Mindbody (~20 áreas de producto) con recursos de startup pre-PMF. Ninguna es best-in-class y esa amplitud es *exactamente* lo que el mercado odia de los incumbentes.
2. **Arquitectura de datos como pasivo:** el negocio corre en el navegador (god-context de 2.700 líneas, capa de datos de 3.780), sin agregación server-side ni paginación → **los informes se truncan a 1000 filas y mienten** con el primer estudio con años de datos. No es un problema de "500k tenants"; es un problema de "50 estudios reales".

**Si un competidor con foco entrara mañana, ganaría no con más features, sino haciendo 3 cosas excepcionales mientras Tentare mantiene 20 mediocres.**

## Posición competitiva (honesta)

- **Tu batalla real NO es Mindbody** (apenas presente en España). Es **Eversports, bsport, Timp y Nubapp**.
- **Tu mapa competitivo estaba desactualizado:** listaste 2 competidores fantasma (Resax, Gymter — dominios aparcados) y **omitiste a Eversports, Timp y Nubapp**, 3 de los 4 rivales españoles más importantes.
- **Verifactu ya NO es tu diferenciador** frente a los rivales ES fuertes: **Timp y Eversports ya lo tienen**. Es table-stakes, no foso.
- **Tu único foso estructural real es la COMBINACIÓN:** fit vertical Pilates (spot map) + ficha clínica + fiscal español nativo + pagos españoles + precio público + soporte humano. Ninguna pieza aislada te salva; el paquete sí.

## Lo que está bien (crédito donde toca)

✅ Seguridad RLS en las 58 tablas (vulnerabilidades históricas cerradas) · ✅ Aforo/reservas atómico · ✅ Dinero en `numeric` + Verifactu + idempotencia de webhook · ✅ Billing SaaS + entitlements · ✅ Política de cancelación, no-show real, consumo de bono correcto · ✅ Diferenciadores verticales genuinos: **spot map, ficha clínica, dependency risk, theming WCAG** · ✅ 41 tests de lógica pura · ✅ Precio público competitivo (€29-149).

## Lo que está mal (por impacto)

| # | Problema | Tipo | Impacto |
|---|----------|------|---------|
| 1 | Informes/dashboards **incorrectos** por truncado a 1000 filas | Corrección | 🔴 Erosiona confianza y decisiones |
| 2 | **God files** (3.780 + 2.713 LOC) + negocio en el cliente | Arquitectura | 🔴 Frena desarrollo, no escala |
| 3 | **Sprawl de 20 superficies** mediocres | Foco/producto | 🔴 = feature bloat que el mercado odia |
| 4 | **SEPA CORE + dunning** probablemente incompleto | Funcional | 🔴 Flujo de cobro nº1 en España |
| 5 | Sin **canal de adquisición** (no marketplace, sin trial/free) | GTM | 🟠 Fricción de crecimiento |
| 6 | Integraciones (WhatsApp/PayPal/Zoom) sin cablear en checkout/clases | Última milla | 🟡 Clientes API reales; badge honesto (no fachada) |
| 7 | `schema.sql` desincronizado → tipos de dev incorrectos | Calidad | 🟡 Ya marcado "NO EJECUTAR"; no es riesgo de prod |
| 8 | Sin app nativa de socio, sin TicketBAI | Paridad | 🟠 Desventaja vs rivales |
| 9 | Índices FK faltantes, CHECKs, grants anon frágiles | BD | 🟡 Quick wins |
| 10 | Decision OS con tipos muertos y solapado con automatizaciones | Higiene | 🟡 |

## Qué haría en 12 meses (resumen)

- **0-3 meses — Cimientos:** agregación server-side (informes correctos), índices/CHECKs, cerrar huecos de seguridad menores, reconciliar `schema.sql`, ocultar fachadas, borrar código muerto.
- **3-6 meses — Ganar España:** SEPA+dunning nativo, Bizum real, Verifactu por ciclo, **trial/free tier**, **migración asistida gratis con portabilidad de tarjetas**, reserva pública estilo Acuity/Calendly (SSR, auto-timezone, sin cuenta).
- **6-12 meses — IA que ejecuta:** convertir Decision OS de narrador en operador (no-show scoring + auto-fill, churn + win-back con "mensaje personal IA", next-best-offer, financials para el gestor).
- **Todo el año — Podar:** medir uso y matar/esconder el 30% de la superficie.
- **Marca:** soporte humano en español < 3h como promesa central (la queja nº1 de toda la categoría).

## Impacto esperado si se ejecuta

- **💰 Ingresos:** SEPA/dunning (menos impagos), next-best-offer y no-show fill suben ARPU y ocupación.
- **🔁 Retención:** churn + win-back con mensaje personal ataca el JTBD peor resuelto de la categoría.
- **😍 NPS:** soporte humano + fin de fachadas + informes correctos.
- **🎯 Adquisición:** trial/free + migración sin miedo + reserva con SEO convierten a los huérfanos de Fitogram y las víctimas de subidas de Glofox/Timp.
- **⚙️ Eficiencia:** refactor de datos y fan-out de crons desbloquean velocidad de desarrollo y escala.

## Estructura del informe completo
- **01** Investigación competitiva (17 competidores, ranking de amenaza, pricing).
- **02** Quejas de categoría, JTBD, oportunidades y mapa de IA.
- **03** España: fiscal (Verifactu/TicketBAI/IVA), pagos (Bizum/SEPA), RGPD, GTM.
- **04** Auditoría técnica (arquitectura, código, BD, rendimiento, seguridad, UX).
- **05** Benchmark (funcional/UX/pricing/técnico con ✅🟡❌ + matriz de gaps).
- **06** Roadmap 24 meses, 100 mejoras por ROI, IA, y conclusión "si fuera mío".
