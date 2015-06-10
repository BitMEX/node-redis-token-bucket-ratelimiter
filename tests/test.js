var RollingLimit = require('../rollingLimit.js'),
    redis = require('redis'),
    prefix = 'node-redis-rolling-limit-test-' + Date.now(),
    redisClient, defaultLimiter;

exports.redisClientConnect = function(test) {
    redisClient = redis.createClient();
    redisClient.on('ready', function() {
        defaultLimiter = new RollingLimit({
            interval: 5000,
            limit: 3,
            redis: redisClient,
            prefix: prefix
        });
        test.done();
    });
};

exports.use = function(test) {
    test.expect(4);
    (function useNext(numLeft) {
        numLeft--;
        defaultLimiter.use('use1', function(err, res) {
            if (err) {
                throw err;
            }
            test.equal(res, numLeft);
            if (numLeft > -1) {
                //prevent the next time from using the same millisecond number
                setTimeout(function() {
                    useNext(numLeft);
                }, 11);
                return;
            }
            test.done();
        });
    }(3));
};

exports.expires = function(test) {
    test.expect(2);
    var limiter = new RollingLimit({
        interval: 250,
        limit: 3,
        redis: redisClient,
        prefix: prefix
    });
    limiter.use('ttl', function(err) {
        if (err) {
            throw err;
        }
        redisClient.pttl(prefix + 'ttl', function(err, res) {
            if (err) {
                throw err;
            }
            test.ok(res > 50 && res <= 250);
        });

        setTimeout(function() {
            limiter.use('ttl', 0, function(err, res) {
                if (err) {
                    throw err;
                }
                test.equal(res, 3);
                test.done();
            });
        }, 500);
    });
};

exports.rolling = function(test) {
    test.expect(3);
    var limiter = new RollingLimit({
        interval: 500,
        limit: 2,
        redis: redisClient,
        prefix: prefix
    });
    limiter.use('rolling100', function(err, res) {
        if (err) {
            throw err;
        }
        test.equal(res, 1);

        setTimeout(function() {
            //this is running sooner than 500 so there should be none left
            limiter.use('rolling100', function(err, res) {
                test.equal(res, 0);
            });
        }, 300);

        setTimeout(function() {
            //by the time this runs, the original one should've been removed
            limiter.use('rolling100', function(err, res) {
                test.equal(res, 0);
                test.done();
            });
        }, 700);
    });
};

exports.fill = function(test) {
    test.expect(2);
    defaultLimiter.use('fill', function(err, numLeft) {
        if (err) {
            throw err;
        }
        test.equal(numLeft, 2);
        defaultLimiter.fill('fill', function(err) {
            if (err) {
                throw err;
            }
            defaultLimiter.use('fill', function(err, numLeft) {
                if (err) {
                    throw err;
                }
                test.equal(numLeft, 2);
                test.done();
            });
        });
    });
};

exports.useMultiple = function(test) {
    test.expect(1);
    defaultLimiter.use('use2', 2, function(err, res) {
        if (err) {
            throw err;
        }
        test.equal(res, 1);
        test.done();
    });
};

exports.useMoreThanLimit = function(test) {
    test.expect(1);
    defaultLimiter.use('use4', 4, function(err, res) {
        if (err) {
            throw err;
        }
        test.equal(res, -1);
        test.done();
    });
};

exports.useZero = function(test) {
    test.expect(1);
    defaultLimiter.use('use0', 0, function(err, res) {
        if (err) {
            throw err;
        }
        test.equal(res, 3);
        test.done();
    });
};

exports.redisClientEnd = function(test) {
    redisClient.end();
    test.done();
};
