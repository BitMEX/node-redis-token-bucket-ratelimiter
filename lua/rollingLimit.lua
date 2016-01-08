-- key limit intervalMS nowMS [amount]
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local intervalMS = tonumber(ARGV[2])
local nowMS = tonumber(ARGV[3])
-- default the amount to 1 unless they specified one
local amount = 1
if ARGV[4] then
    amount = math.max(tonumber(ARGV[4]), 0)
end

redis.call('ZREMRANGEBYSCORE', key, '-inf', nowMS - intervalMS)
local num = redis.call('ZCARD', key)

local left = limit - num - amount
-- if we're already over the limit don't bother adding another timestamp
if left < 0 then
    return -1
end

-- convert to hex to save space
-- append the num on the end so it doesn't clash with other values at same nowMS
if amount > 0 then
    local args = {'ZADD', key}
    for i = 1, amount do
        args[(i * 2) + 1] = nowMS
        args[(i * 2) + 2] = string.format("%x%x%s", nowMS, num, i)
    end
    redis.call(unpack(args))
    -- only actually update expire if they added a new token
    redis.call('PEXPIRE', key, intervalMS)
end
return left
