import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureUserReferralCode } from "@/lib/referral-service";
import { safeSecretEquals } from "@/lib/webhook-auth";

/**
 * GrayQuest Webhook Handler
 * Activated when a payment is completed on GrayQuest.
 */
export async function POST(req: Request) {
    try {
        const webhookSecret = process.env.GRAYQUEST_WEBHOOK_SECRET;
        if (!webhookSecret) {
            console.error("[GQ WEBHOOK] GRAYQUEST_WEBHOOK_SECRET is not configured");
            return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
        }

        const providedSecret =
            req.headers.get("x-grayquest-signature") ||
            req.headers.get("x-webhook-secret") ||
            req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

        if (!safeSecretEquals(providedSecret, webhookSecret)) {
            console.error("[GQ WEBHOOK] Unauthorized signature/secret mismatch");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        console.log("[GQ WEBHOOK] Received payload for order:", body.order_id || body.data?.order_id || body.client_reference_id);

        // Note: GrayQuest payload structure may vary based on version.
        // We look for order_id and status in common locations.
        const orderId = body.order_id || body.data?.order_id || body.client_reference_id;
        const status = body.status || body.data?.status || body.payment_status;

        if (!orderId) {
            console.error("[GQ WEBHOOK] No order_id found in payload");
            return NextResponse.json({ error: "No order_id found" }, { status: 400 });
        }

        const existingPayment = await prisma.payment.findUnique({
            where: { orderId },
            select: { orderId: true, userId: true, orderStatus: true, paymentStatus: true, orderAmount: true }
        });

        if (!existingPayment) {
            console.warn(`[GQ WEBHOOK] Unknown order_id rejected: ${orderId}`);
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        if (Number(existingPayment.orderAmount || 0) < 25) {
            console.warn(`[GQ WEBHOOK] Invalid orderAmount rejected: ${orderId}`);
            return NextResponse.json({ error: "Invalid order amount" }, { status: 400 });
        }

        // Logic for success
        // GrayQuest success statuses: "success", "paid", "captured" (lowercase or uppercase)
        const isSuccess = status && ["success", "paid", "captured", "PAID", "SUCCESS"].includes(status.toString());

        if (isSuccess) {
            if (existingPayment.orderStatus === "PAID" || existingPayment.paymentStatus === "Success") {
                if (existingPayment.userId) {
                    await ensureUserReferralCode(existingPayment.userId);
                }
                return NextResponse.json({ success: true, alreadyProcessed: true });
            }

            console.log(`[GQ WEBHOOK] Processing SUCCESS for order: ${orderId}`);

            // 1. Update Payment Record
            const updatedPayment = await prisma.payment.update({
                where: { orderId: orderId },
                data: {
                    orderStatus: "PAID",
                    paymentStatus: "Success",
                    paidAt: new Date(),
                    gatewayResponse: body,
                    // If transactionId is available in payload
                    transactionId: body.transaction_id || body.payment_id || body.data?.transaction_id || undefined
                }
            });

            // 2. Activate User
            if (updatedPayment.userId) {
                await prisma.user.update({
                    where: { userId: updatedPayment.userId },
                    data: {
                        status: 'Active',
                        paymentStatus: 'Success',
                        // Sync transaction ID to user record for quick reference
                        transactionId: body.transaction_id || body.payment_id || body.data?.transaction_id || undefined
                    }
                });
                await ensureUserReferralCode(updatedPayment.userId);
                console.log(`[GQ WEBHOOK] User ${updatedPayment.userId} activated successfully.`);
            }
        } else {
            console.warn(`[GQ WEBHOOK] Received non-success status: ${status} for order: ${orderId}`);
            // Update payment record with failure if needed
            await prisma.payment.update({
                where: { orderId: orderId },
                data: {
                    paymentStatus: "Failed",
                    gatewayResponse: body
                }
            }).catch(() => { }); // Recursive safety
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error("[GQ WEBHOOK] Fatal processing error:", error);
        // We return 500 so GrayQuest might retry if it was a transient DB error
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
