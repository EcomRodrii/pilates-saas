// ¿Cambiar el correo de alguien del equipo le reinicia el acceso?
//
// El caso (15-sep-2026): la propietaria le cambió el correo a una persona del
// equipo que ya tenía acceso. Su ficha siguió unida a la cuenta del correo
// ANTIGUO, así que cuando entró en la app con el nuevo —otra cuenta— la app no
// la reconoció y la dio de alta como alumna.
//
// Criterio, el mismo que ya se sigue con las alumnas (al cambiarles el correo en
// el panel se desvincula su cuenta): el correo nuevo manda. La ficha se suelta de
// la cuenta antigua y la persona vuelve a entrar con el nuevo — por la invitación
// o, si es instructora, eligiendo «Como instructora» en la app.
//
// Sin sí:
//   · Si el correo no cambia de verdad (mayúsculas, espacios): nadie se queda
//     fuera por reescribir lo mismo.
//   · Si la ficha no tiene cuenta: no hay nada que soltar.
//   · Si es la ficha PROPIA de quien edita: se echaría a sí misma del panel.
//   · Si es de PROPIETARIO: esa ficha no se puede volver a reclamar (ver
//     `reclamar-reglas.ts`); cambiar a la dueña de cuenta es un traspaso aparte.

import type { Rol } from '../types';

export interface CambioCorreoEquipo {
  emailAntes: string | null;
  emailNuevo: string | null;
  tieneCuenta: boolean;
  rol: Rol | null;
  esPropia: boolean;
}

const normalizar = (email: string | null) => (email ?? '').trim().toLowerCase();

export function reiniciaAccesoAlCambiarEmail(c: CambioCorreoEquipo): boolean {
  if (!c.tieneCuenta || c.esPropia || c.rol === 'PROPIETARIO') return false;
  return normalizar(c.emailAntes) !== normalizar(c.emailNuevo);
}
