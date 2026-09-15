# Tentare Sales OS — Arquitectura de Integración

**Documento de auditoría y diseño para Sales OS (Tentare Founder Outreach System)**

**Estado:** Completo — Auditoría y Arquitectura. Pendiente: aprobación antes de Fase 1.

**Fecha:** 2026-09-15

---

## Resumen Ejecutivo

Tentare ha identificado la necesidad de un sistema interno para gestionar la captación comercial de nuevos estudios de Pilates. El proyecto se llama **Sales OS** y es un módulo completamente interno (no un producto para clientes).

Hallazgo clave de la auditoría: **el repo ya tiene 60–70% de la infraestructura necesaria**. Existe:
- Sistema de leads (`plataforma_lead` en BD)
- Sistema de prospección inicial (`/interno/crecimiento`)
- Infraestructura de emails (Resend + Spacemail)
- Sistema de jobs (Inngest)
- Arquitectura de permisos granulares
- RLS configurado correctamente

**Riesgo principal:** Spacemail tiene restricciones contra cold outreach masivo. Se requiere validación legal del caso de uso antes de Fase 5.

---

## 1. Auditoría de Arquitectura Actual

### 1.1 Sistema de Leads Existente

**Tabla principal:** `plataforma_lead` (migr 0136)

```
id              text PK
email           text UNIQUE
nombre          text
estudio         text (nombre del negocio)
telefono        text
ciudad          text
software_actual text
mensaje         text
origen          text CHECK ('CONCIERGE'|'ALTA'|'SOPORTE'|'MANUAL'|'REFERIDO')
estado          text CHECK ('NUEVO'|'CONTACTADO'|'DEMO'|'PRUEBA'|'CLIENTE'|'PERDIDO')
motivo_perdida  text
proximo_paso    text
proxima_fecha   date
studio_id       text FK studios(id) ON DELETE SET NULL
notas           text
responsable     uuid
creado_en       timestamptz
actualizado_en  timestamptz
```

**RLS:** Habilitado. Sin políticas = acceso solo a `service_role` (tras validar permiso en servidor).

**Índices:** Email único, búsqueda por estado/fecha.

### 1.2 Sistema de Prospección Existente

**Ruta:** `/interno/crecimiento/prospeccion`

**Funcionalidad actual:**
- Importación de CSV con mapeo de columnas
- Generación de borradores (IA)
- Revisión manual
- Envío por lotes (10 máximo) via Spacemail

**No existe:**
- Pipeline Kanban
- Lead research/enriquecimiento
- Campañas y secuencias
- Inbox de respuestas
- Tasks
- Analytics

### 1.3 Sistema de Emails

**Transaccional:** Resend
- **Uso:** Recibos, recordatorios, confirmaciones a clientes
- **Reputación:** Alta (tráfico esperado)

**Outreach en frío:** Spacemail (SMTP)
- **Uso:** Prospección commercial
- **Razón de separación:** Proteger reputación de Resend
- **Configuración requerida:** `SPACEMAIL_USER`, `SPACEMAIL_PASSWORD`, `SPACEMAIL_FROM`
- **Archivo:** `lib/marketing/prospeccion-smtp.ts`

**EmailProvider actual:** No existe abstracción. Hardcoded a SMTP.

### 1.4 Sistema de Jobs

**Orquestador:** Inngest

**Jobs existentes relacionados:**
- `PROSPECCION_ENVIAR_LOTE` (envío de emails via SMTP)
- `AUTOMATIZACIONES_*` (varias para estudios clientes)
- `DUNNING_*` (cobros)

**Patrón:** Idempotencia obligatoria. Validación de stato en BD antes de ejecutar.

### 1.5 Autenticación y Autorización

**Sistema interno:** JWT + MFA

**Permisos:**
```typescript
'crm.update'  // Gestionar leads, demos y pipeline (existe, sin usar)
'growth.read' // Métricas (podría reutilizarse)
```

**Validación:** Cada API route de `/api/interno` valida permisos. Cliente (`lib/interno/client.ts`) distingue 401 (sin acceso) y 403 (falta permiso).

