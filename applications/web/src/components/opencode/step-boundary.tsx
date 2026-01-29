"use client";

import { Copy } from "@lab/ui/components/copy";
import { Spinner } from "@lab/ui/components/spinner";
import type { StepStartPart, StepFinishPart } from "@opencode-ai/sdk/client";

interface StepStartBoundaryProps {
  part: StepStartPart;
}

interface StepFinishBoundaryProps {
  part: StepFinishPart;
}

function formatTokens(tokens: StepFinishPart["tokens"]): string {
  const parts: string[] = [];

  if (tokens.input > 0) {
    parts.push(`${tokens.input.toLocaleString()} in`);
  }
  if (tokens.output > 0) {
    parts.push(`${tokens.output.toLocaleString()} out`);
  }
  if (tokens.reasoning > 0) {
    parts.push(`${tokens.reasoning.toLocaleString()} reasoning`);
  }

  return parts.join(" / ");
}

function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

export function ThinkingIndicator({ part: _part }: StepStartBoundaryProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
      <Spinner size="xxs" />
      <Copy as="span" size="xs" muted>
        Thinking...
      </Copy>
    </div>
  );
}

export function StepFinishBoundary({ part }: StepFinishBoundaryProps) {
  const tokenInfo = formatTokens(part.tokens);
  const costInfo = formatCost(part.cost);

  return (
    <div className="flex items-center justify-end gap-2 px-4 py-1 border-b border-border bg-muted/20">
      {tokenInfo && (
        <Copy as="span" size="xs" muted>
          {tokenInfo}
        </Copy>
      )}
      <Copy as="span" size="xs" muted>
        {costInfo}
      </Copy>
    </div>
  );
}
