// FE-04: /api/network/interes es público y sin verificar el email, así que un
// reenvío con el correo de un lead existente NO puede reescribir lo que ya hay
// (envenenaba el CRM). Un reenvío solo rellena los campos que seguían vacíos;
// lo demás llega igualmente a soporte en el aviso por email.

export interface DatosLead {
  nombre: string | null;
  estudio: string | null;
  ciudad: string | null;
  mensaje: string | null;
}

const CLAVES: (keyof DatosLead)[] = ['nombre', 'estudio', 'ciudad', 'mensaje'];

/** Campos a escribir sobre el lead existente: solo los vacíos que el reenvío trae. */
export function camposVaciosARellenar(existente: Partial<DatosLead>, nuevo: DatosLead): Partial<DatosLead> {
  const out: Partial<DatosLead> = {};
  for (const k of CLAVES) {
    const actual = existente[k];
    const vacio = actual === null || actual === undefined || actual === '';
    if (vacio && nuevo[k]) out[k] = nuevo[k];
  }
  return out;
}
