babel-middleware
================

Simple Express/Connect middleware to automatically transpile JavaScript files
from ES2015+ to ES5 via Babel, and cache the results to memory or the
file-system as desired.

Usage
=====
```javascript
var express = require('express');
var babel = require('babel-middleware');
var app = express();

app.use('/js/', babel({
    srcPath: 'app/js',
    cachePath: __dirname + '/_cache'
    babelOptions: {
        presets: ['es2015']
    }
}));

app.listen(3001);
```

Options
=======

### `srcPath: '/path/to/js/'`
An absolute or relative path to the input source. This option is required.

### `cachePath: '/path/to/cache/'|'memory'`
Use either _memory_ for an in-memory cache; or a path to the desired cache directory (it does not need to exist when the app starts).

Default: _memory_

### `exclude: ['production/example/*.js']`
An array of path globs to exclude from transpiling and caching. Returns the originally requested file. See [Micromatch documentation](https://www.npmjs.com/package/micromatch) for globbing examples. Exclusions do not match against `srcPath`.

Default: _[]_

### `babelOptions: {}`
An options object passed into `babel.transformFile`. See [Babel documentation](https://babeljs.io/docs/usage/options/) for usage.

### `debug: true|false`
Print debug output.

Default: _false_

### `consoleErrors: true|false`
Print errors to the web console.

Default: _false_

### `serverConsoleErrors: true|false`
Print errors to the server console.

Default: _false_

LICENSE
=======

Apache 2.0.
