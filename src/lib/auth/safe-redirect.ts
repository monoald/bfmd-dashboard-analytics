export function resolveSafeNextPath(value: unknown): string {
  if (
    typeof value === "string" &&
    value.startsWith("/") &&
    value[1] !== "/" &&
    value[1] !== "\\"
  ) {
    return value;
  }
  return "/";
}
