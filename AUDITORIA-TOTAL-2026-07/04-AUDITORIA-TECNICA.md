# 04 · Auditoría técnica — arquitectura, código, base de datos, rendimiento, seguridad

> Parte 4. Basada en lectura directa del código, las 33 migraciones, el grafo graphify y el digest de auditorías previas (AUDITORIA-CTO/ESCALABILIDAD/PRODUCTO/CALENDARIO, jul-2026).
> **Stack:** Next.js 16.2.9 · React 19 · Supabase (Postgres+Auth+RLS) · Stripe Connect+Billing+Terminal · Inngest · Resend · Anthropic · Cloudflare R2+Stream · Sentry · shadcn/Tailwind 4. `pilates-saas` / marca "Tentare". 157 archivos en `lib/`, 58 tablas, 41 archivos de test.

## 0. Veredicto técnico en una frase

**No es un MVP: es un producto sprawling y sorprendentemente maduro en seguridad y corrección de dinero, construido sobre una arquitectura de datos que es su mayor pasivo.** Las auditorías de jul-8/9 encontraron P0s existenciales (RLS abierta, endpoints sin auth, aforo vendible, sin billing) y **la mayoría ya se han arreglado**. Lo que queda no es "está roto", es "está construido de una forma que no escala ni se mantiene, y se ha extendido a demasiadas superficies antes de dominar ninguna".

## 1. Lo que YA se arregló (crédito donde toca — no lo repito como abierto)

- ✅ **RLS cerrada en las 58 tablas.** `current_studio_id()`/`current_rol()` como ancla, patrón `admin_*`/`owner_*`/`public_read_*`. El leak histórico a `'studio-1'` y la escalada de privilegios a `PROPIETARIO` están corregidos (default NULL).
- ✅ **Aforo/reservas atómico.** RPCs `reservar_plaza`/`cancelar_reserva_plaza`/`consumir_sesion_bono` con `FOR UPDATE`, promoción de waitlist atómica, índices únicos parciales (`uq_reserva_activa_socio_sesion`). El oversell está muerto.
- ✅ **RPCs peligrosas revocadas a `anon`** (`0029`): `ajustar_creditos`, `reservar_plaza`, etc. ya no ejecutables por la anon key. Guard de studio añadido.
- ✅ **Datos de salud (art. 9 RGPD) con RLS** (`0030`) tras haber estado expuestos a anon en `0004`.
- ✅ **Billing SaaS + entitlements** (`/suscripcion`, `entitlements.ts`, `billing-guard.ts`) → el hallazgo "M-1: no hay modelo de negocio" está resuelto.
- ✅ **Verifactu** (hash chain + QR) construido.
- ✅ **Política de cancelación** (`esCancelacionTardia`, `cancelacion_ventana_horas`), **no-show real** (`barrerNoShows`→`NO_ASISTIO`), **consumo de bono al reservar**, **flag `reserva_exigir_plan`**, **rate-limiting** (`0031`), **idempotencia de webhook** (`0032`), **dinero en `numeric(10,2)`** (no float), **timestamps `timestamptz`**.

Esto es mucho. La corrección de dinero y la postura de seguridad están hoy en un nivel razonable de producción. **El problema ya no es seguridad; es arquitectura, mantenibilidad, rendimiento y foco de producto.**

## 2. 🔴 Deuda de arquitectura (el pasivo nº1)

### 2.1 Los "god files" — el problema estructural dominante
| Archivo | LOC | Problema |
|---------|-----|----------|
| `lib/supabase-data.ts` | **3.780** | **144 funciones exportadas** — es el "backend" entero en un módulo. Toda la capa de datos acoplada. |
| `lib/studio-context.tsx` | **2.713** | God-context React: carga ~37 tablas en un `Promise.all` al montar, decenas de `useState`, objeto `value` gigante. Corre el negocio **en el navegador**. |
| `app/(dashboard)/configuracion/page.tsx` | **2.223** | 13 tabs en un archivo (ya en refactor incremental I9). |
| `calendario/page.tsx` | 1.923 · `socios/[id]` 1.535 · `pagos` 1.498 · `marketing` 1.398 · `reservar/[slug]` 1.203 | Páginas monolíticas con lógica de negocio inline. |

