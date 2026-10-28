import type { ChecklistDirectoryHandle } from '@/models/storage/ChecklistDirectoryHandle'
import type { ChecklistFileHandle } from '@/models/storage/ChecklistFileHandle'
import type { ChecklistWritableFile } from '@/models/storage/ChecklistWritableFile'

interface FakeFolderControls {
  permission: PermissionState
  requestedPermission: PermissionState
  failOpen: boolean
  failWrite: boolean
  failClose: boolean
  activeWriters: number
  maxActiveWriters: number
  beforeClose: ((filename: string) => Promise<void>) | null
}

interface FakeChecklistFolder {
  handle: ChecklistDirectoryHandle
  files: Map<string, string>
  controls: FakeFolderControls
  history: string[]
  children: Map<string, FakeChecklistFolder>
}

export function createFakeChecklistFolder(name = 'QAChecklist'): FakeChecklistFolder {
  const files = new Map<string, string>()
  const children = new Map<string, FakeChecklistFolder>()
  const history: string[] = []
  const controls: FakeFolderControls = {
    permission: 'granted',
    requestedPermission: 'granted',
    failOpen: false,
    failWrite: false,
    failClose: false,
    activeWriters: 0,
    maxActiveWriters: 0,
    beforeClose: null,
  }
  const fileHandles = new Map<string, ChecklistFileHandle>()
  const writerCounts = new Map<string, number>()

  function getFileHandle(filename: string): ChecklistFileHandle {
    const existing = fileHandles.get(filename)
    if (existing) return existing
    const fileHandle: ChecklistFileHandle = {
      kind: 'file',
      name: filename,
      async getFile() {
        const text = files.get(filename)
        if (text === undefined) throw new DOMException('File not found', 'NotFoundError')
        return new File([text], filename, { type: 'application/json' })
      },
      async createWritable() {
        if (controls.failOpen) throw new Error('Injected open failure')
        if (controls.permission !== 'granted') {
          throw new DOMException('Write permission denied', 'NotAllowedError')
        }
        if ((writerCounts.get(filename) ?? 0) > 0) {
          throw new DOMException('File already locked', 'NoModificationAllowedError')
        }
        writerCounts.set(filename, 1)
        controls.activeWriters += 1
        controls.maxActiveWriters = Math.max(controls.maxActiveWriters, controls.activeWriters)
        history.push(`open:${filename}`)
        let staged = ''
        let finished = false

        function release(): void {
          if (finished) return
          finished = true
          writerCounts.delete(filename)
          controls.activeWriters -= 1
        }

        const writable: ChecklistWritableFile = {
          async write(text) {
            if (finished) throw new Error('Writer already finished')
            history.push(`write:${filename}`)
            if (controls.failWrite) throw new Error('Injected write failure')
            staged = text
          },
          async close() {
            if (finished) throw new Error('Writer already finished')
            await controls.beforeClose?.(filename)
            if (controls.failClose) throw new Error('Injected close failure')
            files.set(filename, staged)
            history.push(`close:${filename}`)
            release()
          },
          async abort() {
            history.push(`abort:${filename}`)
            release()
          },
        }
        return writable
      },
    }
    fileHandles.set(filename, fileHandle)
    return fileHandle
  }

  const handle: ChecklistDirectoryHandle = {
    kind: 'directory',
    name,
    async queryPermission() {
      history.push('queryPermission')
      return controls.permission
    },
    async requestPermission() {
      history.push('requestPermission')
      controls.permission = controls.requestedPermission
      return controls.permission
    },
    async getDirectoryHandle(childName, options) {
      let child = children.get(childName)
      if (!child && options?.create) {
        child = createFakeChecklistFolder(childName)
        children.set(childName, child)
      }
      if (!child) throw new DOMException('Directory not found', 'NotFoundError')
      return child.handle
    },
    async getFileHandle(filename, options) {
      if (!files.has(filename)) {
        if (!options?.create) throw new DOMException('File not found', 'NotFoundError')
        files.set(filename, '')
      }
      return getFileHandle(filename)
    },
  }
  return { handle, files, controls, history, children }
}
