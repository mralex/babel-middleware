
var babel = require('babel-core');
var Cache = require('./lib/cache');
var crypto = require('crypto');
var fs = require('fs');
var Logger = require('./lib/logger');
var micromatch = require('micromatch');
var path = require('path');

function lastModifiedHash(path, stats) {
    var mtime = stats.mtime.getTime();

    return crypto
        .createHash('md5')
        .update(mtime + '-' + path)
        .digest('hex');
}

function getFileStats(src) {
    var stats;
    try {
        stats = fs.lstatSync(src);
    } catch(e) {
        // path not found
        return null;
    }

    if (! stats || ! stats.isFile()) {
        // not a file
        return null;
    }

    return stats;
}

function isExcluded(path, exclude) {
    if (exclude.length) {
        return micromatch.any(path.replace(/^\/+|\/+$/g, ''), exclude);
    }

    return false;
}

module.exports = function(options) {
    options = options || {};

    var srcPath = options.srcPath;
    var cachePath = options.cachePath || 'memory';
    var exclude = options.exclude || [];
    var webConsoleErrors = options.consoleErrors || false;
    var logger = new Logger(options.logLevel || 'none');

    // filename to last known hash map
    var hashMap = {};

    var cache = new Cache(options.cachePath, logger, options);

    var babelOptions = options.babelOptions || { presets: [] };

    babelOptions.highlightCode = false;

    function handleError(res, error) {
        var errOutput = String(error).replace(/\'/g, '\\\'').replace(/\"/g, '\\\"');

        logger.error(
            'Babel parsing error from babel-middleware' +
            '\n "' + errOutput + '"', '\n' + error.codeFrame
        );

        if (webConsoleErrors) {
            res.send(
                '/* Babel parsing error from babel-middleware */' +
                '\n /* See error console output for details. */' +
                '\n var output = ' + JSON.stringify(error) +
                '\n console.error("' + errOutput + '\\n", output.codeFrame)'
            );
        } else {
            res.status(500).send(error);
        }

        res.end();
    }

    function pathForHash(hash) {
        return path.resolve(cachePath + '/' + hash + '.js');
    }

    return function(req, res, next) {
        if (isExcluded(req.path, exclude)) {
            logger.debug('Excluded: %s (%s)', req.path, exclude);
            res.append('X-Babel-Cache', false);
            return next();
        }

        var src = path.resolve(srcPath + '/' + req.path); // XXX Need the correct path
        var stats = getFileStats(src);
        if (! stats) {
            // not a valid file, pass to the next middleware
            return next();
        }

        var hash = lastModifiedHash(src, stats);
        var lastKnownHash = hashMap[src];

        // Clean up cached resources any time the
        // hash has changed.
        if (lastKnownHash && lastKnownHash !== hash) {
            cache.remove(pathForHash(lastKnownHash));
        }

        logger.debug('Preparing: %s (%s)', src, hash);

        res.append('X-Babel-Cache', true);
        res.append('X-Babel-Cache-Hash', hash);

        var hashPath = pathForHash(hash);

        var code = cache.get(hashPath);
        if (code) {
            hashMap[src] = hash;
            res.append('Content-Type', 'application/javascript');
            res.append('X-Babel-Cache-Hit', true);
            logger.debug('Serving (cached): %s', src);
            res.write(code);
            res.end();
            return;
        }

        // expect an X-Babel-Cache-Hit header even on a parse error.
        res.append('X-Babel-Cache-Hit', false);

        var result;
        try {
            result = babel.transformFileSync(src, babelOptions);
        } catch(e) {
            handleError(res, e);
            return;
        }

        code = result.code;
        hashMap[src] = hash;

        cache.store(hashPath, code);
        logger.debug('Serving (uncached): %s', src);
        res.append('Content-Type', 'application/javascript');
        res.write(code);
        res.end();
    };
};
