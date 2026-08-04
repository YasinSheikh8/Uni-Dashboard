import { NextResponse } from "next/server";
import { z } from "zod";
import { UnauthorizedError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { participantIdentity } from "@/lib/participants";
import {
  authorizeParticipantShare,
  declineParticipantShare,
  isReadyToSettle,
  settleBooking,
} from "@/lib/split";

const bodySchema = z.object({ action: z.enum(["accept", "decline"]) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // A participant is identified by userId OR by the email they were invited
    // on — someone invited before they signed up still owns that share.
    const participant = await prisma.bookingParticipant.findFirst({
      where: {
        bookingId: id,
        role: "friend",
        ...participantIdentity(user),
      },
    });

    if (!participant) {
      return NextResponse.json(
        { error: "You are not on this booking" },
        { status: 403 },
      );
    }

    // Claim the share for this account if it was invited by email.
    if (!participant.userId) {
      await prisma.bookingParticipant.update({
        where: { id: participant.id },
        data: { userId: user.id },
      });
    }

    if (parsed.data.action === "decline") {
      await declineParticipantShare(participant.id);
    } else {
      const result = await authorizeParticipantShare(participant.id);
      if (result.status === "failed") {
        return NextResponse.json(
          { error: result.error ?? "Could not authorize your card" },
          { status: 402 },
        );
      }
    }

    // Everyone has answered — settle now rather than waiting for the deadline.
    if (await isReadyToSettle(id)) {
      await settleBooking(id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Sign in first" }, { status: 401 });
    }
    console.error("Respond failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Something went wrong" },
      { status: 500 },
    );
  }
}