**MFA:** Obligatorio en `/interno`. Guard en `app/interno/layout.tsx`.

### 1.6 Componentes y Layouts Reutilizables

**Carpetas de componentes:**
- `components/ui/` - Diseño system (inputs, buttons, dialogs, tables)
- `components/panel/` - Componentes de panel
- `components/layout/` - Layouts generales

**Layouts existentes:**
- `app/(dashboard)/layout.tsx` - Panel de estudio
- `app/interno/layout.tsx` - Panel interno (con MFA)

**Patrones:** 
- React Client Components con hooks
- Server Components para data fetching
- Tailwind + shadcn/ui

### 1.7 Arquitectura de Migraciones

**Convención:** Timestamps correlativas en `supabase/migrations/`

**Reglas críticas:**
1. Verificar último número antes de crear
2. RLS siempre habilitado para tablas nuevas
3. Documentar permisos (GRANT/REVOKE) explícitamente
4. Nombrar por orden + propósito

**Ejemplo:** `20260915120000_sales_leads_pipeline.sql`

### 1.8 Estructura de API Routes

**Patrón:** `/api/interno/[modulo]/[accion]`

**Guardias:**
```typescript
const sesion = await fetchSesionInterna(); // Valida JWT + MFA
exigirPermiso(sesion, 'crm.update'); // Valida permiso
```

**Respuestas:**
- 200: OK
- 401: MFA_REQUERIDO (evento global)
- 403: Permiso insuficiente
- 400: Validación

---

## 2. Análisis de Brecha

### Lo que existe
✅ Tabla base de leads  
✅ Sistema de permisos granulares  
✅ RLS  
✅ Jobs (Inngest)  
✅ Emails (Resend + Spacemail)  
✅ Autenticación interna  
✅ Componentes UI  

### Lo que falta
❌ Pipeline Kanban (drag & drop)  
❌ Lead research + enriquecimiento  
❌ Campañas y secuencias automáticas  
❌ Inbox de respuestas (threading)  
❌ Tasks  
❌ Analytics + funnel  
❌ Deduplicación robusta  
❌ Campos extendidos de lead  
❌ Suppression list centralizado  
❌ AI personalization  
❌ Email composer  
❌ Integración con Google Places  

### Riesgos Técnicos Identificados

**ALTO: Spacemail + cold outreach**
- Spacemail tiene política contra outreach masivo y contacting scraped data
- Resend también prohíbe cold outreach
- No existe proveedor de email configurado legalmente para este caso
- **Decisión requerida:** Validar legalmente qué proveedor usar (p.ej. Mailgun con credencial real, proveedor europeo con LSSI compliance)

**MEDIO: Deduplicación**
- `plataforma_lead` tiene UNIQUE en email pero no en dominio/teléfono
- Posible duplicar el mismo negocio si cambia de email
- Requiere lógica normalización en BD + app

**BAJO: RLS sin políticas**
- Actual es correcto (deny by default + validación en servidor)
- No requiere cambio

---

## 3. Modelo de Datos Propuesto

### 3.1 Tablas Nuevas

#### `sales_leads`
Evolución de `plataforma_lead` con campos de enriquecimiento.

