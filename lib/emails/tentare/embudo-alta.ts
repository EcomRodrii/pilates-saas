// Correos del embudo de alta (Fase 3 del onboarding): a quien empezó a crear
// su cuenta y se quedó a medias, más de 24h después. Dos variantes reales,
// no una genérica — según haya confirmado o no el email en ese momento el
// siguiente paso correcto es distinto:
//  · Sin confirmar: el enlace de confirmación caducó o nunca llegó a
//    pulsarlo. Vuelve a /crear-estudio, que reintenta el signup/OTP.
//  · Confirmado pero sin estudio: la cuenta existe, `dbCreateStudio` falló
//    justo después de confirmar (ver scripts/recuperar-altas-huerfanas.ts).
//    El paso correcto es /login, que YA detecta `pending_studio` sola y
//    monta el estudio sin que la persona vuelva a teclear nada.
import { correoTentare, TENTARE } from './plantilla.ts';

export function correoEmbudoSinConfirmar(p: {
  estudioNombre: string;
  urlCrearEstudio: string;
}): string {
  return correoTentare({
    preheader: `Te falta un paso para activar ${p.estudioNombre}`,
    antetitulo: 'Tu alta en Tentare',
    titular: 'Te falta un paso para activar tu estudio',
    parrafos: [
      `Empezaste a dar de alta ${p.estudioNombre} en Tentare, pero el enlace de confirmación no ha llegado a usarse todavía.`,
      'No se ha perdido nada de lo que contaste: solo falta confirmar tu email para terminar.',
    ],
    boton: { href: p.urlCrearEstudio, texto: 'Terminar mi alta' },
    nota: 'Si no fuiste tú quien empezó esta alta, puedes ignorar este correo.',
    acento: TENTARE.dorado,
    motivo: `Te escribimos porque hay una alta sin terminar para ${p.estudioNombre}.`,
  });
}

export function correoEmbudoConfirmadoSinEstudio(p: {
  estudioNombre: string;
  urlLogin: string;
}): string {
  return correoTentare({
    preheader: `${p.estudioNombre} está a un clic de estar listo`,
    antetitulo: 'Tu alta en Tentare',
    titular: 'Tu estudio está a un clic de estar listo',
    parrafos: [
      `Confirmaste tu email para ${p.estudioNombre}, pero el montaje de tu estudio no llegó a completarse — a veces pasa por un corte de conexión.`,
      'No hace falta que vuelvas a contar nada: entra y lo terminamos solos.',
    ],
    boton: { href: p.urlLogin, texto: 'Entrar y terminarlo' },
    nota: 'Si no fuiste tú quien empezó esta alta, puedes ignorar este correo.',
    acento: TENTARE.dorado,
    motivo: `Te escribimos porque hay una alta sin terminar para ${p.estudioNombre}.`,
  });
}
