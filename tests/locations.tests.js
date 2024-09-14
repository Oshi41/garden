import {deepEqual as de} from 'assert'
import {describe, it, beforeEach} from 'node:test';
import {get_chunk_size, chunk_from_point, t as test_location} from '../data/location.js';
import {createSandbox} from 'sinon';
import {distance} from "../data/location.js";

describe('chunk_from_point', () => {
    /*** @type {SinonSandbox}*/
    let sb;

    beforeEach(() => {
        sb?.reset();
        sb = createSandbox();
    });

    it('[0:0]', (t) => {
        const size = 100;
        test_location.set_chunk_size(size);

        for (let x = 0; x < size; x++) {
            for (let y = 0; y < size; y++) {
                const [i, j] = chunk_from_point(x, y);
                const msg = `pos [${x}:${y}], chunk: [${i}:${j}], chunk_size: ${get_chunk_size()}`;
                de(i, 0, msg);
                de(j, 0, msg);
            }
        }
    });

    it('[-1, -1] [1, 1]', (t) => {
        const size = 100;
        test_location.set_chunk_size(size);

        for (let x = (size - 1) * -1; x < 0; x++) {
            for (let y = (size - 1) * -1; y < 0; y++) {
                const [i, j] = chunk_from_point(x, y);
                const msg = `pos [${x}:${y}], chunk: [${i}:${j}], chunk_size: ${get_chunk_size()}`;
                de(i, -1, msg);
                de(j, -1, msg);
            }
        }

        for (let x = size; x < size * 2; x++) {
            for (let y = size; y < size * 2; y++) {
                const [i, j] = chunk_from_point(x, y);
                const msg = `pos [${x}:${y}], chunk: [${i}:${j}], chunk_size: ${get_chunk_size()}`;
                de(i, 1, msg);
                de(j, 1, msg);
            }
        }
    });
});

describe('distance', () => {
    const cases = [
        [0, 0, 0],
        [3, 4, 5],
        [-3, 4, 5],
        [3, -4, 5],
    ];
    cases.forEach(([x, y, dist]) => it(`[0:0] -> [${x}:${y}] = ${dist}`, () => {
        de(distance({x: 0, y: 0}, {x, y}), dist);
    }))
});