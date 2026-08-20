import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import {
  dominioWalletValido,
  dominiosWalletPlataforma,
  registrarDominioWallet,
  registrarDominiosWalletEstudio,
} from './dominios-wallets.ts';
import { LEGAL } from '../legal-info.ts';

// ── Saneo ────────────────────────────────────────────────────────────────────

test('dominioWalletValido: acepta origen, hostname pelado y URL con ruta — siempre devuelve hostname', () => {
  assert.equal(dominioWalletValido('https://midominio.com'), 'midominio.com');
  assert.equal(dominioWalletValido('midominio.com'), 'midominio.com');
  assert.equal(dominioWalletValido('https://shop.midominio.com/reservas/'), 'shop.midominio.com');
  assert.equal(dominioWalletValido('  MiDominio.COM  '), 'midominio.com');
  // El puerto no forma parte del domain_name que Stripe registra.
  assert.equal(dominioWalletValido('https://midominio.com:8443'), 'midominio.com');
});

test('dominioWalletValido: rechaza basura, localhost e IPs', () => {
  assert.equal(dominioWalletValido(''), null);
  assert.equal(dominioWalletValido('   '), null);
  assert.equal(dominioWalletValido('localhost'), null);
  assert.equal(dominioWalletValido('http://localhost:3000'), null);
  assert.equal(dominioWalletValido('192.168.1.10'), null);
  assert.equal(dominioWalletValido('https://[::1]:3000'), null);
  assert.equal(dominioWalletValido('ni siquiera un dominio'), null);
});

test('dominiosWalletPlataforma: derivados de LEGAL.url (canónico + ápice), nunca escritos a mano', () => {
  const canonico = new URL(LEGAL.url).hostname;
  const apex = canonico.replace(/^www\./, '');
  assert.deepEqual(dominiosWalletPlataforma(), [canonico, apex]);
});

// ── Stripe mockeado ──────────────────────────────────────────────────────────
// Forma mínima de stripe.paymentMethodDomains: solo lo que el módulo llama.

interface Llamadas {
  list: { params: unknown; opts: unknown }[];
  create: { params: unknown; opts: unknown }[];
  validate: { id: string; opts: unknown }[];
}

function stripeFalso(estado: {
  existentes?: { id: string; enabled: boolean; applePay: 'active' | 'inactive' }[];
  fallaCreate?: boolean;
}): { stripe: Stripe; llamadas: Llamadas } {
  const llamadas: Llamadas = { list: [], create: [], validate: [] };
  const stripe = {
    paymentMethodDomains: {
      list: async (params: { domain_name: string }, opts: unknown) => {
        llamadas.list.push({ params, opts });
        return {
          data: (estado.existentes ?? []).map(e => ({
            id: e.id, enabled: e.enabled, apple_pay: { status: e.applePay },
          })),
        };
      },
      create: async (params: unknown, opts: unknown) => {
        llamadas.create.push({ params, opts });
        if (estado.fallaCreate) throw new Error('stripe caído');
        return { id: 'pmd_nuevo' };
      },
      validate: async (id: string, _params: unknown, opts: unknown) => {
        llamadas.validate.push({ id, opts });
        return { id };
      },
    },
  } as unknown as Stripe;
  return { stripe, llamadas };
}

test('registrarDominioWallet: crea el dominio con el header de cuenta conectada', async () => {
  const { stripe, llamadas } = stripeFalso({});
  const r = await registrarDominioWallet(stripe, 'acct_123', 'https://midominio.com');
  assert.deepEqual(r, { dominio: 'midominio.com', ok: true, detalle: 'creado' });
  assert.equal(llamadas.create.length, 1);
  assert.deepEqual(llamadas.create[0].params, { domain_name: 'midominio.com' });
  // Direct charge: la petición SIEMPRE targetea la cuenta conectada.
  assert.deepEqual(llamadas.create[0].opts, { stripeAccount: 'acct_123' });
  assert.deepEqual(llamadas.list[0].opts, { stripeAccount: 'acct_123' });
});

test('registrarDominioWallet: si ya existe activo, no crea nada (idempotente)', async () => {
  const { stripe, llamadas } = stripeFalso({
    existentes: [{ id: 'pmd_1', enabled: true, applePay: 'active' }],
  });
  const r = await registrarDominioWallet(stripe, 'acct_123', 'midominio.com');
  assert.deepEqual(r, { dominio: 'midominio.com', ok: true, detalle: 'ya-registrado' });
  assert.equal(llamadas.create.length, 0);
  assert.equal(llamadas.validate.length, 0);
});

test('registrarDominioWallet: si existe con Apple Pay inactivo, revalida en vez de crear', async () => {
  const { stripe, llamadas } = stripeFalso({
    existentes: [{ id: 'pmd_1', enabled: true, applePay: 'inactive' }],
  });
  const r = await registrarDominioWallet(stripe, 'acct_123', 'midominio.com');
  assert.deepEqual(r, { dominio: 'midominio.com', ok: true, detalle: 'revalidado' });
  assert.equal(llamadas.create.length, 0);
  assert.deepEqual(llamadas.validate[0], { id: 'pmd_1', opts: { stripeAccount: 'acct_123' } });
});

test('registrarDominioWallet: dominio inválido → no llama a Stripe', async () => {
  const { stripe, llamadas } = stripeFalso({});
  const r = await registrarDominioWallet(stripe, 'acct_123', 'localhost');
  assert.equal(r.ok, false);
  assert.equal(r.detalle, 'invalido');
  assert.equal(llamadas.list.length, 0);
  assert.equal(llamadas.create.length, 0);
});

test('registrarDominioWallet: un fallo de Stripe NUNCA propaga — falla-suave', async () => {
  const { stripe } = stripeFalso({ fallaCreate: true });
  const r = await registrarDominioWallet(stripe, 'acct_123', 'midominio.com');
  assert.deepEqual(r, { dominio: 'midominio.com', ok: false, detalle: 'error' });
});

test('registrarDominiosWalletEstudio: plataforma + widget, deduplicado tras el saneo', async () => {
  const { stripe, llamadas } = stripeFalso({});
  const canonico = new URL(LEGAL.url).hostname;
  const apex = canonico.replace(/^www\./, '');
  const r = await registrarDominiosWalletEstudio(stripe, 'acct_123', [
    'https://midominio.com',
    // Duplicado con otra forma (origen vs hostname): tras sanear es el mismo.
    'midominio.com/',
    // El ápice ya viene de la plataforma: tampoco se registra dos veces.
    `https://${apex}`,
  ]);
  assert.deepEqual(r.map(x => x.dominio), [canonico, apex, 'midominio.com']);
  assert.equal(llamadas.create.length, 3);
  assert.ok(r.every(x => x.ok));
});

test('registrarDominiosWalletEstudio: un dominio basura del widget no impide registrar el resto', async () => {
  const { stripe } = stripeFalso({});
  const r = await registrarDominiosWalletEstudio(stripe, 'acct_123', ['localhost', 'midominio.com']);
  const porDominio = new Map(r.map(x => [x.dominio, x]));
  assert.equal(porDominio.get('localhost')?.ok, false);
  assert.equal(porDominio.get('midominio.com')?.ok, true);
});