```sql
id                     text PK
email                  text NOT NULL
-- Deduplicación
website_domain         text (extracted from URL, for dedup)
phone_normalized       text (E.164 format, for dedup)
google_place_id        text UNIQUE (best dedup signal)

-- Identidad
nombre_contacto        text
apellido_contacto      text
estudio_nombre         text
estudio_nombre_legal   text
rol                    text (PROPIETARIA|MANAGER|RECEPCION)

-- Contacto
telefonom              text
ciudad                 text
provincia              text
pais                   text DEFAULT 'ES'
direccion              text
codigo_postal          text

-- Redes sociales
website                text
instagram_url          text
facebook_url           text
linkedin_url           text

-- Datos de negocio
software_actual        text (competitor tracking)
numero_empleados       int
clientes_aprox         int
precio_mensual_aprox   decimal
mercado_objetivo       text

-- Origen y tracking
source                 text (GOOGLE_PLACES|CSV_IMPORT|MANUAL|FORM|REFERRAL)
source_url             text (para traceabilidad)
source_created_at      timestamptz (cuándo se descubrió)
discovered_at          timestamptz DEFAULT now()
last_verified_at       timestamptz
enriched_at            timestamptz

-- Estatus
status                 text CHECK ('NUEVO'|'INVESTIGANDO'|'LISTO'|'CONTACTADO'|
                                  'RESPONDIO'|'INTERESADO'|'DEMO'|'TRIAL'|'CLIENTE'|
                                  'NO_INTERESADO'|'NO_CONTACTAR'|'BOUNCE'|
                                  'UNSUBSCRIBED'|'INVALID') DEFAULT 'NUEVO'

-- Gestión
owner_id               uuid (quien lo lleva)
studio_id              text FK studios(id) ON DELETE SET NULL (cuando se convierte)
tags                   text[] (LABEL[])

-- Notas
email_status           text ('VALID'|'INVALID'|'BOUNCE'|'UNSUBSCRIBED'|'UNKNOWN')
email_checked_at       timestamptz
notas                  text
datos_privados         jsonb (datos sensibles para audit)

-- Contexto de enriquecimiento
confidence             int (0-100, qué tan seguros de estos datos)
last_enrichment_source text
last_enrichment_at     timestamptz

-- Timestamps
creado_en              timestamptz DEFAULT now()
actualizado_en         timestamptz DEFAULT now()
borrado_en             timestamptz (soft delete)
```

**RLS:** DENY by DEFAULT. Solo service_role tras `crm.update`.

**Índices:**
```sql
UNIQUE (email)
UNIQUE (google_place_id) -- best dedup
UNIQUE (website_domain, pais) -- good dedup
UNIQUE (phone_normalized, pais)
INDEX (status, creado_en DESC)
INDEX (owner_id)
INDEX (studio_id)
INDEX (discovered_at DESC)
FULL TEXT (estudio_nombre, ciudad) -- búsqueda
```

#### `sales_campaigns`
```sql
id              text PK
nombre          text NOT NULL
descripcion     text
audience_count  int
estado          text CHECK ('DRAFT'|'SCHEDULED'|'SENDING'|'SENT'|'PAUSED'|'CANCELED') DEFAULT 'DRAFT'
created_by      uuid
created_at      timestamptz DEFAULT now()
scheduled_for   timestamptz
```

#### `sales_campaign_steps`
```sql
id              text PK
campaign_id     text FK sales_campaigns(id) ON DELETE CASCADE
orden           int
subject         text
body            text (variables: {{first_name}}, {{studio_name}}, etc.)
delay_days      int (enviar X días después del anterior)
conditions      jsonb (opcional: si status = RESPONDIO, no enviar)
enabled         bool DEFAULT true
created_at      timestamptz DEFAULT now()
```

#### `sales_messages`
Historial de mensajes enviados.
```sql
id              text PK
lead_id         text FK sales_leads(id) ON DELETE CASCADE
campaign_id     text FK sales_campaigns(id) ON DELETE SET NULL
campaign_step_id text FK sales_campaign_steps(id) ON DELETE SET NULL
asunto          text
cuerpo          text
estado          text CHECK ('PENDING'|'SCHEDULED'|'SENDING'|'SENT'|'DELIVERED'|
                            'OPENED'|'CLICKED'|'REPLIED'|'BOUNCED'|'UNSUBSCRIBED'|
                            'STOPPED'|'FAILED')
proveedor       text ('SPACEMAIL'|'MOCK')
proveedor_id    text (message_id externo, para traceabilidad)
enviado_en      timestamptz
entregado_en    timestamptz
abierto_en      timestamptz
respuesta_en    timestamptz
error           text
```

