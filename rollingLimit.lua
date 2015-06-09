-- key limit interval now
local limit = tonumber(ARGV[1])
local interval = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - interval)
local num = redis.call('ZCARD', KEYS[1])
if num >= limit then
    return -1
end
num = num + redis.call('ZADD', KEYS[1], now, now)
redis.call('PEXPIRE', KEYS[1], interval)
return limit - num