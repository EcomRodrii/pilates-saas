# Arquitectura legal, pagos y facturación de Tentare — documento maestro

> Investigación completa, sin implementación. Verificado contra el código real en `main` (commit `ddea616`, 2026-07-29) por 4 auditorías internas de solo lectura, más una investigación legal externa con fuentes citadas (AEAT/BOE/AEPD/Diputaciones Forales). Este documento reemplaza como referencia a `AUDITORIA-TOTAL-2026-07/03-ESPANA-FISCAL-GTM.md` y `AUDITORIA-TOTAL-2026-07/FASE1-PAGOS-ESPANA-DISENO.md`, que describían un estado de julio-2026 ya superado en varios puntos — se citan aquí solo para marcar qué cambió.

## Cómo leer este documento

**El hallazgo más importante de toda la investigación es este: Tentare ya no es un producto con huecos legales/fiscales grandes. Es un producto con cumplimiento sustancialmente construido, y con una brecha entre lo que el código hace y lo que la documentación/UI dice que hace.** Casi todo lo que un plan de "arquitectura desde cero" propondría para pagos españoles (SEPA, Bizum, Verifactu) ya está en producción. El trabajo real que queda no es "construir el sistema de pagos" — es cerrar gaps puntuales, corregir documentación que miente sobre el propio producto, y decidir con calma qué construir para 2027 (TicketBAI, factura electrónica B2B) cuando haga falta, no antes.

Por eso este documento no sigue un tono de "hay que construir todo esto" — sigue un tono de auditoría: qué hay, qué falta de verdad, y qué NO hay que reconstruir aunque un análisis genérico de "SaaS de facturación" lo sugeriría.

---

## 1. Pagos

### Estado actual (verificado)

