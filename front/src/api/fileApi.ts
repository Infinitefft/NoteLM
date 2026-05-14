import axios from './config'

/* ---------- 类型 ---------- */

export type CheckFileResponse = {
  exists: boolean
  uploadedChunks: number[]
}

export type UploadChunkResponse = {
  chunkIndex: number
}

export type RagDocumentDTO = {
  id: string
  originalName: string
  kind: string
  byteSize: string
  status: string
  createdAt: string
}

export type MergeChunksResponse = {
  document: RagDocumentDTO
}

/* ---------- 接口 ---------- */

/** 检查文件是否存在（秒传 / 续传） */
export function checkFile(
  fileHash: string,
  fileName: string,
  fileSize: number,
  sessionId: string,
) {
  return axios.post<CheckFileResponse>('/file/check', {
    fileHash,
    fileName,
    fileSize: String(fileSize),
    sessionId,
  })
}

/** 上传分片 */
export function uploadChunk(
  fileHash: string,
  chunkIndex: number,
  chunk: Blob,
) {
  const formData = new FormData()
  formData.append('fileHash', fileHash)
  formData.append('chunkIndex', String(chunkIndex))
  formData.append('chunk', chunk)
  return axios.post<UploadChunkResponse>('/file/upload', formData, {
    timeout: 120_000,
  })
}

/** 合并分片 */
export function mergeChunks(
  fileHash: string,
  fileName: string,
  fileSize: number,
  sessionId: string,
  totalChunks: number,
) {
  return axios.post<MergeChunksResponse>('/file/merge', {
    fileHash,
    fileName,
    fileSize: String(fileSize),
    sessionId,
    totalChunks,
  })
}