#### `sales_threads`
Conversaciones por lead (agrupa replies).
```sql
id              text PK
lead_id         text FK sales_leads(id) ON DELETE CASCADE
subject         text (normalized)
last_message_at timestamptz
status          text CHECK ('OPEN'|'NEEDS_REPLY'|'WAITING_REPLY'|'CLOSED') DEFAULT 'OPEN'
priority        int (1-5)
created_at      timestamptz DEFAULT now()
```

#### `sales_inbound_emails`
Respuestas entrantes (IMAP).
```sql
id              text PK
thread_id       text FK sales_threads(id) ON DELETE CASCADE
lead_id         text FK sales_leads(id)
mensaje_id      text UNIQUE (email Message-ID, para idempotencia)
asunto          text
cuerpo          text
remitente       text
destinatario    text
timestamp       timestamptz
estado          text CHECK ('UNREAD'|'READ'|'NEEDS_MATCHING'|'MATCHED'|'BOUNCED')
recibido_en     timestamptz DEFAULT now()
```

#### `sales_suppressions`
Suppression list global.
```sql
id              text PK
email           text (normalized)
dominio         text (domain part of email)
phone           text (E.164)
razon           text CHECK ('UNSUBSCRIBED'|'BOUNCE'|'COMPLAINT'|'DO_NOT_CONTACT'|
                            'LEGAL_REQUEST'|'INVALID'|'FRAUDULENT')
source          text (de dónde viene: MANUAL|EMAIL_BOUNCE|UNSUBSCRIBE_LINK|etc.)
creado_en       timestamptz DEFAULT now()
UNIQUE (email)
UNIQUE (phone) -- puede haber NULL
```

#### `sales_tasks`
```sql
id              text PK
lead_id         text FK sales_leads(id) ON DELETE CASCADE
tipo            text CHECK ('LLAMAR'|'WHATSAPP'|'EMAIL'|'DEMO'|'FOLLOW_UP'|'REVISAR_TRIAL')
asignado_a      uuid
vencimiento     timestamptz
prioridad       int (1-5)
estado          text CHECK ('TODO'|'IN_PROGRESS'|'DONE'|'CANCELED') DEFAULT 'TODO'
notas           text
creado_en       timestamptz DEFAULT now()
```

#### `sales_ai_generations`
Auditoría de lo que la IA generó (para compliance).
```sql
id              text PK
lead_id         text FK sales_leads(id) ON DELETE CASCADE
tipo            text ('EMAIL'|'RESEARCH'|'ANGLE'|'OBSERVATION')
prompt          text (qué se pidió)
output          text (qué generó)
confidence      int (0-100)
fuente_datos    jsonb (qué datos reales se usaron)
creado_en       timestamptz DEFAULT now()
```

#### `sales_events`
Log de auditoría estructurado.
```sql
id              text PK
tipo            text (LEAD_CREATED|LEAD_MOVED|EMAIL_SENT|CAMPAIGN_STARTED|etc.)
lead_id         text FK sales_leads(id) ON DELETE CASCADE
actor           uuid (quién hizo la acción)
detalles        jsonb (contexto)
creado_en       timestamptz DEFAULT now()
```

---

## 4. Arquitectura de Servicios

### 4.1 Capas

```
┌─────────────────────────────────────────┐
│ FRONTEND (Next.js Pages + Components)   │
│ - Pipeline Kanban                       │
│ - Lead detail                           │
│ - Campaign builder                      │
│ - Inbox                                 │
│ - Analytics                             │
└─────────┬───────────────────────────────┘
          │
┌─────────┴───────────────────────────────┐
│ API ROUTES (/api/interno/sales/*)       │
│ - Validación de permisos                │
│ - Llamadas a servicios                  │
└─────────┬───────────────────────────────┘
          │
┌─────────┴───────────────────────────────┐
│ SERVICIOS (lib/sales/*)                 │
│ - Lead CRUD                             │
│ - Campaign logic                        │
│ - Enrichment                            │
│ - Sequence engine                       │
│ - Deduplication                         │
│ - Suppression check                     │
└─────────┬───────────────────────────────┘
          │
┌─────────┴───────────────────────────────┐
│ PROVIDERS (lib/sales/providers/)        │
│ - EmailProvider (abstracción)           │
│ - LeadDiscoveryProvider (Google, etc.)  │
│ - EnrichmentProvider                    │
│ - InboundEmailProvider (IMAP)           │
└─────────┬───────────────────────────────┘
          │
┌─────────┴───────────────────────────────┐
│ JOBS (lib/inngest/*)                    │
│ - sequence_step_send                    │
│ - campaign_enroll                       │
│ - process_bounce                        │
│ - process_unsubscribe                   │
│ - process_inbound_email                 │
│ - enrich_lead                           │
└─────────┬───────────────────────────────┘
          │
┌─────────┴───────────────────────────────┐
│ DATABASE (Supabase PostgreSQL)          │
│ - sales_leads                           │
│ - sales_campaigns                       │
│ - sales_messages                        │
│ - sales_suppressions                    │
│ - etc.                                  │
└─────────────────────────────────────────┘
```

