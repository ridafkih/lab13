export interface Container {
  id: string;
  image: string;
  ports: string[];
  envVars: { key: string; value: string }[];
  permissions: {
    readFiles: boolean;
    readWriteFiles: boolean;
    runBashCommands: boolean;
  };
}

export interface Project {
  systemPrompt: string;
  containers: Container[];
}

export function createEmptyContainer(): Container {
  return {
    id: crypto.randomUUID(),
    image: "",
    ports: [],
    envVars: [],
    permissions: {
      readFiles: true,
      readWriteFiles: false,
      runBashCommands: false,
    },
  };
}
