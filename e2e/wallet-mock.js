// Minimal injected EIP-1193 wallet for local end-to-end tests. It is announced via
// EIP-6963 as "E2E Wallet", starts on the wrong network (Ethereum, 0x1), only learns
// chain 0x2a5 through wallet_addEthereumChain, and forwards everything else to the
// local Hardhat node (whose accounts are unlocked). Like MetaMask, adding a chain also
// switches to it. Never shipped in the app bundle.
(() => {
  const cfg = window.__E2E_WALLET__;
  const store = {
    get: (key, fallback) => { try { return localStorage.getItem(`e2e-wallet:${key}`) ?? fallback; } catch { return fallback; } },
    set: (key, value) => { try { localStorage.setItem(`e2e-wallet:${key}`, value); } catch { /* ignore */ } },
  };
  let chainId = store.get("chain", cfg.startChainId);
  const known = new Set(JSON.parse(store.get("known", JSON.stringify([cfg.startChainId]))));
  let connected = store.get("connected", "0") === "1";
  let account = store.get("account", cfg.account);
  const listeners = {};
  const emit = (event, data) => (listeners[event] || []).forEach((fn) => fn(data));
  const fail = (code, message) => Object.assign(new Error(message), { code });
  let id = 0;

  async function rpc(method, params) {
    const response = await fetch(cfg.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
    const body = await response.json();
    if (body.error) throw Object.assign(new Error(body.error.message), { code: body.error.code, data: body.error.data });
    return body.result;
  }

  const provider = {
    async request({ method, params = [] }) {
      (window.__E2E_CALLS__ ||= []).push(method);
      switch (method) {
        case "eth_requestAccounts":
          connected = true; store.set("connected", "1");
          emit("connect", { chainId });
          return [account];
        case "eth_accounts": return connected ? [account] : [];
        case "eth_chainId": return chainId;
        case "net_version": return String(parseInt(chainId, 16));
        case "wallet_switchEthereumChain": {
          const target = String(params[0].chainId).toLowerCase();
          if (!known.has(target)) throw fail(4902, "Unrecognized chain ID");
          chainId = target; store.set("chain", chainId);
          emit("chainChanged", chainId);
          return null;
        }
        case "wallet_addEthereumChain":
          window.__E2E_ADDED_CHAIN__ = params[0];
          known.add(String(params[0].chainId).toLowerCase());
          store.set("known", JSON.stringify([...known]));
          chainId = String(params[0].chainId).toLowerCase(); store.set("chain", chainId);
          emit("chainChanged", chainId);
          return null;
        case "wallet_requestPermissions": return [{ parentCapability: "eth_accounts" }];
        case "wallet_getPermissions": return connected ? [{ parentCapability: "eth_accounts" }] : [];
        case "wallet_revokePermissions":
          connected = false; store.set("connected", "0");
          emit("accountsChanged", []);
          return null;
        case "personal_sign":
          if (window.__E2E_REJECT_SIGN__) { window.__E2E_REJECT_SIGN__ = false; throw fail(4001, "User rejected the request."); }
          return rpc(method, params);
        case "eth_sendTransaction":
          if (chainId !== cfg.rpcChainId) throw fail(4901, "Wallet is on a different chain");
          return rpc(method, params);
        default:
          return rpc(method, params);
      }
    },
    on(event, fn) { (listeners[event] ||= []).push(fn); return provider; },
    removeListener(event, fn) { listeners[event] = (listeners[event] || []).filter((item) => item !== fn); return provider; },
  };

  window.ethereum = provider;
  // Test hook: the user switches network inside the wallet.
  window.__E2E_SET_CHAIN__ = (next) => { chainId = next; store.set("chain", chainId); emit("chainChanged", chainId); };
  // Test hook: the user picks another account inside the wallet.
  window.__E2E_SET_ACCOUNT__ = (next) => { account = next; store.set("account", next); emit("accountsChanged", [next]); };
  const info = {
    uuid: "0b7c2b1e-0000-4000-8000-0000000e2e01",
    name: "E2E Wallet",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23c9782f'/%3E%3C/svg%3E",
    rdns: "dev.omikuji.e2e",
  };
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
})();
