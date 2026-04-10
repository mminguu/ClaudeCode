import { test, expect, afterEach, describe } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ToolInvocationMessage } from "../ToolInvocationMessage";

afterEach(() => {
  cleanup();
});

describe("ToolInvocationMessage - str_replace_editor", () => {
  test("shows 'Creating <filename>' while a create call is in progress", () => {
    render(
      <ToolInvocationMessage
        toolInvocation={{
          toolName: "str_replace_editor",
          state: "call",
          args: { command: "create", path: "/components/Card.jsx" },
        }}
      />
    );

    const pill = screen.getByTestId("tool-invocation-message");
    expect(pill.textContent).toContain("Creating");
    expect(pill.textContent).toContain("Card.jsx");
    expect(screen.getByTestId("tool-icon-loading")).toBeDefined();
    expect(screen.queryByTestId("tool-icon-success")).toBeNull();
  });

  test("shows 'Created <filename>' after a create call completes", () => {
    render(
      <ToolInvocationMessage
        toolInvocation={{
          toolName: "str_replace_editor",
          state: "result",
          args: { command: "create", path: "/App.jsx" },
          result: "File created",
        }}
      />
    );

    const pill = screen.getByTestId("tool-invocation-message");
    expect(pill.textContent).toContain("Created");
    expect(pill.textContent).toContain("App.jsx");
    expect(screen.getByTestId("tool-icon-success")).toBeDefined();
    expect(screen.queryByTestId("tool-icon-loading")).toBeNull();
  });

  test("shows 'Editing <filename>' while a str_replace is in progress", () => {
    render(
      <ToolInvocationMessage
        toolInvocation={{
          toolName: "str_replace_editor",
          state: "call",
          args: { command: "str_replace", path: "/components/Button.jsx" },
        }}
      />
    );

    const pill = screen.getByTestId("tool-invocation-message");
    expect(pill.textContent).toContain("Editing");
    expect(pill.textContent).toContain("Button.jsx");
  });

  test("shows 'Edited <filename>' after a str_replace completes", () => {
    render(
      <ToolInvocationMessage
        toolInvocation={{
          toolName: "str_replace_editor",
          state: "result",
          args: { command: "str_replace", path: "/components/Form.jsx" },
          result: "Edit applied",
        }}
      />
    );

    const pill = screen.getByTestId("tool-invocation-message");
    expect(pill.textContent).toContain("Edited");
    expect(pill.textContent).toContain("Form.jsx");
  });

  test("treats 'insert' command the same as an edit", () => {
    render(
      <ToolInvocationMessage
        toolInvocation={{
          toolName: "str_replace_editor",
          state: "call",
          args: { command: "insert", path: "/App.jsx" },
        }}
      />
    );

    expect(
      screen.getByTestId("tool-invocation-message").textContent
    ).toContain("Editing");
  });

  test("shows 'Reading <filename>' for a view command", () => {
    render(
      <ToolInvocationMessage
        toolInvocation={{
          toolName: "str_replace_editor",
          state: "call",
          args: { command: "view", path: "/App.jsx" },
        }}
      />
    );

    const pill = screen.getByTestId("tool-invocation-message");
    expect(pill.textContent).toContain("Reading");
    expect(pill.textContent).toContain("App.jsx");
  });

  test("shows 'Reverting changes in <filename>' for an undo_edit command", () => {
    render(
      <ToolInvocationMessage
        toolInvocation={{
          toolName: "str_replace_editor",
          state: "call",
          args: { command: "undo_edit", path: "/App.jsx" },
        }}
      />
    );

    const pill = screen.getByTestId("tool-invocation-message");
    expect(pill.textContent).toContain("Reverting changes in");
    expect(pill.textContent).toContain("App.jsx");
  });

  test("parses args when provided as a JSON string (streaming case)", () => {
    render(
      <ToolInvocationMessage
        toolInvocation={{
          toolName: "str_replace_editor",
          state: "call",
          args: JSON.stringify({
            command: "create",
            path: "/components/Card.jsx",
          }),
        }}
      />
    );

    const pill = screen.getByTestId("tool-invocation-message");
    expect(pill.textContent).toContain("Creating");
    expect(pill.textContent).toContain("Card.jsx");
  });

  test("extracts basename from deeply nested paths", () => {
    render(
      <ToolInvocationMessage
        toolInvocation={{
          toolName: "str_replace_editor",
          state: "result",
          args: {
            command: "create",
            path: "/src/components/ui/button.tsx",
          },
          result: "ok",
        }}
      />
    );

    const pill = screen.getByTestId("tool-invocation-message");
    expect(pill.textContent).toContain("button.tsx");
    expect(pill.textContent).not.toContain("/src/components/ui");
  });
});

