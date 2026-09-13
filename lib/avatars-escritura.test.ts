import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  ROLES_ESCRITURA, clasificarRutaAvatar, puedeEscribirRutaAvatar, type Rol, type TipoRutaAvatar,
} from './avatars-escritura.ts';

// ─── Reglas ──────────────────────────────────────────────────────────────────

test('clasificación: el orden de ramas importa (favicon-borrador antes que favicon, claselogo antes que clase)', () => {
  const casos: [string, TipoRutaAvatar][] = [
    ['favicon-borrador-est-1', 'favicon-borrador'], ['favicon-est-1', 'marca'], ['logo-est-1', 'marca'],
    ['bienvenida-est-1', 'marca'], ['admin-est-1', 'admin'], ['portal-est-1-hero', 'portal'],
    ['instructor-ins-1', 'instructor'], ['network-red-1', 'network'], ['claselogo-tc-1', 'claselogo'],
    ['clase-tc-1', 'clase'], ['banner-uuid', 'banner'], ['producto-p-1', 'producto'], ['soc-123', 'socia'],
  ];
  for (const [nombre, tipo] of casos) assert.equal(clasificarRutaAvatar(nombre), tipo, nombre);
});

const base = { esDelEstudio: true, esPropia: false };

test('A25: una INSTRUCTORA ya no escribe marca, foto de propietaria, de compañera ni de socia', () => {
  for (const nombre of ['logo-est-1', 'favicon-borrador-est-1', 'bienvenida-est-1', 'portal-est-1-hero', 'admin-est-1', 'clase-tc-1', 'claselogo-tc-1', 'banner-b', 'producto-p']) {
    assert.equal(puedeEscribirRutaAvatar({ ...base, nombre, rol: 'INSTRUCTOR' }), false, nombre);
  }
  assert.equal(puedeEscribirRutaAvatar({ ...base, nombre: 'instructor-otra', rol: 'INSTRUCTOR', rolFichaInstructora: 'INSTRUCTOR' }), false);
  assert.equal(puedeEscribirRutaAvatar({ ...base, nombre: 'soc-1', rol: 'INSTRUCTOR' }), false);
});

test('la instructora SIGUE pudiendo cambiar su propia foto (tab-perfil de /mi-perfil)', () => {
  assert.equal(puedeEscribirRutaAvatar({ ...base, esPropia: true, nombre: 'instructor-yo', rol: 'INSTRUCTOR' }), true);
});

test('marca y portal: PROPIETARIO y MANAGER sí, RECEPCION no', () => {
  for (const rol of ['PROPIETARIO', 'MANAGER'] as Rol[]) {
    assert.equal(puedeEscribirRutaAvatar({ ...base, nombre: 'logo-est-1', rol }), true, rol);
    assert.equal(puedeEscribirRutaAvatar({ ...base, nombre: 'banner-b', rol }), true, rol);
  }
  assert.equal(puedeEscribirRutaAvatar({ ...base, nombre: 'logo-est-1', rol: 'RECEPCION' }), false);
});

test('admin-<studio> es la foto de la propietaria: solo PROPIETARIO', () => {
  assert.equal(puedeEscribirRutaAvatar({ ...base, nombre: 'admin-est-1', rol: 'PROPIETARIO' }), true);
  assert.equal(puedeEscribirRutaAvatar({ ...base, nombre: 'admin-est-1', rol: 'MANAGER' }), false);
});

test('producto-: quien mueve dinero (PROPIETARIO, RECEPCION), igual que la RLS de productos_pos', () => {
  assert.equal(puedeEscribirRutaAvatar({ ...base, nombre: 'producto-p', rol: 'RECEPCION' }), true);
  assert.equal(puedeEscribirRutaAvatar({ ...base, nombre: 'producto-p', rol: 'MANAGER' }), false);
});

test('instructor-: el manager solo sobre fichas INSTRUCTOR/RECEPCION; la propietaria sobre todas', () => {
  assert.equal(puedeEscribirRutaAvatar({ ...base, nombre: 'instructor-x', rol: 'MANAGER', rolFichaInstructora: 'INSTRUCTOR' }), true);
  assert.equal(puedeEscribirRutaAvatar({ ...base, nombre: 'instructor-x', rol: 'MANAGER', rolFichaInstructora: 'MANAGER' }), false);
  assert.equal(puedeEscribirRutaAvatar({ ...base, nombre: 'instructor-x', rol: 'PROPIETARIO', rolFichaInstructora: 'MANAGER' }), true);
});

test('socia: ella misma (sin rol de staff) o quien gestiona clientas', () => {
  assert.equal(puedeEscribirRutaAvatar({ esDelEstudio: false, esPropia: true, nombre: 'soc-1', rol: null }), true);
  assert.equal(puedeEscribirRutaAvatar({ ...base, nombre: 'soc-1', rol: 'RECEPCION' }), true);
});

test('otro estudio: nunca, con ningún rol', () => {
  for (const rol of ['PROPIETARIO', 'MANAGER', 'RECEPCION', 'INSTRUCTOR'] as Rol[]) {
    assert.equal(puedeEscribirRutaAvatar({ esDelEstudio: false, esPropia: false, nombre: 'logo-otro', rol }), false, rol);
  }
});

test('network-: solo la dueña del perfil, ni la propietaria', () => {
  assert.equal(puedeEscribirRutaAvatar({ ...base, nombre: 'network-red-1', rol: 'PROPIETARIO' }), false);
  assert.equal(puedeEscribirRutaAvatar({ esDelEstudio: false, esPropia: true, nombre: 'network-red-1', rol: null }), true);
});

