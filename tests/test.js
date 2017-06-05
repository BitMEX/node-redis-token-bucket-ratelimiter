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
    test.expect(8);
    let numLeft = 3;
    (function useNext() {
        // 3/5000
        defaultLimiter.use('use1', function(err, res) {
            if (err) {
                console.log('use1 error', err);
                test.done();
                return;
            }
            test.equal(res.remaining, 0);
            test.equal(res.rejected, false);
            if (numLeft) {
                setTimeout(function() {
                    numLeft--;
                    useNext();
                }, 1667);
            }
            else test.done();
        });
    }());
};

exports.expires = function(test) {
    test.expect(2);
    var limiter = new RollingLimit({
        interval: 250,
        limit: 3,
        redis: redisClient,
        prefix: prefix
    });

    function testTTL(cb){
        redisClient.pttl(prefix + 'ttl', function(err, res) {
            if (err) {
                console.log('prefix ttl error', err);
                test.done();
                return;
            }
            test.ok(res > 50 && res <= 250);
            cb();
        });
    }

    limiter.use('ttl', function(err) {
        if (err) {
            console.log('ttl error', err);
            test.done();
            return;
        }
        testTTL(function(){
            setTimeout(function() {
                limiter.use('ttl', 0, function(err, res) {
                    if (err) {
                        console.log('ttl2 error', err);
                        test.done();
                        return;
                    }
                    testTTL(function(){
                        test.done();
                    });
                });
            }, 500);
        });
    });
};

exports.rolling = function(test) {
    test.expect(10);
    var limiter = new RollingLimit({
        interval: 500,
        limit: 2,
        redis: redisClient,
        prefix: prefix
    });
    limiter.use('rolling100', function(err, res) {
        if (err) {
            console.log('rolling100 error', err);
            test.done();
            return;
        }
        test.equal(res.rejected, false);
        test.equal(res.remaining, 0);
        test.ok(res.retryDelta > 0 && res.retryDelta <= 250);

        setTimeout(function() {
            limiter.use('rolling100', function(err, res) {
                if (err) {
                    console.log('rolling100 in setTimeout1 error', err);
                    return;
                }
                test.equal(res.rejected, true);
                test.ok(res.retryDelta > 0 && res.retryDelta <= 100);
            });
        }, 150);

        setTimeout(function() {
            limiter.use('rolling100', function(err, res) {
                if (err) {
                    console.log('rolling100 in setTimeout1 error', err);
                    return;
                }
                test.equal(res.remaining, 0);
                test.equal(res.rejected, false);
                test.ok(res.retryDelta > 0 && res.retryDelta <= 200);
            });
        }, 300);

        setTimeout(function() {
            limiter.use('rolling100', 0, function(err, res) {
                if (err) {
                    console.log('rolling100 in setTimeout2 error', err);
                    test.done();
                    return;
                }
                test.equal(res.remaining, 1);
                test.equal(res.retryDelta, 0);
                test.done();
            });
        }, 700);
    });
};

exports.useMultipleReject = function(test) {
    test.expect(3);
    defaultLimiter.use('useMultipleReject', 2).then(function(res) {
        test.equal(res.remaining, 0);
        test.equal(res.rejected, false);
        defaultLimiter.use('useMultipleReject', 2).then(function(res) {
            test.equal(res.rejected, true);
            test.done();
        })
    })
    .catch(function(err){
        console.log('useMultipleReject error', err);
        test.done();
    });
};

exports.useMultiple = function(test) {
    test.expect(3);
    defaultLimiter.use('useMultiple', 2).then(function(res) {
        test.equal(res.remaining, 0);
        test.equal(res.rejected, false);
        defaultLimiter.use('useMultiple', 1).then(function(res) {
            test.equal(res.rejected, true);
            test.done();
        });
    })
    .catch(function(err){
        console.log('useMultiple error', err);
        test.done();
    });
};

exports.useMoreThanLimit = function(test) {
    test.expect(1);
    try{
        defaultLimiter.use('use4', 4);
    }
    catch(err){
        test.ok(err !== undefined);
    }  
    test.done();
};

exports.useZero = function(test) {
    test.expect(3);
    defaultLimiter.use('use0',3).then(function(res) {
        test.equal(res.remaining, 0);
        test.ok(res.retryDelta > 100);
        defaultLimiter.use('use0',0).then(function(res) {
          test.equal(res.rejected, false);
          test.done();
        });
    }).catch(function(err) {
        console.log('error in useZero chain', err);
        test.done();
    });
};

exports.redisClientEnd = function(test) {
    redisClient.end();
    test.done();
};
