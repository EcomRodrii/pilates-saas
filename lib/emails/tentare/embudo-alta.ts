// Correo a quien empezó a dar de alta su estudio y lo dejó a medias, 24 h
// después. El TEXTO cambia según dónde se quedó y sale de una sola función pura
// (`contenidoRecordatorio`, lib/alta/abandono.ts): aquí solo se viste con la
// plantilla de Tentare.
//
// Antes había dos variantes fijas (sin confirmar / confirmado) y la primera
// hablaba de «el enlace de confirmación»: el correo de alta lleva un CÓDIGO de
// 6 cifras desde hace semanas, no un enlace (ver app/crear-estudio).
import { correoTentare, TENTARE } from './plantilla.ts';
import type { ContenidoRecordatorio } from '../../alta/abandono.ts';

export function correoAltaSinTerminar(c: ContenidoRecordatorio): string {
  return correoTentare({
    preheader: c.preheader,
    antetitulo: 'Tu alta en Tentare',
    titular: c.titular,
    parrafos: c.parrafos,
    boton: c.boton,
    nota: c.nota,
    acento: TENTARE.dorado,
    motivo: 'Te escribimos porque empezaste a dar de alta un estudio en Tentare con esta dirección.',
  });
}
