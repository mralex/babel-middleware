
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

function getFileStats(jsSrc) {
    var stats;
    try {
        stats = fs.lstatSync(jsSrc);
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

function pathForHash(cachePath, hash) {
    return path.resolve(path.join(cachePath, hash + '.js'));
}

/**
 * Get the JS path for a request's path. Assumes reqPath is either
 * a .js or .map file.
 */
function jsPathForReqPath(srcPath, reqPath) {
    var jsPath = reqPath.replace(/\.map$/, '');

    return path.resolve(path.join(srcPath, jsPath)); // XXX Need the correct path
}


function isJS(ext) {
    return ext === '.js';
}

function isMap(ext) {
    return ext === '.map';
}

var CONTENT_TYPE_HEADERS = {
  '.js': 'application/javascript',
  '.map': 'application/json'
};

function contentTypeHeader(ext) {
    return CONTENT_TYPE_HEADERS[ext];
}

function send(res, data, ext) {
    res.append('Content-Type', contentTypeHeader(ext));
    res.write(data);
    res.end();
}

function handleError(res, error, webConsoleErrors, logger) {
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


module.exports = function(options) {
    options = options || {};

    var babelOptions = options.babelOptions || { presets: [] };
    var cachePath = options.cachePath || 'memory';
    var exclude = options.exclude || [];
    var jsSrcToHash = {};
    var logger = new Logger(options.logLevel || 'none');
    var srcPath = options.srcPath;
    var webConsoleErrors = options.consoleErrors || false;

    var cache = new Cache(options.cachePath, logger, options);

    babelOptions.highlightCode = false;

    return function (req, res, next) {
        var ext = path.extname(req.path);
        var isPathJS = isJS(ext);
        var isPathMap = isMap(ext);

        if (isExcluded(req.path, exclude)) {
            logger.debug('Excluded: %s (%s)', req.path, exclude);
            res.append('X-Babel-Cache', false);
            return next();
        } else if (isPathMap && ! babelOptions.sourceMaps) {
            logger.debug('sourceMaps not enabled: %s', req.path);
            res.append('X-Babel-Cache', false);
            return next();
        } else if (! isPathJS && ! isPathMap) {
            logger.debug('Non-supported file type: %s', req.path);
            res.append('X-Babel-Cache', false);
            return next();
        }

        var jsSrc = jsPathForReqPath(srcPath, req.path);
        var jsSrcStats = getFileStats(jsSrc);

        if (! jsSrcStats) {
            logger.debug('JavaScript file not found', jsSrc);
            res.append('X-Babel-Cache', false);
            return next();
        }

        // From this point down, we know the JS file exists, and we can
        // create the compiled source and sourceMap if needed.

        var jsHash = lastModifiedHash(jsSrc, jsSrcStats);
        var lastKnownJsHash = jsSrcToHash[jsSrc];

        // Clean up old cached resources when the JS file has been updated.
        if (lastKnownJsHash && lastKnownJsHash !== jsHash) {
            cache.remove(pathForHash(cachePath, lastKnownJsHash));
        }

        logger.debug('Preparing: %s (%s)', req.path, jsHash);

        res.append('X-Babel-Cache', true);
        res.append('X-Babel-Cache-Hash', jsHash);

        var jsHashPath = pathForHash(cachePath, jsHash);
        var mapHashPath = jsHashPath + '.map';

        var cachedData = cache.get(isPathJS ? jsHashPath : mapHashPath);
        if (cachedData) {
            jsSrcToHash[jsSrc] = jsHash;
            logger.debug('Serving (cached): %s', req.path);
            res.append('X-Babel-Cache-Hit', true);

            send(res, cachedData, ext);
            return;
        }

        // expect an X-Babel-Cache-Hit header even on a parse error.
        res.append('X-Babel-Cache-Hit', false);

        // Create both the trasnspiled source and possibly
        // the source map. Store both to the cache. Serve
        // the correct one based off of the extension.
        var result;
        try {
            result = babel.transformFileSync(jsSrc, babelOptions);
        } catch (err) {
            handleError(res, err, webConsoleErrors, logger);
            return;
        }

        jsSrcToHash[jsSrc] = jsHash;

        var code = result.code;
        var map = result.map;

        if (map) {
            map = JSON.stringify(result.map);
            cache.store(jsHashPath + '.map', map);

            var mapFilename = path.basename(jsSrc) + '.map';
            code += '\n//# sourceMappingURL=' + mapFilename;
        }

        // the code to store on disk only has the sourceMappingURL after
        // the above `if (map)` branch is executed.
        cache.store(jsHashPath, code);

        logger.debug('Serving (uncached): %s', req.path);
        send(res, isPathJS ? code : map, ext);
    };
};
