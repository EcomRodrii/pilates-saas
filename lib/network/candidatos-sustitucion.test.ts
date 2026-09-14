import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { franjasDe, refrescarCandidatosNetwork } from './candidatos-sustitucion.ts';

// ── refrescarCandidatosNetwork, con un admin falso que aplica los filtros ────
// Los filtros se aplican de verdad sobre las filas: si la función se olvidara
// del `studio_id` al guardar, tocaría la sustitución de otro estudio y el test
// lo vería en los datos, no solo en la lista de llamadas.

type Fila = Record<string, unknown>;
type Filtro = ['eq' | 'in' | 'contains' | 'overlaps', string, unknown];
interface Llamada { tabla: string; op: 'select' | 'update' | 'insert' | 'upsert' | 'delete'; filtros: Filtro[]; valores?: Fila; limite?: number }

function fakeAdmin(bd: Record<string, Fila[]>, opciones: { errorEn?: string } = {}) {
  const llamadas: Llamada[] = [];
  const rpcs: string[] = [];
  const cumple = (f: Fila, [op, k, v]: Filtro) => {
    const val = f[k];
    if (op === 'eq') return val === v;
    if (op === 'in') return (v as unknown[]).includes(val);
    if (op === 'contains') return (v as unknown[]).every(x => ((val as unknown[]) ?? []).includes(x));
    return (v as unknown[]).some(x => ((val as unknown[]) ?? []).includes(x));
  };
  const admin = {
    from(tabla: string) {
      const ll: Llamada = { tabla, op: 'select', filtros: [] };
      llamadas.push(ll);
      const ejecutar = () => {
        if (opciones.errorEn === tabla) return { data: null, error: { message: 'boom' } };
        const filas = (bd[tabla] ?? []).filter(f => ll.filtros.every(fl => cumple(f, fl)));
        if (ll.op === 'update') {
          for (const f of filas) Object.assign(f, ll.valores);
          return { data: filas.map(f => ({ id: f.id })), error: null };
        }
        if (ll.op !== 'select') return { data: null, error: null };
        return { data: ll.limite ? filas.slice(0, ll.limite) : filas, error: null };
      };
      const c = {
        select() { return c; },
        update(v: Fila) { ll.op = 'update'; ll.valores = v; return c; },
        insert(v: Fila) { ll.op = 'insert'; ll.valores = v; return c; },
        upsert(v: Fila) { ll.op = 'upsert'; ll.valores = v; return c; },
        delete() { ll.op = 'delete'; return c; },
        eq(k: string, v: unknown) { ll.filtros.push(['eq', k, v]); return c; },
        in(k: string, v: unknown) { ll.filtros.push(['in', k, v]); return c; },
        contains(k: string, v: unknown) { ll.filtros.push(['contains', k, v]); return c; },
        overlaps(k: string, v: unknown) { ll.filtros.push(['overlaps', k, v]); return c; },
        limit(n: number) { ll.limite = n; return c; },
        maybeSingle() {
          const r = ejecutar();
          return Promise.resolve({ data: (r.data as Fila[] | null)?.[0] ?? null, error: r.error });
        },
        then<T>(ok: (r: ReturnType<typeof ejecutar>) => T, ko?: (e: unknown) => T) {
          return Promise.resolve(ejecutar()).then(ok, ko);
        },
      };
      return c;
    },
    rpc(nombre: string) { rpcs.push(nombre); return Promise.resolve({ data: null, error: null }); },
  };
  return { admin: admin as never, llamadas, rpcs };
}

const perfil = (id: string, authUserId: string, extra: Fila = {}): Fila => ({
  id, slug: `slug-${id}`, nombre: `Nombre ${id}`, foto_url: null, ciudad: 'Ciudad Ejemplo',
  auth_user_id: authUserId, estado: 'published', disponibilidad_estado: 'disponible',
  especialidades: ['reformer'], disponibilidad_horarios: ['mananas'], ...extra,
});

