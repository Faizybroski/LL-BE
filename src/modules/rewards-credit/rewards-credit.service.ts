import { AppError } from '../../lib/errors'
import { logger } from '../../lib/logger'
import * as rewardsCreditRepo from './rewards-credit.repository'

const EARN_RULE_SLUG            = 'earn_credit'
const MAX_BALANCE_RULE_SLUG     = 'max_balance'
const MAX_REDEMPTION_RULE_SLUG  = 'max_redemption'

async function getRuleValue(slug: string, fallback: number): Promise<number> {
  const { data, error } = await rewardsCreditRepo.findRewardsRuleValue(slug)
  if (error || !data || data.value == null) return fallback
  return Number(data.value)
}

export async function getBalance(profileId: string): Promise<number> {
  const { data } = await rewardsCreditRepo.findBalance(profileId)
  return data?.balance ?? 0
}

// Called when a residential customer's shipment is marked delivered. Never
// throws — a rewards-credit failure must not block the delivery status update.
export async function earnCreditForDelivery(profileId: string, shipmentId: string): Promise<void> {
  try {
    const [earnAmount, maxBalance, currentBalance] = await Promise.all([
      getRuleValue(EARN_RULE_SLUG, 1),
      getRuleValue(MAX_BALANCE_RULE_SLUG, 100),
      getBalance(profileId),
    ])

    const newBalance = Math.min(currentBalance + earnAmount, maxBalance)
    const actuallyEarned = newBalance - currentBalance
    if (actuallyEarned <= 0) return // already at cap

    // Ledger insert first, guarded by a unique index on (shipment_id) where
    // type='earn' (migration 054) — a concurrent retry for the same
    // shipment fails here, before the balance is ever touched, instead of
    // double-awarding credit.
    const { error: ledgerErr } = await rewardsCreditRepo.insertLedgerEntry({
      profile_id:  profileId,
      shipment_id: shipmentId,
      amount:      actuallyEarned,
      type:        'earn',
      note:        'Delivery completed',
    })
    if (ledgerErr) {
      if (rewardsCreditRepo.isDuplicateLedgerEntry(ledgerErr)) return // already awarded for this shipment
      throw ledgerErr
    }

    const { error: balErr } = await rewardsCreditRepo.upsertBalance(profileId, newBalance)
    if (balErr) throw balErr
  } catch (err) {
    logger.error('Failed to award rewards credit for delivered shipment', { profileId, shipmentId, error: (err as Error).message })
  }
}

export interface RedeemResult {
  applied:    number
  newBalance: number
}

// Computes and applies min(balance, max_redemption% × quotationTotal), recorded
// as a ledger debit. Returns the amount actually applied.
export async function redeemCreditForQuotation(
  profileId:      string,
  quotationId:    string,
  quotationTotal: number,
): Promise<RedeemResult> {
  const [maxRedemptionPct, currentBalance] = await Promise.all([
    getRuleValue(MAX_REDEMPTION_RULE_SLUG, 50),
    getBalance(profileId),
  ])

  const cap = (maxRedemptionPct / 100) * quotationTotal
  const applied = Math.round(Math.min(currentBalance, cap) * 100) / 100

  if (applied <= 0) return { applied: 0, newBalance: currentBalance }

  const newBalance = currentBalance - applied

  // Ledger insert first, guarded by a unique index on (quotation_id) where
  // type='redeem' (migration 054) — a concurrent retry/double-click for the
  // same quotation fails here, before the balance is ever touched, instead
  // of double-redeeming credit.
  const { error: ledgerErr } = await rewardsCreditRepo.insertLedgerEntry({
    profile_id:   profileId,
    quotation_id: quotationId,
    amount:       -applied,
    type:         'redeem',
    note:         'Applied to quotation',
  })
  if (ledgerErr) {
    if (rewardsCreditRepo.isDuplicateLedgerEntry(ledgerErr)) {
      throw AppError.conflict('Rewards Credit has already been applied to this quotation')
    }
    throw AppError.internal('Failed to record rewards credit redemption', ledgerErr)
  }

  const { error: balErr } = await rewardsCreditRepo.upsertBalance(profileId, newBalance)
  if (balErr) throw AppError.internal('Failed to update rewards credit balance', balErr)

  return { applied, newBalance }
}
