# 05 · Benchmark de Tentare vs competidores (funcional · UX · pricing · técnico)

> Parte 5. ✅ = Tentare mejor · 🟡 = igual/paridad · ❌ = Tentare peor. Comparado principalmente contra el grupo relevante (Eversports, bsport, Timp, Nubapp) y el estándar global (Mindbody/Momence/Walla).

## 1. Benchmark funcional

| Capacidad | Tentare | vs mercado | Comentario |
|-----------|---------|-----------|------------|
| Reservas + aforo atómico + waitlist | Sólido (RPC `FOR UPDATE`) | 🟡 | Paridad técnica; falta pulido de UX de reserva (auto-timezone, sin cuenta, SEO). |
| Reserva Reformer / **spot map** + citas 1:1 | `spot-map` + `citas` | ✅ | **Ventaja vertical Pilates**: el mercado no lo resuelve bien (Momence sin spot map, Mariana Tek excluye privados). Explótalo en marketing. |
| Pagos tarjeta (Stripe Connect direct charge) | Sí | 🟡 | Paridad. |
| **SEPA CORE (recibo domiciliado) + mandatos + dunning** | ⚠️ incierto/parcial | ❌ | **El flujo de cobro nº1 en España.** Nubapp/Eversports lo tienen nativo. Probable hueco prioritario. |
| **Bizum real** | Etiqueta en POS (¿real?) | 🟡/❌ | Verificar que es Bizum vía Stripe/Redsys, no etiqueta manual. |
| **Verifactu (hash+QR)** nativo | Sí | ✅ vs bsport/Mindbody/Momence/Glofox/WL/Walla/Nubapp; 🟡 vs Timp/Eversports/Deporwin | Tu foso, pero **no** contra los 2 rivales ES más fuertes. |
| **TicketBAI / Navarra** | ❌ | ❌ vs Timp/Eversports | Fase 2 obligatoria para cobertura nacional. |
| Membresías + bonos + entitlements | Sí | 🟡 | Paridad. |
| POS + Terminal físico + reconciliación | Sí (WisePOS E) | ✅ vs boutique-first; 🟡 vs Vagaro | Bien resuelto. |
| CRM socios + tags + lead stages + campos custom + import CSV | Sí | 🟡 | Paridad; UI monolítica. |
| **Ficha clínica** (salud, semáforo, alertas pre-clase, IA resumen) | Sí, role-gated | ✅ | **Diferenciador real** para Pilates/rehab/fisio. Nadie del grupo lo tiene así. Cuida el consentimiento RGPD art. 9. |
| Marketing (campañas, códigos, automatizaciones, IA copy) | Sí | 🟡 vs Momence (mejor de categoría) | Momence es el listón; tú estás por debajo pero decente. |
| **App de socio nativa branded** | ❌ (portal web PWA) | ❌ vs bsport/Glofox/Momence/Walla/WL | Desventaja percibida; el portal web es correcto pero no es "su app". |
| Vídeo on-demand / streaming | Sí (Cloudflare Stream) | 🟡 | Paridad con Momence/WL; ¿lo usan tus estudios? |
| **Decision OS** (recomendaciones IA con loop de aprobación) | Sí | ✅ *en concepto* | Más ambicioso que el churn-score de bsport/Glofox/Walla — **si ejecuta acciones, no solo narra**. Hoy con tipos muertos y solapado. |
| Gamificación (logros/niveles/retos/streaks) | Muy completa | ✅ vs todos; pero ⚠️ valor dudoso | Solo WL tiene loyalty comparable. **Sobre-construido** para el JTBD real. |
| Riesgo de dependencia por instructor | Sí (cron + widget) | ✅ | Nadie más lo tiene. Nicho pero diferencial. |
| Multi-sede / franquicia | Parcial (multi-tenant sí; franquicia/royalties no) | ❌ vs Glofox/Mindbody/Walla | No es tu segmento hoy; ok posponer. |
| Marketplace de consumidor (canal de captación) | ❌ | ❌ vs Eversports/Mindbody/Vagaro/Momence | Desventaja de adquisición; convertir en virtud (Walla) + agregadores. |
| Integraciones (Wellhub/ClassPass/USC, contabilidad, Zapier) | Stubs | ❌ | Hoy "publicidad engañosa". Cablear las 1-2 que importan (agregadores para leads). |
| Reporting / financials para gestor | `/informes` (con riesgo de truncado) | 🟡/❌ | Riesgo de datos incorrectos (§04). Nadie clava el handoff al gestor → oportunidad. |

**Resumen funcional:** ganas en **spot map, ficha clínica, Verifactu (vs globales), Decision OS conceptual, gamificación, dependency risk**. Pierdes en **SEPA/dunning, app nativa, TicketBAI, franquicia, marketplace, integraciones reales**. Empatas en el core (reservas/pagos/CRM/marketing). **Tu diferenciación no es "más features" — ya tienes de sobra — es la combinación vertical Pilates+clínica+fiscal ES+precio.**

