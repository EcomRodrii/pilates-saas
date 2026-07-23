// ─────────────────────────────────────────────────────────────────────────────
// Parser CSV robusto (RFC 4180) + utilidades para el importador de socias.
// Sin dependencias: maneja comillas escapadas (""), delimitadores embebidos,
// saltos de línea dentro de campos, CRLF/LF, BOM y autodetección de delimitador
// (coma, punto y coma —Excel en español— o tabulador). Puro y testeable.
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  delimiter: string;
}

const DELIMITADORES = [',', ';', '\t'] as const;

/** Detecta el delimitador contando ocurrencias en la primera línea no vacía. */
export function detectarDelimitador(texto: string): string {
  const primeraLinea = texto.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  let mejor = ',';
  let maxCuenta = -1;
  for (const d of DELIMITADORES) {
    // Cuenta ocurrencias fuera de comillas (heurística simple sobre la cabecera).
    let cuenta = 0;
    let enComillas = false;
    for (const c of primeraLinea) {
      if (c === '"') enComillas = !enComillas;
      else if (c === d && !enComillas) cuenta++;
    }
    if (cuenta > maxCuenta) {
      maxCuenta = cuenta;
      mejor = d;
    }
  }
  return maxCuenta > 0 ? mejor : ',';
}

/** Parsea un CSV completo a cabeceras + filas. Trimea valores no vacíos. */
export function parseCsv(input: string): ParsedCsv {
  // Quita BOM si existe.
  const texto = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = detectarDelimitador(texto);

  const registros: string[][] = [];
  let campo = '';
  let registro: string[] = [];
  let enComillas = false;

  const cerrarCampo = () => {
    registro.push(campo.trim());
    campo = '';
  };
  const cerrarRegistro = () => {
    cerrarCampo();
    registros.push(registro);
    registro = [];
  };

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++; // comilla escapada ""
        } else {
          enComillas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      enComillas = true;
    } else if (c === delimiter) {
      cerrarCampo();
    } else if (c === '\n') {
      cerrarRegistro();
    } else if (c === '\r') {
      // ignorar; el \n siguiente cierra el registro
    } else {
      campo += c;
    }
  }
  // Último campo/registro si el archivo no acaba en salto de línea.
  if (campo !== '' || registro.length > 0) cerrarRegistro();

  // Descarta registros totalmente vacíos (líneas en blanco).
  const limpios = registros.filter((r) => !(r.length === 1 && r[0] === ''));
  const headers = (limpios.shift() ?? []).map((h) => h.trim());
  return { headers, rows: limpios, delimiter };
}

/** Serializa filas a CSV (para plantilla descargable y reporte de errores). */
export function serializeCsv(headers: string[], rows: string[][]): string {
  const escapar = (v: string) =>
    /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const lineas = [headers, ...rows].map((fila) => fila.map(escapar).join(','));
  return lineas.join('\r\n');
}

// ─── Auto-mapeo de columnas ──────────────────────────────────────────────────

export type CampoSocia =
  | 'nombre' | 'apellidos' | 'email' | 'telefono' | 'nif' | 'tags'
  // Migración real: preservar la antigüedad y datos de la socia del software anterior.
  | 'fecha_alta' | 'direccion' | 'fecha_nacimiento';

export interface CampoMeta {
  campo: CampoSocia;
  etiqueta: string;
  obligatorio: boolean;
}

export const CAMPOS_SOCIA: CampoMeta[] = [
  { campo: 'nombre', etiqueta: 'Nombre', obligatorio: true },
  { campo: 'apellidos', etiqueta: 'Apellidos', obligatorio: false },
  { campo: 'email', etiqueta: 'Email', obligatorio: true },
  { campo: 'telefono', etiqueta: 'Teléfono', obligatorio: false },
  { campo: 'nif', etiqueta: 'NIF / DNI', obligatorio: false },
  { campo: 'tags', etiqueta: 'Etiquetas', obligatorio: false },
  { campo: 'fecha_alta', etiqueta: 'Fecha de alta', obligatorio: false },
  { campo: 'direccion', etiqueta: 'Dirección', obligatorio: false },
  { campo: 'fecha_nacimiento', etiqueta: 'Fecha de nacimiento', obligatorio: false },
];

