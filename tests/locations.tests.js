import {describe, it} from 'node:test'
import {point_hash, distance} from '../data/location.js';

describe('location', () => {
    it('generate hash near', () => {
        const points = [];
        const max = 10;
        const from_x = 1000;
        const from_y = 1000;
        const zero_hash = point_hash(from_x + max / 2, from_y + max / 2);

        for (let x = from_x; x <= max + from_x; x++) {
            const line = [];
            for (let y = from_y; y <= max + from_y; y++) {
                line.push(`${(point_hash(x, y) - zero_hash)}`)
            }
            points.push(line.map(x => x.padStart(6, ' ')).join(', '));
        }

        console.log(points.join('\n'))
    });
});