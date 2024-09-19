import {deepEqual as de} from 'assert'
import sinon from 'sinon';
import {Garden} from "../logic/garden.js";
import {all_seeds, seed_from_id} from "../data/seed.js";
import {random_element, range} from "../util/_.js";
import {set_min_level} from "../util/logger.js";

describe('Garden', () => {
    /*** @type {SinonSandbox}*/
    let sb;
    beforeEach(() => {
        sb?.restore()
        sb = sinon.createSandbox({});
        sb.useFakeTimers({toFake: ['setTimeout', 'setInterval']});
        set_min_level('debug');
    });

    it('plant flow all success', async () => {
        set_min_level('none');
        // Math.random() = 1
        sb.stub(Math, 'random').returns(1);

        let end = 10;
        let start = -end;

        const garden = new Garden({inMemoryOnly: true});
        await garden.init();

        for (let x = start; x < end; x++) {
            for (let y = start; y < end; y++) {
                await garden.add_plants({x, y, seed: 0});
                sb.clock.now += 50;
            }
        }

        const {time, stages} = seed_from_id(0);

        for (let i = 0; i < stages - 1; i++) {
            await sb.clock.tickAsync(time);
        }

        let search = await garden.t.find({dmg: true});
        de(search, [], 'should be no damaged plants');

        const has_plants = await Promise.all(
            range(start, end).flatMap(x => range(start, end).map(y => ({x, y})))
                .map(pos => garden.has_plant(pos)));

        de(has_plants.every(x => !!x), true, 'plant is not existed');

        search = await garden.t.find({
            $or: [
                {x: {$lt: start}},
                {y: {$lt: start}},
                {x: {$gt: end}},
                {y: {$gt: end}},
            ]
        });

        de(search, [], 'wrong positioning');

        search = await garden.t.find({stage: {$ne: stages}});
        de(search, [], 'wrong stages calculation');
    });
});