import { create } from 'zustand'

import { checkFile, mergeChunks, uploadChunk } from '../api/fileApi'

/* ---------- 类型 ---------- */

export type UploadStatus =
  | 'hashing'
  | 'checking'
  | 'uploading'
  | 'merging'
  | 'done'
  | 'duplicate'
  | 'error'

export type UploadTask = {
  fileHash: string
  fileName: string
  fileSize: number
  sessionId: string
  status: UploadStatus
  hashProgress: number
  uploadProgress: number
  uploadedChunks: number[]
  totalChunks: number
  errorMessage?: string
}

type State = {
  uploads: Record<string, UploadTask> // key = fileHash
}

type Actions = {
  addUpload: (file: File, sessionId: string) => void
  cancelUpload: (fileHash: string) => void
  removeUpload: (fileHash: string) => void
}

const CHUNK_SIZE = 5 * 1024 * 1024 // 5MB per upload chunk

/* ---------- Store ---------- */

export const useFileUploadStore = create<State & Actions>((set, get) => {
  /** 更新单个 upload 的部分字段 */
  const patch = (fileHash: string, partial: Partial<UploadTask>) => {
    set((s) => {
      const task = s.uploads[fileHash]
      if (!task) return s
      return { uploads: { ...s.uploads, [fileHash]: { ...task, ...partial } } }
    })
  }

  return {
    uploads: {},

    addUpload(file: File, sessionId: string) {
      const tempHash = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

      // 占位 task（fileHash 后续更新）
      set((s) => ({
        uploads: {
          ...s.uploads,
          [tempHash]: {
            fileHash: tempHash,
            fileName: file.name,
            fileSize: file.size,
            sessionId,
            status: 'hashing',
            hashProgress: 0,
            uploadProgress: 0,
            uploadedChunks: [],
            totalChunks: Math.ceil(file.size / CHUNK_SIZE),
          },
        },
      }))

      // Step 1: Web Worker 计算 MD5
      const worker = new Worker(
        new URL('../utils/hashWorker.ts', import.meta.url),
        { type: 'module' },
      )

      worker.onmessage = async (e) => {
        const { type } = e.data

        if (type === 'progress') {
          patch(tempHash, { hashProgress: e.data.percent })
        }

        if (type === 'done') {
          const fileHash: string = e.data.hash
          const task = get().uploads[tempHash]
          if (!task) return

          // 用真实 hash 替换临时 key
          set((s) => {
            const { [tempHash]: _, ...rest } = s.uploads
            return {
              uploads: {
                ...rest,
                [fileHash]: { ...task, fileHash, status: 'checking', hashProgress: 100 },
              },
            }
          })

          worker.terminate()

          // Step 2: 检查是否秒传/续传
          try {
            const res = await checkFile(fileHash, file.name, file.size, sessionId)

            if (res.exists) {
              patch(fileHash, { status: 'duplicate', uploadProgress: 100 })
              return
            }

            // Step 3: 分片上传
            patch(fileHash, {
              status: 'uploading',
              uploadedChunks: res.uploadedChunks,
              uploadProgress: Math.round((res.uploadedChunks.length / task.totalChunks) * 100),
            })

            await uploadChunks(file, fileHash, task.totalChunks, res.uploadedChunks)

            // Step 4: 合并
            patch(fileHash, { status: 'merging', uploadProgress: 100 })
            await mergeChunks(fileHash, file.name, file.size, sessionId, task.totalChunks)
            patch(fileHash, { status: 'done' })
          } catch (err: any) {
            patch(fileHash, { status: 'error', errorMessage: err.message ?? '上传失败' })
          }
        }

        if (type === 'error') {
          patch(tempHash, { status: 'error', errorMessage: e.data.message })
          worker.terminate()
        }
      }

      worker.postMessage({ file })
    },

    cancelUpload(fileHash: string) {
      // TODO: 可扩展 abort controller
      removeUpload(fileHash)
    },

    removeUpload(fileHash: string) {
      set((s) => {
        const { [fileHash]: _, ...rest } = s.uploads
        return { uploads: rest }
      })
    },
  }

  /** 逐片上传，跳过已上传的分片 */
  async function uploadChunks(
    file: File,
    fileHash: string,
    totalChunks: number,
    skipChunks: number[],
  ) {
    const skipSet = new Set(skipChunks)
    for (let i = 0; i < totalChunks; i++) {
      if (skipSet.has(i)) continue

      const start = i * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, file.size)
      const chunk = file.slice(start, end)

      await uploadChunk(fileHash, i, chunk)

      // 更新进度
      const task = get().uploads[fileHash]
      if (!task) return
      const uploaded = [...task.uploadedChunks, i]
      patch(fileHash, {
        uploadedChunks: uploaded,
        uploadProgress: Math.round((uploaded.length / totalChunks) * 100),
      })
    }
  }
})