**Causa raíz (de AUDITORIA-ESCALABILIDAD):** no hay un backend real. `studio-context.tsx` es el backend de facto ejecutándose en cada navegador; `fetchCriticalStudioData()` dispara decenas de `select('*')` en paralelo **sin `.range()`/`.limit()`/filtro de fecha**, y toda la lógica (KPIs, aforo, gamificación, informes) corre sobre arrays completos en JS. **111 `select('*')`** en el repo. Con un estudio de años, la carga inicial trae cientos de miles de filas al cliente; PostgREST **trunca silenciosamente a 1000 filas** → dashboards e informes **incorrectos**, no solo lentos.

**Impacto:** rompe con el primer estudio mediano que lo use en serio >1 año (no a 500k tenants — mucho antes). Mantenibilidad: cambiar cualquier cosa toca archivos de miles de líneas → velocidad de desarrollo baja y riesgo de regresión alto.

### 2.2 Sprawl de producto — 5 productos en uno
Superficie actual (una persona/equipo pequeño): calendario, citas, POS, pagos, facturas Verifactu, transacciones, productos, socios+CRM+import, equipo+chat interno, marketing+automatizaciones+códigos, comunidad (feed social), mensajería, notificaciones, **ondemand (vídeo)**, informes, **centro-de-control (Decision OS: 7 especialistas IA)**, gamificación completa (logros/niveles/retos/recompensas/streaks/créditos), ficha clínica, theming white-label, portal de socio (12 pantallas), kiosk, **integraciones stub** (PayPal/Zoom/Kisi/WhatsApp).

**Diagnóstico brutal:** has construido la superficie de Mindbody con los recursos de una startup pre-PMF. **Es exactamente el "feature bloat" que el mercado ODIA de Mindbody** (queja: "pagar por features que no uso"). Ninguna de esas 20 áreas es hoy best-in-class, y cada una es superficie de bugs y mantenimiento. La disciplina de Linear/Notion sería: **hacer 3 cosas excepcionales, no 20 mediocres.**

### 2.3 Decision OS + gamificación: ¿activo o distracción?
- **Decision OS** es un subsistema grande y autocontenido (`lib/decision/`, 7 especialistas, engines motor/director/prioridad/confianza/memoria, Inngest, `components/decision`, `api/decisiones`). Conceptualmente es el "operations layer" que el mercado pide (§02.4). **Pero:** está gated (ESTUDIO/CADENA), **solapado deliberadamente con `/automatizaciones`** (INVENTARIO §5.3 documenta triggers duplicados), y tiene **3 tipos de recomendación muertos** (`CONGELAR_MEMBRESIA`, `REVISAR_PRECIO`, `MOVER_HORARIO` — nunca generados, documentado en `tipos-muertos.test.ts`). Riesgo: es "IA que impresiona en demo" y no "IA que llena la clase del martes".
- **Gamificación** (7 engines): mucho código para features de valor no demostrado en boutique Pilates (¿tus dueñas de estudio piden retos y niveles, o piden llenar clases y cobrar?). Candidato nº1 a **infrautilizado** (ver archivo 05).

## 3. 🟠 Código — smells priorizados por impacto

