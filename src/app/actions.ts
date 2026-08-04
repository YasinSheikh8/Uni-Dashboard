"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn as authSignIn, signOut as authSignOut } from "@/auth";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { sendPhoneCode } from "@/lib/phone-otp";
import { sendEmailCode } from "@/lib/email-otp";
import {
  normalizeMembershipNumber,
  validateMembershipNumber,
} from "@/lib/loyalty";
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

  // Hand straight to Auth.js so the new account is signed in by the same
  // mechanism as every other route in, then straight into setup.
  await authSignIn("password", {
    email,
    password,
    redirectTo: String(formData.get("next") || "/setup"),
  });

  // signIn redirects by throwing, so this is unreachable.
  return {};
}

export async function signIn(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");

  try {
    await authSignIn("password", {
      email,
      password,
      redirectTo: String(formData.get("next") || "/"),
    });
    return {};
  } catch (error) {
    // A successful sign-in redirects by throwing, so only genuine auth
    // failures land here. Everything else must be rethrown or the redirect
    // is swallowed.
    if (error instanceof AuthError) {
      // Same message either way — never confirm which emails exist.
      return { error: "Email or password is incorrect" };
    }
    throw error;
  }
}

/**
 * Sends an SMS sign-in code.
 *
 * `devCode` comes back only when no SMS provider is configured, so the flow
 * stays walkable locally without a Twilio account or a real handset.
 */
export async function requestPhoneCode(
  _previous: ActionState & { devCode?: string; phone?: string },
  formData: FormData,
): Promise<ActionState & { devCode?: string; phone?: string }> {
  const phone = String(formData.get("phone") ?? "");
  const result = await sendPhoneCode(phone);

  if (!result.ok) return { error: result.error };
  return {
    success: "Code sent",
    devCode: result.devCode,
    phone,
  };
}

/**
 * Sends an email sign-in code.
 *
 * `devCode` comes back only when no email provider is configured, so the flow
 * stays walkable locally without a Resend account.
 */
export async function requestEmailCode(
  _previous: ActionState & { devCode?: string; email?: string },
  formData: FormData,
): Promise<ActionState & { devCode?: string; email?: string }> {
  const email = String(formData.get("email") ?? "");
  const result = await sendEmailCode(email);

  if (!result.ok) return { error: result.error };
  return { success: "Code sent", devCode: result.devCode, email };
}

export async function verifyEmailCodeAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "");
  const code = String(formData.get("code") ?? "");

  try {
    await authSignIn("email-code", {
      email,
      code,
      redirectTo: String(formData.get("next") || "/setup"),
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "That code is not right, or it has expired." };
    }
    throw error;
  }
}

export async function verifyPhoneCodeAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const phone = String(formData.get("phone") ?? "");
  const code = String(formData.get("code") ?? "");

  try {
    await authSignIn("phone", {
      phone,
      code,
      // New phone accounts have nothing on file yet, so setup is the useful
      // landing place; an existing user simply walks through an empty wizard.
      redirectTo: String(formData.get("next") || "/setup"),
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "That code is not right, or it has expired." };
    }
    throw error;
  }
}

export async function signOut(): Promise<void> {
  await authSignOut({ redirectTo: "/" });
}

/**
 * OAuth entry points.
 *
 * Thin wrappers so the sign-in panel can stay a client component while the
 * redirect is initiated on the server, which is what keeps the OAuth state and
 * PKCE cookies httpOnly.
 */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  await authSignIn("google", {
    redirectTo: String(formData.get("next") || "/account"),
  });
}

export async function signInWithApple(formData: FormData): Promise<void> {
  await authSignIn("apple", {
    redirectTo: String(formData.get("next") || "/account"),
  });
}

const profileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().min(5, "Phone number is required"),
  contactEmail: z
    .string()
    .email("Enter a valid email")
    .optional()
    .or(z.literal("").transform(() => undefined)),
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
 * Attaches the stub gateway's test card, for environments with no Stripe key.
 *
 * Real cards are collected in place by `AddCardForm` against a SetupIntent —
 * there is deliberately no redirect to a hosted checkout page anywhere in this
 * app. The user never leaves BKR to pay.
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
    return { error: "Use the card form above to add a real card" };
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

/* ------------------------------------------------------------------------- *
 * Setup wizard
 *
 * One action per step. Each saves immediately, so leaving halfway loses
 * nothing and coming back resumes where it stopped.
 * ------------------------------------------------------------------------- */

async function upsertProfile(userId: string, data: Record<string, string>) {
  const existing = await prisma.travelerProfile.findUnique({ where: { userId } });
  if (existing) {
    await prisma.travelerProfile.update({ where: { userId }, data });
  } else {
    await prisma.travelerProfile.create({
      data: {
        userId,
        firstName: "",
        lastName: "",
        phone: "",
        ...data,
      },
    });
  }
}

export async function saveStepName(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first" };

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  if (!firstName || !lastName) return { error: "Both names, please" };

  await upsertProfile(user.id, { firstName, lastName });
  // Keep the display name in step with the traveler name.
  await prisma.user.update({
    where: { id: user.id },
    data: { name: `${firstName} ${lastName}`.trim() },
  });

  revalidatePath("/setup");
  return { success: "saved" };
}

export async function saveStepPhone(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first" };

  const phone = String(formData.get("phone") ?? "").trim();
  if (phone.replace(/\D/g, "").length < 6) return { error: "Enter a valid phone number" };

  await upsertProfile(user.id, { phone });
  revalidatePath("/setup");
  return { success: "saved" };
}

export async function saveStepEmail(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first" };

  const contactEmail = String(formData.get("contactEmail") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
    return { error: "Enter a valid email" };
  }

  await upsertProfile(user.id, { contactEmail });
  revalidatePath("/setup");
  return { success: "saved" };
}

export async function addLoyaltyMembership(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first" };

  const programCode = String(formData.get("programCode") ?? "");
  const raw = String(formData.get("membershipNumber") ?? "");

  const check = validateMembershipNumber(programCode, raw);
  if (!check.ok) return { error: check.error };

  const membershipNumber = normalizeMembershipNumber(raw);
  const tier = String(formData.get("tier") ?? "").trim() || null;

  await prisma.loyaltyMembership.upsert({
    where: { userId_programCode: { userId: user.id, programCode } },
    create: { userId: user.id, programCode, membershipNumber, tier },
    update: { membershipNumber, tier },
  });

  revalidatePath("/setup");
  revalidatePath("/account");
  return { success: "Added" };
}

export async function removeLoyaltyMembership(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  await prisma.loyaltyMembership.deleteMany({
    where: { userId: user.id, programCode: String(formData.get("programCode") ?? "") },
  });

  revalidatePath("/setup");
  revalidatePath("/account");
}

/** Marks setup finished, so the wizard stops intercepting. */
export async function completeOnboarding(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  await prisma.user.update({
    where: { id: user.id },
    data: { onboardedAt: new Date(), onboardingStep: "done" },
  });

  redirect("/");
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