### 4.2 Flujos Principales

**Flujo 1: Importación de CSV**
```
CSV Upload
  ↓ Preview + validate
  ↓ Dedup check (email, domain, phone)
  ↓ Insert leads (status=NUEVO)
  ↓ Trigger enrichment job (opcional)
```

**Flujo 2: Lead Research (IA)**
```
Lead (LISTO)
  ↓ Fetch datos públicos (website, redes, etc.)
  ↓ AI research (qué dicen de este negocio)
  ↓ Generate email
  ↓ Store en sales_ai_generations
  ↓ Show para review manual
```

**Flujo 3: Campaña y Secuencia**
```
Campaign created
  ↓ Define steps (Day 0, Day 3, Day 7)
  ↓ Enroll leads (status=LISTO)
  ↓ Enroll → Inngest job (schedule_campaign_steps)
  ↓ Each step delay
  ↓ Send (check suppression + email_status)
  ↓ Log en sales_messages (estado=SENDING)
  ↓ SMTP via Spacemail (via email provider)
  ↓ Update status=SENT
  ↓ If BOUNCE: stop sequence, mark status=INVALID
  ↓ If UNSUBSCRIBE: add to sales_suppressions, stop sequence
  ↓ If REPLY: move to RESPONDIO, trigger task
```

**Flujo 4: Recepción de Respuestas**
```
Inbound email (IMAP)
  ↓ Parse (Message-ID, In-Reply-To, Subject)
  ↓ Find thread (por email + subject)
  ↓ Auto-match lead (by From email)
  ↓ If no match: status=NEEDS_MATCHING
  ↓ Store en sales_inbound_emails
  ↓ Create/update thread
  ↓ Update lead status=RESPONDIO
  ↓ Create task: FOLLOW_UP o DEMO
  ↓ Trigger stop_sequence job
```

**Flujo 5: Conversión a Cliente**
```
Lead (DEMO/TRIAL/INTERESADO)
  ↓ "Convert to customer"
  ↓ Link sales_leads.studio_id → studios(id)
  ↓ Trigger onboarding flow
  ↓ Inngest: send welcome email vía Resend
  ↓ Log event: LEAD_CONVERTED
```

---

## 5. Piezas Existentes Que Reutilizar

| Componente | Ubicación | Estado | Uso en Sales OS |
|---|---|---|---|
| Tabla leads base | `plataforma_lead` | Producción | Renombrar y extender a `sales_leads` |
| Prospección | `/interno/crecimiento` | Producción | Reutilizar importación + UI |
| SMTP Spacemail | `lib/marketing/prospeccion-smtp.ts` | Producción | Reutilizar envío (con cautelas legales) |
| Permisos | `lib/interno/permisos.ts` | Producción | Añadir `sales.manage` si es nuevo |
| Inngest jobs | `lib/inngest/` | Producción | Patrón para nuevos jobs |
| API routes | `/api/interno/` | Producción | Patrón de validación + permisos |
| Componentes UI | `components/ui/` | Producción | Reutilizar botones, inputs, dialogs |

---

## 6. Riesgos, Limitaciones y Decisiones Pospuestas

