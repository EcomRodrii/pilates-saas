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

export type TipoAlertaPropietaria = 'agotada' | 'sin_respuesta' | 'baja';

// Alerta a la propietaria: se ha dado una baja, nadie responde, o se agotó el
// ranking. La variante 'baja' es la que sostiene la regla dura del módulo (ella
// se entera antes o a la vez que las alumnas) cuando la baja NO nace en el panel.
export function cuerpoAlertaPropietaria(params: {
  claseNombre: string;
  cuando: string;
  tipo: TipoAlertaPropietaria;
  candidataNombre?: string;
  urlPanel: string;
  yaContactando?: boolean; // 'baja': el motor ya está avisando a candidatas (modo autónomo)
}): string {
  const { claseNombre, cuando, tipo, candidataNombre, urlPanel, yaContactando } = params;
  if (tipo === 'baja') {
    const quien = candidataNombre ?? 'Una instructora';
    // En autónomo el motor ya se ha puesto en marcha: es un "ya lo tengo", no un
    // "haz algo". En asistido su visto bueno es lo único que desbloquea el flujo.
    return yaContactando
      ? `${quien} no puede dar ${claseNombre} (${cuando}). Ya estamos buscando sustituta: ${urlPanel}`
      : `${quien} no puede dar ${claseNombre} (${cuando}). Tenemos candidatas listas, solo falta tu visto bueno: ${urlPanel}`;
  }
  if (tipo === 'agotada') {
    return `⚠️ Nadie ha podido cubrir ${claseNombre} (${cuando}). Necesita tu decisión: ${urlPanel}`;
  }
  return `${candidataNombre ?? 'La candidata'} aún no responde para ${claseNombre} (${cuando}). Avisa a otra o cancela: ${urlPanel}`;
}
