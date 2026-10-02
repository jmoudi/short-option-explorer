"""Build the v9 lab: one bundle, two tabs (Compare A vs B rebuilt on the v9 model, Compounding unchanged).

Bundle order (SPEC_FINAL §3.1): "use strict" -> app_store9 -> eng_head6 -> dist9 -> inst9 -> rule9 -> pos9 -> cmp9 ->
state9 -> ctx9 -> ui_common8 -> ui9_summary -> ui9_dock -> ui9_views -> the Compounding yr files (unchanged; a YR stub
when yr_ui.js is missing, as in build8) -> app9.
v9 files come from this folder (SP/v9); eng_head6, ui_common8, the yr files, yr_shell8.html, yr8.css and data8.json
from SP. eng_state8 / eng_pos8 / eng_dist6 / eng_ctx8 are reference only and are not bundled.
Shell: shell9.html with <!--YR_SHELL--> <- yr_shell8.html, /*YR_CSS*/ <- yr8.css, /*VIEWS9_CSS*/ <- views9.css.
Outputs: /home/user/short-option-explorer/dist/ram_koru_lab_v9.html (standalone) and SP/v9/ram_koru_lab_v9_artifact.html
(no doctype; artifact). The bundle is also written to SP/v9/scratch/all9.js for debugging.

The build fails (exit 1) when (§3.1):
  - a v9 module other than inst9 matches D.u, TKS/EXPS, a quoted ticker, `st.` or a bare call to a v8 engine function;
  - a v9 model module declares a top-level name other than its namespace object (dist9 may keep cdfT/cdfAt/quantAt),
    or a UI / app module declares a name outside its declared list, or two bundled files declare the same name;
  - any UI string (page, CSS, bundle) contains wrinkle, seam or smell;
  - in either theme --diff-warn is < 30 degrees of OKLCH hue from --b, or --diff-warn / --debit has text contrast < 4.5:1
    against --surface;
  - the page has duplicate ids (shell + Compounding shell + the panels the views inject), or a yr file uses a
    comparer name.
Options: --no-yr (YR stub), --out PATH (standalone output; the artifact goes next to it), --warn (report, exit 0).
"""
import os, re, sys, json, math
V9 = os.path.dirname(os.path.abspath(__file__))
SP = os.path.dirname(V9)
OUT = '/home/user/short-option-explorer/dist/ram_koru_lab_v9.html'
ART = os.path.join(V9, 'ram_koru_lab_v9_artifact.html')
if '--out' in sys.argv:
    OUT = os.path.abspath(sys.argv[sys.argv.index('--out') + 1]); ART = os.path.splitext(OUT)[0] + '_artifact.html'
NO_YR = '--no-yr' in sys.argv

MODEL = ['dist9.js', 'inst9.js', 'rule9.js', 'pos9.js', 'cmp9.js', 'state9.js', 'ctx9.js']
UI9 = ['ui9_summary.js', 'ui9_dock.js', 'ui9_views.js']
YR_PURE = ['yr_cal.js', 'yr_path.js', 'yr_modus.js', 'yr_margin.js', 'yr_engine.js', 'yr_stress.js', 'yr_mc.js']
YR_UI = ['yr_state.js', 'yr_ui.js']
STUB = 'const YR={init(){},render(){},getState(){return null},setState(){},reset(){}};\n'
# where each bundled file lives
HOME = {f: V9 for f in ['app_store9.js'] + MODEL + UI9 + ['app9.js']}
for f in ['eng_head6.js', 'ui_common8.js'] + YR_PURE + YR_UI: HOME[f] = SP
P = lambda f: os.path.join(HOME.get(f, V9), f)
def ex(f, d=None):
    p = os.path.join(d, f) if d else P(f)
    return os.path.exists(p) and not (NO_YR and (f.startswith('yr_') or f == 'yr8.css'))
def r(f, d=None):
    return open(os.path.join(d, f) if d else P(f), encoding='utf-8').read()

files = ['app_store9.js', 'eng_head6.js'] + MODEL + ['ui_common8.js'] + UI9
yr_files = [f for f in YR_PURE if ex(f)]
yr_ui = ex('yr_ui.js')
if yr_ui: yr_files += [f for f in YR_UI if ex(f)]
files += yr_files
missing = [f for f in files + ['app9.js'] if not os.path.exists(P(f))]
if missing: sys.exit('missing source files: ' + ', '.join(missing))
parts = ['"use strict";\n']
for f in files:
    parts.append(f'// ---------------------------------------------------------------- {f}\n' + r(f).rstrip('\n') + '\n')
