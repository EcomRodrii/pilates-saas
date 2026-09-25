import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COLUMNAS_EXCLUIDAS, LIMITE_ID, filaDeAuditoriaServidor, type EntradaServidor } from './entrada-servidor.ts';
import { TIEMPO_MAXIMO_MS, registrarAuditoriaServidor } from './registrar-servidor.ts';

const SESION = { userId: '00000000-0000-4000-8000-000000000001', studioId: 'studio-1', rol: 'RECEPCION' };

function entrada(o: Partial<EntradaServidor> = {}): EntradaServidor {
  return {
    sesion: SESION, tabla: 'recibos', filaId: 'rec-1', operacion: 'UPDATE', socioId: 'soc-1',
    antes: { estado: 'COBRADO', fecha_devolucion: null },
    despues: { estado: 'DEVUELTO', fecha_devolucion: '2026-09-25T10:00:00Z' },
    contexto: { accion: 'RECIBO_MARCADO_DEVUELTO', concepto: 'Cuota' },
    ...o,
  };
}

function fila(o: Partial<EntradaServidor> = {}) {
  const r = filaDeAuditoriaServidor(entrada(o));
  assert.ok(r.ok, `la entrada de prueba debería ser válida: ${JSON.stringify(r)}`);
  return r.fila;
}

test('una entrada válida es una fila de servidor con su actor, y solo lo que cambió', () => {
  const f = fila();
  assert.equal(f.origen, 'servidor');
  assert.equal(f.actor_uid, SESION.userId);
  assert.equal(f.actor_rol, 'RECEPCION');
  assert.deepEqual(f.cambios, ['estado', 'fecha_devolucion']);
  assert.deepEqual(f.antes, { estado: 'COBRADO', fecha_devolucion: null });
  assert.deepEqual(f.despues, { estado: 'DEVUELTO', fecha_devolucion: '2026-09-25T10:00:00Z' });
  assert.equal(f.socio_id, 'soc-1');
  assert.equal(f.contexto.accion, 'RECIBO_MARCADO_DEVUELTO');
});

test('un valor que se queda como está no es un cambio: solo van las columnas que cambian', () => {
  const f = fila({
    antes: { estado: 'COBRADO', proximo_reintento: null, importe: 45 },
    despues: { estado: 'DEVUELTO', proximo_reintento: null, importe: 45 },
  });
  assert.deepEqual(f.cambios, ['estado']);
  assert.deepEqual(f.antes, { estado: 'COBRADO' });
  assert.deepEqual(f.despues, { estado: 'DEVUELTO' });
});

test('un UPDATE sin ningún cambio real no se registra (como el trigger), y no es un error', () => {
  const r = filaDeAuditoriaServidor(entrada({ antes: { estado: 'COBRADO' }, despues: { estado: 'COBRADO' } }));
  assert.deepEqual(r, { ok: false, razon: 'SIN_CAMBIOS' });
});

test('un alta lleva solo `despues` y una baja solo `antes`, sin `cambios`', () => {
  const alta = fila({ operacion: 'INSERT', antes: null, despues: { concepto: 'Taller', total: 300 } });
  assert.equal(alta.cambios, null);
  assert.equal(alta.antes, null);
  assert.deepEqual(alta.despues, { concepto: 'Taller', total: 300 });
  const baja = fila({ operacion: 'DELETE', antes: { concepto: 'Taller', total: 300 }, despues: null });
  assert.equal(baja.despues, null);
  assert.deepEqual(baja.antes, { concepto: 'Taller', total: 300 });
});

test('un ingreso manual no copia NIF, cliente ni nota: ni en antes, ni en después, ni en el contexto', () => {
  const f = fila({
    tabla: 'ingresos_manuales', filaId: 'ing-1', socioId: null,
    antes: { total: 100, nif: 'X1234567L', cliente: 'Cliente Secreto', nota: 'privada' },
    despues: { total: 120, nif: 'X1234567L', cliente: 'Otro Nombre', nota: 'otra' },
    contexto: { accion: 'INGRESO_MANUAL_EDITADO', concepto: 'Taller', nif: 'X1234567L' },
  });
  assert.deepEqual(f.cambios, ['total'], 'un cambio solo en columnas excluidas no deja rastro de ellas');
  const volcado = JSON.stringify(f);
  assert.doesNotMatch(volcado, /X1234567L|Secreto|Otro Nombre|privada|otra/);
  // Y si SOLO cambian columnas excluidas, no hay nada que anotar.
  const soloTerceros = filaDeAuditoriaServidor(entrada({
    tabla: 'ingresos_manuales', antes: { nota: 'a' }, despues: { nota: 'b' },
    contexto: { accion: 'INGRESO_MANUAL_EDITADO' },
  }));
  assert.deepEqual(soloTerceros, { ok: false, razon: 'SIN_CAMBIOS' });
});

