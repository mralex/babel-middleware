var fs = require('fs'),
    rimraf = require('rimraf'),
    sleep = require('sleep'),
    request = require('supertest'),
    expect = require('chai').expect,
    express = require('express'),
    babel = require('babel-core'),
    babelMiddleware = require('../index');

function transformFile(file) {
    return babel.transformFileSync(file, { presets: [] }).code;
}

function baseSuite() {

    describe('a fresh cache', function() {
        it('hits the proxy', function(done) {
            request(this.app)
                .get('/counter.js')
                .expect('X-Babel-Cache', 'true')
                .expect(200, done);
        });

        it("doesn't get a cache hit", function(done) {
            request(this.app)
                .get('/counter.js')
                .expect('X-Babel-Cache-Hit', 'false')
                .expect(200, done);
        });

        it('returns a transpiled response', function(done) {
            var expectedCode = transformFile(__dirname + '/fixtures/counter.js');

            request(this.app)
                .get('/counter.js')
                .expect('X-Babel-Cache', 'true')
                .expect(200)
                .expect(expectedCode, done);
        });
    });

    describe('a warm cache', function() {
        beforeEach(function(done) {
            request(this.app).get('/counter.js').end(done);
        });

        it('should get a cache hit', function(done) {
            request(this.app)
                .get('/counter.js')
                .expect('X-Babel-Cache-Hit', 'true')
                .expect(200, done);
        });

        it('returns the transpiled response', function(done) {
            var expectedCode = transformFile(__dirname + '/fixtures/counter.js');

            request(this.app)
                .get('/counter.js')
                .expect('X-Babel-Cache', 'true')
                .expect('X-Babel-Cache-Hit', 'true')
                .expect(200)
                .expect(expectedCode, done);
        });
    });

    describe('parsing a syntax error', function() {
        it('responds with a 500', function(done) {
            request(this.app)
                .get('/counter-syntax-error.js')
                .expect(500, done);
        });

        describe('caching behaviour', function() {
            beforeEach(function(done) {
                request(this.app).get('/counter-syntax-error.js').end(done);
            });

            it('does not cache', function(done) {
                request(this.app)
                    .get('/counter-syntax-error.js')
                    .expect('X-Babel-Cache-Hit', 'false')
                    .expect(500, done);
            });
        });
    });

    describe('modifying a cached file', function() {
        beforeEach(function(done) {
            this.filename = __dirname + '/fixtures/test_output.js';
            this.url = '/test_output.js';

            fs.writeFileSync(this.filename, 'console.log("Hello, world");');
            request(this.app).get(this.url).end(function(err, res) {
                this.originalBody = res.body;
                fs.writeFileSync(this.filename, 'console.log("The world changed");');
                done();
            }.bind(this));

            sleep.sleep(1);
        });

        afterEach(function() {
            fs.unlinkSync(this.filename);
        });

        it('does not return a cached response', function(done) {
            request(this.app)
                .get(this.url)
                .expect('X-Babel-Cache-Hit', 'false')
                .expect(200, done);
        });

        it('does not return the original code', function(done) {
            request(this.app)
                .get(this.url)
                .end(function(err, res) {
                    expect(res.body).not.to.equal(this.originalBody);
                    done();
                });
        });
    });
}

describe('middleware', function() {
    it('should exist', function() {
        expect(babelMiddleware).to.exist;
    });

    describe('in-memory cache', function() {
        beforeEach(function() {
            this.app = express();
            this.app.use(babelMiddleware({
                cachePath: 'memory',
                srcPath: __dirname + '/fixtures'
            }));
        });

        baseSuite();
    });

    describe('filesystem cache configuration', function() {
        afterEach(function() {
            rimraf.sync(this.cachePath, {}, function() {});
        });

        it('handles a present cache directory', function() {
            this.cachePath = __dirname + '/_cache';
            rimraf.sync(this.cachePath, {}, function() {});
            fs.mkdirSync(this.cachePath);

            this.app = express();

            var initFn = function() {
                this.app.use(babelMiddleware({
                    cachePath: this.cachePath,
                    srcPath: __dirname + '/fixtures'
                }));
            }.bind(this);

            expect(initFn).to.not.throw();
        });
    });

    describe('filesystem cache', function() {
        beforeEach(function() {
            this.cachePath = __dirname + '/_cache';
            this.app = express();
            this.app.use(babelMiddleware({
                cachePath: this.cachePath,
                srcPath: __dirname + '/fixtures'
            }));
        });

        afterEach(function() {
            rimraf.sync(this.cachePath, {}, function() {});
        });

        function testFileGetsCached() {
            it('caches a file', function(done) {
                request(this.app)
                    .get('/counter.js')
                    .end(function(err, res) {
                        var hash = res.header['x-babel-cache-hash'];
                        var filename = this.cachePath + '/' + hash + '.js';

                        expect(function() {
                            fs.lstatSync(filename);
                        }).to.not.throw();

                        done();
                    }.bind(this));
            });
        }

        testFileGetsCached();
        baseSuite();

        describe('on restart', function() {
            beforeEach(function(done) {
                request(this.app).get('/counter.js').end(done);
                this.app = express();
                this.app.use(babelMiddleware({
                    cachePath: this.cachePath,
                    srcPath: __dirname + '/fixtures'
                }));
            });

            it('uses previously cached assets', function(done) {
                request(this.app)
                    .get('/counter.js')
                    .expect('X-Babel-Cache-Hit', 'true')
                    .expect(200, done);
            });
        });

        describe('if the cache goes away', function() {
            beforeEach(function(done) {
                request(this.app).get('/counter.js').end(done);
            });

            function deletedFileTests() {
                it('loads an uncached version again', function(done) {
                    request(this.app)
                        .get('/counter.js')
                        .expect('X-Babel-Cache-Hit', 'false')
                        .expect(200, done);
                });

                testFileGetsCached();
            }

            describe('if only the files are deleted', function() {
                beforeEach(function() {
                    rimraf.sync(this.cachePath + '/*', {}, function() {});
                });

                deletedFileTests();
            });

            describe('if the cache directory is deleted', function() {
                beforeEach(function() {
                    rimraf.sync(this.cachePath, {}, function() {});
                });

                deletedFileTests();
            });
        });
    });

    describe('excluding files', function() {
        beforeEach(function() {
            this.app = express();
            this.app.use(babelMiddleware({
                cachePath: 'memory',
                srcPath: __dirname + '/fixtures',
                exclude: ['*syntax*']
            }));
        });

        it('returns the original file on request', function(done) {
            var expectedCode = fs.readFileSync(__dirname + '/fixtures/counter-syntax-error.js', 'utf8');

            request(this.app)
                .get('/counter-syntax-error.js')
                .expect('X-Babel-Cache', 'false')
                .expect(200)
                .expect(expectedCode, done);
        });
    });
});
