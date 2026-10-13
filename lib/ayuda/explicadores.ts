// ─────────────────────────────────────────────────────────────────────────────
// Explicadores: un CONCEPTO difícil contado con un caso concreto y números
// redondos (componente 16 del estudio de Bonsai). No es un tutorial de pantalla
// (`tutoriales.ts`, que señala botones): no apunta a nada, cuenta una idea.
//
// Reglas del catálogo (las vigila `explicadores.test.ts`):
//   · de 3 a 9 pasos, cada uno con 1 a 5 líneas;
//   · al menos un paso con un ejemplo en euros (con números, no con fórmulas);
//   · las «recetas» y dónde vive cada ajuste, siempre;
//   · los números del ejemplo salen IGUAL de la función real (su test lo calcula).
//
// «Visto» se guarda por persona (no por estudio: el concepto es el mismo en todas
// las sedes de una cadena), con el mismo almacén que los tutoriales.
// Puro, sin `@/`.
// ─────────────────────────────────────────────────────────────────────────────

export type IdExplicador = 'euroPorPlaza';
export type IdDibujo = 'repartoAlumna' | 'sumaHora' | 'sillas' | 'dosSalas' | 'leerMapa';

export interface PasoExplicador {
  titulo: string;
  lineas: string[];
  dibujo: IdDibujo;
}

export interface Explicador {
  /** Sube si el contenido cambia: vuelve a contar como nuevo. */
  version: number;
  titulo: string;
  pasos: PasoExplicador[];
  /** Una línea por caso: «Cuota, bono o clase suelta = …». */
  recetas: string[];
  /** Dónde vive esto en el producto. */
  dondeVive: string;
}

export const EXPLICADORES: Record<IdExplicador, Explicador> = {
  euroPorPlaza: {
    version: 1,
    titulo: '¿Qué es el € por plaza?',
    pasos: [
      {
        titulo: 'Cada alumna reparte lo que pagó entre sus clases',
        dibujo: 'repartoAlumna',
        lineas: [
          'Ana pagó 60 € en el periodo y vino 4 veces: cada clase suya aporta 15 €.',
          'Marta compró en el periodo un bono de 80 € y vino 4 veces: 20 € cada una.',
          'Quien viene con un bono comprado antes ocupa su plaza, pero aquí aporta 0 €.',
        ],
      },
      {
        titulo: 'Se suma lo que aporta cada hora',
        dibujo: 'sumaHora',
        lineas: [
          'El martes a las 18:00 vinieron Ana (15 €), Marta (20 €) y Lucía (10 €): 45 €.',
          'Y así con todas las clases de esa hora en el periodo: se suma lo de cada una.',
        ],
      },
      {
        titulo: 'Se divide entre todas las plazas, también las vacías',
        dibujo: 'sillas',
        lineas: [
          'Si en el periodo solo hubo esa clase, con 6 plazas: 45 € ÷ 6 = 7,50 € por plaza. Con más clases, se suman sus plazas.',
          'Una plaza vacía cuenta igual: la pusiste a la venta. Llenarla sube el € por plaza; tener menos a la venta, también.',
        ],
      },
      {
        titulo: 'Por qué no basta con la ocupación',
        dibujo: 'dosSalas',
        lineas: [
          'Un Reformer de 4 plazas lleno (100 %), con alumnas de cuota que vienen mucho: 4 × 5 € = 20 €, 5 € por plaza.',
          'Un Mat de 10 plazas con 7 alumnas (70 %) de bono: 7 × 10 € = 70 €, 7 € por plaza.',
          'Mirando solo el porcentaje, parecería mejor la que menos trae por plaza.',
        ],
      },
      {
        titulo: 'Cómo leer el mapa',
        dibujo: 'leerMapa',
        lineas: [
          'Cada casilla es un día y una hora. No resta lo que te cuesta dar cada clase.',
          'Cuanto más marcada la casilla, más € por plaza que tus otras horas: no hay un número bueno en general.',
          '«—» son menos de 4 clases: muy pocas para fiarse. Cada casilla abre su cálculo.',
          'Se lee mejor con un trimestre ya cerrado: un bono pagado antes cuenta 0 € y un festivo pesa menos.',
        ],
      },
    ],
    recetas: [
      'Cuota, bono o clase suelta = lo que pagó en el periodo ÷ sus clases.',
      'ClassPass, Wellhub o USC = 0 €, pero ocupa plaza.',
      'Faltó sin avisar = cuenta: ocupó la plaza.',
      'Caja, sesiones privadas, matrículas y pagos importados = no se reparten.',
    ],
    dondeVive: 'Informes, con un mes, un trimestre o un año ya cerrados.',
  },
};

/** El almacén de «visto» de los explicadores: por persona. */
export const claveExplicadores = (usuarioId: string) => `tentare:explicadores:v1:${usuarioId}`;
