// ─────────────────────────────────────────────────────────────────────────────
// Qué se le dice a la propietaria tras cancelar (o eliminar) clases (P0.3,
// 12-oct-2026). Puro: se prueba con `node --test`.
//
// La clase SÍ se cancela, pero puede quedar algo a medias que alguien tiene que
// arreglar: una alumna que no recuperó la sesión de su bono, o que no recibió el
// aviso y vendrá a una clase que no existe. Eso salía con el ✓ verde y 3 s, y
// empezaba por «Clase cancelada», así que se leía como «todo bien». Ahora, si hay
// algo que hacer, va primero y en rojo; la confirmación, después.
// ─────────────────────────────────────────────────────────────────────────────

export interface ResultadoCancelacion {
  /** Qué se hizo, para la frase: «Clase cancelada», «Serie cancelada · 4 clases», «Clase eliminada». */
  hecho: string;
  /** La misma confirmación cuando hay que contar antes un problema: «La clase sí está cancelada». */
  confirmacion: string;
  /** `false` = no se pudieron cancelar sus reservas (siguen confirmadas). */
  reservasCanceladas?: boolean;
  avisadas: number;
  sinAvisar: number;
  /** `false` = el aviso en la app no salió. */
  enApp?: boolean | null;
  /** Ya redactado por quien cancela («No hemos podido devolver la sesión al bono de…»). */
  avisoBono?: string | null;
}

export function avisoTrasCancelar(r: ResultadoCancelacion): { texto: string; error: boolean } {
  if (r.reservasCanceladas === false) {
    return { texto: `${r.hecho}, pero no hemos podido cancelar sus reservas: recarga la página.`, error: true };
  }
  const pendiente: string[] = [];
  if (r.avisoBono) pendiente.push(r.avisoBono.trim());
  if (r.sinAvisar > 0) {
    pendiente.push(r.sinAvisar === 1
      ? 'A 1 clienta no le ha llegado el aviso: escríbele o llámala.'
      : `A ${r.sinAvisar} clientas no les ha llegado el aviso: escríbeles o llámalas.`);
  }
  if (r.enApp === false) pendiente.push('El aviso en su app no ha salido.');
  if (pendiente.length > 0) return { texto: `${pendiente.join(' ')} ${r.confirmacion}.`, error: true };
  return { texto: `${r.hecho} · ${r.avisadas > 0 ? 'clientas avisadas' : 'sin clientas a las que avisar'}`, error: false };
}
