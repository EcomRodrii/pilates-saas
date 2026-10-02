import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { parseCsv } from '@/lib/csv';
import { decodificarExtracto } from '@/lib/cobros-externos/norma43';
import { detectarFormato, leerFicheroNorma43 } from '@/lib/cobros-externos/lectores';
import { leerTabla, sugerirColumnas, validarColumnas } from '@/lib/cobros-externos/tabla';
import {
  MAX_BYTES_FICHERO, MAX_LINEAS, parsearColumnas, parsearPeticionTabla, plantillaDeCabeceras, type PeticionTabla,
} from '@/lib/cobros-externos/peticiones';
import { importarLote } from '@/lib/cobros-externos/servidor';
import type { ResultadoLectura } from '@/lib/cobros-externos/tipos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ─────────────────────────────────────────────────────────────────────────────
// Subir el extracto del banco (Norma 43), o una exportación en CSV o Excel.
//
//  · Norma 43 y CSV llegan como fichero (multipart) y se leen AQUÍ, con lectores
//    propios y puros. El Excel llega ya en filas desde el navegador: la librería
//    `xlsx` no se ejecuta en el servidor (diseño, sección D).
//  · El fichero NO se guarda: se lee en memoria y se descarta. Queda su huella, el
//    nombre saneado y el resumen.
//  · Un CSV o Excel sin columnas elegidas devuelve sus cabeceras y una propuesta,
//    para que el estudio diga qué columna es cada dato (como al importar clientas).
//  · Ni a los logs ni a Sentry va el contenido de una línea: solo recuentos y códigos.
//
// Solo quien mueve dinero, y el estudio sale SIEMPRE de la sesión.
// ─────────────────────────────────────────────────────────────────────────────

