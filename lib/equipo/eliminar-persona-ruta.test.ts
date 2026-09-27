import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// La ruta usa service-role: la cerradura real no puede depender de que nadie se acuerde de ella.
// Se fija en el código lo que NO puede cambiar sin que alguien lo decida.

const ruta = readFileSync(new URL('../../app/api/equipo/eliminar/route.ts', import.meta.url), 'utf8');
const sinComentarios = ruta.replace(/\/\/.*$/gm, '');

test('el orden es el que protege: límite, sesión, rol y sede, la función SQL, y solo después la cuenta', () => {
  const hitos = [
    'enforceRateLimit(', 'verificarSesionStaff(', "from('instructores')", 'puedeEliminarDefinitivamente(',
    "rpc('anonimizar_instructor'", 'borrarFotoSiNadieMasLaUsa(', 'borrarCuentaSiQuedaSuelta(',
  ].map(h => [h, sinComentarios.indexOf(h)] as const);
  for (const [h, i] of hitos) assert.ok(i > 0, `no se encuentra ${h}`);
  const posiciones = hitos.map(([, i]) => i);
  assert.deepEqual(posiciones, [...posiciones].sort((a, b) => a - b), 'los pasos no van en el orden esperado');
});

test('la foto se borra DESPUÉS de la función SQL, solo si ninguna otra ficha apunta a ella, con reintentos, y lo que falle queda pendiente', () => {
  const rpc = sinComentarios.indexOf("rpc('anonimizar_instructor'");
  const llamada = sinComentarios.indexOf('borrarFotoSiNadieMasLaUsa(admin, instructorId, url)');
  assert.ok(rpc > 0 && llamada > rpc, 'la foto se borra antes de saber si la función acepta: una ficha activa se quedaría con la foto rota');
  const cuerpo = sinComentarios.slice(sinComentarios.indexOf('async function borrarFotoSiNadieMasLaUsa'));
  // Otra sede de la misma persona comparte la URL: se mira ANTES de borrar el objeto, y un fallo al mirar NO da vía libre ni se calla.
  assert.match(cuerpo, /\.eq\('foto_url', url\);\s+if \(error\) return pendiente\(/);
  assert.match(cuerpo, /if \(count\) return null;/);
  assert.ok(cuerpo.indexOf("eq('foto_url', url)") < cuerpo.indexOf("storage.from('avatars').remove"));
  assert.match(cuerpo, /await conReintentos\(async \(\) => \{[\s\S]*?storage\.from\('avatars'\)\.remove\(\[`instructor-\$\{instructorId\}`\]\)[\s\S]*?if \(errFoto\) throw errFoto;/);
  // Una foto que nadie borra sigue pública en una ruta predecible: se guarda para reintentar, no solo en el log.
  assert.match(cuerpo, /tercero: 'foto_avatar', ref: url/);
  assert.match(cuerpo, /return pendiente\(`Foto: \$\{r\.error\}`\);/);
  // Y al reintentar se cogen también las de la vez anterior (la URL ya no está en la ficha).
  assert.match(sinComentarios, /previos\.filter\(p => p\.tercero === 'foto_avatar'\)\.map\(p => p\.ref\)/);
});

test('la persona y el estudio salen de la sesión, nunca del cuerpo', () => {
  assert.match(sinComentarios, /\.eq\('id', instructorId\)\s*\.eq\('studio_id', sesion\.studioId\)/);
  assert.match(sinComentarios, /p_studio_id: sesion\.studioId, p_instructor_id: instructorId, p_ejecutada_por: sesion\.userId/);
  assert.doesNotMatch(sinComentarios, /body\??\.(studioId|studio_id|rol|userId)/);
  // El único dato del cuerpo es el id de la persona, y se busca DENTRO del estudio de la sesión.
  assert.match(sinComentarios, /const instructorId = typeof body\?\.instructorId === 'string' \? body\.instructorId : null;/);
});

test('solo la propietaria: el rol se comprueba con la sesión (la regla vive en un módulo puro con sus tests)', () => {
  assert.match(sinComentarios, /puedeEliminarDefinitivamente\(\{\s*rolActor: sesion\.rol,/);
  assert.match(sinComentarios, /esPropia: ficha\.auth_user_id != null && ficha\.auth_user_id === sesion\.userId/);
  assert.match(sinComentarios, /activa: ficha\.activo !== false/);
});

test('la cuenta de acceso se borra solo a través del helper que comprueba los otros vínculos, y nunca directamente', () => {
  assert.doesNotMatch(sinComentarios, /deleteUser\(/);
  assert.match(sinComentarios, /borrarCuentaSiQuedaSuelta\(admin, uid, 'equipo\/eliminar'\)/);
  // Lo pendiente se guarda para reintentar, y la respuesta lo dice.
  assert.match(sinComentarios, /from\('supresiones_equipo'\)\s*\.update\(\{ terceros_pendientes: pendientes \}\)/);
  assert.match(sinComentarios, /aviso: avisos\.length > 0 \? avisos\.join\(' '\) : null,/);
});

test('el error de la base de datos no se enseña crudo', () => {
  assert.match(sinComentarios, /interpretarErrorEliminarPersona\(errRpc\.message\)/);
  assert.doesNotMatch(sinComentarios, /NextResponse\.json\(\{ error: errRpc/);
});

test('la ruta de tarjetas no lista a quien ya está eliminado, salvo a la propietaria mientras le falte algo por borrar', () => {
  const t = readFileSync(new URL('../../app/api/equipo/tarjetas/route.ts', import.meta.url), 'utf8');
  const sinC = t.replace(/\/\/.*$/gm, '');
  assert.match(sinC, /const equipo = \(instructores \?\? \[\]\)\.filter\(i => i\.nombre !== NOMBRE_PERSONA_ELIMINADA \|\| conPendientes\.has\(i\.id\)\);/);
  // Solo la propietaria ve a la persona a medio borrar (es la única que puede completarlo), y un fallo al leer no se calla.
  assert.match(sinC, /sesion\.rol === 'PROPIETARIO'\s+\? \(supresionesRes\.data \?\? \[\]\)/);
  assert.match(sinC, /if \(supresionesRes\.error\) return errorInterno\(/);
  assert.doesNotMatch(sinC, /\(instructores \?\? \[\]\)\.(map|find)/, 'una lectura sigue usando la lista sin filtrar');
});

test('sin poder leer lo pendiente de la vez anterior no se sigue: se perderían al guardar los nuevos', () => {
  assert.match(sinComentarios, /const \{ data: previa, error: errPrevia \} = await admin\s+\.from\('supresiones_equipo'\)/);
  assert.match(sinComentarios, /if \(errPrevia\) return NextResponse\.json\(\{ error: 'No se pudo leer a la persona' \}, \{ status: 500 \}\);/);
});

test('lo que la propietaria tiene que saber va en la respuesta: lo que falta, y el nombre que no se pudo buscar', () => {
  assert.match(sinComentarios, /\[avisoPendientesEquipo\(pendientes\), avisoNombreSinReconocer\(motivoNombre\)\]/);
  assert.match(sinComentarios, /completa: pendientes\.length === 0,/);
});

test('la pantalla ofrece «Eliminar definitivamente» solo cuando la regla lo permite, y «Dar de baja» solo a quien está en el equipo', () => {
  const p = readFileSync(new URL('../../app/(dashboard)/equipo/page.tsx', import.meta.url), 'utf8');
  assert.match(p, /\{m\.activo \? \([\s\S]*?Dar de baja[\s\S]*?\) : puedeEliminarDefinitivamente\(\{ rolActor: rolViewer, esPropia: m\.esYo, rolDeLaPersona: m\.rol, activa: m\.activo \}\)\.ok && \(/);
  assert.match(p, /<EliminarPersonaDialog\s+key=\{eliminarDef\?\.id \?\? 'ninguna'\}/);
  // A quien quedó a medio borrar se le ofrece COMPLETAR, no eliminar de nuevo.
  assert.match(p, /m\.nombre === NOMBRE_PERSONA_ELIMINADA \? 'Completar la eliminación…' : 'Eliminar definitivamente…'/);
});
