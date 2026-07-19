# Sesión 2026-07-19 · Fase 1 Pagos España + Reserva estilo Acuity (Tentare / pilates-saas)

Registro de conocimiento de una sesión de trabajo sobre el SaaS de estudios de Pilates **Tentare** (repo `pilates-saas`, dominio `www.tentare.app`, Next.js 16 + Supabase + Stripe Connect + Inngest). 8 PRs mergeados a producción.

## Fase 1 — Pagos España (completa, en producción)

### Stripe Connect + incidente de seguridad
- Causa raíz de "Conectar con Stripe no funciona": el OAuth de Connect para cuentas Dashboard/Standard estaba **desactivado** y sin redirect URI. Se activó el toggle "OAuth para cuentas del Dashboard" + se registró la redirect URI `https://www.tentare.app/api/stripe/connect/callback`. client_id LIVE `ca_UuDccHt2GlvErkK11vrFCUsyTWcsSZ2X`, TEST `ca_UuDcX2LiIh83pFAnVWcnFcNsh7mfzgXM`.
- **Incidente de seguridad**: la env var pública `NEXT_PUBLIC_STRIPE_CONNECT_CLIENT_ID` en Vercel contenía una **clave secreta live `sk_live_`** (se horneaba en el bundle del navegador → fuga). Remediación: el usuario rotó la clave y actualizó `STRIPE_SECRET_KEY`; se corrigió la var pública al `ca_` correcto; redeploy sin build cache. Conexión real verificada en BD (estudio "Pilates Boutique" `acct_1TsuAiJyFtzyfjtm`).
- Modelo de cobro a socias: **direct charge** en la cuenta conectada (`{ stripeAccount }`), sin comisión de plataforma.

### Dunning / gestión de impagos (PR #120, migración 0041)
- Reintentos automáticos de cobro de recibos: calendario **+1 / +3 / +7 días → estado terminal FALLIDO**.
- Núcleo puro `lib/billing/dunning.ts` (planificarTrasFallo, +tests). Barrido diario Inngest `lib/inngest/dunning.ts` (dispatcher cron 08:30 → dunning-estudio). `registrarFalloCobro` en `lib/billing/dunning-server.ts` lo usan por igual el webhook (devolución SEPA) y el barrido (rechazo tarjeta).
- Notificaciones: email a la socia solo en 1er fallo y fallo definitivo; aviso in-app al estudio solo en el definitivo. Recibo FALLIDO recobrable si paga después.
- **Bug arreglado**: la Idempotency-Key de Stripe en `cobrarReciboOffSession` estaba anclada solo al reciboId → un reintento devolvía el mismo PaymentIntent fallido; ahora incluye `-i{intento}`.
- Migración 0041: `recibos.proximo_reintento timestamptz` + CHECK estado con FALLIDO + índice parcial. Sin backfill (solo recibos nuevos). Aplicada y verificada en prod.

