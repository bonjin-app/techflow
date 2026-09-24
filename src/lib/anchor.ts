/**
 * The fragment a heading is reachable at. Derived from its text, so the link a
 * reader copies today still lands on the same heading after the page is
 * rebuilt — and only changes if the heading itself does.
 */
export function anchorFor(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
