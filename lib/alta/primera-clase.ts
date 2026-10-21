// ─────────────────────────────────────────────────────────────────────────────
// «Tu primera clase», el paso 6 del alta nueva (PR-4 del plan del 21-oct-2026,
// maqueta aprobada «06 · Primera clase · activación»): lo que el formulario
// valida y lo que se manda a crear, sin red.
//
// Un formulario deja la clase en el calendario y su precio a la venta, todo a
// la vez (la RPC `alta_primera_clase`, migración 20261021134000). Aquí se decide
// QUÉ se crea; la RPC solo comprueba y escribe. Las piezas son las del
// Calendario, no unas nuevas:
//   · las fechas de la clase semanal: `fechasDeRepeticion` con las mismas cuatro
//     semanas que «Clase semanal» (formulario-nueva-clase.tsx); después la
//     renueva sola el barrido de series (`renovacion_automatica`);
//   · inicio y fin en hora de Madrid: `instantesDe` y `finConDuracion`;
//   · los choques con lo que ya hay: `planDeFechas`;
//   · lo que viene puesto: los valores de serie del asistente
//     (`POR_DEFECTO`, lib/onboarding/asistente-rapido.ts: Reformer, 55 minutos,
//     8 plazas) y su paleta de colores.
//
// Dos decisiones del fundador (21-oct-2026) que viven aquí:
//   · «Esta clase es gratis» (casilla): sin tarifa y sin pagar al reservar. Sin
//     la casilla, el precio tiene que ser mayor que 0: un 0 es un error que dice
//     qué hacer (la casilla), no una clase gratis por descuido.
//   · El precio raro solo AVISA, nunca bloquea. `precioSospechoso` no sirve aquí:
//     compara con las demás tarifas del estudio y necesita al menos dos, y un
//     estudio nuevo no tiene ninguna. Topes de la maqueta: 80 € una clase
//     suelta, 600 € un bono, 300 € una cuota.
//
// Puro, con rutas relativas: lo prueba `node --test` (primera-clase.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { POR_DEFECTO } from '../onboarding/asistente-rapido.ts';
import { colorPorIndice } from '../onboarding/plan-configuracion.ts';
import { fechaCorta, fechasDeRepeticion, finConDuracion, instantesDe, planDeFechas } from '../calendario/nueva-clase.ts';
import { diaSemanaLocal, esHoraHHMM } from '../citas/slots.ts';
import { hoyEnEstudio, masDias } from '../utils.ts';
import { mensajeDeFalloAlGuardar } from '../errores.ts';
import { enVentanaDelEmbudo } from './embudo.ts';
import type { SlotSesion } from '../calendar-logic.ts';

// ── Lo que viene puesto ──────────────────────────────────────────────────────

/** Los tres botones de «Qué clase». «Otra» deja el nombre para que lo escriba. */
export const TIPOS_PRIMERA_CLASE = ['Reformer', 'Mat', 'Otra'] as const;
export type TipoPrimeraClase = (typeof TIPOS_PRIMERA_CLASE)[number];

export const DURACIONES_PRIMERA_CLASE = [45, 50, 55, 60] as const;

/** Los números de los valores de serie del asistente («55 minutos», «8 plazas»). */
const numeroDe = (texto: string | undefined, porDefecto: number) => Number(texto?.match(/\d+/)?.[0]) || porDefecto;

export const VALORES_DE_SERIE = {
  tipo: ((POR_DEFECTO.clases ?? [])[0] ?? 'Reformer') as TipoPrimeraClase,
  duracion: numeroDe(POR_DEFECTO.duracion, 55),
  plazas: numeroDe((POR_DEFECTO.aforos ?? [])[0], 8),
  sala: 'Sala 1',
  hora: '18:30',
  bonoClases: '10',
} as const;

/**
 * La clase semanal nace con cuatro semanas, como «Clase semanal» del
 * Calendario (`DIAS_POR_DEFECTO = 27`), y sin fin: la serie lleva
 * `renovacion_automatica` y el barrido diario la alarga cuando le queda un mes.
 */
export const SEMANAS_SERIE = 4;

export const MAX_PLAZAS = 100;
export const MAX_CLASES_BONO = 999;
export const MAX_NOMBRE = 60;

/** Cuántos días se ofrecen en «Día», empezando por hoy. */
export const DIAS_A_ELEGIR = 14;

