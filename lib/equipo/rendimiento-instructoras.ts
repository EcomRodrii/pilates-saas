// Fila 17 del informe estratégico (P2): "Se paga igual a quien retiene y a
// quien no" → rendimiento de instructoras por retención, conversión y red
// social. Informe de solo lectura, calculado al vuelo (sin snapshot ni cron
// — volumen por estudio es pequeño, decenas de instructoras, no miles;
// distinto de instructor-dependency.ts, que sí necesita snapshot porque
// alimenta alertas semanales de TODOS los estudios). Diseñado con
// tentare-arquitecto.
//
// Deliberadamente fuera de lib/decision: es un informe bajo demanda para
// PROPIETARIO/MANAGER, no una señal que interrumpa vía el Decision OS —
// "la instructora B retiene peor que la A" no tiene una acción de un clic
// que operacionalizar (¿hablar con ella? ¿formación? ¿reasignar clases?),
// rompería el principio de El Umbral de "solo interrumpe cuando hay algo
// accionable". Mide, no decide ni paga distinto — cruzar esto con
// liquidacion-logic.ts para pagar según retención es una decisión de
// producto/legal aparte, no tomada aquí.

const MS_DIA = 86400000;

// Mismo umbral que instructor-dependency.ts (cautividad): una socia se
// atribuye a la instructora con la que concentra ≥80% de sus asistencias en
// la ventana, con mínimo 2 asistencias (evita que una prueba de una clase
// cuente como "alumna suya").
const UMBRAL_ATRIBUCION = 0.8;
const MIN_ASISTENCIAS_ATRIBUCION = 2;

// Anti-injusticia con instructoras nuevas/part-time: sin datos suficientes,
// "sin dato" en vez de un 0% que la hunde en el ranking.
const MIN_ALUMNAS_PARA_MEDIR = 5;
const MIN_DIAS_EN_EQUIPO = 60;

// Tiempo mínimo desde la primera clase con la instructora para que una
// alumna cuente en el denominador de retención — antes de eso no ha dado
// tiempo a que se note un abandono.
const MIN_DIAS_PARA_JUZGAR_RETENCION = 60;
const DIAS_RECIENCIA_RETENCION = 30;

// Ventana para "recién dada de alta" (conversión) y para contar su ritmo de
// vuelta tras la primera clase.
const DIAS_PRIMERAS_SEMANAS = 30;
const MIN_ASISTENCIAS_CONVERTIDA = 2;

export interface SesionRendimiento {
  id: string;
  instructorId: string | null;
  inicio: string;
}

export interface AsistenciaRendimiento {
  socioId: string;
  sesionId: string;
  creadoEn: string;
}

export interface SocioRendimiento {
  id: string;
  fechaAlta: string;
  referidoPor?: string | null;
}

export interface InstructorRendimiento {
  id: string;
  nombre: string;
}

export interface RendimientoInstructora {
  instructorId: string;
  nombre: string;
  nAlumnasAtribuidas: number;
  datosInsuficientes: boolean;
  // null = sin denominador válido (nadie cumplía el requisito de esa métrica),
  // distinto de datosInsuficientes (que descarta la fila entera).
  retencionPct: number | null;
  nParaRetencion: number;
  conversionPct: number | null;
  nParaConversion: number;
  redSocialPct: number | null;
}

