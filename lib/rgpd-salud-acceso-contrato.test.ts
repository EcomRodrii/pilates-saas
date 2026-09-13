import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardianes de contrato — fase 2 de la auditoría RGPD (2026-09-13), salud.
//
//  · Una INSTRUCTORA solo ve y escribe la salud de SUS alumnas; la PROPIETARIA,
//    la de todas. Lo decide `instructora_atiende_socia()` en la RLS de las cinco
//    tablas clínicas y, con service-role, `lib/datos-salud/acceso-servidor.ts`.
//  · El consentimiento de salud se registra y se retira solo en servidor, con
//    texto derivado en servidor, y `authenticated` no puede escribir esas
//    columnas (el grant de `socios` era de TABLA: revocar la columna no bastaba).
//  · Solo la propietaria define campos personalizados, y su copy no invita a
//    meter salud.
//
// Si uno falla, no se arregla quitándolo: se arregla la migración o el código.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');
const DIR = join(RAIZ, 'supabase/migrations');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const sinComentarios = (sql: string) => sql.replace(/--.*$/gm, '');

function migraciones(): { nombre: string; sql: string }[] {
  return readdirSync(DIR).filter(n => n.endsWith('.sql')).sort()
    .map(nombre => ({ nombre, sql: sinComentarios(readFileSync(join(DIR, nombre), 'utf8')) }));
}

function migracion(sufijo: string): string {
  const m = migraciones().find(x => x.nombre.endsWith(sufijo));
  assert.ok(m, `falta la migración *${sufijo}`);
  return m!.sql;
}

const SALUD = migracion('_salud_solo_alumnas_de_la_instructora.sql');
const CONSENTIMIENTO = migracion('_consentimiento_salud_demostrable.sql');
const CAMPOS = migracion('_campos_personalizados_solo_propietaria.sql');

// ─── A16: acceso por alumna asignada ─────────────────────────────────────────

test('instructora_atiende_socia: SECURITY DEFINER, STABLE, search_path fijo y ventana de ±30 días', () => {
  const def = SALUD.match(/create or replace function public\.instructora_atiende_socia\(p_socio_id text\)[\s\S]*?\$function\$;/i)?.[0];
  assert.ok(def, 'no se encontró la definición de instructora_atiende_socia(text)');
  assert.match(def!, /returns boolean/i);
  assert.match(def!, /\bstable\b/i);
  assert.match(def!, /security definer/i);
  assert.match(def!, /set search_path = ''/i);
  assert.match(def!, /current_instructor_id\(\)/);
  assert.match(def!, /current_studio_id\(\)/);
  assert.equal((def!.match(/interval '30 days'/g) ?? []).length, 4, 'reservas y citas, hacia atrás y hacia delante');
  assert.match(def!, /r\.estado <> 'CANCELADA'/);
  assert.match(def!, /c\.estado <> 'CANCELADA'/);
  assert.match(def!, /coalesce\(s\.cancelada, false\) = false/);
});

test('instructora_atiende_socia: anon no la ejecuta; authenticated sí (la evalúa la RLS)', () => {
  assert.match(SALUD, /revoke all on function public\.instructora_atiende_socia\(text\) from public;/);
  assert.match(SALUD, /revoke all on function public\.instructora_atiende_socia\(text\) from anon;/);
  assert.match(SALUD, /grant execute on function public\.instructora_atiende_socia\(text\) to authenticated, service_role;/);
  assert.doesNotMatch(SALUD, /grant execute on function public\.instructora_atiende_socia\(text\) to [^;]*\banon\b/);
});

const POLITICAS: [tabla: string, politica: string][] = [
  ['condiciones_salud', 'salud_condiciones_salud_lectura'],
  ['condiciones_salud', 'salud_condiciones_salud_insert'],
  ['condiciones_salud', 'salud_condiciones_salud_update'],
  ['condiciones_salud', 'salud_condiciones_salud_delete'],
  ['respuestas_sesion', 'salud_respuestas_sesion_select'],
  ['respuestas_sesion', 'salud_respuestas_sesion_insert'],
  ['respuestas_sesion', 'salud_respuestas_sesion_update'],
  ['respuestas_sesion', 'salud_respuestas_sesion_delete'],
  ['respuestas_cuestionario_salud', 'respuestas_cuestionario_salud_lectura'],
  ['respuestas_cuestionario_salud', 'respuestas_cuestionario_salud_insert'],
  ['respuestas_cuestionario_salud', 'respuestas_cuestionario_salud_update'],
  ['respuestas_cuestionario_salud', 'respuestas_cuestionario_salud_delete'],
  ['valoraciones_iniciales_salud', 'valoraciones_iniciales_salud_lectura'],
  ['notas_progreso', 'salud_notas_progreso_select'],
  ['notas_progreso', 'salud_notas_progreso_insert'],
  ['notas_progreso', 'salud_notas_progreso_update'],
  ['notas_progreso', 'salud_notas_progreso_delete'],
];