if not yr_ui: parts.append('// ---------------------------------------------------------------- YR stub (yr_ui.js not built)\n' + STUB)
parts.append('// ---------------------------------------------------------------- app9.js\n' + r('app9.js'))
js = ''.join(parts)
os.makedirs(os.path.join(V9, 'scratch'), exist_ok=True)
open(os.path.join(V9, 'scratch', 'all9.js'), 'w', encoding='utf-8').write(js)

shell = r('shell9.html', V9)
for ph in ['<!--YR_SHELL-->', '/*YR_CSS*/', '/*VIEWS9_CSS*/']:
    assert shell.count(ph) == 1, f'shell9.html: placeholder {ph} missing or repeated'
views_css = r('views9.css', V9)
yr_shell = r('yr_shell8.html', SP) if ex('yr_shell8.html', SP) else ''
yr_css = r('yr8.css', SP) if ex('yr8.css', SP) else ''
shell = shell.replace('<!--YR_SHELL-->', yr_shell, 1).replace('/*VIEWS9_CSS*/', views_css, 1).replace('/*YR_CSS*/', yr_css, 1)
data = r('data8.json', SP)
json.loads(data)   # fail the build on a broken data file
body = shell + "\n<script>\nconst D = " + data.strip() + ";\n</script>\n<script>\n" + js + "\n</script>\n"
stand = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=1200">\n'
         + body.replace('</style>\n', '</style>\n</head>\n<body>\n', 1) + '</body>\n</html>\n')

# ---------------------------------------------------------------- checks (§3.1), before anything is written
problems = []
if not js.startswith('"use strict"'): problems.append('bundle does not start with "use strict"')

# source rules: every v9 module except inst9, comments included (as test/t01 checks them)
RULES = [
    (r'\bD\.u\b', 'reads D.u'),
    (r'\b(TKS|EXPS)\b', 'uses TKS / EXPS'),
    (r'["\'](RAM|KORU)["\']', 'hard-codes a ticker'),
    (r'\bst\.', 'reads st.'),
    (r'(^|[^.\w$])(smile|wingAnchors|chain|maxDelta|build|dist|val|legPx|ivAt|statsBase|context)\(', 'bare call to a v8 engine function'),
]
V9_MODULES = ['app_store9.js'] + MODEL + UI9 + ['app9.js']
for f in V9_MODULES:
    if f == 'inst9.js': continue
    src = r(f)
    for rx, what in RULES:
        for m in re.finditer(rx, src, re.M):
            ln = src.count('\n', 0, m.start()) + 1
            problems.append(f'{f}:{ln}: {what}: {m.group(0).strip()!r}')

# top-level names
DECL = re.compile(r'^(?:async\s+)?(?:function\*?\s+([A-Za-z_$][\w$]*)|(?:const|let|var|class)\s+([A-Za-z_$][\w$]*))', re.M)
def top_names(src):
    out = []
    for m in DECL.finditer(src):
        out.append(m.group(1) or m.group(2))
    # comma lists at the top level: const A = 1, B = 2 (one line)
    for m in re.finditer(r'^(?:const|let|var)\s+(.+?);?\s*$', src, re.M):
        line = m.group(1)
        depth, cur, names = 0, '', []
        for ch in line:
            if ch in '([{': depth += 1
            elif ch in ')]}': depth -= 1
            if ch == ',' and depth == 0: names.append(cur); cur = ''
            else: cur += ch
        names.append(cur)
        for n in names[1:]:
            mm = re.match(r'\s*([A-Za-z_$][\w$]*)\s*=', n)
            if mm: out.append(mm.group(1))
    return out
