import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ signInWithPassword: vi.fn(), signOut: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
import { rememberSignInReturn, safeReturnPath, signInReturnPath, signInToLogUp, signOutOfLogUp } from "@/lib/logupAuth";

describe("one LogUp authentication session", () => {
  beforeEach(() => { vi.resetAllMocks(); sessionStorage.clear(); });
  it("signs in through the shared client rather than accepting the demo perspective", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session: { user: { id: "account" } } }, error: null });
    await signInToLogUp("fictional@example.invalid", "test-only-input");
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "fictional@example.invalid", password: "test-only-input" });
  });
  it("does not accept invalid credentials", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: new Error("Invalid login credentials") });
    await expect(signInToLogUp("fictional@example.invalid", "invalid")).rejects.toThrow("Invalid login credentials");
  });
  it("requires an actual session even when no error was returned", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: null });
    await expect(signInToLogUp("fictional@example.invalid", "invalid")).rejects.toThrow("did not complete");
  });
  it("returns to eMAR after shared sign-in and consumes the return destination", () => {
    rememberSignInReturn("/app/visits/medication");
    expect(signInReturnPath()).toBe("/app/visits/medication");
    expect(signInReturnPath()).toBe("/app");
  });
  it("cannot return to an external or unsafe destination", () => {
    for (const path of ["https://example.com", "//example.com", "/app\\example.com", "/app//example.com", "/signin", null]) expect(safeReturnPath(path)).toBe("/app");
  });
  it("ends the shared session on sign-out", async () => {
    auth.signOut.mockResolvedValue({ error: null });
    await signOutOfLogUp();
    expect(auth.signOut).toHaveBeenCalledOnce();
  });
});