/** Un CSV o Excel ya en filas → movimientos; o la propuesta de columnas si faltan. */
function leerPeticionTabla(t: PeticionTabla):
  | { tipo: 'lectura'; lectura: ResultadoLectura }
  | { tipo: 'columnas'; cabeceras: string[]; sugerencia: ReturnType<typeof sugerirColumnas> }
  | { tipo: 'error'; error: string } {
  if (!t.columnas) return { tipo: 'columnas', cabeceras: t.cabeceras, sugerencia: sugerirColumnas(t.cabeceras) };
  const valida = validarColumnas(t.columnas, t.cabeceras.length);
  if (!valida.ok) return { tipo: 'error', error: valida.error };
  return {
    tipo: 'lectura',
    lectura: leerTabla({ fuente: t.formato, plantilla: plantillaDeCabeceras(t.cabeceras), filas: t.filas, columnas: t.columnas }),
  };
}

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede registrar cobros' }, { status: 403 });
  }
  const limitado = await enforceRateLimit(req, 'cobros-externos-subir', { max: 10, windowSeconds: 60 }, sesion.userId);
  if (limitado) return limitado;

  const largo = Number(req.headers.get('content-length'));
  if (Number.isFinite(largo) && largo > MAX_BYTES_FICHERO + 64 * 1024) {
    return NextResponse.json({ error: 'El fichero pesa más de 4 MB: súbelo por meses.' }, { status: 413 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  let fuente: 'norma43' | 'csv' | 'excel';
  let nombre: string | null = null;
  let lectura: ResultadoLectura;
  const tipo = req.headers.get('content-type') ?? '';

  if (tipo.startsWith('multipart/form-data')) {
    const form = await req.formData().catch(() => null);
    const fichero = form?.get('fichero');
    if (!form || !(fichero instanceof File)) return NextResponse.json({ error: 'Falta el fichero.' }, { status: 400 });
    if (fichero.size === 0) return NextResponse.json({ error: 'El fichero está vacío.' }, { status: 400 });
    if (fichero.size > MAX_BYTES_FICHERO) return NextResponse.json({ error: 'El fichero pesa más de 4 MB: súbelo por meses.' }, { status: 413 });
    nombre = fichero.name || null;
    const texto = decodificarExtracto(new Uint8Array(await fichero.arrayBuffer()));
    if (texto.split(/\r?\n/).length > MAX_LINEAS * 4) {
      return NextResponse.json({ error: 'El fichero tiene demasiadas líneas: súbelo por meses.' }, { status: 413 });
    }

    if (detectarFormato(texto) === 'norma43') {
      fuente = 'norma43';
      const leido = leerFicheroNorma43(texto);
      if (!leido.ok) {
        // Totales que no cuadran, una cuenta sin cerrar, sin fin: el fichero está cortado o
        // mal exportado. Se rechaza ENTERO; se dice en qué líneas, nunca qué ponían.
        return NextResponse.json({
          error: 'El fichero del banco está incompleto o no cuadra. Vuelve a descargarlo de tu banca online.',
          errores: leido.errores.slice(0, 20),
        }, { status: 422 });
      }
      // El mismo tope que un CSV, contado en apuntes (abonos y cargos) y no en líneas:
      // un Norma 43 puede venir sin saltos, en bloques de 80.
      if (leido.lectura.movimientos.length + leido.lectura.cargos > MAX_LINEAS) {
        return NextResponse.json({ error: `El fichero tiene más de ${MAX_LINEAS} apuntes: súbelo por meses.` }, { status: 413 });
      }
      lectura = leido.lectura;
    } else {
      fuente = 'csv';
      const csv = parseCsv(texto);
      const columnasCampo = form.get('columnas');
      let columnas = null;
      if (typeof columnasCampo === 'string' && columnasCampo.trim()) {
        try { columnas = parsearColumnas(JSON.parse(columnasCampo)); } catch { columnas = null; }
        if (!columnas) return NextResponse.json({ error: 'Las columnas elegidas no son válidas.' }, { status: 400 });
      }
      const p = parsearPeticionTabla({ formato: 'csv', nombre, cabeceras: csv.headers, filas: csv.rows, columnas });
      if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 });
      const r = leerPeticionTabla(p.peticion);
      if (r.tipo === 'error') return NextResponse.json({ error: r.error }, { status: 400 });
      if (r.tipo === 'columnas') return NextResponse.json({ necesitaColumnas: true, cabeceras: r.cabeceras, sugerencia: r.sugerencia }, { status: 200 });
      lectura = r.lectura;
    }
  } else {
    const cuerpo = await req.json().catch(() => null);
    const p = parsearPeticionTabla(cuerpo);
    if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 });
    fuente = p.peticion.formato;
    nombre = p.peticion.nombre;
    const r = leerPeticionTabla(p.peticion);
    if (r.tipo === 'error') return NextResponse.json({ error: r.error }, { status: 400 });
    if (r.tipo === 'columnas') return NextResponse.json({ necesitaColumnas: true, cabeceras: r.cabeceras, sugerencia: r.sugerencia }, { status: 200 });
    lectura = r.lectura;
  }

  if (lectura.movimientos.length === 0) {
    return NextResponse.json({
      resumen: { leidos: 0, nuevos: 0, cargos: lectura.cargos, conError: lectura.errores.length },
      errores: lectura.errores.slice(0, 20),
      aviso: 'El fichero no trae ningún ingreso.',
    }, { status: 200 });
  }

  const r = await importarLote(admin, {
    sesion: { userId: sesion.userId, studioId: sesion.studioId, rol: sesion.rol, nombre: sesion.nombre },
    fuente, nombreFichero: nombre, lectura,
  });
  if (!r.ok) {
    Sentry.captureMessage('[cobros-externos] no se ha podido importar un lote', {
      level: 'warning', tags: { area: 'cobros', tipo: 'cobros-externos' },
      extra: { studioId: sesion.studioId, fuente, movimientos: lectura.movimientos.length },
    });
    return NextResponse.json({ error: r.error }, { status: 500 });
  }
  return NextResponse.json({ resumen: r.resumen, errores: lectura.errores.slice(0, 20) }, { status: r.resumen.yaSubido ? 200 : 201 });
}
