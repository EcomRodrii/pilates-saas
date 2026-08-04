import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularRendimientoInstructoras, type SesionRendimiento, type AsistenciaRendimiento, type SocioRendimiento } from './rendimiento-instructoras.ts';

const NOW = new Date('2026-08-04T12:00:00.000Z');
const diasAntes = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

let n = 0;
const sesion = (instructorId: string | null, hace: number): SesionRendimiento =>
  ({ id: `se-${++n}`, instructorId, inicio: diasAntes(hace) });
const asistencia = (socioId: string, sesionId: string, hace: number): AsistenciaRendimiento =>
  ({ socioId, sesionId, creadoEn: diasAntes(hace) });
const socio = (id: string, hace: number, p: Partial<SocioRendimiento> = {}): SocioRendimiento =>
  ({ id, fechaAlta: diasAntes(hace), ...p });

const INSTRUCTOR = { id: 'i1', nombre: 'Marta' };
const primeraSesionAntigua = new Map([['i1', diasAntes(200)]]); // lleva 200 días, pasa el filtro de "nueva"

test('datosInsuficientes: menos de 5 alumnas atribuidas → sin métricas', () => {
  const sesiones = [sesion('i1', 10)];
  const asistencias = [
    asistencia('a', sesiones[0].id, 10), asistencia('a', sesiones[0].id, 10),
  ];
  const r = calcularRendimientoInstructoras({
    instructores: [INSTRUCTOR], sesiones, asistencias, socios: [socio('a', 100)],
    now: NOW, primeraSesionPorInstructor: primeraSesionAntigua,
  });
  assert.equal(r[0].datosInsuficientes, true);
  assert.equal(r[0].retencionPct, null);
});

test('datosInsuficientes: instructora nueva (<60 días en el equipo) aunque tenga alumnas → sin métricas', () => {
  const sesiones = Array.from({ length: 5 }, (_, i) => sesion('i1', i));
  const asistencias = sesiones.flatMap((se, i) => [
    asistencia(`s${i}`, se.id, i), asistencia(`s${i}`, se.id, i),
  ]);
  const socios = sesiones.map((_, i) => socio(`s${i}`, 100));
  const r = calcularRendimientoInstructoras({
    instructores: [INSTRUCTOR], sesiones, asistencias, socios,
    now: NOW, primeraSesionPorInstructor: new Map([['i1', diasAntes(10)]]), // solo 10 días en el equipo
  });
  assert.equal(r[0].datosInsuficientes, true);
});

test('retención: alumna atribuida con primera clase hace ≥60 días y asistencia reciente → cuenta como retenida', () => {
  // 5 alumnas atribuidas (2+ asistencias cada una, 100% con i1). 4 de ellas
  // llevan ≥60 días y siguen viniendo (última asistencia hace <30 días); 1
  // lleva <60 días (no cuenta en el denominador).
  const sesiones = [sesion('i1', 65), sesion('i1', 10)];
  const asistencias = [
    ...Array.from({ length: 4 }, (_, i) => [
      asistencia(`ret${i}`, sesiones[0].id, 65), asistencia(`ret${i}`, sesiones[1].id, 10),
    ]).flat(),
    asistencia('nueva', sesiones[1].id, 10), asistencia('nueva', sesiones[1].id, 10),
  ];
  const socios = [...Array.from({ length: 4 }, (_, i) => socio(`ret${i}`, 200)), socio('nueva', 200)];
  const r = calcularRendimientoInstructoras({
    instructores: [INSTRUCTOR], sesiones, asistencias, socios,
    now: NOW, primeraSesionPorInstructor: primeraSesionAntigua,
  });
  assert.equal(r[0].nAlumnasAtribuidas, 5);
  assert.equal(r[0].nParaRetencion, 4); // 'nueva' no cumple los 60 días desde su primera clase
  assert.equal(r[0].retencionPct, 100);
});

test('retención: una prueba puntual con OTRA instructora no adelanta artificialmente la antigüedad con la atribuida', () => {
  // 'mixta' asiste una vez con i2 (sustituta) hace 85 días, luego se decanta
  // por i1 y asiste 5 veces entre los días 20 y 12 (atribuida a i1: 5/6 ≈
  // 83% ≥ 80%). Su primera clase REAL con i1 fue hace solo 20 días — no
  // cumple los 60 días mínimos para entrar en el denominador de retención de
  // i1, aunque su primera asistencia CON CUALQUIERA (i2) sí los supere.
  const sesionSustituta = sesion('i2', 85);
  const sesionesI1Mixta = Array.from({ length: 5 }, (_, i) => sesion('i1', 20 - i * 2));
  const sesionesRelleno = [sesion('i1', 65), sesion('i1', 5)];
  const relleno = Array.from({ length: 4 }, (_, i) => socio(`r${i}`, 200));
  const asistenciasRelleno = relleno.flatMap(s => [
    asistencia(s.id, sesionesRelleno[0].id, 65), asistencia(s.id, sesionesRelleno[1].id, 5),
  ]);
  const s = calcularRendimientoInstructoras({
    instructores: [INSTRUCTOR],
    sesiones: [sesionSustituta, ...sesionesI1Mixta, ...sesionesRelleno],
    asistencias: [
      ...asistenciasRelleno,
      asistencia('mixta', sesionSustituta.id, 85),
      ...sesionesI1Mixta.map((se, i) => asistencia('mixta', se.id, 20 - i * 2)),
    ],
    socios: [...relleno, socio('mixta', 200)],
    now: NOW, primeraSesionPorInstructor: primeraSesionAntigua,
  });
  // 'mixta' cuenta como alumna atribuida a i1, pero NO debe entrar en el
  // denominador de retención (solo lleva 20 días con i1, no 85).
  assert.equal(s[0].nAlumnasAtribuidas, 5);
  assert.equal(s[0].nParaRetencion, 4); // solo las 4 de relleno, 'mixta' queda fuera
});

