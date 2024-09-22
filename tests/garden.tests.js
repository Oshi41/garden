import {deepEqual as de} from 'assert'
import sinon from 'sinon';
import {Garden} from "../logic/garden.js";
import {all_seeds, Seed, seed_from_id} from "../data/seed.js";
import {fake_time, range, stub_carefully} from "../util/_.js";
import {set_min_level} from "../util/logger.js";
import {grow_all_async} from "./garden_utils.js";

describe('Garden', () => {
    /*** @type {SinonSandbox}*/
    let sb;

    /*** @type {Sinon.SinonStub<[], number>}*/
    let random_stub;

    beforeEach(() => {
        sinon.clock?.restore();
        random_stub?.restore();
        sb?.restore();
        sb = sinon.createSandbox();
        random_stub = stub_carefully(sb, Math, 'random');
        set_min_level('none');
    });

    describe('stress test', () => {
        /*** @type {Garden}*/
        let garden;

        describe('stub time', () => {
            const seed = new Seed('stress_test_w_stub_time_seed', 5, 1000, 0.5, 5);
            const amounts = [7000, 15_000];

            beforeEach(async () => {
                random_stub.returns(1);
                fake_time(sb);

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
            const seed = new Seed('stress_test_w_real_time_seed', 5, 500, 0.5, 5);
            const amounts = [7000, 15_000];

            beforeEach(async () => {
                random_stub.returns(1);

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

    describe('logic', () => {
        /*** @type {Garden}*/
        let garden;

        beforeEach(async () => {
            fake_time(sb);

            garden = new Garden({inMemoryOnly: true});
            await garden.init();

            let count = 500;

            // filling with seeds but do not call any tick methods
            for (let x = -count; x < count; x++) {
                // add prime number to the clock to avoid time colliding
                sb.clock.setSystemTime(sb.clock.now + 61);
                await garden.add_plants({x, y: 0, seed: Math.abs(x) % all_seeds().length});
            }

            de(!!garden.t.scheduler.task, true, 'Grow tick task should exist');
            de(garden.t.scheduler.t.queue.size, count * 2, 'Every plant should have own queue');
        });

        describe('random', () => {
            it('all failed', async () => {
                random_stub.returns(0);

                await grow_all_async(sb, garden);

                let search = await garden.t.find({});
                de(search, [], 'All plants must be destroyed');
            });

            for (let {name, fragility, index} of all_seeds()) {
                it(`${name} seed fragility`, async () => {
                    random_stub.returns(fragility - Number.EPSILON);

                    await grow_all_async(sb, garden, true);

                    let search = await garden.t.find({seed: index});
                    de(search, [], 'Should be no such plant due to random changes');
                });
            }
        });

        describe('interact', () => {
            it('remove weed', async () => {
                random_stub.returns(0);

                while ((await garden.t.find({dmg: false})).length) {
                    const wait = Math.max(...all_seeds().map(x => x.per_stage))
                    await sb.clock.tickAsync(wait + garden.t.scheduler.t.min_step);
                }

                let search = await garden.t.find({dmg: true});
                de(!!search.length, true, 'Should be at least one damaged plant left');

                for (let plant of search) {
                    const res = await garden.interact(plant);
                    de(res, {weed_removed: true});
                }

                search = await garden.t.find({dmg: true});
                de(search, [], 'All plants should be healthy');
            });
            it('collect', async () => {
                random_stub.returns(1);

                await grow_all_async(sb, garden);

                let search = await garden.t.find({});
                for (let plant of search) {
                    const res = await garden.interact(plant);
                    de(res, {
                        seed: plant.seed,
                        amount: seed_from_id(plant.seed).max_result
                    }, 'Should collect max seeds');
                }

                search = await garden.t.find({});
                de(search, [], 'All plants should be collected');
            });
        });

        it('has_plant', async () => {
            const all = await garden.t.find({});

            const results = await Promise.all(all.map(x => garden.has_plant(x)));
            de(results.every(x => !!x), true, 'All plants must be on valid places');
        });
    });
});