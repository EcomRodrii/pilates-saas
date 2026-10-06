'use client';

import type { BloqueAsistente } from '@/lib/asistente/tipos';
import { BloqueMetricas } from './metricas';
import { BloqueClases } from './clases';
import { BloqueAlumnas, BloqueBonos, BloqueRecibos } from './personas';
import { BloqueFranjas } from './franjas';
import { BloqueRevisar } from './revisar';

/** Una tarjeta del asistente, según su tipo. Un tipo desconocido (fase 2) no se pinta. */
export function Bloque({ bloque }: { bloque: BloqueAsistente }) {
  switch (bloque.tipo) {
    case 'metricas': return <BloqueMetricas bloque={bloque} />;
    case 'clases': return <BloqueClases bloque={bloque} />;
    case 'alumnas': return <BloqueAlumnas bloque={bloque} />;
    case 'bonos': return <BloqueBonos bloque={bloque} />;
    case 'recibos': return <BloqueRecibos bloque={bloque} />;
    case 'franjas': return <BloqueFranjas bloque={bloque} />;
    case 'revisar': return <BloqueRevisar bloque={bloque} />;
    default: return null;
  }
}
