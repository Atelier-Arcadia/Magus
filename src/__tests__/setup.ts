// Preload: runs before any test module is evaluated.
// Ensures ansi.ts computes colorEnabled=true in all test files.
process.env.FORCE_COLOR = "1";