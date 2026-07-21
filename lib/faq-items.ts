// Fuente única de las preguntas frecuentes — usada por la landing (app/page.tsx)
// y por /recursos/faq como página independiente enlazable desde el footer.
export const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: '¿Y si el sistema le cobra a una clienta por error mientras yo duermo?',
    a: 'El sistema autónomo prepara la acción (renovar un bono, reintentar un cobro fallido) pero cada cobro sale con tu aprobación de un toque, no en automático sin control. Tú decides qué acciones requieren tu OK y cuáles se ejecutan solas — configurable por tipo de acción.',
  },
  {
    q: '¿Cuánto tarda de verdad la migración y quién la hace?',
    a: 'Exportas tu CSV actual (de Excel, Bsport, Mindbody, Nubapp, Eversports o cualquier otro), lo subes al importador de Tentare y el sistema detecta y mapea las columnas solo — tú confirmas antes de importar. Socias, membresías y horario suelen quedar listos en minutos, no días. Si prefieres que lo hagamos nosotros, también podemos migrarte a mano.',
  },
  {
    q: '¿Esto emite factura legal en España? ¿Verifactu?',
    a: 'Sí generamos factura con NIF, IVA y numeración correlativa desde el primer cobro. La integración con Verifactu/AEAT está en desarrollo — hoy la facturación es real pero aún no envía a Hacienda automáticamente.',
  },
  {
    q: '¿Os lleváis comisión de mis cobros?',
    a: 'No. Los pagos se procesan por Stripe (tarjeta y SEPA) y solo pagas la cuota estándar de Stripe — Tentare no añade ninguna comisión extra sobre tus cobros.',
  },
  {
    q: '¿Funciona con reformer, salas y aforo, o es genérico?',
    a: 'Está pensado para pilates de verdad: gestión de salas con capacidad propia, mapa de spots por reformer, tipos de clase con aforo y precio independiente, y bonos de sesiones — no es un calendario genérico reetiquetado.',
  },
  {
    q: '¿Y si quiero cancelar, me llevo mis datos?',
    a: 'Sí. Sin permanencia: puedes exportar socias, historial de asistencia y facturas en cualquier momento, te quedes o te vayas.',
  },
  {
    q: '¿La app de marca está de verdad en las stores, o es una web?',
    a: 'Hoy es un portal web instalable (PWA) con tu nombre y tus colores — tus socias lo añaden a su pantalla de inicio como una app, sin pasar por App Store ni Google Play. La publicación en tiendas está en el roadmap.',
  },
];