test('las políticas de salud: estudio + consentimiento + (propietaria o instructora con su alumna)', () => {
  for (const [tabla, politica] of POLITICAS) {
    const bloque = SALUD.match(new RegExp(String.raw`create policy ${politica} on public\.${tabla}\b[\s\S]*?;`, 'i'))?.[0];
    assert.ok(bloque, `falta ${politica} en ${tabla}`);
    assert.match(SALUD, new RegExp(String.raw`drop policy if exists ${politica} on public\.${tabla};`), `${politica}: se crea sin drop previo`);
    const usos = (bloque!.match(/instructora_atiende_socia\(socio_id\)/g) ?? []).length;
    const consent = (bloque!.match(/tiene_consentimiento_salud\(socio_id\)/g) ?? []).length;
    const propietaria = (bloque!.match(/current_rol\(\) = 'PROPIETARIO'/g) ?? []).length;
    const esperadas = /_update$/.test(politica) ? 2 : 1; // USING y WITH CHECK
    assert.equal(usos, esperadas, `${politica}: instructora_atiende_socia en USING/WITH CHECK`);
    assert.equal(consent, esperadas, `${politica}: tiene_consentimiento_salud en USING/WITH CHECK`);
    assert.equal(propietaria, esperadas, `${politica}: rama de la propietaria`);
    assert.match(bloque!, /studio_id = current_studio_id\(\)/);
    // La forma vieja (cualquier instructora del estudio) no puede sobrevivir.
    assert.doesNotMatch(bloque!, /in \('PROPIETARIO', 'INSTRUCTOR'\)/);
  }
  // Ni la FOR ALL antigua de notas_progreso.
  assert.match(SALUD, /drop policy if exists salud_notas_progreso on public\.notas_progreso;/);
});

test('ninguna migración posterior vuelve a abrir la salud a toda instructora del estudio', () => {
  const todas = migraciones();
  const i = todas.findIndex(m => m.nombre.endsWith('_salud_solo_alumnas_de_la_instructora.sql'));
  for (const { nombre, sql } of todas.slice(i + 1)) {
    for (const [tabla] of POLITICAS) {
      const reabre = new RegExp(
        String.raw`create policy \w+ on public\.${tabla}\b[^;]*in \('PROPIETARIO', 'INSTRUCTOR'\)`, 'i',
      );
      assert.doesNotMatch(sql, reabre, `${nombre} redefine una política de ${tabla} sin la regla de alumna asignada`);
    }
  }
});

test('semaforo_salud_estudio: la guardia de rol falla cerrada con NULL y filtra a la instructora', () => {
  const def = SALUD.match(/create or replace function public\.semaforo_salud_estudio[\s\S]*?\$function\$;/i)?.[0];
  assert.ok(def, 'falta semaforo_salud_estudio');
  assert.match(def!, /v_rol is null or v_rol not in/);
  assert.match(def!, /v_rol is distinct from 'INSTRUCTOR' or public\.instructora_atiende_socia\(cs\.socio_id\)/);
  assert.match(def!, /tiene_consentimiento_salud\(cs\.socio_id\)/);
  assert.match(SALUD, /revoke all on function public\.semaforo_salud_estudio\(text\) from anon;/);
});

