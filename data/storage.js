/**
 * @template T - item type
 */
export class Table {
    /*** @type {Map<number, Map<number, T>>}*/
    #map = new Map();

    /**
     *
     * @param x {number}
     * @param y {number}
     * @returns {T}
     */
    get(x, y) {
        const line = this.#map.get(x);
        return line?.get(y);
    }

    /**
     *
     * @param x {number}
     * @param y {number | null}
     * @returns {boolean}
     */
    has(x, y) {
        let res = this.#map.get(x);
        if (y !== undefined) {
            res = res?.get(y);
        }

        return !!res;
    }

    remove(x, y) {
        const line = this.#map.get(x);
        if (!line) return false;
        return line.delete(y);
    }

    /**
     *
     * @param x {number}
     * @param y {number}
     * @param item {T}
     */
    set(x, y, item) {
        let line = this.#map.get(x);
        if (!line)
            this.#map.set(x, line = new Map());
        if (y !== undefined && item !== undefined) {
            line.set(y, item);
        }
    }

    * get_all() {
        for (let [, map] of this.#map) {
            for (let [, item] of map) {
                yield item;
            }
        }
    }

    /**
     * Remove all values by predicate
     * @param fn {(x: number, y: number, value: T) => boolean}
     * @return {Table<T>} removed legacy
     */
    remove_if(fn) {
        const result = new Table();

        for (let [x, map] of this.#map) {
            for (let y of Array.from(map.keys())) {
                const value = map.get(y);
                if (fn(x, y, value)) {
                    map.delete(y);
                    result.set(x, y, value);
                }
            }
        }

        return result;
    }

    /**
     * All table keys
     * @returns {Generator<{x: number, y: number}, void, *>}
     */
    * keys() {
        for (let [x, map] of this.#map) {
            for (let [y,] of map) {
                yield {x, y};
            }
        }
    }

    clear() {
        this.#map.clear();
    }

    /**
     * @param x1 {number}
     * @param y1 {number}
     * @param x2 {number}
     * @param y2 {number}
     * @param iteratee {(item: T, x: number, y: number)=>void}
     */
    iterate(x1, y1, x2, y2, iteratee) {
        for (let x = x1; x <= x2; x++) {
            for (let y = y1; y <= y2; y++) {
                if (this.has(x, y)) {
                    iteratee(this.get(x, y), x, y);
                }
            }
        }
    }
}

/**
 * @template TKey - item type
 * @template TItem - item type
 */
export class MapList {
    /*** @type {Map<TKey, TItem[]>}*/
    #inner = new Map();

    /**
     * Returns array
     * @param key {TKey}
     * @returns {TItem[] | null}
     */
    get(key) {
        return this.#inner.get(key);
    }

    /**
     *
     * @param key {TKey}
     * @param items {...TItem}
     */
    set(key, ...items) {
        let arr = this.get(key);
        if (!arr) {
            this.#inner.set(key, items);
        } else {
            arr.push(...items);
        }
    }

    /**
     * Remove items from key
     * @param key {TKey}
     * @param items {...TItem}
     */
    remove(key, ...items) {
        const arr = this.#inner.get(key);
        if (arr?.length) {
            for (let item of items) {
                const index = arr.indexOf(item);
                if (index >= 0) {
                    arr.splice(index, 1);
                }
            }
        }
    }

    /**
     * Removes key
     * @param key {TKey}
     * @returns {boolean}
     */
    remove_key(key) {
        return this.#inner.delete(key);
    }

    clear() {
        this.#inner.clear();
    }

    /**
     * @returns {TKey[]}
     */
    keys() {
        return Array.from(this.#inner.keys());
    }
}