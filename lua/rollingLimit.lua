-- valueKey timestampKey | limit intervalMS nowMS [amount]
local valueKey     = KEYS[1] -- "limit:1:V"
local timestampKey = KEYS[2] -- "limit:1:T"
local limit        = tonumber(ARGV[1])
local intervalMS   = tonumber(ARGV[2])
local refill       = tonumber(ARGV[3])
local amount       = math.max(tonumber(ARGV[4]), 0)
local force        = ARGV[5] == "true"

local lastUpdateMS
local prevTokens

-- Use effects replication, not script replication;; this allows us to call 'TIME' which is non-deterministic
redis.replicate_commands()

local time = redis.call('TIME')
local nowMS = math.floor((time[1] * 1000) + (time[2] / 1000))
local initialTokens = redis.call('GET',valueKey)
local initialUpdateMS = false


if initialTokens == false then
   -- If we found no record, we temporarily rewind the clock to refill
   -- via addTokens below
   prevTokens = limit
   lastUpdateMS = nowMS - intervalMS
else
   prevTokens = initialTokens
   initialUpdateMS = redis.call('GET',timestampKey)

   if(initialUpdateMS == false) then -- this is a corruption
      -- we make up a time that would fill this limit via addTokens below
      lastUpdateMS = nowMS - ((prevTokens / limit) * intervalMS)
   else
      lastUpdateMS = initialUpdateMS
   end
end

-- tokens that should have been added by now
-- note math.max in case this ends up negative (clock skew?)
-- now that we call 'TIME' this is less likely to happen
local addTokens = math.max(((nowMS - lastUpdateMS) / intervalMS) * refill, 0)

-- calculated token balance coming into this transaction
local grossTokens = math.min(prevTokens + addTokens, limit)

-- token balance after trying this transaction
local netTokens = grossTokens - amount

-- time to fill enough to retry this amount
local retryDelta = 0

local rejected = false
local forced = false

if netTokens < 0 then -- we used more than we have
   if force then
      forced = true
      netTokens = 0 -- drain the swamp
   else
      rejected = true
      netTokens = grossTokens -- rejection doesn't eat tokens
   end
   -- == percentage of `intervalMS` required before you have `amount` tokens
   retryDelta = math.ceil(((amount - netTokens) / refill) * intervalMS)
else -- polite transaction
   -- nextNet == pretend we did this again...
   local nextNet = netTokens - amount
   if nextNet < 0 then -- ...we would need to wait to repeat
      -- == percentage of `invervalMS` required before you would have `amount` tokens again
      retryDelta = math.ceil((math.abs(nextNet) / refill) * intervalMS)
   end
end

-- rejected requests don't cost anything, we'll wait for a costly request to update our values
-- forced requests show up here as !rejected, but with netTokens = 0 (drained)
if rejected == false then

   redis.call('PSETEX',valueKey,intervalMS,netTokens)

   if addTokens > 0 or initialUpdateMS == false then
      -- we filled some tokens, so update our timestamp
      redis.call('PSETEX',timestampKey,intervalMS,nowMS)
   else
      -- we didn't fill any tokens, so just renew the timestamp so it survives with the value
      redis.call('PEXPIRE',timestampKey,intervalMS)
   end
end

return { netTokens, rejected, retryDelta, forced }
