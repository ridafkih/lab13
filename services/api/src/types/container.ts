export const CONTAINER_STATUS = {
  RUNNING: "running",
  STOPPED: "stopped",
  STARTING: "starting",
  ERROR: "error",
} as const;

export type ContainerStatus =
  (typeof CONTAINER_STATUS)[keyof typeof CONTAINER_STATUS];

export function isContainerStatus(status: string): status is ContainerStatus {
  return Object.values(CONTAINER_STATUS).some(
    (containerStatus) => containerStatus === status
  );
}