// ─── Contrato con el SQL ─────────────────────────────────────────────────────
//
// La cerradura real es `public.avatars_path_escribible`. Esta tabla TS no vale
// nada si dice otra cosa que la función: se compara rama a rama, leyendo la
// definición VIGENTE (la última migración que la define), sin comentarios.

const DIR = 'supabase/migrations';

function cuerpoVigente(fn: string): string {
  const ficheros = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();
  const queLaDefinen = ficheros.filter(f => readFileSync(`${DIR}/${f}`, 'utf8').includes(`function public.${fn}(`));
  assert.ok(queLaDefinen.length > 0, `ninguna migración define ${fn}`);
  const sql = readFileSync(`${DIR}/${queLaDefinen[queLaDefinen.length - 1]}`, 'utf8').replace(/--.*$/gm, '');
  const inicio = sql.indexOf(`function public.${fn}(`);
  const abre = sql.indexOf('$function$', inicio);
  const cierra = sql.indexOf('$function$', abre + 10);
  return sql.slice(abre + 10, cierra);
}

/** Ramas `if/elsif p_name like 'x-%'` → prefijos y trozo de cuerpo; la rama `else` como '<socia>'. */
function ramas(cuerpo: string): { prefijos: string[]; trozo: string }[] {
  const re = /\b(?:if|elsif)\s+(p_name like '[a-z-]+-%'(?:\s+or\s+p_name like '[a-z-]+-%')*)\s+then/g;
  const marcas = [...cuerpo.matchAll(re)].map(m => ({
    indice: m.index!, prefijos: [...m[1].matchAll(/'([a-z-]+?)-%'/g)].map(x => x[1]),
  }));
  const iElse = cuerpo.search(/\belse\b/);
  return [
    ...marcas.map((m, i) => ({ prefijos: m.prefijos, trozo: cuerpo.slice(m.indice, i + 1 < marcas.length ? marcas[i + 1].indice : iElse) })),
    { prefijos: ['<socia>'], trozo: cuerpo.slice(iElse) },
  ];
}

const ROLES_DE_HELPER: Record<string, Rol[]> = {
  puede_mover_dinero: ['PROPIETARIO', 'RECEPCION'],
  puede_gestionar_clientas: ['PROPIETARIO', 'MANAGER', 'RECEPCION'],
  puede_gestionar_ficha_instructor: ['PROPIETARIO', 'MANAGER'],
};

function rolesDelTrozo(trozo: string): Rol[] {
  const literales = [...trozo.matchAll(/'(PROPIETARIO|MANAGER|RECEPCION|INSTRUCTOR)'/g)].map(m => m[1] as Rol);
  const deHelpers = Object.entries(ROLES_DE_HELPER).filter(([h]) => trozo.includes(`public.${h}(`)).flatMap(([, r]) => r);
  return [...new Set([...literales, ...deHelpers])].sort();
}

test('contrato: cada rama de avatars_path_escribible exige los mismos roles que ROLES_ESCRITURA', () => {
  const cuerpo = cuerpoVigente('avatars_path_escribible');
  const vistas = ramas(cuerpo);
  assert.ok(vistas.length >= 11, `se esperaban ≥11 ramas, hay ${vistas.length} — ¿cambió la forma del SQL?`);
  for (const { prefijos, trozo } of vistas) {
    for (const prefijo of prefijos) {
      const tipo = clasificarRutaAvatar(prefijo === '<socia>' ? 'soc-1' : `${prefijo}-x`);
      assert.deepEqual(rolesDelTrozo(trozo), [...ROLES_ESCRITURA[tipo]].sort(), `rama ${prefijo} (tipo ${tipo})`);
    }
  }
});

test('contrato: las ramas «propias» comparan con auth.uid() y la de network no mira rol', () => {
  const vistas = ramas(cuerpoVigente('avatars_path_escribible'));
  const de = (p: string) => vistas.find(v => v.prefijos.includes(p))!.trozo;
  assert.match(de('instructor'), /i\.auth_user_id = auth\.uid\(\)/);
  assert.match(de('<socia>'), /so\.auth_user_id = auth\.uid\(\)/);
  assert.match(de('network'), /rp\.auth_user_id = auth\.uid\(\)/);
});

test('contrato: escritura y lectura reconocen exactamente los mismos prefijos', () => {
  const prefijos = (fn: string) => {
    const c = cuerpoVigente(fn);
    return [...new Set([...c.matchAll(/like '([a-z-]+?)-%'/g), ...c.matchAll(/starts_with\(p_name, '([a-z-]+?)-'/g)].map(m => m[1]))].sort();
  };
  assert.deepEqual(prefijos('avatars_path_escribible'), prefijos('avatars_path_autorizado'));
});

test('contrato: el orden de ramas del SQL es el mismo que el del clasificador TS', () => {
  const orden = ramas(cuerpoVigente('avatars_path_escribible')).flatMap(v => v.prefijos).filter(p => p !== '<socia>');
  // Un prefijo que en SQL va DESPUÉS de otro que lo contiene nunca se alcanzaría.
  for (let i = 0; i < orden.length; i++) {
    for (let j = 0; j < i; j++) {
      assert.ok(!`${orden[i]}-`.startsWith(`${orden[j]}-`), `'${orden[i]}-' queda tapado por '${orden[j]}-', que va antes`);
    }
  }
});
