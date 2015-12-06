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

### `babelOptions: {}`
An options object passed into `babel.transformFile`. See [Babel documentation](https://babeljs.io/docs/usage/options/) for usage.

LICENSE
=======

Apache 2.0.
