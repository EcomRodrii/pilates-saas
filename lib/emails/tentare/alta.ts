// ─────────────────────────────────────────────────────────────────────────────
// «Tu cuenta está activa»: el correo n.º 2 del alta nueva (maqueta aprobada el
// 21-oct-2026, «09 · Correos»). Sale UNA vez, al montar el estudio después de
// validar el código (POST /api/alta/estudio-creado), con el remitente «Tentare»:
// a la propietaria no se le dice Manager ni Core antes de saber su rol, igual
// que en /login.
//
// Es de la familia de Tentare (`plantilla.ts`: el marco, el logo, la regla y el
// botón), pero con su propio orden de bloques —la dirección de su página va
// entre dos párrafos— y su propio pie, el de la maqueta. Los textos, tal cual.
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
  'Comparte tu enlace de reservas',
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
  /** La dirección REAL de su página (`…/reservar/<slug>`), la del estudio ya creado. */
  urlPagina: string;
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

  const whatsapp = enlaceWhatsApp(SOPORTE_WHATSAPP, `Hola, soy de ${estudio} y estoy poniendo en marcha Tentare:`);

  const bloques = [
    cabeceraTentare(),
    `<tr><td class="px-mobile" style="padding:28px 32px 8px;">
<div style="font-family:${PILA};font-weight:800;font-size:26px;line-height:1.2;letter-spacing:-0.02em;color:${t.oliva};margin:0 0 14px;">Tu cuenta está activa</div>
${parrafo(`<b>${escaparHtml(estudio)}</b> ya tiene su página de reservas:`)}
<div style="margin:0 0 14px;padding:12px 14px;border:1px solid ${t.borde};border-radius:8px;font-family:${PILA};font-size:14px;line-height:1.4;word-break:break-all;"><a href="${hrefSeguro(p.urlPagina)}" style="color:${t.oliva};text-decoration:underline;">${escaparHtml(p.urlPagina)}</a></div>
${parrafo('Todavía está vacía. En cuanto crees tu primera clase, tus alumnas podrán reservar desde ahí, sin descargarse nada.')}
</td></tr>`,
    botonTentare({ href: p.urlPrimeraClase, texto: 'Crear mi primera clase' }),
    caja(`${etiqueta('Primeros pasos · 1 de 5')}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${pasos}</table>`),
    caja(`${etiqueta('Tu plan')}<div style="font-family:${PILA};font-size:14px;line-height:1.55;color:${t.tinta};">${escaparHtml(textoPlanAlta(p.foundingGratis))}</div>`),
    '<tr><td style="padding:0 0 14px;font-size:0;line-height:0;">&nbsp;</td></tr>',
  ].join('');

  const pie = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="px-mobile" style="padding:18px 8px 0;font-family:${PILA};font-size:12px;line-height:1.6;color:${t.tintaSuave};text-align:center;">
¿Te atascas? ${whatsapp ? `<a href="${hrefSeguro(whatsapp)}" style="color:${t.tintaSuave};text-decoration:underline;">Escríbenos por WhatsApp</a>` : 'Escríbenos por WhatsApp'}: <b>te responde una persona</b>.<br>Tentare · Software para estudios de Pilates · Hecho en España
</td></tr></table>`;

  return {
    asunto: `${estudio} ya está en Tentare`,
    preheader,
    html: marcoTentare(preheader, bloques, pie),
  };
}
