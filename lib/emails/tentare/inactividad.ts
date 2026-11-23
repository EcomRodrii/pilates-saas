// El correo de «llevas 30 días sin usar Tentare» (lib/retencion/aviso-inactividad.ts). Aquí solo se decide
// qué dice; cómo se ve lo pone `correoTentare`.
//
// ⚠️ Como el resto de avisos de la cuenta, NO promete ni amenaza con consecuencias que no estén decididas:
// no habla de dar de baja ni de borrar nada. Si algún día el borrado existe, su frase la escribe el
// fundador junto con su plazo; hasta entonces este correo solo ofrece ayuda y deja la puerta abierta.

import { LEGAL } from '../../legal-info.ts';
import { correoTentare } from './plantilla.ts';

export function correoInactividad(p: {
  estudioNombre: string;
  dias: number;
  /** El panel, en el despliegue desde el que se manda. */
  urlPanel: string;
}): { asunto: string; preheader: string; html: string } {
  const estudio = p.estudioNombre.trim() || 'Tu estudio';
  const preheader = `En ${estudio} no hay actividad desde hace ${p.dias} días. Tus datos siguen como los dejaste.`;
  const html = correoTentare({
    preheader,
    antetitulo: 'Tu cuenta',
    titular: 'Llevamos un tiempo sin verte por Tentare',
    parrafos: [
      `En ${estudio} no ha habido actividad desde hace ${p.dias} días. Tu estudio, tus clientas y tu configuración siguen exactamente como los dejaste.`,
      'Si algo no te encajó o no sabes por dónde seguir, escríbenos y lo vemos contigo. Y si ya no vas a usar Tentare, también puedes decírnoslo.',
    ],
    boton: { href: p.urlPanel, texto: 'Entrar en Tentare' },
    enlace: { href: `mailto:${LEGAL.email}`, texto: `Escribirnos a ${LEGAL.email}` },
    motivo: `Te escribimos porque eres la propietaria de ${estudio} en Tentare.`,
  });
  return { asunto: `${estudio}: ¿te echamos una mano?`, preheader, html };
}
