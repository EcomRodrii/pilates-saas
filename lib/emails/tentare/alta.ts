// ─────────────────────────────────────────────────────────────────────────────
// «Tu cuenta está activa»: el correo n.º 2 del alta nueva (maqueta aprobada el
// 21-oct-2026, «09 · Correos»). Sale UNA vez, al montar el estudio después de
// validar el código (POST /api/alta/estudio-creado), con el remitente «Tentare»:
// a la propietaria no se le dice Manager ni Core antes de saber su rol, igual
// que en /login.
//
// Es de la familia de Tentare (`plantilla.ts`: el marco, el logo, la regla y el
// botón), pero con su propio orden de bloques —la dirección de su app va entre
// dos párrafos— y su propio pie, el de la maqueta.
//
// ⚠️ El enlace que se le da al estudio es el de LA APP DE SUS ALUMNAS
// (`/portal/<slug>`), nunca el de la página de reservas (`/reservar/<slug>`):
// esa es para integrarla en su web, no para pasársela a las alumnas (decisión
// del fundador, 22-oct-2026; lib/enlaces-estudio.ts). Y el texto no promete lo
// que la app no hace: la alumna entra con su email y un código, y desde ahí
// reserva.
//
// El plan no se escribe a mano: sale de las constantes que el producto aplica
// (lib/landing/founding-gratis.ts), y solo dice «gratis» si el alta empieza
// gratis de verdad (FOUNDING_GRATIS encendido para todos); si no, lo que dice
// hoy el alta: los días de prueba.
//
// Puro, con rutas relativas: lo prueba `node --test` (alta.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { escaparHtml, hrefSeguro } from '../html.ts';
import { PLAN_INFO } from '../../billing/entitlements.ts';
import { TRIAL_DIAS } from '../../billing/trial.ts';
import { LIMITES_GRATIS } from '../../landing/founding-gratis.ts';
import { enlaceWhatsApp } from '../../decision/mensajes-socia.ts';
import { SOPORTE_WHATSAPP } from '../../soporte.ts';
import { botonTentare, cabeceraTentare, marcoTentare, PILA_TENTARE as PILA, TENTARE } from './plantilla.ts';

/** «Primeros pasos · 1 de 5»: la lista de la maqueta, con la cuenta ya hecha. */
export const PRIMEROS_PASOS_ALTA = [
  'Crea tu cuenta',
  'Crea tu primera clase',
  'Comparte el enlace de tu app',
  'Trae a tus alumnas',
  'Recibe tu primera reserva',
] as const;

/**
 * La línea del plan. Con Founding Studio gratis, sus dos límites juntos (con 150
 * alumnas lo normal es pasar de 250 reservas: uno solo engaña). Sin él, el alta
 * empieza con la prueba de siempre, y eso es lo que se dice.
 */
export function textoPlanAlta(foundingGratis: boolean): string {
  return foundingGratis
    ? `${PLAN_INFO.BASE.nombre}: gratis ${LIMITES_GRATIS}. Sin tarjeta y sin permanencia.`
    : `${PLAN_INFO.BASE.nombre}: ${TRIAL_DIAS} días de prueba con todo lo que incluye. Sin tarjeta y sin permanencia.`;
}

export interface CorreoCuentaActiva {
  asunto: string;
  preheader: string;
  html: string;
}

