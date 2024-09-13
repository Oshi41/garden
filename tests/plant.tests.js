import {deepEqual as de} from 'assert'
import {describe, it, beforeEach} from 'node:test';
import {createSandbox} from 'sinon';
import {Plant} from '../data/plant.js';
import {Seed} from '../data/seed.js';

describe('Plant', () => {
    /*** @type {SinonSandbox}*/
    let sb;

    beforeEach(() => {
        sb?.reset();
        sb = createSandbox();
    });

    it('works [always success]', () => {
        sb.stub(Math, 'random').returns(1);

        const seed = new Seed('test', 4, 10, 0.5, 10);
        const plant = new Plant(0, 0, seed);

        for (let i = 0; i < seed.stages; i++) {
            de(plant.stage, i);
            de(plant.damaged, false);
            de(plant.is_finished, false);
            de(plant.is_dead, false);
            plant.tick();
        }

        de(plant.is_finished, true);
        de(plant.seed.random_drop(), seed.max_result);
    });
    it('works [always fail]', () => {
        sb.stub(Math, 'random').returns(0);

        const seed = new Seed('test', 4, 10, 0.5, 10);
        const plant = new Plant(0, 0, seed);

        de(plant.damaged, false);
        plant.tick();
        de(plant.damaged, true);
        de(plant.stage, 0);

        for (let i = 0; i < seed.stages; i++) {
            de(plant.stage, -i);
            de(plant.damaged, true);
            de(plant.is_finished, false);
            de(plant.is_dead, false);
            plant.tick();
        }

        de(plant.is_dead, true);
        de(plant.seed.random_drop(), 1);
    });
});