test('las columnas excluidas son EXACTAMENTE las que excluye el trigger de la migración', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20260925152253_auditoria_estudio_dinero.sql', import.meta.url), 'utf8')
    .replace(/--.*$/gm, '');
  const excluidas = new Map<string, string[]>();
  for (const m of sql.matchAll(/create trigger trg_auditar_(\w+)\s+after insert or update or delete on public\.(\w+)\s+for each row execute function public\.auditar_cambio_dinero\('([^']*)'(?:,\s*'([^']*)')?\)/g)) {
    if (m[4]) excluidas.set(m[2], m[4].split(',').sort());
  }
  assert.ok(excluidas.size >= 1, 'el parser no ve el trigger con columnas excluidas');
  assert.deepEqual(
    Object.fromEntries(Object.entries(COLUMNAS_EXCLUIDAS).map(([t, c]) => [t, [...c].sort()])),
    Object.fromEntries(excluidas),
  );
});

test('una columna nueva de ingresos_manuales obliga a decidir si el libro la copia: la lista de exclusión no se actualiza sola', () => {
  // La exclusión (cliente, NIF, nota) protege datos de un tercero, pero solo de lo que YA existe: una columna
  // nueva con otro dato personal se colaría en un libro que no se puede rectificar. Este test falla en cuanto
  // aparece una, y la persona que la añada tiene que clasificarla aquí (y, si es personal, en el trigger y en COLUMNAS_EXCLUIDAS).
  const tipos = readFileSync(new URL('../db-types.ts', import.meta.url), 'utf8');
  const cuerpo = tipos.match(/export interface RowIngresosManuales \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(cuerpo, 'no se encuentra RowIngresosManuales en db-types');
  const columnas = [...cuerpo.matchAll(/^\s+(\w+)\??:/gm)].map(m => m[1]);
  const excluidas = new Set(COLUMNAS_EXCLUIDAS.ingresos_manuales);
  const seCopian = columnas.filter(c => !excluidas.has(c)).sort();
  assert.deepEqual(
    seCopian,
    ['base_imponible', 'concepto', 'creado_en', 'cuota_iva', 'fecha', 'id', 'studio_id', 'tipo_iva', 'total'],
    'ingresos_manuales tiene una columna nueva: ¿lleva datos de un tercero? Si sí, exclúyela; si no, añádela a esta lista',
  );
});

test('los ids se recortan como en el trigger: uno larguísimo no puede dejar la entrada sin escribir', () => {
  const f = fila({ filaId: 'x'.repeat(2660), socioId: 's'.repeat(3000), sesion: { ...SESION, studioId: 't'.repeat(500) } });
  assert.equal(f.fila_id.length, LIMITE_ID);
  assert.equal(f.socio_id?.length, LIMITE_ID);
  assert.equal(f.studio_id.length, LIMITE_ID);
});

test('el motivo se recorta y sin motivo es null', () => {
  assert.equal(fila({ motivo: 'DUPLICADO' }).motivo, 'DUPLICADO');
  assert.equal(fila({ motivo: 'X'.repeat(200) }).motivo?.length, 60);
  assert.equal(fila().motivo, null);
});

test('sin actor, sede, fila o acción no hay entrada: es un fallo de quien llama', () => {
  const casos: Array<[string, Partial<EntradaServidor>]> = [
    ['sesion.studioId', { sesion: { ...SESION, studioId: '' } }],
    ['sesion.userId', { sesion: { ...SESION, userId: '' } }],
    ['sesion.rol', { sesion: { ...SESION, rol: '' } }],
    ['tabla', { tabla: '' }],
    ['filaId', { filaId: '' }],
    ['contexto.accion', { contexto: { accion: '' } }],
  ];
  for (const [campo, o] of casos) {
    const r = filaDeAuditoriaServidor(entrada(o));
    assert.equal(r.ok, false, campo);
    assert.ok(!r.ok && r.razon === 'ENTRADA_INVALIDA' && r.detalle.includes(campo), campo);
  }
});

// ── Escribir ────────────────────────────────────────────────────────────────

function adminFalso(resultado: { error: { message: string; code?: string } | null } | 'lanza') {
  const insertadas: Array<{ tabla: string; fila: Record<string, unknown> }> = [];
  const señales: Array<AbortSignal | undefined> = [];
  return {
    insertadas, señales,
    admin: {
      from(tabla: string) {
        return {
          insert(fila: Record<string, unknown>) {
            insertadas.push({ tabla, fila });
            if (resultado === 'lanza') throw new Error('red caída');
            // Como el builder de supabase-js: se espera con `await` tras encadenar `.abortSignal()`.
            return { abortSignal(s?: AbortSignal) { señales.push(s); return Promise.resolve(resultado); } };
          },
        };
      },
    } as never,
  };
}

test('escribe la fila en auditoria_estudio y no avisa si todo va bien', async () => {
  const { admin, insertadas } = adminFalso({ error: null });
  const avisos: string[] = [];
  await registrarAuditoriaServidor(admin, entrada(), m => avisos.push(m));
  assert.equal(insertadas.length, 1);
  assert.equal(insertadas[0].tabla, 'auditoria_estudio');
  assert.equal(insertadas[0].fila.origen, 'servidor');
  assert.deepEqual(avisos, []);
});

test('si el libro falla, NO lanza (la operación de dinero sigue en pie) y avisa', async () => {
  for (const resultado of [{ error: { message: 'boom' } }, 'lanza'] as const) {
    const { admin, insertadas } = adminFalso(resultado);
    const avisos: Array<[string, Record<string, unknown>]> = [];
    await registrarAuditoriaServidor(admin, entrada(), (m, e) => avisos.push([m, e]));
    assert.equal(insertadas.length, 1, 'sí lo intentó');
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0][0], 'AUDITORIA_FALLO');
    assert.equal(avisos[0][1].filaId, 'rec-1');
  }
});

