import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  consentimientoMarketingVigente, registrarConsentimientoMarketingPropio, textoConsentimientoVigente,
} from './consentimiento-marketing-admin.ts';

// Admin falso: responde a `studios.select('nombre')`, `socios.select(...)` y
// a la RPC `consentimiento_marketing_propio`, registrando cómo se llamó cada
// una para poder comprobar qué le llega al servidor.
function fakeAdmin(p: {
  nombreEstudio?: string | null;
  textoActual?: string | null;
  rpcResultado?: string;
} = {}) {
  const rpcLlamadas: Record<string, unknown>[] = [];
  const from = (tabla: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => {
        if (tabla === 'studios') return { data: { nombre: 'nombreEstudio' in p ? p.nombreEstudio : 'Estudio Luz' }, error: null };
        if (tabla === 'socios') return { data: { consentimiento_marketing_texto: p.textoActual ?? null }, error: null };
        return { data: null, error: null };
      },
    };
    return q;
  };
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    if (fn === 'consentimiento_marketing_propio') {
      rpcLlamadas.push(args);
      return { data: p.rpcResultado ?? 'OK', error: null };
    }
    return { data: null, error: new Error(`RPC no esperada: ${fn}`) };
  };
  return { admin: { from, rpc } as unknown as SupabaseClient, rpcLlamadas };
}

test('el texto vigente lleva el nombre del estudio, con su respaldo por defecto si no lo tiene', async () => {
  const { admin } = fakeAdmin({ nombreEstudio: 'Pilates Luz' });
  const texto = await textoConsentimientoVigente(admin, 's1');
  assert.match(texto, /Pilates Luz/);
  const { admin: sinNombre } = fakeAdmin({ nombreEstudio: null });
  assert.match(await textoConsentimientoVigente(sinNombre, 's1'), /el Estudio/);
});

test('dar consentimiento: el texto lo compone el servidor, nunca lo que mande el navegador', async () => {
  const { admin, rpcLlamadas } = fakeAdmin({ nombreEstudio: 'Pilates Luz' });
  const r = await registrarConsentimientoMarketingPropio(admin, {
    studioId: 's1', socioId: 'soc-1', dar: true, origen: 'SOCIA',
    evidencia: { ipHmac: 'abc', userAgent: 'UA de prueba' },
  });
  assert.equal(r, 'OK');
  assert.equal(rpcLlamadas.length, 1);
  const args = rpcLlamadas[0];
  assert.equal(args.p_dar, true);
  assert.equal(args.p_origen, 'SOCIA');
  assert.match(args.p_texto as string, /Pilates Luz/);
  assert.equal(args.p_ip_hmac, 'abc');
  assert.equal(args.p_user_agent, 'UA de prueba');
});

test('retirar consentimiento: no compone texto (va null) y el origen puede ser BAJA_EMAIL', async () => {
  const { admin, rpcLlamadas } = fakeAdmin();
  const r = await registrarConsentimientoMarketingPropio(admin, { studioId: 's1', socioId: 'soc-1', dar: false, origen: 'BAJA_EMAIL' });
  assert.equal(r, 'OK');
  assert.equal(rpcLlamadas[0].p_dar, false);
  assert.equal(rpcLlamadas[0].p_texto, null);
  assert.equal(rpcLlamadas[0].p_origen, 'BAJA_EMAIL');
});

test('propaga YA_CONSTABA y SOCIA_NO_ENCONTRADA tal cual los devuelve la RPC', async () => {
  const { admin: yaConstaba } = fakeAdmin({ rpcResultado: 'YA_CONSTABA' });
  assert.equal(await registrarConsentimientoMarketingPropio(yaConstaba, { studioId: 's1', socioId: 'soc-1', dar: true, origen: 'SOCIA' }), 'YA_CONSTABA');
  const { admin: noEncontrada } = fakeAdmin({ rpcResultado: 'SOCIA_NO_ENCONTRADA' });
  assert.equal(await registrarConsentimientoMarketingPropio(noEncontrada, { studioId: 's1', socioId: 'no-existe', dar: true, origen: 'SOCIA' }), 'SOCIA_NO_ENCONTRADA');
});

test('vigencia: solo cuenta si el texto guardado coincide EXACTO con el actual', async () => {
  const { admin: vigente } = fakeAdmin({ nombreEstudio: 'Pilates Luz', textoActual: await textoConsentimientoVigente(fakeAdmin({ nombreEstudio: 'Pilates Luz' }).admin, 's1') });
  assert.equal(await consentimientoMarketingVigente(vigente, 's1', 'soc-1'), true);
  const { admin: antiguo } = fakeAdmin({ nombreEstudio: 'Pilates Luz', textoActual: 'Un texto de una versión anterior' });
  assert.equal(await consentimientoMarketingVigente(antiguo, 's1', 'soc-1'), false);
  const { admin: sinNada } = fakeAdmin({ nombreEstudio: 'Pilates Luz', textoActual: null });
  assert.equal(await consentimientoMarketingVigente(sinNada, 's1', 'soc-1'), false);
});
