/**
 * A basic logging module
 */

function Logger(level) {
    this.level = Logger.LEVELS[level];
}

Logger.prototype = {
    _shouldLog: function (level) {
        return this.level <= Logger.LEVELS[level];
    },
    debug: function () {
        if (this._shouldLog('debug')) {
            console.log.apply(undefined, arguments);
        }
    },
    info: function () {
        if (this._shouldLog('info')) {
            console.log.apply(undefined, arguments);
        }
    },
    warn: function () {
        if (this._shouldLog('warn')) {
            console.error.apply(undefined, arguments);
        }
    },
    error: function () {
        if (this._shouldLog('error')) {
            console.error.apply(undefined, arguments);
        }
    },
    critical: function () {
        if (this._shouldLog('critical')) {
            console.error.apply(undefined, arguments);
        }
    }
};

Logger.LEVELS = {
    'debug': 0,
    'info': 1,
    'warn': 2,
    'error': 3,
    'critical': 9,
    'none': 10
};

module.exports = Logger;
