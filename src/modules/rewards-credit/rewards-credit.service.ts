import { AppError } from '../../lib/errors'
import { logger } from '../../lib/logger'
import * as rewardsCreditRepo from './rewards-credit.repository'

// ── Rewards Member Program (residential only) ───────────────────────────────
// Book a delivery (completed) → earn 1 point per $1 spent → redeem points
// for future delivery discounts. See migration 068. Corporate customers
// have a separate, unrelated program (tiers) — this module never touches them.
const EARN_RATE_SLUG        = 'earn_rate'         // points earned per $1 spent
const CREDIT_CONVERSION_SLUG = 'credit_conversion' // points required per $1 of credit
const BIRTHDAY_BONUS_SLUG   = 'birthday_bonus'     // flat points, once every rolling 365 days

const BIRTHDAY_BONUS_COOLDOWN_MS = 365 * 86_400_000

async function getRuleValue(slug: string, fallback: number): Promise<number> {
  const { data, error } = await rewardsCreditRepo.findRewardsRuleValue(slug)
  if (error || !data || data.value == null) return fallback
  return Number(data.value)
}

async function getConversionRate(): Promise<number> {
  return getRuleValue(CREDIT_CONVERSION_SLUG, 100) // 100 points = $1, i.e. 500 points = $5
}

export interface RewardsSummary {
  points:         number
  creditAvailable: number
  conversionRate: number // points per $1 of credit — frontend can render "X points = $Y"
}

// Lazily checks (and awards) the birthday bonus — called on every
// balance/summary read instead of needing a cron job.
//
// date_of_birth is freely editable by the customer (correcting a typo
// should always be possible — see users.service.ts), so the DOB itself
// can't be the abuse gate: someone could earn the bonus, change their DOB
// to another "today", and earn it again. The actual gate is on the EARN
// side — at most one birthday_bonus per profile every rolling 365 days,
// measured from the last award (findLastBirthdayBonus), not the calendar
// and not tied to the DOB value in any way. Changing your birthday changes
// only *when in the year* you're next eligible, never *how often*.
async function awardBirthdayBonusIfDue(profileId: string): Promise<void> {
  try {
    const { data: profile } = await rewardsCreditRepo.findDateOfBirth(profileId)
    const dob = profile?.date_of_birth as string | null | undefined
    if (!dob) return

    // Profiles have no stored timezone, and `dob` is a plain calendar date
    // the customer picked in their own browser — comparing it against a
    // single UTC "today" can miss by a day for anyone not near UTC+0
    // (e.g. it's already the 26th in UTC while still the 25th locally, or
    // vice versa). Checking a ±1 day UTC window instead closes that gap.
    const now = new Date()
    const [, dobMonth, dobDay] = dob.split('-').map(Number)
    const isBirthdayWindow = [-1, 0, 1].some((offsetDays) => {
      const d = new Date(now.getTime() + offsetDays * 86_400_000)
      return d.getUTCMonth() + 1 === dobMonth && d.getUTCDate() === dobDay
    })
    if (!isBirthdayWindow) return

    const { data: lastBonus } = await rewardsCreditRepo.findLastBirthdayBonus(profileId)
    if (lastBonus?.created_at) {
      const sinceLast = now.getTime() - new Date(lastBonus.created_at as string).getTime()
      if (sinceLast < BIRTHDAY_BONUS_COOLDOWN_MS) return // already claimed within the last year
    }

    const bonus = await getRuleValue(BIRTHDAY_BONUS_SLUG, 250)
    if (bonus <= 0) return

    const { error: ledgerErr } = await rewardsCreditRepo.insertLedgerEntry({
      profile_id: profileId,
      points:     bonus,
      amount:     0,
      type:       'birthday_bonus',
      note:       'Birthday bonus',
    })
    if (ledgerErr) throw ledgerErr

    const { data: balanceRow } = await rewardsCreditRepo.findBalance(profileId)
    const currentPoints = (balanceRow?.points_balance as number | undefined) ?? 0
    await rewardsCreditRepo.upsertBalance(profileId, currentPoints + bonus)
  } catch (err) {
    logger.error('Failed to award birthday bonus points', { profileId, error: (err as Error).message })
  }
}

