import axios from 'axios'

/** 조회 API 주소(백엔드 개발 서버) */
export const API_BASE_URL = 'http://localhost:8080/api/v1'

/**
 * 대시보드 조회용 axios 인스턴스.
 * 2초마다 다시 부르므로 응답이 늦으면 오래 기다리지 않고 실패로 처리한다.
 */
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 3000,
})