export function correoCuentaActiva(p: {
  estudioNombre: string;
  /** La dirección REAL de la app de sus alumnas (`…/portal/<slug>`), la del estudio ya creado. */
  urlApp: string;
  /** A dónde lleva «Crear mi primera clase». */
  urlPrimeraClase: string;
  foundingGratis: boolean;
}): CorreoCuentaActiva {
  const t = TENTARE;
  const estudio = p.estudioNombre.trim() || 'Tu estudio';
  const preheader = 'Tu cuenta está activa. Te queda un paso para recibir reservas: tu primera clase.';
  const parrafo = (html: string, extra = '') =>
    `<div style="font-family:${PILA};font-size:15px;line-height:1.65;color:${t.tinta};margin:0 0 14px;${extra}">${html}</div>`;
  const etiqueta = (texto: string) =>
    `<div style="font-family:${PILA};font-size:10.5px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:${t.olivaMedio};margin:0 0 8px;">${escaparHtml(texto)}</div>`;
  const caja = (contenido: string) => `<tr><td class="px-mobile" style="padding:0 32px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.arena}" style="background:${t.arena};border-radius:8px;"><tr><td style="padding:14px 16px;">
${contenido}
</td></tr></table>
</td></tr>`;

  // La primera, hecha (la marca y el texto fuerte); las demás, numeradas.
  const pasos = PRIMEROS_PASOS_ALTA.map((paso, i) => {
    const hecho = i === 0;
    return `<tr>
<td width="22" valign="top" style="padding:4px 0;font-family:${PILA};font-size:14px;line-height:1.5;font-weight:bold;color:${hecho ? t.oliva : t.tintaSuave};">${hecho ? '&#10003;' : `${i + 1}.`}</td>
<td valign="top" style="padding:4px 0;font-family:${PILA};font-size:14px;line-height:1.5;color:${hecho ? t.oliva : t.tinta};${hecho ? 'font-weight:bold;' : ''}">${escaparHtml(paso)}</td>
</tr>`;
  }).join('');

  const bloques = [
    cabeceraTentare(),
    `<tr><td class="px-mobile" style="padding:28px 32px 8px;">
<div style="font-family:${PILA};font-weight:800;font-size:26px;line-height:1.2;letter-spacing:-0.02em;color:${t.oliva};margin:0 0 14px;">Tu cuenta está activa</div>
${parrafo(`<b>${escaparHtml(estudio)}</b> ya tiene la app de sus alumnas:`)}
<div style="margin:0 0 14px;padding:12px 14px;border:1px solid ${t.borde};border-radius:8px;font-family:${PILA};font-size:14px;line-height:1.4;word-break:break-all;"><a href="${hrefSeguro(p.urlApp)}" style="color:${t.oliva};text-decoration:underline;">${escaparHtml(p.urlApp)}</a></div>
${parrafo('Todavía está vacía. En cuanto crees tu primera clase, tus alumnas podrán entrar con su email y reservar desde el móvil, sin descargarse nada.')}
</td></tr>`,
    botonTentare({ href: p.urlPrimeraClase, texto: 'Crear mi primera clase' }),
    caja(`${etiqueta('Primeros pasos · 1 de 5')}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${pasos}</table>`),
    caja(`${etiqueta('Tu plan')}<div style="font-family:${PILA};font-size:14px;line-height:1.55;color:${t.tinta};">${escaparHtml(textoPlanAlta(p.foundingGratis))}</div>`),
    '<tr><td style="padding:0 0 14px;font-size:0;line-height:0;">&nbsp;</td></tr>',
  ].join('');

  return {
    asunto: `${estudio} ya está en Tentare`,
    preheader,
    html: marcoTentare(preheader, bloques, pieDelAlta(estudio)),
  };
}

