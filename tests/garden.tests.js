import {deepEqual as de} from 'assert'
import sinon from 'sinon';
import {Garden} from "../logic/garden.js";
import {Seed} from "../data/seed.js";
import {range} from "../util/_.js";
import {set_min_level} from "../util/logger.js";

describe('Garden [stress test]', () => {
    /*** @type {SinonSandbox}*/
    let sb;
    beforeEach(() => {
        sb?.restore()
        sb = sinon.createSandbox({});
        set_min_level('none');
    });

    describe('stress test', () => {
        /*** @type {Garden}*/
        let garden;

        describe('stub time', () => {
            const seed = new Seed('test', 5, 1000, 0.5, 5);
            const amounts = [7000, 15_000];

            beforeEach(async () => {
                sb.stub(Math, 'random').returns(1);

                sb.useFakeTimers({toFake: ['setTimeout', 'setInterval', 'Date', 'clearTimeout', 'clearInterval']});
                garden = new Garden({inMemoryOnly: true});
                await garden.init();

                const count = amounts.shift();

                for (let x = 0; x < count; x++) {
                    await garden.add_plants({x, y: 0, seed: seed.index});
                    sb.clock.setSystemTime(sb.clock.now + 50);
                }

                de(!!garden.t.scheduler.task, true, 'Grow tick task should exist');
                de(garden.t.scheduler.t.queue.size, count, 'Every plant should have own queue');
                console.log('done');
            });

            const exec = async () => {
                const all = await garden.t.find({});

                for (let i = 0; i < seed.stages; i++) {
                    await sb.clock.tickAsync(seed.per_stage + garden.t.scheduler.t.min_step + 1);
                }

                let search = await garden.t.find({});
                de(all.length, search.length, `Some plants are missing: [${all.length} -> ${search.length}]`);

                search = await garden.t.find({stage: {$ne: seed.stages}});
                de(search.length, 0, `All plants should be fully grown, [${search.length}]`);
            };

            it(amounts[0].toString(), exec);
            it(amounts[1].toString(), exec);
        });

        describe('real time', () => {
            const seed = new Seed('test', 5, 500, 0.5, 5);
            const amounts = [7000, 15_000];

            beforeEach(async () => {
                sb.stub(Math, 'random').returns(1);

                garden = new Garden({inMemoryOnly: true});
                await garden.init();

                garden.t.scheduler.t.min_step = 50;

                await Promise.all(range(0, amounts.shift())
                    .map(x => garden.add_plants({x, y: 0, seed: seed.index})));

                de(!!garden.t.scheduler.task, true, 'Grow tick task should exist');
                de(garden.t.scheduler.t.queue.size >= 1, true, 'Queue must be filled');
                console.log('done');
            });

            const exec = (to_wait = 1500) => async () => {
                const all = await garden.t.find({});

                await new Promise(resolve => setTimeout(resolve, to_wait));

                let search = await garden.t.find({});
                de(all.length, search.length, `Some plants are missing: [${all.length} -> ${search.length}]`);

                search = await garden.t.find({stage: {$ne: seed.stages}});
                de(search.length, 0, `All plants should be fully grown, [${search.length}]`);
            };

            it(amounts[0].toString(), exec(1_500));
            it(amounts[1].toString(), exec(4_000));
        });
    });
});