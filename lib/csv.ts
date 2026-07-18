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

const SINONIMOS: Record<CampoSocia, string[]> = {
  nombre: ['nombre', 'name', 'first name', 'firstname', 'nombre completo', 'cliente', 'alumno', 'alumna', 'socia', 'socio'],
  apellidos: ['apellidos', 'apellido', 'surname', 'last name', 'lastname'],
  email: ['email', 'e-mail', 'correo', 'correo electronico', 'mail', 'e mail'],
  telefono: ['telefono', 'phone', 'movil', 'tel', 'celular', 'whatsapp', 'mobile', 'numero'],
  nif: ['nif', 'dni', 'documento', 'nie', 'cif', 'id'],
  tags: ['tags', 'etiquetas', 'etiqueta', 'grupo', 'categoria'],
  fecha_alta: ['fecha alta', 'fecha de alta', 'alta', 'fecha registro', 'fecha de registro', 'registro', 'miembro desde', 'socia desde', 'join date', 'created', 'created at', 'signup'],
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
export function autoMapear(headers: string[]): Record<CampoSocia, number> {
  const H = headers.map(normaliza);
  const usados = new Set<number>();
  const out = {} as Record<CampoSocia, number>;

  for (const { campo } of CAMPOS_SOCIA) {
    let idx = -1;
    for (const syn of SINONIMOS[campo]) {
      const s = normaliza(syn);
      idx = H.findIndex((h, i) => !usados.has(i) && h === s); // coincidencia exacta
      if (idx === -1) idx = H.findIndex((h, i) => !usados.has(i) && h.includes(s)); // parcial
      if (idx !== -1) break;
    }
    if (idx !== -1) usados.add(idx);
    out[campo] = idx;
  }
  return out;
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
