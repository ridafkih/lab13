"use client";

import { useEffect, useReducer, useRef } from "react";
import useSWR from "swr";
import type {
  BrowserActions,
  BrowserState,
  FileNode,
  FileStatus,
} from "@/components/review";
import { getAgentApiUrl } from "./acp-session";
import { type ChangedFile, useFileStatuses } from "./use-file-statuses";

interface Patch {
  oldFileName: string;
  newFileName: string;
  hunks: {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
  }[];
}

interface FileBrowserState {
  expandedPaths: Set<string>;
  loadedContents: Map<string, FileNode[]>;
  loadingPaths: Set<string>;
  selectedPath: string | null;
  previewContent: string | null;
  previewPatch: Patch | null;
  previewLoading: boolean;
}

function normalizeFileNodeType(value: string): "file" | "directory" {
  return value === "directory" ? "directory" : "file";
}

type FileBrowserAction =
  | { type: "RESET" }
  | { type: "TOGGLE_EXPANDED"; path: string; expand: boolean }
  | { type: "SET_EXPANDED_PATHS"; paths: Set<string> }
  | { type: "SET_LOADED_CONTENTS"; path: string; contents: FileNode[] }
  | { type: "ADD_LOADING_PATH"; path: string }
  | { type: "REMOVE_LOADING_PATH"; path: string }
  | { type: "SELECT_FILE"; path: string }
  | { type: "CLEAR_FILE_SELECTION" }
  | {
      type: "SET_PREVIEW_CONTENT";
      content: string | null;
      patch: Patch | null;
    }
  | { type: "SET_PREVIEW_LOADING"; loading: boolean };

function getInitialState(): FileBrowserState {
  return {
    expandedPaths: new Set(),
    loadedContents: new Map(),
    loadingPaths: new Set(),
    selectedPath: null,
    previewContent: null,
    previewPatch: null,
    previewLoading: false,
  };
}

function fileBrowserReducer(
  state: FileBrowserState,
  action: FileBrowserAction
): FileBrowserState {
  switch (action.type) {
    case "RESET":
      return getInitialState();

    case "TOGGLE_EXPANDED": {
      const next = new Set(state.expandedPaths);
      if (action.expand) {
        next.add(action.path);
      } else {
        next.delete(action.path);
      }
      return { ...state, expandedPaths: next };
    }

    case "SET_EXPANDED_PATHS":
      return { ...state, expandedPaths: action.paths };

    case "SET_LOADED_CONTENTS": {
      const next = new Map(state.loadedContents);
      next.set(action.path, action.contents);
      return { ...state, loadedContents: next };
    }

    case "ADD_LOADING_PATH": {
      const next = new Set(state.loadingPaths);
      next.add(action.path);
      return { ...state, loadingPaths: next };
    }

    case "REMOVE_LOADING_PATH": {
      const next = new Set(state.loadingPaths);
      next.delete(action.path);
      return { ...state, loadingPaths: next };
    }

    case "SELECT_FILE":
      return {
        ...state,
        selectedPath: action.path,
        previewLoading: true,
        previewContent: null,
        previewPatch: null,
      };

    case "CLEAR_FILE_SELECTION":
      return {
        ...state,
        selectedPath: null,
        previewContent: null,
        previewPatch: null,
      };

    case "SET_PREVIEW_CONTENT":
      return {
        ...state,
        previewContent: action.content,
        previewPatch: action.patch,
      };

    case "SET_PREVIEW_LOADING":
      return { ...state, previewLoading: action.loading };

    default:
      return state;
  }
}

function getParentPaths(filePath: string): string[] {
  const segments = filePath.split("/");
  const parents: string[] = [];

  for (let segmentIndex = 1; segmentIndex < segments.length; segmentIndex++) {
    parents.push(segments.slice(0, segmentIndex).join("/"));
  }

  return parents;
}

function buildStatusMaps(files: ChangedFile[]): {
  statuses: Map<string, FileStatus>;
  dirsWithChanges: Set<string>;
} {
  const statuses = new Map<string, FileStatus>();
  const dirsWithChanges = new Set<string>();

  for (const file of files) {
    statuses.set(file.path, file.status);
    for (const parentPath of getParentPaths(file.path)) {
      dirsWithChanges.add(parentPath);
    }
  }

  return { statuses, dirsWithChanges };
}

