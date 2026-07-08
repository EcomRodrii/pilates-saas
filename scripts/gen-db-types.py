import re

sql = open('supabase/schema.sql').read()

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

for name, body in re.findall(r'create table if not exists (\w+)\s*\((.*?)\n\);', sql, re.S | re.I):
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

# merge ALTER TABLE ADD COLUMN (always optional -> nullable)
for name, col, rest in re.findall(r'alter table (\w+) add column (?:if not exists )?([a-z_][a-z0-9_]*)\s+([^\n;]+)', sql, re.I):
    if name not in tables:
        tables[name] = {}; order.append(name)
    if col not in tables[name]:
        tables[name][col] = sql_to_ts(parse_type(rest), False)

out = ['// AUTO-GENERADO desde supabase/schema.sql — filas de BD (snake_case).',
       '// Regenerar con: python3 scripts/gen-db-types.py  (no editar a mano).',
       '/* eslint-disable @typescript-eslint/no-explicit-any */', '']
for name in order:
    out.append(f'export interface Row{pascal(name)} {{')
    for col, ts in tables[name].items():
        out.append(f'  {col}: {ts};')
    out.append('}')
    out.append('')

open('lib/db-types.ts','w').write('\n'.join(out))
print(f'{len(order)} interfaces. RowStudios tiene stripe_account_id:', 'stripe_account_id' in tables['studios'])
print('socios cols:', list(tables['socios'].keys()))
