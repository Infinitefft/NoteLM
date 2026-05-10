import axios from 'axios'

const request = axios.create({
  baseURL: '/api',
  timeout: 30_000,
})

request.interceptors.response.use(
  (res) => res.data,
  (error) => {
    const msg =
      error.response?.data?.message ?? error.message ?? '请求失败'
    return Promise.reject(new Error(msg))
  },
)

export default request
