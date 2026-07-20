import re

import glob, os
# Fuente de verdad = las migraciones, en orden de aplicación. Antes se leía
# supabase/schema.sql, un snapshot hecho a mano que se declaraba a sí mismo
# NO AUTORITATIVO y llevaba días divergido: faltaban sustituciones,
# valoraciones, webhook_events y rate_limits, así que el código las usaba
# sin tipos. Las migraciones son aditivas (ningún DROP/RENAME real), por lo
# que concatenarlas en orden reconstruye el esquema correctamente.
sql = '\n'.join(open(f).read() for f in sorted(glob.glob('supabase/migrations/*.sql')))

def sql_to_ts(coltype, notnull):
    coltype = coltype.strip().lower()
    if coltype.endswith('[]'):
        base = coltype[:-2]
        t = 'string[]' if 'text' in base or 'char' in base else 'number[]'
    elif 'int' in coltype or 'numeric' in coltype or 'serial' in coltype or 'real' in coltype or 'double' in coltype:
        t = 'number'
    elif 'bool' in coltype:
        t = 'boolean'
    elif 'jsonb' in coltype or coltype == 'json':
        t = 'any'
    else:
        t = 'string'
    return t if notnull else f'{t} | null'

def pascal(s): return ''.join(p.capitalize() for p in s.split('_'))

def parse_type(rest):
    tm = re.match(r'([a-z]+(?:\s*\([0-9, ]*\))?(?:\s*\[\])?)', rest, re.I)
    return tm.group(1) if tm else 'text'

tables = {}  # name -> dict(col->ts)
order = []

for name, body in re.findall(r'create table (?:if not exists )?(?:public\.)?(\w+)\s*\((.*?)\n\);', sql, re.S | re.I):
    cols = {}
    for raw in body.split('\n'):
        line = raw.strip().rstrip(',')
        low = line.lower()
        if not line or line.startswith('--'): continue
        if re.match(r'(primary\s+key|foreign\s+key|unique|check|constraint)\b', low): continue
        m = re.match(r'([a-z_][a-z0-9_]*)\s+(.*)', line, re.I)
        if not m: continue
        col, rest = m.group(1), m.group(2)
        if col.lower() in ('primary','foreign','unique','check','constraint'): continue
        notnull = 'not null' in rest.lower() or 'primary key' in rest.lower()
        cols[col] = sql_to_ts(parse_type(rest), notnull)
    tables[name] = cols
    order.append(name)

# merge ALTER TABLE ADD COLUMN (always optional -> nullable).
# Se procesa la SENTENCIA entera, no una línea: las migraciones escriben
#   ALTER TABLE public.socios
#     ADD COLUMN IF NOT EXISTS a text,
#     ADD COLUMN IF NOT EXISTS b text;
# es decir, el nombre de tabla y los ADD COLUMN van en líneas distintas y puede
# haber varios por sentencia. Buscar 'alter table X add column' en una sola
# línea capturaba 7 de 36 y perdía columnas reales (logo_url, sepa_*, etc.).
for m in re.finditer(r'alter table\s+(?:only\s+)?(?:public\.)?(\w+)(.*?);', sql, re.S | re.I):
    name, cuerpo = m.group(1), m.group(2)
    for col, rest in re.findall(r'add column\s+(?:if not exists\s+)?([a-z_][a-z0-9_]*)\s+([^,\n]+)', cuerpo, re.I):
        if name not in tables:
            tables[name] = {}; order.append(name)
        if col not in tables[name]:
            tables[name][col] = sql_to_ts(parse_type(rest), False)

# Afinado manual de columnas jsonb: el SQL solo dice "jsonb", que se traduce a
# `any`. Estas cuatro tienen forma conocida y estaba declarada a mano en el
# schema.sql anterior; se conserva aquí para no perder precisión de tipos al
# generar desde las migraciones.
TIPOS_MANUALES = {
    ('socios', 'campos_extra'): 'Record<string, string | number | boolean | null> | null',
    ('instructor_dependency_snapshots', 'detalle'):
        'Array<{ socioId: string; nombre: string; gasto: number; pctConInstructor: number }> | null',
    ('campanas', 'publicaciones'): 'unknown | null',
    ('automatizaciones', 'pasos'): 'unknown | null',
}
for (tabla, col), ts in TIPOS_MANUALES.items():
    if tabla in tables and col in tables[tabla]:
        tables[tabla][col] = ts

out = ['// AUTO-GENERADO desde supabase/migrations/*.sql — filas de BD (snake_case).',
       '// Regenerar con: python3 scripts/gen-db-types.py  (no editar a mano).',
       '/* eslint-disable @typescript-eslint/no-explicit-any */', '']
for name in order:
    out.append(f'export interface Row{pascal(name)} {{')
    for col, ts in tables[name].items():
        out.append(f'  {col}: {ts};')
    out.append('}')
    out.append('')

open('lib/db-types.ts','w').write('\n'.join(out))
print(f'{len(order)} interfaces generadas desde supabase/migrations/*.sql')
