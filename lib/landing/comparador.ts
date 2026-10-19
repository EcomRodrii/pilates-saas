// ─────────────────────────────────────────────────────────────────────────────
// «Cómo lo haces hoy, y cómo con Tentare» (ronda 3 de la landing, 19-oct-2026).
//
// La forma viene del antes/después de Mariana Tek: dos columnas, lo de siempre a
// un lado y lo nuevo al otro. El contenido es de Tentare, y cada fila contrasta
// DOS COSAS VERIFICABLES: lo que hace una dueña a mano hoy (el problema que ya
// cuentan las páginas de función con sus palabras) y lo que el producto hace.
//
// Reglas de esta lista (las vigila `ronda-3.test.ts`):
//  · Ni una cifra, ni un porcentaje, ni «ahorra X horas». No hay medida que las
//    respalde, y la columna de «hoy» es una suposición razonable sobre el lector,
//    no una estadística.
//  · Cada fila lleva su `fuente`: el fichero del repo y las frases literales que
//    prueban lo que dice la columna «Con Tentare». Si la página cambia y la frase
//    deja de constar, el test avisa de que la afirmación ya no se sostiene.
//  · Solo funciones activas: nada de lo congelado (Kiosko, VOD, Chat de equipo,
//    Network), ni plataformas externas apagadas, ni Veri*Factu más allá de lo que
//    la página de facturación dice que existe.
//
// Puro y sin `@/`: lo leen `node --test` y el componente.
// ─────────────────────────────────────────────────────────────────────────────

export interface FilaComparador {
  /** Qué parte del estudio es (los mismos verbos de las seis tarjetas). */
  tema: string;
  /** Cómo se hace hoy, a mano. */
  hoy: string;
  /** Qué hace Tentare. */
  conTentare: string;
  /** Dónde consta `conTentare`: fichero y frases literales. */
  fuente: { fichero: string; frases: readonly string[] };
}

export const COMPARADOR: readonly FilaComparador[] = [
  {
    tema: 'Reservas',
    hoy: 'Te escriben por WhatsApp y apuntas la plaza en una hoja de cálculo.',
    conTentare: 'Reservan desde tu app, con tu nombre y tu logo. Si la clase está llena, entran en la lista de espera.',
    fuente: {
      fichero: 'app/funcionalidades/reservas-online/page.tsx',
      frases: ['El coste real de reservar por WhatsApp', 'Tu marca, no la nuestra'],
    },
  },
  {
    tema: 'Cobros',
    hoy: 'Revisas quién ha pagado y escribes a quien no, una por una.',
    conTentare: 'Las cuotas se cobran solas con la tarjeta guardada, o por remesa SEPA. Si una tarjeta falla, se reintenta y a la alumna le llega el aviso.',
    fuente: {
      fichero: 'app/funcionalidades/cobros-recurrentes/page.tsx',
      frases: ['La cuota se cobra sola el día que toca', 'Remesa SEPA', 'La socia recibe un aviso amable'],
    },
  },
  {
    tema: 'Avisos',
    hoy: 'Recuerdas a mano la clase de mañana y a quien lleva semanas sin venir.',
    conTentare: 'El recordatorio de la clase sale de serie y, si lo enciendes, Tentare también avisa a quien lleva tiempo sin venir.',
    fuente: {
      fichero: 'app/funcionalidades/automatizaciones-y-avisos/page.tsx',
      frases: ['El recordatorio va de serie', 'preguntar por quien lleva un mes sin venir', 'las enciendes tú'],
    },
  },
  {
    tema: 'Bajas de instructora',
    hoy: 'Una instructora no puede venir y escribes al equipo, una por una.',
    conTentare: 'Tentare propone quién puede cubrir esa clase, le escribe por orden y el cambio llega a las alumnas apuntadas. Tú das el visto bueno.',
    fuente: {
      fichero: 'app/funcionalidades/sustituciones/page.tsx',
      frases: ['La baja se cubre sola', '¿Las alumnas se enteran de que cambia la instructora?', 'Con tu visto bueno'],
    },
  },
  {
    tema: 'Facturas',
    hoy: 'Cobras en un sitio, facturas en otro y a fin de mes cuadras los dos.',
    conTentare: 'Si activas la facturación, cada cobro, menos el efectivo, genera su factura numerada sin pasos intermedios.',
    fuente: {
      fichero: 'app/funcionalidades/facturacion/page.tsx',
      frases: ['se cobra en un sitio y se factura en otro', 'salvo el efectivo', 'Actívalo'],
    },
  },
  {
    tema: 'Números',
    hoy: 'El mes cuadra, pero no sabes qué clase te da dinero.',
    conTentare: 'Ves lo que deja cada clase, cuánto se llena cada tipo y qué alumnas llevan tiempo sin aparecer.',
    fuente: {
      fichero: 'app/funcionalidades/informes-y-rentabilidad/page.tsx',
      frases: ['El mes cuadra. La clase de las 10:00 no', 'Ocupación por tipo de clase', 'sin aparecer'],
    },
  },
];
