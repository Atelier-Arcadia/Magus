import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { expandEnvVars, loadConfig } from "../config";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Create a temp directory containing a magus.yml with the given content. */
function withTempConfig(content: string): string {
  const dir = join(
    tmpdir(),
    `config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "magus.yml"), content, "utf-8");
  return dir;
}

// ── expandEnvVars ─────────────────────────────────────────────────────────────

describe("expandEnvVars – $VAR syntax", () => {
  test("replaces a lone $VAR with its env value", () => {
    process.env.MAGUS_TEST_SIMPLE = "hello";
    expect(expandEnvVars("$MAGUS_TEST_SIMPLE")).toBe("hello");
    delete process.env.MAGUS_TEST_SIMPLE;
  });

  test("replaces $VAR embedded in a larger string", () => {
    process.env.MAGUS_TEST_EMBED = "vault";
    expect(expandEnvVars("/home/$MAGUS_TEST_EMBED/notes")).toBe("/home/vault/notes");
    delete process.env.MAGUS_TEST_EMBED;
  });

  test("replaces unset $VAR with an empty string", () => {
    delete process.env.MAGUS_TEST_UNSET_BARE;
    expect(expandEnvVars("$MAGUS_TEST_UNSET_BARE")).toBe("");
  });
});

describe("expandEnvVars – ${VAR} syntax", () => {
  test("replaces a lone ${VAR} with its env value", () => {
    process.env.MAGUS_TEST_BRACED = "world";
    expect(expandEnvVars("${MAGUS_TEST_BRACED}")).toBe("world");
    delete process.env.MAGUS_TEST_BRACED;
  });

  test("replaces ${VAR} embedded in a path string", () => {
    process.env.MAGUS_TEST_HOME = "/Users/me";
    expect(expandEnvVars("${MAGUS_TEST_HOME}/notes")).toBe("/Users/me/notes");
    delete process.env.MAGUS_TEST_HOME;
  });

  test("replaces unset ${VAR} with an empty string", () => {
    delete process.env.MAGUS_TEST_UNSET_BRACED;
    expect(expandEnvVars("${MAGUS_TEST_UNSET_BRACED}")).toBe("");
  });
});

describe("expandEnvVars – multiple & mixed variables", () => {
  test("replaces multiple $VAR tokens in one string", () => {
    process.env.MAGUS_TEST_A = "foo";
    process.env.MAGUS_TEST_B = "bar";
    expect(expandEnvVars("$MAGUS_TEST_A/$MAGUS_TEST_B")).toBe("foo/bar");
    delete process.env.MAGUS_TEST_A;
    delete process.env.MAGUS_TEST_B;
  });

  test("replaces mixed $VAR and ${VAR} in the same string", () => {
    process.env.MAGUS_TEST_X = "x";
    process.env.MAGUS_TEST_Y = "y";
    expect(expandEnvVars("$MAGUS_TEST_X-${MAGUS_TEST_Y}")).toBe("x-y");
    delete process.env.MAGUS_TEST_X;
    delete process.env.MAGUS_TEST_Y;
  });

  test("returns string unchanged when no variable tokens are present", () => {
    expect(expandEnvVars("no vars here")).toBe("no vars here");
  });

  test("returns empty string unchanged", () => {
    expect(expandEnvVars("")).toBe("");
  });
});

// ── loadConfig – basic parsing ────────────────────────────────────────────────

describe("loadConfig – basic parsing", () => {
  test("returns a MagusConfig with memory.obsidian_vault", () => {
    const dir = withTempConfig("memory:\n  obsidian_vault: /my/vault\n");
    expect(loadConfig(dir).memory.obsidian_vault).toBe("/my/vault");
  });

  test("default cwd produces the same result as explicit process.cwd()", () => {
    // Both calls must resolve identically; the project root has a valid magus.yml.
    expect(loadConfig()).toEqual(loadConfig(process.cwd()));
  });
});

// ── loadConfig – env var expansion ───────────────────────────────────────────

describe("loadConfig – env var expansion in string values", () => {
  test("expands $VAR in obsidian_vault path", () => {
    process.env.MAGUS_TEST_VAULT = "/expanded/vault";
    const dir = withTempConfig("memory:\n  obsidian_vault: $MAGUS_TEST_VAULT\n");
    expect(loadConfig(dir).memory.obsidian_vault).toBe("/expanded/vault");
    delete process.env.MAGUS_TEST_VAULT;
  });

  test("expands ${VAR} in obsidian_vault path", () => {
    process.env.MAGUS_TEST_VAULT_BRACED = "/braced/vault";
    const dir = withTempConfig("memory:\n  obsidian_vault: ${MAGUS_TEST_VAULT_BRACED}/notes\n");
    expect(loadConfig(dir).memory.obsidian_vault).toBe("/braced/vault/notes");
    delete process.env.MAGUS_TEST_VAULT_BRACED;
  });

  test("replaces unset variable in yaml value with empty string", () => {
    delete process.env.MAGUS_TEST_UNSET_YAML;
    const dir = withTempConfig("memory:\n  obsidian_vault: $MAGUS_TEST_UNSET_YAML/notes\n");
    expect(loadConfig(dir).memory.obsidian_vault).toBe("/notes");
  });
});

// ── loadConfig – error handling ───────────────────────────────────────────────

describe("loadConfig – missing file", () => {
  test("throws when magus.yml does not exist", () => {
    const dir = join(tmpdir(), "magus-nonexistent-config-dir");
    expect(() => loadConfig(dir)).toThrow();
  });

  test("error message mentions 'magus.yml'", () => {
    const dir = join(tmpdir(), "magus-nonexistent-config-dir");
    expect(() => loadConfig(dir)).toThrow("magus.yml");
  });

  test("error message includes the searched directory path", () => {
    const dir = join(tmpdir(), "magus-nonexistent-config-dir");
    expect(() => loadConfig(dir)).toThrow(dir);
  });
});