test('retención: alumna que no vuelve en 30 días no cuenta como retenida', () => {
  const sesiones = [sesion('i1', 65), sesion('i1', 61), sesion('i1', 5)];
  const asistencias = [
    // 3 alumnas "ok": primera clase hace 65 días (cumple el mínimo de 60) y
    // vuelven hace solo 5 días → retenidas.
    ...Array.from({ length: 3 }, (_, i) => [
      asistencia(`ok${i}`, sesiones[0].id, 65), asistencia(`ok${i}`, sesiones[2].id, 5),
    ]).flat(),
    // 2 alumnas más para llegar al mínimo de 5, que SÍ dejaron de venir (última hace 61 días).
    asistencia('se-fue-1', sesiones[0].id, 65), asistencia('se-fue-1', sesiones[1].id, 61),
    asistencia('se-fue-2', sesiones[0].id, 65), asistencia('se-fue-2', sesiones[1].id, 61),
  ];
  const socios = [
    ...Array.from({ length: 3 }, (_, i) => socio(`ok${i}`, 200)),
    socio('se-fue-1', 200), socio('se-fue-2', 200),
  ];
  const r = calcularRendimientoInstructoras({
    instructores: [INSTRUCTOR], sesiones, asistencias, socios,
    now: NOW, primeraSesionPorInstructor: primeraSesionAntigua,
  });
  assert.equal(r[0].nAlumnasAtribuidas, 5);
  assert.equal(r[0].nParaRetencion, 5);
  assert.equal(r[0].retencionPct, 60); // 3 de 5 retenidas
});

test('conversión: primera clase con esta instructora y vuelve ≥2 veces en 30 días → convertida', () => {
  const sesiones = [sesion('i1', 20), sesion('i1', 15), sesion('i1', 5)];
  // 5 alumnas de relleno para pasar el umbral de "datos suficientes".
  const relleno = Array.from({ length: 5 }, (_, i) => socio(`r${i}`, 200));
  const asistenciasRelleno = relleno.flatMap(s => [
    asistencia(s.id, sesiones[2].id, 5), asistencia(s.id, sesiones[2].id, 5),
  ]);

  const nueva1 = socio('n1', 20); // dada de alta hace 20 días, primera clase el mismo día
  const nueva2 = socio('n2', 20); // primera clase el mismo día, pero no vuelve

  const r = calcularRendimientoInstructoras({
    instructores: [INSTRUCTOR],
    sesiones,
    asistencias: [
      ...asistenciasRelleno,
      asistencia('n1', sesiones[0].id, 20), asistencia('n1', sesiones[1].id, 15),
      asistencia('n2', sesiones[0].id, 20),
    ],
    socios: [...relleno, nueva1, nueva2],
    now: NOW, primeraSesionPorInstructor: primeraSesionAntigua,
  });
  assert.equal(r[0].nParaConversion, 2);
  assert.equal(r[0].conversionPct, 50); // n1 convertida, n2 no
});

test('red social: alumna referida por otra alumna de la MISMA instructora cuenta; referida de fuera no', () => {
  const sesiones = [sesion('i1', 70)];
  const alumnas = Array.from({ length: 5 }, (_, i) => `a${i}`);
  const asistencias = alumnas.flatMap(id => [asistencia(id, sesiones[0].id, 70), asistencia(id, sesiones[0].id, 70)]);
  const socios = [
    socio('a0', 200), // ancla, sin referido
    socio('a1', 200, { referidoPor: 'a0' }), // referida por a0, TAMBIÉN de i1 → cuenta
    socio('a2', 200, { referidoPor: 'externo' }), // referida por alguien fuera de i1 → no cuenta
    socio('a3', 200), socio('a4', 200),
  ];
  const r = calcularRendimientoInstructoras({
    instructores: [INSTRUCTOR], sesiones, asistencias, socios,
    now: NOW, primeraSesionPorInstructor: primeraSesionAntigua,
  });
  assert.equal(r[0].redSocialPct, 20); // 1 de 5 (a1)
});

test('atribución: socia que reparte sus asistencias entre dos instructoras (<80% con ninguna) no se atribuye a nadie', () => {
  const otraInstructora = { id: 'i2', nombre: 'Elena' };
  const sesiones = [sesion('i1', 20), sesion('i2', 15)];
  const relleno1 = Array.from({ length: 5 }, (_, i) => socio(`r1-${i}`, 200));
  const relleno2 = Array.from({ length: 5 }, (_, i) => socio(`r2-${i}`, 200));
  const asistencias = [
    ...relleno1.flatMap(s => [asistencia(s.id, sesiones[0].id, 20), asistencia(s.id, sesiones[0].id, 20)]),
    ...relleno2.flatMap(s => [asistencia(s.id, sesiones[1].id, 15), asistencia(s.id, sesiones[1].id, 15)]),
    asistencia('mixta', sesiones[0].id, 20), asistencia('mixta', sesiones[1].id, 15),
  ];
  const r = calcularRendimientoInstructoras({
    instructores: [INSTRUCTOR, otraInstructora], sesiones, asistencias,
    socios: [...relleno1, ...relleno2, socio('mixta', 200)],
    now: NOW, primeraSesionPorInstructor: new Map([['i1', diasAntes(200)], ['i2', diasAntes(200)]]),
  });
  const i1 = r.find(x => x.instructorId === 'i1')!;
  const i2 = r.find(x => x.instructorId === 'i2')!;
  assert.equal(i1.nAlumnasAtribuidas, 5); // 'mixta' no cuenta para ninguna
  assert.equal(i2.nAlumnasAtribuidas, 5);
});
