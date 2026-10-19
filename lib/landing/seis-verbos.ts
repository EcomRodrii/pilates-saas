// ─────────────────────────────────────────────────────────────────────────────
// «Seis cosas que Tentare hace por ti» (ronda 3 de la landing, 19-oct-2026).
//
// La forma viene de Momence (seis tarjetas «verbo + punto» justo bajo el héroe,
// cada una a SU sitio); el texto es de Tentare y solo habla de funciones reales
// y activas. Los datos viven aquí, y no dentro del componente, para que el test
// pueda comprobar dos cosas que un componente no deja comprobar:
//  · que cada tarjeta lleva a una ruta que existe, y que las seis son distintas
//    (el fallo de Momence: seis «Learn more» que iban todos a la demo);
//  · que cada afirmación aparece de verdad en la página de función que enlaza
//    (`fuente`: fichero + frases literales; si alguien cambia esa página y la
//    frase deja de constar, el test lo dice).
//
// Nada de cifras (ni «1, 3 y 7 días», ni «6 reglas»): no hacen falta para que
// la tarjeta se entienda, y una cifra es una promesa más que mantener.
//
// Puro y sin `@/`: lo leen `node --test` y el componente.
// ─────────────────────────────────────────────────────────────────────────────

export interface VerboFuncion {
  /** El verbo, en imperativo y sin el punto (el punto lo pone el estilo). */
  verbo: string;
  /** Una frase, en positivo y verdadera. */
  texto: string;
  /** La página de función a la que lleva la tarjeta. */
  href: string;
  /** Cómo se llama esa función en el menú de /funcionalidades. */
  funcion: string;
  /** Dónde del repo consta lo que dice `texto`, con frases literales que lo prueban. */
  fuente: { fichero: string; frases: readonly string[] };
}

export const SEIS_VERBOS: readonly VerboFuncion[] = [
  {
    verbo: 'Reserva',
    texto: 'Tus alumnas reservan desde tu app o tu web, y la lista de espera ocupa las plazas que se liberan.',
    href: '/funcionalidades/reservas-online',
    funcion: 'Reservas online',
    fuente: { fichero: 'app/funcionalidades/reservas-online/page.tsx', frases: ['Reservan solas', 'La página que ven tus alumnas'] },
  },
  {
    verbo: 'Cobra',
    texto: 'Cuotas y bonos con tarjeta o remesa SEPA. Si un cobro falla, se reintenta solo.',
    href: '/funcionalidades/cobros-recurrentes',
    funcion: 'Cobros recurrentes',
    fuente: { fichero: 'app/funcionalidades/cobros-recurrentes/page.tsx', frases: ['Cobra sin perseguir a nadie', 'Remesa SEPA', 'reintenta'] },
  },
  {
    verbo: 'Avisa',
    texto: 'El recordatorio de la clase sale de serie; otros avisos, como el de una alumna que lleva tiempo sin venir, los enciendes tú.',
    href: '/funcionalidades/automatizaciones-y-avisos',
    funcion: 'Automatizaciones y avisos',
    fuente: { fichero: 'app/funcionalidades/automatizaciones-y-avisos/page.tsx', frases: ['El recordatorio va de serie', 'quien lleva un mes sin venir', 'las enciendes tú'] },
  },
  {
    verbo: 'Cubre',
    texto: 'Si una instructora no puede dar su clase, Tentare propone quién la cubre. Tú das el visto bueno.',
    href: '/funcionalidades/sustituciones',
    funcion: 'Sustituciones',
    fuente: { fichero: 'app/funcionalidades/sustituciones/page.tsx', frases: ['La baja se cubre sola', 'Con tu visto bueno', 'asistido'] },
  },
  {
    verbo: 'Factura',
    texto: 'Si la activas, cada cobro, menos el efectivo, saca su factura con numeración correlativa.',
    href: '/funcionalidades/facturacion',
    funcion: 'Facturación',
    fuente: { fichero: 'app/funcionalidades/facturacion/page.tsx', frases: ['salvo el efectivo', 'número correlativo', 'Actívalo'] },
  },
  {
    verbo: 'Mide',
    texto: 'Qué clases te dan dinero, cuáles salen medio vacías y qué alumnas llevan tiempo sin venir.',
    href: '/funcionalidades/informes-y-rentabilidad',
    funcion: 'Informes y rentabilidad',
    fuente: { fichero: 'app/funcionalidades/informes-y-rentabilidad/page.tsx', frases: ['¿Qué clases te dan dinero?', 'medio vacías', 'sin aparecer'] },
  },
];
