import SparkMD5 from 'spark-md5'

const CHUNK_SIZE = 2 * 1024 * 1024 // 2MB per chunk

self.onmessage = (e: MessageEvent<{ file: File }>) => {
  const { file } = e.data
  const chunks = Math.ceil(file.size / CHUNK_SIZE)
  const spark = new SparkMD5.ArrayBuffer()
  let currentChunk = 0

  const loadNext = () => {
    const reader = new FileReader()
    const start = currentChunk * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, file.size)
    const blob = file.slice(start, end)

    reader.onload = (e) => {
      if (e.target?.result) {
        spark.append(e.target.result as ArrayBuffer)
      }
      currentChunk++

      // 报告进度
      self.postMessage({
        type: 'progress',
        percent: Math.round((currentChunk / chunks) * 100),
      })

      if (currentChunk < chunks) {
        loadNext()
      } else {
        self.postMessage({ type: 'done', hash: spark.end() })
      }
    }

    reader.onerror = () => {
      self.postMessage({ type: 'error', message: '文件读取失败' })
    }

    reader.readAsArrayBuffer(blob)
  }

  loadNext()
}
