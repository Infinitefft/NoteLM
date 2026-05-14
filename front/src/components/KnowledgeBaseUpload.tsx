import { useCallback, useRef, useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
}

export default function KnowledgeBaseUpload({ open, onClose }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    // TODO: 实际上传逻辑后续接入
    console.log('上传文件:', Array.from(files).map((f) => f.name))
  }, [])

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
      // 重置以便再次选同一文件
      e.target.value = ''
    },
    [handleFiles],
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl bg-[color:var(--surface)] p-8 shadow-xl">
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
          上传文件以构建你的知识库
        </p>

        {/* 拖拽上传区域 */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => inputRef.current?.click()}
          className={[
            'mt-6 flex h-52 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors',
            dragOver
              ? 'border-[color:var(--accent-orange)] bg-[color:var(--accent-orange)]/5'
              : 'border-[color:var(--border-subtle)] hover:border-[color:var(--accent-orange)]/60 hover:bg-[color:var(--surface-muted)]/50',
          ].join(' ')}
        >
          {/* 加号图标 */}
          <div className={[
            'flex h-14 w-14 items-center justify-center rounded-full transition-colors',
            dragOver
              ? 'bg-[color:var(--accent-orange)]/15 text-[color:var(--accent-orange)]'
              : 'bg-[color:var(--surface-muted)] text-[color:var(--text-muted)]',
          ].join(' ')}>
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <p className="mt-3 text-sm font-medium text-[color:var(--text-secondary)]">
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
      </div>
    </div>
  )
}