// Sinónimos de cabecera. Incluye los nombres REALES de columna de los exports
// de los competidores más usados (Eversports, Momence, Timp…): sus cabeceras
// literales están aquí para que el mapeo determinista reconozca sus archivos
// sin depender de la IA (verificado contra sus docs oficiales, jul-2026).
const SINONIMOS: Record<CampoSocia, string[]> = {
  nombre: ['nombre', 'name', 'first name', 'firstname', 'nombre completo', 'nombre y apellidos', 'full name', 'cliente', 'alumno', 'alumna', 'socia', 'socio'],
  apellidos: ['apellidos', 'apellido', 'surname', 'last name', 'lastname'],
  email: ['email', 'e-mail', 'correo', 'correo electronico', 'mail', 'e mail', 'email address'],
  telefono: ['telefono', 'phone', 'phone number', 'telephone', 'movil', 'móvil', 'tel', 'celular', 'whatsapp', 'mobile', 'numero'],
  nif: ['nif', 'dni', 'documento', 'nie', 'cif', 'id'],
  tags: ['tags', 'etiquetas', 'etiqueta', 'grupo', 'group', 'categoria'],
  fecha_alta: ['fecha alta', 'fecha de alta', 'alta', 'fecha registro', 'fecha de registro', 'registro', 'miembro desde', 'socia desde', 'member since', 'join date', 'created', 'created at', 'signup'],
  direccion: ['direccion', 'address', 'domicilio', 'calle', 'street'],
  fecha_nacimiento: ['fecha nacimiento', 'fecha de nacimiento', 'nacimiento', 'cumpleanos', 'cumpleaños', 'birthdate', 'birth date', 'dob', 'birthday'],
};

const RE_DIACRITICOS = /[̀-ͯ]/g;
const normaliza = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(RE_DIACRITICOS, '').trim();

/**
 * Adivina qué columna del CSV corresponde a cada campo de Tentare.
 * Devuelve el índice de columna por campo, o -1 si no se encontró.
 */