export type Venta = 'suelta' | 'bono' | 'cuota';
export type Cobro = 'estudio' | 'online';
export type Quien = 'yo' | 'otra';

export interface FormPrimeraClase {
  tipo: TipoPrimeraClase;
  /** «Nombre de la clase»: es el nombre del TIPO, que es lo que pinta la página pública. */
  nombre: string;
  duracion: number;
  /** 'YYYY-MM-DD', día del estudio. */
  fecha: string;
  /** 'HH:MM', hora de Madrid. */
  hora: string;
  semanal: boolean;
  quien: Quien;
  otraPersona: string;
  sala: string;
  plazas: number;
  venta: Venta;
  /** Tal cual lo escribe: «20», «18,50». */
  precio: string;
  bonoClases: string;
  gratis: boolean;
  cobro: Cobro;
}

/** El nombre que propone cada botón de «Qué clase». */
export function nombreDeTipo(tipo: TipoPrimeraClase): string {
  return tipo === 'Otra' ? '' : tipo;
}

/**
 * Elegir otro botón cambia el nombre solo si no lo había tocado (vacío, o el
 * que proponía el botón de antes). Lo que haya escrito no se pisa.
 */
export function conTipo(f: FormPrimeraClase, tipo: TipoPrimeraClase): FormPrimeraClase {
  const propuesto = TIPOS_PRIMERA_CLASE.some(t => nombreDeTipo(t) === f.nombre.trim()) || !f.nombre.trim();
  return { ...f, tipo, nombre: propuesto ? nombreDeTipo(tipo) : f.nombre };
}

/**
 * Una hora que quepa en la franja del estudio: las 18:30 de la maqueta si
 * caben enteras; si no, una hora después de abrir (o al abrir, si no cabe más).
 */
export function horaPorDefecto(apertura: string | null | undefined, cierre: string | null | undefined, duracion: number): string {
  const a = (apertura ?? '').slice(0, 5);
  const c = (cierre ?? '').slice(0, 5);
  if (!esHoraHHMM(a) || !esHoraHHMM(c) || a >= c) return VALORES_DE_SERIE.hora;
  const cabe = (h: string) => { const fin = finConDuracion(h, duracion); return !!fin && h >= a && fin <= c && fin !== '23:59'; };
  if (cabe(VALORES_DE_SERIE.hora)) return VALORES_DE_SERIE.hora;
  const unaDespues = finConDuracion(a, 60);
  if (unaDespues && cabe(unaDespues)) return unaDespues;
  return a;
}

/** Todo puesto menos el precio. Mañana, porque la de hoy puede haber pasado ya. */
export function formInicial(o: {
  hoy: string;
  /** La primera sala que ya tenga el estudio, si tiene alguna. */
  sala?: string | null;
  apertura?: string | null;
  cierre?: string | null;
}): FormPrimeraClase {
  return {
    tipo: VALORES_DE_SERIE.tipo,
    nombre: nombreDeTipo(VALORES_DE_SERIE.tipo),
    duracion: VALORES_DE_SERIE.duracion,
    fecha: masDias(o.hoy, 1),
    hora: horaPorDefecto(o.apertura, o.cierre, VALORES_DE_SERIE.duracion),
    semanal: true,
    quien: 'yo',
    otraPersona: '',
    sala: o.sala?.trim() || VALORES_DE_SERIE.sala,
    plazas: VALORES_DE_SERIE.plazas,
    venta: 'suelta',
    precio: '',
    bonoClases: VALORES_DE_SERIE.bonoClases,
    gratis: false,
    cobro: 'estudio',
  };
}

// ── Fechas en palabras ───────────────────────────────────────────────────────

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** «lunes» del día del estudio. */
export function nombreDelDia(fecha: string): string {
  return DIAS[diaSemanaLocal(fecha)];
}

/** «Lunes 26 de octubre» (con «Hoy, …» y «Mañana, …» delante cuando toca). */
export function etiquetaDia(fecha: string, hoy: string): string {
  const [, m, d] = fecha.split('-').map(Number);
  const base = `${nombreDelDia(fecha)} ${d} de ${MESES[m - 1]}`;
  if (fecha === hoy) return `Hoy, ${base}`;
  if (fecha === masDias(hoy, 1)) return `Mañana, ${base}`;
  return mayuscula(base);
}

