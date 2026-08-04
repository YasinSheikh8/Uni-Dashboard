import NextAuth, { type NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import { SignJWT, importPKCS8 } from "jose";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db";
import { verifyPhoneCode } from "@/lib/phone-otp";

/**
 * Authentication.
 *
 * Four ways in, one account model:
 *   - Google       (OAuth)
 *   - Apple        (OAuth)
 *   - Phone        (SMS one-time code)
 *   - Email + password
 *
 * Sessions use the JWT strategy because the phone and password flows are
 * credentials-based, which the database-session strategy does not support. The
 * Prisma adapter is still wired up so OAuth identities are persisted in
 * `Account` and a returning Google user lands on the same row every time.
 */

const AVATAR_COLORS = [
  "#1f6feb", "#0f7b52", "#b4530a", "#7c3aed", "#be185d", "#0e7490",
];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * Apple does not issue a static client secret. It expects a short-lived ES256
 * JWT signed with a .p8 key, valid for at most six months.
 *
 * Generating it here, per process, rather than pasting a pre-made token into an
 * env var means it can never quietly expire and take Apple sign-in down months
 * later — which is the usual way this breaks.
 */
async function appleClientSecret(): Promise<string> {
  const teamId = process.env.APPLE_TEAM_ID!;
  const keyId = process.env.APPLE_KEY_ID!;
  const clientId = process.env.APPLE_CLIENT_ID!;
  // Env vars cannot hold real newlines, so the key is usually stored with \n
  // escapes. Accept either form.
  const privateKey = process.env.APPLE_PRIVATE_KEY!.replace(/\\n/g, "\n");

  const key = await importPKCS8(privateKey, "ES256");

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    // Well inside Apple's six-month ceiling.
    .setExpirationTime("60d")
    .setAudience("https://appleid.apple.com")
    .setSubject(clientId)
    .sign(key);
}

const googleConfigured = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

const appleConfigured = Boolean(
  process.env.APPLE_TEAM_ID &&
    process.env.APPLE_KEY_ID &&
    process.env.APPLE_CLIENT_ID &&
    process.env.APPLE_PRIVATE_KEY,
);

const providers: NextAuthConfig["providers"] = [];

if (googleConfigured) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      // Google verifies email ownership, so linking a Google identity to an
      // existing account with the same address is safe and is what users
      // expect. Without this, signing up by email then returning via Google
      // dead-ends on OAuthAccountNotLinked.
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

if (appleConfigured) {
  providers.push(
    Apple({
      clientId: process.env.APPLE_CLIENT_ID!,
      clientSecret: await appleClientSecret(),
      // Apple also verifies email ownership. Note that "Hide My Email" users
      // arrive with a relay address, which is stable per app.
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

/** Phone + SMS code. */
providers.push(
  Credentials({
    id: "phone",
    name: "Phone",
    credentials: {
      phone: { label: "Phone", type: "tel" },
      code: { label: "Code", type: "text" },
    },
    async authorize(raw) {
      const phone = typeof raw?.phone === "string" ? raw.phone : "";
      const code = typeof raw?.code === "string" ? raw.code : "";

      const result = await verifyPhoneCode(phone, code);
      if (!result.ok || !result.phone) return null;

      const existing = await prisma.user.findUnique({
        where: { phone: result.phone },
      });
      if (existing) {
        if (!existing.phoneVerified) {
          await prisma.user.update({
            where: { id: existing.id },
            data: { phoneVerified: new Date() },
          });
        }
        return { id: existing.id, name: existing.name, email: existing.email };
      }

      const created = await prisma.user.create({
        data: {
          phone: result.phone,
          phoneVerified: new Date(),
          name: "Guest",
          avatarColor: colorFor(result.phone),
        },
      });

      // Claim any split shares invited against this number's account later —
      // email invites are claimed on sign-up in the email flow.
      return { id: created.id, name: created.name, email: created.email };
    },
  }),
);

/** Email + password, kept so existing accounts keep working. */
providers.push(
  Credentials({
    id: "password",
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(raw) {
      const email = typeof raw?.email === "string" ? raw.email.toLowerCase().trim() : "";
      const password = typeof raw?.password === "string" ? raw.password : "";
      if (!email || !password) return null;

      const user = await prisma.user.findUnique({ where: { email } });
      // An OAuth-only or phone-only account has no password to check against.
      if (!user?.passwordHash) return null;
      if (!(await bcrypt.compare(password, user.passwordHash))) return null;

      return { id: user.id, name: user.name, email: user.email };
    },
  }),
);

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  // Reuses SESSION_SECRET so switching to Auth.js does not add another
  // required variable to the deployment checklist.
  secret: process.env.AUTH_SECRET ?? process.env.SESSION_SECRET,
  // Required behind Vercel's proxy, where the host header is what tells Auth.js
  // its own origin.
  trustHost: true,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/signin", error: "/signin" },
  providers,
  callbacks: {
    async jwt({ token, user }) {
      // `user` is only present on the request that establishes the session.
      if (user?.id) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.uid && session.user) {
        (session.user as { id?: string }).id = token.uid as string;
      }
      return session;
    },
  },
  events: {
    /**
     * OAuth users are created by the adapter, which knows nothing about our own
     * columns. Fill in the avatar colour, and a name if the provider withheld
     * one (Apple often does on subsequent sign-ins).
     */
    async createUser({ user }) {
      if (!user.id) return;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          avatarColor: colorFor(user.id),
          name: user.name?.trim() || "Guest",
        },
      });

      // Someone may have been invited to split a booking before they had an
      // account. Claim those shares so the trip appears immediately.
      if (user.email) {
        await prisma.bookingParticipant.updateMany({
          where: { email: user.email.toLowerCase(), userId: null },
          data: { userId: user.id },
        });
      }
    },
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);

/** Surfaced in the UI so buttons for unconfigured providers are not shown. */
export const enabledProviders = {
  google: googleConfigured,
  apple: appleConfigured,
  phone: true,
  password: true,
};
