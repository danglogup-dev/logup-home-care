import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), listener: undefined as undefined | ((event: string, session: unknown) => void), unsubscribe: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {
  getSession: mocks.getSession,
  onAuthStateChange: (listener: typeof mocks.listener) => { mocks.listener = listener; return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }; },
} } }));
import { LogUpSessionGate } from "@/components/LogUpSessionGate";

describe("medication shared-session boundary", () => {
  beforeEach(() => { mocks.getSession.mockReset(); mocks.listener = undefined; localStorage.clear(); });
  afterEach(cleanup);
  const renderGate = () => render(<MemoryRouter initialEntries={["/app/visits/medication"]}><LogUpSessionGate><div data-testid="protected">Protected record</div></LogUpSessionGate></MemoryRouter>);
  it("a demo Admin selection does not expose records without a session", async () => {
    localStorage.setItem("logup.role.v2", JSON.stringify({ presetId: "admin" }));
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    renderGate();
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalled());
    expect(screen.queryByTestId("protected")).toBeNull();
  });
  it("reuses the signed-in LogUp session without a second login", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "verified-account" } } } });
    renderGate();
    expect(await screen.findByTestId("protected")).toBeInTheDocument();
  });
  it("unmounts sensitive records immediately when the shared session ends", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "verified-account" } } } });
    renderGate();
    await screen.findByTestId("protected");
    act(() => mocks.listener?.("SIGNED_OUT", null));
    expect(screen.queryByTestId("protected")).toBeNull();
  });
});