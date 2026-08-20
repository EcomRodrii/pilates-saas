import type Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';
import { LEGAL } from '../legal-info.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Registro de dominios para wallets (Apple Pay / Google Pay / Link) vía
// `payment_method_domains` de Stripe.
//
// Por qué existe: el PaymentIntent del checkout embebido ya permite wallets
// (`automatic_payment_methods`) y el iframe lleva `allow="payment"`, pero
// Apple Pay NO aparece en ningún iPhone si el dominio donde se pinta el
// Payment Element no está registrado. Con Connect **direct charge** el
// registro es POR CUENTA CONECTADA (clave de plataforma + header
// `Stripe-Account`, doc pmd-registration §Connect) y por dominio:
//   · Modo A (iframe): el Element vive en tentare.app → hay que registrar
//     `www.tentare.app` y el ápice sobre CADA cuenta conectada. (Safari 17+
//     exige además registrar el dominio ORIGEN del iframe — mismo dominio.)
//   · Modo B (Shadow DOM en la web del estudio): el dominio del ESTUDIO.
//
// NO hace falta alojar `.well-known/apple-developer-merchantid-domain-
// association`: la doc actual de Stripe dice literalmente que la "merchant
// validation" de Apple la hace Stripe entre bastidores ("You don't need to
// create an Apple Merchant ID or CSR"), basta el alta del dominio por API.
//
// Falla-suave SIEMPRE: registrar un dominio es una mejora del checkout, nunca
// puede tumbar el flujo que lo dispara (guardar un dominio del widget,
// completar el OAuth de Connect). Ningún export de este fichero lanza.
// ─────────────────────────────────────────────────────────────────────────────

/** Extrae el hostname registrable de lo que venga (origen `https://x.com`,
 *  hostname pelado, URL con ruta...). Devuelve `null` para basura: vacío,
 *  localhost, IPs o cadenas sin un punto — Stripe/Apple no pueden verificar
 *  nada de eso y el create solo generaría ruido en Sentry. Mismo criterio de
 *  saneo que `normalizar` en GestionDominios (tab-api.tsx), pero en servidor
 *  y quedándose con el hostname: `payment_method_domains` quiere
 *  `domain_name`, no un origen con protocolo. */
export function dominioWalletValido(valor: string): string | null {
  const v = valor.trim().replace(/\/+$/, '');
  if (!v) return null;
  let host: string;
  try {
    host = new URL(v.includes('://') ? v : `https://${v}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host.includes('.')) return null; // localhost, cadenas sueltas
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null; // IPv4
  if (host.startsWith('[')) return null; // IPv6
  return host;
}

/** Los dominios propios de la plataforma (Modo A: el Payment Element vive en
 *  el iframe de tentare.app). DERIVADOS de `LEGAL.url` — el guard-test
 *  prohíbe escribir el dominio a mano, y el ápice se deriva quitando el
 *  `www.`, igual que hace `canonicalizarOrigen`. */
export function dominiosWalletPlataforma(): string[] {
  const canonico = new URL(LEGAL.url).hostname;
  const apex = canonico.replace(/^www\./, '');
  return canonico === apex ? [canonico] : [canonico, apex];
}

export interface ResultadoRegistroDominio {
  dominio: string;
  ok: boolean;
  /** 'creado' | 'ya-registrado' | 'revalidado' | 'invalido' | 'error' */
  detalle: 'creado' | 'ya-registrado' | 'revalidado' | 'invalido' | 'error';
}

/** Registra UN dominio sobre una cuenta conectada. Idempotente de verdad, no
 *  por fe en el API: primero `list({ domain_name })` — si ya existe y Apple
 *  Pay está activo, no-op; si existe pero Apple Pay quedó `inactive`, se
 *  reintenta con `validate()` (el camino que la doc del SDK indica para
 *  reactivar un dominio); si no existe, `create()`. Nunca lanza. */
export async function registrarDominioWallet(
  stripe: Stripe,
  stripeAccount: string,
  dominio: string,
): Promise<ResultadoRegistroDominio> {
  const domainName = dominioWalletValido(dominio);
  if (!domainName) return { dominio, ok: false, detalle: 'invalido' };
  const opts = { stripeAccount };
  try {
    const existentes = await stripe.paymentMethodDomains.list(
      { domain_name: domainName, limit: 1 }, opts,
    );
    const existente = existentes.data[0];
    if (existente) {
      if (existente.enabled && existente.apple_pay.status === 'active') {
        return { dominio: domainName, ok: true, detalle: 'ya-registrado' };
      }
      await stripe.paymentMethodDomains.validate(existente.id, {}, opts);
      return { dominio: domainName, ok: true, detalle: 'revalidado' };
    }
    await stripe.paymentMethodDomains.create({ domain_name: domainName }, opts);
    return { dominio: domainName, ok: true, detalle: 'creado' };
  } catch (e) {
    console.error('[dominios-wallets] no se pudo registrar', domainName, 'en', stripeAccount, e);
    try {
      // Falla-suave hasta el final: bajo `node --test` (sin runtime de Next)
      // el namespace de @sentry/nextjs no expone captureException, y un fallo
      // del propio reporte tampoco puede propagar.
      Sentry.captureException(e instanceof Error ? e : new Error(String(e)), {
        tags: { modulo: 'dominios-wallets' },
        extra: { dominio: domainName, stripeAccount },
      });
    } catch { /* el console.error de arriba ya deja rastro */ }
    return { dominio: domainName, ok: false, detalle: 'error' };
  }
}

/** Registra sobre una cuenta conectada TODO lo que su checkout puede
 *  necesitar: los dominios de la plataforma (Modo A) + los dominios del
 *  widget del estudio (Modo B), deduplicados tras el saneo. Cada dominio
 *  falla o registra por su cuenta — un dominio basura en la lista del widget
 *  no impide registrar tentare.app. */
export async function registrarDominiosWalletEstudio(
  stripe: Stripe,
  stripeAccount: string,
  dominiosWidget: string[],
): Promise<ResultadoRegistroDominio[]> {
  const vistos = new Set<string>();
  const dominios: string[] = [];
  for (const d of [...dominiosWalletPlataforma(), ...dominiosWidget]) {
    const host = dominioWalletValido(d);
    const clave = host ?? d;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    dominios.push(d);
  }
  const resultados: ResultadoRegistroDominio[] = [];
  // En serie, no Promise.all: son pocas llamadas y así un rate-limit de
  // Stripe no tumba la tanda entera de golpe.
  for (const d of dominios) {
    resultados.push(await registrarDominioWallet(stripe, stripeAccount, d));
  }
  return resultados;
}
