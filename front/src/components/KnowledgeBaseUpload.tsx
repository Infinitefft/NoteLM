import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useFileUploadStore, type UploadTask, type UploadStatus } from '../store/useFileUploadStore'
import { useChatSessionStore } from '../store/useChatSessionStore'

interface Props {
  open: boolean
  onClose: () => void
}

const STATUS_LABEL: Record<UploadStatus, string> = {
  hashing: '计算哈希…',
  checking: '检查文件…',
  uploading: '上传中',
  merging: '合并中…',
  done: '上传完成',
  duplicate: '秒传完成',
  error: '上传失败',
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ProgressRing({ percent, status }: { percent: number; status: UploadStatus }) {
  const color =
    status === 'done' || status === 'duplicate'
      ? 'var(--accent-green)'
      : status === 'error'
        ? 'red'
        : 'var(--accent-orange)'

  return (
    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
      <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
        <circle cx="18" cy="18" r="15" fill="none" stroke="var(--surface-muted)" strokeWidth="3" />
        <circle
          cx="18" cy="18" r="15" fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={`${percent * 0.942} 94.2`}
          strokeLinecap="round"
          className="transition-[stroke-dasharray] duration-300"
        />
      </svg>
      <span className="absolute text-[10px] font-semibold" style={{ color }}>
        {percent}
      </span>
    </div>
  )
}

function FileItem({ task, onRemove }: { task: UploadTask; onRemove: () => void }) {
  const isActive = !['done', 'duplicate', 'error'].includes(task.status)
  const overallProgress =
    task.status === 'hashing'
      ? Math.round(task.hashProgress * 0.3)
      : 30 + Math.round(task.uploadProgress * 0.7)

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface)] px-3 py-2.5">
      <ProgressRing percent={overallProgress} status={task.status} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[color:var(--text-primary)]">
          {task.fileName}
        </p>
        <p className="flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
          <span>{formatSize(task.fileSize)}</span>
          <span>·</span>
          <span>{STATUS_LABEL[task.status]}</span>
          {task.status === 'hashing' && <span>{task.hashProgress}%</span>}
          {task.status === 'uploading' && <span>{task.uploadProgress}%</span>}
          {task.status === 'error' && task.errorMessage && (
            <span className="text-red-500">{task.errorMessage}</span>
          )}
        </p>
      </div>
      {!isActive && (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded p-1 text-[color:var(--text-muted)] transition hover:bg-[color:var(--surface-muted)] hover:text-[color:var(--text-primary)]"
          aria-label="移除"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      )}
    </div>
  )
}

export default function KnowledgeBaseUpload({ open, onClose }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const uploads = useFileUploadStore((s) => s.uploads)
  const addUpload = useFileUploadStore((s) => s.addUpload)
  const removeUpload = useFileUploadStore((s) => s.removeUpload)
  const createSession = useChatSessionStore((s) => s.createSession)

  const uploadList = Object.values(uploads)
  const allDone = uploadList.length > 0 && uploadList.every((t) => ['done', 'duplicate'].includes(t.status))
  const firstDoneSessionId = uploadList.find((t) => t.status === 'done' || t.status === 'duplicate')?.sessionId

  const handleGoToChat = useCallback(() => {
    if (firstDoneSessionId) {
      navigate(`/chat/${firstDoneSessionId}`)
    }
    onClose()
  }, [firstDoneSessionId, navigate, onClose])

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return
      const sessionId = await createSession('知识库对话')
      for (const file of Array.from(files)) {
        addUpload(file, sessionId)
      }
    },
    [addUpload, createSession],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      handleFiles(e.dataTransfer.files)
    },
    [handleFiles],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files)
      e.target.value = ''
    },
    [handleFiles],
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-[color:var(--surface)] p-8 shadow-xl">
        {/* 关闭按钮 */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--text-muted)] transition hover:bg-[color:var(--surface-muted)] hover:text-[color:var(--text-primary)]"
          aria-label="关闭"
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l8 8M14 6l-8 8" />
          </svg>
        </button>

        <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-[color:var(--text-primary)]">
          存入知识库
        </h2>
        <p className="mt-1 text-sm text-[color:var(--text-muted)]">
          上传文件并开启新对话
        </p>

        {/* 拖拽上传区域 */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => inputRef.current?.click()}
          className={[
            'mt-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 transition-colors',
            dragOver
              ? 'border-[color:var(--accent-orange)] bg-[color:var(--accent-orange)]/5'
              : 'border-[color:var(--border-subtle)] hover:border-[color:var(--accent-orange)]/60 hover:bg-[color:var(--surface-muted)]/50',
          ].join(' ')}
        >
          <div className={[
            'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
            dragOver
              ? 'bg-[color:var(--accent-orange)]/15 text-[color:var(--accent-orange)]'
              : 'bg-[color:var(--surface-muted)] text-[color:var(--text-muted)]',
          ].join(' ')}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <p className="mt-2.5 text-sm font-medium text-[color:var(--text-secondary)]">
            点击添加或拖拽文件到此处
          </p>
          <p className="mt-1 text-xs text-[color:var(--text-muted)]">
            支持 PDF、TXT、MD 等文档格式
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={handleInputChange}
          className="hidden"
        />

        {/* 文件上传列表 */}
        {uploadList.length > 0 && (
          <div className="mt-5 flex flex-col gap-2 overflow-y-auto">
            {uploadList.map((task) => (
              <FileItem key={task.fileHash} task={task} onRemove={() => removeUpload(task.fileHash)} />
            ))}
          </div>
        )}

        {/* 全部上传完成后，显示跳转按钮 */}
        {allDone && (
          <button
            type="button"
            onClick={handleGoToChat}
            className="mt-5 w-full rounded-lg bg-[color:var(--accent-orange)] px-4 py-2.5 text-center text-[15px] font-medium text-[color:var(--surface)] transition hover:opacity-95"
          >
            开始对话
          </button>
        )}
      </div>
    </div>
  )
}
