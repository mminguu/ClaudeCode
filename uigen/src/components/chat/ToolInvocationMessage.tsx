"use client";

import { Loader2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToolInvocationLike {
  toolName: string;
  state: string;
  args?: unknown;
  result?: unknown;
}

interface ToolInvocationMessageProps {
  toolInvocation: ToolInvocationLike;
}

type MessageDescriptor = {
  action: string;
  target?: string;
  targetSecondary?: string;
};

function basename(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const segments = path.split("/").filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : path;
}

function parseArgs(args: unknown): Record<string, unknown> {
  if (!args) return {};
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof args === "object") return args as Record<string, unknown>;
  return {};
}

export function buildToolMessage(
  toolName: string,
  args: unknown,
  isComplete: boolean
): MessageDescriptor {
  const parsed = parseArgs(args);
  const command = typeof parsed.command === "string" ? parsed.command : undefined;
  const path = typeof parsed.path === "string" ? parsed.path : undefined;
  const newPath = typeof parsed.new_path === "string" ? parsed.new_path : undefined;
  const file = basename(path);
  const newFile = basename(newPath);

  if (toolName === "str_replace_editor") {
    switch (command) {
      case "create":
        return { action: isComplete ? "Created" : "Creating", target: file };
      case "str_replace":
      case "insert":
        return { action: isComplete ? "Edited" : "Editing", target: file };
      case "view":
        return { action: isComplete ? "Read" : "Reading", target: file };
      case "undo_edit":
        return {
          action: isComplete ? "Reverted changes in" : "Reverting changes in",
          target: file,
        };
    }
    return { action: "File editor" };
  }

  if (toolName === "file_manager") {
    switch (command) {
      case "rename":
        return {
          action: isComplete ? "Renamed" : "Renaming",
          target: file,
          targetSecondary: newFile,
        };
      case "delete":
        return { action: isComplete ? "Deleted" : "Deleting", target: file };
    }
    return { action: "File manager" };
  }

  return { action: toolName };
}

function isErrorResult(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  return (result as { success?: unknown }).success === false;
}

export function ToolInvocationMessage({ toolInvocation }: ToolInvocationMessageProps) {
  const isComplete = toolInvocation.state === "result";
  const hasError = isComplete && isErrorResult(toolInvocation.result);
  const { action, target, targetSecondary } = buildToolMessage(
    toolInvocation.toolName,
    toolInvocation.args,
    isComplete
  );

  return (
    <div
      data-testid="tool-invocation-message"
      className={cn(
        "inline-flex items-center gap-2 mt-2 px-3 py-1.5 rounded-lg text-xs border",
        hasError
          ? "bg-red-50 border-red-200"
          : isComplete
          ? "bg-neutral-50 border-neutral-200"
          : "bg-blue-50 border-blue-200"
      )}
    >
      {hasError ? (
        <X
          data-testid="tool-icon-error"
          className="w-3 h-3 text-red-600 flex-shrink-0"
        />
      ) : isComplete ? (
        <Check
          data-testid="tool-icon-success"
          className="w-3 h-3 text-emerald-600 flex-shrink-0"
        />
      ) : (
        <Loader2
          data-testid="tool-icon-loading"
          className="w-3 h-3 animate-spin text-blue-600 flex-shrink-0"
        />
      )}
      <span className={cn(hasError ? "text-red-700" : "text-neutral-700")}>
        {action}
        {target && (
          <>
            {" "}
            <span className="font-mono font-medium">{target}</span>
          </>
        )}
        {targetSecondary && (
          <>
            {" → "}
            <span className="font-mono font-medium">{targetSecondary}</span>
          </>
        )}
      </span>
    </div>
  );
}
