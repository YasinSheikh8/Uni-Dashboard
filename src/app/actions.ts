"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createSession,
  destroySession,
  getCurrentUser,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPaymentGateway, isStripeConfigured } from "@/lib/payments";

const AVATAR_COLORS = [
  "#1f6feb", "#0f7b52", "#b4530a", "#7c3aed", "#be185d", "#0e7490",
];

export interface ActionState {
  error?: string;
  success?: string;
}

const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).optional(),
});

export async function signUp(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = credentialsSchema.safeParse({
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    password: String(formData.get("password") ?? ""),
    name: String(formData.get("name") ?? "").trim(),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details" };
  }

  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "That email is already registered" };

  const user = await prisma.user.create({
    data: {
      email,
      name: name || email.split("@")[0],
      passwordHash: await hashPassword(password),
      avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    },
  });

  // Someone may have been invited to split a booking before they signed up.
  // Claim those shares now so they show up in Trips immediately.
  await prisma.bookingParticipant.updateMany({
    where: { email, userId: null },
    data: { userId: user.id },
  });

  await createSession(user.id);
  redirect(String(formData.get("next") || "/account"));
}

export async function signIn(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");

  const user = await prisma.user.findUnique({ where: { email } });
  // Same message either way — do not confirm which emails exist.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Email or password is incorrect" };
  }

  await createSession(user.id);
  redirect(String(formData.get("next") || "/"));
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/");
}

const profileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().min(5, "Phone number is required"),
  nationality: z.string().optional(),
  addressLine1: z.string().optional(),
  addressCity: z.string().optional(),
  addressZip: z.string().optional(),
  addressCountry: z.string().optional(),
});

export async function saveProfile(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first" };

  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details" };
  }

  const data = parsed.data;
  await prisma.travelerProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });

  revalidatePath("/account");
  return { success: "Traveler details saved" };
}

/**
 * Saves a card for off-session use.
 *
 * With Stripe configured this hands off to a hosted Checkout session in setup
 * mode — no card data ever touches this app. Without Stripe it attaches the
 * stub gateway's test card so the booking and split flows stay walkable in
 * development.
 */
export async function addCard(
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first" };

  const gateway = getPaymentGateway();
  const customerId = await gateway.ensureCustomer(
    user.id,
    user.email,
    user.name,
    user.stripeCustomerId,
  );

  if (customerId !== user.stripeCustomerId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  if (isStripeConfigured()) {
    // Real cards go through Stripe's hosted setup flow.
    const { createCheckoutSetupSession } = await import("@/lib/stripe-checkout");
    const url = await createCheckoutSetupSession(customerId);
    redirect(url);
  }

  const [card] = await gateway.listCards(customerId);
  const existing = await prisma.paymentMethod.findUnique({
    where: { stripePaymentMethodId: card.id },
  });
  if (existing) return { success: "Card already saved" };

  await prisma.paymentMethod.create({
    data: {
      userId: user.id,
      stripePaymentMethodId: card.id,
      brand: card.brand,
      last4: card.last4,
      expMonth: card.expMonth,
      expYear: card.expYear,
      isDefault: user.paymentMethods.length === 0,
    },
  });

  revalidatePath("/account");
  return { success: "Test card saved (Stripe is not configured)" };
}

export async function addFriend(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first" };

  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  if (!email.includes("@")) return { error: "Enter a valid email" };
  if (email === user.email) return { error: "That is you" };

  const friend = await prisma.user.findUnique({ where: { email } });
  if (!friend) {
    return {
      error: "Nobody with that email yet — you can still invite them to a booking",
    };
  }

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: user.id, addresseeId: friend.id },
        { requesterId: friend.id, addresseeId: user.id },
      ],
    },
  });
  if (existing) return { error: "Already connected" };

  // Auto-accepted: a friend list here only gates who is suggested in the split
  // picker, and anyone can already be invited by email. A request/approve
  // handshake would be friction with nothing behind it.
  await prisma.friendship.create({
    data: { requesterId: user.id, addresseeId: friend.id, status: "accepted" },
  });

  revalidatePath("/account");
  return { success: `${friend.name} added` };
}
