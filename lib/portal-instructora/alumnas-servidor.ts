import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { filasDeSociaConInstructora } from '@/lib/datos-salud/acceso-servidor';
import {
  VENTANA_ALUMNA_DIAS, instructoraAtiendeSocia, type ClaseOCitaDeSocia,
} from '@/lib/datos-salud/acceso-instructora';
import { fechaEnZona, horaEnZona, nombresParaLista } from '@/lib/student/agenda-instructora';
import {
  estadoClaseAlumna, ordenarAlumnas, repartirClases,
  type AlumnaResumen, type ClaseConAlumna, type FichaAlumna,
} from '@/lib/student/alumnas-instructora';

// «Tus alumnas» de la instructora en la app del estudio. SOLO lectura.
//
// «Su alumna» = `instructoraAtiendeSocia` (reserva no cancelada en una clase suya
// no cancelada, o cita con ella, entre hace 30 días y dentro de 30), la MISMA
// regla que la RLS de salud (`instructora_atiende_socia()`, migr 20260913214116).
// La ficha la comprueba con `filasDeSociaConInstructora`, el mismo helper que ya
// usan las rutas de salud; la lista la aplica por lotes con las mismas filas.
//
// ⚠️ Service-role: la RLS no actúa. Todo va acotado a `studio_id` +
// `instructor_id` del token. Una socia que no es suya responde igual que una
// que no existe. De la socia sale lo mínimo (decisión del 14-sep-2026): nombre e
// inicial del apellido, foto, sus clases con ESTA instructora y si es su primera
// clase en el estudio. Nada de contacto, pagos, bonos, contrato ni salud (la
// salud llega aparte, con consentimiento y registro de lectura).

const DIA_MS = 86_400_000;
const MAX_ALUMNAS = 300;
/**
 * Sesiones por consulta de reservas. PostgREST corta en 1000 filas y un `.in()`
 * con cientos de ids alarga la URL: de 40 en 40 (40 × aforo) queda lejos de los dos.
 */
const TROZO_SESIONES = 40;

function enTrozos<T>(lista: readonly T[], tamano: number): T[][] {
  const trozos: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) trozos.push(lista.slice(i, i + tamano));
  return trozos;
}

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;
interface FilaSesion { id: string; inicio: string; cancelada: boolean | null; tipo_clase_id: string | null }
interface FilaSocia { id: string; nombre: string | null; apellidos: string | null; foto_url: string | null }

function adminOLanza(): Admin {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  return admin;
}

function ventana(ahora: Date): { desde: string; hasta: string } {
  return {
    desde: new Date(ahora.getTime() - VENTANA_ALUMNA_DIAS * DIA_MS).toISOString(),
    hasta: new Date(ahora.getTime() + VENTANA_ALUMNA_DIAS * DIA_MS).toISOString(),
  };
}

async function sesionesSuyasEnVentana(admin: Admin, studioId: string, instructorId: string, ahora: Date): Promise<FilaSesion[]> {
  const { desde, hasta } = ventana(ahora);
  const { data, error } = await admin.from('sesiones').select('id, inicio, cancelada, tipo_clase_id')
    .eq('studio_id', studioId).eq('instructor_id', instructorId)
    .gte('inicio', desde).lte('inicio', hasta)
    .order('inicio', { ascending: true }).limit(1000);
  if (error) throw error;
  return (data ?? []) as FilaSesion[];
}

async function nombresDeTipos(admin: Admin, studioId: string, sesiones: readonly FilaSesion[]): Promise<Map<string, string>> {
  const ids = [...new Set(sesiones.map((s) => s.tipo_clase_id).filter((x): x is string => !!x))];
  if (!ids.length) return new Map();
  const { data, error } = await admin.from('tipos_clase').select('id, nombre').eq('studio_id', studioId).in('id', ids);
  if (error) throw error;
  return new Map(((data ?? []) as Array<{ id: string; nombre: string }>).map((t) => [t.id, t.nombre]));
}

