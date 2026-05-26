export const IPC_CHANNELS = {
  task: {
    create: 'task:create',
    list: 'task:list',
    retry: 'task:retry',
    retryStep: 'task:retry-step',
    cancel: 'task:cancel',
    delete: 'task:delete',
    clone: 'task:clone',
  },
  asset: {
    list: 'asset:list',
    open: 'asset:open',
    reveal: 'asset:reveal',
    readText: 'asset:read-text',
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
