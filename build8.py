"""Build the v8 lab: one bundle, two tabs (Compare A vs B, Compounding).

Concatenation order (plan E1): "use strict" -> app_store8 -> eng_head6 -> eng_state8 -> eng_pos8 -> eng_dist6 ->
eng_ctx8 (or eng_ctx6) -> ui_common8 -> ui_cmp8 -> yr_cal, yr_path, yr_modus, yr_margin, yr_engine, yr_stress, yr_mc ->
yr_state, yr_ui -> app8. Missing yr files are skipped; without yr_ui.js a YR stub is injected (and yr_state.js is
skipped too, since the YR IIFE spans both files).
Shell: shell8.html with <!--YR_SHELL--> <- yr_shell8.html and /*YR_CSS*/ <- yr8.css (empty when missing).
Data: data8.json when present, else data.json.
Outputs: outputs/ram_koru_lab_v8.html (standalone) and SP/ram_koru_lab_v8_artifact.html (no doctype; artifact).
Then runs the isolation checks of plan E4 that need no browser (names, ids, yr code using comparer names).
"""
import os, re, sys, json
H = os.path.dirname(os.path.abspath(__file__))
OUT = '/home/user/voltagent-chat/outputs/ram_koru_lab_v8.html'
ART = os.path.join(H, 'ram_koru_lab_v8_artifact.html')
P = lambda f: os.path.join(H, f)
ex = lambda f: os.path.exists(P(f)) and not ('--no-yr' in sys.argv and (f.startswith('yr_') or f == 'yr8.css'))
r = lambda f: open(P(f), encoding='utf-8').read()

# test options: --no-yr builds the comparer with the YR stub; --out PATH writes the standalone page there instead;
# --data FILE embeds that data file (the v7 regression uses data.json)
NO_YR = '--no-yr' in sys.argv
if '--out' in sys.argv: OUT = sys.argv[sys.argv.index('--out') + 1]; ART = os.path.splitext(OUT)[0] + '_artifact.html'
YR_PURE = ['yr_cal.js', 'yr_path.js', 'yr_modus.js', 'yr_margin.js', 'yr_engine.js', 'yr_stress.js', 'yr_mc.js']
YR_UI = ['yr_state.js', 'yr_ui.js']
STUB = 'const YR={init(){},render(){},getState(){return null},setState(){},reset(){}};\n'

files = ['app_store8.js', 'eng_head6.js', 'eng_state8.js', 'eng_pos8.js', 'eng_dist6.js',
         'eng_ctx8.js' if ex('eng_ctx8.js') else 'eng_ctx6.js', 'ui_common8.js', 'ui_cmp8.js']
files += [f for f in YR_PURE if ex(f)]
yr_ui = ex('yr_ui.js')
if yr_ui: files += [f for f in YR_UI if ex(f)]
parts = ['"use strict";\n']
for f in files:
    parts.append(f'// ---------------------------------------------------------------- {f}\n' + r(f).rstrip('\n') + '\n')
if not yr_ui: parts.append('// ---------------------------------------------------------------- YR stub (yr_ui.js not built yet)\n' + STUB)
parts.append('// ---------------------------------------------------------------- app8.js\n' + r('app8.js'))
js = ''.join(parts)
open(P('all8.js'), 'w', encoding='utf-8').write(js)

shell = r('shell8.html')
assert '<!--YR_SHELL-->' in shell and '/*YR_CSS*/' in shell, 'shell8.html lost a placeholder'
shell = shell.replace('<!--YR_SHELL-->', r('yr_shell8.html') if ex('yr_shell8.html') else '', 1)
shell = shell.replace('/*YR_CSS*/', r('yr8.css') if ex('yr8.css') else '', 1)
data_file = sys.argv[sys.argv.index('--data') + 1] if '--data' in sys.argv else 'data8.json' if ex('data8.json') else 'data.json'
data = r(data_file)
json.loads(data)   # fail the build on a broken data file
body = shell + "\n<script>\nconst D = " + data.strip() + ";\n</script>\n<script>\n" + js + "\n</script>\n"
open(ART, 'w', encoding='utf-8').write(body)
stand = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=1200">\n'
         + body.replace('</style>\n', '</style>\n</head>\n<body>\n', 1) + '</body>\n</html>\n')
open(OUT, 'w', encoding='utf-8').write(stand)
print(f'data: {data_file} · files: {", ".join(files)}{"" if yr_ui else " + YR stub"} · bundle {len(js)//1024} KB · page {len(stand)//1024} KB')

# ---------------------------------------------------------------- isolation checks (plan E4, the parts that need no browser)
problems = []
if not js.startswith('"use strict"'): problems.append('bundle does not start with "use strict"')
DECL = re.compile(r'^(?:async\s+)?(?:function\*?\s+([A-Za-z_$][\w$]*)|(?:const|let|var|class)\s+([A-Za-z_$][\w$]*))', re.M)
def top_names(src):
    # top level = no indentation; destructuring and comma lists are rare at top level here
    out = []
    for m in DECL.finditer(src):
        out.append(m.group(1) or m.group(2))
    return out
seen = {}
for f in files + ['app8.js']:
    for n in top_names(r(f)):
        if n in seen and seen[n] != f: problems.append(f'top-level name {n} in both {seen[n]} and {f}')
        elif n in seen: problems.append(f'top-level name {n} twice in {f}')
        seen.setdefault(n, f)
HEAD = set(top_names(r('eng_head6.js'))) | {'R', 'N', 'D'}
for f in [x for x in YR_PURE + YR_UI if ex(x)]:
    src = r(f)
    # names declared at the IIFE's top level (two-space indent) must not shadow eng_head6 globals
    for m in re.finditer(r'^  (?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var|class)\s+([A-Za-z_$][\w$]*))', src, re.M):
        n = m.group(1) or m.group(2)
        if n in HEAD: problems.append(f'{f}: IIFE name {n} shadows an eng_head6 global')
    allowed = {'BOOT'} if f == 'yr_state.js' else set()
    code = re.sub(r'//[^\n]*|/\*.*?\*/', '', src, flags=re.S)
    code = re.sub(r'(["\'`])(?:\\.|(?!\1).)*\1', '""', code)
    for n in ['st', 'C', 'fU', 'fUt', 'trow', 'hb', 'build', 'val', 'statsBase', 'statsHV', 'GRID', 'EDITORS', 'BOOT']:
        if n in allowed: continue
        if re.search(r'(?<![\w$.])' + re.escape(n) + r'(?![\w$])(?!\s*:(?!:))', code): problems.append(f'{f}: uses comparer name {n}')
ids = re.findall(r'\sid="([^"]+)"', shell)
dup = sorted({i for i in ids if ids.count(i) > 1})
if dup: problems.append('duplicate ids in the page: ' + ', '.join(dup))
print('isolation checks: ' + ('OK' if not problems else f'{len(problems)} problem(s)'))
for p in problems: print('  - ' + p)
sys.exit(1 if problems and '--strict' in sys.argv else 0)