/** Los días que se ofrecen, de hoy en adelante. */
export function diasParaElegir(hoy: string, n = DIAS_A_ELEGIR): { fecha: string; etiqueta: string }[] {
  return Array.from({ length: n }, (_, i) => {
    const fecha = masDias(hoy, i);
    return { fecha, etiqueta: etiquetaDia(fecha, hoy) };
  });
}

/** «lunes 26 a las 18:30, cada semana»: lo que dice el correo y el resumen. */
export function cuandoCorto(f: Pick<FormPrimeraClase, 'fecha' | 'hora' | 'semanal'>): string {
  const d = Number(f.fecha.slice(8, 10));
  return `${nombreDelDia(f.fecha)} ${d} a las ${f.hora}${f.semanal ? ', cada semana' : ''}`;
}

// ── El precio ────────────────────────────────────────────────────────────────

/** Lo que aviso de «precio raro»: más de esto, se pregunta «¿Seguro?». */
export const TOPES_PRECIO_RARO: Readonly<Record<Venta, number>> = { suelta: 80, bono: 600, cuota: 300 };

const QUE_ES: Readonly<Record<Venta, string>> = { suelta: 'una clase suelta', bono: 'un bono', cuota: 'una cuota' };

/**
 * El número que ha escrito: «20», «18,50», «1.200,00», «20 €». `null` si no
 * hay nada, `NaN` si no es un precio (letras, más de dos decimales).
 */
