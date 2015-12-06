// Basic ES6 file for Babel to operate on

class MyCounter {
    static get hello() { return "World"; }

    constructor() {
        this._count = 0;
    }

    inc() {
        this._count++;
    }

    dec() {
        this._count--;
    }

    get count() {
        return this._count;
    }
}

export default MyCounter;