1. **God files** (§2.1) — refactor a módulos de dominio (`data/reservas.ts`, `data/socios.ts`…) y a data-fetching server-side. **Máximo impacto en velocidad y correción.**
2. **`select('*')` × 111 + sin paginación** — over-fetch y truncado a 1000 filas. Migrar a columnas explícitas + agregación server-side (RPC/vistas) para informes.
3. **Lógica de negocio en el cliente** — mover aforo/KPIs/informes/dunning a servidor (ya hay buen precedente: las RPCs de reserva). El resto debería seguir ese patrón.
4. **`STUDIO_ID` como singleton mutable de módulo** — verificado: **no lo usa ningún path de servidor** (crons/API pasan `studioId` explícito) y el default vacío es mitigación deliberada; el riesgo está contenido al cliente. Aun así, es un anti-patrón que **bloquea paralelizar crons** y es una landmine si alguien llama una función de lectura desde servidor sin pasar studio. Eliminar a favor de paso explícito.
5. **Integraciones de última milla incompleta (CORRECCIÓN vs digest de julio).** `whatsapp.ts`/`paypal.ts`/`zoom.ts` **NO son fachadas**: son clientes API reales y funcionales (envío WhatsApp vía Meta Cloud API, OAuth + crear/capturar orden PayPal, OAuth S2S + crear reunión Zoom), y el badge "Conectado" está **honestamente gated** por ENV real + test de conexión (`/api/integrations/estado`). La crítica "publicidad engañosa" de AUDITORIA-ESCALABILIDAD era del estado de julio-9 y **ya está mitigada**. Lo que queda es genuino pero menor y **documentado en los propios comentarios**: falta el *cableado de última milla* (PayPal como método en el checkout de socias, Zoom atado a clases online concretas). Acción: cablear la 1-2 que aporten, no ocultar nada. **Sí abierto:** el "disconnect" de Stripe Connect solo limpia estado del navegador, no la DB (deuda documentada).
6. **Crons como bucles secuenciales sobre todos los tenants en una invocación** (`maxDuration=300`, "parche P0-37 hasta la cola P0-36"). Primer muro de escala real; migrar a fan-out Inngest por tenant.
7. **41 tests** cubren bien la lógica pura (bono, booking, billing, verifactu, rate-limit) — **buena señal**. Falta cobertura E2E de los flujos de dinero completos.

## 4. 🟠 Base de datos — hallazgos (detalle completo en el informe del agente de BD)

**Fuertes:** RLS en todas las tablas; dinero `numeric(10,2)`; `timestamptz`; índices `studio_id` en todas; índices compuestos/únicos parciales bien elegidos en reservas; Verifactu hash chain.

**Abiertos, priorizados:**
| Prioridad | Hallazgo | Acción |
|-----------|----------|--------|
| 🔴 Seg. | 4 tablas con `GRANT ALL ... TO anon` explícito (`comentarios_comunidad`, `campos_personalizados`, `plantillas_email`, `instructor_dependency_snapshots`) — protegidas solo porque RLS no tiene policy anon. Defensa frágil. | `REVOKE ALL ... FROM anon, authenticated`. |
| 🟡 Cal. | `supabase/schema.sql` **desincronizado** con las migraciones (CORRECCIÓN: ya lleva aviso "⚠️ NO EJECUTAR — NO AUTORITATIVO" y NO está en el path de deploy; `config.toml` usa migraciones). El riesgo real **no es de seguridad en prod** sino de **tipos de dev incorrectos** (`gen-db-types.py` lo lee: le falta `usuarios`, nullability desfasada). | Reconciliar schema.sql para tipos correctos (C-7), sin urgencia de seguridad. |
| 🟠 Seg. | `instructores.rol` y `usuarios.rol` **sin CHECK** y alimentan `current_rol()`→RLS `PROPIETARIO`. | Añadir `CHECK (rol IN (...))`. |
| 🟠 Perf | **`instructor_id` sin índice** en 6 tablas (sesiones, citas, notas_progreso, videos, mensajes_equipo, preferencias). | Crear índices. |
| 🟠 Perf | **`socio_id` sin índice** en ~11 tablas de historial/transacción que solo indexan `studio_id` → la ficha de socio hace N seq-scans. | Crear índices. |
| 🟠 Perf | FKs sin índice: `sesiones.sala_id/tipo_clase_id`, `facturas.recibo_id`, `suscripciones.plan_id`, `reservas.spot_id`, `socios.referido_por`. | Crear índices. |
| 🟡 Integr. | Sin `UNIQUE` en email de socio por estudio (índice no-único); PKs de texto app-generadas sin default DB; contadores denormalizados que pueden derivar (likes, campañas, member_credits). | Constraints + job de reconciliación. |
| 🟡 Integr. | Casi **sin CHECK de no-negatividad** en importes/aforo/cantidad. | Añadir CHECKs. |
| 🟡 Proc. | **Colisiones de numeración de migración** (`0004`×2, `0014`×2) ya causaron que 2 fixes de seguridad **no se aplicaran en prod** (renumeradas a `0029`/`0030`). Riesgo de proceso recurrente. | Convención de numeración + verificación post-deploy. |
| 🟡 Ops | `search_path` mutable en ~8 funciones base; `rate_limits`/`webhook_events` sin purga automática. | Hardening + purga programada. |

