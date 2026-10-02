// T22 build smoke tests: the build's options keep working with the tsc gate on (python3 build.py --no-yr builds the
// YR stub and type-checks exactly the bundled files), and the Compounding files cannot reach the page except through
// their port. Each build writes to a temporary folder (--out) under this folder's scratch/, never to this folder's
// outputs and never outside this folder.
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const { V9 } = require("./load.js");
const SCRATCH = path.join(V9, "scratch");
// a fresh folder under scratch/ (git-ignored), removed by the caller
function makeScratchFolder(prefix) {
  fs.mkdirSync(SCRATCH, { recursive: true });
  return fs.mkdtempSync(path.join(SCRATCH, prefix));
}
// the sources without scratch/ and .git (a copy into scratch/ cannot include scratch/ itself)
function copySources(target) {
  for (const name of fs.readdirSync(V9)) {
    if (name === "scratch" || name === ".git") { continue; }
    fs.cpSync(path.join(V9, name), path.join(target, name), { recursive: true });
  }
}

function build({ args, folder }) {
  const out = makeScratchFolder("rk_build_");
  const run = spawnSync("python3", [path.join(folder || V9, "build.py"), ...args, "--out", path.join(out, "lab.html")], { encoding: "utf8", cwd: folder || V9 });
  return { out, run, text: run.stdout + run.stderr };
}

test("T22 build --no-yr: the YR stub is bundled and type-checked, the tsc gate passes", () => {
  const { out, run, text } = build({ args: ["--no-yr"] });
  try {
    assert.equal(run.status, 0, text);
    assert.match(text, /tsc: 0 error\(s\)/);
    const page = fs.readFileSync(path.join(out, "lab.html"), "utf8");
    assert.match(page, /YR stub \(yr_ui\.js not built\)/);
    assert.doesNotMatch(page, /---- yr_ui\.js\n/);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test("T22 build: a yr file that reaches the page outside its port fails the build", () => {
  const copy = makeScratchFolder("rk_src_");
  try {
    copySources(copy);
    const yr = path.join(copy, "yr_ui.js");
    fs.writeFileSync(yr, fs.readFileSync(yr, "utf8").replace("let port = {", "const leak = () => page.executor.execute({ type: Command.Reset });\n  let port = {"));
    const { out, run, text } = build({ args: ["--no-tsc"], folder: copy });
    fs.rmSync(out, { recursive: true, force: true });
    assert.equal(run.status, 1, text);
    assert.match(text, /yr_ui\.js: uses comparer name page/); assert.match(text, /yr_ui\.js: uses comparer name Command/);
  } finally { fs.rmSync(copy, { recursive: true, force: true }); }
});
