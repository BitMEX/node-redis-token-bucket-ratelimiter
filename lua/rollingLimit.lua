-- key limit interval now [amount]
local limit = tonumber(ARGV[1])
local interval = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local amount = 1
if ARGV[4] then
    amount = math.max(tonumber(ARGV[4]), 0)
end
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - interval)
local num = redis.call('ZCARD', KEYS[1])
if num + amount > limit then
    return -1
end
-- only take the first 30 bits then convert to hex to save space
local member = string.format("%x%x", bit.band(now, 1073741823), num)
if amount > 0 then
    if amount > 1 then
        local args = {'ZADD', KEYS[1]}
        for i = 1, amount do
            args[(i * 2) + 1] = now
            args[(i * 2) + 2] = member .. tostring(i)
        end
        num = num + redis.call(unpack(args))
    else
        num = num + redis.call('ZADD', KEYS[1], now, member)
    end
    -- only actually update expire if they added a new token
    redis.call('PEXPIRE', KEYS[1], interval)
end
return limit - num