ALLOWED = {
    'dist9.js': {'DIST', 'cdfT', 'cdfAt', 'quantAt'}, 'inst9.js': {'INST'}, 'rule9.js': {'RULE'}, 'pos9.js': {'POS'},
    'cmp9.js': {'CMP'}, 'state9.js': {'STATE'}, 'ctx9.js': {'CTX'},
    'ui9_summary.js': {'SUM9', 'cmpRefresh', 'cmpDo', 'cmpChange', 'cmpEvents'}, 'ui9_dock.js': {'DOCK9'},
    'ui9_views.js': {'VIEWS', 'renderViews', 'wireViews'},
    'app_store9.js': {'KEY9', 'KEY8', 'KEY5', 'TABS', 'THEMES', 'readKey', 'writeBlob', 'BOOT'},
    'app9.js': {'S9', 'C', 'getS9', 'setS9', 'appSafe', 'cmpWire', 'renderAll', 'renderNotes', 'APP', 'ASYNC', 'lastCode', 'lastBlob',
                'applyTheme', 'yrState', 'appSave', 'syncTabs', 'appRender', 'setTab', 'dockClass', 'loadCode', 'codeLoaded', 'appBoot', 'appInit'},
}
seen = {}
for f in files + ['app9.js']:
    names = top_names(r(f))
    if f in ALLOWED:
        extra = sorted(set(names) - ALLOWED[f])
        if extra: problems.append(f'{f}: top-level name(s) outside its namespace: {", ".join(extra)}')
    for n in names:
        if n in seen and seen[n] != f: problems.append(f'top-level name {n} in both {seen[n]} and {f}')
        elif n in seen: problems.append(f'top-level name {n} twice in {f}')
        seen.setdefault(n, f)

# banned words in anything the page shows or ships (shell, CSS, bundle; the data file is quotes only)
for nm, txt in [('page shell + CSS', shell), ('bundle', js)]:
    for m in re.finditer(r'wrinkl|seam|smell', txt, re.I):
        ln = txt.count('\n', 0, m.start()) + 1
        problems.append(f'{nm}:{ln}: banned word: {txt[max(0, m.start() - 30):m.end() + 30]!r}')

# colour tokens: --diff-warn vs --b hue (OKLCH) and text contrast of --diff-warn / --debit on --surface
def css_vars(block):
    return {m.group(1): m.group(2).strip() for m in re.finditer(r'(--[\w-]+)\s*:\s*([^;}]+)', block)}
def theme_tokens(css):
    light, dmedia, dattr = {}, {}, {}
    # @media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){ ... } }
    for m in re.finditer(r'@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}', css):
        dmedia.update(css_vars(m.group(1)))
    for m in re.finditer(r':root\[data-theme="dark"\]\s*\{([^}]*)\}', css):
        dattr.update(css_vars(m.group(1)))
    for m in re.finditer(r'(?<![\w\]\)-]):root\s*\{([^}]*)\}', css):
        light.update(css_vars(m.group(1)))
    return light, {**light, **dmedia}, {**light, **dattr}
def hex_rgb(h):
    h = h.strip().lstrip('#')
    if len(h) == 3: h = ''.join(c * 2 for c in h)
    if not re.fullmatch(r'[0-9a-fA-F]{6}', h): return None
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
def lin(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def lum(rgb): l = [lin(c) for c in rgb]; return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]
def contrast(a, b): la, lb = lum(a), lum(b); return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
def oklch_h(rgb):
    r_, g_, b_ = [lin(c) for c in rgb]
    l = 0.4122214708 * r_ + 0.5363325363 * g_ + 0.0514459929 * b_
    m = 0.2119034982 * r_ + 0.6806995451 * g_ + 0.1073969566 * b_
    s = 0.0883024619 * r_ + 0.2817188376 * g_ + 0.6299787005 * b_
    l, m, s = [math.copysign(abs(x) ** (1 / 3), x) for x in (l, m, s)]
    a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return math.degrees(math.atan2(bb, a)) % 360
colour_report = []
for tname, toks in zip(['light', 'dark (system)', 'dark (chosen)'], theme_tokens(shell)):
    got = {k: hex_rgb(toks.get(k, '')) for k in ['--diff-warn', '--debit', '--b', '--surface']}
    bad = [k for k, v in got.items() if v is None]
    if bad: problems.append(f'colour check ({tname}): token(s) not a hex colour: {", ".join(bad)}'); continue
    dh = abs(oklch_h(got['--diff-warn']) - oklch_h(got['--b'])); dh = min(dh, 360 - dh)
    cw, cd = contrast(got['--diff-warn'], got['--surface']), contrast(got['--debit'], got['--surface'])
    colour_report.append(f'{tname}: warn-vs-B hue {dh:.0f}°, warn {cw:.2f}:1, debit {cd:.2f}:1')
    if dh < 30: problems.append(f'colour check ({tname}): --diff-warn is {dh:.1f}° of OKLCH hue from --b (< 30)')
    if cw < 4.5: problems.append(f'colour check ({tname}): --diff-warn contrast {cw:.2f}:1 (< 4.5)')
    if cd < 4.5: problems.append(f'colour check ({tname}): --debit contrast {cd:.2f}:1 (< 4.5)')

