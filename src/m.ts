// Resolution target for smoke-import-property.ts fixtures.
// The connection gate scans `from '...'` byte spans (including those inside the
// smoke test's string-literal fixtures) and requires each relative specifier to
// resolve to a real file. The fixtures reference './m' with named members A/B/C;
// exporting them here makes every wire the gate sees resolve, additively, without
// altering the byte-exact smoke fixture.
export const A = 1;
export const B = 2;
export const C = 3;