### 6.1 Riesgos Críticos

**RIESGO 1: Legítimidad del outreach en frío**
- **Impacto:** Legal, reputacional
- **Causa:** Spacemail y Resend prohíben cold outreach a contacting data
- **Mitigación:** 
  - ⚠️ **REQUERIDO:** Validar con abogado LSSI/RGPD caso concreto antes de Fase 5
  - ⚠️ **REQUERIDO:** Seleccionar proveedor que permita legalmente este caso
  - Documentar consentimiento/base legal para cada lead
  - Implementar UNSUBSCRIBE obligatorio desde Fase 1

**RIESGO 2: Reputación de dominio**
- **Impacto:** Entrega de emails transaccionales de clientes
- **Causa:** Mezclar outreach + transaccional en Resend
- **Mitigación:** ✅ Separado via Spacemail (decisión ya tomada)

**RIESGO 3: Deduplicación insuficiente**
- **Impacto:** Spam a negocio duplicado, leads perdidos
- **Causa:** Email único no basta (cambios de email, negocios con múltiples contactos)
- **Mitigación:**
  - Prioridad de dedup: `google_place_id` > dominio web > email > teléfono
  - Normalizar teléfono (E.164) y dominio
  - Merge manual en UI cuando sea necesario

**RIESGO 4: Spam e invalidez de emails**
- **Impacto:** Tasa bounce alta, marca roja ante ISPs
- **Causa:** Importar listas de baja calidad / scraping
- **Mitigación:**
  - Preview de importación obligatorio
  - Validación de email antes de enviar
  - Procesar bounces en Inngest (parar secuencias)
  - Guardar email_status en BD

### 6.2 Limitaciones de Infraestructura Existente

**Inngest:**
- Plan gratuito limita a ~500 invocaciones/mes (actual: ~84% usado)
- Sales OS con 100 leads/día en secuencia de 3 pasos = 300 invocaciones extras
- **Decisión:** Evaluar upgrade vs. usar pg_cron para jobs simple

**Supabase:**
- RLS sin políticas es correcto pero difícil de debuggear
- **Decisión:** Implementar test RLS por rol antes de go-live

**Email:**
- No existe EmailProvider abstraction hoy
- **Decisión:** Implementar en Fase 6

### 6.3 Decisiones Pospuestas (No Abrir)

❌ **Búsqueda en Google Maps como Fase 0**
- Requiere API key de pago
- Requerida validación legal de términos
- Aplazar a Fase 3+

❌ **Proveedor de email definitivo**
- Decidir entre Mailgun, Twilio SendGrid, Europa-based, etc.
- Requiere validación legal primero
- Pasar a `EmailProvider` abstraction en Fase 6

❌ **Lead scoring automático**
- ML complejo, sin datos históricos aún
- Implementar scoring manual (ALTO/MEDIO/BAJO) primero

❌ **Multi-idioma**
- Tentare.app es ES first
- Soportar otros idiomas = multiplicar datos

---

## 7. Mapa de Implementación por Fases

| Fase | Nombre | Estimación | Dependencias |
|---|---|---|---|
| **0** | ✅ Auditoría y Arquitectura | Completa | - |
| **1** | CRM + Pipeline | 1 semana | Aprobación |
| **2** | Importación CSV + Dedup | 4 días | Fase 1 |
| **3** | Lead Research + IA | 1 semana | Fases 1-2, OpenAI API |
| **4** | Email Composer + Personalización | 5 días | Fase 3 |
| **5** | Campañas y Secuencias | 1 semana | Fases 1-4, Validación legal |
| **6** | EmailProvider + Mock | 3 días | Fase 5 |
| **7** | Inbox de Respuestas (IMAP) | 1 semana | Fases 5-6 |
| **8** | Tasks + WhatsApp | 3 días | Fase 7 |
| **9** | Analytics + Funnel | 5 días | Todas |
| **10** | Hardening + Tests E2E | 1 semana | Todas |

**Timeline total estimado:** 8–10 semanas (serial). Con equipos paralelos: 6–7 semanas.

---

