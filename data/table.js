/**
 * @typeParam {T} - item type
 */
export class Table {
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
     * @param y {number}
     * @returns {boolean}
     */
    has(x, y) {
        const line = this.#map.get(x);
        return line?.has(y);
    }

    /**
     *
     * @param x {number}
     * @param y {number}
     * @param item {T}
     */
    set(x, y, item) {
        let line = this.#map.get(x);
        if (line)
            this.#map.set(x, line = new Map());
        line.set(y, item);
    }

    /**
     * @param x1 {number}
     * @param y2 {number}
     * @param x2 {number}
     * @param y2 {number}
     * @param iteratee {(item: T, x: number, y: number)=>void}
     */
    iterate(x1, y2, x2, y2, iteratee) {
        for (let x = x1; x <= x2; x++) {
            for (let y = y1; y <= y2; y++) {
                if (this.has(x, y)) {
                    iteratee(this.get(x, y), x, y);
                }
            }
        }
    }
}