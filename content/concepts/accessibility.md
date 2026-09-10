---
id: accessibility
name: Accessibility
tagline: Build interfaces that work with a keyboard, a screen reader and whatever input a user has
category: quality
tags: [Frontend, Accessibility, UX, Quality]
difficulty: 2
prerequisites: [programming-fundamentals, http]
learningPath:
  - programming-fundamentals
  - http
  - react
  - accessibility
  - testing
  - web-performance
related:
  - { to: testing, rel: RELATED_TO }
  - { to: web-performance, rel: RELATED_TO }
  - { to: react, rel: RELATED_TO }
  - { to: nextjs, rel: RELATED_TO }
  - { to: routing, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

Accessibility is building an interface that still works when the user cannot see it, cannot
use a mouse, cannot distinguish two colours, or has motion turned off. Most of it comes
free from using the right element for the job; the work is in what you build yourself —
focus order, visible focus, names for controls, and announcing what changed. WCAG is a
floor to clear, not a description of a usable product.

## Why it matters

A meaningful share of users depend on this: people using screen readers, people who navigate
by keyboard because a mouse hurts, people with low vision zooming to 200%, people with
colour vision deficiency, and anyone temporarily one-handed on a train. The same work also
serves automation, browser translation and search crawlers, which read the same structure.

The economics are lopsided. A button that is a real button is free; retrofitting keyboard
support, focus management and names into a component library after launch is a project. In
many jurisdictions it is also a legal or procurement requirement — but the durable reason
is simpler: an interface only some people can operate is unfinished.

## Visual

```steps
title: One keyboard journey through a sign-up form
Tab into the page | first stop is a "Skip to content" link, so the nav can be bypassed
Focus lands on the Email field | the visible focus ring shows where the keyboard is
Screen reader announces the label | because the label element is tied to the input, not floating text
Type, then Tab to Password | hint text is linked by aria-describedby and read with the field
Tab reaches the checkbox | Space toggles it; a real input means no custom key handling
Tab reaches Submit | Enter or Space activates it, exactly like a click
Validation fails | focus moves to the first invalid field, not back to the top
The error is announced | the message is tied to the field and in a live region
Fix the field and resubmit | the error is removed from the live region as it clears
Success | focus moves to the confirmation heading so the change is announced
```

## Solutions

**Semantics first.** A native `button`, `a`, `input`, `label`, `table` and heading structure
gives you focusability, keyboard behaviour, an accessible name, a role and platform
conventions with no code. Every ARIA attribute you add is a promise to implement that
role's keyboard behaviour yourself. The first rule of ARIA really is: do not use ARIA
if a native element will do.

**Keyboard.** Everything clickable must be reachable and operable by keyboard, in an order
that matches the visual layout. Nothing may trap focus except a modal, which must trap it
deliberately, restore it to the trigger on close, and close on Escape. If you find yourself
adding `tabindex` above 0, the DOM order is wrong.

**Focus visibility.** Never remove the focus outline without replacing it with something at
least as visible. Keyboard users navigate by watching that ring; a design that hides it is
unusable, not minimal.

**Names and structure.** Every control needs an accessible name — a label, not a
placeholder. Images need alt text that says what they mean, or an empty alt if decorative.
Headings form the outline screen reader users navigate by, so they must descend in order
rather than being picked for their font size. Landmarks (`main`, `nav`, `header`) let a
user jump straight to content.

**Colour and contrast.** Text needs sufficient contrast against its background (4.5:1 for
body text at the AA level), and colour must never be the only signal — pair it with a
label, an icon or a pattern. Check the states people forget: disabled controls, placeholder
text, focus rings, and text over images.

**Motion.** Respect `prefers-reduced-motion` by replacing movement with a fade or nothing.
Large parallax causes real nausea for some users, and nothing longer than five seconds
should auto-play without a pause control.

## Deep Dive

**Client routing removes announcements you used to get free.** A full page load resets focus
and makes the screen reader read the new title. A client-side navigation changes the DOM
silently: focus stays on a link that no longer exists and nothing is announced. Every
router-driven navigation needs an explicit focus move to the new main region or heading, and
a title update. See [Routing](/concept/routing).

**Dynamic content needs a channel.** Anything that appears without user action — a toast, a
validation summary, a result count, a loading state — belongs in a live region so it is
announced. Use the polite level for status and the assertive level only for genuine errors;
a page that interrupts constantly gets ignored, like a noisy alert channel.

**Component frameworks help and hurt.** [React](/technology/react) and
[Next.js](/technology/nextjs) make it easy to build an accessible component once and reuse
it everywhere — and just as easy to ship a `div` with an `onClick` no keyboard can reach.
Prefer a well-tested headless library for menus, dialogs, comboboxes and tabs: those
keyboard patterns are intricate and already specified.

**Testing is layered, and automation catches a minority.** Linters and axe-style scans in
[Testing](/concept/testing) and [CI/CD](/concept/ci-cd) reliably catch missing alt text,
contrast failures, duplicate ids and invalid ARIA — perhaps a third of real issues. The
rest need a human: tab through the page with the mouse unplugged, use a screen reader on
the primary flow, zoom to 200% and check nothing is cut off. Testing with people who use
assistive technology daily finds what no checklist contains.

**WCAG is a floor, not a definition of quality.** Conformance levels (A, AA, AAA) give
testable criteria and a shared vocabulary, which is what a contract needs. A page can
satisfy every AA criterion and still be exhausting to use — twelve tab stops before the
content, an unlabelled icon grid, an announcement for every keystroke. Use the criteria as
a check and judge the product by whether someone can complete the task. Speed counts here
too: a page that takes eight seconds to become interactive excludes people as effectively
as a missing label — see [Web Performance](/concept/web-performance).
