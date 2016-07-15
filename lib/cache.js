var fs = require('fs');
var mkdirp = require('mkdirp');
var rimraf = require('rimraf');

function Cache(cachePath, logger, options) {
    this.cachePath = cachePath;
    this.isDiskCache = cachePath !== 'memory';
    this.logger = logger;

    if (options && options.freshCache) {
      this.removeCacheDirectory();
    }

    this.ensureCacheDirectoryExists();

    this.cacheMap = {};
}

Cache.prototype = {
  removeCacheDirectory: function () {
      if (this.isDiskCache) {
          try {
              rimraf.sync(this.cachePath);
          } catch (err) {
              this.logger.warn('Error deleting cache directory ' + this.cachePath + ': ' + err);
          }
      }
  },

  ensureCacheDirectoryExists: function () {
      if (this.isDiskCache) {
          try {
              mkdirp.sync(this.cachePath);
          } catch (err) {
              this.logger.warn('Error creating cache path ' + cachePath + ': ' + err);
          }
      }
  },

  store: function (path, data) {
    var cacheMap = this.cacheMap;
    this.cacheMap[path] = data;

    if (this.isDiskCache) {
        this.ensureCacheDirectoryExists();
        fs.writeFile(path, data, function (err) {
            if (err) {
                this.logger.warn('Error saving ' + path + ': ' + err);
                delete cacheMap[path];
            }
        });
    }
  },

  get: function (path) {
    if (! this.isDiskCache && this.cacheMap[path]) {
        return this.cacheMap[path];
    } else if (this.isDiskCache) {
        var data;

        try {
            data = fs.readFileSync(path);
        } catch (err) {
            this.logger.warn('Error reading ' + path + ': ' + err);
            return null;
        }

        this.cacheMap[path] = data;
        return data;
    }
  },

  remove: function (path) {
    delete this.cacheMap[path];

    if (this.isDiskCache) {
        try {
            fs.unlinkSync(path);
        } catch (err) {
            this.logger.warn('Error removing ' + path + ': ' + err);
        }
    }
  },

  isCached: function (path) {
      return !! this.get(path);
  }
};

module.exports = Cache;