function bdBase(): Record<string, Fila[]> {
  const viejo = [{ perfilId: 'viejo', slug: null, nombre: 'Viejo', fotoUrl: null, ciudad: null }];
  return {
    sustituciones: [
      { id: 'sust-a', studio_id: 'studio-a', sesion_id: 'ses-a', candidatos_network: viejo },
      { id: 'sust-a2', studio_id: 'studio-a', sesion_id: 'ses-a', candidatos_network: viejo },
      { id: 'sust-b', studio_id: 'studio-b', sesion_id: 'ses-b', candidatos_network: viejo },
    ],
    // 2026-08-18 martes 09:00 en Madrid → franja 'mananas'.
    sesiones: [
      { id: 'ses-a', studio_id: 'studio-a', inicio: '2026-08-18T09:00:00+02:00', tipo_clase_id: 'tc-reformer' },
      { id: 'ses-b', studio_id: 'studio-b', inicio: '2026-08-18T09:00:00+02:00', tipo_clase_id: 'tc-reformer' },
    ],
    tipos_clase: [
      { id: 'tc-reformer', studio_id: 'studio-a', especialidad_network: 'reformer' },
      { id: 'tc-sin-mapear', studio_id: 'studio-a', especialidad_network: null },
    ],
    studios: [
      { id: 'studio-a', ciudad: 'Ciudad Ejemplo' },
      { id: 'studio-b', ciudad: 'Ciudad Ejemplo' },
    ],
    red_perfiles: [
      perfil('p-activa-aqui', 'u-activa-aqui'),
      perfil('p-otra-sede', 'u-otra-sede'),
      perfil('p-de-baja-aqui', 'u-de-baja-aqui'),
      perfil('p-activo-null', 'u-activo-null'),
      perfil('p-libre', 'u-libre'),
      perfil('p-borrador', 'u-borrador', { estado: 'draft' }),
    ],
    instructores: [
      { id: 'i1', studio_id: 'studio-a', auth_user_id: 'u-activa-aqui', activo: true },
      { id: 'i2', studio_id: 'studio-b', auth_user_id: 'u-otra-sede', activo: true },
      { id: 'i3', studio_id: 'studio-a', auth_user_id: 'u-de-baja-aqui', activo: false },
      { id: 'i4', studio_id: 'studio-a', auth_user_id: 'u-activo-null', activo: null },
    ],
  };
}

const idsGuardados = (f: Fila | undefined) =>
  ((f?.candidatos_network as Array<{ perfilId: string }>) ?? []).map(c => c.perfilId);

test('refrescar: guarda solo en ESA sustitución de ESE estudio y devuelve cuántos', async () => {
  const bd = bdBase();
  const { admin, llamadas } = fakeAdmin(bd);
  const n = await refrescarCandidatosNetwork(admin, { sustitucionId: 'sust-a', studioId: 'studio-a' });

  assert.equal(n, 3);
  assert.deepEqual(idsGuardados(bd.sustituciones[0]), ['p-otra-sede', 'p-de-baja-aqui', 'p-libre']);
  assert.deepEqual(idsGuardados(bd.sustituciones[1]), ['viejo'], 'otra sustitución del mismo estudio, intacta');
  assert.deepEqual(idsGuardados(bd.sustituciones[2]), ['viejo'], 'otro estudio, intacto');

  const updates = llamadas.filter(l => l.op === 'update');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].tabla, 'sustituciones');
  assert.deepEqual(Object.keys(updates[0].valores ?? {}), ['candidatos_network']);
  assert.deepEqual(updates[0].filtros, [['eq', 'id', 'sust-a'], ['eq', 'studio_id', 'studio-a']]);
});

test('refrescar: quita a quien YA tiene ficha activa en este estudio (y no a la de otra sede ni a la de baja)', async () => {
  const bd = bdBase();
  const { admin } = fakeAdmin(bd);
  await refrescarCandidatosNetwork(admin, { sustitucionId: 'sust-a', studioId: 'studio-a' });
  const guardados = idsGuardados(bd.sustituciones[0]);
  assert.ok(!guardados.includes('p-activa-aqui'), 'activa en este estudio: ya está en el ranking interno');
  assert.ok(!guardados.includes('p-activo-null'), 'activo NULL cuenta como activa');
  assert.ok(guardados.includes('p-otra-sede'));
  assert.ok(guardados.includes('p-de-baja-aqui'));
  // auth_user_id nunca viaja en la lista que acaba en el JSON del panel.
  for (const c of bd.sustituciones[0].candidatos_network as Fila[]) assert.ok(!('auth_user_id' in c) && !('authUserId' in c));
});