export function calcularRendimientoInstructoras(params: {
  instructores: InstructorRendimiento[];
  sesiones: SesionRendimiento[];
  asistencias: AsistenciaRendimiento[];
  socios: SocioRendimiento[];
  now: Date;
  ventanaDias?: number;
  primeraSesionPorInstructor: Map<string, string>; // instructorId → ISO de su sesión más antigua (histórico completo, no solo la ventana)
}): RendimientoInstructora[] {
  const ventanaDias = params.ventanaDias ?? 90;
  const desde = params.now.getTime() - ventanaDias * MS_DIA;

  const sesionInstructor = new Map<string, string>();
  for (const s of params.sesiones) {
    if (s.instructorId && new Date(s.inicio).getTime() >= desde) sesionInstructor.set(s.id, s.instructorId);
  }

  const socioPorId = new Map(params.socios.map(s => [s.id, s]));

  // asistencias por socia, ordenadas por fecha asc, solo las de sesiones
  // dentro de la ventana con instructora conocida.
  const asistenciasPorSocio = new Map<string, AsistenciaRendimiento[]>();
  for (const a of params.asistencias) {
    if (!sesionInstructor.has(a.sesionId)) continue;
    const arr = asistenciasPorSocio.get(a.socioId) ?? [];
    arr.push(a);
    asistenciasPorSocio.set(a.socioId, arr);
  }
  for (const arr of asistenciasPorSocio.values()) arr.sort((x, y) => x.creadoEn.localeCompare(y.creadoEn));

  // Atribución: instructora dominante por socia (≥80%, mín. 2 asistencias).
  const atribucion = new Map<string, string>(); // socioId → instructorId
  const alumnasPorInstructor = new Map<string, string[]>();
  for (const [socioId, arr] of asistenciasPorSocio) {
    if (arr.length < MIN_ASISTENCIAS_ATRIBUCION) continue;
    const porInstructor = new Map<string, number>();
    for (const a of arr) {
      const insId = sesionInstructor.get(a.sesionId)!;
      porInstructor.set(insId, (porInstructor.get(insId) ?? 0) + 1);
    }
    let mejorIns = '';
    let mejorCount = 0;
    for (const [insId, count] of porInstructor) {
      if (count > mejorCount) { mejorCount = count; mejorIns = insId; }
    }
    if (mejorIns && mejorCount / arr.length >= UMBRAL_ATRIBUCION) {
      atribucion.set(socioId, mejorIns);
      const lista = alumnasPorInstructor.get(mejorIns) ?? [];
      lista.push(socioId);
      alumnasPorInstructor.set(mejorIns, lista);
    }
  }

  return params.instructores.map(ins => {
    const alumnas = alumnasPorInstructor.get(ins.id) ?? [];
    const primeraSesion = params.primeraSesionPorInstructor.get(ins.id);
    const diasEnEquipo = primeraSesion ? Math.floor((params.now.getTime() - new Date(primeraSesion).getTime()) / MS_DIA) : 0;
    const datosInsuficientes = alumnas.length < MIN_ALUMNAS_PARA_MEDIR || diasEnEquipo < MIN_DIAS_EN_EQUIPO;

    if (datosInsuficientes) {
      return {
        instructorId: ins.id, nombre: ins.nombre, nAlumnasAtribuidas: alumnas.length, datosInsuficientes: true,
        retencionPct: null, nParaRetencion: 0, conversionPct: null, nParaConversion: 0, redSocialPct: null,
      };
    }

    // Retención: alumnas atribuidas cuya primera asistencia CON ESTA
    // instructora fue hace ≥60 días (ya ha dado tiempo a notar el abandono) —
    // de esas, % con alguna asistencia (a cualquier instructora) en los
    // últimos 30 días.
    let paraRetencion = 0;
    let retenidas = 0;
    for (const socioId of alumnas) {
      const arr = asistenciasPorSocio.get(socioId) ?? [];
      if (arr.length === 0) continue;
      // La atribución exige ≥80%, no 100% — una alumna puede tener alguna
      // asistencia suelta con OTRA instructora dentro de la ventana (una
      // sustituta, probó con otra antes de decantarse). "Primera con esta
      // instructora" tiene que filtrar por `ins.id`, o `arr[0]` (la más
      // antigua de CUALQUIERA) puede adelantar artificialmente su antigüedad
      // con esta instructora y colarla en el denominador antes de tiempo.
      const arrConEsta = arr.filter(a => sesionInstructor.get(a.sesionId) === ins.id);
      if (arrConEsta.length === 0) continue;
      const primeraConEsta = arrConEsta[0].creadoEn;
      const diasDesdePrimera = Math.floor((params.now.getTime() - new Date(primeraConEsta).getTime()) / MS_DIA);
      if (diasDesdePrimera < MIN_DIAS_PARA_JUZGAR_RETENCION) continue;
      paraRetencion++;
      // La reciencia SÍ mira "alguna asistencia a cualquier instructora" — es
      // deliberado (arr sin filtrar), ver comentario de arriba.
      const ultima = arr[arr.length - 1].creadoEn;
      const diasDesdeUltima = Math.floor((params.now.getTime() - new Date(ultima).getTime()) / MS_DIA);
      if (diasDesdeUltima <= DIAS_RECIENCIA_RETENCION) retenidas++;
    }

    // Conversión: socias dadas de alta dentro de la ventana cuya PRIMERA
    // asistencia (a cualquier clase) fue con esta instructora — de esas, %
    // con ≥2 asistencias totales en sus primeros 30 días desde el alta.
    let paraConversion = 0;
    let convertidas = 0;
    for (const [socioId, arr] of asistenciasPorSocio) {
      const socio = socioPorId.get(socioId);
      if (!socio || arr.length === 0) continue;
      const altaTs = new Date(socio.fechaAlta).getTime();
      if (altaTs < desde) continue; // no es "nueva" dentro de la ventana
      const primeraAsistencia = arr[0];
      if (sesionInstructor.get(primeraAsistencia.sesionId) !== ins.id) continue;
      paraConversion++;
      const hastaPrimerasSemanas = altaTs + DIAS_PRIMERAS_SEMANAS * MS_DIA;
      const nEnPrimerasSemanas = arr.filter(a => new Date(a.creadoEn).getTime() <= hastaPrimerasSemanas).length;
      if (nEnPrimerasSemanas >= MIN_ASISTENCIAS_CONVERTIDA) convertidas++;
    }

    // Red social: de las alumnas atribuidas, % cuyo `referidoPor` apunta a
    // OTRA alumna que TAMBIÉN está atribuida a esta instructora — evidencia
    // real de que cultiva una clase donde la gente se trae amigas (no hay
    // vínculo instructora→socia en el esquema, así que "ella misma refiere"
    // se opera con el dato que sí existe).
    const setAlumnas = new Set(alumnas);
    let conReferidaEnClase = 0;
    for (const socioId of alumnas) {
      const socio = socioPorId.get(socioId);
      if (socio?.referidoPor && setAlumnas.has(socio.referidoPor)) conReferidaEnClase++;
    }

    return {
      instructorId: ins.id, nombre: ins.nombre, nAlumnasAtribuidas: alumnas.length, datosInsuficientes: false,
      retencionPct: paraRetencion > 0 ? redondear1((retenidas / paraRetencion) * 100) : null,
      nParaRetencion: paraRetencion,
      conversionPct: paraConversion > 0 ? redondear1((convertidas / paraConversion) * 100) : null,
      nParaConversion: paraConversion,
      redSocialPct: alumnas.length > 0 ? redondear1((conReferidaEnClase / alumnas.length) * 100) : null,
    };
  });
}

function redondear1(n: number): number {
  return Math.round(n * 10) / 10;
}
