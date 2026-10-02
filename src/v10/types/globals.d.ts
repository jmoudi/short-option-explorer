// What the page gets from outside its bundle (never bundled; read by the tsc gate only).
// D: the data file, inlined by build.py as `const D = {...}` in its own <script> before the bundle.
declare namespace Lab {
  interface Quote { K: number; cp: "P" | "C"; bid: number; ask: number; mid: number; ivm: number | null }
  interface Expiry { dte: number; T: number; F: number; atm: number; coef: number[]; xlo: number; xhi: number; q: Quote[]; [field: string]: any }
  interface Underlying { S: number; pre?: number; hv: number; lev: number; name?: string; exps: { [yyyymmdd: string]: Expiry }; [field: string]: any }
  interface Data { meta: { asof: string; rate: number; [field: string]: any }; u: { [ticker: string]: Underlying }; cal?: { [ticker: string]: any }; [field: string]: any }
  // the claude.ai viewer's runtime, present only inside the viewer
  interface ViewerRuntime { use(capability: string): Promise<any> }
}
declare const D: Lab.Data;
interface Window { claude?: Lab.ViewerRuntime }
// The Compounding engine files also export their namespace for node (`module.exports = COMPOUND_ENGINE`), which makes tsc read
// them as CommonJS modules; the bundle uses them as globals.
declare const COMPOUND_ENGINE: typeof import("../compound_engine.js");
declare const COMPOUND_STRESS: typeof import("../compound_stress.js");