test('las rutas de servidor que sirven salud aplican la regla de alumna asignada', () => {
  assert.match(leer('app/api/ai/instructor-note/route.ts'), /comprobarAccesoSaludSocia\(/);
  assert.match(leer('app/api/ai/ficha-clinica-socio/route.ts'), /comprobarAccesoSaludSocia\([^)]*exigirConsentimiento:\s*true/);
  assert.match(leer('app/api/ai/ficha-clinica-clase/route.ts'), /comprobarAccesoSaludClase\(/);
  const helper = leer('lib/datos-salud/acceso-servidor.ts');
  assert.match(helper, /instructoraAtiendeSocia\(/);
  assert.match(helper, /VENTANA_ALUMNA_DIAS/);
  assert.match(helper, /\.is\('borrado_en', null\)/);
});

// ─── A15: consentimiento demostrable y revocable ─────────────────────────────

test('consentimiento_salud_cambiar: solo service_role, bloquea la fila y apunta el evento', () => {
  const firma = String.raw`public\.consentimiento_salud_cambiar\(text, text, text, text, text, text, uuid, text\)`;
  for (const rol of ['public', 'anon', 'authenticated']) {
    assert.match(CONSENTIMIENTO, new RegExp(String.raw`revoke all on function ${firma} from ${rol};`), `falta revoke from ${rol}`);
  }
  assert.match(CONSENTIMIENTO, new RegExp(String.raw`grant execute on function ${firma} to service_role;`));
  assert.doesNotMatch(CONSENTIMIENTO, new RegExp(String.raw`grant execute on function ${firma} to [^;]*authenticated`));
  const def = CONSENTIMIENTO.match(/create or replace function public\.consentimiento_salud_cambiar[\s\S]*?\$function\$;/i)?.[0];
  assert.ok(def);
  assert.match(def!, /security definer/i);
  assert.match(def!, /set search_path = ''/);
  assert.match(def!, /for update;/);
  assert.match(def!, /insert into public\.consentimientos_salud_eventos/);
  assert.match(def!, /consentimiento_salud_fecha = now\(\)/);
  // Revocar sella, no borra la prueba.
  assert.doesNotMatch(def!, /consentimiento_salud_fecha = null/);
  assert.doesNotMatch(def!, /consentimiento_salud_texto = null/);
});

test('consentimientos_salud_eventos: sin escritura desde el cliente, lectura solo propietaria', () => {
  assert.match(CONSENTIMIENTO, /revoke all on table public\.consentimientos_salud_eventos from authenticated;/);
  assert.match(CONSENTIMIENTO, /revoke all on table public\.consentimientos_salud_eventos from anon;/);
  assert.match(CONSENTIMIENTO, /grant select on table public\.consentimientos_salud_eventos to authenticated;/);
  assert.doesNotMatch(CONSENTIMIENTO, /grant (all|insert|update|delete)[^;]*on table public\.consentimientos_salud_eventos to [^;]*authenticated/);
  assert.match(CONSENTIMIENTO, /enable row level security/);
  assert.match(CONSENTIMIENTO, /current_rol\(\) = 'PROPIETARIO'/);
});

const COLUMNAS_CONSENTIMIENTO = /consentimiento_salud_/;

test('socios: authenticated pierde el grant de TABLA y ninguna columna de consentimiento vuelve por columna', () => {
  assert.match(CONSENTIMIENTO, /revoke update on table public\.socios from authenticated;/);
  assert.match(CONSENTIMIENTO, /revoke insert on table public\.socios from authenticated;/);
  const grants = [...CONSENTIMIENTO.matchAll(/grant (insert|update) \(([^)]*)\) on table public\.socios to authenticated;/g)];
  assert.equal(grants.length, 2, 'se esperaban los dos grants por columna (insert y update)');
  for (const [, priv, cols] of grants) {
    assert.doesNotMatch(cols, COLUMNAS_CONSENTIMIENTO, `grant ${priv} devuelve una columna de consentimiento`);
    // Las columnas que el panel sí escribe tienen que seguir ahí.
    for (const c of ['nombre', 'email', 'campos_extra', 'aceptacion_fecha', 'consentimiento_marketing_en']) {
      assert.match(cols, new RegExp(String.raw`\b${c}\b`), `grant ${priv} ha perdido ${c}`);
    }
  }
});

// Columnas de `socios` que a propósito NO escribe `authenticated`. Añadir aquí
// solo lo que escribe exclusivamente el servidor.
// Columnas que `authenticated` no debe escribir: las pone el servidor.
//  · excluir_de_perfilado (#1922): la oposición al perfilado la cambia solo la
//    propia socia por la ruta del portal (service_role); un trigger bloquea al staff.
const SOCIOS_SOLO_SERVIDOR = new Set<string>(['excluir_de_perfilado']);

test('una columna NUEVA de socios necesita su grant por columna (o ser solo de servidor)', () => {
  const todas = migraciones();
  const i = todas.findIndex(m => m.nombre.endsWith('_consentimiento_salud_demostrable.sql'));
  const posteriores = todas.slice(i + 1);
  const faltan: string[] = [];
  posteriores.forEach(({ nombre, sql }, j) => {
    // Nadie puede devolver el grant de tabla entera: volvería a abrir las columnas de consentimiento.
    assert.doesNotMatch(
      sql, /grant\s+(?:all|update|insert)(?:\s*,\s*\w+)*\s+on\s+(?:table\s+)?public\.socios\s+to\s+[^;]*authenticated/i,
      `${nombre} vuelve a dar a authenticated un grant de TABLA sobre socios`,
    );
    for (const alter of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?socios\b([^;]*);/gi)) {
      for (const add of alter[1].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/gi)) {
        const col = add[1].toLowerCase();
        if (SOCIOS_SOLO_SERVIDOR.has(col)) continue;
        const resto = posteriores.slice(j).map(m => m.sql).join('\n');
        const concedida = [...resto.matchAll(/grant\s+update\s*\(([^)]*)\)\s*on\s+(?:table\s+)?public\.socios/gi)]
          .some(g => new RegExp(String.raw`\b${col}\b`).test(g[1]));
        if (!concedida) faltan.push(`${nombre}: ${col}`);
      }
    }
  });
  assert.deepEqual(
    faltan, [],
    'authenticated ya no tiene UPDATE de tabla sobre socios (migr 20260913173100). Una columna nueva ' +
    'necesita `grant insert (col), update (col) on public.socios to authenticated`, o, si solo la escribe ' +
    'el servidor, añadirla a SOCIOS_SOLO_SERVIDOR.',
  );
});

