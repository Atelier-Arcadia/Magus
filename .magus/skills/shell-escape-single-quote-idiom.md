---
name: shell-escape-single-quote-idiom
description: Technique for safely escaping arbitrary strings for POSIX shell command arguments. Use when constructing shell commands from untrusted or dynamic input.
---

# Shell Escape Single-Quote Idiom

Current version: 0.0.1

A simple, reliable method for escaping arbitrary strings as POSIX shell arguments without relying on external libraries.

## Inputs

- An arbitrary string that must appear as a single argument in a shell command.

## Outputs

- A shell-safe string that can be interpolated directly into a command.

## Failure Modes

- **Null bytes**: POSIX shells cannot represent `\0` in arguments. If the input contains null bytes, the argument will be silently truncated.
- **Over-escaping simple values**: Wrapping already-safe strings (e.g. `foo-bar`) in quotes is harmless but noisy. Use a fast-path regex to pass safe strings through verbatim.

## Scope

Applies to any Node.js (or similar runtime) code that builds shell commands via string interpolation and `child_process.exec`. Does NOT apply when using `execFile` or `spawn` with an argv array, which bypass the shell entirely.

## Body

### The Technique

POSIX single quotes preserve all characters literally except the single quote itself. To include a literal single quote, end the quoted segment, insert an escaped single quote, and restart quoting:

```
input:   it's "complex"
escaped: 'it'\''s "complex"'
```

In TypeScript:

```typescript
function shellEscape(arg: string): string {
  // Fast path: safe characters need no quoting
  if (/^[a-zA-Z0-9_\-./=:@]+$/.test(arg)) return arg;
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}
```

### Why Not Double Quotes?

Double quotes allow variable expansion (`$VAR`), command substitution (`` `cmd` `` and `$(cmd)`), and backslash escaping. Single quotes avoid all of these pitfalls — the only special character is `'` itself.

### When to Use `execFile` Instead

If you control the argument list and don't need shell features (pipes, redirects, globbing), prefer `child_process.execFile` or `spawn` which accept an `argv` array and bypass the shell entirely. Shell escaping is only necessary when using `exec` or when shell features are required.

## Changes

* 0.0.1 - Initial version based on makefile tool implementation
