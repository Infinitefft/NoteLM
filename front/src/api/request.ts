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

type UnwrapAxios<T> = T extends axios.AxiosResponse<infer D> ? D : T

const request = {
  get<T = unknown>(url: string, config?: object) {
    return instance.get<unknown, T>(url, config) as Promise<UnwrapAxios<T>>
  },
  post<T = unknown>(url: string, data?: unknown, config?: object) {
    return instance.post<unknown, T>(url, data, config) as Promise<UnwrapAxios<T>>
  },
  put<T = unknown>(url: string, data?: unknown, config?: object) {
    return instance.put<unknown, T>(url, data, config) as Promise<UnwrapAxios<T>>
  },
  delete<T = unknown>(url: string, config?: object) {
    return instance.delete<unknown, T>(url, config) as Promise<UnwrapAxios<T>>
  },
}

export default request
