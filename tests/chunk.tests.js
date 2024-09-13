import {deepEqual as de} from 'assert'
import {describe, it, beforeEach} from 'node:test';
import {createSandbox} from 'sinon';
import * as loc from '../data/location.js';
import {Chunk} from "../data/chunk.js";
import {Seed} from "../data/seed.js";

const sec = 1000, min = 60*sec;

describe('Chunk', () => {
    /*** @type {SinonSandbox}*/
    let sb;

    beforeEach(() => {
        sb?.restore();
        sb = createSandbox();
    });

    it('works [always success]', () => {
        loc.t.chunk_size = 100;
        sb.stub(Math, 'random').returns(1);
        const clock = sb.useFakeTimers();

        const seed = new Seed('test', 4, 2*min , 0.5, 10);
        const chunk = new Chunk(50, 44);

        de(chunk.i, 0);
        de(chunk.j, 0);

        chunk.init([]);
        de(chunk.interval, null);

        // was plant successfully
        de(chunk.plant_seed(seed, 10, 10), true);

        // interval is exists
        de(!!chunk.interval, true);

        de(chunk.t.queue.keys().length, 1);

        // immitating growth time
        clock.tick(seed.per_stage);

        const plant = chunk.t.plants.get(10, 10);
        de(plant?.stage, 1);
    });
});