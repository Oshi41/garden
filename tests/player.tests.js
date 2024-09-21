import {Garden} from '../logic/garden.js';
import {PlayerList} from '../logic/player_list.js';
import sinon from "sinon";
import {all_seeds, seed_from_id} from "../data/seed.js";
import {deepEqual as de, fail} from "assert";
import {pick, pretty_print} from "../util/_.js";
import {set_min_level} from "../util/logger.js";
import {Table} from "../data/storage.js";
import {grow_all_async} from "./garden_utils.js";

function normalize_vector({x, y}, multiply = 1) {
    // JS is not very strict with numbers, so adding some tweaks here
    const tweaked_multiply = multiply - 1e-7;
    const m = Math.hypot(x, y);
    const x_delta = (x / m * tweaked_multiply) || 0;
    const y_delta = (y / m * tweaked_multiply) || 0;

    const result_speed = Math.hypot(x_delta, y_delta);
    if (result_speed > multiply) {
        fail(`Too fast: should be ${multiply} but ${result_speed}`);
    }

    return {x_delta, y_delta};
}

// [0 - 1)
function time_based_random() {
    const now = Date.now();
    const max = 1_000_000;
    return (now % max) / max;
}

describe("Player", function () {
    /*** @type {SinonSandbox}*/
    let sb;
    /*** @type {Garden[]}*/
    const gardens = [];
    /*** @type {PlayerList}*/
    let list;

    beforeEach(async () => {
        set_min_level('error');

        sb?.restore();
        sb = sinon.createSandbox();
        sb.useFakeTimers({toFake: ['setTimeout', 'setInterval', 'Date', 'clearTimeout', 'clearInterval']});

        gardens.length = 0;

        for (let y = 0; y < 10; y++) {
            const garden = new Garden({inMemoryOnly: true});
            gardens.push(garden);

            await garden.init();

            for (let x = 0; x < 100; x++) {
                await garden.add_plants({x, y, seed: x % all_seeds().length});
                sb.clock.setSystemTime(sb.clock.now + 61);
            }

            de(!!garden.t.scheduler.task, true, 'Grow tick task should exist');
            de(garden.t.scheduler.t.queue.size, 100, 'Every plant should have own queue');
        }

        list = new PlayerList({inMemoryOnly: true}, {
            max_speed: 10,
            reach_distance: 2,
            timeout: 500,
            view_distance: 100,
        });
        await list.init();
    });

    describe('set_online', () => {
        describe('works', () => {
            it('register', async () => {
                de(await list.t.find({}), []);

                const resp = await list.set_online('name', true);

                const players = await list.t.find({});
                de(players.length, 1);

                // response should be equal to database info
                de(resp, players[0]);

                de(resp.name, 'name');
                de(resp.stats.login, Date.now());
                de(resp.stats.register, Date.now());
                de(resp.stats.interaction, Date.now());

                for (let {index, name} of all_seeds()) {
                    de(resp.container[index] > 0, true, `Player do not have ${name} seeds`);
                }
            });
            it('register, offline, online again', async () => {
                let resp, search;

                resp = await list.set_online('name', true);
                de(pick(resp, 'name'), {name: 'name'});
                search = await list.t.find({'stats.login': null});
                de(search, [], 'Should be only 1 online player online');

                await sb.clock.tickAsync(1000);

                resp = await list.set_online('name', false);
                de(pick(resp, 'name'), {name: 'name'});
                search = await list.t.find({'stats.login': {$ne: null}});
                de(search, [], 'Should be only 1 online player offline');

                // recording play time
                search = await list.t.find({});
                de(search[0].stats.play_time, 1000);

                await sb.clock.tickAsync(1000);

                resp = await list.set_online('name', true);
                de(pick(resp, 'name'), {name: 'name'});
                search = await list.t.find({'stats.login': null});
                de(search, [], 'Should be only 1 online player online');

                search = await list.t.find({});
                de(search.length, 1, 'Should be only 1 player in database');
            });
            it('multiple register, offline, online again', async () => {
                let search;
                let count = 10;

                for (let i = 1; i <= count; i++) {
                    const name = 'name_' + i;

                    await list.set_online(name, true);
                    search = await list.t.find({'stats.login': {$ne: null}});
                    de(search.length, i, `Must be exact ${i} players registered and online`);
                }

                for (let i = 9; i >= 0; i--) {
                    const name = 'name_' + (i + 1).toString();

                    await list.set_online(name, false);
                    search = await list.t.find({'stats.login': {$ne: null}});
                    de(search.length, i, `Must be exact ${i} players registered and online`);
                }

                for (let i = 1; i <= count; i++) {
                    const name = 'name_' + i;

                    await list.set_online(name, true);
                    search = await list.t.find({'stats.login': {$ne: null}});
                    de(search.length, i, `Must be exact ${i} players registered and online`);
                }

                search = await list.t.find({});
                de(search.length, count, `Registered only ${count} players`);
            });
        });
        describe('throws', () => {
            it('offline twice', async () => {
                await list.set_online('name', true);
                await list.set_online('name', false);

                try {
                    await list.set_online('name', false);
                    fail('must fail');
                } catch (e) {
                    de(e.message.includes('already offline'), true);
                }
            });
            it('offline before registration', async () => {
                try {
                    await list.set_online('name', false);
                    fail('must fail');
                } catch (e) {
                    de(e.message.includes('player is not exist'), true);
                }
            });
        });
    });

    describe('set_pos', () => {
        describe('works', () => {
            it('works', async () => {
                const name = 'name';
                const speed = list.t.abilities.max_speed;
                await list.set_online(name, true);

                for (let x = 1; x < 10; x++) {
                    for (let y = 1; y < 10; y++) {
                        await sb.clock.tickAsync(list.t.abilities.timeout + 1);
                        const resp = await list.set_pos(name, normalize_vector({x, y}, speed));
                        de(resp, true, 'Action should be allowed');
                    }
                }
            });
            it('random poses during register', async () => {
                /*** @type {Table<boolean>}*/
                const table = new Table();

                for (let i = 0; i < 100; i++) {
                    const p = await list.set_online('name' + i, true);
                    if (table.has(p.x, p.y)) {
                        fail('already exists');
                    }
                    table.set(p.x, p.y, true);
                    de([p.x, p.y].every(x => !Number.isInteger(x)), true, 'Position should be float');
                }
            });
        });
        describe('throws', () => {
            it('too fast', async () => {
                const name = 'name';
                const speed = list.t.abilities.max_speed;
                const player = await list.set_online(name, true);

                await sb.clock.tickAsync(list.t.abilities.timeout + 1);

                const resp = await list.set_pos(name, normalize_vector({x: 1, y: 1}, speed + 1));
                de(resp, false, 'Player moved too fast, should be rejected');

                const search = await list.t.find(pick(player, 'name'));
                de(search.length, 1, 'Must be only 1 player registered');
                de(pick(player, 'x', 'y'), pick(search[0], 'x', 'y'), 'position should not change');
            });
            it('interaction spam', async () => {
                const step = 50;
                let to_wait = list.t.abilities.timeout = (step + 1) * 3;

                const name = 'name';
                const speed = list.t.abilities.max_speed;
                const player = await list.set_online(name, true);

                while (true) {
                    to_wait -= step;
                    if (to_wait < 0)
                        break;

                    await sb.clock.tickAsync(step);
                    const resp = await list.set_pos(name, normalize_vector({x: 1, y: 1}, speed));
                    de(resp, false, 'set_pos called too often, reject');
                }

                await sb.clock.tickAsync(step);
                const resp = await list.set_pos(name, normalize_vector({x: 1, y: 1}, speed));
                de(resp, true, 'Finally can use set_pos');
            });
            it('wrong data', async () => {
                const name = 'name';
                await list.set_online(name, true);

                const values = [
                    'some_value',
                    {x_delta: 'hehe', y_delta: 12},
                    {x_delta: 4, y_delta: 'hehe'},
                    {x_delta: '4', y_delta: 'hehe'},
                    {x: 1, y: 1}
                ];

                for (let pos of values) {
                    await sb.clock.tickAsync(list.t.abilities.timeout + 1);

                    de(await list.set_pos(name, pos), false, `Value is invalid: ${pretty_print(pos, 'json')}`);
                }
            });
        });
    });

    describe('interact', () => {
        describe('works', () => {
            /**
             * Wait for promise and immitating timeout to prevent spamming
             * @param promise {Promise}
             * @param _assert {number | {val: any, msg: string}}
             * @returns {Promise<number>}
             */
            const wi = async (promise, _assert = null) => {
                if (promise) {
                    const result = await promise;
                    if (_assert) {
                        const {val, msg} = _assert;
                        de(result, val, msg);
                    }
                }

                if (list.t.abilities.timeout) {
                    await sb.clock.tickAsync(list.t.abilities.timeout + 1);
                }
            };

            it('collect every plant', async () => {
                sb.stub(Math, 'random').returns(1);

                // ignore speed for now
                list.t.abilities.max_speed = Number.MAX_SAFE_INTEGER;
                list.t.abilities.reach_distance = 3;
                const name = 'name';

                // register
                await wi(list.set_online(name, true));

                // grow all plants
                await Promise.all(gardens.map(x => grow_all_async(sb, x)));


                // walking through all the field
                for (let y = 0; y < 10; y++) {
                    // teleporting to the beginning of plants row
                    await wi(list.teleport(name, {x: 0, y: y}), {
                        val: true,
                        msg: 'Should be allowed to teleport'
                    });


                    for (let x = 0; x < 100; x++) {
                        const plants = await gardens[y].t.find({x, y});
                        de(plants.length, 1, 'should found single plant');
                        de(plants[0].stage, seed_from_id(plants[0].seed).stages, 'Must be fully grown');

                        const [old] = await list.t.find({name});
                        const [{seed}] = plants;
                        const seed_obj = seed_from_id(seed);

                        await wi(list.interact(name, {
                            x: x + time_based_random(),
                            y: y + time_based_random(),
                        }, gardens), {
                            val: true,
                            msg: 'Can collect plant',
                        });

                        const [upd] = await list.t.find({name});
                        de(old.container[seed] + seed_obj.max_result, upd.container[seed]);
                        de((old.stats.plant_collected || 0) + 1, upd.stats.plant_collected);

                        await wi(list.set_pos(name, {x_delta: 1, y_delta: 0}), {
                            val: true,
                            msg: 'Should be allowed to set pos',
                        });
                    }
                }

                const plants = await Promise.all(gardens.map(x => x.t.find({})));
                de(plants.flatMap(x => x), [], 'All plants must be collected');
            });
            it('remove weed', async () => {
                sb.stub(Math, 'random').returns(0);

                // ignore speed for now
                list.t.abilities.max_speed = Number.MAX_SAFE_INTEGER;
                list.t.abilities.reach_distance = 3;
                const name = 'name';

                // register
                await wi(list.set_online(name, true));


                async function get_damaged() {
                    const resp = await Promise.all(gardens.map(x => x.t.find({dmg: true})));
                    return resp.flatMap(x => x);
                }

                while ((await get_damaged()).length < 100) {
                    await sb.clock.tickAsync(1000);
                }

                // need to stop timeouts as we do not want plants to decay further
                list.t.abilities.timeout = 0;

                let plants = await Promise.all(gardens.map(x => x.t.find({dmg: true})));
                for (let plant of plants.flatMap(x => x)) {

                    const [old] = await list.t.find({name});
                    await wi(list.teleport(name, plant), {val: true, msg: 'Should be allowed to teleport'});
                    await wi(list.interact(name, plant, gardens), {val: true, msg: 'Can remove weed'});

                    const [upd] = await list.t.find({name});
                    de(upd.stats.weed_removed, 1 + (old.stats.weed_removed || 0));
                    de(upd.stats.teleported, 1 + (old.stats.teleported || 0));

                    const [upd_plant] = await gardens[plant.y].t.find(pick(plant, 'x', 'y'));
                    de(upd_plant.dmg, false, 'Plant should be healthy');
                }
            });
        });
    });
});