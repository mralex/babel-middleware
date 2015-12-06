var babel = require('babel-core');
var fs = require('fs');
var crypto = require('crypto');

require('babel-preset-es2015');
require('babel-preset-stage-0');

function fileLastModifiedHash(path) {
    var mtime = fs.lstatSync(path).mtime.getTime();

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

    // filename to last known hash map
    var hashMap = {};

    // hash to transpiled file contents map
    var cacheMap = {};

    if (!isMemoryCache) {
        try {
            fs.mkdirSync(cachePath);
        } catch (e) {}
    }

    var babelOptions = options.babelOptions || { presets: ['es2015', 'stage-0'] };

    function pathForHash(hash) {
        return cachePath + '/' + hash + '.js';
    }

    return function(req, res, next) {
        var src = srcPath + '/' + req.path; // XXX Need the correct path
        var hash = fileLastModifiedHash(src);
        var lastKnownHash = hashMap[src];
        var hashPath;

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
                res.append('X-Babel-Cache-Hit', true);
                if (isMemoryCache) {
                    res.write(cacheMap[hash]);
                    res.end();
                } else {
                    res.sendFile(hashPath, {}, function(err) {
                        if (err) {
                            res.status(500).send(err).end();
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

        babel.transformFile(src, babelOptions, function(err, result) {
            if (err) {
                res.status(500).send(err);
                res.end();
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
            res.write(code);
            res.end();
        });
    };
};
