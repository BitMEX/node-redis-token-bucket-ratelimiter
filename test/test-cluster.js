'use strict';
const Redis = require('ioredis');
const {makeTestSuite} = require('./_test-common');
const port = Number(process.env.PORT) || 7001;
const host = process.env.HOST || '127.0.0.1';

const redisClient = new Redis.Cluster([
  {port,host},
  {port: port + 1, host},
  {port: port + 2, host},
], {
  scaleReads: 'all',
});

redisClient.on('error', (e) => {
  console.error(`Error connecting to Redis Cluster. Did you start a local server on ${port}?`);
  console.error(e);
});

makeTestSuite('cluster client', redisClient, 300 /* lag */);