## 2. Benchmark UX

| Dimensión | Tentare | Mejor de clase | Gap |
|-----------|---------|----------------|-----|
| Onboarding | Wizard `crear-estudio`, **sin trial** | PushPress/Gymdesk (free tier), TeamUp | Añadir trial/free. |
| UX de reserva pública | Client-side, sin SEO, primer paint blanco | **Acuity/Calendly** (auto-TZ, sin cuenta, self-reschedule, buffers, deep-link) | Rehacer con patrones robados. |
| Simplicidad panel | God-pages, 13 tabs config | **Walla/Linear** | Progressive disclosure; menos superficie. |
| Móvil socio | Portal web PWA | Momence (app 4.9) | App nativa (medio plazo). |
| Velocidad | Carga todo al montar; sin virtualización | Momence/Linear | Server-side + paginación. |
| Consistencia | shadcn + theming WCAG | 🟡 bien | El theming white-label es un punto fuerte. |
| Accesibilidad | Gate de contraste WCAG AA en theming | ✅ mejor que muchos | Mantener. |

## 3. Benchmark de pricing (ver tabla completa en archivo 01 §3)

- **Posición:** €29/59/149 — **por debajo** de Eversports (€49-229) y bsport (€150+/feature), **competitivo** con Timp (€50-170). ✅
- **Modelo:** por plan SaaS (no por reservas ni por instructor) → **más simple y predecible** que Vagaro (por calendario), Eversports (por reservas), Mindbody (por local). ✅
- **Sin comisión de marketplace** (25% Eversports / 20% Mindbody) → ✅ para el dueño, ❌ para tu captación.
- **Cobro día 1 sin trial** → ❌ fricción de adquisición.
- **Transparencia pública** → ✅ vs demo-gating de Mindbody/Glofox/bsport.

**Recomendación:** mantén precios públicos; añade **trial 14-30 días** o **free tier** (≤X socios) estilo Gymdesk/PushPress; considera **take-rate de procesamiento bajo** como mensaje ("comisiones de tarjeta más bajas que Mindbody/Glofox", como hace FitNova con 0,5%).

## 4. Benchmark técnico

| Eje | Tentare | Lectura |
|-----|---------|---------|
| Seguridad / RLS | ✅ Fuerte (todas las tablas, vulns históricas cerradas) | Por **encima** de la media; mejor que el promedio de incumbentes tras sus brechas (Glofox 2021). Quedan huecos menores (§04.4). |
| Corrección de dinero | ✅ `numeric`, Verifactu, idempotencia | Sólida. |
| Arquitectura / escalabilidad | ❌ God files, negocio en cliente, sin agregación server-side | **El pasivo.** Rompe con estudios medianos, no con "500k tenants". |
| Mantenibilidad | ❌ Archivos de miles de LOC, 144 fn en un módulo | Frena la velocidad. |
| Cobertura de tests | 🟡 41 tests de lógica pura (bien); falta E2E dinero | Mejor que muchos SaaS pequeños. |
| Observabilidad | 🟡 Sentry + rate-limit + idempotencia | Razonable. |
| Modularidad de features | 🟡 Entitlements limpio; pero sprawl de superficie | Buen gating, demasiada superficie. |

## 5. Matriz de gaps (para el consejo)

| Tipo | Elementos |
|------|-----------|
| **Funcionalidades que NO tengo** | SEPA CORE con mandatos+dunning · TicketBAI/Navarra · app nativa de socio · marketplace/canal de captación · franquicia/royalties · integraciones reales de agregadores y contabilidad · financials listos para gestor |
| **Funcionalidades mal ejecutadas** | Reserva pública (sin SEO/UX) · informes (riesgo truncado) · integraciones sin cablear en checkout/clases (clientes API reales pero última milla incompleta — NO fachadas) · Decision OS (tipos muertos, solapado) |
| **Funcionalidades excelentes** | Aforo atómico · Verifactu · spot map · ficha clínica · theming white-label WCAG · dependency risk · seguridad RLS · corrección de dinero |
| **Quick wins** (alto ROI, bajo esfuerzo) | Índices FK · CHECKs · revocar grants anon · reconciliar schema.sql · borrar tipos muertos · ocultar integraciones-fachada · trial/free tier · patrones de reserva Acuity |
| **Grandes apuestas** | Reescritura capa de datos server-side · SEPA+dunning nativo · Decision OS que ejecuta (no narra) · app nativa · loop demand-aware (fill+no-show+churn) |
| **Riesgos** | Datos incorrectos por truncado · schema.sql revive vulns · sprawl > capacidad · sin canal de adquisición · rivales ES (Eversports/Timp) ya con compliance |
