// Cuerpos de WhatsApp/SMS para el motor de escalado de sustituciones. Texto plano
// y corto (SMS ≈ 160 chars por segmento; WhatsApp sin límite pero breve gana).
// El enlace es el mismo deep link de aceptación (un toque, sin login).

const primerNombre = (n: string) => n.split(' ')[0] || n;

// Recordatorio a la candidata ya avisada por email: sube de canal a WhatsApp/SMS.
export function cuerpoNudgeCandidata(params: {
  nombre: string; claseNombre: string; cuando: string; url: string;
}): string {
  const { nombre, claseNombre, cuando, url } = params;
  return `Hola ${primerNombre(nombre)}, ¿puedes cubrir ${claseNombre} (${cuando})? Responde en un toque: ${url}`;
}

// Alerta a la propietaria: nadie responde o se agotó el ranking.
export function cuerpoAlertaPropietaria(params: {
  claseNombre: string; cuando: string; tipo: 'agotada' | 'sin_respuesta'; candidataNombre?: string; urlPanel: string;
}): string {
  const { claseNombre, cuando, tipo, candidataNombre, urlPanel } = params;
  if (tipo === 'agotada') {
    return `⚠️ Nadie ha podido cubrir ${claseNombre} (${cuando}). Necesita tu decisión: ${urlPanel}`;
  }
  return `${candidataNombre ?? 'La candidata'} aún no responde para ${claseNombre} (${cuando}). Avisa a otra o cancela: ${urlPanel}`;
}
