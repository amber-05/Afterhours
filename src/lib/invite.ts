export function inviteLink(code: string) {
  return `${window.location.origin}/room/${code}`;
}
