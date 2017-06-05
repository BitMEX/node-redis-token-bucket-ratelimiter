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

-- tokens that should have been added by now
local addTokens = ((nowMS - lastUpdateMS) / intervalMS) * limit

-- calculated token balance coming into this transaction
local newTokens = math.min(prevTokens + addTokens, limit)

-- token balance after trying this transaction
local balanceTokens = newTokens - amount

-- time to fill enough to retry this amount
local retryDelta

-- boolean verdict
local rejected

-- are we cheating tho
local forced = false

-- lets play our game
if balanceTokens < 0 then -- we used more than we have
   if force then -- ugh, /fine/
      forced = true
      rejected = 0
      balanceTokens = 0 -- drain the swamp
   else
      rejected = 1
      balanceTokens = newTokens -- rejection doesn't eat tokens
   end
   retryDelta = math.ceil(((amount - balanceTokens) / limit) * intervalMS)
else -- polite transaction
   rejected = 0
   local nextBalance = balanceTokens - amount
   if(nextBalance < 0) then -- will need to wait to repeat
      retryDelta = math.ceil(((0 - nextBalance) / limit) * intervalMS)
   else -- can repeat with current balance, no wait
      retryDelta = 0
   end
end

-- time to fill completely
local fillDelta = math.ceil(((limit - balanceTokens) / limit) * intervalMS)

-- rejected requests don't cost anything
-- forced requests show up here as !rejected, but with balanceTokens = 0 (drained)
if rejected == 0 then
   redis.call('PSETEX',key,intervalMS,balanceTokens)
   redis.call('PSETEX',timestampKey,intervalMS,nowMS)
end

return { balanceTokens, rejected, retryDelta, fillDelta, forced }
