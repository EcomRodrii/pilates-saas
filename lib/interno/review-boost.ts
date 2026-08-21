// Agregación pura del funnel de Review Boost — mismo criterio que
// lib/interno/crecimiento.ts: recibe filas, calcula lo que hay que enseñar,
// testeable sin levantar nada.

export interface FilaFeedback { rating: number; }
export interface FilaRecompensa { concedidaEn: string; canjeadaEn: string | null; }

export interface ResumenReviewBoost {
  elegibles: number;
  mostrados: number;
  feedbacks: number;
  ratingsBajos: number; // 1-3
  ratingsAltos: number; // 4-5
  recompensasConcedidas: number;
  recompensasCanjeadas: number;
}

export function resumirReviewBoost(datos: {
  elegibles: number;
  mostrados: number;
  feedbacks: FilaFeedback[];
  recompensas: FilaRecompensa[];
}): ResumenReviewBoost {
  return {
    elegibles: datos.elegibles,
    mostrados: datos.mostrados,
    feedbacks: datos.feedbacks.length,
    ratingsBajos: datos.feedbacks.filter(f => f.rating <= 3).length,
    ratingsAltos: datos.feedbacks.filter(f => f.rating >= 4).length,
    recompensasConcedidas: datos.recompensas.length,
    recompensasCanjeadas: datos.recompensas.filter(r => r.canjeadaEn).length,
  };
}
