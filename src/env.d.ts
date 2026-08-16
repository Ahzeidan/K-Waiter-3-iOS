/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_VERSION?: string;
  readonly VITE_REQUEST_TIMEOUT_MS?: string;
  readonly VITE_DEMO_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