## 8. Checklist de Implementación (Fase 1)

**Antes de Fase 1: Decisiones Requieridas**

- [ ] **LEGAL:** Validar LSSI + RGPD para cold outreach (email + teléfono)
- [ ] **LEGAL:** Seleccionar proveedor de email que lo permita
- [ ] **PRODUCTO:** Confirmar que Sales OS es prioridad en roadmap
- [ ] **OPERACIONAL:** Asignar dueño de vendas internas (owner_id)

**Fase 1: Setup**

- [ ] Crear rama `feat/sales-os-fase1`
- [ ] Tabla `sales_leads` (migración SQL)
- [ ] Tabla `sales_campaigns` (migración SQL)
- [ ] Tabla `sales_campaign_steps` (migración SQL)
- [ ] Tabla `sales_messages` (migración SQL)
- [ ] Tabla `sales_suppressions` (migración SQL)
- [ ] RLS: DENY by DEFAULT, validación en servidor
- [ ] Permiso `sales.manage` (si es nuevo)

**Fase 1: Backend**

- [ ] CRUD leads: create, read, update, delete
- [ ] Búsqueda: por email, estudio, ciudad, estado
- [ ] Bulk actions: cambiar estado, tags, owner
- [ ] Move lead entre estados (NUEVO → INVESTIGANDO → etc.)
- [ ] Validación de dedup (email único, no duplicar)

**Fase 1: API Routes**

- [ ] `POST /api/interno/sales/leads` (create)
- [ ] `GET /api/interno/sales/leads?estado=NUEVO` (list + filter)
- [ ] `GET /api/interno/sales/leads/[id]` (detail)
- [ ] `PATCH /api/interno/sales/leads/[id]` (update)
- [ ] `PUT /api/interno/sales/leads/[id]/estado` (move in pipeline)
- [ ] `POST /api/interno/sales/leads/[id]/tags` (manage tags)

**Fase 1: Frontend**

- [ ] Layout `/interno/sales` con subsecciones
- [ ] Página CRM: Pipeline Kanban (4 estados NUEVO/INVESTIGANDO/LISTO/CONTACTADO)
- [ ] Detail panel: lead + notas + tags + owner
- [ ] Filtros: por estado, ciudad, software, owner
- [ ] Búsqueda: email, nombre estudio, teléfono
- [ ] Bulk actions: selector multi-select

**Fase 1: Tests**

- [ ] Unit: dedup logic
- [ ] Unit: status validation
- [ ] E2E: crear lead, mover en pipeline
- [ ] E2E: búsqueda y filtros
- [ ] RLS: intentar acceso sin permiso (403)

---

## 9. Estructura de Archivos (Post-Implementación)

```
/app/interno/sales/
  /page.tsx                         # Dashboard
  /leads/page.tsx                   # CRM (pipeline)
  /leads/[id]/page.tsx              # Lead detail
  /campaigns/page.tsx               # (Fase 5)
  /inbox/page.tsx                   # (Fase 7)
  /tasks/page.tsx                   # (Fase 8)
  /analytics/page.tsx               # (Fase 9)

/app/api/interno/sales/
  /leads/route.ts                   # CREATE, LIST
  /leads/[id]/route.ts              # GET, PATCH
  /leads/[id]/estado/route.ts       # PUT (move)
  /leads/[id]/tags/route.ts         # POST (manage)
  /campaigns/route.ts               # (Fase 5)
  /bulk-actions/route.ts            # (PATCH múltiples)

/lib/sales/
  /leads.ts                         # CRUD, búsqueda
  /deduplication.ts                 # Lógica dedup
  /validation.ts                    # Validación de email, etc.
  /types.ts                         # TypeScript interfaces
  /db.ts                            # Queries a BD
  /providers/                       # (Fase 6+)
    /email-provider.ts
    /enrichment-provider.ts
    /discovery-provider.ts

/lib/inngest/
  /sales-sequence-send.ts           # (Fase 5)
  /sales-process-bounce.ts          # (Fase 5)
  /sales-process-unsubscribe.ts     # (Fase 5)

/supabase/migrations/
  /202609xx_sales_leads.sql
  /202609xx_sales_campaigns.sql
  /202609xx_sales_suppressions.sql

/components/sales/
  /pipeline-kanban.tsx
  /lead-card.tsx
  /lead-detail.tsx
  /campaign-builder.tsx             # (Fase 5)

/e2e/
  /sales-leads.spec.ts
  /sales-pipeline.spec.ts
  /sales-campaigns.spec.ts          # (Fase 5)
```