**Acción de verificación nº1 (de la propia auditoría previa):** confirmar en **producción** que `0029` y `0030` se aplicaron de verdad dado el historial de colisiones. Ejecutar `scripts/verify-rls-salud.sql`.

## 5. 🟠 Rendimiento

- **Frontend:** god-context carga todo al montar; páginas sin virtualización de listas; `pagos` hace ~2×10¹⁰ operaciones al abrir el modal de cobro masivo (P0-19, escalabilidad); campañas O(n×m). Todo esto es "corre el negocio en JS sobre arrays completos".
- **Backend/DB:** faltan índices FK (§4); informes sobre `select('*')` truncados a 1000 → **incorrectos**. La agregación debe bajar a Postgres (RPC/vistas materializadas).
- **Crons:** secuenciales por tenant en una invocación; Inngest free (concurrencia 5 compartida) es el primer muro.
- **Prioridad realista:** no es "aguantar 500k tenants". Es **"aguantar 50 estudios reales con 2 años de datos sin que informes y dashboards mientan"**. Eso exige: paginación + agregación server-side + índices. Es alcanzable y es P0.

## 6. 🟡 UX — fricciones detectadas (recorrido de código + patrones de competidores)

- **Portal de socio = web app con auth de magic link/OTP**, no app nativa. El mercado premia la app nativa (Momence 4.9). Tu portal es correcto pero es una desventaja percibida frente a "branded app".
- **Onboarding sin trial** (cobro día 1) → fricción de adquisición (§03.5).
- **Reserva pública `reservar/[slug]` = 1.203 LOC 100% client-side** → sin SEO, primer paint en blanco (I-* de CALENDARIO). Los benchmarks (Acuity/Calendly) enseñan: **reserva sin cuenta, auto-timezone invisible, self-reschedule por link de email, buffers por servicio, deep-link con prefill, waitlist auto-fill.** Roba esos patrones.
- **Acciones destructivas solo en hover** (invisibles en iPad — la recepción usa tablet). 
- **Textos que prometen lo que no ocurre** (CALENDARIO C-1: "te avisaremos si se libera plaza" sin envío real) — **verifica si sigue abierto**; es "el peor tipo de bug: erosiona la confianza en el dinero".
- **13 tabs de configuración en una pantalla** — candidato a simplificar (progressive disclosure).

## 7. Riesgos técnicos (registro)

| Riesgo | Severidad | Nota |
|--------|-----------|------|
| Informes/dashboards **incorrectos** por truncado a 1000 filas | 🔴 Alta | Erosiona confianza y decisiones; parece "menor" pero es corrección, no perf. |
| Tipos de dev incorrectos por `schema.sql` desincronizado | 🟡 Media | Solo tipos (no prod: ya lleva aviso "NO EJECUTAR" y no está en el deploy). |
| Velocidad de desarrollo colapsada por god files | 🟠 Media-Alta | Cada feature nueva es cara y arriesgada. |
| Sprawl → superficie de bugs > capacidad de mantenimiento | 🟠 Media-Alta | El equipo no puede pulir 20 áreas. |
| Integraciones sin cablear en checkout/clases (no fachada) | 🟡 Baja-Media | Clientes API reales, badge honesto; falta última milla. |
| Colisión de numeración de migraciones | 🟡 Media | Proceso, ya mordió 2 veces. |
| Dependencia de Inngest free / crons monolíticos | 🟡 Media | Muro de escala conocido. |

## 8. Deuda técnica — resumen priorizado
1. **Romper los god files** y mover data-fetching + agregación a servidor (paginación, columnas explícitas, RPC/vistas). *Desbloquea todo lo demás.*
2. **Índices FK faltantes** + CHECKs + `UNIQUE` email. *Barato, alto ROI.*
3. **Reconciliar `schema.sql`** con migraciones de seguridad + revocar grants anon frágiles + CHECK en `rol`.
4. **Decidir el destino del sprawl**: fusionar Decision OS ↔ automatizaciones, borrar tipos muertos, ocultar/cablear integraciones-fachada, cuestionar gamificación.
5. **Fan-out de crons** por tenant (Inngest) antes de que el primer cliente mediano lo note.
6. **Verificar en prod** aplicación de `0029`/`0030` y numeración de facturas atómica/única.
