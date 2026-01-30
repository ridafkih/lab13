"use client";

import { Copy } from "@lab/ui/components/copy";
import { Spinner } from "@lab/ui/components/spinner";
import type { StepStartPart } from "@opencode-ai/sdk/client";

interface OpencodePartStepStartProps {
  part: StepStartPart;
}

export function OpencodePartStepStart(_props: OpencodePartStepStartProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b last:border-b-0 border-border bg-muted/30">
      <Spinner size="xxs" />
      <Copy as="span" size="xs" muted>
        Thinking...
      </Copy>
    </div>
  );
}
