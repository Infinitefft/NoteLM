import axios from 'axios'

const instance = axios.create({
  baseURL: '/api',
  timeout: 30_000,
})

instance.interceptors.response.use(
  (res) => res.data,
  (error) => {
    const msg =
      error.response?.data?.message ?? error.message ?? '请求失败'
    return Promise.reject(new Error(msg))
  },
)

export default instance
