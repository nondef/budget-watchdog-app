/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** debug | info | warn | error | fatal — boş ise dev:debug, prod:info */
  readonly VITE_LOG_LEVEL?: string;
  /** auto | on | off */
  readonly VITE_LOG_CONSOLE?: string;
  /** SQL sorgu logu: auto | on | off */
  readonly VITE_DB_LOG?: string;
  /** Yalnızca bu süreyi (ms) aşan sorguları konsola bas; 0 = hepsi */
  readonly VITE_DB_LOG_SLOW?: string;
  /** Transaction satırları: off | summary | verbose */
  readonly VITE_DB_LOG_TX?: string;
  /** Capacitor köprü trafiği: off | logger | console */
  readonly VITE_BRIDGE_LOG?: string;
  /** Ekranlarda gösterilen uygulama adı */
  readonly VITE_APP_NAME?: string;
  /** Uygulama sürümü */
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