export function leerPrecio(texto: string): number | null {
  let t = texto.replace(/€/g, '').replace(/\s/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return Number.NaN;
  return Number(t);
}

/** «900,00 €». */
export function euros(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export type EstadoPrecio = 'gratis' | 'falta' | 'error' | 'cero' | 'raro' | 'ok';

export const TEXTO_PRECIO = {
  pista: 'Lo que paga la alumna. Es lo único que no ponemos por ti.',
  falta: 'Falta el precio: es lo único que no podemos poner por ti.',
  formato: 'Escribe solo el número, por ejemplo 20 o 18,50.',
  negativo: 'El precio no puede ser negativo.',
  cero: 'Con 0 € la clase sería gratis. Si es lo que quieres, marca «Esta clase es gratis»; si no, escribe su precio.',
  ok: 'Se pondrá a la venta en cuanto publiques.',
  gratis: 'Gratis: tus alumnas la reservan sin pagar nada, y no se pone ninguna tarifa a la venta.',
} as const;

/**
 * Qué decir del precio. `bloquea`: no se puede publicar así. Un precio raro
 * avisa y deja publicar (decisión del fundador).
 */
export function infoPrecio(f: Pick<FormPrimeraClase, 'precio' | 'venta' | 'gratis'>): { estado: EstadoPrecio; texto: string; bloquea: boolean } {
  if (f.gratis) return { estado: 'gratis', texto: TEXTO_PRECIO.gratis, bloquea: false };
  const n = leerPrecio(f.precio);
  if (n === null) return { estado: 'falta', texto: TEXTO_PRECIO.falta, bloquea: true };
  if (Number.isNaN(n)) return { estado: 'error', texto: TEXTO_PRECIO.formato, bloquea: true };
  if (n < 0) return { estado: 'error', texto: TEXTO_PRECIO.negativo, bloquea: true };
  if (n === 0) return { estado: 'cero', texto: TEXTO_PRECIO.cero, bloquea: true };
  if (n > TOPES_PRECIO_RARO[f.venta]) {
    return { estado: 'raro', texto: `¿Seguro? ${euros(n)} es mucho para ${QUE_ES[f.venta]}. Revisa el número.`, bloquea: false };
  }
  return { estado: 'ok', texto: TEXTO_PRECIO.ok, bloquea: false };
}

/** El nombre de la tarifa, como los de Paquetes. */
export function nombreTarifa(venta: Venta, clasesBono: number | null): string {
  if (venta === 'bono') return `Bono ${clasesBono ?? ''} clases`.replace(/\s+/g, ' ');
  return venta === 'cuota' ? 'Cuota mensual' : 'Clase suelta';
}

/** El bono, como número entero válido, o `null`. */
export function clasesDelBono(texto: string): number | null {
  const t = texto.trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= MAX_CLASES_BONO ? n : null;
}

// ── Validar ──────────────────────────────────────────────────────────────────

export type CampoPrimeraClase = 'nombre' | 'fecha' | 'hora' | 'otraPersona' | 'sala' | 'plazas' | 'precio' | 'bonoClases';

/** En el orden de la pantalla: el primero con error es el que recibe el foco. */
export const ORDEN_CAMPOS: readonly CampoPrimeraClase[] = ['nombre', 'fecha', 'hora', 'otraPersona', 'sala', 'plazas', 'precio', 'bonoClases'];

/** Lo que hace falta para buscar choques con las clases que ya hay. */
export interface ContextoChoques {
  existentes: readonly SlotSesion[];
  /** La sala que ya tiene ese nombre (si la hay): con una nueva no puede chocar nada. */
  salaId: string | null;
  /** Quien la da, si ya tiene ficha. */
  instructorId: string | null;
}

/** Las fechas de la clase: una, o las de la clase semanal. */
export function fechasDeLaClase(f: Pick<FormPrimeraClase, 'fecha' | 'semanal'>): string[] {
  if (!f.semanal) return [f.fecha];
  return fechasDeRepeticion(f.fecha, masDias(f.fecha, 7 * SEMANAS_SERIE - 1), [diaSemanaLocal(f.fecha)]);
}

/**
 * Los errores, por campo. Vacío = se puede publicar. `ahora` es el instante de
 * comprobar: la clase no puede haber empezado ya.
 */
export function validarPrimeraClase(
  f: FormPrimeraClase, ahora: Date, choques?: ContextoChoques,
): Partial<Record<CampoPrimeraClase, string>> {
  const e: Partial<Record<CampoPrimeraClase, string>> = {};
  const nombre = f.nombre.trim();
  if (!nombre) e.nombre = 'Ponle un nombre: así sale en tu página.';
  else if (nombre.length > MAX_NOMBRE) e.nombre = `Como mucho ${MAX_NOMBRE} letras: así cabe en tu página.`;

  const hoy = hoyEnEstudio(ahora);
  const fin = esHoraHHMM(f.hora) ? finConDuracion(f.hora, f.duracion) : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) e.fecha = 'Elige el día de la clase.';
  else if (f.fecha < hoy) e.fecha = 'Ese día ya ha pasado. Elige otro.';
  if (!esHoraHHMM(f.hora)) e.hora = 'Elige la hora a la que empieza.';
  else if (!fin || fin === '23:59') e.hora = 'Tiene que terminar antes de medianoche. Elige una hora más temprana.';
  else if (!e.fecha && new Date(instantesDe(f.fecha, f.hora, fin).inicio).getTime() <= ahora.getTime()) {
    e.hora = 'Esa hora ya ha pasado hoy. Elige otra hora u otro día.';
  }
  if (!(DURACIONES_PRIMERA_CLASE as readonly number[]).includes(f.duracion)) e.hora ??= 'Elige cuánto dura la clase.';

  if (f.quien === 'otra' && !f.otraPersona.trim()) e.otraPersona = 'Escribe el nombre de quien la da.';
  if (!f.sala.trim()) e.sala = 'Ponle nombre a la sala, aunque sea «Sala 1».';
  if (!Number.isInteger(f.plazas) || f.plazas < 1 || f.plazas > MAX_PLAZAS) e.plazas = `Entre 1 y ${MAX_PLAZAS} plazas.`;

  const precio = infoPrecio(f);
  if (precio.bloquea) e.precio = precio.texto;
  if (!f.gratis && f.venta === 'bono' && clasesDelBono(f.bonoClases) === null) {
    e.bonoClases = 'Escribe cuántas clases trae el bono, por ejemplo 10.';
  }

  // Un choque con lo que ya hay: la base de datos rechazaría TODAS las fechas.
  if (choques && !e.fecha && !e.hora && fin) {
    const { saltadas } = planDeFechas({
      fechas: fechasDeLaClase(f), horaInicio: f.hora, horaFin: fin,
      salaId: choques.salaId ?? '', instructorId: choques.instructorId ?? '', existentes: choques.existentes,
    });
    const s = saltadas[0];
    if (s) {
      e.hora = s.sala.length > 0
        ? `El ${fechaCorta(s.fecha)} a esa hora la sala ya tiene otra clase. Elige otra hora o cambia la sala.`
        : `El ${fechaCorta(s.fecha)} a esa hora quien la da ya tiene otra clase. Elige otra hora.`;
    }
  }
  return e;
}

export function primerError(e: Partial<Record<CampoPrimeraClase, string>>): CampoPrimeraClase | null {
  return ORDEN_CAMPOS.find(c => e[c]) ?? null;
}

// ── Lo que se manda a crear ──────────────────────────────────────────────────

export interface TarifaPlanificada {
  tipo: 'PUNTUAL' | 'BONO' | 'MENSUAL';
  nombre: string;
  precio: number;
  sesiones: number | null;
}

/**
 * Lo que recibe la RPC `alta_primera_clase` (menos el `intento`, que pone quien
 * llama, y la identidad de «Yo», que pone el SERVIDOR desde la cuenta: el
 * navegador solo dice `propia: true`).
 */
export interface PlanPrimeraClase {
  gratis: boolean;
  cobro: Cobro;
  semanal: boolean;
  aforo: number;
  tipo: { nombre: string; color: string };
  sala: { nombre: string; color: string };
  instructor: { propia: true } | { propia: false; nombre: string };
  sesiones: { inicio: string; fin: string }[];
  tarifa: TarifaPlanificada | null;
}

const TIPO_TARIFA: Readonly<Record<Venta, TarifaPlanificada['tipo']>> = { suelta: 'PUNTUAL', bono: 'BONO', cuota: 'MENSUAL' };

export function planificarPrimeraClase(
  f: FormPrimeraClase, ahora: Date, choques?: ContextoChoques,
): { ok: true; plan: PlanPrimeraClase } | { ok: false; errores: Partial<Record<CampoPrimeraClase, string>> } {
  const errores = validarPrimeraClase(f, ahora, choques);
  if (primerError(errores)) return { ok: false, errores };
  const fin = finConDuracion(f.hora, f.duracion)!;
  const precio = f.gratis ? null : leerPrecio(f.precio);
  const clases = f.venta === 'bono' ? clasesDelBono(f.bonoClases) : null;
  return {
    ok: true,
    plan: {
      gratis: f.gratis,
      cobro: f.cobro,
      semanal: f.semanal,
      aforo: f.plazas,
      tipo: { nombre: f.nombre.trim(), color: colorPorIndice(0) },
      sala: { nombre: f.sala.trim(), color: colorPorIndice(1) },
      instructor: f.quien === 'yo' ? { propia: true } : { propia: false, nombre: f.otraPersona.trim() },
      sesiones: fechasDeLaClase(f).map(fecha => instantesDe(fecha, f.hora, fin)),
      tarifa: f.gratis || precio === null
        ? null
        : {
            tipo: TIPO_TARIFA[f.venta],
            nombre: nombreTarifa(f.venta, clases),
            precio,
            sesiones: f.venta === 'suelta' ? 1 : f.venta === 'bono' ? clases : null,
          },
    },
  };
}

/**
 * Lee el plan que llega del navegador sin fiarse de su forma: la ruta lo vuelve
 * a planificar desde el FORMULARIO (`leerFormPrimeraClase` + `planificar…`),
 * nunca reenvía lo que llegue.
 */
export function leerFormPrimeraClase(x: unknown): FormPrimeraClase | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  const texto = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : null);
  const tipo = TIPOS_PRIMERA_CLASE.find(t => t === r.tipo);
  const venta = (['suelta', 'bono', 'cuota'] as const).find(v => v === r.venta);
  const cobro = (['estudio', 'online'] as const).find(v => v === r.cobro);
  const quien = (['yo', 'otra'] as const).find(v => v === r.quien);
  const nombre = texto(r.nombre), fecha = texto(r.fecha, 10), hora = texto(r.hora, 5);
  const otraPersona = texto(r.otraPersona) ?? '', sala = texto(r.sala), precio = texto(r.precio, 20), bonoClases = texto(r.bonoClases, 5) ?? '';
  if (!tipo || !venta || !cobro || !quien || nombre === null || fecha === null || hora === null || sala === null || precio === null) return null;
  if (typeof r.duracion !== 'number' || typeof r.plazas !== 'number') return null;
  if (typeof r.semanal !== 'boolean' || typeof r.gratis !== 'boolean') return null;
  return {
    tipo, nombre, duracion: r.duracion, fecha, hora, semanal: r.semanal, quien, otraPersona,
    sala, plazas: r.plazas, venta, precio, bonoClases, gratis: r.gratis, cobro,
  };
}

