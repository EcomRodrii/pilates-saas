// ═══════════════════════════════════════════════════════════════════════════
// Catálogo de tareas — el puente entre "lo que quiero hacer" y "dónde está"
// ═══════════════════════════════════════════════════════════════════════════
//
// El menú lateral está organizado por LUGARES (Agenda, Clientes, Cobros) porque
// un menú de verbos se rompe en cuanto una pantalla sirve para cinco cosas: hay
// que repetir destinos y se pierde la noción de dónde estás.
//
// Pero la persona no piensa en lugares, piensa en tareas: "tengo que cobrarle a
// Marta", "hay que meter la clase de los jueves". Este catálogo es la traducción
// entre las dos cosas. Se consulta desde el buscador (⌘K) y desde el botón
// "¿Qué quieres hacer?", y hace que no haga falta conocer la estructura del menú
// para llegar a un sitio.
//
// Cómo escribir una tarea:
//   · `label` empieza por VERBO en infinitivo, como lo diría alguien en voz alta.
//   · `claves` son las palabras con las que otra persona buscaría lo mismo,
//     incluidos los términos de la competencia (bono, membresía, TPV…). Aquí es
//     donde se compensa que el producto y la usuaria no llamen igual a las cosas.
//   · `href` debe DEJARLA HACIENDO la tarea, no en la puerta: si hay forma de
//     abrir el formulario directamente, se usa.

export interface Tarea {
  id: string;
  /** Empieza por verbo: "Crear una clase". */
  label: string;
  /** A dónde lleva. Con parámetro cuando abre el formulario directamente. */
  href: string;
  /** Sinónimos y palabras que usaría otra persona para lo mismo. */
  claves: string[];
  /** Contexto corto, para desambiguar entre tareas parecidas. */
  pista?: string;
}

