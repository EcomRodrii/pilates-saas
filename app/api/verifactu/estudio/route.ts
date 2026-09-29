import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { clientIp } from '@/lib/rate-limit-core';
import { errorInterno } from '@/lib/errores-servidor';
import {
  estadoAltaPropietaria, configurarDatosFiscales, enviarAutorizacion, revocarAutorizacion, AltaVerifactuError,
} from '@/lib/verifactu/estudio-servidor';
import type { AutorizacionEntrante, TipoEmisor } from '@/lib/verifactu/apoderamiento';

export const dynamic = 'force-dynamic';

// El alta Veri*Factu de un estudio, lado propietaria.
//
// SOLO la propietaria: es ella (la obligada tributaria, o su representante legal)
// quien otorga el poder en la AEAT y quien responde de los datos. Ni gerencia ni
// recepción.
//
// ⚠️ Aquí NUNCA llegan credenciales del estudio: el poder se otorga en la sede de
// la AEAT con su certificado o Cl@ve. Lo único que se recibe es la evidencia (el
// CSV que da la sede, fechas, quién lo otorgó) y la aceptación del mandato.

async function contexto(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  if (sesion.rol !== 'PROPIETARIO') {
    return { error: NextResponse.json({ error: 'Solo la propietaria da de alta el envío a la AEAT.' }, { status: 403 }) };
  }
  const admin = getSupabaseAdmin();
  if (!admin) return { error: NextResponse.json({ error: 'Servidor sin service-role configurada' }, { status: 503 }) };
  return { sesion, admin };
}

export async function GET(req: NextRequest) {
  const c = await contexto(req);
  if ('error' in c) return c.error;
  try {
    return NextResponse.json(await estadoAltaPropietaria(c.admin, c.sesion.studioId), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorInterno('verifactu/estudio:GET', err, 'No se ha podido leer el estado del envío a la AEAT.');
  }
}

export async function POST(req: NextRequest) {
  const c = await contexto(req);
  if ('error' in c) return c.error;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const actor = { userId: c.sesion.userId, ip: clientIp(req), userAgent: req.headers.get('user-agent') };
  try {
    switch (body?.accion) {
      case 'configurar':
        await configurarDatosFiscales(c.admin, c.sesion.studioId, {
          nombreFiscal: String(body.nombreFiscal ?? ''),
          tipoEmisor: String(body.tipoEmisor ?? '') as TipoEmisor,
        }, actor);
        break;
      case 'autorizar': {
        const o = (body.otorgante ?? {}) as Record<string, unknown>;
        const a: AutorizacionEntrante = {
          csv: String(body.csv ?? ''),
          otorgadoEn: String(body.otorgadoEn ?? ''),
          vigenteHasta: String(body.vigenteHasta ?? ''),
          tramite: body.tramite === 'GENERAL_46_2' ? 'GENERAL_46_2' : 'IZ860',
          otorgante: { nombre: String(o.nombre ?? ''), nif: String(o.nif ?? ''), cargo: String(o.cargo ?? '') as AutorizacionEntrante['otorgante']['cargo'] },
          aceptaMandato: body.aceptaMandato === true,
          mandatoVersion: String(body.mandatoVersion ?? ''),
        };
        await enviarAutorizacion(c.admin, c.sesion.studioId, a, actor);
        break;
      }
      case 'revocar':
        await revocarAutorizacion(c.admin, c.sesion.studioId, actor);
        break;
      default:
        return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 });
    }
    return NextResponse.json(await estadoAltaPropietaria(c.admin, c.sesion.studioId));
  } catch (err) {
    if (err instanceof AltaVerifactuError) return NextResponse.json({ error: err.message, errores: err.errores }, { status: err.status });
    return errorInterno('verifactu/estudio:POST', err, 'No se ha podido guardar.');
  }
}