// ── Lo que se enseña ─────────────────────────────────────────────────────────

/** Lo que ya tiene el estudio, para no decir «se crea» de lo que se reutiliza. */
export interface YaExiste {
  /** Nombres de los tipos de clase sin archivar, en minúsculas. */
  tipos: ReadonlySet<string>;
  salas: ReadonlySet<string>;
  /** ¿Tiene ya su ficha de instructora? */
  fichaPropia: boolean;
  /** Nombres de las fichas activas, en minúsculas. */
  instructoras: ReadonlySet<string>;
}

/**
 * «Al publicar se crea, todo a la vez»: una línea por cosa, en el orden de la
 * maqueta. Lo que ya existe dice que se usa, no que se crea.
 */
export function resumenPrimeraClase(f: FormPrimeraClase, nombrePropio: string, ya?: YaExiste): string[] {
  const clave = (s: string) => s.trim().toLowerCase();
  const nombre = f.nombre.trim() || 'Tu clase';
  const sala = f.sala.trim() || VALORES_DE_SERIE.sala;
  const quien = f.quien === 'yo' ? (nombrePropio.trim() || 'tú') : (f.otraPersona.trim() || 'quien la da');
  const precio = infoPrecio(f);
  const n = leerPrecio(f.precio);
  const importe = n !== null && !Number.isNaN(n) && n > 0 ? euros(n) : 'falta el precio';
  const clases = clasesDelBono(f.bonoClases);
  return [
    ya?.tipos.has(clave(nombre))
      ? `La clase «${nombre}», que ya tienes, de ${f.duracion} minutos`
      : `El tipo de clase «${nombre}», de ${f.duracion} minutos`,
    ya?.salas.has(clave(sala))
      ? `Tu sala «${sala}», con ${f.plazas} plazas en esta clase`
      : `La sala «${sala}», con ${f.plazas} plazas`,
    f.quien === 'yo'
      ? (ya?.fichaPropia ? `Tu ficha de instructora (${quien}), que ya tienes` : `Tu ficha de instructora (${quien})`)
      : (ya?.instructoras.has(clave(quien)) ? `La ficha de ${quien}, que ya tienes` : `La ficha de ${quien}`),
    `La clase del ${cuandoCorto(f)}`,
    precio.estado === 'gratis'
      ? 'Sin tarifa: la clase es gratis'
      : `La tarifa «${nombreTarifa(f.venta, clases)}» a ${importe}, activa`,
  ];
}

