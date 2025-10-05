import axios from 'axios';

const baseURL =
  process.env.REACT_APP_BACKEND_URL?.replace(/\/$/, '') ?? 'http://localhost:5001';

export const httpClient = axios.create({
  baseURL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
});

httpClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error?.response?.data?.message ??
      error?.message ??
      'Unexpected error while contacting the Mobius API.';
    return Promise.reject(new Error(message));
  }
);