# Web Application

## Getting Started

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Review Panel

The Review tab displays file diffs for reviewing agent-made changes. The file list appears in the sidebar under "Changed Files", and each diff has a sticky header with a dismiss checkbox.

### Data Types

```typescript
type ReviewFileStatus = "pending" | "dismissed";

type ReviewFileChangeType = "modified" | "created" | "deleted";

interface ReviewableFile {
  path: string;
  originalContent: string;
  currentContent: string;
  status: ReviewFileStatus;
  changeType: ReviewFileChangeType;
}
```

### Usage

Both `ReviewPanel` and `SessionSidebar` need access to the review files:

```tsx
import { ReviewPanel } from "./compositions/review/review-panel";
import { SessionSidebar } from "./compositions/session-sidebar";
import type { ReviewableFile } from "@/types/review";

const [files, setFiles] = useState<ReviewableFile[]>([
  {
    path: "src/auth/middleware.ts",
    changeType: "modified",
    status: "pending",
    originalContent: "// original file contents",
    currentContent: "// modified file contents",
  },
  {
    path: "src/components/new-file.tsx",
    changeType: "created",
    status: "pending",
    originalContent: "",
    currentContent: "// new file contents",
  },
]);

function handleDismiss(path: string) {
  setFiles((files) =>
    files.map((file) => (file.path === path ? { ...file, status: "dismissed" } : file))
  );
}

// In ReviewPanel (displays diffs)
<ReviewPanel files={files} onDismiss={handleDismiss} />

// In SessionSidebar (displays file list)
<SessionSidebar
  reviewFiles={files}
  onDismissFile={handleDismiss}
  // ...other props
/>
```

### Props

**ReviewPanel**

| Prop        | Type                     | Description                                   |
| ----------- | ------------------------ | --------------------------------------------- |
| `files`     | `ReviewableFile[]`       | Array of files to review                      |
| `onDismiss` | `(path: string) => void` | Called when sticky header checkbox is clicked |

**SessionSidebar** (additional props)

| Prop            | Type                     | Description                               |
| --------------- | ------------------------ | ----------------------------------------- |
| `reviewFiles`   | `ReviewableFile[]`       | Array of files to show in "Changed Files" |
| `onDismissFile` | `(path: string) => void` | Called when file checkbox is clicked      |

### Behavior

- All pending files display their diffs stacked vertically
- Each diff has a sticky header with file path and dismiss checkbox
- Sidebar shows file list under "Changed Files" with checkboxes
- Clicking checkbox in either location dismisses the file
- Dismissed files are removed from diff view, shown with strikethrough in sidebar
