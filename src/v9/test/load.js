// Test loader: runs eng_head6 + the v9 model files in a fresh vm context, in strict mode, on a deep-frozen D.
"use strict";
const fs = require("fs"), vm = require("vm"), path = require("path");
const SP = path.resolve(__dirname, "../..");
const V9 = path.resolve(__dirname, "..");
const MODEL = ["dist9.js", "inst9.js", "rule9.js", "pos9.js", "cmp9.js", "state9.js", "ctx9.js"];
function deepFreeze(o) { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); } return o; }
function realD() { return JSON.parse(fs.readFileSync(path.join(SP, "data8.json"), "utf8")); }
// load(D, {files, freeze}) -> {D, INST, RULE, POS, DIST, CMP, STATE, CTX, ctx, ...}
function load(D, opt = {}) {
  D = D || realD();
  if (opt.freeze !== false) deepFreeze(D);
  const ctx = { D, console, Math, JSON, Map, Set, WeakMap, Number, Object, Array, String, Boolean, Symbol, Proxy, Reflect, Error, TypeError, RangeError,
    isFinite, isNaN, parseFloat, parseInt, Date, RegExp, Infinity, NaN, atob, btoa, escape, unescape, encodeURIComponent, decodeURIComponent,
    document: { querySelector() { return null; } }, getComputedStyle() { return { getPropertyValue() { return ""; } }; } };
  vm.createContext(ctx);
  const files = opt.files || MODEL.filter(f => fs.existsSync(path.join(V9, f)));
  let src = '"use strict";\n' + fs.readFileSync(path.join(SP, "eng_head6.js"), "utf8") + "\n";
  for (const f of files) src += fs.readFileSync(path.join(V9, f), "utf8") + "\n";
  const names = ["INST", "RULE", "POS", "DIST", "CMP", "STATE", "CTX", "cdfT", "cdfAt", "quantAt", "fK", "fmtE", "R", "bs", "N", "smile", "wingAnchors", "impliedVol"];
  src += "\n;globalThis.__x = {" + names.map(n => `${n}: typeof ${n} === "undefined" ? undefined : ${n}`).join(", ") + "};";
  vm.runInContext(src, ctx, { filename: "v9-model-bundle.js" });
  return { D, ctx, ...ctx.__x };
}
// the v8 engine (reference only, for parity tests): eng_head6 + eng_state8 + eng_pos8 (+ eng_dist6, eng_ctx8)
function loadV8(D) {
  D = D || realD();
  const ctx = { D, console, Math, JSON, Map, Set, Number, Object, Array, String, isFinite, document: { querySelector() { return null; } }, getComputedStyle() { return { getPropertyValue() { return ""; } }; }, BOOT: { cmp: null } };
  vm.createContext(ctx);
  let src = '"use strict";\n' + ["eng_head6.js", "eng_state8.js", "eng_pos8.js", "eng_dist6.js"].map(f => fs.readFileSync(path.join(SP, f), "utf8")).join("\n");
  src += "\n;globalThis.__x = {build, chain, payoff, val, R, bs, smile, setSt: o => { Object.assign(st, o); }, getSt: () => st};";
  vm.runInContext(src, ctx, { filename: "v8-engine.js" });
  return { D, ctx, ...ctx.__x };
}
module.exports = { load, loadV8, realD, deepFreeze, SP, V9 };
