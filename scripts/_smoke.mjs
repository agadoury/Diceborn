import { JSDOM } from "jsdom";
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="root"></div></body></html>', {
  url: "http://localhost:5173/play?mode=vs-ai&p1=berserker&p2=pyromancer", pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;
globalThis.SVGElement = dom.window.SVGElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.matchMedia = (q) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null });
dom.window.matchMedia = globalThis.matchMedia;
globalThis.performance = { now: () => Date.now() };
globalThis.AudioContext = class { resume() { return Promise.resolve(); } close() {} createGain() { return { gain: { value: 1 }, connect: () => {}, disconnect: () => {} }; } get destination() { return {}; } currentTime = 0; };
dom.window.AudioContext = globalThis.AudioContext;
globalThis.localStorage = dom.window.localStorage;
let firstError = null;
process.on("uncaughtException", e => { if (!firstError) firstError = e; });
const errors = [];
const orig = console.error;
console.error = (...args) => { errors.push(args.map(a => a instanceof Error ? a.stack || a.message : String(a)).join(" ").slice(0, 200)); orig(...args); };
const React = (await import("react")).default;
const ReactDOM = await import("react-dom/client");
const { BrowserRouter } = await import("react-router-dom");
const App = (await import("/home/user/Diceborn/src/App.tsx")).default;
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(BrowserRouter, null, React.createElement(App)));
await new Promise(r => setTimeout(r, 400));
const html = document.getElementById("root").innerHTML;
console.log("ROOT HTML LEN:", html.length);
// Count glyph paths to confirm sigils render. Each glyph has at least one <path>.
const sigilHits = (html.match(/M50 12 L54 84 L46 84/g) || []).length;   // BerserkerAxe path
const pyroEmberHits = (html.match(/M50 14 C40 32 60 40 50 56/g) || []).length;
console.log("BerserkerAxe path occurrences:", sigilHits);
console.log("PyroEmber path occurrences:", pyroEmberHits);
console.log("HOOK ERR:", errors.find(e => e.includes("Rendered more hooks")) ? "PRESENT" : "(none)");
console.log("UNDEFINED ACCESS:", errors.find(e => e.includes("Cannot read properties of undefined")) ? "PRESENT" : "(none)");
console.log("UNCAUGHT:", firstError ? firstError.message : "(none)");