async function fetchFileList(
  sessionId: string,
  path: string
): Promise<FileNode[]> {
  const apiUrl = getAgentApiUrl();
  const response = await fetch(
    `${apiUrl}/acp/files/list?sessionId=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(path)}`,
    {
      headers: { "X-Lab-Session-Id": sessionId },
    }
  );

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  if (Array.isArray(data)) {
    return data.map(
      (node: {
        name: string;
        path: string;
        type: string;
        ignored?: boolean;
      }) => ({
        name: node.name,
        path: node.path,
        type: normalizeFileNodeType(node.type),
        ignored: node.ignored,
      })
    );
  }

  return [];
}

async function fetchFileContent(
  sessionId: string,
  path: string
): Promise<{ content: string | null; patch: Patch | null }> {
  const apiUrl = getAgentApiUrl();
  const response = await fetch(
    `${apiUrl}/acp/files/read?sessionId=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(path)}`,
    {
      headers: { "X-Lab-Session-Id": sessionId },
    }
  );

  if (!response.ok) {
    return { content: null, patch: null };
  }

  const data = await response.json();
  if (data && data.type === "text") {
    return {
      content: data.content ?? null,
      patch: data.patch ?? null,
    };
  }

  return { content: null, patch: null };
}

function fetchRootFiles(sessionId: string): Promise<FileNode[]> {
  return fetchFileList(sessionId, ".");
}

export function useFileBrowser(sessionId: string | null): {
  state: BrowserState;
  actions: BrowserActions;
} {
  const { files: changedFiles, isLoading: statusesLoading } =
    useFileStatuses(sessionId);

  const [browserState, dispatch] = useReducer(
    fileBrowserReducer,
    null,
    getInitialState
  );

  const { data: rootNodes, isLoading: rootLoading } = useSWR<FileNode[]>(
    sessionId && sessionId !== "new" ? `file-browser-root-${sessionId}` : null,
    () => {
      if (!sessionId) {
        return [];
      }
      return fetchRootFiles(sessionId);
    }
  );

  const { statuses: fileStatuses, dirsWithChanges: directoriesWithChanges } =
    buildStatusMaps(changedFiles);

  const initializedSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (initializedSessionRef.current === sessionId) {
      return;
    }
    initializedSessionRef.current = sessionId;

    dispatch({ type: "RESET" });
  }, [sessionId]);

  const toggleDirectory = async (path: string) => {
    if (browserState.expandedPaths.has(path)) {
      dispatch({ type: "TOGGLE_EXPANDED", path, expand: false });
      return;
    }

    if (!browserState.loadedContents.has(path) && sessionId) {
      dispatch({ type: "ADD_LOADING_PATH", path });

      try {
        const nodes = await fetchFileList(sessionId, path);
        dispatch({ type: "SET_LOADED_CONTENTS", path, contents: nodes });
      } catch (error) {
        console.error(error);
      } finally {
        dispatch({ type: "REMOVE_LOADING_PATH", path });
      }
    }

    dispatch({ type: "TOGGLE_EXPANDED", path, expand: true });
  };

  const selectFile = async (path: string) => {
    if (!sessionId) {
      return;
    }

    dispatch({ type: "SELECT_FILE", path });

    try {
      const { content, patch } = await fetchFileContent(sessionId, path);
      dispatch({
        type: "SET_PREVIEW_CONTENT",
        content,
        patch,
      });
    } catch (error) {
      console.error(error);
    } finally {
      dispatch({ type: "SET_PREVIEW_LOADING", loading: false });
    }
  };

  const clearFileSelection = () => {
    dispatch({ type: "CLEAR_FILE_SELECTION" });
  };

  const loadDirectoryContents = async (dirPath: string) => {
    if (!sessionId || browserState.loadedContents.has(dirPath)) {
      return;
    }

    try {
      const nodes = await fetchFileList(sessionId, dirPath);
      dispatch({
        type: "SET_LOADED_CONTENTS",
        path: dirPath,
        contents: nodes,
      });
    } catch (error) {
      console.error(error);
    }
  };

  const expandToFile = async (filePath: string) => {
    const parents = getParentPaths(filePath);
    await Promise.all(parents.map(loadDirectoryContents));
    dispatch({ type: "SET_EXPANDED_PATHS", paths: new Set(parents) });
  };

  const state: BrowserState = {
    rootNodes: rootNodes ?? [],
    expandedPaths: browserState.expandedPaths,
    loadedContents: browserState.loadedContents,
    loadingPaths: browserState.loadingPaths,
    rootLoading: rootLoading || statusesLoading,
    selectedPath: browserState.selectedPath,
    previewContent: browserState.previewContent,
    previewPatch: browserState.previewPatch,
    previewLoading: browserState.previewLoading,
    fileStatuses,
    directoriesWithChanges,
  };

  const actions: BrowserActions = {
    toggleDirectory,
    selectFile,
    clearFileSelection,
    expandToFile,
  };

  return { state, actions };
}
