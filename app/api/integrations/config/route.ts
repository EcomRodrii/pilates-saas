import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { dbGetIntegracionConfig, dbGuardarIntegracion } from '@/lib/db/supabase-data-admin';
import type { TipoIntegracion } from '@/lib/types';

// Las credenciales de UNA integración, solo cuando de verdad hacen falta.
//
// Antes viajaban en el arranque del panel: `integraciones` se cargaba con
// `select('*')`, así que el token de WhatsApp y la clave de Kisi llegaban al
// navegador en CADA carga, aunque la única pantalla que los necesita es el
// modal de edición de Configuración → Integraciones, que casi nadie abre.
//
// No era una fuga —la RLS (`owner_integraciones_lectura`) solo se los da a la
// PROPIETARIA de ese estudio, y es su propio secreto— pero un secreto que no
// se manda es un secreto que no puede acabar en un volcado de estado, en una
// traza de error del cliente ni en la memoria de una pestaña abierta todo el
// día en el iPad de recepción. Se pide aquí, al abrir el modal, y solo eso.
//
// Mismo límite que la RLS y que el resto de endpoints de integraciones:
// PROPIETARIO. Aquí importa más que en ninguno — esto DEVUELVE el secreto,
// mientras que `probar` solo lo usa por dentro.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede ver las credenciales' }, { status: 403 });
  }

  const tipo = req.nextUrl.searchParams.get('tipo');
  if (!tipo) return NextResponse.json({ error: 'Falta el tipo de integración' }, { status: 400 });

  // `studioId` SIEMPRE de la sesión, nunca de la query: si viniera de fuera,
  // esto sería un lector de credenciales de cualquier estudio.
  const intg = await dbGetIntegracionConfig(sesion.studioId, tipo as TipoIntegracion);
  // Sin fila configurada no es un error: es una integración que aún no existe,
  // y el modal la abre en blanco igual que siempre.
  const config = intg?.config ?? {};
  // Una conexión de WhatsApp hecha por Embedded Signup (marcada por llevar
  // `wabaId`, que el flujo manual nunca rellena) no tiene ningún formulario
  // que necesite el token para rellenarse — a diferencia del flujo manual,
  // donde la propietaria sí lo ve para poder editarlo. No exponerlo al
  // navegador cuando no hace falta, aunque la RLS ya lo protege.
  if (tipo === 'WHATSAPP' && config.wabaId) {
    const { token: _token, ...resto } = config;
    return NextResponse.json({ config: resto });
  }
  return NextResponse.json({ config });
}

// Las integraciones que se configuran pegando datos en Configuración. Las de
// OAuth (Gmail, Calendar, Zoom, Klaviyo) guardan lo suyo en su callback, y
// WhatsApp por Embedded Signup en su propia ruta.
const TIPOS_CON_CAMPOS: readonly TipoIntegracion[] = ['RESEND', 'WHATSAPP', 'KISI', 'MAILCHIMP'];
const CAMPO = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;

function configValida(config: unknown): config is Record<string, string> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
  const entradas = Object.entries(config);
  return entradas.length <= 30 && entradas.every(([k, v]) => CAMPO.test(k) && typeof v === 'string' && v.length <= 4000);
}

// Guardar la config de una integración. Antes la escribía el navegador directo
// contra la tabla; ahora pasa por aquí para que los secretos (token, clave API)
// se guarden cifrados — la clave de cifrado no sale nunca del servidor.
// Mismo límite que leerla: PROPIETARIO, y `studioId` de la sesión.
export async function PUT(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede cambiar las integraciones' }, { status: 403 });
  }
  const cuerpo = await req.json().catch(() => null) as
    { tipo?: unknown; activo?: unknown; config?: unknown; reiniciarSalud?: unknown } | null;
  const tipo = cuerpo?.tipo as TipoIntegracion | undefined;
  if (!tipo || !TIPOS_CON_CAMPOS.includes(tipo) || typeof cuerpo?.activo !== 'boolean' || !configValida(cuerpo.config)) {
    return NextResponse.json({ error: 'Datos de la integración no válidos' }, { status: 400 });
  }
  const r = await dbGuardarIntegracion(sesion.studioId, {
    tipo, activo: cuerpo.activo, config: cuerpo.config, reiniciarSalud: cuerpo.reiniciarSalud === true,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.conflict ? 409 : 500 });
  return NextResponse.json({ ok: true });
}
