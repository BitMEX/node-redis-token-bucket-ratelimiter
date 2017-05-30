-- key limit intervalMS nowMS [amount]
local key        = KEYS[1]
local limit      = tonumber(ARGV[1])
local intervalMS = tonumber(ARGV[2])
local nowMS      = tonumber(ARGV[3])
-- default the amount to 1 unless they specified one
local amount = 1
if ARGV[4] then
    amount = math.max(tonumber(ARGV[4]), 0)
end

local ts_key = key .. ":T";

local tokens       = redis.call('GET',key);
local lastUpdateMS = redis.call('GET',ts_key);

if tokens == false then tokens = limit end;
if lastUpdateMS == false then lastUpdateMS = nowMS end;

local addTokens = math.floor(((nowMS - lastUpdateMS) / intervalMS) * limit);

local newTokens = tokens + addTokens;

if newTokens > limit then newTokens = limit end;

newTokens = newTokens - amount;

if newTokens >= 0 then
  -- valid request
  redis.call('SET',ts_key,nowMS);
  if newTokens ~= tokens then redis.call('SET',key,newTokens) end;
  redis.call('PEXPIRE',key,intervalMS);
  redis.call('PEXPIRE',ts_key,intervalMS);
  return newTokens;
else
  -- invalid request
  return -1;
end
