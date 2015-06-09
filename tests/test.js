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
    test.expect(1);
    defaultLimiter.use('ttl', function(err) {
        if (err) {
            throw err;
        }
        redisClient.pttl(prefix + 'ttl', function(err, res) {
            if (err) {
                throw err;
            }
            test.ok(res > 4000 && res <= 5000);
            test.done();
        });
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

exports.redisClientEnd = function(test) {
    redisClient.end();
    test.done();
};
