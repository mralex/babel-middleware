var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var babel = require('babel-core');
var micromatch = require('micromatch');

function lastModifiedHash(path, stats) {
    var mtime = stats.mtime.getTime();

    return crypto
        .createHash('md5')
        .update(mtime + '-' + path)
        .digest('hex');
}

module.exports = function(options) {
    options = options || {};

    var srcPath = options.srcPath;
    var cachePath = options.cachePath || 'memory';
    var isMemoryCache = cachePath === 'memory';
    var exclude = options.exclude || [];
    var debug = options.debug || false;
    var serverConsoleErrors = options.serverConsoleErrors || false;
    var webConsoleErrors = options.consoleErrors || false;

    // filename to last known hash map
    var hashMap = {};

    // hash to transpiled file contents map
    var cacheMap = {};

    if (!isMemoryCache) {
        try {
            fs.mkdirSync(cachePath);
        } catch (e) {}
    }

    var babelOptions = options.babelOptions || { presets: [] };

    babelOptions.highlightCode = false;

    function log() {
        if (debug) {
            console.log.apply(undefined, arguments);
        }
    }

    function logError() {
        console.error.apply(undefined, arguments);
    }

    function handleError(res, error) {
        var errOutput = String(error).replace(/\'/g, '\\\'').replace(/\"/g, '\\\"');

        if (serverConsoleErrors) {
            logError(
                'Babel parsing error from babel-middleware' +
                '\n "' + errOutput + '"', error.codeFrame
            );
        }

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
        var src = path.resolve(srcPath + '/' + req.path); // XXX Need the correct path

        var stats;
        try {
            stats = fs.lstatSync(src);
        } catch(e) {
            // file not found, try the next!
            next();
            return;
        }

        if (! stats || ! stats.isFile()) {
            // not a file, next!
            next();
            return;
        }

        var hash = lastModifiedHash(src, stats);
        var lastKnownHash = hashMap[src];
        var hashPath;

        if (exclude.length) {
            if (micromatch.any(req.path.replace(/^\/+|\/+$/g, ''), exclude)) {
                log('Excluded: %s (%s)', req.path, exclude);
                res.append('X-Babel-Cache', false);
                next();
                return;
            }
        }

        log('Preparing: %s (%s)', src, hash);

        res.append('X-Babel-Cache', true);
        res.append('X-Babel-Cache-Hash', hash);

        if (!isMemoryCache) {
            hashPath = pathForHash(hash);
            try {
                fs.statSync(hashPath);
                hashMap[src] = lastKnownHash = hash;
            } catch(e) {}
        }

        if (lastKnownHash && lastKnownHash === hash) {
            // file unchanged, exit early
            var cacheMiss = false;
            if (!isMemoryCache) {
                try {
                    fs.lstatSync(hashPath);
                } catch(e) {
                    cacheMiss = true;
                }

                // Ensure Cache directory exists
                if (cacheMiss) {
                    try {
                        fs.lstatSync(cachePath);
                    } catch (e) {
                        fs.mkdirSync(cachePath);
                    }
                }
            }

            if (!cacheMiss) {
                res.append('Content-Type', 'application/javascript');
                res.append('X-Babel-Cache-Hit', true);
                if (isMemoryCache) {
                    log('Serving (cached): %s', src);
                    res.write(cacheMap[hash]);
                    res.end();
                } else {
                    log('Serving (cached): %s', hashPath);
                    res.sendFile(hashPath, {}, function(err) {
                        if (err) {
                            handleError(res, err);
                        }
                    });
                }
                return;
            }
        }

        res.append('X-Babel-Cache-Hit', false);

        if (isMemoryCache && lastKnownHash && lastKnownHash in cacheMap) {
            delete cacheMap[lastKnownHash];
        } else if (!isMemoryCache && lastKnownHash) {
            try {
                fs.unlinkSync(pathForHash(lastKnownHash));
            } catch(e) {}
        }

        var result;
        try {
            result = babel.transformFileSync(src, babelOptions);
        } catch(e) {
            handleError(res, e);
            return;
        }

        var code = result.code;
        hashMap[src] = hash;

        if (isMemoryCache) {
            cacheMap[hash] = code;
        } else {
            fs.writeFile(hashPath, code, function(err) {
                if (err) {
                    // console.error('Error saving ' + hashPath + ': ' + err);
                    delete hashMap[src];
                }
            });
        }
        log('Serving (uncached): %s', src);
        res.append('Content-Type', 'application/javascript');
        res.write(code);
        res.end();
    };
};
