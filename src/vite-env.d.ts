/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TARGET?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_ENABLE_DEMO_MODE?: string;
  readonly VITE_DEMO_ACCOUNT_PASSWORD?: string;
  readonly [key: string]: any;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
