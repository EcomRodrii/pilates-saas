-- ─────────────────────────────────────────────────────────────────────────────
-- Notification Engine — modelo de datos (Fase 1, núcleo).
--
-- Sustituye al `notificaciones` legacy (studio-scoped, sin destinatario ni
-- prioridad) por un modelo POR DESTINATARIO y multi-canal. El motor
-- (lib/notifications/*) escribe con service-role (salta RLS); las lecturas y las
-- preferencias/suscripciones las gobierna RLS por usuario.
--
-- Relaciones:
--   notification 1───N notification_delivery   (una fila por canal enviado)
--   auth.users   1───N notification            (destinatario, recipient_user_id)
--   auth.users   1───N notification_preference (qué quiere recibir, por categoría)
--   auth.users   1───N push_subscription       (endpoints Web Push del usuario)
--   studios      1───N notification_template    (override de plantilla; NULL = global)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── notification: la notificación persistente, por destinatario ───────────────
CREATE TABLE IF NOT EXISTS public.notification (
  id                    text PRIMARY KEY,
  studio_id             text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  -- Destinatario. recipient_user_id puede ser NULL (p. ej. socia sin cuenta
  -- reclamada): entonces solo la alcanzan canales fuera de app (email/wa), nunca
  -- in-app. recipient_socio_id/instructor_id se guardan para el Notification
  -- Center (vista admin) y para reintentos.
  recipient_role        text NOT NULL CHECK (recipient_role IN ('PROPIETARIO','INSTRUCTOR','SOCIA')),
  recipient_user_id     uuid,
  recipient_socio_id    text,
  recipient_instructor_id text,
  event_type            text NOT NULL,   -- p. ej. 'reserva.confirmada'
  category              text NOT NULL,   -- 'reservas' | 'clases' | 'sustituciones' | 'pagos' | 'marketing' | 'sistema'
  priority              text NOT NULL DEFAULT 'MEDIA' CHECK (priority IN ('CRITICA','ALTA','MEDIA','BAJA','SILENCIOSA')),
  title                 text NOT NULL,
  body                  text NOT NULL,
  resource_type         text,            -- 'reserva' | 'sesion' | 'recibo' | 'sustitucion' | ...
  resource_id           text,
  deep_link             text,            -- ruta a abrir al pulsar
  data                  jsonb,           -- snapshot de variables del evento
  dedup_key             text,            -- idempotencia (unique por estudio)
  read_at               timestamptz,
  archived_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_recipient ON public.notification (recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_studio ON public.notification (studio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_unread ON public.notification (recipient_user_id) WHERE read_at IS NULL AND archived_at IS NULL;
-- Idempotencia: un mismo hecho (dedup_key) no genera dos notificaciones por estudio.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_dedup ON public.notification (studio_id, dedup_key) WHERE dedup_key IS NOT NULL;

-- ── notification_delivery: registro de envío por canal (historial) ────────────
CREATE TABLE IF NOT EXISTS public.notification_delivery (
  id             text PRIMARY KEY,
  notification_id text NOT NULL REFERENCES public.notification(id) ON DELETE CASCADE,
  studio_id      text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  channel        text NOT NULL CHECK (channel IN ('INAPP','PUSH','EMAIL','WHATSAPP','SMS')),
  status         text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','DELIVERED','FAILED','SKIPPED')),
  attempts       int NOT NULL DEFAULT 0,
  error          text,
  provider_id    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  sent_at        timestamptz,
  delivered_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_delivery_notification ON public.notification_delivery (notification_id);
CREATE INDEX IF NOT EXISTS idx_delivery_studio ON public.notification_delivery (studio_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_channel ON public.notification_delivery (notification_id, channel);

-- ── notification_preference: qué quiere recibir cada usuario, por categoría ───
-- Ausencia de fila = valores por defecto (in-app + push ON; resto OFF). Solo se
-- guardan overrides.
CREATE TABLE IF NOT EXISTS public.notification_preference (
  id         text PRIMARY KEY,
  studio_id  text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  category   text NOT NULL,
  inapp      boolean NOT NULL DEFAULT true,
  push       boolean NOT NULL DEFAULT true,
  email      boolean NOT NULL DEFAULT false,
  whatsapp   boolean NOT NULL DEFAULT false,
  sms        boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_preference_user_cat ON public.notification_preference (user_id, category);

-- ── push_subscription: endpoints Web Push por usuario (PR2 los usa) ───────────
CREATE TABLE IF NOT EXISTS public.push_subscription (
  id            text PRIMARY KEY,
  studio_id     text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  endpoint      text NOT NULL,
  p256dh        text NOT NULL,
  auth          text NOT NULL,
  user_agent    text,
  failure_count int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_push_endpoint ON public.push_subscription (endpoint);
CREATE INDEX IF NOT EXISTS idx_push_user ON public.push_subscription (user_id);

-- ── notification_template: override de plantilla por estudio (NULL = global) ──
CREATE TABLE IF NOT EXISTS public.notification_template (
  id         text PRIMARY KEY,
  studio_id  text REFERENCES public.studios(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  locale     text NOT NULL DEFAULT 'es',
  title_tpl  text NOT NULL,
  body_tpl   text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Un override por (estudio, evento, idioma). Los globales (studio_id NULL) se
-- distinguen por índice parcial aparte.
CREATE UNIQUE INDEX IF NOT EXISTS uq_template_studio ON public.notification_template (studio_id, event_type, locale) WHERE studio_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_template_global ON public.notification_template (event_type, locale) WHERE studio_id IS NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.notification           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preference ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscription      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_template  ENABLE ROW LEVEL SECURITY;

-- notification: cada quien ve LO SUYO (recipient_user_id = auth.uid()); el staff
-- del estudio ve todo lo del estudio (Notification Center). Marca leída/archivada
-- con el mismo criterio. El motor inserta con service-role (salta RLS).
CREATE POLICY notification_select ON public.notification FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid() OR studio_id = current_studio_id());
CREATE POLICY notification_update ON public.notification FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid() OR studio_id = current_studio_id())
  WITH CHECK (recipient_user_id = auth.uid() OR studio_id = current_studio_id());

-- deliveries: solo vista admin del estudio (Notification Center).
CREATE POLICY delivery_select ON public.notification_delivery FOR SELECT TO authenticated
  USING (studio_id = current_studio_id());

-- preferences: cada usuario gestiona las suyas.
CREATE POLICY preference_all ON public.notification_preference FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- push subscriptions: cada usuario gestiona las suyas.
CREATE POLICY push_all ON public.push_subscription FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- templates: el estudio ve/gestiona los suyos + puede leer los globales.
CREATE POLICY template_select ON public.notification_template FOR SELECT TO authenticated
  USING (studio_id = current_studio_id() OR studio_id IS NULL);
CREATE POLICY template_write ON public.notification_template FOR ALL TO authenticated
  USING (studio_id = current_studio_id()) WITH CHECK (studio_id = current_studio_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification, public.notification_delivery,
  public.notification_preference, public.push_subscription, public.notification_template
  TO authenticated, service_role;
