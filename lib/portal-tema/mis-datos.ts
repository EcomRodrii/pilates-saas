// Las reglas de «Mis datos», aparte de la pantalla para poder probarlas.
//
// El criterio es DEJAR PASAR, no filtrar: esto es el perfil de una socia, no un
// alta fiscal. Solo se rechaza lo que el servidor no podría usar o lo que casi
// seguro es un error de tecleo. Un teléfono extranjero, un piso escrito raro o
// unos apellidos con partícula tienen que entrar sin pelearse con la pantalla.

export interface MisDatos {
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string;
  fechaNacimiento: string;
  direccion: string;
}

export type ErroresMisDatos = Partial<Record<keyof MisDatos, string>>;

/**
 * El email tiene que tener algo, una arroba, algo, un punto y algo, sin
 * espacios. No se usa una expresión "completa" de RFC a propósito: las que
 * circulan por ahí rechazan direcciones válidas de verdad, y el que manda es el
 * servidor de correo, no nosotros. Lo que se caza aquí es «marta@gmail» o
 * «marta gmail.com», que son teclazos.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Un teléfono utilizable: al menos 9 dígitos. Se cuentan los DÍGITOS y se
 * ignora todo lo demás, así que `+34 600 11 22 33`, `600112233` y
 * `(+34) 600-11-22-33` valen igual. Nada de forzar formato español: hay socias
 * con número de fuera.
 */
function digitos(v: string): number {
  return (v.match(/\d/g) ?? []).length;
}

/**
 * Valida lo que la socia ha escrito. Devuelve un error por campo; vacío = todo
 * correcto.
 *
 * `ahora` entra por parámetro y no se lee el reloj aquí dentro para que la
 * prueba de «fecha futura» no dependa del día en que se ejecute.
 */
export function validarMisDatos(d: MisDatos, ahora: Date = new Date()): ErroresMisDatos {
  const e: ErroresMisDatos = {};

  // El nombre es lo único obligatorio: es como la llama el estudio en las
  // pantallas y en los correos. Sin él, la socia se queda sin nombre en su
  // propia app.
  if (!d.nombre.trim()) e.nombre = 'Escribe tu nombre.';

  // El email tampoco puede quedarse vacío: es la llave con la que entra.
  if (!d.email.trim()) e.email = 'Escribe tu email.';
  else if (!EMAIL.test(d.email.trim())) e.email = 'Ese email no parece completo.';

  // El teléfono SÍ puede quedarse vacío —hay socias que no lo dan— pero si se
  // escribe, tiene que servir para llamar.
  if (d.telefono.trim() && digitos(d.telefono) < 9) {
    e.telefono = 'Faltan dígitos para que sea un teléfono.';
  }

  if (d.fechaNacimiento.trim()) {
    const f = new Date(d.fechaNacimiento + 'T00:00:00');
    if (Number.isNaN(f.getTime())) {
      e.fechaNacimiento = 'Esa fecha no existe.';
    } else if (f.getTime() > ahora.getTime()) {
      // Un teclazo típico: el año en curso en vez del de nacimiento.
      e.fechaNacimiento = 'Esa fecha todavía no ha llegado.';
    } else if (ahora.getFullYear() - f.getFullYear() > 120) {
      e.fechaNacimiento = 'Revisa el año.';
    }
  }

  return e;
}

export function hayErrores(e: ErroresMisDatos): boolean {
  return Object.keys(e).length > 0;
}

/**
 * ¿Ha cambiado algo respecto a lo que hay guardado?
 *
 * Sirve para no mandar al servidor una escritura que no cambia nada, y para
 * decidir si el formulario puede resincronizarse cuando llegan los datos: si la
 * socia ya ha tocado algo, lo suyo manda.
 */
export function hayCambios(form: MisDatos, guardado: MisDatos): boolean {
  return (Object.keys(form) as (keyof MisDatos)[]).some((k) => form[k].trim() !== guardado[k].trim());
}