/** Lo que sale bajo la tarjeta de la vista previa: qué se vende y cómo se paga. */
export function lineaDeVenta(f: FormPrimeraClase): { tarifa: string; pago: string } {
  if (f.gratis) return { tarifa: 'Gratis', pago: 'Se reserva sin pagar nada' };
  const n = leerPrecio(f.precio);
  const p = n !== null && !Number.isNaN(n) && n > 0 ? euros(n) : '— €';
  const tarifa = f.venta === 'bono'
    ? `Bono de ${clasesDelBono(f.bonoClases) ?? '—'} clases · ${p}`
    : f.venta === 'cuota' ? `Cuota mensual · ${p}/mes` : `${p} la clase`;
  return { tarifa, pago: f.cobro === 'estudio' ? 'Se paga en el estudio' : 'Con tarjeta al reservar' };
}

/**
 * El precio que pinta la tarjeta de /reservar: solo el de la clase suelta, como
 * la página de verdad a una alumna sin plan (`precioDeCobertura`). Un bono o una
 * cuota no ponen precio en la tarjeta.
 */
export function precioEnTarjeta(f: FormPrimeraClase): number | null {
  if (f.gratis || f.venta !== 'suelta') return null;
  const n = leerPrecio(f.precio);
  return n !== null && !Number.isNaN(n) && n > 0 ? n : null;
}

// ── Lo que contesta el servidor ──────────────────────────────────────────────

/**
 * Los rechazos de la RPC `alta_primera_clase`, en palabras y con el campo que
 * hay que corregir. Lo que no está aquí (un id de otro estudio, un plan con otra
 * forma) no lo provoca el formulario: es un fallo nuestro y va como tal.
 */
