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
      defaultLimiter.use('use1').then(function(res) {
            if (numLeft) {
                test.equal(res.remaining, numLeft - 1);
                test.equal(res.rejected, false);
                setTimeout(function() {
                    numLeft--;
                    useNext();
                });
            }
            else{
              test.equal(res.remaining, 0);
              test.equal(res.rejected, true);
              test.done();
            }
      })
      .catch(function(err){
        console.log('use1 error', err);
        test.done();
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
  
  limiter.use('ttl').then(function(res) {
    redisClient.pttl(prefix + 'limit:ttl', function(err, res) {
      if (err) {
        console.log('prefix ttl error', err);
        test.done();
        return;
      }

      test.ok(50 < res && res <= 250);
    });
    
    setTimeout(function() {
      limiter.use('ttl').then(function(res) {
        redisClient.pttl(prefix + 'limit:ttl', function(err, res) {
          if (err) console.log('prefix ttl error', err);
          else {
            test.ok(50 < res && res <= 250);
            test.done();
          }
        });        
      })
      .catch(function(err){
        console.log('ttl error', err);
        test.done();
      });
    }, 500);
  })
  .catch(function(err){
    console.log('ttl error', err);
    test.done();
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

    setTimeout(function() {
      limiter.use('rolling100', 2).then(function(res) {
        test.equal(res.rejected, false);
        test.equal(res.remaining, 0);
        test.ok(400 < res.retryDelta && res.retryDelta <= 500);
      })
      .catch(function(err){
        console.log('rolling100 error', err);
        test.done();
      });
    },0);

    setTimeout(function() {
      limiter.use('rolling100', 1).then(function(res) {
        test.equal(res.rejected, true);
        test.ok(0 < res.retryDelta && res.retryDelta <= 100);
      })
      .catch(function(err){
        console.log('rolling100 in setTimeout1 error', err);
        return;
      });
    }, 150);

    setTimeout(function() {
      limiter.use('rolling100', 1).then(function(res) {
        test.equal(res.rejected, false);
        test.equal(res.remaining, 0);
        test.ok(150 < res.retryDelta && res.retryDelta <= 250);
      })
      .catch(function(err){
        console.log('rolling100 in setTimeout1 error', err);
      });
    }, 250);

    setTimeout(function() {
      limiter.use('rolling100', 1).then(function(res) {
        test.equal(res.remaining, 1);
        test.equal(res.rejected, false);
        test.done();
      })
      .catch(function(err){
        console.log('rolling100 in setTimeout1 error', err);
      });
    }, 850);

};

exports.useMultiple = function(test) {
    test.expect(2);
    defaultLimiter.use('useMultiple', 3).then(function(res) {
        test.equal(res.remaining, 0);
        test.equal(res.rejected, false);
        test.done();
    })
    .catch(function(err){
        console.log('useMultiple error', err);
        test.done();
    });
};

exports.useMoreThanLimit = function(test) {
    test.expect(1);
  defaultLimiter.use('use4', 4)
    .then(test.done)
    .catch(function(){
      test.ok(true);
      test.done();
    })
};

exports.useZero = function(test) {
    test.expect(3);
    defaultLimiter.use('use0',3).then(function(res) {
        test.equal(res.remaining, 0);
        defaultLimiter.use('use0',0).then(function(res) {
          test.equal(res.rejected, false);
          test.equal(res.retryDelta, 0);
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
