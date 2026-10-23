import { ensureGuestSession, getSupabase } from "./supabase";

/**
 * Optional email backup. Guests start as anonymous Supabase users; linking an email turns that same
 * user into a permanent one (same user id, so the inbox stays theirs). On a new device they sign in
 * with the email and land on the same user.
 */
export interface AccountInfo {
  /** confirmed email on this account, if backed up */
  email: string | null;
  /** an email was entered but the confirmation link hasn't been tapped yet */
  pendingEmail: string | null;
}

export async function getAccount(): Promise<AccountInfo> {
  await ensureGuestSession();
  const { data } = await getSupabase().auth.getUser();
  const u = data.user;
  return {
    email: u && !u.is_anonymous && u.email ? u.email : null,
    pendingEmail: u?.new_email ?? null,
  };
}

function friendly(message: string): Error {
  const m = message.toLowerCase();
  if (m.includes("already") && (m.includes("registered") || m.includes("exists"))) {
    return new Error("That email is already backed up. Use “Sign in with email” instead.");
  }
  if (m.includes("rate limit") || m.includes("too many") || m.includes("seconds")) {
    return new Error("Too many emails sent. Wait a few minutes and try again.");
  }
  if (m.includes("signups not allowed") || m.includes("not found") || m.includes("user not found")) {
    return new Error("No inbox is backed up with that email yet.");
  }
  if (m.includes("invalid") && m.includes("email")) return new Error("That email doesn't look right.");
  return new Error("Couldn't send the email. Try again in a moment.");
}

const redirect = () => `${window.location.origin}/inbox`;

/** Back up this inbox: sends a confirmation link to the email. */
export async function linkEmail(email: string): Promise<void> {
  await ensureGuestSession();
  const { error } = await getSupabase().auth.updateUser({ email: email.trim() }, { emailRedirectTo: redirect() });
  if (error) throw friendly(error.message);
}

/** Get back into a backed-up inbox on a new device: sends a sign-in link. */
export async function signInWithEmail(email: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: false, emailRedirectTo: redirect() },
  });
  if (error) throw friendly(error.message);
}
