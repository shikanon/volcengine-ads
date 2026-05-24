export const IPC_CHANNELS = {
  task: {
    create: 'task:create',
    list: 'task:list',
    retry: 'task:retry',
    retryStep: 'task:retry-step',
  },
  asset: {
    list: 'asset:list',
    reveal: 'asset:reveal',
    pickFiles: 'asset:pick-files',
  },
  settings: {
    get: 'settings:get',
    set: 'settings:set',
  },
  event: {
    taskProgress: 'event:task-progress',
  },
} as const;

export type IpcChannel =
  | (typeof IPC_CHANNELS.task)[keyof typeof IPC_CHANNELS.task]
  | (typeof IPC_CHANNELS.asset)[keyof typeof IPC_CHANNELS.asset]
  | (typeof IPC_CHANNELS.settings)[keyof typeof IPC_CHANNELS.settings]
  | (typeof IPC_CHANNELS.event)[keyof typeof IPC_CHANNELS.event];
