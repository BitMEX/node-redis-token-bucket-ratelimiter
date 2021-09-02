'use strict';
const RollingLimit = require('../rollingLimit.js');
const assert = require('assert');
const sinon = require('sinon');
const promisify = require('util').promisify;

function makeTestSuite(name, redisClient, lag) {
  function assertBetween(low, high, number) {
    assert((low + lag / 2) <= number && number <= (high + lag));
  }

  let prefix;

  describe(`${name} - Ratelimiter`, () => {
    let defaultLimiter;

    after(() => {
      redisClient.quit();
    });

    context('With default options', () => {
      before(() => {
        prefix = 'node-redis-rolling-limit-test-' + Date.now();
        defaultLimiter = new RollingLimit({
          interval: 5000,
          limit: 3,
          redis: redisClient,
          prefix: prefix
        });
      });


      it('Rejects when out of tokens', () => {
        let numLeft = 3;
        // 3 req per 5000ms
        return defaultLimiter.use('use1')
        .then(function consumeReq(res) {
          if (numLeft) {
            assert.equal(res.remaining, numLeft - 1);
            assert.equal(res.rejected, false);
            numLeft--;
            return defaultLimiter.use('use1').then(consumeReq);
          }
          return res;
        })
        .then((res) => {
          assert.equal(res.remaining, 0);
          assert.equal(res.rejected, true);
        });
      });

      it('Expires the keys after interval ms', () => {
        const limiter = new RollingLimit({
          interval: 250 + lag,
          limit: 3,
          redis: redisClient,
          prefix: prefix
        });
        redisClient.pttlAsync = promisify(redisClient.pttl).bind(redisClient);

        return limiter.use('ttl')
        .then((res) => {
          assert.equal(res.remaining, 2);
          return redisClient.pttlAsync(prefix + ':{ttl}:V')
          .then((res) => {
            assertBetween(50, 250, res);
          })
        })
        .then(() => delay(500 + lag))
        .then(() => limiter.use('ttl'))
        .then((res) => {
          // Unchanged because it has reset
          assert.equal(res.remaining, 2);
          return redisClient.pttlAsync(prefix + ':{ttl}:V')
          .then((res) => {
            assertBetween(50, 250, res);
          })
        });
      });

      it('Slowly refills limit', () => {
        const limiter = new RollingLimit({
          interval: 500 + lag,
          limit: 2,
          redis: redisClient,
          prefix: prefix
        });
        const NAME = 'rolling100';

        return limiter.use(NAME, 2)
        .then((res) => {
          assert.equal(res.rejected, false);
          assert.equal(res.remaining, 0);
          assertBetween(400, 500, res.retryDelta);
        })
        .then(() => delay(150))
        .then(() => limiter.use(NAME, 1))
        .then((res) => {
          assert.equal(res.rejected, true);
          assertBetween(0, 100, res.retryDelta);
        })
        .then(() => delay(100))
        .then(() => limiter.use(NAME, 1))
        .then((res) => {
          assert.equal(res.rejected, false);
          assert.equal(res.remaining, 0);
          assertBetween(150, 250, res.retryDelta);
        })
        .then(() => delay(600))
        .then(() => limiter.use(NAME, 1))
        .then((res) => {
          assert.equal(res.remaining, 1);
          assert.equal(res.rejected, false);
        });
      });

      it('Deduction > 1', () => {
        return defaultLimiter.use('useMultiple', 3)
        .then((res) => {
          assert.equal(res.remaining, 0);
          assert.equal(res.rejected, false);
        })
      });

      it('Deduction more than limit', () => {
        return defaultLimiter.use('use4', 4)
        .then(() => assert(false))
        .catch((e) => {
          assert(e instanceof Error);
          assert(/amount must be < limit/i.test(e.message));
        })
      });

      it('Deduction of zero (stub deduction)', () => {
        return defaultLimiter.use('use0', 3)
        .then((res) => {
          assert.equal(res.remaining, 0);
          return defaultLimiter.use('use0', 0);
        })
        .then((res) => {
          assert.equal(res.rejected, false);
          assert.equal(res.retryDelta, 0);
        });
      });

      it('Does not deduct when it should add if clock skews', () => {
        const limiter = new RollingLimit({
          interval: 500 + lag,
          limit: 100,
          redis: redisClient,
          prefix: prefix
        });
        const NAME = 'clockSkewTest';

        // Set the date into the future
        const clock = sinon.useFakeTimers(Date.now() + 300);

        return limiter.use(NAME, 1)
        .then((res) => {
          assert.equal(res.remaining, 99);
          // Restore the clock; this should not deduct more tokens
          clock.restore();
          return limiter.use(NAME, 1)
        })
        .then((res) => {
          assert.equal(res.remaining, 98);
          assert.equal(res.rejected, false);
        });
      });
    });

    describe(`${name} - Ratelimiter with allowLargerWithdrawal`, () => {
      const interval = 400;
      const limit = 4;
      let id = 0;
      let limiter;

      const testId = () => `use${id}`;

      afterEach(() => id++);

      before(() => {
        prefix = 'node-redis-rolling-limit-test-' + Date.now();
        limiter = new RollingLimit({
          interval,
          limit,
          redis: redisClient,
          prefix: prefix,
          allowLargerWithdrawal: true,
        });
      });

      it('Allows an initial request for more tokens than are in the bucket', () => {
        const use = limit + 2;
        return limiter.use(testId(), use)
        .then((res) => {
          assert.equal(res.rejected, false);
          assert.equal(res.remaining, limit - use);
        })
      });

      it('Rejects if the bucket is not full when a larger withdrawal occurs', () => {
        return limiter.use(testId(), 1)
        .then((res) => {
          assert.equal(res.rejected, false);
          assert.equal(res.remaining, limit - 1);
          return limiter.use(testId(), limit + 1);
        })
        .then((res) => {
          assert.equal(res.rejected, true);
          assert.equal(res.remaining, limit - 1);
        });
      });

      it('Allows the bucket to refill after initially draining it below zero', () => {
        const originalUse = limit + 2;
        return limiter.use(testId(), originalUse)
        .then((res) => {
          assert.equal(res.rejected, false);
          assert.equal(res.remaining, limit - originalUse);
          // Wait and then try again
          return delay(interval)
            .then(() => limiter.use(testId(), originalUse));
        })
        .then((res) => {
          // We actually need a longer refill time here than the normal interval
          // for the bucket to fill back to the top after draining below zero
          assert.equal(res.rejected, true);
          // Two interval periods have passed (the initial one before our test starts
          // and then the one that we've waited for), so the bucket should contain
          // twice the limit minus our original use
          assert.equal(res.remaining, limit * 2 - originalUse);
          return delay(res.retryDelta)
            .then(() => limiter.use(testId(), originalUse));
        })
        .then((res) => {
          assert.equal(res.rejected, false);
          assert.equal(res.remaining, limit - originalUse);
        });
      });

      it('Properly calculates retryDelta', () => {
        const use = limit * 2;
        return limiter.use(testId(), use)
        .then((res) => {
          assert.equal(res.rejected, false);
          assert.equal(res.remaining, limit - use);
          // The retryDelta is the time it would take to be able to make a request
          // for the same amount again. In this case, it's the time it would take
          // to fully fill the bucket again.
          assertBetween(interval * 2 - 10, interval * 2 + 10, res.retryDelta);
          return limiter.use(testId(), 1)
        })
        .then((res) => {
          assert.equal(res.rejected, true);
          // This retryDelta will be the time required to be able to get 1 token
          const expectedRetryDelta = Math.floor(interval + (interval / limit));
          assertBetween(expectedRetryDelta - 10, expectedRetryDelta + 10, res.retryDelta);
          return delay(res.retryDelta)
            .then(() => limiter.use(testId(), 1))
        })
        .then((res) => {
          assert.equal(res.rejected, false);
          assert.equal(res.remaining, 0);
        });
      });
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  makeTestSuite,
};
