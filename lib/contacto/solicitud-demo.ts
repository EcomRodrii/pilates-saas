// La solicitud de demo del formulario de contacto de la home (components/home-nueva/formulario-contacto.tsx).
// Pura y sin `@/`: se prueba con `node --test`. La ruta (app/api/public/solicitar-demo) la usa para validar y para montar el correo
// que recibe el equipo.

export interface SolicitudDemo {
  nombre: string;
  estudio: string;
  email: string;
  tamano: string;
  mensaje: string;
}

export type ResultadoSolicitud = { ok: true; solicitud: SolicitudDemo } | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function validarSolicitudDemo(body: Record<string, unknown>): ResultadoSolicitud {
  const email = texto(body.email, 200).toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, error: 'Escribe un correo electrónico válido.' };
  return {
    ok: true,
    solicitud: {
      email,
      nombre: texto(body.nombre, 120),
      estudio: texto(body.estudio, 120),
      tamano: texto(body.tamano, 60),
      mensaje: texto(body.mensaje, 2000),
    },
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** El correo que recibe el equipo. Todo lo que escribió la persona va escapado: es texto de un tercero dentro de un HTML. */
export function correoSolicitudDemo(s: SolicitudDemo): { asunto: string; html: string } {
  const quien = s.estudio || s.nombre || s.email;
  // Sin saltos de línea en el asunto: una cabecera con ellos sería una inyección.
  const asunto = `Demo: ${quien}`.replace(/[\r\n]+/g, ' ').slice(0, 150);
  const fila = (etiqueta: string, valor: string) => (valor ? `<p><strong>${etiqueta}:</strong> ${esc(valor)}</p>` : '');
  const html =
    `<p>Solicitud de demo desde la home.</p>` +
    fila('Nombre', s.nombre) + fila('Estudio', s.estudio) + fila('Correo', s.email) + fila('Tamaño', s.tamano) +
    (s.mensaje ? `<p style="white-space:pre-wrap">${esc(s.mensaje)}</p>` : '') +
    `<p>Responde a este correo: va directo a ${esc(s.email)}.</p>`;
  return { asunto, html };
}
