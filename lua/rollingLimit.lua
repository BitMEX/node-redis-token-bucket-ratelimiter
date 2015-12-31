-- key limit interval now [amount]
local limit = tonumber(ARGV[1])
local interval = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local amount = 1
-- default the amount to 1 unless they specified one
if ARGV[4] then
    amount = math.max(tonumber(ARGV[4]), 0)
end
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - interval)
local num = redis.call('ZCARD', KEYS[1])
-- if we're already over the limit don't bother adding another timestamp
if num + amount > limit then
    return -1
end
-- convert to hex to save space
-- append the num on the end so it doesn't clash with other values at same now
local member = string.format("%x%x", now, num)
if amount > 0 then
    -- if the amount is > 1 then we need to do a zadd with arguments for each
    -- amount but if its just 1 then we can just do a regular zadd with 2 args
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
