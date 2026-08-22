import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App entry screen", () => {
  it("offers accessible create and join flows", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("heading", { name: /team\s*arcade/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).toBeInTheDocument();
    expect(screen.queryByLabelText("Room code")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Join room" }));
    expect(screen.getByLabelText("Room code")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join the fun" })).toBeInTheDocument();
  });

  it("prefills a valid room code from the invite URL", () => {
    window.history.replaceState(null, "", "/?room=abcde");
    render(<App />);
    expect(screen.getByLabelText("Room code")).toHaveValue("ABCDE");
  });
});