test('las rutas de consentimiento derivan el texto y el autor en servidor', () => {
  const registrar = leer('app/api/socios/[id]/consentimiento-salud/route.ts');
  assert.match(registrar, /textoConsentimientoSaludPanel\(/);
  assert.match(registrar, /p_actor_uid: sesion\.userId/);
  assert.match(registrar, /p_origen: 'PANEL'/);
  assert.match(registrar, /comprobarAccesoSaludSocia\(/);
  assert.doesNotMatch(registrar, /body\??\.texto/);

  const revocarStaff = leer('app/api/socios/[id]/consentimiento-salud/revocar/route.ts');
  assert.match(revocarStaff, /p_tipo: 'REVOCADO'/);
  assert.match(revocarStaff, /comprobarAccesoSaludSocia\(/);

  const revocarAlumna = leer('app/api/public/consentimiento-salud/revocar/route.ts');
  assert.match(revocarAlumna, /socioAutenticado\(user\.userId, studioId\)/);
  assert.doesNotMatch(revocarAlumna, /body\??\.socioId/);
  assert.match(revocarAlumna, /p_tipo: 'REVOCADO'/);
});

test('el navegador ya no escribe las columnas de consentimiento de salud', () => {
  const datos = leer('lib/supabase-data.ts');
  assert.doesNotMatch(datos, /db\.consentimiento_salud_\w+\s*=/);
  // La valoración de la alumna también pasa por la RPC (historial).
  assert.match(leer('lib/db/valoracion-inicial-admin.ts'), /rpc\('consentimiento_salud_cambiar'/);
  assert.doesNotMatch(leer('components/socios/ficha-salud.tsx'), /consentimientoSalud:\s*\{\s*fecha:\s*new Date/);
});

// ─── A17: campos personalizados ──────────────────────────────────────────────

test('campos_personalizados: leer todo el estudio; crear/editar/borrar solo PROPIETARIO', () => {
  assert.match(CAMPOS, /drop policy if exists admin_campos_personalizados on public\.campos_personalizados;/);
  const lectura = CAMPOS.match(/create policy campos_personalizados_lectura[\s\S]*?;/)?.[0] ?? '';
  assert.match(lectura, /for select/);
  for (const op of ['insert', 'update', 'delete']) {
    const b = CAMPOS.match(new RegExp(String.raw`create policy campos_personalizados_${op}[\s\S]*?;`))?.[0] ?? '';
    assert.match(b, new RegExp(String.raw`for ${op}`), `falta la política de ${op}`);
    assert.match(b, /current_rol\(\) = 'PROPIETARIO'/, `${op} sin rol`);
  }
  assert.doesNotMatch(CAMPOS, /for all/i);
});

test('el copy de campos personalizados no propone salud y avisa de la ficha clínica', () => {
  const tab = leer('components/configuracion/tab-campos-personalizados.tsx');
  assert.doesNotMatch(tab, /Lesiones previas|Lesiones o limitaciones|\(lesiones, objetivos/);
  assert.match(tab, /No uses estos campos para datos de salud/);
  assert.match(tab, /puedeGestionarCamposPersonalizados/);
});