/** El pie de la maqueta en los correos del alta: una persona por WhatsApp y quién escribe. */
function pieDelAlta(estudio: string): string {
  const t = TENTARE;
  const whatsapp = enlaceWhatsApp(SOPORTE_WHATSAPP, `Hola, soy de ${estudio} y estoy poniendo en marcha Tentare:`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="px-mobile" style="padding:18px 8px 0;font-family:${PILA};font-size:12px;line-height:1.6;color:${t.tintaSuave};text-align:center;">
¿Te atascas? ${whatsapp ? `<a href="${hrefSeguro(whatsapp)}" style="color:${t.tintaSuave};text-decoration:underline;">Escríbenos por WhatsApp</a>` : 'Escríbenos por WhatsApp'}: <b>te responde una persona</b>.<br>Tentare · Software para estudios de Pilates · Hecho en España
</td></tr></table>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// «Ya puedes recibir reservas»: el correo n.º 4 (maqueta, «09 · Correos»). Sale
// UNA vez por estudio, al publicar la primera clase y solo si el servidor ha
// comprobado que una alumna nueva ya puede reservar (`puedeReservarEnServidor`,
// app/api/alta/primera-clase). Lleva el enlace de la app de sus alumnas y su QR
// en PNG (/api/public/qr-app/<slug>): Gmail no pinta un SVG.
// ─────────────────────────────────────────────────────────────────────────────


export function correoRecibirReservas(p: {
  estudioNombre: string;
  /** El nombre de la clase, tal y como sale en la app de sus alumnas. */
  claseNombre: string;
  /** «lunes 26 a las 18:30, cada semana» (`cuandoCorto`, lib/alta/primera-clase.ts). */
  cuando: string;
  /** La dirección REAL de la app de sus alumnas (`…/portal/<slug>`). */
  urlApp: string;
  /** El PNG del QR de esa dirección (`/api/public/qr-app/<slug>`). */
  urlQr: string;
}): { asunto: string; preheader: string; html: string } {
  const t = TENTARE;
  const estudio = p.estudioNombre.trim() || 'Tu estudio';
  const preheader = 'Tu enlace y tu QR, para tenerlos a mano.';
  const parrafo = (html: string) =>
    `<div style="font-family:${PILA};font-size:15px;line-height:1.65;color:${t.tinta};margin:0 0 14px;">${html}</div>`;

  const bloques = [
    cabeceraTentare(),
    `<tr><td class="px-mobile" style="padding:28px 32px 8px;">
<div style="font-family:${PILA};font-weight:800;font-size:26px;line-height:1.2;letter-spacing:-0.02em;color:${t.oliva};margin:0 0 14px;">Ya puedes recibir reservas</div>
${parrafo(`Tu clase <b>${escaparHtml(p.claseNombre.trim() || 'de hoy')}</b> está publicada (${escaparHtml(p.cuando)}). Copia este enlace y mándalo:`)}
<div style="margin:0 0 14px;padding:12px 14px;border:1px solid ${t.borde};border-radius:8px;font-family:${PILA};font-size:14px;line-height:1.4;word-break:break-all;"><a href="${hrefSeguro(p.urlApp)}" style="color:${t.oliva};text-decoration:underline;">${escaparHtml(p.urlApp)}</a></div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.arena}" style="background:${t.arena};border-radius:8px;margin:0 0 14px;"><tr>
<td width="132" valign="middle" style="padding:12px 0 12px 12px;"><img src="${hrefSeguro(p.urlQr)}" width="120" height="120" alt="QR de la app de tus alumnas" style="display:block;border:0;width:120px;height:120px;background:${t.papel};"></td>
<td valign="middle" style="padding:12px 14px;font-family:${PILA};font-size:14px;line-height:1.55;color:${t.tinta};"><b>Tu QR.</b> Imprímelo y ponlo en recepción: al escanearlo, se abre la app de tus alumnas.</td>
</tr></table>
${parrafo('Pégalo en tu Instagram o en el grupo de WhatsApp de tus alumnas. Entran con su email, sin descargarse nada.')}
${parrafo('Si quieres que reserven desde tu propia web, lo preparas en Configuración › Mi app y mi web.')}
</td></tr>`,
    botonTentare({ href: p.urlApp, texto: 'Abrir mi app' }),
  ].join('');

  return {
    asunto: `Ya puedes recibir reservas en ${estudio}`,
    preheader,
    html: marcoTentare(preheader, bloques, pieDelAlta(estudio)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// «Tu primera clase en Tentare, en 5 minutos»: el correo n.º 3 (maqueta, «09 ·
// Correos»). Sale UNA vez, entre las 24 y las 72 h de crear el estudio, si una
// alumna nueva todavía no puede reservar (cuándo y a quién, en
// lib/alta/correo-primera-clase.ts; lo manda el cron `altas-sin-terminar`).
//
// Decisión D7 del fundador: es «sin clase RESERVABLE», y el texto lo dice. Sin
// ninguna clase, la maqueta tal cual («le falta tu primera clase»). Con una
// clase que una alumna nueva no puede reservar, decirle «crea tu primera
// clase» sería mentirle: se le dice qué falta, con la frase de «¡Listo!», y se
// la lleva a donde se arregla.
// ─────────────────────────────────────────────────────────────────────────────

export function correoPrimeraClase(p: {
  estudioNombre: string;
  /** Su nombre (`user_metadata.nombre`), para el saludo. Sin él, sin nombre. */
  nombre: string | null;
  /** «Sin clase» (la maqueta) o «con clase que aún no se puede reservar». */
  variante: { tipo: 'sin_clase'; ejemplo: { clase: string; minutos: number; plazas: number } } | { tipo: 'no_reservable'; aviso: string };
  /** A dónde lleva el botón: `/calendario?primera=1`, o donde se arregla lo que falta. */
  urlBoton: string;
}): { asunto: string; preheader: string; html: string } {
  const t = TENTARE;
  const estudio = p.estudioNombre.trim() || 'Tu estudio';
  const nombre = p.nombre?.trim();
  const preheader = `Es lo único que le falta a ${estudio} para recibir reservas.`;
  const parrafo = (html: string) =>
    `<div style="font-family:${PILA};font-size:15px;line-height:1.65;color:${t.tinta};margin:0 0 14px;">${html}</div>`;

  const cuerpo = p.variante.tipo === 'sin_clase'
    ? [
      parrafo(`A <b>${escaparHtml(estudio)}</b> le falta una cosa para recibir reservas: tu primera clase.`),
      parrafo(`Está preparada con valores de ejemplo: ${escaparHtml(p.variante.ejemplo.clase)}, ${p.variante.ejemplo.minutos} minutos y ${p.variante.ejemplo.plazas} plazas. Tú eliges el día y la hora, pones el precio y la publicas.`),
    ].join('')
    : [
      parrafo(`A <b>${escaparHtml(estudio)}</b> le falta una cosa para recibir reservas: que una alumna nueva pueda reservar tu clase.`),
      parrafo(escaparHtml(p.variante.aviso)),
    ].join('');

  const bloques = [
    cabeceraTentare(),
    `<tr><td class="px-mobile" style="padding:28px 32px 8px;">
<div style="font-family:${PILA};font-weight:800;font-size:26px;line-height:1.2;letter-spacing:-0.02em;color:${t.oliva};margin:0 0 14px;">Te falta un paso${nombre ? `, ${escaparHtml(nombre)}` : ''}</div>
${cuerpo}
</td></tr>`,
    botonTentare({ href: p.urlBoton, texto: p.variante.tipo === 'sin_clase' ? 'Crear mi primera clase' : 'Ver qué falta' }),
    '<tr><td style="padding:0 0 14px;font-size:0;line-height:0;">&nbsp;</td></tr>',
  ].join('');

  return {
    asunto: p.variante.tipo === 'sin_clase'
      ? 'Tu primera clase en Tentare, en 5 minutos'
      : `Tus alumnas todavía no pueden reservar en ${estudio}`,
    preheader,
    html: marcoTentare(preheader, bloques, pieDelRecordatorio(estudio)),
  };
}

/** El pie del correo 3: la persona por WhatsApp y que es el único recordatorio sobre esto. */
function pieDelRecordatorio(estudio: string): string {
  const t = TENTARE;
  const whatsapp = enlaceWhatsApp(SOPORTE_WHATSAPP, `Hola, soy de ${estudio} y estoy poniendo en marcha Tentare:`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="px-mobile" style="padding:18px 8px 0;font-family:${PILA};font-size:12px;line-height:1.6;color:${t.tintaSuave};text-align:center;">
¿Te atascas en algo? ${whatsapp ? `<a href="${hrefSeguro(whatsapp)}" style="color:${t.tintaSuave};text-decoration:underline;">Escríbenos por WhatsApp</a>` : 'Escríbenos por WhatsApp'} y te ayuda <b>una persona del equipo</b>.<br>Es el único recordatorio que te mandamos sobre esto.<br>Tentare · Software para estudios de Pilates · Hecho en España
</td></tr></table>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Los dos correos de «después de la primera clase» (31-oct-2026; cuándo y a
// quién, en lib/alta/correo-empuje.ts):
//   · `compartir`: la clase ya es reservable y no ha enseñado el enlace.
//   · `alumnas`: ha compartido el enlace y todavía no ha reservado nadie.
// Mismo marco y mismo pie de WhatsApp que el correo 3. Sin cifras ni promesas
// de resultado: dicen qué pasa y qué hacer, y el botón lleva a «Compartir mi
// enlace» (`/dashboard?compartir=1`), que ya existe en el panel.
// ─────────────────────────────────────────────────────────────────────────────

export function correoEmpuje(p: {
  variante: 'compartir' | 'alumnas';
  estudioNombre: string;
  /** Su nombre (`user_metadata.nombre`), para el saludo. Sin él, sin nombre. */
  nombre: string | null;
  /** A dónde lleva el botón: `/dashboard?compartir=1`. */
  urlBoton: string;
}): { asunto: string; preheader: string; html: string } {
  const t = TENTARE;
  const estudio = p.estudioNombre.trim() || 'Tu estudio';
  const nombre = p.nombre?.trim();
  const parrafo = (html: string) =>
    `<div style="font-family:${PILA};font-size:15px;line-height:1.65;color:${t.tinta};margin:0 0 14px;">${html}</div>`;
  const lista = (items: string[]) =>
    `<ul style="font-family:${PILA};font-size:15px;line-height:1.65;color:${t.tinta};margin:0 0 14px;padding-left:20px;">${items.map(i => `<li style="margin:0 0 6px;">${i}</li>`).join('')}</ul>`;

  const contenido = p.variante === 'compartir'
    ? {
      asunto: 'Tu clase está lista: falta que lo sepan tus alumnas',
      preheader: `${estudio} ya puede recibir reservas. Solo falta que tus alumnas tengan el enlace.`,
      titular: `Tu app ya puede recibir reservas${nombre ? `, ${escaparHtml(nombre)}` : ''}`,
      cuerpo: [
        parrafo(`En <b>${escaparHtml(estudio)}</b> ya hay una clase que una alumna nueva puede reservar. Lo único que falta es que se enteren.`),
        parrafo('El enlace de tu app es el que tienes que darles. Entran con su email, sin descargarse nada, y reservan desde el móvil. Lo que más sencillo resulta:'),
        lista([
          'pegarlo en el <b>grupo de WhatsApp</b> de tus alumnas;',
          'ponerlo en la <b>bio de tu Instagram</b>;',
          'imprimir su <b>código QR</b> y dejarlo en recepción.',
        ]),
      ].join(''),
      boton: 'Compartir mi enlace',
    }
    : {
      asunto: `Ya compartiste el enlace de ${estudio}: las primeras reservas`,
      preheader: 'Casi siempre las primeras alumnas llegan cuando se lo pides tú, una a una.',
      titular: `Las primeras reservas${nombre ? `, ${escaparHtml(nombre)}` : ''}`,
      cuerpo: [
        parrafo(`Compartiste el enlace de la app de <b>${escaparHtml(estudio)}</b>, pero todavía no ha reservado nadie.`),
        parrafo('Es lo habitual la primera vez: con un enlace suelto en un grupo no basta, hay que pedírselo directamente. Tres cosas que ayudan:'),
        lista([
          'escribir <b>tú misma</b> a las alumnas que ya tienes, con el enlace, y pedirles que reserven su próxima clase;',
          'dejar el <b>QR impreso</b> en recepción para quien venga a clase;',
          'dar de alta a tus alumnas con su <b>correo</b>: sin correo no pueden entrar a la app.',
        ]),
      ].join(''),
      boton: 'Ver mi enlace y mi QR',
    };

  const bloques = [
    cabeceraTentare(),
    `<tr><td class="px-mobile" style="padding:28px 32px 8px;">
<div style="font-family:${PILA};font-weight:800;font-size:26px;line-height:1.2;letter-spacing:-0.02em;color:${t.oliva};margin:0 0 14px;">${contenido.titular}</div>
${contenido.cuerpo}
</td></tr>`,
    botonTentare({ href: p.urlBoton, texto: contenido.boton }),
    '<tr><td style="padding:0 0 14px;font-size:0;line-height:0;">&nbsp;</td></tr>',
  ].join('');

  return {
    asunto: contenido.asunto,
    preheader: contenido.preheader,
    html: marcoTentare(contenido.preheader, bloques, pieDelRecordatorio(estudio)),
  };
}
