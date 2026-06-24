import type { PageActionType, StatusType } from './types'

export const WorkerStatusMap = {
  ready: 'ready',
  not_ready: 'not_ready',
  unreachable: 'unreachable',
}

export const WorkerStatusMapValue = {
  [WorkerStatusMap.ready]: 'Ready',
  [WorkerStatusMap.not_ready]: 'Not Ready',
  [WorkerStatusMap.unreachable]: 'Unreachable',
}

export const StatusMaps = {
  error: 'error',
  warning: 'warning',
  transitioning: 'transitioning',
  success: 'success',
  inactive: 'inactive',
}

export const status: any = {
  [WorkerStatusMap.ready]: StatusMaps.success,
  [WorkerStatusMap.not_ready]: StatusMaps.error,
  [WorkerStatusMap.unreachable]: StatusMaps.error,
}

export const addWorkerGuide: Record<string, any> = {
  mac: {
    getToken: 'cat /var/lib/gpustack/token',
    registerWorker(params: { server: string, token: string }) {
      return `curl -sfL https://get.gpustack.ai | sh -s - --server-url ${params.server} --token ${params.token}`
    },
  },
  win: {
    getToken:
      'Get-Content -Path (Join-Path -Path $env:APPDATA -ChildPath "gpustack\\token") -Raw',
    registerWorker(params: { server: string, token: string }) {
      return `Invoke-Expression "& { $((Invoke-WebRequest -Uri 'https://get.gpustack.ai' -UseBasicParsing).Content) } --server-url '${params.server}' --token '${params.token}'"`
    },
  },
  cuda: {
    getToken:
      'Get-Content -Path (Join-Path -Path $env:APPDATA -ChildPath "gpustack\\token") -Raw',
    registerWorker(params: {
      server: string
      tag: string
      token: string
      workerip: string
    }) {
      return `docker run -d --name gpustack \\
    --restart=unless-stopped \\
    --gpus all \\
    --network=host \\
    --ipc=host \\
    -v gpustack-data:/var/lib/gpustack \\
    gpustack/gpustack:${params.tag} \\
    --server-url ${params.server} --token ${params.token} --worker-ip ${params.workerip}`
    },
  },
  npu: {
    getToken:
      'Get-Content -Path (Join-Path -Path $env:APPDATA -ChildPath "gpustack\\token") -Raw',
    registerWorker(params: {
      server: string
      tag: string
      token: string
      workerip: string
    }) {
      return `docker run -d --name gpustack \\
    --restart=unless-stopped \\
    --device /dev/davinci0 \\
    --device /dev/davinci1 \\
    --device /dev/davinci_manager \\
    --device /dev/devmm_svm \\
    --device /dev/hisi_hdc \\
    -v /usr/local/dcmi:/usr/local/dcmi \\
    -v /usr/local/bin/npu-smi:/usr/local/bin/npu-smi \\
    -v /usr/local/Ascend/driver/lib64/:/usr/local/Ascend/driver/lib64/ \\
    -v /usr/local/Ascend/driver/version.info:/usr/local/Ascend/driver/version.info \\
    -v /etc/ascend_install.info:/etc/ascend_install.info \\
    --network=host \\
    --ipc=host \\
    -v gpustack-data:/var/lib/gpustack \\
    gpustack/gpustack:${params.tag} \\
    --server-url ${params.server} --token ${params.token} --worker-ip ${params.workerip}`
    },
  },
  npu310p: {
    getToken:
      'Get-Content -Path (Join-Path -Path $env:APPDATA -ChildPath "gpustack\\token") -Raw',
    registerWorker(params: {
      server: string
      tag: string
      token: string
      workerip: string
    }) {
      return `docker run -d --name gpustack \\
    --restart=unless-stopped \\
    --device /dev/davinci0 \\
    --device /dev/davinci1 \\
    --device /dev/davinci_manager \\
    --device /dev/devmm_svm \\
    --device /dev/hisi_hdc \\
    -v /usr/local/dcmi:/usr/local/dcmi \\
    -v /usr/local/bin/npu-smi:/usr/local/bin/npu-smi \\
    -v /usr/local/Ascend/driver/lib64/:/usr/local/Ascend/driver/lib64/ \\
    -v /usr/local/Ascend/driver/version.info:/usr/local/Ascend/driver/version.info \\
    -v /etc/ascend_install.info:/etc/ascend_install.info \\
    --network=host \\
    --ipc=host \\
    -v gpustack-data:/var/lib/gpustack \\
    gpustack/gpustack:${params.tag}-310p \\
    --server-url ${params.server} --token ${params.token} --worker-ip ${params.workerip}`
    },
  },
  musa: {
    getToken:
      'Get-Content -Path (Join-Path -Path $env:APPDATA -ChildPath "gpustack\\token") -Raw',
    registerWorker(params: {
      server: string
      tag: string
      token: string
      workerip: string
    }) {
      return `docker run -d --name gpustack \\
    --restart=unless-stopped \\
    --network=host \\
    --ipc=host \\
    -v gpustack-data:/var/lib/gpustack \\
    gpustack/gpustack:${params.tag} \\
    --server-url ${params.server} --token ${params.token} --worker-ip ${params.workerip}`
    },
  },
  cpu: {
    getToken:
      'Get-Content -Path (Join-Path -Path $env:APPDATA -ChildPath "gpustack\\token") -Raw',
    registerWorker(params: {
      server: string
      tag: string
      token: string
      workerip: string
    }) {
      return `docker run -d --name gpustack \\
    --restart=unless-stopped \\
    --network=host \\
    -v gpustack-data:/var/lib/gpustack \\
    gpustack/gpustack:${params.tag} \\
    --server-url ${params.server} --token ${params.token} --worker-ip ${params.workerip}`
    },
  },
  rocm: {
    registerWorker(params: {
      server: string
      tag: string
      token: string
      workerip: string
    }) {
      return `docker run -d --name gpustack \\
    --restart=unless-stopped \\
    --device=/dev/kfd \\
    --device=/dev/dri \\
    --network=host \\
    --ipc=host \\
    --group-add video \\
    --cap-add=SYS_PTRACE \\
    --security-opt seccomp=unconfined \\
    -v gpustack-data:/var/lib/gpustack \\
    gpustack/gpustack:${params.tag} \\
    --server-url ${params.server} --token ${params.token} --worker-ip ${params.workerip}`
    },
  },
  dcu: {
    registerWorker(params: {
      server: string
      tag: string
      token: string
      workerip: string
    }) {
      return `docker run -d --name gpustack \\
    --restart=unless-stopped \\
    --device=/dev/kfd \\
    --device=/dev/mkfd \\
    --device=/dev/dri \\
    -v /opt/hyhal:/opt/hyhal:ro \\
    --network=host \\
    --ipc=host \\
    --group-add video \\
    --cap-add=SYS_PTRACE \\
    --security-opt seccomp=unconfined \\
    -v gpustack-data:/var/lib/gpustack \\
    gpustack/gpustack:${params.tag} \\
    --server-url ${params.server} --token ${params.token} --worker-ip ${params.workerip}`
    },
  },
  corex: {
    registerWorker(params: {
      server: string
      tag: string
      token: string
      workerip: string
    }) {
      return `docker run -d --name gpustack \\
    -v /lib/modules:/lib/modules \\
    -v /dev:/dev \\
    --privileged \\
    --cap-add=ALL \\
    --pid=host \\
    --restart=unless-stopped \\
    --network=host \\
    --ipc=host \\
    -v gpustack-data:/var/lib/gpustack \\
    gpustack/gpustack:${params.tag} \\
     --server-url ${params.server} --token ${params.token} --worker-ip ${params.workerip}`
    },
  },
  container: {
    getToken:
      'docker exec -it ${gpustack_container_id} cat /var/lib/gpustack/token',
  },
}