export async function getSummary(profileId: string): Promise<RewardsSummary> {
  await awardBirthdayBonusIfDue(profileId)

  const [{ data }, conversionRate] = await Promise.all([
    rewardsCreditRepo.findBalance(profileId),
    getConversionRate(),
  ])
  const points = (data?.points_balance as number | undefined) ?? 0
  const creditAvailable = conversionRate > 0 ? Math.round((points / conversionRate) * 100) / 100 : 0

  return { points, creditAvailable, conversionRate }
}

export async function getHistory(profileId: string, limit = 25) {
  const { data, error } = await rewardsCreditRepo.findLedgerHistory(profileId, limit)
  if (error) throw AppError.internal('Failed to fetch rewards history', error)
  return data ?? []
}

// Called when a residential customer's delivery is marked delivered.
// `amountSpent` is what they were charged for it — 1 point earned per $1.
// Never throws — a rewards failure must not block the delivery status update.
export async function earnPointsForDelivery(
  profileId:   string,
  deliveryId:  string,
  amountSpent: number,
): Promise<void> {
  if (!(amountSpent > 0)) return
  try {
    const earnRate = await getRuleValue(EARN_RATE_SLUG, 1)
    const pointsEarned = Math.round(amountSpent * earnRate)
    if (pointsEarned <= 0) return

    // Ledger insert first, guarded by the unique index on (shipment_id)
    // where type='earn' (migration 054) — a concurrent retry for the same
    // delivery fails here, before the balance is ever touched, instead of
    // double-awarding points.
    const { error: ledgerErr } = await rewardsCreditRepo.insertLedgerEntry({
      profile_id:  profileId,
      shipment_id: deliveryId,
      points:      pointsEarned,
      amount:      amountSpent,
      type:        'earn',
      note:        'Delivery completed',
    })
    if (ledgerErr) {
      if (rewardsCreditRepo.isDuplicateLedgerEntry(ledgerErr)) return // already awarded for this delivery
      throw ledgerErr
    }

    const { data: balanceRow } = await rewardsCreditRepo.findBalance(profileId)
    const currentPoints = (balanceRow?.points_balance as number | undefined) ?? 0
    const { error: balErr } = await rewardsCreditRepo.upsertBalance(profileId, currentPoints + pointsEarned)
    if (balErr) throw balErr
  } catch (err) {
    logger.error('Failed to award rewards points for delivered delivery', { profileId, deliveryId, error: (err as Error).message })
  }
}

export interface RedeemResult {
  appliedDollars: number
  appliedPoints:  number
  newBalance:     number
}

// Redeems as many points as it takes to cover the quotation total (capped
// by the customer's balance) — min(pointsValueInDollars, quotationTotal).
export async function redeemPointsForQuotation(
  profileId:      string,
  quotationId:    string,
  quotationTotal: number,
): Promise<RedeemResult> {
  const [conversionRate, { data: balanceRow }] = await Promise.all([
    getConversionRate(),
    rewardsCreditRepo.findBalance(profileId),
  ])
  const currentPoints = (balanceRow?.points_balance as number | undefined) ?? 0
  const availableDollars = conversionRate > 0 ? currentPoints / conversionRate : 0

  const appliedDollars = Math.round(Math.min(availableDollars, quotationTotal) * 100) / 100
  if (appliedDollars <= 0) return { appliedDollars: 0, appliedPoints: 0, newBalance: currentPoints }

  const appliedPoints = Math.min(currentPoints, Math.round(appliedDollars * conversionRate))
  const newBalance = currentPoints - appliedPoints

  // Ledger insert first, guarded by the unique index on (quotation_id)
  // where type='redeem' (migration 054) — a concurrent retry/double-click
  // for the same quotation fails here, before the balance is ever touched,
  // instead of double-redeeming points.
  const { error: ledgerErr } = await rewardsCreditRepo.insertLedgerEntry({
    profile_id:   profileId,
    quotation_id: quotationId,
    points:       -appliedPoints,
    amount:       -appliedDollars,
    type:         'redeem',
    note:         'Applied to quotation',
  })
  if (ledgerErr) {
    if (rewardsCreditRepo.isDuplicateLedgerEntry(ledgerErr)) {
      throw AppError.conflict('Rewards points have already been applied to this quotation')
    }
    throw AppError.internal('Failed to record rewards points redemption', ledgerErr)
  }

  const { error: balErr } = await rewardsCreditRepo.upsertBalance(profileId, newBalance)
  if (balErr) throw AppError.internal('Failed to update rewards points balance', balErr)

  return { appliedDollars, appliedPoints, newBalance }
}
