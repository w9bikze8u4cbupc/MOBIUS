import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import OperatorTelemetryPanel from "../OperatorTelemetryPanel";

jest.mock("react-markdown", () => ({ children }) => <div>{children}</div>);

describe("OperatorTelemetryPanel", () => {
  const createLogger = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() });

  const mockFetchSuccess = (markdown = "# Hello\nTelemetry ready") => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        markdown,
        status: "ok",
        metrics: { lufs: -14 },
      }),
    });
  };

  const mockFetchFailure = () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete global.fetch;
  });

  it("renders telemetry markdown on success", async () => {
    mockFetchSuccess("## Metrics\n- LUFS: -14");
    render(
      <OperatorTelemetryPanel
        orchestratorUrl="/telemetry"
        pollIntervalMs={60_000}
        logger={createLogger()}
      />
    );

    await waitFor(() => expect(screen.getByText(/Metrics/i)).toBeInTheDocument());
    expect(screen.getByText(/LUFS: -14/i)).toBeInTheDocument();
  });

  it("logs and displays errors", async () => {
    const errorLogger = createLogger();
    mockFetchFailure();

    render(
      <OperatorTelemetryPanel
        orchestratorUrl="/telemetry"
        pollIntervalMs={60_000}
        logger={errorLogger}
      />
    );

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(errorLogger.error).toHaveBeenCalledWith(
      "[telemetry] fetch error",
      expect.objectContaining({ message: "Telemetry fetch failed: 503" })
    );
  });

  it("supports manual refresh", async () => {
    mockFetchSuccess("Initial");
    render(
      <OperatorTelemetryPanel
        orchestratorUrl="/telemetry"
        pollIntervalMs={60_000}
        logger={createLogger()}
      />
    );
    await waitFor(() => expect(screen.getByText(/Initial/i)).toBeInTheDocument());

    mockFetchSuccess("Updated");
    fireEvent.click(screen.getByRole("button", { name: /Refresh/i }));
    await waitFor(() => expect(screen.getByText(/Updated/i)).toBeInTheDocument());
  });
});
