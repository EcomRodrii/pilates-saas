// ─────────────────────────────────────────────────────────────────────────────
// Los pasos de cada tutorial de pantalla (P1.1/P1.2). Fichero APARTE del
// catálogo (`pantallas.ts`) a propósito —decisión del fundador del 12-oct-2026—:
// solo lo importa el tutorial, que llega con `dynamic()`, así que estos textos
// no viajan en el chunk de cada pantalla. No es una segunda lista de pantallas:
// las claves son las del catálogo que llevan `tutorial`, y tsc exige que estén
// todas y ninguna más.
//
// Cada paso señala un control REAL (`data-tour="…"` o `#id`, el formato de la
// visita: `selectorCss`). Lo vigila `lib/ayuda/tutoriales.test.ts`: que el
// selector exista en el código, 3–4 pasos, nada congelado.
// ─────────────────────────────────────────────────────────────────────────────
import type { RutaConTutorial } from './pantallas.ts';
import type { IdEjemplo } from './ejemplos.ts';

export interface PasoTutorial {
  /** `data-tour` del control (o `#id`). */
  selector: string;
  /** Seis palabras como mucho. */
  titulo: string;
  /** Dos líneas como mucho, hablando de tú. */
  texto: string;
  /** El control no existe en el móvil: el paso se salta ahí. */
  soloEscritorio?: true;
  /** El control solo lo ve quien puede mover dinero (crear tarifas): para el resto, el paso se salta. */
  requiere?: 'moverDinero';
}

/**
 * «Hazlo conmigo» (P1.3): el último paso abre el formulario REAL de esa misma
 * pantalla con un ejemplo de Pilates marcado como ejemplo. No va por URL: el
 * botón está en la misma pantalla que el formulario, y un enlace a la misma ruta
 * no vuelve a montarla. Lo pide `useTutorial().pedirEjemplo` y lo atiende la
 * pantalla (`lib/ayuda/ejemplos.ts`). Nada se guarda hasta pulsar «Crear».
 */
export interface HazloConmigo {
  /** Lo que dice el botón. */
  texto: string;
  ejemplo: IdEjemplo;
}

export interface TutorialPasos {
  pasos: readonly PasoTutorial[];
  hazloConmigo?: HazloConmigo;
}

