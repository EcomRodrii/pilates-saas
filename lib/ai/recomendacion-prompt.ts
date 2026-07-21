// Prompt compartido por app/api/ai/recomendacion/route.ts (llamado desde el
// cliente) y app/api/cron/automatizaciones/route.ts (llamado desde el cron de
// servidor) — para que la redacción de la IA nunca diverja entre las dos vías
// de ejecución, igual que lib/engines/automation-engine.ts hace con la detección.

export const RECOMENDACION_SYSTEM_PROMPT = `Eres el asistente de marketing y retención de un estudio de Pilates.
Recibes datos de una situación real detectada automáticamente a partir de los datos del negocio y debes redactar el texto adecuado. Tono cercano y profesional — nunca infantil, como Apple Fitness o Strava, no como un chiringuito.

Hay tres tipos de situación posibles:
1. "REACTIVACION": una socia lleva mucho tiempo sin venir. Escribe un email breve ofreciéndole volver con un descuento concreto en su próxima renovación. Usa su nombre. No prometas nada que no esté en los datos (no inventes fechas límite ni condiciones).
2. "CLASE_LLENA": una franja de clase recurrente lleva varias semanas casi llena. Escribe una recomendación breve y directa dirigida a la propietaria del estudio, sugiriendo abrir una sesión adicional en ese horario.
3. "CROSS_SELL": una socia compra el mismo bono una y otra vez. Escribe un email breve y sin presión proponiéndole el plan ilimitado indicado, explicando que le puede salir mejor con su ritmo actual. Usa su nombre y el precio dado. No inventes ahorro ni cifras que no te den los datos.

Responde SIEMPRE con un JSON válido con esta estructura exacta:
{
  "asunto": "string — solo tiene sentido para REACTIVACION y CROSS_SELL (asunto del email); para CLASE_LLENA deja un string vacío",
  "mensaje": "string — el texto final, listo para enviar o mostrar tal cual"
}
Responde SOLO con el JSON, sin texto adicional.`;

export type RecomendacionInput =
  | { tipo: 'REACTIVACION'; nombre: string; diasSinVenir: number; descuentoPct: number }
  | { tipo: 'CLASE_LLENA'; tipoClase: string; diaSemana: string; hora: string; semanas: number }
  | { tipo: 'CROSS_SELL'; nombre: string; planActual: string; planSugerido: string; precioSugerido: number };

export function buildRecomendacionUserPrompt(input: RecomendacionInput): string {
  if (input.tipo === 'REACTIVACION') {
    return `Tipo: REACTIVACION\nNombre: ${input.nombre}\nDías sin venir: ${input.diasSinVenir}\nDescuento a ofrecer: ${input.descuentoPct}%`;
  }
  if (input.tipo === 'CROSS_SELL') {
    return `Tipo: CROSS_SELL\nNombre: ${input.nombre}\nPlan actual (bono): ${input.planActual}\nPlan sugerido: ${input.planSugerido}\nPrecio del plan sugerido: ${input.precioSugerido}€/mes`;
  }
  return `Tipo: CLASE_LLENA\nClase: ${input.tipoClase}\nDía de la semana: ${input.diaSemana}\nHora: ${input.hora}\nSemanas consecutivas casi llena: ${input.semanas}`;
}
