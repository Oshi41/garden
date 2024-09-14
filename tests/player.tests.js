import {deepEqual as de} from 'assert'
import {describe, it, beforeEach} from 'node:test';
import {createSandbox} from 'sinon';
import {Seed} from '../data/seed.js';
import {Chunk} from '../data/chunk.js';
import {Player} from '../data/player.js';
import {distance} from "../data/location.js";

const sec = 1000, min = 60 * sec;

describe('Player', () => {
    /*** @type {SinonSandbox}*/
    let sb;
    /**
     * @type {Chunk}
     */
    let chunk;
    let player;

    beforeEach(() => {
        sb?.restore();
        sb = createSandbox({useFakeTimers: true});

        chunk = new Chunk(1, 1);
        const seed = new Seed('test', 4, 2 * 60 * 1000, 0.5, 10);

        for (let x = 0; x < 10; x++) {
            for (let y = 0; y < 10; y++) {
                chunk.plant_seed(seed, x, y);
            }
        }

        player = new Player('1', 0, 0);
    });

    describe('interaction', () => {
        it('works', () => {
            // always success
            sb.stub(Math, 'random').returns(1);

            const player = new Player('1', 0, 0);
            de(player.cords, {x: 0, y: 0});

            sb.clock.tick(sec);
            player.cords = {x: player.max_speed - Number.EPSILON, y: 0};
            de(player.cords, {x: player.max_speed - Number.EPSILON, y: 0});

            sb.clock.tick(sec);
            player.cords = {x: player.max_speed - Number.EPSILON, y: player.max_speed - Number.EPSILON};
            de(player.cords, {x: player.max_speed - Number.EPSILON, y: player.max_speed - Number.EPSILON});

            // assuming it's not damaged
            const plant = chunk.t.plants.get(player.max_speed, player.max_speed);
            plant.damaged = false;

            de(plant.is_dead, false);
            de(plant.is_finished, false);

            // nothing to do, as plant is not fully grown
            de(player.interact(chunk, player.max_speed, player.max_speed), false);

            // assumming plant is damaged
            plant.damaged = true;

            // trying to remove weed, but fail due to spam request
            de(player.interact(chunk, player.max_speed, player.max_speed), false);
            de(plant.damaged, true);

            // skipping time to prevent spam
            sb.clock.tick(sec);
            de(player.interact(chunk, player.max_speed, player.max_speed), true);
            de(plant.damaged, false);

            // assuming it's fully finished
            plant.stage = plant.seed.stages;

            // interaction timeout
            sb.clock.tick(sec);
            de(player.interact(chunk, player.max_speed, player.max_speed), true);
            // plant collected
            de(chunk.t.plants.has(player.max_speed, player.max_speed), false);

            // player has seeds in inventory
            de(player.t.inventory.get(plant.seed.index), plant.seed.max_result);

            // assuming all the plants are grown
            for (let p of chunk.t.plants.get_all()) {
                p.stage = p.seed.stages;
            }

            for (let x = 0; x < 10; x++) {
                for (let y = 0; y < 10; y++) {
                    if (distance(player.cords, {x, y}) > player.reach_limit) {
                        // interaction timeout
                        sb.clock.tick(sec);
                        // too far away
                        de(player.interact(chunk, x, y), false);
                    }
                }
            }
        });
    });
});