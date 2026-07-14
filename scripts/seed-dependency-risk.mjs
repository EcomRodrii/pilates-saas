#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Seed de datos de prueba para "Riesgo de concentración por instructor".
//
// Crea 3 instructores con niveles de concentración distintos (ALTO / MEDIO /
// BAJO) + socias, sesiones, asistencias (reservas ASISTIDA) y recibos cobrados,
// todo dentro de la ventana de análisis, para poder ver el widget con datos.
//
// USO:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/seed-dependency-risk.mjs <studioId> [--clean]
//
// Todas las filas llevan ids con prefijo `seed-dep-` para poder limpiarlas.
// `--clean` borra el seed (y sale) sin insertar. El script vuelve a limpiar
// antes de insertar, así que es idempotente.
//
// NO se ejecuta solo: hay que lanzarlo a mano contra el estudio que elijas.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const studioId = process.argv[2];
const cleanOnly = process.argv.includes('--clean');

if (!URL || !KEY) {
  console.error('Falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  process.exit(1);
}
if (!studioId) {
  console.error('Uso: node scripts/seed-dependency-risk.mjs <studioId> [--clean]');
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

const P = 'seed-dep-';
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const iso = (d) => d.toISOString();
const dateOnly = (d) => d.toISOString().slice(0, 10);

// Grupos: cada socia "cautiva" asiste SOLO a su instructor; las "flotantes"
// reparten asistencias entre los tres (no cautivas) y diluyen el denominador.
// Cifras elegidas para caer en ALTO (~36%), MEDIO (~17%) y BAJO (~9%).
const INSTRUCTORES = [
  { key: 'A', nombre: 'Lucía (riesgo alto)',  color: '#DC2626' },
  { key: 'B', nombre: 'Marta (riesgo medio)', color: '#D97706' },
  { key: 'C', nombre: 'Elena (riesgo bajo)',  color: '#059669' },
];
const CAUTIVAS = [
  { grupo: 'A', n: 5, gasto: 220 },
  { grupo: 'B', n: 4, gasto: 130 },
  { grupo: 'C', n: 3, gasto: 90 },
];
const FLOTANTES = { n: 6, gasto: 200 };

async function clean() {
  // Orden seguro por FKs.
  for (const t of ['reservas', 'recibos', 'instructor_dependency_snapshots', 'sesiones', 'socios', 'instructores']) {
    const { error } = await db.from(t).delete().eq('studio_id', studioId).like('id', `${P}%`);
    if (error) console.error(`clean ${t}:`, error.message);
  }
}

async function insertAll(rows, table) {
  if (!rows.length) return;
  const { error } = await db.from(table).insert(rows);
  if (error) throw new Error(`insert ${table}: ${error.message}`);
}

async function main() {
  console.log(`Limpiando seed anterior en estudio ${studioId}…`);
  await clean();
  if (cleanOnly) { console.log('Hecho (--clean).'); return; }

  const instructores = INSTRUCTORES.map(i => ({
    id: `${P}ins-${i.key}`, studio_id: studioId, nombre: i.nombre, color: i.color, activo: true, rol: 'INSTRUCTOR',
  }));
  const insId = (k) => `${P}ins-${k}`;

  // 6 sesiones por instructor repartidas en los últimos 60 días.
  const sesiones = [];
  for (const i of INSTRUCTORES) {
    for (let s = 0; s < 6; s++) {
      const inicio = daysAgo(5 + s * 9);
      const fin = new Date(inicio.getTime() + 60 * 60000);
      sesiones.push({
        id: `${P}ses-${i.key}-${s}`, studio_id: studioId, instructor_id: insId(i.key),
        inicio: iso(inicio), fin: iso(fin), aforo_maximo: 12, cancelada: false,
      });
    }
  }
  const sesionesDe = (k) => sesiones.filter(x => x.instructor_id === insId(k)).map(x => x.id);

  const socios = [], reservas = [], recibos = [];
  let sc = 0;
  const addSocia = (nombre, gasto) => {
    const id = `${P}soc-${sc++}`;
    socios.push({
      id, studio_id: studioId, nombre, apellidos: 'Prueba',
      email: `${id}@example.com`, activo: true, campos_extra: {},
    });
    recibos.push({
      id: `${P}rec-${id}`, studio_id: studioId, socio_id: id,
      concepto: 'Cuota (seed)', importe: gasto, estado: 'COBRADO',
      fecha_vencimiento: dateOnly(daysAgo(30)), fecha_cobro: dateOnly(daysAgo(30)),
    });
    return id;
  };
  const asistir = (socioId, sesionId, idx) => reservas.push({
    id: `${P}res-${socioId}-${idx}`, studio_id: studioId, sesion_id: sesionId, socio_id: socioId, estado: 'ASISTIDA',
  });

  // Cautivas: 4 asistencias, todas con su instructor.
  for (const g of CAUTIVAS) {
    const ses = sesionesDe(g.grupo);
    for (let k = 0; k < g.n; k++) {
      const socioId = addSocia(`Cautiva ${g.grupo}${k + 1}`, g.gasto);
      for (let a = 0; a < 4; a++) asistir(socioId, ses[a % ses.length], a);
    }
  }
  // Flotantes: 6 asistencias repartidas entre A/B/C (máx 33% con cada uno → no cautivas).
  for (let k = 0; k < FLOTANTES.n; k++) {
    const socioId = addSocia(`Flotante ${k + 1}`, FLOTANTES.gasto);
    let a = 0;
    for (const grupo of ['A', 'B', 'C']) {
      const ses = sesionesDe(grupo);
      asistir(socioId, ses[k % ses.length], a++);
      asistir(socioId, ses[(k + 1) % ses.length], a++);
    }
  }

  console.log(`Insertando: ${instructores.length} instructores, ${sesiones.length} sesiones, ${socios.length} socias, ${reservas.length} asistencias, ${recibos.length} recibos…`);
  await insertAll(instructores, 'instructores');
  await insertAll(sesiones, 'sesiones');
  await insertAll(socios, 'socios');
  await insertAll(recibos, 'recibos');
  await insertAll(reservas, 'reservas');

  const total = [...CAUTIVAS.map(g => g.n * g.gasto), FLOTANTES.n * FLOTANTES.gasto].reduce((a, b) => a + b, 0);
  console.log('\nHecho. Facturación total del seed:', total, '€');
  console.log('Esperado: A ≈', ((CAUTIVAS[0].n * CAUTIVAS[0].gasto / total) * 100).toFixed(1) + '% (ALTO),',
    'B ≈', ((CAUTIVAS[1].n * CAUTIVAS[1].gasto / total) * 100).toFixed(1) + '% (MEDIO),',
    'C ≈', ((CAUTIVAS[2].n * CAUTIVAS[2].gasto / total) * 100).toFixed(1) + '% (BAJO).');
  console.log('Ahora pulsa «Recalcular» en el dashboard (o llama al cron / endpoint recalcular).');
}

main().catch(e => { console.error(e); process.exit(1); });