# ids: the shell, the Compounding shell and the panels the views inject into #views
ids = re.findall(r'\sid="([^"$]+)"', shell)
for f in UI9:
    ids += [i for i in re.findall(r'\sid="([^"$`{}]+)"', r(f))]
dup = sorted({i for i in ids if ids.count(i) > 1})
if dup: problems.append('duplicate ids in the page: ' + ', '.join(dup))


def strip_js(src):
    """Code only: comments removed, string / template / regex text blanked (template ${...} expressions kept)."""
    out, i, n, stack = [], 0, len(src), []   # stack: brace depth per open template expression
    prev = ''   # last significant code character, to tell a regex literal from a division
    while i < n:
        ch = src[i]
        if stack and ch == '}' and stack[-1] == 0:
            stack.pop(); i += 1   # back into the template text
            while i < n and src[i] != '`':
                if src[i] == '\\': i += 2; continue
                if src[i] == '$' and i + 1 < n and src[i + 1] == '{': stack.append(0); i += 2; break
                i += 1
            else:
                i += 1; out.append('""'); prev = '"'
            continue
        if ch == '/' and i + 1 < n and src[i + 1] == '/':
            j = src.find('\n', i); i = n if j < 0 else j; continue
        if ch == '/' and i + 1 < n and src[i + 1] == '*':
            j = src.find('*/', i + 2); i = n if j < 0 else j + 2; continue
        if ch in '"\'':
            j = i + 1
            while j < n and src[j] != ch:
                j += 2 if src[j] == '\\' else 1
            out.append('""'); i = j + 1; prev = '"'; continue
        if ch == '`':
            j = i + 1
            while j < n and src[j] != '`':
                if src[j] == '\\': j += 2; continue
                if src[j] == '$' and j + 1 < n and src[j + 1] == '{': break
                j += 1
            if j < n and src[j] == '`': out.append('""'); i = j + 1; prev = '"'; continue
            stack.append(0); out.append('""+('); i = j + 2; prev = '('; continue
        if ch == '/' and (prev == '' or prev in '(,=:[!&|?{};+-*%<>~^'):
            j, cls = i + 1, False
            while j < n and src[j] != '\n':
                c = src[j]
                if c == '\\': j += 2; continue
                if c == '[': cls = True
                elif c == ']': cls = False
                elif c == '/' and not cls: break
                j += 1
            out.append('/r/'); i = j + 1; prev = '/'; continue
        if stack:
            if ch == '{': stack[-1] += 1
            elif ch == '}': stack[-1] -= 1
        out.append(ch)
        if not ch.isspace(): prev = ch
        i += 1
    return ''.join(out)

notes = []
# the yr files must not use comparer names (they are bundled unchanged and talk to the app only through appSave)
HEAD = set(top_names(r('eng_head6.js'))) | {'R', 'N', 'D'}
for f in yr_files:
    src = r(f)
    for m in re.finditer(r'^  (?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var|class)\s+([A-Za-z_$][\w$]*))', src, re.M):
        n = m.group(1) or m.group(2)
        if n in HEAD: notes.append(f'{f}: IIFE name {n} shadows an eng_head6 global (inside its IIFE; bundled unchanged)')
    code = strip_js(src)
    for n in ['S9', 'C', 'getS9', 'setS9', 'SUM9', 'DOCK9', 'VIEWS', 'STATE', 'CMP', 'POS', 'RULE', 'INST', 'CTX', 'DIST', 'BOOT', 'renderAll']:
        # a use reads a member or calls it (C.A, getS9(), STATE.x); template-literal text such as "15C (really" is not one
        if re.search(r'(?<![\w$.])' + re.escape(n) + r'(?=\s*[.(\[])', code): problems.append(f'{f}: uses comparer name {n}')

print(f'files: {", ".join(files)}{"" if yr_ui else " + YR stub"}, app9.js')
print('colours: ' + ' · '.join(colour_report))
for n_ in notes: print('note: ' + n_)
print('checks: ' + ('OK' if not problems else f'{len(problems)} problem(s)'))
for p in problems: print('  - ' + p)
if problems and '--warn' not in sys.argv: sys.exit(1)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(ART, 'w', encoding='utf-8').write(body)
open(OUT, 'w', encoding='utf-8').write(stand)
print(f'bundle {len(js) // 1024} KB · page {len(stand) // 1024} KB -> {OUT}, {ART}')
