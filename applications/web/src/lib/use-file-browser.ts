"use client";

import { useReducer, useEffect, useRef } from "react";
import useSWR from "swr";
import type { FileContent } from "@opencode-ai/sdk/v2/client";
import { useFileStatuses, type ChangedFile } from "./use-file-statuses";
import { useSessionClient, createSessionClient } from "./use-session-client";
import type { BrowserState, BrowserActions, FileNode, FileStatus } from "@/components/review";

type Patch = NonNullable<FileContent["patch"]>;

type FileBrowserState = {
  expandedPaths: Set<string>;
  loadedContents: Map<string, FileNode[]>;
  loadingPaths: Set<string>;
  selectedPath: string | null;
  previewContent: string | null;
  previewPatch: Patch | null;
  previewLoading: boolean;
};

type FileBrowserAction =
  | { type: "RESET" }
  | { type: "TOGGLE_EXPANDED"; path: string; expand: boolean }
  | { type: "SET_EXPANDED_PATHS"; paths: Set<string> }
  | { type: "SET_LOADED_CONTENTS"; path: string; contents: FileNode[] }
  | { type: "ADD_LOADING_PATH"; path: string }
  | { type: "REMOVE_LOADING_PATH"; path: string }
  | { type: "SELECT_FILE"; path: string }
  | { type: "CLEAR_FILE_SELECTION" }
  | { type: "SET_PREVIEW_CONTENT"; content: string | null; patch: Patch | null }
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

function fileBrowserReducer(state: FileBrowserState, action: FileBrowserAction): FileBrowserState {
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

  for (let i = 1; i < segments.length; i++) {
    parents.push(segments.slice(0, i).join("/"));
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

async function fetchRootFiles(sessionId: string): Promise<FileNode[]> {
  const client = createSessionClient(sessionId);
  const response = await client.file.list({ path: "." });

  if (response.data) {
    return response.data.map((node) => ({
      name: node.name,
      path: node.path,
      type: node.type,
      ignored: node.ignored,
    }));
  }

  return [];
}

export function useFileBrowser(sessionId: string | null): {
  state: BrowserState;
  actions: BrowserActions;
} {
  const { files: changedFiles, isLoading: statusesLoading } = useFileStatuses(sessionId);

  const [browserState, dispatch] = useReducer(fileBrowserReducer, null, getInitialState);
  const client = useSessionClient(sessionId);

  const { data: rootNodes, isLoading: rootLoading } = useSWR<FileNode[]>(
    sessionId ? `file-browser-root-${sessionId}` : null,
    () => fetchRootFiles(sessionId!),
  );

  const { statuses: fileStatuses, dirsWithChanges: directoriesWithChanges } =
    buildStatusMaps(changedFiles);

  const initializedSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (initializedSessionRef.current === sessionId) return;
    initializedSessionRef.current = sessionId;

    dispatch({ type: "RESET" });
  }, [sessionId]);

  const toggleDirectory = async (path: string) => {
    if (browserState.expandedPaths.has(path)) {
      dispatch({ type: "TOGGLE_EXPANDED", path, expand: false });
      return;
    }

    if (!browserState.loadedContents.has(path) && client) {
      dispatch({ type: "ADD_LOADING_PATH", path });

      try {
        const response = await client.file.list({ path });

        if (response.data) {
          const nodes: FileNode[] = response.data.map((node) => ({
            name: node.name,
            path: node.path,
            type: node.type,
            ignored: node.ignored,
          }));
          dispatch({ type: "SET_LOADED_CONTENTS", path, contents: nodes });
        }
      } catch (error) {
        console.error(error);
      } finally {
        dispatch({ type: "REMOVE_LOADING_PATH", path });
      }
    }

    dispatch({ type: "TOGGLE_EXPANDED", path, expand: true });
  };

  const selectFile = async (path: string) => {
    if (!client) return;

    dispatch({ type: "SELECT_FILE", path });

    try {
      const response = await client.file.read({ path });

      if (!response.data || response.data.type !== "text") return;

      dispatch({
        type: "SET_PREVIEW_CONTENT",
        content: response.data.content,
        patch: response.data.patch ?? null,
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
    if (!client || browserState.loadedContents.has(dirPath)) return;

    try {
      const response = await client.file.list({ path: dirPath });
      if (response.data) {
        const nodes: FileNode[] = response.data.map((node) => ({
          name: node.name,
          path: node.path,
          type: node.type,
          ignored: node.ignored,
        }));
        dispatch({ type: "SET_LOADED_CONTENTS", path: dirPath, contents: nodes });
      }
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