test('el insert lleva un tope de tiempo: un libro colgado no puede dejar sin marcar un reembolso ya hecho', async () => {
  const { admin, señales } = adminFalso({ error: null });
  await registrarAuditoriaServidor(admin, entrada(), () => {});
  assert.equal(señales.length, 1);
  assert.ok(señales[0] instanceof AbortSignal, 'el insert no lleva señal de aborto');
  assert.ok(TIEMPO_MAXIMO_MS > 0 && TIEMPO_MAXIMO_MS <= 10_000);
});

test('un duplicado exacto (índice único) no es un fallo: la entrada ya está, no se avisa', async () => {
  const { admin, insertadas } = adminFalso({ error: { message: 'duplicate key value violates unique constraint', code: '23505' } });
  const avisos: string[] = [];
  await registrarAuditoriaServidor(admin, entrada(), m => avisos.push(m));
  assert.equal(insertadas.length, 1);
  assert.deepEqual(avisos, []);
  // Cualquier otro error sí avisa.
  const otro = adminFalso({ error: { message: 'permission denied', code: '42501' } });
  await registrarAuditoriaServidor(otro.admin, entrada(), m => avisos.push(m));
  assert.deepEqual(avisos, ['AUDITORIA_FALLO']);
});

test('sin cambios no escribe ni avisa; con una entrada inválida no escribe pero SÍ avisa', async () => {
  const sinCambios = adminFalso({ error: null });
  const avisos1: string[] = [];
  await registrarAuditoriaServidor(sinCambios.admin, entrada({ antes: { a: 1 }, despues: { a: 1 } }), m => avisos1.push(m));
  assert.equal(sinCambios.insertadas.length, 0);
  assert.deepEqual(avisos1, []);

  const invalida = adminFalso({ error: null });
  const avisos2: string[] = [];
  await registrarAuditoriaServidor(invalida.admin, entrada({ sesion: { ...SESION, userId: '' } }), m => avisos2.push(m));
  assert.equal(invalida.insertadas.length, 0);
  assert.deepEqual(avisos2, ['AUDITORIA_ENTRADA_INVALIDA']);
});
