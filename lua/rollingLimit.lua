-- key limit intervalMS nowMS [amount]
local key        = KEYS[1]
local limit      = tonumber(ARGV[1])
local intervalMS = tonumber(ARGV[2])
local nowMS      = tonumber(ARGV[3])
local amount     = math.max(tonumber(ARGV[4]), 0)
local force      = ARGV[5] == "true"

local timestampKey = key .. ":T"

local prevTokens = redis.call('GET',key)
local lastUpdateMS

if prevTokens == false then
   prevTokens = amount
   lastUpdateMS = nowMS
else
   lastUpdateMS = redis.call('GET',timestampKey)
   if(lastUpdateMS == false) then lastUpdateMS = nowMS end
end

local addTokens = ((nowMS - lastUpdateMS) / intervalMS) * limit
local newTokens = math.min(prevTokens + addTokens, limit)
local balanceTokens = newTokens - amount

local rejected
local refillDelta

if balanceTokens < 0 then
   if force then
      balanceTokens = 0
      if amount <= limit then
	 refillDelta = math.ceil((amount / limit) * intervalMS)
      else
	 refillDelta = -1
      end
      rejected = 0
   else
      balanceTokens = newTokens
      if amount <= limit then
	 refillDelta = math.ceil(((amount - balanceTokens) / limit) * intervalMS)
      else
	 refillDelta = -1
      end
      rejected = 1
   end
else
   local nextBalance = balanceTokens - amount
   if(nextBalance < 0) then
      refillDelta = ((0 - nextBalance) / limit) * intervalMS
   else
      refillDelta = 0
   end
   rejected = 0
end

-- rejected requests don't cost anything
-- forced requests show up here as !rejected, but with balanceTokens = 0 (drained)
if rejected == 0 then
   redis.call('PSETEX',key,intervalMS,balanceTokens)
   redis.call('PSETEX',timestampKey,intervalMS,nowMS)
end

return { balanceTokens, rejected, refillDelta }