export const PASOS_TUTORIAL: { readonly [R in RutaConTutorial]: TutorialPasos } = {
  '/calendario': {
    pasos: [
      { selector: 'calendario-vista', titulo: 'Tu semana de clases', texto: 'Cada bloque es una clase. Púlsalo para ver quién viene, pasar lista o cancelarla.' },
      { selector: 'calendario-vistas', titulo: 'Día, Semana u Horario', texto: 'En «Horario» ves las clases que se repiten: hasta cuándo van y quién tiene clase fija.' },
      // En «Semana» se arrastra a OTRO DÍA a la misma hora; la hora se cambia en «Día» (semana-franjas.tsx).
      { selector: 'calendario-vista', titulo: 'Muévela arrastrando', texto: 'En «Día» la llevas a otra hora; en «Semana», a otro día. Con los avisos activados, sus alumnas se enteran.', soloEscritorio: true },
      { selector: 'calendario-nueva-clase', titulo: 'Programa tu semana de una vez', texto: 'Pulsa «Crear clase» y elige «Clase semanal»: Reformer lunes y miércoles a las 10:00, y se crean todas.' },
    ],
  },
  '/configuracion?tab=clases&abrir=tipos-de-clase': {
    pasos: [
      { selector: 'tipos-clase-lista', titulo: 'Tu catálogo de clases', texto: 'Reformer, Suelo, Embarazadas… De aquí sale tu horario: sin tipo de clase no se programa nada.' },
      { selector: 'tipos-clase-lista', titulo: 'Cada clase, sus reglas', texto: 'Un tipo puede tener reglas propias, distintas de las del estudio: Embarazadas, por ejemplo, con aprobación previa.' },
      { selector: 'tipos-clase-nuevo', titulo: 'Crea tu primer tipo de clase', texto: 'Nombre y duración; sin plazas, valen las de la sala. La foto la cambias después con «Editar».' },
    ],
    hazloConmigo: { texto: 'Hazlo conmigo', ejemplo: 'tipo-clase' },
  },
  '/productos': {
    pasos: [
      // Las pestañas que señala dicen «Suscripciones», no «Cuotas» (productos/page.tsx).
      { selector: 'paquetes-tipos', titulo: 'Suscripción, bono o clase suelta', texto: 'La suscripción se renueva cada mes (o trimestre); el bono son sesiones que se gastan, como 10 de Reformer; la clase suelta, de una en una.' },
      { selector: 'paquetes-lista', titulo: 'Borrador: no sale en tu página', texto: 'Una tarifa en «Borrador» o sin ponerla a la venta no sale en tu página ni en la Caja.' },
      { selector: 'paquetes-crear', titulo: 'Crea tu primer bono', texto: 'En «Clases incluidas» decides qué cubre: un bono de Reformer no tiene por qué valer para Suelo.', requiere: 'moverDinero' },
    ],
    hazloConmigo: { texto: 'Hazlo conmigo', ejemplo: 'bono' },
  },
  '/clientas': {
    pasos: [
      // Las definiciones son las de `lib/clientas/estado.ts` (DEFINICION_ESTADO).
      { selector: 'clientas-estados', titulo: 'Cada clienta, su estado', texto: '«Activa» es quien puede reservar ahora o ha venido hace poco. Pulsa un estado para ver solo esas.' },
      { selector: 'clientas-interesadas', titulo: 'Interesadas y pruebas, aparte', texto: 'Quien solo preguntó o tiene su clase de prueba está en «Interesadas y pruebas», para que le hagas seguimiento.' },
      { selector: 'clientas-importar', titulo: '¿Vienes de otro programa?', texto: 'Con «Importar» subes tu lista entera de una vez, sin teclear a nadie.', soloEscritorio: true },
      // Obligatorios: nombre, apellidos y aceptar las condiciones; el email no (clientas/page.tsx).
      { selector: 'clientas-nueva', titulo: 'Da de alta a una clienta', texto: 'Nombre, apellidos y que acepte las condiciones; el email es opcional, pero sin él no entra en su app.' },
    ],
  },
  '/cobros': {
    pasos: [
      { selector: 'cobros-resumen', titulo: 'Tu mes de un vistazo', texto: 'Lo que te deben, lo que está en el banco y lo cobrado este mes, frente al anterior.' },
      // «Se cobra sola» solo con Stripe Y un método guardado (tarjeta o SEPA).
      { selector: 'cobros-secciones', titulo: 'Lo pendiente y lo cobrado', texto: 'Con Stripe y la tarjeta de la clienta guardada, la cuota se cobra sola; lo que no entra sale en «Quién me debe».' },
      { selector: 'cobros-nuevo', titulo: 'Te han pagado en mano', texto: 'Efectivo o transferencia: apúntalo con «Nuevo cobro» y queda en su ficha.' },
    ],
  },
  '/configuracion?tab=reservas': {
    pasos: [
      // En el orden de la pantalla (seccion-reservas.tsx): el anillo baja, no sube y baja.
      { selector: '#reservar', titulo: 'Quién puede reservar', texto: 'Si pides bono o cuota y con cuánta antelación. Cada tipo de clase puede tener sus propias reglas.' },
      { selector: '#lista-de-espera', titulo: 'Clase llena, lista de espera', texto: 'Si se libera una plaza, pasa a la primera de la lista sin que hagas nada, o se le ofrece con plazo si lo eliges.' },
      { selector: '#cancelar-y-recuperar', titulo: 'Hasta cuándo se cancela', texto: 'Con 12 h, quien cancela la clase de las 9:00 después de las 21:00 del día antes pierde la sesión.' },
    ],
  },
};

/**
 * Los pasos que ve ESTA persona en ESTE ancho: los de un control que solo
 * existe en pantalla ancha no salen en el móvil, y los de crear una tarifa solo
 * a quien puede mover dinero. La tarjeta usa esto; la guardia exige que nunca
 * queden menos de dos.
 */
export function pasosVisibles(t: TutorialPasos, quien: { escritorio: boolean; moverDinero: boolean }): PasoTutorial[] {
  return t.pasos.filter(p => (quien.escritorio || !p.soloEscritorio) && (p.requiere !== 'moverDinero' || quien.moverDinero));
}

/** «Hazlo conmigo» abre un formulario que crea: el del bono, solo para quien puede crear tarifas. */
export function hazloConmigoPara(t: TutorialPasos, quien: { moverDinero: boolean }): HazloConmigo | null {
  if (!t.hazloConmigo) return null;
  return t.hazloConmigo.ejemplo !== 'bono' || quien.moverDinero ? t.hazloConmigo : null;
}
