export function isAllowedEmail(email: string, allowed: string): boolean {
  const a = allowed.trim().toLowerCase();
  return a.length > 0 && email.trim().toLowerCase() === a;
}
