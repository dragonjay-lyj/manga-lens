import type { SupabaseClient } from "@supabase/supabase-js"

export type RechargeFinalizeStatus =
    | "completed"
    | "already_completed"
    | "not_found"
    | "invalid"
    | "invalid_status"
    | "amount_mismatch"
    | "user_not_found"
    | "error"

export interface RechargeFinalizeResult {
    applied: boolean
    status: RechargeFinalizeStatus
    message: string
    userId: string | null
    creditedAmount: number
}

interface CompleteRechargeOrderInput {
    outTradeNo: string
    tradeNo: string
    paidAmount: number
}

function asNumber(value: unknown): number {
    if (typeof value === "number") return value
    if (typeof value === "string") return Number(value)
    return 0
}

export async function completeRechargeOrder(
    supabaseAdmin: SupabaseClient,
    input: CompleteRechargeOrderInput
): Promise<RechargeFinalizeResult> {
    const { outTradeNo, tradeNo, paidAmount } = input
    const { data, error } = await supabaseAdmin.rpc("complete_recharge_order", {
        p_out_trade_no: outTradeNo,
        p_trade_no: tradeNo || null,
        p_paid_amount: paidAmount,
    })

    if (error) {
        throw error
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row) {
        return {
            applied: false,
            status: "error",
            message: "RPC_EMPTY_RESULT",
            userId: null,
            creditedAmount: 0,
        }
    }

    return {
        applied: Boolean(row.applied),
        status: (row.status as RechargeFinalizeStatus) || "error",
        message: row.message || "UNKNOWN",
        userId: row.user_id || null,
        creditedAmount: asNumber(row.credited_amount),
    }
}
