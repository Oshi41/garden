import {chunk_from_point, point_hash} from './location.js'
import {Table} from "./table.js";


class Chunk {
    #plants = new Table();

    constructor(x, y) {
        this.pos = chunk_from_point(x, y);
        this.hash = point_hash(this.pos.x, this.pos.y);
    }
}