export const TAREAS: Tarea[] = [
  // ── Día a día ──────────────────────────────────────────────────────────────
  {
    id: 'nueva-clienta',
    label: 'Dar de alta a una clienta',
    href: '/clientas?nuevo=1',
    claves: ['alta', 'nueva socia', 'nuevo cliente', 'apuntar', 'inscribir', 'registrar persona', 'miembro'],
  },
  {
    id: 'nueva-clase',
    label: 'Crear una clase',
    href: '/calendario?nueva=1',
    claves: ['sesion', 'agenda', 'horario', 'programar clase', 'anadir clase'],
  },
  {
    id: 'clases-recurrentes',
    label: 'Crear clases que se repiten cada semana',
    href: '/calendario?recurrentes=1',
    claves: ['recurrente', 'semanal', 'todas las semanas', 'horario fijo', 'serie'],
    pista: 'Para el horario fijo del estudio',
  },
  {
    id: 'nueva-cita',
    label: 'Reservar una cita',
    href: '/citas?nueva=1',
    claves: ['cita', 'privada', 'individual', 'valoracion', 'fisioterapia', 'uno a uno'],
  },
  {
    id: 'cobrar-caja',
    label: 'Cobrar en caja',
    href: '/pos',
    claves: ['tpv', 'punto de venta', 'datafono', 'vender', 'mostrador', 'efectivo', 'tarjeta'],
  },
  {
    id: 'nuevo-cobro',
    label: 'Cobrar una mensualidad',
    href: '/cobros?tab=pendientes',
    claves: ['cobro', 'cuota', 'mensualidad', 'recibo', 'pendiente de pago', 'domiciliar'],
  },
  {
    id: 'nueva-factura',
    label: 'Emitir una factura',
    href: '/cobros?tab=facturas',
    claves: ['factura', 'facturar', 'verifactu', 'iva'],
  },
  {
    id: 'baja-sustituta',
    label: 'Buscar sustituta para una clase',
    href: '/sustituciones',
    claves: ['baja', 'sustitucion', 'cubrir', 'no puede venir', 'enferma', 'reemplazo'],
  },

  // ── Montar el estudio ──────────────────────────────────────────────────────
  {
    id: 'nuevo-instructor',
    label: 'Añadir una instructora al equipo',
    href: '/equipo',
    claves: ['instructor', 'profesora', 'monitora', 'personal', 'empleada', 'recepcion'],
  },
  {
    id: 'nuevo-plan',
    label: 'Crear un plan o tarifa',
    href: '/configuracion?tab=planes',
    claves: ['plan', 'tarifa', 'precio', 'bono', 'membresia', 'cuota', 'abono', 'suscripcion'],
  },
  {
    id: 'nueva-sala',
    label: 'Añadir una sala',
    href: '/configuracion?tab=salas',
    claves: ['sala', 'espacio', 'aforo', 'capacidad'],
  },
  {
    id: 'nuevo-tipo-clase',
    label: 'Crear un tipo de clase',
    href: '/configuracion?tab=clases',
    claves: ['tipo de clase', 'disciplina', 'reformer', 'mat', 'modalidad'],
  },
  {
    id: 'datos-estudio',
    label: 'Configurar los datos del estudio',
    href: '/configuracion?tab=estudio',
    claves: ['estudio', 'datos fiscales', 'nif', 'direccion', 'iva', 'cancelacion'],
  },
  {
    id: 'metodos-pago',
    label: 'Activar los cobros con tarjeta',
    href: '/configuracion?tab=integraciones',
    claves: ['stripe', 'pago', 'tarjeta', 'bizum', 'sepa', 'cobrar online', 'pasarela'],
  },
  {
    id: 'marca',
    label: 'Personalizar los colores y el logo',
    href: '/configuracion/apariencia',
    claves: ['marca', 'logo', 'color', 'apariencia', 'tema', 'personalizar'],
  },

  // ── Traerse el estudio de otro programa ────────────────────────────────────
  {
    id: 'importar-clientas',
    label: 'Importar clientas desde otro programa',
    href: '/clientas/importar',
    claves: ['importar', 'migrar', 'csv', 'excel', 'timp', 'nubapp', 'eversports', 'mindbody', 'bsport'],
  },
  {
    id: 'importar-horario',
    label: 'Importar el horario desde otro programa',
    href: '/calendario/importar',
    claves: ['importar horario', 'migrar clases', 'csv', 'excel'],
  },

  // ── Mirar cómo va ──────────────────────────────────────────────────────────
  {
    id: 'ingresos',
    label: 'Ver los ingresos',
    href: '/informes',
    claves: ['ingresos', 'facturacion', 'cuanto he ganado', 'informes', 'analitica', 'ocupacion', 'metricas'],
  },
];

/** Quita acentos y mayúsculas: "Añadir" y "anadir" deben encontrar lo mismo. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Tareas que encajan con lo que se ha escrito, de más a menos relevante.
 *
 * Con la búsqueda vacía devuelve las primeras del catálogo: al abrir ⌘K sin
 * escribir nada, la persona ve de qué es capaz el programa. Esa lista es media
 * respuesta a "¿cuál es el siguiente paso?" sin haber leído un manual.
 */
export function buscarTareas(consulta: string, limite = 6): Tarea[] {
  const q = normalizar(consulta);
  if (!q) return TAREAS.slice(0, limite);

  const puntuadas = TAREAS.map((t) => {
    const label = normalizar(t.label);
    let punt = 0;
    if (label.startsWith(q)) punt = 100;
    else if (label.includes(q)) punt = 70;
    else if (t.claves.some((c) => normalizar(c).startsWith(q))) punt = 50;
    else if (t.claves.some((c) => normalizar(c).includes(q))) punt = 30;
    // Última oportunidad: que todas las palabras sueltas estén en algún sitio,
    // para que "alta clienta" encuentre "Dar de alta a una clienta".
    else {
      const palabras = q.split(/\s+/).filter(Boolean);
      const heno = `${label} ${t.claves.map(normalizar).join(' ')}`;
      if (palabras.length > 1 && palabras.every((p) => heno.includes(p))) punt = 20;
    }
    return { t, punt };
  });

  return puntuadas
    .filter((p) => p.punt > 0)
    .sort((a, b) => b.punt - a.punt)
    .slice(0, limite)
    .map((p) => p.t);
}

/** Ruta base de una tarea, sin parámetros: para comprobar permisos. */
export function rutaBase(href: string): string {
  return href.split('?')[0];
}