### SEPA + Bizum
- SEPA Direct Debit (domiciliación recurrente, PI 'processing' → recibo EN_CURSO, resuelto por webhook) + Bizum (POS + online). Código en PR #104 (mergeado antes de esta sesión).
- Activado SEPA en la config de métodos de pago de cuentas conectadas (modo LIVE). Bizum queda bloqueado ("Requiere acción de cuenta" = KYC de entidad ES).
- **Gotcha SEPA (PR #132)**: la socia veía el error técnico en inglés de Stripe ("sepa_debit is invalid") al domiciliar. Causa: la cuenta conectada Standard tenía "Adeudo directo SEPA" **Deshabilitado** (NO es KYC — solo apagado). Una cuenta Standard gestiona sus propios métodos con su propio login; la plataforma no puede activarlo (vista de solo lectura). Cada estudio debe activar SEPA en su dashboard. Fix de código: `app/api/stripe/setup-sepa/route.ts` loguea el detalle y devuelve mensaje amigable ES + code SEPA_NO_DISPONIBLE.

### Trial 14 días (PR #124)
- Prueba gratuita de 14 días con tarjeta (vía Stripe Checkout, `subscription_data.trial_period_days`), solo en la PRIMERA suscripción (gated por `subscription_status` vacío). `entitlements.ts` constante TRIAL_DIAS. El estado 'trialing' ya daba acceso → sin cambios de enforcement. UI `/suscripcion` muestra "14 días gratis" + días restantes. Sin migración.

### Migración asistida (importador de socias)
- Descubrimiento: ya existía un importador CSV de socias completo (`/socios/importar`, parser propio RFC-4180 `lib/csv.ts`, auto-mapeo con sinónimos ES/EN tipo Bsport/Mindbody, dedup, límite de plan).
- **PR #125**: el importador ahora preserva `fecha_alta` ORIGINAL (antes forzaba now()) + dirección + fecha de nacimiento. `parsearFecha` europeo/ISO lenient.
- **PR #126**: importador NUEVO de membresías/bonos (`/socios/importar/membresias`, `app/api/suscripciones/import`): empareja email→socia y nombre→plan, crea suscripciones con saldo de bono y fechas, dedup de ACTIVA (socia+plan). Auto-mapeo refactorizado a genérico compartido en `lib/csv.ts`.

## Reserva estilo Acuity (rework de UX de reserva)

- Objetivo: modernizar la reserva de clases de grupo (sesiones+reservas) con UX estilo Acuity, reutilizando el backend robusto (aforo/lista de espera/spots con RPCs atómicos `reservar_plaza`/`cancelar_reserva_plaza`).
- **Componente compartido** `components/reserva/reserva-calendario.tsx` (+ lógica pura `lib/reserva-calendario-logic.ts` con fechas en hora LOCAL): tira de semana → lista de huecos del día → hoja inferior con detalle + spot picker (ocupados deshabilitados) + CTA contextual (Reservar / Lista de espera / Cancelar). Theme-driven por props (`t: ModoTokens`), reutilizable. Accesible (roles ARIA). **Verificado visualmente en móvil** (spot picker R1-R8, selección resaltada, botón RESERVAR).
- **PR #139**: integrado en el portal (`app/portal/[slug]/clases/page.tsx`), mapeo de datos de useStudio en una pasada, preserva el patrón optimista→autoritativo.
- **PR #149**: adoptado en el widget público `/reservar/[slug]`, con enganche cuidadoso al step-machine público existente (login/registro/contrato): `handleReservarCalendario` con 3 ramas (no autenticada → openBooking; sin contrato/gate → openBooking; lista → addReserva directo devolviendo el estado). Borra solo código muerto. Pendiente menor: "sheet stacking" cuando la socia no está logueada.

## PR 2b pendiente — Auto-reserva de citas 1:1 (diseño decidido, sin construir)

- Es un mini-proyecto (varios PRs). Decisiones: **disponibilidad FINA propia para citas** (NO reutilizar `instructora_disponibilidad`, que solo guarda 3 bandas gruesas 06-14/14-20/20-23:59 de la rejilla de Sustituciones → daría huecos irreales) — crear modelo nuevo + editor de horario fino.
- Catálogo de servicios nuevo (migración, siguiente nº libre tras 0045): por tipo de cita → {auto_reservable, duración, precio} + pantalla staff.
- Motor de huecos puro `lib/citas/slots.ts` (reusar `solapan`/`detectarConflictos` de `lib/calendar-logic.ts`), TZ Europe/Madrid.
- API pública `app/api/public/citas/route.ts` espejo de `app/api/public/reserva/route.ts` (identidad del JWT, nunca del body). UI en portal + tab en `/reservar`, `CitaSlot` propio.

## Contexto / gotchas de infra
- Muchas worktrees activas de otras sesiones; crear ramas siempre con `git checkout -b <rama> origin/main` DENTRO del worktree (sin cd al repo principal, que puede estar sucio/con index.lock). Validación: `node_modules/.bin/tsc --noEmit` + `node --test --experimental-strip-types "lib/**/*.test.ts"`.
- Migraciones: main iba por 0045 (avances de Sustituciones de otras sesiones: valoraciones 0044, equipo 0045); colisión previa de dos `0041_*`. Verificar esquema real (schema.sql está desincronizado).
- Otras sesiones avanzaron el wedge de Sustituciones en paralelo (motor de escalado Inngest, valoraciones, rediseño de equipo).
