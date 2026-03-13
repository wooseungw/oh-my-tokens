import { describe, expect, it, vi } from "vitest";
const { clientPromptMock, createPipelineHooksMock, handleOmtCommandMock, runBackfillMock } =
  vi.hoisted(() => ({
    clientPromptMock: vi.fn(() => Promise.resolve({})),
    createPipelineHooksMock: vi.fn(() => ({ event: vi.fn() })),
    handleOmtCommandMock: vi.fn(() => ({ type: "text", text: "mock omt output" })),
    runBackfillMock: vi.fn(() => Promise.resolve(0)),
  }));
vi.mock("../../src/pipeline", () => ({
  createPipelineHooks: createPipelineHooksMock,
}));
vi.mock("../../src/storage/backfill", () => ({
  runBackfill: runBackfillMock,
}));
vi.mock("../../src/ui/commands", () => ({
  handleOmtCommand: handleOmtCommandMock,
}));

import { OhMyTokensPlugin } from "../../src/index";
describe("OhMyTokensPlugin", () => {
  it("exports pipeline hooks and starts backfill", async () => {
    const input = { client: { tui: {}, session: { prompt: clientPromptMock } } };
    const hooks = await OhMyTokensPlugin(input as never);
    expect(OhMyTokensPlugin).toBeTypeOf("function");
    expect(runBackfillMock).toHaveBeenCalledTimes(1);
    expect(createPipelineHooksMock).toHaveBeenCalledWith(input);
    expect(hooks).toEqual({
      config: expect.any(Function),
      event: expect.any(Function),
      "command.execute.before": expect.any(Function),
    });
  });
  it("registers omt commands in config for autocomplete", async () => {
    const hooks = await OhMyTokensPlugin({
      client: { tui: {}, session: { prompt: clientPromptMock } },
    } as never);
    const configHook = hooks.config;
    expect(configHook).toBeTypeOf("function");
    const config = {
      command: {
        existing: { template: "/existing", description: "Existing command" },
      },
    };

    await configHook?.(config as never);
    expect(config.command).toMatchObject({
      existing: { template: "/existing", description: "Existing command" },
      omt: { template: "/omt", description: expect.any(String) },
      omt_agents: { template: "/omt agents", description: expect.any(String) },
      omt_trend: { template: "/omt trend", description: expect.any(String) },
      omt_budget: { template: "/omt budget", description: expect.any(String) },
      omt_export: { template: "/omt export", description: expect.any(String) },
      omt_export_csv: { template: "/omt export csv", description: expect.any(String) },
      omt_status: { template: "/omt status", description: expect.any(String) },
      omt_rebuild: { template: "/omt rebuild", description: expect.any(String) },
    });
  });
  it("handles /omt via command.execute.before: injects noReply output and throws sentinel", async () => {
    clientPromptMock.mockClear();
    const hooks = await OhMyTokensPlugin({
      client: { tui: {}, session: { prompt: clientPromptMock } },
    } as never);

    await expect(
      hooks["command.execute.before"]?.(
        { command: "omt", sessionID: "ses_test", arguments: "status" },
        { parts: [] } as never,
      ),
    ).rejects.toThrow("__OH_MY_TOKENS_COMMAND_HANDLED__");

    expect(handleOmtCommandMock).toHaveBeenCalledWith("status", "ses_test");
    expect(clientPromptMock).toHaveBeenCalledWith({
      path: { id: "ses_test" },
      body: { noReply: true, parts: [{ type: "text", text: "mock omt output", ignored: true }] },
    });
  });
  it("handles subcommands via command.execute.before with fixed args", async () => {
    handleOmtCommandMock.mockClear();
    clientPromptMock.mockClear();
    const hooks = await OhMyTokensPlugin({
      client: { tui: {}, session: { prompt: clientPromptMock } },
    } as never);

    await expect(
      hooks["command.execute.before"]?.(
        { command: "omt_agents", sessionID: "ses_sub", arguments: "" },
        { parts: [] } as never,
      ),
    ).rejects.toThrow("__OH_MY_TOKENS_COMMAND_HANDLED__");

    expect(handleOmtCommandMock).toHaveBeenCalledWith("agents", "ses_sub");
    expect(clientPromptMock).toHaveBeenCalledWith({
      path: { id: "ses_sub" },
      body: { noReply: true, parts: [{ type: "text", text: "mock omt output", ignored: true }] },
    });
  });
  it("ignores unknown commands in command.execute.before", async () => {
    handleOmtCommandMock.mockClear();
    clientPromptMock.mockClear();
    const hooks = await OhMyTokensPlugin({
      client: { tui: {}, session: { prompt: clientPromptMock } },
    } as never);

    await hooks["command.execute.before"]?.(
      { command: "other_plugin_cmd", sessionID: "ses_other", arguments: "" },
      { parts: [] } as never,
    );
    expect(handleOmtCommandMock).not.toHaveBeenCalled();
    expect(clientPromptMock).not.toHaveBeenCalled();
  });
});
