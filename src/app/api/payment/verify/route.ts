import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import cashfree from "@/lib/cashfree";
import { syncUserStats } from "@/lib/sync-service";
import { encryptReferralCode } from "@/lib/crypto";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("order_id");

    if (!orderId) {
        return NextResponse.json({ error: "Missing order_id" }, { status: 400 });
    }

    try {
        const existingPayment = await prisma.payment.findUnique({
            where: { orderId },
            include: { user: true }
        });

        if (!existingPayment) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        // Idempotency guard: prevent duplicate WhatsApp welcome messages / redundant updates
        if (existingPayment.orderStatus === "PAID" || existingPayment.paymentStatus === "Success") {
            return NextResponse.redirect(new URL('/dashboard', req.url));
        }

        const response = await cashfree.PGOrderFetchPayments(orderId);
        const payments = response.data;

        // Require both SUCCESS status AND valid minimum registration amount (>= ₹25)
        const successPayment = payments?.find(
            (p: any) => p.payment_status === "SUCCESS" && Number(p.payment_amount || 0) >= 25
        );
        const paymentStatusFormatted = successPayment ? "Success" : "Failed";

        const updatedPayment = await prisma.$transaction(async (tx) => {
            const pmt = await tx.payment.update({
                where: { orderId },
                include: { user: true },
                data: {
                    paymentStatus: paymentStatusFormatted,
                    orderStatus: successPayment ? "PAID" : "ACTIVE",
                    ...(successPayment && {
                        transactionId: successPayment.cf_payment_id ? String(successPayment.cf_payment_id) : undefined,
                        paymentMethod: successPayment.payment_group,
                        bankReference: successPayment.bank_reference,
                        paidAt: successPayment.payment_completion_time ? new Date(successPayment.payment_completion_time) : new Date(),
                        gatewayResponse: successPayment as any
                    })
                }
            });

            if (successPayment && pmt.userId) {
                const user = (pmt as any).user;
                let referralCode = user?.referralCode;

                if (!referralCode && user) {
                    const { generateSmartReferralCode } = await import('@/lib/referral-service');
                    referralCode = await generateSmartReferralCode(user.role);
                }

                await tx.user.update({
                    where: { userId: pmt.userId },
                    data: {
                        status: 'Active',
                        paymentStatus: 'Success',
                        referralCode,
                        transactionId: successPayment.cf_payment_id ? String(successPayment.cf_payment_id) : undefined,
                        paymentAmount: successPayment.payment_amount || undefined
                    }
                });

                return { payment: pmt, referralCode, wasFirstActivation: user?.status !== 'Active' };
            }

            return { payment: pmt, referralCode: (pmt as any).user?.referralCode, wasFirstActivation: false };
        });

        // 2. Sync & side-effects after DB commit
        if (successPayment && updatedPayment.payment.userId) {
            const user = (updatedPayment.payment as any).user;
            const referralCode = updatedPayment.referralCode;

            await syncUserStats(updatedPayment.payment.userId);

            if (user?.mobileNumber) {
                const { whatsappService } = await import('@/lib/whatsapp-service');
                const encryptedCode = encryptReferralCode(referralCode || '');
                const marketingUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://5starambassador.com'}/r/${encryptedCode}`;

                await whatsappService.sendByEvent(
                    user.mobileNumber,
                    'WELCOME_MESSAGE',
                    [referralCode || 'PENDING', marketingUrl],
                    'ALERT',
                    undefined,
                    undefined,
                    [],
                    user.role || 'User',
                    user.assignedCampus || '-'
                ).catch(err => console.error('Failed to send welcome whatsapp:', err));
            }

            if (updatedPayment.wasFirstActivation) {
                try {
                    const { automationEngine } = await import('@/lib/automation-engine');
                    await automationEngine.processImmediateEvent('ON_PAYMENT_SUCCESS', updatedPayment.payment.userId, {
                        amount: successPayment.payment_amount || undefined
                    });
                } catch (err) {
                    console.error('[AutomationEngine] Trigger failed:', err);
                }
            }
        }


        // Redirect directly to dashboard on success, or back to payment on failure
        if (paymentStatusFormatted === 'Success') {
            return NextResponse.redirect(new URL('/dashboard', req.url));
        } else {
            return NextResponse.redirect(new URL(`/complete-payment?status=${paymentStatusFormatted}`, req.url));
        }

    } catch (error: any) {
        console.error("Payment Verification Error:", error);
        const msg = error.response?.data?.message || error.message;
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
