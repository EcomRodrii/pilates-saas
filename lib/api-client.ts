'use client';

// ── Stripe ────────────────────────────────────────────────────────────────────

export async function crearCheckoutStripe(params: {
  reciboId: string;
  socioId: string;
  studioId: string;
  concepto: string;
  importe: number;
  socioEmail: string | null;
  socioNombre: string;
}): Promise<{ url: string } | { error: string }> {
  const res = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json() as Promise<{ url: string } | { error: string }>;
}

// Aprobación de un toque: cobra un recibo pendiente con la tarjeta ya
// guardada de la socia, sin redirigirla a ningún sitio.
export async function aprobarCobroAutonomo(params: {
  logId: string;
  reciboId: string;
  socioId: string;
  studioId: string;
}): Promise<{ ok: true } | { error: string }> {
  const res = await fetch('/api/stripe/charge-off-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error ?? `Error HTTP ${res.status}` };
  return { ok: true };
}

// ── Emails ────────────────────────────────────────────────────────────────────

export async function enviarEmailRecibo(params: {
  to: string;
  toName: string;
  concepto: string;
  importe: number;
  fechaCobro: string;
  numeroFactura?: string;
}) {
  await fetch('/api/emails/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tipo: 'recibo',
      to: params.to,
      toName: params.toName,
      data: {
        concepto: params.concepto,
        importe: params.importe,
        fechaCobro: params.fechaCobro,
        numeroFactura: params.numeroFactura,
      },
    }),
  });
}

export async function enviarEmailBienvenida(params: {
  to: string;
  toName: string;
  planNombre?: string;
}) {
  await fetch('/api/emails/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tipo: 'bienvenida',
      to: params.to,
      toName: params.toName,
      data: { planNombre: params.planNombre },
    }),
  });
}

// Envía un email de campaña de marketing a una destinataria. Reutiliza la
// plantilla 'automatizacion' (asunto → titulo, contenido → mensaje).
export async function enviarEmailCampana(params: {
  to: string;
  toName: string;
  asunto: string;
  contenido: string;
}): Promise<boolean> {
  try {
    const res = await fetch('/api/emails/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: 'automatizacion',
        to: params.to,
        toName: params.toName,
        data: { titulo: params.asunto, mensaje: params.contenido },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function enviarEmailReserva(params: {
  to: string;
  toName: string;
  claseNombre: string;
  fecha: string;
  hora: string;
  sala: string;
  instructor: string;
}) {
  await fetch('/api/emails/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tipo: 'reserva',
      to: params.to,
      toName: params.toName,
      data: {
        claseNombre: params.claseNombre,
        fecha: params.fecha,
        hora: params.hora,
        sala: params.sala,
        instructor: params.instructor,
      },
    }),
  });
}
