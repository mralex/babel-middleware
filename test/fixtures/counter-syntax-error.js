// Basic ES6 file for Babel to operate on

class MyCounter {
    static hello = "World"

    constructor() {
        this._count = 0;
    }

    inc: function() {
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
