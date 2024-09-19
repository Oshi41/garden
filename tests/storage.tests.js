import {deepEqual as de} from 'assert'
import {MapList, Table} from '../data/storage.js';

describe('Table', () => {
    it('works [1:1]', () => {
        const table = new Table();

        table.set(1, 1, {str: 'String'});
        de(table.has(1, 1), true);
        de(table.get(1, 1).str, 'String');

        table.set(1, 1, {str: 'other'});
        de(table.get(1, 1).str, 'other');

        table.set(2, 2, {str: 'some string'});
        de(table.has(2, 2), true);
        de(table.remove(2, 2), true);
        de(table.has(2, 2), false);
    });
    it('works for large index', () => {
        const table = new Table();
        const i = 1_000_000_000_000;

        table.set(i, i, {str: 'String'});
        de(table.has(i, i), true);
        de(table.get(i, i).str, 'String');

        table.set(i, i, {str: 'other'});
        de(table.get(i, i).str, 'other');
    });
    it('get_all', () => {
        const table = new Table();

        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < 10; j++) {
                table.set(i, j, {i, j});
            }
        }

        let items = Array.from(table.get_all());
        de(items.length, 10 * 10);

        table.clear();
        items = Array.from(table.get_all());
        de(items.length, 0);
    });
});

describe('MapList', () => {
    it('works', () => {
        const m = new MapList();
        const size = 10;
        for (let i = 0; i < size; i++) {
            m.set(1, i, (i + size));
        }

        de(m.get(1).length, size * 2);
        m.remove(1, 1);
        de(m.get(1).length, size * 2 - 1);
        m.remove_key(1);
        de(m.get(1), null);

        de(m.keys(), []);
        m.set(2, 1, 2, 3);
        m.set(3, 4);
        de(m.keys(), [2, 3]);

        m.clear();
        de(m.keys(), []);
    });
});