/** ¿Ha venido alguna vez a una clase del estudio? Una consulta acotada a una fila. */
async function haVenidoAlgunaVez(admin: Admin, studioId: string, socioId: string): Promise<boolean> {
  const { data, error } = await admin.from('reservas').select('id')
    .eq('studio_id', studioId).eq('socio_id', socioId).eq('estado', 'ASISTIDA').limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

function claseDe(s: FilaSesion, estadoReserva: string, tipos: Map<string, string>, ahoraMs: number): ClaseConAlumna | null {
  if (s.cancelada === true) return null;
  const estado = estadoClaseAlumna(estadoReserva, s.inicio, ahoraMs);
  if (!estado) return null;
  return {
    sesionId: s.id,
    inicio: s.inicio,
    fecha: fechaEnZona(s.inicio),
    hora: horaEnZona(s.inicio),
    tipo: (s.tipo_clase_id && tipos.get(s.tipo_clase_id)) || 'Clase',
    estado,
  };
}

export async function alumnasDeInstructora(
  p: { studioId: string; instructorId: string },
  ahora: Date = new Date(),
): Promise<AlumnaResumen[]> {
  const admin = adminOLanza();
  const { desde, hasta } = ventana(ahora);
  const ahoraMs = ahora.getTime();

  const [sesiones, citas] = await Promise.all([
    sesionesSuyasEnVentana(admin, p.studioId, p.instructorId, ahora),
    admin.from('citas').select('socio_id, inicio, estado, instructor_id')
      .eq('studio_id', p.studioId).eq('instructor_id', p.instructorId)
      .gte('inicio', desde).lte('inicio', hasta).limit(1000),
  ]);
  if (citas.error) throw citas.error;

  const sesionPorId = new Map(sesiones.map((s) => [s.id, s]));
  const filasDe = new Map<string, ClaseOCitaDeSocia[]>();
  const reservasDe = new Map<string, Array<{ sesion: FilaSesion; estado: string }>>();
  const anadir = <T>(mapa: Map<string, T[]>, clave: string, valor: T) => mapa.set(clave, [...(mapa.get(clave) ?? []), valor]);

  for (const trozo of enTrozos(sesiones.map((s) => s.id), TROZO_SESIONES)) {
    const { data, error } = await admin.from('reservas').select('socio_id, sesion_id, estado')
      .eq('studio_id', p.studioId).in('sesion_id', trozo);
    if (error) throw error;
    for (const r of (data ?? []) as Array<{ socio_id: string; sesion_id: string; estado: string }>) {
      const s = sesionPorId.get(r.sesion_id);
      if (!s) continue;
      anadir(filasDe, r.socio_id, { inicio: s.inicio, estado: r.estado, instructorId: p.instructorId, cancelada: s.cancelada });
      anadir(reservasDe, r.socio_id, { sesion: s, estado: r.estado });
    }
  }
  for (const c of (citas.data ?? []) as Array<{ socio_id: string | null; inicio: string; estado: string; instructor_id: string | null }>) {
    if (!c.socio_id) continue;
    anadir(filasDe, c.socio_id, { inicio: c.inicio, estado: c.estado, instructorId: c.instructor_id });
  }

  // La MISMA regla que la salud, socia por socia.
  // Si hubiera más de MAX_ALUMNAS, se quedan las que vienen antes (orden estable),
  // no unas cualquiera.
  const proximoInicio = (id: string) => Math.min(
    ...(reservasDe.get(id) ?? [])
      .filter((r) => r.sesion.cancelada !== true && r.estado !== 'CANCELADA' && Date.parse(r.sesion.inicio) > ahoraMs)
      .map((r) => Date.parse(r.sesion.inicio)),
    Number.POSITIVE_INFINITY,
  );
  const ids = [...filasDe.entries()]
    .filter(([, filas]) => instructoraAtiendeSocia(filas, p.instructorId, ahora))
    .map(([id]) => id)
    .sort((a, b) => (proximoInicio(a) - proximoInicio(b)) || a.localeCompare(b))
    .slice(0, MAX_ALUMNAS);
  if (!ids.length) return [];

  const [socios, tipos] = await Promise.all([
    admin.from('socios').select('id, nombre, apellidos, foto_url')
      .eq('studio_id', p.studioId).in('id', ids).is('borrado_en', null),
    nombresDeTipos(admin, p.studioId, sesiones),
  ]);
  if (socios.error) throw socios.error;
  const filasSocias = (socios.data ?? []) as FilaSocia[];
  // Nombre corto persona a persona, igual que en su ficha: en una lista larga dos
  // «Laura M.» coinciden a menudo, y sacar ahí el apellido entero sería dar de más.
  const nombres = filasSocias.map((s) => nombresParaLista([{ nombre: s.nombre, apellidos: s.apellidos }])[0]);
  // De 10 en 10: una consulta acotada por alumna, pero nunca cientos a la vez.
  const vinieron: boolean[] = [];
  for (const trozo of enTrozos(filasSocias, 10)) {
    vinieron.push(...await Promise.all(trozo.map((s) => haVenidoAlgunaVez(admin, p.studioId, s.id))));
  }

  return ordenarAlumnas(filasSocias.map((s, i) => {
    const clases = (reservasDe.get(s.id) ?? [])
      .map((r) => claseDe(r.sesion, r.estado, tipos, ahoraMs))
      .filter((c): c is ClaseConAlumna => c !== null);
    return {
      socioId: s.id,
      nombre: nombres[i],
      fotoUrl: s.foto_url ?? null,
      primeraClase: !vinieron[i],
      proxima: repartirClases(clases, ahoraMs).proximas[0] ?? null,
    };
  }));
}

/** La ficha de una alumna suya, o `null` si no existe o no es su alumna (sin decir cuál). */
export async function fichaDeAlumna(
  p: { studioId: string; instructorId: string; socioId: string },
  ahora: Date = new Date(),
): Promise<FichaAlumna | null> {
  const admin = adminOLanza();
  const filas = await filasDeSociaConInstructora(admin, p.studioId, p.instructorId, p.socioId, ahora);
  // `null` = no se pudo comprobar: nunca se lee como «sí».
  if (filas === null) throw new Error('No se ha podido comprobar si es su alumna');
  if (!instructoraAtiendeSocia(filas, p.instructorId, ahora)) return null;

  const { data: socio, error } = await admin.from('socios').select('id, nombre, apellidos, foto_url')
    .eq('id', p.socioId).eq('studio_id', p.studioId).is('borrado_en', null).maybeSingle();
  if (error) throw error;
  if (!socio) return null;
  const fila = socio as FilaSocia;

  const sesiones = await sesionesSuyasEnVentana(admin, p.studioId, p.instructorId, ahora);
  const sesionPorId = new Map(sesiones.map((s) => [s.id, s]));
  let reservas: Array<{ sesion_id: string; estado: string }> = [];
  if (sesiones.length) {
    const { data, error: eRes } = await admin.from('reservas').select('sesion_id, estado')
      .eq('studio_id', p.studioId).eq('socio_id', p.socioId).in('sesion_id', sesiones.map((s) => s.id));
    if (eRes) throw eRes;
    reservas = (data ?? []) as Array<{ sesion_id: string; estado: string }>;
  }
  const [tipos, vino] = await Promise.all([
    nombresDeTipos(admin, p.studioId, sesiones),
    haVenidoAlgunaVez(admin, p.studioId, p.socioId),
  ]);

  const ahoraMs = ahora.getTime();
  const clases = reservas
    .map((r) => {
      const s = sesionPorId.get(r.sesion_id);
      return s ? claseDe(s, r.estado, tipos, ahoraMs) : null;
    })
    .filter((c): c is ClaseConAlumna => c !== null);
  const { proximas, pasadas } = repartirClases(clases, ahoraMs);

  return {
    socioId: fila.id,
    nombre: nombresParaLista([{ nombre: fila.nombre, apellidos: fila.apellidos }])[0],
    fotoUrl: fila.foto_url ?? null,
    primeraClase: !vino,
    proximas,
    pasadas,
  };
}
