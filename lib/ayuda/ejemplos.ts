// ─────────────────────────────────────────────────────────────────────────────
// «Hazlo conmigo» (P1.3): el ejemplo con el que el tutorial abre un formulario
// real. Puro.
//
// ⚠️ Solo BANDA y PLACEHOLDERS, nunca valores. El formulario se abre con su
// estado inicial de siempre (el mismo que «Nuevo») y el ejemplo se ve en gris,
// en el sitio de cada campo. Así:
//   · nada se guarda solo: los campos obligatorios siguen vacíos, y pulsar
//     «Crear» sin escribir choca con la validación de siempre;
//   · el ejemplo no puede mentir: un 6 de muestra en «Plazas» diría 6 donde
//     vacío significa «las de la sala».
// Los textos son de Pilates (lo vigila `lib/ayuda/ejemplos.test.ts`).
// ─────────────────────────────────────────────────────────────────────────────

export type IdEjemplo = 'tipo-clase' | 'bono';

export interface Ejemplo {
  /** La franja de arriba del formulario: qué escribir y que nada se guarda solo. */
  banda: string;
  /** Texto en gris de cada campo, por su nombre en el formulario. */
  placeholders: Readonly<Record<string, string>>;
}

export const EJEMPLOS: Readonly<Record<IdEjemplo, Ejemplo>> = {
  'tipo-clase': {
    banda: 'Ejemplo · el texto en gris es solo una guía: escribe «Reformer iniciación», elige 50 minutos y «Principiante». Nada se guarda hasta que pulses «Crear tipo de clase».',
    placeholders: { nombre: 'Reformer iniciación' },
  },
  bono: {
    // Sin «de Reformer»: obligaría a elegir en «Clases incluidas» un tipo que quizá no existe.
    banda: 'Ejemplo · el texto en gris es solo una guía: escribe «Bono 10 clases», 120 €, 10 sesiones y 90 en «Caducidad». Nada se guarda hasta que pulses «Crear bono de sesiones».',
    placeholders: { nombre: 'Bono 10 clases', precio: '120,00', sesiones: '10' },
  },
};
