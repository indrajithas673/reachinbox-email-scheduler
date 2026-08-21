import redis from '../config/redis';

/**
 * Result representing the exact timestamp (in MS) when the sender is 
 * next allowed to send (or start of next hour).
 */
export type CoordinationResult = 
  | { status: 'OK'; nextAllowedAt: number }
  | { status: 'DELAY_REQUIRED'; nextAllowedAt: number }
  | { status: 'RATE_LIMITED'; nextHourMs: number };

export class CoordinationService {
  /**
   * Atomically coordinates the hourly rate limit and minimum sender spacing.
   *
   * @param senderId The persistent sender ID
   * @param hourlyLimit The MAX_EMAILS_PER_HOUR
   * @param minDelayMs The MIN_EMAIL_DELAY_MS
   * @returns CoordinationResult
   */
  static async tryReserveSendSlot(
    senderId: string,
    hourlyLimit: number,
    minDelayMs: number
  ): Promise<CoordinationResult> {
    const now = Date.now();
    
    // Calculate the start of the current UTC hour and next UTC hour
    const date = new Date(now);
    date.setUTCMinutes(0, 0, 0);
    const currentHourKeySuffix = date.toISOString(); // e.g. 2026-08-21T07:00:00.000Z
    
    date.setUTCHours(date.getUTCHours() + 1);
    const nextHourMs = date.getTime();

    const rateKey = `email-rate:${senderId}:${currentHourKeySuffix}`;
    const delayKey = `email-delay:${senderId}`;

    // LUA Script for atomic reservation
    // ARGV: [limit, minDelayMs, now, nextHourMs]
    // KEYS: [rateKey, delayKey]
    const luaScript = `
      local rateKey = KEYS[1]
      local delayKey = KEYS[2]
      local limit = tonumber(ARGV[1])
      local minDelayMs = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      local nextHourMs = tonumber(ARGV[4])

      -- 1. Check if sender spacing is currently enforcing a delay
      local nextAllowedDelay = tonumber(redis.call("GET", delayKey) or "0")
      if nextAllowedDelay > now then
          return { "DELAY_REQUIRED", nextAllowedDelay }
      end

      -- 2. Check if hourly limit is reached
      local currentCount = tonumber(redis.call("GET", rateKey) or "0")
      if currentCount >= limit then
          return { "RATE_LIMITED", nextHourMs }
      end

      -- 3. Both passed: Reserve slot
      redis.call("INCR", rateKey)
      if currentCount == 0 then
          -- Set expiry on rate counter (2 hours gives enough safety buffer)
          redis.call("EXPIRE", rateKey, 7200)
      end

      local newNextAllowedDelay = now + minDelayMs
      -- Lock the delay key until the time passes. Use PSETEX for safety.
      redis.call("PSETEX", delayKey, minDelayMs * 2, tostring(newNextAllowedDelay))

      return { "OK", newNextAllowedDelay }
    `;

    const result = await redis.eval(
      luaScript,
      2, // num keys
      rateKey,
      delayKey,
      hourlyLimit.toString(),
      minDelayMs.toString(),
      now.toString(),
      nextHourMs.toString()
    ) as [string, number];

    const [status, timestamp] = result;

    if (status === 'DELAY_REQUIRED') {
      return { status: 'DELAY_REQUIRED', nextAllowedAt: timestamp };
    }
    
    if (status === 'RATE_LIMITED') {
      return { status: 'RATE_LIMITED', nextHourMs: timestamp };
    }

    return { status: 'OK', nextAllowedAt: timestamp };
  }
}