/** Mapea columnas del CSV a un conjunto de campos por sus sinónimos (genérico). */
function mapearColumnas<T extends string>(
  headers: string[],
  orden: readonly T[],
  sinonimos: Record<T, string[]>,
): Record<T, number> {
  const H = headers.map(normaliza);
  const usados = new Set<number>();
  const out = {} as Record<T, number>;

  // DOS PASADAS por campo: primero un EXACTO contra cualquiera de sus sinónimos,
  // y solo si ninguno casa exacto, un PARCIAL. Antes se hacía exacto-luego-
  // parcial por-sinónimo, así que un sinónimo temprano que casaba PARCIAL ganaba
  // a uno posterior que casaba EXACTO: p.ej. "name" (parcial) capturaba la
  // columna "Surname" antes de que "first name" (exacto) capturara "First name".
  const buscar = (campo: T, modo: 'exacto' | 'parcial'): number => {
    for (const syn of sinonimos[campo]) {
      const s = normaliza(syn);
      const idx = modo === 'exacto'
        ? H.findIndex((h, i) => !usados.has(i) && h === s)
        : H.findIndex((h, i) => !usados.has(i) && h.includes(s));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const pendientes = new Set(orden);
  for (const campo of orden) {
    const idx = buscar(campo, 'exacto');
    if (idx !== -1) { usados.add(idx); out[campo] = idx; pendientes.delete(campo); }
  }
  for (const campo of orden) {
    if (!pendientes.has(campo)) continue;
    const idx = buscar(campo, 'parcial');
    out[campo] = idx;
    if (idx !== -1) usados.add(idx);
  }
  return out;
}

export function autoMapear(headers: string[]): Record<CampoSocia, number> {
  return mapearColumnas(headers, CAMPOS_SOCIA.map((c) => c.campo), SINONIMOS);
}

// ─── Validación ──────────────────────────────────────────────────────────────

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailValido(email: string): boolean {
  return RE_EMAIL.test(email.trim());
}

function fechaValidaISO(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Parsea una fecha de una celda a 'YYYY-MM-DD'. Acepta ISO (YYYY-MM-DD) y el
 * formato europeo DD/MM/YYYY (con separadores / - o .). Devuelve null si está
 * vacía o no es una fecha válida — para migración es lenient: una fecha ilegible
 * no invalida la fila, solo se ignora ese campo.
 */
export function parsearFecha(celda: string | null | undefined): string | null {
  const s = (celda ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); // ISO: YYYY-MM-DD
  if (m) return fechaValidaISO(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/); // europeo: DD/MM/YYYY
  if (m) return fechaValidaISO(+m[3], +m[2], +m[1]);
  return null;
}

/** Separa una celda de etiquetas en un array (soporta ; | y coma). */
export function parsearTags(celda: string): string[] {
  return celda
    .split(/[;|,]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export interface FilaSocia {
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string | null;
  nif: string | null;
  tags: string[];
  // Migración: 'YYYY-MM-DD' o null. fechaAlta preserva la antigüedad original;
  // el servidor cae a "ahora" si viene vacía o ilegible.
  fechaAlta: string | null;
  direccion: string | null;
  fechaNacimiento: string | null;
}

export interface FilaValidada {
  fila: number; // nº de fila en el archivo (1-indexed, sin contar cabecera)
  datos: FilaSocia;
  estado: 'ok' | 'error' | 'duplicada';
  motivo?: string;
}

/**
 * Aplica el mapeo a las filas crudas y valida cada una. Detecta duplicados
 * de email DENTRO del archivo (los de la BD se detectan en el servidor).
 */
export function validarFilas(
  rows: string[][],
  mapeo: Record<CampoSocia, number>,
): FilaValidada[] {
  const emailsVistos = new Set<string>();
  const val = (fila: string[], idx: number) => (idx >= 0 && idx < fila.length ? fila[idx].trim() : '');

  return rows.map((fila, i) => {
    const nombre = val(fila, mapeo.nombre);
    const apellidos = val(fila, mapeo.apellidos);
    const emailRaw = val(fila, mapeo.email);
    const email = emailRaw.toLowerCase();
    const telefono = val(fila, mapeo.telefono) || null;
    const nif = val(fila, mapeo.nif) || null;
    const tags = mapeo.tags >= 0 ? parsearTags(val(fila, mapeo.tags)) : [];
    const fechaAlta = mapeo.fecha_alta >= 0 ? parsearFecha(val(fila, mapeo.fecha_alta)) : null;
    const direccion = mapeo.direccion >= 0 ? (val(fila, mapeo.direccion) || null) : null;
    const fechaNacimiento = mapeo.fecha_nacimiento >= 0 ? parsearFecha(val(fila, mapeo.fecha_nacimiento)) : null;

    const datos: FilaSocia = { nombre, apellidos, email, telefono, nif, tags, fechaAlta, direccion, fechaNacimiento };
    const base = { fila: i + 1, datos };

    if (!nombre) return { ...base, estado: 'error' as const, motivo: 'Falta el nombre' };
    if (!emailRaw) return { ...base, estado: 'error' as const, motivo: 'Falta el email' };
    if (!emailValido(emailRaw)) return { ...base, estado: 'error' as const, motivo: 'Email no válido' };
    if (emailsVistos.has(email)) return { ...base, estado: 'duplicada' as const, motivo: 'Email repetido en el archivo' };

    emailsVistos.add(email);
    return { ...base, estado: 'ok' as const };
  });
}

// ─── Importación de MEMBRESÍAS / BONOS (suscripciones) ───────────────────────
// Segundo importador de la migración: trae las membresías activas de las socias
// del software anterior. Se empareja por EMAIL (la socia ya debe existir) y por
// NOMBRE de plan (el plan ya debe existir en el catálogo del estudio).

export type CampoMembresia = 'email' | 'plan' | 'sesiones' | 'fecha_inicio' | 'fecha_fin' | 'estado';

export const CAMPOS_MEMBRESIA: CampoMeta2[] = [
  { campo: 'email', etiqueta: 'Email de la socia', obligatorio: true },
  { campo: 'plan', etiqueta: 'Plan / Tarifa', obligatorio: true },
  { campo: 'sesiones', etiqueta: 'Sesiones restantes (bono)', obligatorio: false },
  { campo: 'fecha_inicio', etiqueta: 'Fecha de inicio', obligatorio: false },
  { campo: 'fecha_fin', etiqueta: 'Fecha de fin', obligatorio: false },
  { campo: 'estado', etiqueta: 'Estado', obligatorio: false },
];

interface CampoMeta2 { campo: CampoMembresia; etiqueta: string; obligatorio: boolean }

const SINONIMOS_MEMBRESIA: Record<CampoMembresia, string[]> = {
  email: ['email', 'e-mail', 'correo', 'correo electronico', 'mail', 'socia', 'socio', 'cliente'],
  plan: ['plan', 'tarifa', 'membresia', 'membership', 'membership name', 'bono', 'abono', 'nombre del bono', 'nombre del abono', 'class pack', 'pack', 'producto', 'suscripcion', 'subscription', 'paquete'],
  sesiones: ['sesiones', 'sesiones restantes', 'clases restantes', 'saldo', 'creditos', 'sessions', 'restantes', 'bonos restantes'],
  fecha_inicio: ['fecha inicio', 'fecha de inicio', 'inicio', 'alta', 'start', 'start date', 'desde'],
  fecha_fin: ['fecha fin', 'fecha de fin', 'fin', 'vencimiento', 'caducidad', 'end', 'end date', 'hasta', 'expira'],
  estado: ['estado', 'status', 'activa', 'activo'],
};

export function autoMapearMembresia(headers: string[]): Record<CampoMembresia, number> {
  return mapearColumnas(headers, CAMPOS_MEMBRESIA.map((c) => c.campo), SINONIMOS_MEMBRESIA);
}

export interface FilaMembresia {
  email: string;
  plan: string;
  sesiones: number | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  estado: string | null;
}

export interface FilaMembresiaValidada {
  fila: number;
  datos: FilaMembresia;
  estado: 'ok' | 'error';
  motivo?: string;
}

const ESTADOS_MEMBRESIA = ['ACTIVA', 'PAUSADA', 'CANCELADA', 'EXPIRADA'];

/** Normaliza el estado del CSV al enum de suscripciones (o null si no encaja). */
export function normalizarEstadoMembresia(celda: string): string | null {
  const s = celda.trim().toUpperCase();
  if (!s) return null;
  if (ESTADOS_MEMBRESIA.includes(s)) return s;
  if (['ACTIVE', 'ACTIVO'].includes(s)) return 'ACTIVA';
  if (['PAUSED', 'PAUSADO'].includes(s)) return 'PAUSADA';
  if (['CANCELED', 'CANCELLED', 'CANCELADO', 'BAJA'].includes(s)) return 'CANCELADA';
  if (['EXPIRED', 'EXPIRADO', 'CADUCADA', 'CADUCADO'].includes(s)) return 'EXPIRADA';
  return null;
}

/** Aplica el mapeo y valida las filas de membresías (email y plan obligatorios). */
export function validarFilasMembresia(
  rows: string[][],
  mapeo: Record<CampoMembresia, number>,
): FilaMembresiaValidada[] {
  const val = (fila: string[], idx: number) => (idx >= 0 && idx < fila.length ? fila[idx].trim() : '');
  return rows.map((fila, i) => {
    const emailRaw = val(fila, mapeo.email);
    const email = emailRaw.toLowerCase();
    const plan = val(fila, mapeo.plan);
    const sesionesRaw = mapeo.sesiones >= 0 ? val(fila, mapeo.sesiones) : '';
    const sesiones = sesionesRaw !== '' && Number.isFinite(Number(sesionesRaw)) ? Math.trunc(Number(sesionesRaw)) : null;
    const fechaInicio = mapeo.fecha_inicio >= 0 ? parsearFecha(val(fila, mapeo.fecha_inicio)) : null;
    const fechaFin = mapeo.fecha_fin >= 0 ? parsearFecha(val(fila, mapeo.fecha_fin)) : null;
    const estado = mapeo.estado >= 0 ? normalizarEstadoMembresia(val(fila, mapeo.estado)) : null;

    const datos: FilaMembresia = { email, plan, sesiones, fechaInicio, fechaFin, estado };
    const base = { fila: i + 1, datos };

    if (!emailRaw) return { ...base, estado: 'error' as const, motivo: 'Falta el email de la socia' };
    if (!emailValido(emailRaw)) return { ...base, estado: 'error' as const, motivo: 'Email no válido' };
    if (!plan) return { ...base, estado: 'error' as const, motivo: 'Falta el plan' };
    return { ...base, estado: 'ok' as const };
  });
}

// ─── Importación de CLASES y HORARIOS ────────────────────────────────────────
// Tercera pieza de la migración asistida (tras socias y membresías). Trae el
// horario del software anterior — sin esto el calendario llega vacío y no puede
// colgar nada de él (reservas, citas, sustituciones).
//
// Acepta las DOS formas en que las plataformas exportan un horario:
//   · con FECHA concreta  → una sesión por fila,
//   · con DÍA DE LA SEMANA → horario recurrente, que se expande a N semanas.
// El mapeo de columnas decide cuál es: no hay que elegir modo a mano.

export type CampoClase =
  | 'clase' | 'fecha' | 'dia_semana' | 'hora_inicio' | 'hora_fin'
  | 'duracion' | 'instructor' | 'sala' | 'aforo';

interface CampoMetaClase { campo: CampoClase; etiqueta: string; obligatorio: boolean }

export const CAMPOS_CLASE: CampoMetaClase[] = [
  { campo: 'clase', etiqueta: 'Clase', obligatorio: true },
  { campo: 'hora_inicio', etiqueta: 'Hora de inicio', obligatorio: true },
  { campo: 'fecha', etiqueta: 'Fecha (si el horario es por fechas)', obligatorio: false },
  { campo: 'dia_semana', etiqueta: 'Día de la semana (si es recurrente)', obligatorio: false },
  { campo: 'hora_fin', etiqueta: 'Hora de fin', obligatorio: false },
  { campo: 'duracion', etiqueta: 'Duración (min)', obligatorio: false },
  { campo: 'instructor', etiqueta: 'Instructora', obligatorio: false },
  { campo: 'sala', etiqueta: 'Sala', obligatorio: false },
  { campo: 'aforo', etiqueta: 'Aforo / plazas', obligatorio: false },
];

const SINONIMOS_CLASE: Record<CampoClase, string[]> = {
  clase: ['clase', 'class', 'nombre', 'actividad', 'tipo de clase', 'tipo', 'servicio', 'curso', 'sesion', 'session', 'name'],
  // Ojo: 'dia'/'day' a secas NO van aquí. En un horario, una columna "Día" es casi
  // siempre el día de la semana, y como `fecha` se mapea antes le robaba la
  // columna a `dia_semana` (lo cazó csv-clases.test.ts). Si algún export usa
  // "Día" como fecha, el usuario lo corrige en el paso de mapeo del asistente.
  fecha: ['fecha', 'date', 'fecha clase', 'fecha de la clase', 'start date'],
  dia_semana: ['dia semana', 'dia de la semana', 'weekday', 'day of week', 'dow', 'dia'],
  hora_inicio: ['hora inicio', 'hora de inicio', 'inicio', 'hora', 'start', 'start time', 'comienzo', 'time', 'desde'],
  hora_fin: ['hora fin', 'hora de fin', 'fin', 'end', 'end time', 'final', 'hasta', 'termina'],
  duracion: ['duracion', 'duration', 'minutos', 'mins', 'min', 'length'],
  instructor: ['instructor', 'instructora', 'profesor', 'profesora', 'monitor', 'monitora', 'teacher', 'coach', 'staff', 'entrenador'],
  sala: ['sala', 'room', 'espacio', 'ubicacion', 'location', 'studio', 'estudio'],
  aforo: ['aforo', 'plazas', 'capacidad', 'capacity', 'max', 'maximo', 'spots', 'cupo', 'limite'],
};

export function autoMapearClase(headers: string[]): Record<CampoClase, number> {
  return mapearColumnas(headers, CAMPOS_CLASE.map((c) => c.campo), SINONIMOS_CLASE);
}

export interface FilaClase {
  clase: string;
  fecha: string | null;        // 'YYYY-MM-DD'
  diaSemana: number | null;    // 0=domingo..6=sábado (DOW de Postgres)
  horaInicio: string;          // 'HH:MM'
  horaFin: string | null;      // 'HH:MM'
  duracion: number | null;     // minutos
  instructor: string | null;
  sala: string | null;
  aforo: number | null;
}

export interface FilaClaseValidada {
  fila: number;
  datos: FilaClase;
  estado: 'ok' | 'error';
  motivo?: string;
}

/** 'HH:MM' a partir de "9:00", "09.00", "9h", "9:00 AM"… o null si no se entiende. */
export function parsearHora(celda: string | null | undefined): string | null {
  if (!celda) return null;
  const s = celda.trim().toLowerCase();
  if (!s) return null;
  const pm = /\bp\.?m\.?\b/.test(s);
  const am = /\ba\.?m\.?\b/.test(s);
  const m = s.match(/(\d{1,2})\s*[:.h]\s*(\d{2})?/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (!Number.isFinite(h) || !Number.isFinite(min) || min > 59) return null;
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0, dom: 0, sunday: 0, sun: 0, d: 0,
  lunes: 1, lun: 1, monday: 1, mon: 1, l: 1,
  martes: 2, mar: 2, tuesday: 2, tue: 2, tues: 2,
  miercoles: 3, mie: 3, mierc: 3, wednesday: 3, wed: 3, x: 3,
  jueves: 4, jue: 4, thursday: 4, thu: 4, thur: 4, j: 4,
  viernes: 5, vie: 5, friday: 5, fri: 5, v: 5,
  sabado: 6, sab: 6, saturday: 6, sat: 6, s: 6,
};

/** Día de la semana → DOW de Postgres (0=domingo). Acepta español, inglés e iniciales. */
export function parsearDiaSemana(celda: string | null | undefined): number | null {
  if (!celda) return null;
  const s = normaliza(celda).replace(/\.$/, '');
  if (!s) return null;
  if (s in DIAS_SEMANA) return DIAS_SEMANA[s];
  // "lunes 09:00" o "every monday" → busca el día dentro del texto.
  for (const [clave, dow] of Object.entries(DIAS_SEMANA)) {
    if (clave.length >= 3 && s.includes(clave)) return dow;
  }
  return null;
}

/** Aplica el mapeo y valida las filas del horario. */
export function validarFilasClase(
  rows: string[][],
  mapeo: Record<CampoClase, number>,
): FilaClaseValidada[] {
  const val = (fila: string[], idx: number) => (idx >= 0 && idx < fila.length ? fila[idx].trim() : '');
  return rows.map((fila, i) => {
    const clase = val(fila, mapeo.clase);
    const horaInicio = parsearHora(val(fila, mapeo.hora_inicio));
    const horaFin = parsearHora(val(fila, mapeo.hora_fin));
    const fecha = parsearFecha(val(fila, mapeo.fecha));
    const diaSemana = parsearDiaSemana(val(fila, mapeo.dia_semana));
    const durRaw = val(fila, mapeo.duracion);
    const duracion = durRaw !== '' && Number.isFinite(Number(durRaw)) ? Math.trunc(Number(durRaw)) : null;
    const aforoRaw = val(fila, mapeo.aforo);
    const aforo = aforoRaw !== '' && Number.isFinite(Number(aforoRaw)) ? Math.trunc(Number(aforoRaw)) : null;

    const datos: FilaClase = {
      clase, fecha, diaSemana, horaInicio: horaInicio ?? '', horaFin,
      duracion: duracion && duracion > 0 ? duracion : null,
      instructor: val(fila, mapeo.instructor) || null,
      sala: val(fila, mapeo.sala) || null,
      aforo: aforo && aforo > 0 ? aforo : null,
    };

    const err = (motivo: string): FilaClaseValidada => ({ fila: i + 1, datos, estado: 'error', motivo });
    if (!clase) return err('Falta el nombre de la clase');
    if (!horaInicio) return err('Falta la hora de inicio o no se entiende');
    if (fecha === null && diaSemana === null) return err('Falta la fecha o el día de la semana');
    if (!horaFin && !datos.duracion) return err('Falta la hora de fin o la duración');
    if (horaFin && horaFin <= horaInicio) return err('La hora de fin es anterior o igual a la de inicio');
    return { fila: i + 1, datos, estado: 'ok' };
  });
}

// ─── Importación de RESERVAS ─────────────────────────────────────────────────
// Cuarta pieza de la migración asistida. Sin ella, el día del cambio las clases
// aparecen vacías y las alumnas llegan sin su sitio.
//
// Cada fila se empareja con una SOCIA (por email, ya importada) y con una SESIÓN
// (por nombre de clase + fecha + hora, ya importada con el horario). Admite
// también el histórico de asistencia (ASISTIDA / NO_ASISTIO), que alimenta el
// riesgo de plantón y las señales de retención.

export type CampoReserva = 'email' | 'clase' | 'fecha' | 'hora_inicio' | 'estado';

interface CampoMetaReserva { campo: CampoReserva; etiqueta: string; obligatorio: boolean }

export const CAMPOS_RESERVA: CampoMetaReserva[] = [
  { campo: 'email', etiqueta: 'Email de la socia', obligatorio: true },
  { campo: 'clase', etiqueta: 'Clase', obligatorio: true },
  { campo: 'fecha', etiqueta: 'Fecha de la clase', obligatorio: true },
  { campo: 'hora_inicio', etiqueta: 'Hora de inicio', obligatorio: true },
  { campo: 'estado', etiqueta: 'Estado (asistió, cancelada…)', obligatorio: false },
];

const SINONIMOS_RESERVA: Record<CampoReserva, string[]> = {
  email: ['email', 'e-mail', 'correo', 'correo electronico', 'mail', 'socia', 'socio', 'cliente', 'alumna'],
  clase: ['clase', 'class', 'actividad', 'tipo de clase', 'servicio', 'sesion', 'session', 'nombre clase'],
  fecha: ['fecha', 'date', 'fecha clase', 'fecha de la clase', 'dia de la clase', 'class date'],
  hora_inicio: ['hora inicio', 'hora de inicio', 'inicio', 'hora', 'start', 'start time', 'time'],
  estado: ['estado', 'status', 'asistencia', 'attendance', 'reserva', 'booking status'],
};

export function autoMapearReserva(headers: string[]): Record<CampoReserva, number> {
  return mapearColumnas(headers, CAMPOS_RESERVA.map((c) => c.campo), SINONIMOS_RESERVA);
}

export interface FilaReserva {
  email: string;
  clase: string;
  fecha: string;        // 'YYYY-MM-DD'
  horaInicio: string;   // 'HH:MM'
  estado: string;       // enum de reservas ya normalizado
}

export interface FilaReservaValidada {
  fila: number;
  datos: FilaReserva;
  estado: 'ok' | 'error';
  motivo?: string;
}

/**
 * Normaliza el estado del CSV al enum de `reservas`. Por defecto CONFIRMADA:
 * si el software anterior no dice nada, la reserva existía y contaba.
 */
export function normalizarEstadoReserva(celda: string | null | undefined): string {
  const s = (celda ?? '').trim().toLowerCase().normalize('NFD').replace(RE_DIACRITICOS, '');
  if (!s) return 'CONFIRMADA';
  if (/(no.?show|no.?asisti|falto|falta|ausente|missed)/.test(s)) return 'NO_ASISTIO';
  if (/(cancel|anulad|baja)/.test(s)) return 'CANCELADA';
  if (/(espera|waitlist|wait.?list|lista)/.test(s)) return 'LISTA_ESPERA';
  if (/(asisti|attend|check|present|vino|complet)/.test(s)) return 'ASISTIDA';
  return 'CONFIRMADA';
}

/** Aplica el mapeo y valida las filas de reservas. */
export function validarFilasReserva(
  rows: string[][],
  mapeo: Record<CampoReserva, number>,
): FilaReservaValidada[] {
  const val = (fila: string[], idx: number) => (idx >= 0 && idx < fila.length ? fila[idx].trim() : '');
  return rows.map((fila, i) => {
    const email = val(fila, mapeo.email).toLowerCase();
    const clase = val(fila, mapeo.clase);
    const fecha = parsearFecha(val(fila, mapeo.fecha));
    const horaInicio = parsearHora(val(fila, mapeo.hora_inicio));
    const estado = normalizarEstadoReserva(val(fila, mapeo.estado));

    const datos: FilaReserva = { email, clase, fecha: fecha ?? '', horaInicio: horaInicio ?? '', estado };
    const err = (motivo: string): FilaReservaValidada => ({ fila: i + 1, datos, estado: 'error', motivo });

    if (!email) return err('Falta el email de la socia');
    if (!emailValido(email)) return err('El email no es válido');
    if (!clase) return err('Falta el nombre de la clase');
    if (!fecha) return err('Falta la fecha o no se entiende');
    if (!horaInicio) return err('Falta la hora de inicio o no se entiende');
    return { fila: i + 1, datos, estado: 'ok' };
  });
}

// ─── Importación de CITAS 1:1 ────────────────────────────────────────────────
// Última pieza de la migración asistida. Trae las sesiones individuales
// (privadas, evaluaciones, fisioterapia, online) del programa anterior.
//
// A diferencia de las reservas, una cita NO necesita que exista una sesión: se
// crea entera con su hora y su duración. Solo hace falta la socia (por email).

export type CampoCita = 'email' | 'servicio' | 'fecha' | 'hora_inicio' | 'duracion' | 'instructor' | 'estado' | 'precio';

interface CampoMetaCita { campo: CampoCita; etiqueta: string; obligatorio: boolean }

export const CAMPOS_CITA: CampoMetaCita[] = [
  { campo: 'email', etiqueta: 'Email de la socia', obligatorio: true },
  { campo: 'fecha', etiqueta: 'Fecha', obligatorio: true },
  { campo: 'hora_inicio', etiqueta: 'Hora de inicio', obligatorio: true },
  { campo: 'servicio', etiqueta: 'Servicio / tipo de cita', obligatorio: false },
  { campo: 'duracion', etiqueta: 'Duración (min)', obligatorio: false },
  { campo: 'instructor', etiqueta: 'Instructora', obligatorio: false },
  { campo: 'estado', etiqueta: 'Estado', obligatorio: false },
  { campo: 'precio', etiqueta: 'Precio', obligatorio: false },
];

const SINONIMOS_CITA: Record<CampoCita, string[]> = {
  email: ['email', 'e-mail', 'correo', 'correo electronico', 'mail', 'socia', 'socio', 'cliente', 'alumna'],
  servicio: ['servicio', 'tipo', 'tipo de cita', 'cita', 'appointment', 'service', 'clase', 'concepto'],
  fecha: ['fecha', 'date', 'dia', 'fecha cita', 'appointment date'],
  hora_inicio: ['hora inicio', 'hora de inicio', 'inicio', 'hora', 'start', 'start time', 'time'],
  duracion: ['duracion', 'duration', 'minutos', 'mins', 'min', 'length'],
  instructor: ['instructor', 'instructora', 'profesor', 'profesora', 'terapeuta', 'fisio', 'staff', 'teacher', 'con'],
  estado: ['estado', 'status', 'asistencia', 'attendance'],
  precio: ['precio', 'price', 'importe', 'coste', 'cost', 'amount', 'tarifa'],
};

export function autoMapearCita(headers: string[]): Record<CampoCita, number> {
  return mapearColumnas(headers, CAMPOS_CITA.map((c) => c.campo), SINONIMOS_CITA);
}

export interface FilaCita {
  email: string;
  servicio: string | null;   // texto libre: se empareja con el catálogo o se usa para deducir el tipo
  tipo: string;              // PRIVADA | EVALUACION | FISIOTERAPIA | ONLINE (ya normalizado)
  fecha: string;             // 'YYYY-MM-DD'
  horaInicio: string;        // 'HH:MM'
  duracion: number | null;
  instructor: string | null;
  estado: string;            // enum de citas, ya normalizado
  precio: number | null;
}

export interface FilaCitaValidada {
  fila: number;
  datos: FilaCita;
  estado: 'ok' | 'error';
  motivo?: string;
}

/**
 * Texto libre → el enum `citas.tipo`, que solo admite cuatro valores. Por
 * defecto PRIVADA: es con diferencia la cita más común en un estudio.
 */
export function normalizarTipoCita(celda: string | null | undefined): string {
  const s = (celda ?? '').trim().toLowerCase().normalize('NFD').replace(RE_DIACRITICOS, '');
  if (!s) return 'PRIVADA';
  if (/(fisio|physio|rehab|osteo)/.test(s)) return 'FISIOTERAPIA';
  if (/(online|zoom|virtual|videollamada|remoto)/.test(s)) return 'ONLINE';
  if (/(evaluacion|valoracion|assessment|primera|inicial|diagnost)/.test(s)) return 'EVALUACION';
  return 'PRIVADA';
}

/** Texto libre → el enum `citas.estado`. Por defecto CONFIRMADA (la cita existía). */
export function normalizarEstadoCita(celda: string | null | undefined): string {
  const s = (celda ?? '').trim().toLowerCase().normalize('NFD').replace(RE_DIACRITICOS, '');
  if (!s) return 'CONFIRMADA';
  if (/(no.?show|no.?asisti|falto|ausente|missed)/.test(s)) return 'NO_ASISTIO';
  if (/(cancel|anulad|baja)/.test(s)) return 'CANCELADA';
  if (/(complet|realizad|hecha|finalizad|done|asisti|attend)/.test(s)) return 'COMPLETADA';
  if (/(pendiente|pending|solicitad|por confirmar)/.test(s)) return 'PENDIENTE';
  return 'CONFIRMADA';
}

/** Aplica el mapeo y valida las filas de citas. */
export function validarFilasCita(
  rows: string[][],
  mapeo: Record<CampoCita, number>,
): FilaCitaValidada[] {
  const val = (fila: string[], idx: number) => (idx >= 0 && idx < fila.length ? fila[idx].trim() : '');
  return rows.map((fila, i) => {
    const email = val(fila, mapeo.email).toLowerCase();
    const servicio = val(fila, mapeo.servicio) || null;
    const fecha = parsearFecha(val(fila, mapeo.fecha));
    const horaInicio = parsearHora(val(fila, mapeo.hora_inicio));
    const durRaw = val(fila, mapeo.duracion);
    const dur = durRaw !== '' && Number.isFinite(Number(durRaw)) ? Math.trunc(Number(durRaw)) : null;
    // Se conserva el signo al limpiar: quitarlo convertía un "-10" (una
    // devolución en el export) en un cargo de 10 €. Con el signo, el filtro
    // `precio >= 0` de abajo lo descarta, que es lo correcto — y además un
    // negativo violaría el CHECK citas_precio_no_negativo de la BD.
    const precioRaw = val(fila, mapeo.precio).replace(',', '.').replace(/[^\d.-]/g, '');
    const precio = precioRaw !== '' && Number.isFinite(Number(precioRaw)) ? Number(precioRaw) : null;

    const datos: FilaCita = {
      email, servicio,
      tipo: normalizarTipoCita(servicio),
      fecha: fecha ?? '',
      horaInicio: horaInicio ?? '',
      duracion: dur && dur > 0 ? dur : null,
      instructor: val(fila, mapeo.instructor) || null,
      estado: normalizarEstadoCita(val(fila, mapeo.estado)),
      precio: precio != null && precio >= 0 ? precio : null,
    };

    const err = (motivo: string): FilaCitaValidada => ({ fila: i + 1, datos, estado: 'error', motivo });
    if (!email) return err('Falta el email de la socia');
    if (!emailValido(email)) return err('El email no es válido');
    if (!fecha) return err('Falta la fecha o no se entiende');
    if (!horaInicio) return err('Falta la hora de inicio o no se entiende');
    return { fila: i + 1, datos, estado: 'ok' };
  });
}
