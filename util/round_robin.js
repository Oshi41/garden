/**
 * Inf generator iterating again and again agains same array
 * @template T
 * @param arr {T[]}
 * @returns {Generator<T, void, *>}
 */
export function* round_robin(arr) {
    while (true) {
        for (let elem of arr) {
            yield elem;
        }
    }
}