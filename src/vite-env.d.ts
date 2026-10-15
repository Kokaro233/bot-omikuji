/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONTRACT_ADDRESS?: string;
  readonly VITE_CONTRACT_DEPLOY_BLOCK?: string;
  readonly VITE_BOTCHAIN_RPC_URL?: string;
  readonly VITE_BOTCHAIN_EXPLORER_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_DEMO_MODE?: string;
  readonly VITE_ENABLE_GOOGLE_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