| Pieza | Estado | Evidencia |
|---|---|---|
| Stripe Connect (cobro a socias) | ✅ Direct charge, Standard/OAuth | `app/api/stripe/connect/callback/route.ts`, `lib/billing/stripe-cobros.ts` |
| Comisión de plataforma | ✅ Opcional, apagada por defecto | `lib/billing/stripe-fees.ts` (`TENTARE_APPLICATION_FEE_BPS=0`) |
| Suscripción SaaS (Tentare→estudio) | ✅ Stripe Billing nativo, trial 14 días | `app/api/billing/checkout/route.ts`, `lib/billing/entitlements.ts` |
| Renovación mensual/bono (estudio→socia) | ✅ Cron Inngest, off-session, idempotente | `lib/inngest/renovaciones.ts`, `lib/billing/stripe-cobros.ts` |
| SEPA Direct Debit (mandato + cobro recurrente) | ✅ En prod desde PR-2→PR-5 de la Fase 1 (ya ejecutada entera) | `app/api/stripe/setup-sepa/route.ts`, `lib/billing/metodo-cobro.ts` |
| SEPA "19.14" (remesa bancaria clásica, sin Stripe) | ✅ Sistema paralelo, real, con RLS cerrada (migr. `0122`/#451) | `lib/sepa-19-14.ts`, `components/cobros/boton-remesa-sepa.tsx` |
| Bizum | ✅ `PaymentIntent` real, online + POS | `app/api/stripe/checkout/route.ts`, `app/api/stripe/pos-bizum/route.ts` |
| Bonos / pagos únicos | ✅ Checkout `mode:'payment'`, idempotente | `lib/billing/entregar-plan-comprado.ts` |
| Dunning (reintentos de fallo) | ✅ +1/+3/+7 días, 3 intentos, lógica pura + servidor | `lib/billing/dunning.ts` / `dunning-server.ts` |
| Cupones/descuentos propios | ⚠️ Existen, pero no hablan con Stripe Coupons | `lib/codigos-descuento.ts` |
| Cupones Stripe (Promotion Codes) | ⚠️ Solo en la suscripción SaaS, no en cobros de socias | `app/api/billing/checkout/route.ts` |
| Prorrateos | ❌ No implementado | — |
| Reembolsos iniciados desde Tentare | ❌ No implementado (solo reactivo vía webhook) | — |
| Disputas/chargebacks (`charge.dispute.created`) | ❌ Sin handler | `app/api/stripe/webhook/route.ts` (solo 5 tipos de evento) |
| Stripe Tax | ❌ No se usa — IVA calculado a mano, por diseño (necesario para Verifactu) | `lib/billing/sellar-factura-server.ts` |

### Por qué NO hay que rehacer nada de esto

La arquitectura elegida (Stripe Connect direct charge + SEPA/Bizum nativos de Stripe, en vez de un PSP adicional tipo GoCardless/Redsys) es la decisión correcta y ya está pagada en complejidad: reutiliza Connect, webhooks e idempotencia existentes. Rehacerlo con otro proveedor sería trabajo perdido sin beneficio — no lo propongas en ninguna fase futura salvo que Stripe deje de cubrir un caso real.

### Lo que sí falta (real, priorizable)

1. **Handler de `charge.dispute.created`**: hoy una disputa de tarjeta no dispara nada en Tentare — ni notificación, ni marca de estado en el recibo. Riesgo: el estudio se entera por el email de Stripe, no por el panel, y el dinero puede quedar retenido sin que nadie en Tentare lo sepa hasta que revisen Stripe directamente.
2. **Reembolsos desde Tentare**: hoy solo se puede reembolsar desde el Dashboard de Stripe. Existe un permiso `billing.refund` en el panel interno que no está conectado a ningún endpoint — hay que decidir si esto es una feature de estudio (staff con `puedeMoverDinero` reembolsa desde su propio panel) o vía Stripe directamente (más simple, pero peor UX).
3. **Prorrateos**: si algún estudio quiere cambiar de plan a mitad de mes, hoy no hay lógica — se resolvería manualmente. No es urgente mientras los cambios de plan sean poco frecuentes.
4. **Cupón propio ↔ Stripe Coupons**: decidir si el código de descuento propio (POS, Decision OS) debe poder aplicarse también a un Checkout de socia, o si conviene mantenerlos separados a propósito (el propio es más simple y ya cubre el caso de uso actual).

### Complejidad estimada de cerrar los 4 puntos
- Disputa: baja (1 caso de webhook + 1 notificación, patrón ya existente en `pago.fallido`).
- Reembolso: media (requiere decidir flujo de permisos + UI + llamada real a `stripe.refunds.create`, y decidir si afecta al estado fiscal — ver §3 rectificativas, que hoy tampoco existen).
- Prorrateo: media-alta (toca el modelo de suscripción y el cálculo de importe a mitad de ciclo).
- Cupón unificado: baja-media (es una decisión de producto tanto como técnica).

---

## 2. Facturación

### Estado actual

✅ **En producción, con hardening reciente de concurrencia (PR #510, el mismo día de esta investigación).**

- Esquema: una factura = un recibo cobrado, sin líneas de detalle (siempre "Servicios de pilates" como concepto único).
- Numeración: `A-{año}-{NNNN}` correlativo por estudio, ahora con `UNIQUE(studio_id, verifactu_seq)` + `UNIQUE(studio_id, numero_completo)` + `pg_advisory_xact_lock` que serializa dos sellados concurrentes del mismo estudio (ej. webhook SEPA + sellado manual del panel a la vez). Esto cerró una condición de carrera que ya se había materializado en datos de siembra (dos facturas con `verifactu_seq=3` duplicado).
- IVA: 21% por defecto, configurable por estudio, desglose base/cuota calculado sobre el total (IVA incluido).
- Exportación CSV con vista previa por factura.
- RLS: **ningún rol de navegador puede escribir una factura** — solo `service_role` desde servidor, porque forma parte de una cadena de hashes que no se puede tocar desde cliente sin romperla.

### Lo que falta

- **Borradores**: no existe el concepto — una factura o no existe, o está sellada. Esto es coherente con Verifactu (no tiene sentido "editar" una factura ya encadenada), pero si algún día se quiere previsualizar antes de sellar, hace falta un estado intermedio explícito.
- **Rectificativas / notas de crédito**: la función pura de cálculo de huella de anulación (`calcularHuellaAnulacion`) **existe y está probada**, pero no tiene ningún llamador en producción — ni tabla, ni endpoint, ni botón. Es cimiento sin funcionalidad. Esto importa en cuanto se implemente cualquier flujo de reembolso real (§1) o se detecte un error en una factura ya sellada: hoy no hay forma de emitir una rectificativa, solo de dejar la factura "incorrecta" tal cual.
- **Columnas Fiskaly invisibles**: `verifactu_csv`/`verifactu_estado`/`fiskaly_invoice_id` se escriben pero no se leen en ningún componente de UI — nadie en el panel puede ver si una factura llegó realmente a la AEAT o se quedó en un estado intermedio.

### Riesgo ya corregido (nota añadida al rescatar este documento, 2026-07-30)

`components/cobros/panel-facturas.tsx` mostraba el banner **"Verifactu — Próximamente / Integración con AEAT en desarrollo"** inmediatamente encima del bloque que, si la factura ya tenía huella, mostraba el QR real — un mensaje objetivamente falso. **Ya arreglado y en main (PR #522, commit `5988fc6`)**: el banner ahora comprueba `verifactuActivo = facturas.some(f => f.verifactuHash)` y solo dice "Próximamente" cuando de verdad no hay ninguna factura sellada.

---

## 3. VeriFactu

### Estado actual

✅ **Implementado y en producción**, con el envío real a AEAT condicionado a credenciales de entorno.

- **Hash chain** (`lib/verifactu.ts`): validado carácter a carácter contra el ejemplo oficial de la AEAT (Orden HAC/1177/2024), en un test que compara contra el vector de referencia real, no una suposición.
- **QR**: URL real de cotejo AEAT (`ValidarQR`), con endpoint de producción y de pruebas separados.
- **Sellado síncrono**: ocurre en el momento del cobro (panel manual o webhook Stripe/SEPA), no hay job async ni cron.
- **Integración Fiskaly SIGN ES** (`lib/billing/fiskaly.ts`): cliente REST completo (auth, alta de emisor/firmante/cliente, firma+transmisión idempotente). Diseñado para fallar en silencio si no hay credenciales: la huella propia se calcula y persiste SIEMPRE, con o sin Fiskaly — el envío real a AEAT es lo único condicionado.
- **Salvaguarda anti-NIF-de-relleno**: bloquea el sellado si el estudio tiene el NIF vacío o el de demo.

### Lo que falta / hay que verificar (no desde el código, sino desde el dashboard de Vercel)

`FISKALY_API_KEY` y `FISKALY_API_SECRET` — **corrección tras cruzar con la memoria del proyecto**: según registro de 2026-07-26, el usuario ya puso estas env vars en Vercel y forzó un redeploy de producción para que `fiskalyConfigurado()` las recoja. Lo que queda pendiente es más acotado de lo que este documento sugería originalmente: confirmar **extremo a extremo** (no solo que las vars existan) que `FISKALY_ENV` esté en el valor correcto (`test` vs `live`) y que `VERIFACTU_ENTORNO=produccion` esté puesto si es `live` (controla el entorno del QR de la AEAT, independiente de `FISKALY_ENV`) — verificable con `scripts/fiskaly-smoke.ts` o mirando si la próxima factura sellada trae `fiskaly_invoice_id` (+ `verifactu_csv` si es `live`). Dado que Verifactu es obligatorio para SIF desde el 29-jul-2025 (ya pasado), vale la pena esa confirmación puntual, pero no es un "activar desde cero".

### Recomendación de arquitectura (confirmación, no cambio)

El diseño actual — huella propia siempre calculada + Fiskaly como capa de transmisión desacoplada y opcional — es exactamente el patrón correcto para convivir con TicketBAI en el futuro (ver §4): el núcleo de datos de la factura no depende del canal de envío. No cambies esto.

---

## 4. TicketBAI

### Estado actual

❌ **No implementado — y correctamente comunicado como tal en la landing pública** (`app/recursos/facturacion-electronica-verifactu/page.tsx`: "Si tu estudio está en País Vasco o Navarra, ahí rige TicketBAI... hoy no está soportado todavía"). A diferencia del banner de facturas (§2), este mensaje SÍ es honesto y está al día.

### Investigación externa — lo que cambia el diseño futuro

TicketBAI **no es un sistema único**: Bizkaia, Gipuzkoa y Álava comparten el concepto pero no comparten endpoint ni exactamente el mismo esquema XML.

- **Bizkaia (Batuz)**: el más exigente — combina TicketBAI con el LROE (Libro Registro de Operaciones Económicas), presenta borradores de IVA/Sociedades/Renta. Despliegue completo para todo el colectivo desde el **1-ene-2026**.
- **Gipuzkoa**: TicketBAI "solo" (Norma Foral 2/2022), sin LROE.
- **Álava**: TicketBAI con endpoint y esquema propios, distintos de los otros dos.

Todas exigen: firma electrónica avanzada (XAdES-BES) + hash chain + envío inmediato en cada factura — sin la bifurcación "modo Verifactu vs No-Verifactu" que sí tiene el territorio común.

### Arquitectura recomendada — para cuando haga falta, no ahora

Es técnicamente viable un módulo compartido: el núcleo (numeración, datos de emisor/receptor, líneas, IVA, importes, lógica de negocio de cuándo se genera una factura) es 100% reutilizable entre Verifactu y TicketBAI. Lo que debe vivir en una **capa de adaptador separada** por sistema:
- Formato de fichero de envío (XML-TBAI foral vs registro Verifactu).
- Firma electrónica (obligatoria siempre en TicketBAI; opcional en Verifactu).
- Encadenamiento (reglas de hash con matices distintos).
- Endpoint/canal (AEAT vs 3 endpoints forales + LROE en Bizkaia).

**Decisión recomendada: no construir esto todavía.** Un estudio en territorio común nunca necesita TicketBAI. Constrúyelo el día que Tentare tenga (o esté a punto de firmar) un cliente real en Euskadi/Navarra — antes de eso es trabajo especulativo. La buena noticia es que la arquitectura actual de Verifactu (huella desacoplada del canal de transmisión) ya deja la puerta abierta sin necesidad de refactor previo.

---

## 5. Factura electrónica estructurada (Facturae/UBL, Ley Crea y Crece)

### Estado actual

❌ **No implementado** (confirmado por auditoría de código — cero menciones reales de Facturae/UBL).

### Investigación externa — novedad relevante

El reglamento de desarrollo de la Ley Crea y Crece **ya se publicó**: **Real Decreto 238/2026** (BOE, 31-mar-2026). Antes de esta investigación el estado era "reglamento pendiente sin fecha" — eso ya no es así, aunque el calendario real sigue sin cerrarse (ver abajo).

**La distinción que importa para Tentare, confirmada:**
- Las facturas de un estudio a sus socios/clientes finales son **B2C** → **quedan expresamente fuera** de esta obligación.
- La relación **Tentare → estudio** (factura de la propia suscripción SaaS) **sí es B2B** → sí quedará sujeta a esta obligación cuando entre en vigor.

**Formato**: cuatro sintaxis admitidas (CII, UBL, EDIFACT, Facturae) bajo el modelo semántico europeo EN16931 — más flexible que "solo Facturae" como en el B2G tradicional.

**Calendario — incierto, no fijar fecha**: los plazos (12 meses para empresas &gt;8M€, 24 meses para el resto) cuentan desde la publicación de una **orden ministerial que aún no existe** (borrador en audiencia pública abril-mayo 2026, sin publicar en firme a fecha de esta investigación). Estimaciones periodísticas apuntan a 2027-2028, pero no son fecha legal confirmada.

### Recomendación

No construir nada todavía — el único caso de uso real (Tentare facturando su SaaS a los estudios) es B2B de bajo volumen (decenas/cientos de estudios, no miles de facturas B2B), y la fecha de obligatoriedad sigue sin fijarse. **Sí vale la pena**, cuando llegue el momento de construirlo, reutilizar el mismo patrón de "núcleo + adaptador de formato" de §3/§4: el core de datos de la factura del SaaS (que hoy vive en Stripe Billing, no en el modelo `facturas` de Tentare) necesitaría un adaptador de exportación a UBL/Facturae, no una reconstrucción.

---

## 6. RGPD

### Estado actual

| Pieza | Estado | Evidencia |
|---|---|---|
| Consentimiento art. 9 antes de guardar dato de salud | ⚠️ Parcial — cierre real en UI, sin refuerzo en BD | `supabase/migrations/0138_consentimiento_datos_salud.sql`, `components/socios/ficha-salud.tsx` |
| Exportación de datos — nivel negocio (CSV) | ✅ | `components/configuracion/tab-integraciones.tsx` |
| Exportación de datos — autoservicio del propio socio | ❌ Solo por email manual | `app/(legal)/privacidad/page.tsx` |
| Derecho al olvido / eliminación de cuenta | ✅ Bien diseñado: borra ficha clínica, anonimiza PII, conserva solo lo fiscal | `app/api/socios/eliminar/route.ts` |
| Retención de backups | ✅ Política explícita (14/8/12/100 días) | `lib/engines/backup-engine.ts` |
| Logs de acceso (lectura) a ficha clínica dentro de un estudio | ❌ No existe | — |
| Registro de Actividades de Tratamiento (RAT) | ❌ No hay ninguna pieza de producto que ayude al estudio a mantenerlo | — |

### El hallazgo más importante de esta sección

El consentimiento de salud (migración `0138`, PR #511) **cierra el hueco de "cero rastro documentado"**, pero es una puerta de UI, no una cerradura de base de datos: no hay `CHECK` ni trigger que impida un `INSERT` directo en `condiciones_salud` sin `consentimiento_salud_fecha`. Esto repite **exactamente el mismo patrón de bug** que ya costó dos agujeros de seguridad reales en este repo (RLS de facturación en 0112, RLS de clientas/citas después) — la lección de esas dos rondas fue "la UI nunca es el límite de seguridad, la RLS es la cerradura real", y aquí el consentimiento vuelve a depender solo de la UI. No es una vulnerabilidad de acceso indebido (la RLS de `condiciones_salud` sí protege por estudio/rol), pero sí es una vulnerabilidad de **cumplimiento**: un futuro importador, script o bug puede guardar datos de salud sin consentimiento, exactamente el escenario que la migración 0138 se propuso evitar.

### Recomendación de arquitectura para RGPD

1. **Reforzar el consentimiento en BD**: añadir un `WITH CHECK` en la policy de `INSERT` de `condiciones_salud` que verifique `socios.consentimiento_salud_fecha IS NOT NULL`, o un trigger `BEFORE INSERT`. Complejidad baja — es el mismo patrón ya usado para roles.
2. **Auditoría de lectura de datos de salud dentro de un estudio**: hoy solo existe auditoría del staff de Tentare auditando estudios clientes (`lib/interno/auditoria.ts`), no de quién dentro de un estudio abre la ficha de salud de una socia. Esto es una brecha real del deber de trazabilidad (art. 5.2/24 RGPD) para categorías especiales. Complejidad media: requiere un evento de "lectura" que hoy no se registra en ningún flujo de la app (todo lo demás se audita en escritura).
3. **Autoservicio de exportación desde el portal de la socia**: hoy el derecho de portabilidad se ejercita por email manual. Dado que ya existe la exportación a nivel de negocio (`exportarExcel`), extenderla a "mis propios datos" desde `app/portal/[slug]` es una reutilización directa, no una construcción desde cero.
4. **RAT como producto, no solo obligación propia**: la AEPD no exige un formato oficial de RAT (vale una hoja de cálculo). Podría ser una feature de venta razonable ("Tentare te ayuda a mantener tu RAT") más que una obligación técnica compleja — es una decisión de producto, no una urgencia legal.

### Lo que NO hace falta hacer

- No hay obligación automática de EIPD/DPIA — depende del volumen y uso concreto, no lo presentes como checklist obligatorio sin matiz.
- No hay guía AEPD específica del sector fitness que seguir al pie de la letra — la única referencia (nota técnica 2019) es genérica y desactualizada; tratarla como orientación, no como norma.
- El plazo de conservación de "5 años" para datos de salud tras la baja es una analogía razonable (prescripción de acciones civiles), no una cifra legal específica para gimnasios — no lo vendas como obligación exacta.

---

## 7. Seguridad

### Estado actual

| Pieza | Estado |
|---|---|
| RLS por rol para dinero (`puede_mover_dinero`) | ✅ Migración `0112` (no las que cita la memoria antigua — corregir esa referencia) |
| RLS por rol para clientas/citas | ✅ (ronda posterior, ver memoria del proyecto) |
| Anti-escalada de privilegios (self-claim) | ✅ Cerrado en varias rondas (`0124`, `0125`, `0131`) |
| `lib/permisos-reglas.ts` como barrera de UI + espejo en RLS | ✅ Patrón confirmado y documentado en el propio código |
| Turnstile (CAPTCHA) a nivel de proyecto Supabase | ✅ En prod (este mismo hilo de trabajo) |
| MFA/2FA | ❌ No implementado |
| Leaked Password Protection | ❌ No activado (requiere plan Pro de Supabase) |
| Cifrado a nivel de columna (pgcrypto/vault) | ❌ No implementado — depende del cifrado de plataforma de Supabase |
| `restaurar_backup` cerrado a `anon` | ✅ (migración `0021`) |
| Auditoría del panel interno (staff de Tentare) | ✅ Tabla solo-append, rechaza UPDATE/DELETE |

### El patrón de riesgo recurrente que hay que romper como proceso, no como parche puntual

Este repo ha tenido **al menos cuatro rondas** del mismo bug de fondo: una regla de permisos vive correctamente en TypeScript (`lib/permisos-reglas.ts`) pero no se refleja en la RLS de Postgres, dejando la UI como única barrera. Ha pasado con facturación, con clientas/citas, con mandatos SEPA/recuperaciones, y ahora aparece de nuevo (más suave) con el consentimiento de salud. **La recomendación de arquitectura más importante de toda esta sección no es una pieza nueva — es un proceso**: cualquier regla nueva en `permisos-reglas.ts` debe llevar aparejada, en el mismo PR, su espejo en RLS (policy o `CHECK`/trigger), no como una tarea "para después". Vale la pena convertir esto en un ítem de checklist de PR, no solo en una lección de memoria.

### Recomendaciones puntuales

1. **MFA para roles con acceso a dinero** (PROPIETARIO, RECEPCION, MANAGER): Supabase Auth soporta TOTP nativo — complejidad media, no requiere infraestructura nueva.
2. **Leaked Password Protection**: es un toggle gratis una vez se suba a plan Pro de Supabase — no hay trabajo de código, es una decisión de negocio (coste del plan).
3. **Cifrado a nivel de columna para datos de salud/NIF**: evaluar si el cifrado de plataforma de Supabase es suficiente para el nivel de riesgo real, antes de añadir la complejidad operativa de `pgcrypto` (gestión de claves, rendimiento de búsqueda). No lo trates como obligatorio sin antes hacer esa evaluación de riesgo/coste.

---

## 8. Contabilidad

### Estado actual

✅ **Sistema propio de "Cierre de año"**, no integraciones con software contable externo.

- `lib/fiscal/cierre-engine.ts`: motor puro y determinista — totales, 4 trimestres, desglose por tipo de IVA, candidatos al modelo 347 (umbral 3.005,06€), estado de sellado Verifactu.
- Exportación CSV + envío directo por email a la gestoría (con recomputación en servidor, no confía en números del cliente).
- Honestidad de alcance explícita en la propia UI: "recopila ingresos e IVA repercutido, no es la declaración; no incluye gastos ni IVA soportado; no se presenta a Hacienda — lo presenta la gestoría".

### Lo que falta

Ninguna integración con software contable/asesoría externo (Sage, A3, Holded, Quipu...). **No lo recomiendo como prioridad**: el público objetivo de Tentare (estudios boutique pequeños/medianos) ya delega la contabilidad en una gestoría externa, y el flujo actual (CSV + email) cubre ese caso de uso razonablemente bien. Solo reconsiderar si aparece demanda real de clientes de cadenas/franquicias con contabilidad internalizada.

---

## 9. Arquitectura — estado real (no una propuesta desde cero)

### Corrección de partida importante

La arquitectura de dinero **ya está modularizada** — no vive en el "god file" `lib/supabase-data.ts` (que solo hace mapeo fila↔objeto, sin lógica de negocio). Cualquier plan que proponga "extraer módulos de supabase-data.ts" estaría resolviendo un problema que ya no existe.

### Inventario real de módulos (≈3000 líneas repartidas, cada uno con responsabilidad única)

```
lib/billing/
├── billing.ts                  — Billing SaaS (Stripe Billing, Tentare→estudio)
├── billing-rules.ts            — Reglas puras de enforcement de plan
├── billing-guard.ts            — Envoltorio HTTP de billing-rules
├── entitlements.ts             — Qué puede hacer un estudio según su plan
├── feature-estudio.ts          — Gate de plan sin sesión resuelta
├── entregar-plan-comprado.ts   — Entrega de lo cobrado tras Checkout (idempotente)
├── stripe-cobros.ts            — Cobro off-session (tarjeta/SEPA)
├── stripe-fees.ts              — Comisión de plataforma (application_fee)
├── metodo-cobro.ts             — Elección pura de método de cobro
├── dunning.ts                  — Lógica pura de reintentos
├── dunning-server.ts           — Efecto real del dunning + notificación
├── renovacion-server.ts        — Aplica renovación al cobrar (idempotente)
├── sellar-factura-server.ts    — Núcleo del sellado Verifactu
└── fiskaly.ts                  — Cliente Fiskaly SIGN ES

lib/fiscal/
└── cierre-engine.ts            — Motor de cierre de año (puro, determinista)

lib/ (sueltos, mismo nivel de disciplina)
├── verifactu.ts                — Hash chain Verifactu (puro)
├── verifactu-qr.ts             — QR cliente-seguro (sin node:crypto)
├── factura-pdf.ts              — Generación/impresión de PDF
├── sepa-19-14.ts               — Remesa bancaria SEPA (pain.008, puro)
├── codigos-descuento.ts        — Descuentos propios (puro)
├── webhook-idempotencia.ts     — Idempotencia de eventos Stripe
└── permisos-reglas.ts          — Reglas de rol (espejo de la RLS)

lib/notifications/
├── engine.ts                   — Publicación in-app síncrona + entrega best-effort
├── catalog.ts                  — Catálogo de eventos/reglas de canal (código, no BD)
└── emit.ts                     — Emisores concretos (pago.fallido, pago.realizado...)

lib/interno/
├── auditoria.ts                — Auditoría del staff de Tentare sobre estudios cliente
└── facturacion-real.ts         — MRR leído de Stripe (no de columnas propias)
```

### Módulos que SÍ faltan (huecos reales, no reorganización)

- **Refunds Module**: no existe ninguna pieza que inicie un reembolso desde Tentare.
- **Disputes Module**: no existe ningún manejo de `charge.dispute.created`.
- **Rectificativas/Notas de crédito**: la función de cálculo existe (`calcularHuellaAnulacion`) pero no tiene módulo de aplicación (tabla, endpoint, UI).
- **TicketBAI Module** (adaptador, ver §4): no existe — correctamente pospuesto.
- **Electronic Invoice Module** (Facturae/UBL, ver §5): no existe — correctamente pospuesto.
- **Audit Module (lecturas sensibles dentro de un estudio)**: no existe — ver §6/§7.

### Dependencias entre módulos (para planificar el roadmap)

- `sellar-factura-server.ts` depende de `verifactu.ts` (hash) + `fiskaly.ts` (transmisión) + `factura-pdf.ts` (indirectamente, para mostrar el resultado). Cualquier Refunds/Rectificativas Module tendría que enganchar aquí, no seguirlo evitando.
- `dunning-server.ts` y `renovacion-server.ts` dependen de `stripe-cobros.ts` y ambos emiten a través de `lib/notifications/emit.ts` — un futuro Disputes Module debería seguir el mismo patrón de emisión, reutilizando el evento `pago.fallido` existente en vez de crear uno nuevo redundante (mismo criterio que ya se aplicó al fallo SEPA).
- Un futuro TicketBAI Module dependería del núcleo de datos de `facturas` (mismo esquema), pero NO debería depender de `fiskaly.ts` (es un cliente específico de Verifactu) — necesita su propio adaptador de transmisión.

---

## 10. Roadmap por fases

**Principio rector: no reconstruir nada de lo que ya está en producción y verificado.** Las fases están ordenadas por urgencia real (bug activo > cumplimiento legal ya vigente > gaps de producto > especulativo).

### Fase 0 — Correcciones inmediatas (horas, no días)
- ~~Corregir el banner falso "Verifactu — Próximamente" en `panel-facturas.tsx`.~~ Hecho (PR #522).
- Actualizar `docs/NOTIFICATION-ENGINE.md` (describe un worker de Inngest que ya se borró).
- Actualizar `docs/FICHA-CLINICA.md` (falta el consentimiento cerrado en migración 0138).
- Corregir el comentario factualmente incorrecto de la migración `0122` (dice que ninguna pantalla llama a las funciones de mandato SEPA; sí lo hace desde el 24-jul).
- Mostrar en el panel las columnas de estado Fiskaly (`verifactu_csv`/`verifactu_estado`) que hoy se escriben pero nadie ve.

### Fase 1 — Cumplimiento legal ya vigente, sin margen (semanas)
- **Confirmar extremo a extremo la transmisión Fiskaly** (`FISKALY_ENV`, `VERIFACTU_ENTORNO`, primera factura con `fiskaly_invoice_id`/`verifactu_csv` reales) — las credenciales ya se pusieron en Vercel el 2026-07-26, pero nunca se verificó end-to-end. Verifactu es obligatorio para SIF desde el 29-jul-2025, ya pasado, así que vale la pena cerrar esta confirmación, aunque el trabajo pesado ya está hecho.
- Reforzar el consentimiento de salud con `CHECK`/trigger en BD (no solo UI).
- Handler de `charge.dispute.created` + notificación.

### Fase 2 — Gaps de producto con demanda razonable (1-2 meses)
- Reembolsos iniciados desde Tentare (conectar el permiso `billing.refund` a un endpoint real).
- Rectificativas/notas de crédito (aplicar la función ya existente y probada).
- Auditoría de lectura de datos de salud dentro de un estudio.
- Autoservicio de exportación de datos desde el portal de la socia.
- MFA/TOTP para roles con acceso a dinero.

### Fase 3 — Robustez y escala (según crecimiento real, no calendario fijo)
- Prorrateos de cambio de plan a mitad de ciclo.
- Unificar (o documentar como decisión definitiva) los dos sistemas de cupones.
- Evaluar Leaked Password Protection al subir de plan Supabase.
- RAT como feature de producto para los estudios.

### Fase 4 — Especulativo, solo cuando haya cliente/fecha real
- TicketBAI (solo si hay cliente real o inminente en País Vasco/Navarra).
- Factura electrónica estructurada B2B (Tentare→estudio) — esperar a que se publique la orden ministerial que fija el calendario real; el diseño de "núcleo + adaptador" ya está implícito en cómo se construyó Verifactu, así que no hace falta anticipar trabajo.

---

## 11. Riesgos

### Riesgos legales/fiscales
- **Verifactu**: las fechas ya se aplazaron una vez (RDL 15/2025); tratar el calendario actual (SIF ya vigente, empresas 1-ene-2027, autónomos 1-jul-2027) como "estado a día de hoy", con revisión periódica, no como definitivo.
- **Ley Crea y Crece B2B**: la fecha real depende de una orden ministerial aún no publicada — no comprometer una fecha de entrega interna basada en estimaciones periodísticas.
- **TicketBAI**: mientras Tentare no tenga clientes en Euskadi/Navarra, el riesgo de no tenerlo es cero legal y solo comercial (competidores que sí lo anuncian).

### Riesgos técnicos
- **Deuda de documentación activa, no solo desactualizada**: dos documentos (`NOTIFICATION-ENGINE.md`, banner de facturas) describen componentes que ya no existen o ya cambiaron — riesgo real de que una futura sesión (humana o IA) tome una decisión basada en información falsa sobre el propio producto.
- **Patrón recurrente de "regla en TS sin espejo en RLS"**: ya ha costado 3-4 rondas de fixes de seguridad reales. Sin un cambio de proceso (checklist de PR), es probable que vuelva a pasar con la próxima regla de permisos nueva.

### Riesgos de seguridad
- Ausencia de MFA en roles con acceso a dinero — mitigable con Supabase Auth nativo, sin infraestructura nueva.
- Ausencia de logs de lectura de datos de salud — brecha de trazabilidad RGPD, no de acceso indebido (la RLS sí protege el acceso).

### Riesgos de producto/futuros
- Sin capacidad de reembolso/rectificativa propia, cualquier error de cobro obliga a intervención manual en Stripe — no escala bien si el volumen de estudios crece.
- Notificaciones externas son best-effort síncronas (fetch con timeout 10s, sin cola) — no es un problema hoy, pero vigilar si el volumen de eventos crece mucho (ver escalabilidad).

---

## 12. Escalabilidad

### Ya construido con esto en mente

- **RLS por tenant** en todas las tablas de dinero — aísla cadenas/franquicias del resto sin trabajo adicional.
- **Índices de cobertura** en las 4 tablas de dinero (`recibos`, `facturas`, `suscripciones`, `mandatos_sepa`), aunque repartidos en varias migraciones sueltas en vez de una tanda dedicada de rendimiento.
- **Cron de renovación/dunning/backups vía Inngest con fan-out y concurrencia limitada** (reemplazó un cron serie-por-estudio que se quedaba sin tiempo con muchos estudios) — este es exactamente el patrón que escala a "miles de clientes simultáneos".
- **Menú por cadena, no por sede** (decisión de producto ya cerrada) — soporta franquicias sin duplicar configuración.
- **Caché limitada a catálogo público** (no financiero) — decisión correcta: cachear tablas de dinero por-socia con RLS sería un riesgo de fuga entre tenants, no una optimización segura.

### Vigilar, no urgente

- El motor de notificaciones es síncrono con entrega best-effort — si el volumen de eventos externos (email/WhatsApp/SMS) crece mucho, podría convenir una cola real. No lo construyas de forma preventiva; es una señal a monitorizar, no un gap actual.
- No hay una práctica sistemática y nombrada de auditoría de rendimiento (los fixes existen, pero repartidos en PRs puntuales con distintos nombres) — considerar consolidar esto en un proceso recurrente cuando el volumen de datos por estudio crezca significativamente.

---

## Cosas que la investigación encontró y no estaban en el encargo original, pero importan

1. ~~**El banner falso de Verifactu en producción** (§2)~~ — corregido en PR #522 antes de que este documento llegara a main.
2. **Los "dos sistemas SEPA"** (Stripe SEPA vs remesa 19.14) son fácil de confundir en cualquier conversación futura sobre "SEPA" — este documento los distingue explícitamente para que no se mezclen en el roadmap.
3. **El comentario incorrecto en la migración `0122`** — no cambia la corrección del fix de seguridad, pero es un dato falso que quedará en el historial si no se corrige cuando se vuelva a tocar ese archivo.
4. **La referencia de memoria a migraciones "0107/0108/0109/0113/0117" como las de RLS de roles/dinero es incorrecta** — la migración real es `0112`. Vale la pena corregir esa referencia en la memoria del proyecto para no propagar el número equivocado en futuras conversaciones.
5. **El permiso `billing.refund` del panel interno no está conectado a ningún endpoint** — mismo patrón ya detectado antes ("9 de 12 permisos no frenan nada"), pero es la primera vez que se confirma en el contexto específico de reembolsos.

---

## Fuentes de la investigación legal externa

| Fuente | Fecha | Fiabilidad |
|---|---|---|
| [BOE-A-2026-7295 (RD 238/2026)](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-7295) | 31-mar-2026 | Oficial — máxima |
| [Proyecto de Orden Ministerial (Hacienda)](https://www.hacienda.gob.es/sgt/normativadoctrina/proyectos/16042026-proyecto-pom-factura-electronica.pdf) | 17-abr-2026 | Oficial, pero borrador |
| RDL 15/2025 — aplazamiento Verifactu (BOE 3-dic-2025), vía fuentes jurídicas (COAG, noticias.juridicas.com) | dic-2025 | Alta — múltiples fuentes coinciden |
| Documentación técnica BATUZ (Bizkaia.eus) | continua | Oficial (Diputación Foral de Bizkaia) |
| Norma Foral 2/2022 (Gipuzkoa), vía intermediarios | 2022 | Media — no verificado contra texto foral original |
| [AEPD — nota técnica apps salud/actividad física](https://www.aepd.es/prensa-y-comunicacion/notas-de-prensa/la-aepd-publica-unas-directrices-orientadas-aplicaciones) | 17-sep-2019 | Oficial, pero desactualizada y genérica |
| [AEPD — EIPD, preguntas frecuentes](https://www.aepd.es/preguntas-frecuentes/2-tus-obligaciones-como-responsable-del-tratamiento/10-evaluacion-de-impacto) | vigente | Oficial |
| [AEPD — Registro de Actividades de Tratamiento](https://www.aepd.es/prensa-y-comunicacion/blog/elaborar-el-registro-de-actividades-de-tratamiento) | vigente | Oficial |

**Puntos abiertos a revisar cuando haya más información**: fecha exacta de la orden ministerial de factura electrónica B2B (de ahí cuelga el calendario real); diferencias exactas de esquema Álava vs Gipuzkoa (solo verificado vía intermediarios, no fuente foral primaria); el plazo de conservación de datos de salud de socios dados de baja es una inferencia razonada, no una cita legal exacta para gimnasios — no presentarlo como obligación de 5 años sin ese matiz.