const ERRORES_RPC: Readonly<Record<string, { texto: string; campo?: CampoPrimeraClase }>> = {
  FECHA_PASADA: { texto: 'Esa hora ya ha pasado. Elige otra hora u otro día.', campo: 'hora' },
  HORA_INVALIDA: { texto: 'Revisa la hora y la duración de la clase.', campo: 'hora' },
  NOMBRE_INVALIDO: { texto: 'Ponle un nombre de 1 a 60 letras: así sale en tu página.', campo: 'nombre' },
  SALA_INVALIDA: { texto: 'Ponle nombre a la sala, aunque sea «Sala 1».', campo: 'sala' },
  AFORO_INVALIDO: { texto: `Entre 1 y ${MAX_PLAZAS} plazas.`, campo: 'plazas' },
  SIN_PRECIO: { texto: TEXTO_PRECIO.falta, campo: 'precio' },
  BONO_INVALIDO: { texto: 'Escribe cuántas clases trae el bono, por ejemplo 10.', campo: 'bonoClases' },
  INSTRUCTORA_INVALIDA: { texto: 'Falta tu nombre para tu ficha de instructora. Escríbelo en «Quién la da» y vuelve a publicar.' },
  INSTRUCTORA_DE_BAJA: { texto: 'Esa ficha de instructora está dada de baja en Equipo. Elige a otra persona o recupérala en Equipo.' },
};

/**
 * Qué decirle si la RPC dice que no. Todo o nada: con cualquiera de estos no se
 * ha creado NADA, y se dice, para que no busque media clase en el calendario.
 * El solape (23P01) dice si es la sala o quien la da (por el nombre de la
 * restricción); si no se sabe, el texto de siempre de lib/errores.
 */
export function errorDePublicar(e: { code?: string | null; message?: string | null } | null | undefined):
  { status: number; error: string; campo?: CampoPrimeraClase } {
  const msg = e?.message ?? '';
  const nada = 'No se ha creado nada.';
  if (e?.code === '23P01') {
    const texto = /sala_sin_solape/.test(msg)
      ? 'A esa hora la sala ya tiene otra clase. Elige otra hora o cambia la sala.'
      : /instructor_sin_solape/.test(msg)
        ? 'A esa hora quien la da ya tiene otra clase. Elige otra hora.'
        : mensajeDeFalloAlGuardar(e);
    return { status: 409, error: `${texto} ${nada}`, campo: 'hora' };
  }
  const conocido = Object.entries(ERRORES_RPC).find(([codigo]) => msg.includes(codigo));
  if (conocido) return { status: 422, error: `${conocido[1].texto} ${nada}`, ...(conocido[1].campo ? { campo: conocido[1].campo } : {}) };
  return { status: 500, error: `No hemos podido publicar tu clase. ${nada} Vuelve a intentarlo en un momento.` };
}

/** La clave de idempotencia de Resend del correo n.º 4: uno por estudio. */
export const claveRecibirReservas = (studioId: string) => `alta-recibir-reservas:${studioId}`;

export type MotivoSinCorreo = 'no_puede_reservar' | 'ya_enviado' | 'fuera_de_ventana' | 'sin_email' | 'sin_pagina';

/**
 * ¿Sale ahora «Ya puedes recibir reservas»? Solo con el SÍ del servidor (el
 * mismo motor que la reserva de verdad: un «sin comprobar» no es un sí), una
 * vez por estudio (`correo_recibir_reservas` en el embudo, más la clave de
 * Resend para dos peticiones a la vez) y en los primeros días del estudio, que
 * es cuando se apunta la marca de «ya salió»: fuera de esa ventana no habría
 * con qué impedir que saliera dos veces.
 */
export function decidirCorreoRecibirReservas(o: {
  veredicto: string;
  yaEnviado: boolean;
  creadoEn: string | null | undefined;
  email: string | null | undefined;
  slug: string | null | undefined;
  ahora: Date;
}): { enviar: true } | { enviar: false; motivo: MotivoSinCorreo } {
  const no = (motivo: MotivoSinCorreo) => ({ enviar: false as const, motivo });
  if (o.veredicto !== 'SI') return no('no_puede_reservar');
  if (o.yaEnviado) return no('ya_enviado');
  if (!enVentanaDelEmbudo(o.creadoEn, o.ahora)) return no('fuera_de_ventana');
  if (!o.email) return no('sin_email');
  if (!o.slug) return no('sin_pagina');
  return { enviar: true };
}
