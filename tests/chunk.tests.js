import {deepEqual as de} from 'assert'
import {describe, it, beforeEach} from 'node:test';
import {createSandbox} from 'sinon';
import {get_chunk_size, chunk_from_point, t as test_location} from '../data/location.js';
import {get_min_level, set_min_level} from '../util/logger.js';
import {Chunk} from "../data/chunk.js";
import {Seed, all_seeds, seed_from_id} from "../data/seed.js";
import {Plant} from "../data/plant.js";

const sec = 1000, min = 60 * sec;

describe('Chunk', () => {
    /*** @type {SinonSandbox}*/
    let sb;

    beforeEach(() => {
        sb?.restore();
        sb = createSandbox({useFakeTimers: true});
    });

    it('works [always success]', () => {
        test_location.set_chunk_size(100);
        sb.stub(Math, 'random').returns(1);

        const seed = new Seed('test', 4, 2 * min, 0.5, 10);
        const chunk = new Chunk(50, 44);

        de(chunk.i, 0);
        de(chunk.j, 0);

        chunk.init([]);
        de(chunk.interval, null);

        // was plant successfully
        de(chunk.plant_seed(seed, 10, 10), true);

        // obtaining plant from chunk
        const plant = chunk.t.plants.get(10, 10);

        for (let i = 0; i < plant.seed.stages; i++) {
            de(plant.stage, i);

            // interval is exists
            de(!!chunk.interval, true);

            // only one plant i scheduling
            de(chunk.t.queue.keys().length, 1);

            // immitating growth time
            sb.clock.tick(seed.per_stage);

            de(plant.stage, i + 1);
        }

        de(plant.is_finished, true);
    });
    it('works [always fail]', () => {
        test_location.set_chunk_size(100);
        sb.stub(Math, 'random').returns(0);

        const seed = new Seed('test', 4, 2 * min, 0.5, 10);
        const chunk = new Chunk(50, 44);

        // was plant successfully
        de(chunk.plant_seed(seed, 10, 10), true);

        // obtaining plant from chunk
        const plant = chunk.t.plants.get(10, 10);
        de(plant.damaged, false);

        for (let i = 0; i < plant.seed.stages + 1; i++) {
            // interval is exists
            de(!!chunk.interval, true);

            // only one plant i scheduling
            de(chunk.t.queue.keys().length, 1);

            // immitating growth time
            sb.clock.tick(seed.per_stage);

            de(plant.damaged, true);
        }

        de(plant.is_dead, true);

        // interval is not exists
        de(!!chunk.interval, false);
    });
    it('full size test', (t, done) => {
        sb.clock.restore();
        test_location.set_chunk_size(2_000);
        set_min_level('log');
        const now = Date.now();
        const chunk = new Chunk(50, 44);
        const seeds = all_seeds().length;

        const plants = [];

        console.time('creating plants');
        for (let x = 0; x < get_chunk_size(); x++) {
            for (let y = 0; y < get_chunk_size(); y++) {
                const seed_id = Math.floor(Math.random() * seeds);
                plants.push(new Plant(x, y, seed_id));
            }
        }
        console.timeEnd('creating plants');

        de(plants.length, Math.pow(get_chunk_size(), 2));

        console.time('filling chunk');
        chunk.init(plants);
        console.timeEnd('filling chunk');

        if (Date.now() - now > 5 * 1000) {
            console.error('Full chunk took more than 5 seconds to load');
        }

        done();
    });
});