// Los correos que el estudio manda por iniciativa propia o para cerrar una
// promesa: pedirle una valoración, contarle que su bono sigue intacto aunque no
// se liberara sitio, y los mensajes de sus automatizaciones y campañas.

import { correoEstudio, type MarcaCorreo } from './plantilla.ts';
import { ACENTO } from './paleta.ts';

export interface PropsValoracion {
  toName: string;
  claseNombre: string;
  cuando: string;
  instructorNombre?: string | null;
  /** La página pública de valoración (enlace firmado, sin login). */
  url: string;
  marca: MarcaCorreo;
}

export function correoValoracion(p: PropsValoracion): string {
  const conQuien = p.instructorNombre ? ` con ${p.instructorNombre}` : '';
  return correoEstudio({
    marca: p.marca,
    preheader: `Cuéntanos qué tal tu clase de ${p.claseNombre}`,
    titular: '¿Qué tal tu clase?',
    parrafos: [`Hola ${p.toName}, ¿qué tal tu clase${conQuien}? Tu opinión ayuda a ${p.marca.estudioNombre} a cuidar cada clase. Es un toque, diez segundos.`],
    detalle: { titulo: p.claseNombre, filas: [{ label: 'Cuándo', value: p.cuando }] },
    boton: { href: p.url, texto: 'Valorar la clase' },
    // Sin portada: el correo es una pregunta corta y una foto delante la aleja.
    conPortada: false,
    nota: 'Sin instalar nada. Solo tú y tu estudio veis esto.',
  });
}

export interface PropsEsperaSinPlaza {
  socioNombre: string;
  claseNombre: string;
  fecha: string;
  hora: string;
  sala: string;
  instructor: string;
  /**
   * Sesiones que le quedan del bono que pagó y NO llegó a gastar (la lista de
   * espera nunca consume bono). `1` es el caso delicado: compró una clase
   * suelta, así que el crédito es el importe entero — por eso ahí, y solo ahí,
   * se le ofrece la devolución.
   */
  sesionesRestantes: number;
  /**
   * Hasta cuándo puede gastarlo. `null` = sin caducidad. ⚠️ Se pasa en vez de
   * afirmar «no caduca»: eso lo decide cada estudio y el correo no puede
   * prometer lo contrario.
   */
  caducaEl?: string | null;
  urlHorario?: string | null;
  /** Dirección del estudio, para pedir la devolución. */
  emailEstudio?: string | null;
  marca: MarcaCorreo;
}

/**
 * Cierre honesto de la promesa que le hizo la pantalla de pago: «te avisaremos
 * si se libera un sitio». Si nunca se liberó, ese aviso no llega nunca y la
 * socia se queda esperando un correo que no existe. Este ES ese correo — por eso
 * no se puede reescribir desde Configuración.
 */
export function correoEsperaSinPlaza(p: PropsEsperaSinPlaza): string {
  const claseSuelta = p.sesionesRestantes <= 1;
  const hasta = p.caducaEl ? ` hasta el ${p.caducaEl}` : '';
  return correoEstudio({
    marca: p.marca,
    preheader: claseSuelta
      ? `Tu clase de ${p.claseNombre} se llenó — tu pago sigue disponible`
      : `No se liberó sitio en ${p.claseNombre}, pero tu bono está intacto`,
    titular: 'No se liberó sitio',
    parrafos: [
      `Hola ${p.socioNombre}, al final no se liberó ningún sitio en ${p.claseNombre} y la clase ya ha pasado.`,
      claseSuelta
        ? `Tu pago no se ha perdido: tienes una sesión disponible en ${p.marca.estudioNombre}, que puedes gastar en cualquier clase del horario${hasta}.`
        : `Tu bono no se ha tocado: te quedan ${p.sesionesRestantes} sesiones${p.caducaEl ? `, y puedes usarlas${hasta}` : ' para usar cuando quieras'}.`,
    ],
    detalle: { titulo: p.claseNombre, filas: [
      { label: 'Fecha', value: p.fecha },
      { label: 'Hora', value: p.hora },
      { label: 'Sala', value: p.sala },
      { label: 'Instructora', value: p.instructor },
    ] },
    boton: p.urlHorario ? { href: p.urlHorario, texto: 'Ver el horario' } : null,
    conPortada: false,
    acento: ACENTO.aviso,
    nota: claseSuelta
      ? `Y si prefieres que te devolvamos el dinero, contéstanos a este correo${p.emailEstudio ? ` o escríbenos a ${p.emailEstudio}` : ''} y lo hacemos — sin explicaciones.`
      : null,
  });
}

export interface PropsAutomatizacion {
  socioNombre: string;
  titulo: string;
  mensaje: string;
  marca: MarcaCorreo;
  /**
   * SOLO en envíos comerciales (campañas, automatizaciones de marketing): la
   * LSSI exige el enlace de baja en toda comunicación comercial, y ofrecerlo en
   * una que no lo es sería invitarla a apagar avisos que necesita.
   */
  unsubscribeUrl?: string | null;
  /**
   * Llamada a la acción opcional. Existe para el aviso de hueco libre, cuyo
   * único fin es que RESERVE: con el enlace suelto dentro del texto dependes de
   * que el cliente de correo lo detecte y lo subraye, que es justo lo que no
   * hace Outlook.
   */
  accion?: { url: string; texto: string } | null;
}

export function correoAutomatizacion(p: PropsAutomatizacion): string {
  // El mensaje lo escribe la propietaria y puede traer saltos de línea: cada
  // párrafo va por su lado para que no salgan todos pegados en una parrafada.
  const parrafos = p.mensaje.split(/\n{2,}/).map(t => t.trim()).filter(Boolean);
  return correoEstudio({
    marca: p.marca,
    preheader: p.mensaje.slice(0, 90),
    titular: p.titulo,
    parrafos: [`Hola ${p.socioNombre},`, ...parrafos],
    boton: p.accion ? { href: p.accion.url, texto: p.accion.texto } : null,
    // Es el correo que más se parece a una carta del estudio: aquí la portada
    // suma en vez de retrasar el dato.
    conPortada: true,
    bajaUrl: p.unsubscribeUrl ?? null,
  });
}