describe("ToolInvocationMessage - file_manager", () => {
  test("shows 'Renaming <old> → <new>' while a rename is in progress", () => {
    render(
      <ToolInvocationMessage
        toolInvocation={{
          toolName: "file_manager",
          state: "call",
          args: {
            command: "rename",
            path: "/components/Old.jsx",
            new_path: "/components/New.jsx",
          },
        }}
      />
    );

    const pill = screen.getByTestId("tool-invocation-message");
    expect(pill.textContent).toContain("Renaming");
    expect(pill.textContent).toContain("Old.jsx");
    expect(pill.textContent).toContain("New.jsx");
  });

  test("shows 'Renamed <old> → <new>' after a rename completes", () => {
    render(
      <ToolInvocationMessage
        toolInvocation={{
          toolName: "file_manager",
          state: "result",
          args: {
            command: "rename",
            path: "/a.jsx",
            new_path: "/b.jsx",
          },
          result: { success: true, message: "renamed" },
        }}
      />
    );

    const pill = screen.getByTestId("tool-invocation-message");
    expect(pill.textContent).toContain("Renamed");
    expect(pill.textContent).toContain("a.jsx");
    expect(pill.textContent).toContain("b.jsx");
    expect(screen.getByTestId("tool-icon-success")).toBeDefined();
  });

  test("shows 'Deleting <filename>' for an in-progress delete", () => {
    render(
      <ToolInvocationMessage
        toolInvocation={{
          toolName: "file_manager",
          state: "call",
          args: { command: "delete", path: "/components/Card.jsx" },
        }}
      />
    );

    const pill = screen.getByTestId("tool-invocation-message");
    expect(pill.textContent).toContain("Deleting");
    expect(pill.textContent).toContain("Card.jsx");
  });

  test("shows error state when result reports success: false", () => {
    render(
      <ToolInvocationMessage
        toolInvocation={{
          toolName: "file_manager",
          state: "result",
          args: { command: "delete", path: "/missing.jsx" },
          result: { success: false, error: "not found" },
        }}
      />
    );

    expect(screen.getByTestId("tool-icon-error")).toBeDefined();
    expect(screen.queryByTestId("tool-icon-success")).toBeNull();
    const pill = screen.getByTestId("tool-invocation-message");
    expect(pill.className).toContain("bg-red-50");
  });
});

describe("ToolInvocationMessage - fallback behavior", () => {
  test("falls back to 'File editor' for str_replace_editor without a command", () => {
    render(
      <ToolInvocationMessage
        toolInvocation={{
          toolName: "str_replace_editor",
          state: "result",
          args: {},
          result: "ok",
        }}
      />
    );

    expect(
      screen.getByTestId("tool-invocation-message").textContent
    ).toContain("File editor");
  });

  test("falls back to 'File manager' for file_manager without a command", () => {
    render(
      <ToolInvocationMessage
        toolInvocation={{
          toolName: "file_manager",
          state: "call",
          args: {},
        }}
      />
    );

    expect(
      screen.getByTestId("tool-invocation-message").textContent
    ).toContain("File manager");
  });

  test("falls back to the raw tool name for unknown tools", () => {
    render(
      <ToolInvocationMessage
        toolInvocation={{
          toolName: "some_custom_tool",
          state: "call",
          args: {},
        }}
      />
    );

    expect(
      screen.getByTestId("tool-invocation-message").textContent
    ).toContain("some_custom_tool");
  });

  test("renders in-progress style when state is 'call'", () => {
    render(
      <ToolInvocationMessage
        toolInvocation={{
          toolName: "str_replace_editor",
          state: "call",
          args: { command: "create", path: "/A.jsx" },
        }}
      />
    );

    const pill = screen.getByTestId("tool-invocation-message");
    expect(pill.className).toContain("bg-blue-50");
    expect(screen.getByTestId("tool-icon-loading")).toBeDefined();
  });

  test("renders completed style when state is 'result'", () => {
    render(
      <ToolInvocationMessage
        toolInvocation={{
          toolName: "str_replace_editor",
          state: "result",
          args: { command: "create", path: "/A.jsx" },
          result: "ok",
        }}
      />
    );

    const pill = screen.getByTestId("tool-invocation-message");
    expect(pill.className).toContain("bg-neutral-50");
    expect(screen.getByTestId("tool-icon-success")).toBeDefined();
  });

  test("handles missing path gracefully", () => {
    render(
      <ToolInvocationMessage
        toolInvocation={{
          toolName: "str_replace_editor",
          state: "call",
          args: { command: "create" },
        }}
      />
    );

    // Still renders the action word without crashing
    expect(
      screen.getByTestId("tool-invocation-message").textContent
    ).toContain("Creating");
  });
});
