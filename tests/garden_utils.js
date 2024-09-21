import {all_seeds} from "../data/seed.js";
import {deepEqual as de} from "assert";


/**
 * Grows all the garden
 * @param sb {sinon.SinonSandbox}
 * @param garden {Garden}
 * @param include_fail {boolean}
 * @returns {Promise<void>}
 */
export const grow_all_async = async (sb, garden, include_fail = false) => {
    let stages = Math.max(...all_seeds().map(x => x.stages));
    if (include_fail) {
        // worst case:
        // * make stages-1 steps forward and becomes damaged
        // * Losing 1 step if got damaged (stage will not change, only damage status)
        // * Returning stages-1 back to 0 stage
        // * Making stages steps back
        stages = (stages - 1) + 1 + (stages - 1) + stages;
    }

    const per_stage = Math.max(...all_seeds().map(x => x.per_stage));

    for (let i = 0; i < stages; i++) {
        await sb.clock.tickAsync(per_stage + garden.t.scheduler.t.min_step + 1);
    }

    const q = all_seeds().map(x => ({
        seed: x.index,
        stages: {$nin: [-x.stages, x.stages]},
    }));

    const search = await garden.t.find({$not: {$or: q}});
    de(search, [], 'Not all plants finished growing: ' + search.length);
}