// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — tipos compartidos (cliente y servidor).
// Sin dependencias de Node ni de Supabase: seguro de importar en cualquier lado.
// ─────────────────────────────────────────────────────────────────────────────

export type NotificationRole = 'PROPIETARIO' | 'INSTRUCTOR' | 'SOCIA';

export type NotificationCategory =
  | 'reservas' | 'clases' | 'sustituciones' | 'pagos' | 'marketing' | 'sistema';

export type NotificationPriority =
  | 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA' | 'SILENCIOSA';

export type NotificationChannel = 'INAPP' | 'PUSH' | 'EMAIL' | 'WHATSAPP' | 'SMS';

export type DeliveryStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'SKIPPED';

// Un destinatario resuelto: a quién y por qué vías se le puede llegar.
export interface Recipient {
  role: NotificationRole;
  userId: string | null;         // auth.users id; null = sin cuenta (solo canales externos)
  socioId?: string | null;
  instructorId?: string | null;
  nombre?: string | null;
  email?: string | null;
  telefono?: string | null;
}

// El EVENTO que publica un módulo de negocio. Nunca envía nada: solo describe
// QUÉ ha pasado. El motor decide a quién, por qué canal y con qué plantilla.
export interface NotificationEvent {
  type: string;                  // p. ej. 'reserva.confirmada' (ver EVENTOS en catalog.ts)
  studioId: string;
  data?: Record<string, unknown>; // payload + variables de plantilla
  resource?: { type: string; id: string } | null;
  dedupKey?: string | null;      // idempotencia: mismo hecho → una sola notificación
  // Destinatarios explícitos (raro); normalmente los resuelve la regla del evento.
  recipients?: Recipient[];
  // Programación opcional: enviar en el futuro (lo maneja NotificationEngine.schedule).
  scheduledFor?: string | null;  // ISO
}

// La notificación persistida (fila de `notification`), en camelCase.
export interface NotificationRow {
  id: string;
  studioId: string;
  recipientRole: NotificationRole;
  recipientUserId: string | null;
  recipientSocioId: string | null;
  recipientInstructorId: string | null;
  eventType: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string;
  resourceType: string | null;
  resourceId: string | null;
  deepLink: string | null;
  data: Record<string, unknown> | null;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
}