test('refrescar: la sustitución de OTRO estudio no se toca (null, sin update)', async () => {
  const bd = bdBase();
  const { admin, llamadas } = fakeAdmin(bd);
  assert.equal(await refrescarCandidatosNetwork(admin, { sustitucionId: 'sust-b', studioId: 'studio-a' }), null);
  assert.equal(llamadas.filter(l => l.op !== 'select').length, 0);
  assert.deepEqual(idsGuardados(bd.sustituciones[2]), ['viejo']);
});

test('refrescar: nunca contacta — ni red_solicitudes_contacto, ni RPC, ni inserts, ni eventos', async () => {
  const bd = bdBase();
  const { admin, llamadas, rpcs } = fakeAdmin(bd);
  await refrescarCandidatosNetwork(admin, { sustitucionId: 'sust-a', studioId: 'studio-a' });
  const tablas = new Set(llamadas.map(l => l.tabla));
  assert.ok(!tablas.has('red_solicitudes_contacto'));
  assert.ok([...tablas].every(t => ['sustituciones', 'sesiones', 'tipos_clase', 'studios', 'red_perfiles', 'instructores'].includes(t)));
  assert.deepEqual(rpcs, []);
  assert.ok(llamadas.every(l => l.op === 'select' || (l.op === 'update' && l.tabla === 'sustituciones')));
  // Sin eventos ni notificaciones: el módulo no importa nada que los emita.
  // Se miran solo los `import` — los comentarios SÍ nombran esas piezas.
  const fuente = readFileSync(new URL('./candidatos-sustitucion.ts', import.meta.url), 'utf8');
  const imports = fuente.split('\n').filter(l => /^\s*import\s/.test(l)).join('\n');
  assert.doesNotMatch(imports, /inngest|notifications|emit|email|whatsapp/i);
});

test('refrescar: si la búsqueda de perfiles falla, NO borra la lista que había', async () => {
  const bd = bdBase();
  const { admin, llamadas } = fakeAdmin(bd, { errorEn: 'red_perfiles' });
  assert.equal(await refrescarCandidatosNetwork(admin, { sustitucionId: 'sust-a', studioId: 'studio-a' }), null);
  assert.equal(llamadas.filter(l => l.op === 'update').length, 0);
  assert.deepEqual(idsGuardados(bd.sustituciones[0]), ['viejo']);
});

test('refrescar: tipo de clase sin mapear → guarda [] (buscado, no hay nadie) y devuelve 0', async () => {
  const bd = bdBase();
  bd.sesiones[0].tipo_clase_id = 'tc-sin-mapear';
  const { admin, llamadas } = fakeAdmin(bd);
  assert.equal(await refrescarCandidatosNetwork(admin, { sustitucionId: 'sust-a', studioId: 'studio-a' }), 0);
  assert.deepEqual(bd.sustituciones[0].candidatos_network, []);
  assert.ok(!llamadas.some(l => l.tabla === 'red_perfiles'), 'sin mapeo no se busca en Network');
});

// 2026-08-18 es martes, 2026-08-15 es sábado (en Europe/Madrid) — mismos
// días que ya usa el resto de la suite para franjas locales.

test('martes por la mañana → solo mananas', () => {
  assert.deepEqual(franjasDe('2026-08-18T09:00:00+02:00'), ['mananas']);
});

test('martes por la tarde → solo tardes', () => {
  assert.deepEqual(franjasDe('2026-08-18T16:00:00+02:00'), ['tardes']);
});

test('martes por la noche → solo noches', () => {
  assert.deepEqual(franjasDe('2026-08-18T21:00:00+02:00'), ['noches']);
});

test('sábado por la mañana → mananas Y fines_semana, no una sola', () => {
  assert.deepEqual(franjasDe('2026-08-15T09:00:00+02:00'), ['mananas', 'fines_semana']);
});

test('sábado por la noche → noches Y fines_semana', () => {
  assert.deepEqual(franjasDe('2026-08-15T22:00:00+02:00'), ['noches', 'fines_semana']);
});

test('límite de franja: las 14:00 en punto ya cuentan como tardes, no mananas', () => {
  assert.deepEqual(franjasDe('2026-08-18T14:00:00+02:00'), ['tardes']);
});
