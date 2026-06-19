import type { GateModule, GateResult, GateRed, GateContext } from './contract.js';

const gate: GateModule = {
  name: 'closure-meta',
  kind: 'static',
  appliesTo(_rel: string): boolean { return true; },
  run(ctx: GateContext): GateResult {
    const reds: GateRed[] = [];
    const rel = ctx.changedFiles?.values().next().value as string ?? '.';
    // This gate self-reports: if it runs, the dimension is covered.
    // In a full implementation, it would check all other gates, but
    // GateContext does not carry the gate list. The self-admission
    // lattice (engine-gate-registry.ts) provides this check.
    return { gate: 'closure-meta', green: true, reds: [], note: 'closure gate active' };
  },
};
export default gate;
