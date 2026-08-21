/**
 * Class-name joiner. Small enough that pulling in `clsx` would cost more in
 * install surface than it saves in code.
 */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