export const containerInstallOptions = [
  { label: 'NVIDIA CUDA', value: 'cuda' },
  { label: 'AMD ROCm', value: 'rocm' },
  { label: 'Ascend CANN', value: 'npu' },
  { label: 'Hygon DTK', value: 'dcu' },
  { label: 'Moore Threads MUSA', value: 'musa' },
  { label: 'Iluvatar Corex', value: 'corex' },
  { label: 'CPU', value: 'cpu' },
]

export const ModelfileStateMap = {
  Error: 'error',
  Downloading: 'downloading',
  Ready: 'ready',
}

export const ModelfileStateMapValue = {
  [ModelfileStateMap.Error]: 'Error',
  [ModelfileStateMap.Downloading]: 'Downloading',
  [ModelfileStateMap.Ready]: 'Ready',
}

export const ModelfileState: any = {
  [ModelfileStateMap.Ready]: StatusMaps.success,
  [ModelfileStateMap.Error]: StatusMaps.error,
  [ModelfileStateMap.Downloading]: StatusMaps.transitioning,
}
// import { PageActionType, StatusType } from './types';

export const PageAction: Record<string, PageActionType> = {
  CREATE: 'create',
  UPDATE: 'update',
  VIEW: 'view',
}

export const StatusColorMap: Record<
  StatusType,
  { text: string, bg: string, border?: string }
> = {
  error: {
    text: '#ff4d4f', // ant-red-6
    bg: '#fff2f0', // ant-red-1
  },
  warning: {
    text: '#fa8c16', // ant-orange-6
    bg: '#fff7e6', // ant-orange-1
  },
  transitioning: {
    text: '#1677ff', // ant-blue-6
    bg: '#e6f4ff', // ant-blue-1
  },
  success: {
    text: '#52c41a', // ant-green-6
    bg: '#f6ffed', // ant-green-1
  },
  inactive: {
    text: '#8c8c8c', // ant-color-text-tertiary
    border: '#d9d9d9', // ant-color-border
    bg: '#fafafa', // ant-color-fill
  },
}

export const WatchEventType = {
  CREATE: 1,
  UPDATE: 2,
  DELETE: 3,
}

export const PasswordReg
  = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*_+])[a-zA-Z\d!@#$%^&*_+]{6,12}$/

export const uppercaseReg = /(?=.*[A-Z])/

export const lowercaseReg = /(?=.*[a-z])/

export const digitReg = /(?=.*\d)/

export const specialCharacterReg = /(?=.*[\W_])/

export const noSpaceReg = /(?=\S+$)/

export const lengthReg = /^.{6,12}$/
