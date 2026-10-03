/** Only allow same-origin relative paths as post-login destinations. */
export function safeNext(next: string | string[] | undefined | null): string {
  const value = Array.isArray(next) ? next[0] : next
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return "/library"
  }
  return value
}
