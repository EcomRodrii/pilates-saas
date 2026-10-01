import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { nombreAutora, notaVisiblePara, puedeBorrarNota, puedeEditarNota, textoVisibilidad } from './notas.ts';

const ANA = 'uid-ana';
const CLOE = 'uid-cloe';
const de = (autorUid: string | null, visibilidad: 'EQUIPO' | 'PRIVADA') => ({ autorUid, visibilidad });

test('quién ve cada nota: la de equipo, todo el mostrador; la privada, su autora y la propietaria; la instructora, ninguna', () => {
  const equipo = de(ANA, 'EQUIPO');
  const privadaDeAna = de(ANA, 'PRIVADA');
  const antigua = de(null, 'PRIVADA');
  assert.equal(notaVisiblePara(equipo, 'RECEPCION', 'uid-otra'), true);
  assert.equal(notaVisiblePara(equipo, 'INSTRUCTOR', 'uid-otra'), false);
  assert.equal(notaVisiblePara(privadaDeAna, 'RECEPCION', ANA), true);
  assert.equal(notaVisiblePara(privadaDeAna, 'MANAGER', 'uid-otra'), false);
  assert.equal(notaVisiblePara(privadaDeAna, 'PROPIETARIO', CLOE), true);
  // Las de antes (sin autora, privadas): solo la propietaria, como hasta hoy.
  assert.equal(notaVisiblePara(antigua, 'RECEPCION', ANA), false);
  assert.equal(notaVisiblePara(antigua, 'PROPIETARIO', CLOE), true);
});

test('editar es de la autora (las antiguas, de la propietaria); borrar, de la autora o la propietaria', () => {
  assert.equal(puedeEditarNota(de(ANA, 'EQUIPO'), 'RECEPCION', ANA), true);
  assert.equal(puedeEditarNota(de(ANA, 'EQUIPO'), 'PROPIETARIO', CLOE), false);
  assert.equal(puedeEditarNota(de(null, 'PRIVADA'), 'PROPIETARIO', CLOE), true);
  assert.equal(puedeEditarNota(de(null, 'PRIVADA'), 'MANAGER', ANA), false);
  assert.equal(puedeBorrarNota(de(ANA, 'EQUIPO'), 'PROPIETARIO', CLOE), true);
  assert.equal(puedeBorrarNota(de(ANA, 'EQUIPO'), 'MANAGER', 'uid-otra'), false);
  assert.equal(puedeBorrarNota(de(ANA, 'EQUIPO'), 'INSTRUCTOR', ANA), false);
});

test('el nombre de quien la escribió: «Tú», nombre y rol, o nada si no se sabe', () => {
  const ctx = { uid: ANA, ownerUid: CLOE, equipo: [
    { authUserId: ANA, nombre: 'Ana Peña', rol: 'RECEPCION' as const },
    { authUserId: CLOE, nombre: 'Cloe', rol: 'PROPIETARIO' as const },
    { authUserId: 'uid-marta', nombre: 'Marta Ruiz', rol: 'MANAGER' as const },
  ] };
  assert.equal(nombreAutora(ANA, ctx), 'Tú');
  assert.equal(nombreAutora(CLOE, ctx), 'Cloe · propietaria');
  assert.equal(nombreAutora('uid-marta', ctx), 'Marta · gerencia');
  assert.equal(nombreAutora(null, ctx), null);
  assert.equal(nombreAutora('uid-ida', ctx), 'Alguien que ya no está en el equipo');
  assert.equal(nombreAutora(CLOE, { ...ctx, equipo: [] }), 'La propietaria');
});

test('«privada» dice la verdad: la propietaria también la lee', () => {
  assert.equal(textoVisibilidad('PRIVADA', 'RECEPCION'), 'Solo tú y la propietaria');
  assert.equal(textoVisibilidad('EQUIPO', 'RECEPCION'), 'Todo el equipo');
});

// Espejo: la migración dice lo mismo que estas funciones. Si alguien cambia la
// política (p. ej. deja leer las privadas a gerencia), este test lo pilla.
test('la migración de notas tiene las mismas reglas y no deja firmar como otra', () => {
  const dir = new URL('../../supabase/migrations/', import.meta.url);
  const fichero = readdirSync(dir).filter(f => f.endsWith('_notas_internas_autora_y_visibilidad.sql'));
  assert.equal(fichero.length, 1, 'una sola migración de autora y visibilidad');
  const sql = readFileSync(new URL(fichero[0], dir), 'utf8').replace(/\s+/g, ' ');
  assert.match(sql, /visibilidad = 'EQUIPO' or autor_uid = \(select auth\.uid\(\)\) or \(select public\.current_rol\(\)\) = 'PROPIETARIO'/);
  assert.match(sql, /for insert to authenticated with check \( studio_id = \(select public\.current_studio_id\(\)\) and \(select public\.puede_gestionar_clientas\(\)\) and autor_uid = \(select auth\.uid\(\)\)/);
  assert.match(sql, /grant insert \(id, studio_id, socio_id, texto, tipo, creado_en, visibilidad, fijada\)/);
  assert.match(sql, /grant update \(texto, visibilidad, fijada\)/);
  assert.match(sql, /if current_user = 'authenticated' then new\.autor_uid := auth\.uid\(\);/);
});