---

## 10. Riesgos Legales y Compliance

### 10.1 LSSI-CE (España)

**Artículos relevantes:**
- Art. 21: Derecho a oposición. Todo envío comercial debe permitir darse de baja fácil
- Art. 22: Identificación del remitente (debe ser clara)
- Sanciones: hasta €30.000 por incumplimiento

**Implementación obligatoria:**
- ✅ Pie de email con "Responde BAJA"
- ✅ Suppression list centralizado
- ✅ No reenviar a quien dijo BAJA
- ✅ Auditoría de consentimiento

### 10.2 RGPD

**Artículos relevantes:**
- Art. 6: Base legal (contrato, consentimiento, interés legítimo, obligación legal)
- Art. 12-14: Transparencia (decir quién somos, para qué usamos datos)
- Sanciones: hasta 4% de facturación anual

**Implementación obligatoria:**
- ✅ Almacenar source + source_url de cada lead
- ✅ Timestamp de obtención
- ✅ Justificación en notas_privadas (lead stage)
- ✅ Derecho a descarga/portabilidad

### 10.3 Decisión Requerida

⚠️ **BLOQUEA FASE 5**

No se puede empezar a enviar emails en frío hasta que abogado confirme:
1. Que el caso de uso es legal en ES/UE
2. Qué proveedor usar (Resend y Spacemail dicen NO; ¿Mailgun? ¿otro?)
3. Cómo documentar consentimiento/base legal
4. Qué dice en el pie de email

**Sugerencia:** Contactar a abogado especialista en LSSI-CE antes de Fase 4.

---

## 11. Conclusiones y Recomendaciones

### 11.1 ¿Qué sale ganando?

- ✅ **60% de infraestructura ya existe** (BD, jobs, emails, permisos, RLS)
- ✅ **No reinventar la rueda:** reutilizar `plataforma_lead`, componentes, patrones
- ✅ **Arquitectura limpia:** separación de concerns (providers, servicios, jobs)
- ✅ **Seguridad by default:** RLS, permisos granulares, MFA

### 11.2 ¿Qué hay que cuidar?

- ⚠️ **LEGAL FIRST:** Resolver compliance antes de Fase 5 (no puede demorarse)
- ⚠️ **Deduplicación:** No es trivial; diseñar bien desde Fase 1
- ⚠️ **Spam:** Validación de email y manejo de bounces son críticos
- ⚠️ **Inngest capacity:** Evaluar si caber en plan gratuito

### 11.3 Orden Recomendado

1. **Decidir legalmente** (semana 1)
2. **Fase 0 → Aprobación** (esta semana)
3. **Fase 1: CRM + Pipeline** (semana 2-3)
4. **Fases 2-4: CSV + Research + Composer** (semana 4-6)
5. **LEGAL SIGN OFF** (semana 6)
6. **Fase 5: Campañas** (semana 7-8)
7. **Fases 6-10: Polish + Launch** (semana 9-10)

---

## Apéndice A: Comandos Útiles

```bash
# Generar tipos de BD (después de migración)
supabase gen types typescript > lib/database.types.ts

# Probar conexión Spacemail (sin enviar)
npm run spacemail:check

# Ejecutar tests de Sales OS
npm test -- lib/sales/*.test.ts
npm run e2e -- e2e/sales-*.spec.ts

# Aplicar migración nueva
supabase migration up

# Hacer push de cambios de schema
supabase db push
```

---

**Documento completado:** 2026-09-15 | Auditoría por Claude Haiku 4.5 | [Waiting for approval]

