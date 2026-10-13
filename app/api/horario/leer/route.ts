import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarSede } from '@/lib/permisos-reglas';
import { enforceRateLimit, topeEstricto } from '@/lib/rate-limit';
import { horarioDesdeImagenEncendido } from '@/lib/interruptor-por-estudio';
import { hoyEnEstudio } from '@/lib/utils';
import { leerHorario, type MedioImagen } from '@/lib/horario-imagen/leer';
import {
  avisosLimpios, filasRevisables, proximoLunes, MAX_BYTES_IMAGEN, MAX_CARACTERES_TEXTO,
  TOPE_LECTURAS_CUENTA_DIA, TOPE_LECTURAS_ESTUDIO_DIA, TOPE_LECTURAS_TOTAL_DIA,
} from '@/lib/horario-imagen/mapeo';

export const dynamic = 'force-dynamic';
// Leer una imagen puede tardar ~30 s; el SDK corta a 45 (sin reintentos).
export const maxDuration = 60;

// P2.1 — `POST /api/horario/leer`: una captura (`imagen`) o un texto (`texto`)
// → la semana leída, para REVISARLA. No escribe nada en la agenda: las clases
// las crea después el importador de siempre (`/api/clases/import`), con lo que
// la propietaria haya dejado en la tabla. La pantalla sabe si está encendido
// por el catálogo de interruptores (`horarioDesdeImagen`), la misma variable.
//
// Puertas, en orden: sesión de staff → rol (propietaria y gerencia) → el
// interruptor (`HORARIO_DESDE_IMAGEN`) → ráfaga → tamaño → entrada válida → TOPE
// DIARIO de lecturas por cuenta, por estudio y total, CERRADO si el contador
// falla (es gasto de IA) →
// el modelo. La primera semana (`desde`) la pone el servidor: el lunes siguiente
// a hoy en Madrid, nunca en el pasado.
//
// ⚠️ Ni la imagen ni el texto se guardan ni se registran; a Sentry, solo cifras.
const MEDIOS: Record<string, MedioImagen> = { 'image/png': 'image/png', 'image/jpeg': 'image/jpeg', 'image/webp': 'image/webp' };

/** Los primeros bytes dicen qué es de verdad, no el `type` que manda el navegador. */
function medioReal(b: Uint8Array): MedioImagen | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarSede(sesion.rol)) return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });
  const studioId = sesion.studioId;
  const encendido = horarioDesdeImagenEncendido(studioId);

  if (!encendido) return NextResponse.json({ error: 'No disponible' }, { status: 404 });

  const limited = await enforceRateLimit(req, 'horario-leer', { max: 5, windowSeconds: 60 }, studioId);
  if (limited) return limited;
  // Antes de leer el cuerpo: lo enorme ni se lee.
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES_IMAGEN + 64 * 1024) {
    return NextResponse.json({ error: 'La imagen pesa demasiado (máximo 3 MB).' }, { status: 413 });
  }

  const form = await req.formData().catch(() => null);
  const imagen = form?.get('imagen');
  const texto = form?.get('texto');
  if (!imagen && !texto) return NextResponse.json({ error: 'Sube una captura o pega el texto del horario.' }, { status: 400 });
  if (imagen && texto) return NextResponse.json({ error: 'Manda una imagen o un texto, no los dos.' }, { status: 400 });

  let entrada: Parameters<typeof leerHorario>[0];
  if (imagen) {
    if (!(imagen instanceof Blob)) return NextResponse.json({ error: 'La imagen no ha llegado bien.' }, { status: 400 });
    if (imagen.size > MAX_BYTES_IMAGEN) return NextResponse.json({ error: 'La imagen pesa demasiado (máximo 3 MB).' }, { status: 413 });
    const bytes = new Uint8Array(await imagen.arrayBuffer());
    const medio = medioReal(bytes);
    if (!medio || !MEDIOS[medio]) {
      return NextResponse.json({ error: 'Solo se leen capturas en PNG, JPG o WebP.' }, { status: 415 });
    }
    entrada = { imagen: { base64: Buffer.from(bytes).toString('base64'), medio } };
  } else {
    const t = typeof texto === 'string' ? texto.trim() : '';
    if (!t) return NextResponse.json({ error: 'El texto está vacío.' }, { status: 400 });
    if (t.length > MAX_CARACTERES_TEXTO) return NextResponse.json({ error: `Como mucho ${MAX_CARACTERES_TEXTO} caracteres.` }, { status: 413 });
    entrada = { texto: t };
  }

  // Tope diario (día de Madrid), por cuenta, por estudio y total. Cerrado si el contador falla.
  const hoy = hoyEnEstudio();
  const porCuenta = await topeEstricto(`horario-leer-cuenta:${sesion.userId}:${hoy}`, { max: TOPE_LECTURAS_CUENTA_DIA, windowSeconds: 36 * 3600 });
  if (!porCuenta.allowed) {
    return NextResponse.json({ error: `Hoy ya has leído ${TOPE_LECTURAS_CUENTA_DIA} horarios. Vuelve mañana, o súbelo en Excel.`, codigo: 'TOPE_DIARIO' }, { status: 429 });
  }
  const porEstudio = await topeEstricto(`horario-leer-dia:${studioId}:${hoy}`, { max: TOPE_LECTURAS_ESTUDIO_DIA, windowSeconds: 36 * 3600 });
  if (!porEstudio.allowed) {
    return NextResponse.json({ error: `Hoy ya se han leído ${TOPE_LECTURAS_ESTUDIO_DIA} horarios en tu estudio. Vuelve mañana, o súbelo en Excel.`, codigo: 'TOPE_DIARIO' }, { status: 429 });
  }
  const total = await topeEstricto(`horario-leer-total:${hoy}`, { max: TOPE_LECTURAS_TOTAL_DIA, windowSeconds: 36 * 3600 });
  if (!total.allowed) {
    Sentry.captureMessage('[horario/leer] tope total del día alcanzado', { level: 'warning', tags: { area: 'horario-imagen' } });
    return NextResponse.json({ error: 'Ahora mismo no podemos leer más horarios. Inténtalo mañana, o súbelo en Excel.', codigo: 'TOPE_DIARIO' }, { status: 429 });
  }

  const r = await leerHorario(entrada);
  if (!r.ok) {
    Sentry.captureMessage('[horario/leer] no se pudo leer', { level: 'warning', tags: { area: 'horario-imagen', motivo: r.motivo } });
    return NextResponse.json({ error: 'No hemos podido leer el horario. Prueba con una captura más nítida, o pega el texto.' }, { status: 422 });
  }
  const { filas, descartadas } = filasRevisables(r.lectura);
  Sentry.addBreadcrumb({ category: 'horario-imagen', message: 'leído', data: { resultado: r.lectura.resultado, filas: filas.length, descartadas, entrada: r.tokens.entrada, salida: r.tokens.salida } });
  return NextResponse.json({
    resultado: r.lectura.resultado,
    filas,
    descartadas,
    avisos: avisosLimpios(r.lectura.avisos),
    desde: proximoLunes(hoy),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
