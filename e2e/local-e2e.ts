// Local end-to-end run of the real frontend against a LOCAL Hardhat node.
//
//   npm run test:e2e              forks current BOT Chain Mainnet state (read-only) into a local node
//   E2E_NO_FORK=1 npm run test:e2e   uses an empty local chain instead
//
// The local node reports chain id 677 so the app accepts it, but it is a simulation on
// this machine: nothing here is sent to BOT Chain Mainnet, and passing does not mean
// mainnet has been verified. Requires Google Chrome.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { createPublicClient, createWalletClient, defineChain, http, type WalletClient } from "viem";
import { BOTCHAIN_RPC_URL, fortuneContractAbi } from "../supabase/functions/_shared/botchain.ts";
import { FORTUNES } from "../src/lib/fortunes.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const SHOTS = process.env.E2E_SHOTS ?? join(ROOT, "e2e/.shots");
const NODE_PORT = 8546;
const RPC = `http://127.0.0.1:${NODE_PORT}`;
const APP_PORT = 5179;
const UNCONFIGURED_PORT = 5180;
const AUTH_PORT = 5181;
// Optional wallet sign-in phase against an ISOLATED staging Supabase project whose
// APP_ORIGIN / redirect URLs are http://localhost:5181. Never point this at production.
const AUTH_SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "";
const AUTH_SUPABASE_KEY = process.env.E2E_SUPABASE_ANON_KEY ?? "";
const localChain = defineChain({ id: 677, name: "Local BOT Chain simulation", nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const publicClient = createPublicClient({ chain: localChain, transport: http(RPC) });
// Filled in once the node is up: the node's first unlocked development account.
let account: { address: `0x${string}` };
let walletClient: WalletClient<ReturnType<typeof http>, typeof localChain, { address: `0x${string}`; type: "json-rpc" }>;

const children: ChildProcess[] = [];
let activePage: Page | null = null;
const results: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function start(command: string, args: string[], env: Record<string, string> = {}) {
  const child = spawn(command, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout?.on("data", (chunk) => { log += chunk; });
  child.stderr?.on("data", (chunk) => { log += chunk; });
  children.push(child);
  return { child, log: () => log };
}

async function waitFor(fn: () => Promise<boolean>, label: string, timeoutMs = 90_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await fn().catch(() => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function viteEnv(contract: string, deployBlock: string) {
  return {
    VITE_CONTRACT_ADDRESS: contract,
    VITE_CONTRACT_DEPLOY_BLOCK: deployBlock,
    VITE_BOTCHAIN_RPC_URL: RPC,
    VITE_SUPABASE_URL: "",
    VITE_SUPABASE_ANON_KEY: "",
    VITE_DEMO_MODE: "false",
  };
}

async function newWalletContext(browser: Browser, mobile = false, language: "zh-CN" | "en" = "zh-CN") {
  const context = await browser.newContext({
    locale: language === "en" ? "en-US" : "zh-CN",
    ...(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } }),
  });
  // The UI language is pinned per context; the language test below switches it in-page.
  await context.addInitScript((lang) => { if (!localStorage.getItem("botchain-omikuji:language")) localStorage.setItem("botchain-omikuji:language", lang); }, language);
  const mock = await readFile(join(ROOT, "e2e/wallet-mock.js"), "utf8");
  await context.addInitScript(`window.__E2E_WALLET__ = ${JSON.stringify({ rpc: RPC, account: account.address, startChainId: "0x1", rpcChainId: "0x2a5" })};\n${mock}`);
  return context;
}

async function connectWallet(page: Page, label: RegExp = /连接钱包/) {
  await page.getByRole("button", { name: label }).first().click();
  await page.getByText("E2E Wallet").first().click();
  try {
    await page.locator(".wallet-button").filter({ hasNotText: label }).first().waitFor({ timeout: 20_000 });
  } catch (error) {
    await page.screenshot({ path: join(SHOTS, "debug-connect.png") });
    console.log("wallet calls:", await page.evaluate(() => (window as unknown as { __E2E_CALLS__?: string[] }).__E2E_CALLS__));
    throw error;
  }
}

async function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

async function readKanji(page: Page) {
  return (await page.locator(".fortune-card h1").first().textContent())?.trim() ?? "";
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const fork = process.env.E2E_NO_FORK !== "1";

  // 1. Local node (optionally forking live BOT Chain state) reporting chain 677.
  const nodeArgs = ["hardhat", "node", "--port", String(NODE_PORT), "--chain-id", "677"];
  if (fork) nodeArgs.push("--fork", process.env.BOTCHAIN_RPC_URL ?? BOTCHAIN_RPC_URL);
  const node = start("npx", nodeArgs);
  await waitFor(async () => (await publicClient.getChainId()) === 677, "local node").catch((error) => { console.error(node.log()); throw error; });
  const [devAddress] = await createWalletClient({ chain: localChain, transport: http(RPC) }).getAddresses();
  account = { address: devAddress };
  walletClient = createWalletClient({ account: devAddress, chain: localChain, transport: http(RPC) });
  check("local node reports chain id 677", true, fork ? `forked BOT Chain Mainnet at block ${await publicClient.getBlockNumber()}` : "empty chain");

  // 2. Deploy the production build of FortuneContract locally.
  const artifact = JSON.parse(await readFile(join(ROOT, "artifacts/contracts/FortuneContract.sol/FortuneContract.json"), "utf8"));
  const deployHash = await walletClient.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode });
  const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  const contract = deployReceipt.contractAddress!;
  check("contract deployed on local node", deployReceipt.status === "success", contract);

  // 3. Frontend dev servers: configured, and one with no contract configured.
  start("npx", ["vite", "--port", String(APP_PORT), "--strictPort", "--host", "127.0.0.1"], viteEnv(contract, deployReceipt.blockNumber.toString()));
  start("npx", ["vite", "--port", String(UNCONFIGURED_PORT), "--strictPort", "--host", "127.0.0.1"], viteEnv("", ""));
  await waitFor(async () => (await fetch(`http://127.0.0.1:${APP_PORT}/`)).ok, "vite");
  await waitFor(async () => (await fetch(`http://127.0.0.1:${UNCONFIGURED_PORT}/`)).ok, "vite (unconfigured)");
  if (AUTH_SUPABASE_URL) {
    start("npx", ["vite", "--port", String(AUTH_PORT), "--strictPort", "--host", "127.0.0.1"], { ...viteEnv(contract, deployReceipt.blockNumber.toString()), VITE_SUPABASE_URL: AUTH_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: AUTH_SUPABASE_KEY });
    await waitFor(async () => (await fetch(`http://127.0.0.1:${AUTH_PORT}/`)).ok, "vite (auth)");
  }

  const browser = await chromium.launch({ channel: "chrome", headless: process.env.E2E_HEADED !== "1" });
  try {
    const app = `http://127.0.0.1:${APP_PORT}`;
    const context = await newWalletContext(browser);
    const page = await context.newPage();
    activePage = page;
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    // Home: branding and ecosystem links.
    await page.goto(app);
    await page.getByText("BOT Chain 网络").waitFor();
    check("home shows BOT Chain branding", (await page.locator("body").innerText()).includes("BOT OMIKUJI"));
    check("footer links to botchain.ai", await page.locator('.ecosystem-strip a[href="https://botchain.ai"]').count() === 1);
    check("footer links to scan.botchain.ai", await page.locator('.ecosystem-strip a[href="https://scan.botchain.ai"]').count() === 1);
    check("ecosystem panel shows configured contract", (await page.locator(".ecosystem-panel").innerText()).toLowerCase().includes(contract.slice(0, 6).toLowerCase()));
    await page.screenshot({ path: join(SHOTS, "desktop-home.png") });

    // Wallet starts on Ethereum (0x1) and has never seen BOT Chain: connecting must add + switch to 677.
    await connectWallet(page);
    const added = await page.evaluate(() => (window as unknown as { __E2E_ADDED_CHAIN__?: { chainId: string; chainName: string; nativeCurrency: { symbol: string }; blockExplorerUrls?: string[] } }).__E2E_ADDED_CHAIN__);
    check("wallet asked to add BOT Chain (0x2a5)", added?.chainId === "0x2a5" && added.chainName === "BOT Chain Mainnet" && added.nativeCurrency.symbol === "BOT", JSON.stringify(added));
    check("added chain uses scan.botchain.ai explorer", Boolean(added?.blockExplorerUrls?.includes("https://scan.botchain.ai")));
    await page.waitForFunction(() => document.querySelector(".connection-pill")?.textContent?.includes("BOT Chain"));
    check("connected on BOT Chain after connect", !(await page.locator(".connection-pill").innerText()).includes("网络错误"));

    // The user later switches the wallet to another network.
    await page.evaluate(() => (window as unknown as { __E2E_SET_CHAIN__: (id: string) => void }).__E2E_SET_CHAIN__("0x1"));
    await page.getByRole("button", { name: "切换到 BOT Chain" }).waitFor({ timeout: 15_000 });
    check("wrong network detected (wallet moved to chain 1)", true);
    check("connection pill warns about wrong network", (await page.locator(".connection-pill").innerText()).includes("网络错误"));

    // First real draw through the UI: switch back -> preflight -> tx -> receipt -> event -> result.
    await page.goto(`${app}/draw`);
    await page.getByRole("button", { name: /开始祈愿/ }).click();
    await page.waitForURL("**/result", { timeout: 60_000 });
    const switchedBack = await page.evaluate(() => (window as unknown as { __E2E_CALLS__: string[] }).__E2E_CALLS__.filter((method) => method === "wallet_switchEthereumChain").length);
    check("draw switched the wallet back to BOT Chain", switchedBack >= 1);
    const onChain = await publicClient.readContract({ address: contract, abi: fortuneContractAbi, functionName: "getFortuneAt", args: [account.address, 0n] });
    const shown = await readKanji(page);
    check("result card matches contract storage", shown === FORTUNES[Number(onChain.fortuneId)].kanji, `UI ${shown} / chain fortuneId ${onChain.fortuneId}`);
    const txLink = await page.locator(".verification-panel a").getAttribute("href");
    check("result links to the transaction on scan.botchain.ai", Boolean(txLink?.startsWith("https://scan.botchain.ai/tx/0x")), txLink ?? "");
    const receipt = await publicClient.getTransactionReceipt({ hash: txLink!.split("/tx/")[1] as `0x${string}` });
    check("linked transaction succeeded on the local node", receipt.status === "success" && receipt.to?.toLowerCase() === contract.toLowerCase());
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(SHOTS, "desktop-result.png") });

    // Use up today's limit directly on chain, then try once more in the UI.
    for (let i = 0; i < 9; i++) {
      await publicClient.waitForTransactionReceipt({ hash: await walletClient.writeContract({ address: contract, abi: fortuneContractAbi, functionName: "drawFortune", gas: 300_000n }) });
    }
    await page.goto(`${app}/draw`);
    await page.getByText("今日剩余 0 / 10 次").waitFor({ timeout: 15_000 });
    check("draw page shows 0 remaining from contract", true);
    await page.getByRole("button", { name: /开始祈愿/ }).click();
    await page.getByText(/DailyLimitReached/).waitFor({ timeout: 30_000 });
    check("11th draw is refused with DailyLimitReached before any transaction", (await publicClient.readContract({ address: contract, abi: fortuneContractAbi, functionName: "getRecordCount", args: [account.address] })) === 10n);

    // History survives reload and is rebuilt from the contract on a "new device".
    await page.goto(`${app}/collection`);
    await page.waitForFunction(() => document.querySelectorAll(".mini-card").length === 10, null, { timeout: 30_000 });
    check("collection shows all 10 on-chain draws after reload", true);
    await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("botchain-omikuji:")).forEach((key) => localStorage.removeItem(key)));
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll(".mini-card").length === 10, null, { timeout: 30_000 });
    check("history rebuilt from contract after clearing local data", true);
    await page.waitForFunction(() => document.querySelectorAll('.mini-card a[href*="/tx/0x"]').length === 10, null, { timeout: 30_000 }).then(
      () => check("tx hashes recovered from FortuneDrawn logs", true),
      () => check("tx hashes recovered from FortuneDrawn logs", false),
    );
    const records = await publicClient.readContract({ address: contract, abi: fortuneContractAbi, functionName: "getFortunes", args: [account.address, 0n, 50n] });
    const chainKanji = records.map((record) => FORTUNES[Number(record.fortuneId)].kanji).sort().join(",");
    const uiKanji = (await page.locator(".mini-card h2").allTextContents()).map((text) => text.trim()).sort().join(",");
    check("every collection card matches contract storage", chainKanji === uiKanji, uiKanji);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(SHOTS, "desktop-collection.png") });

    // Disconnect and reconnect the wallet.
    await page.evaluate(() => (window as unknown as { ethereum: { request: (args: { method: string }) => Promise<unknown> } }).ethereum.request({ method: "wallet_revokePermissions" }));
    await page.reload();
    await page.getByRole("button", { name: /连接钱包/ }).first().waitFor({ timeout: 15_000 });
    await connectWallet(page);
    await page.goto(`${app}/collection`);
    await page.waitForFunction(() => document.querySelectorAll(".mini-card").length === 10, null, { timeout: 30_000 });
    check("history intact after disconnect + reconnect", true);
    check("no uncaught page errors on desktop", consoleErrors.length === 0, consoleErrors.join(" | "));
    await context.close();

    await englishPhase(browser, app);

    // Mobile layout with the same wallet state.
    const mobile = await newWalletContext(browser, true);
    const phone = await mobile.newPage();
    for (const route of ["", "draw", "collection", "profile"]) {
      await phone.goto(`${app}/${route}`);
      await phone.waitForTimeout(1800);
      check(`mobile /${route} has no horizontal overflow`, await noHorizontalOverflow(phone));
      await phone.screenshot({ path: join(SHOTS, `mobile-${route || "home"}.png`) });
    }
    check("mobile shows BOT Chain links in page content", await phone.goto(app).then(() => phone.locator('.ecosystem-panel a[href="https://scan.botchain.ai"]').count()) >= 1);
    await mobile.close();

    // Without a configured contract the app must say so and only offer off-chain guest draws.
    const legacy = await newWalletContext(browser);
    const legacyPage = await legacy.newPage();
    const touchedLegacy: string[] = [];
    legacyPage.on("request", (request) => { if (/"eth_(call|sendTransaction|sendRawTransaction)"/.test(request.postData() ?? "")) touchedLegacy.push(request.url()); });
    await legacyPage.goto(`http://127.0.0.1:${UNCONFIGURED_PORT}/draw`);
    await legacyPage.getByText("BOT Chain 主网合约尚未配置").waitFor();
    check("no contract configured → unconfigured state", (await legacyPage.locator(".demo-badge").innerText()).includes("合约未配置"));
    await legacyPage.getByRole("button", { name: /开始祈愿/ }).click();
    await legacyPage.waitForURL("**/result", { timeout: 30_000 });
    check("unconfigured draw is an off-chain guest result", (await legacyPage.locator(".verification-panel").innerText()).includes("未上链") && await legacyPage.locator(".verification-panel a").count() === 0);
    check("app made no contract calls or transactions", touchedLegacy.length === 0, touchedLegacy.join(","));
    await legacyPage.goto(`http://127.0.0.1:${UNCONFIGURED_PORT}/collection`);
    await legacyPage.waitForTimeout(1500);
    check("guest trial is not shown in the collection", await legacyPage.locator(".mini-card").count() === 0);
    await legacyPage.locator(".lang-toggle").click();
    await legacyPage.goto(`http://127.0.0.1:${UNCONFIGURED_PORT}/draw`);
    await legacyPage.getByText("The BOT Chain Mainnet contract isn't configured yet").waitFor({ timeout: 10_000 }).then(() => check("[en] unconfigured state is explained in English", true), () => check("[en] unconfigured state is explained in English", false));
    await legacyPage.waitForTimeout(1500);
    await legacyPage.screenshot({ path: join(SHOTS, "desktop-unconfigured-result.png") });
    await legacy.close();

    if (AUTH_SUPABASE_URL) await walletAuthPhase(browser);
  } catch (error) {
    if (activePage && !activePage.isClosed()) {
      await activePage.screenshot({ path: join(SHOTS, "debug-failure.png") }).catch(() => undefined);
      const dialogue = await activePage.locator(".dialogue-panel").innerText({ timeout: 1000 }).catch(() => "");
      if (dialogue) console.log("dialogue panel:", dialogue);
      const toast = await activePage.locator(".toast-message").innerText({ timeout: 1000 }).catch(() => "");
      if (toast) console.log("toast:", toast);
    }
    throw error;
  } finally {
    await browser.close();
  }
}

/** The same wallet (10 draws used today) in English: copy, errors, cards and the language switch. */
async function englishPhase(browser: Browser, app: string) {
  const context = await newWalletContext(browser, false, "en");
  const page = await context.newPage();
  activePage = page;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app);
  await page.getByText("BOT Chain network").waitFor();
  check("[en] home renders in English", await page.evaluate(() => document.documentElement.lang) === "en" && (await page.title()).includes("Daily fortunes on BOT Chain"));
  await connectWallet(page, /Connect wallet/);
  await page.goto(`${app}/draw`);
  await page.getByText("0 of 10 left today").waitFor({ timeout: 15_000 });
  check("[en] draw page shows remaining draws from the contract", true);
  await page.getByRole("button", { name: /Make a wish/ }).click();
  await page.getByText(/The contract returned DailyLimitReached/).waitFor({ timeout: 30_000 });
  const englishError = await page.locator(".dialogue-panel").innerText();
  check("[en] daily limit error is English with the reset time", englishError.includes("(UTC+8)") && !/[\u4e00-\u9fff]/.test(englishError), englishError);
  await page.locator(".lang-toggle").click();
  await page.getByText(/合约返回 DailyLimitReached/).waitFor({ timeout: 5_000 });
  check("open error follows a language switch (no reload)", page.url().endsWith("/draw") && await page.evaluate(() => document.documentElement.lang) === "zh-CN");
  await page.locator(".lang-toggle").click();
  await page.goto(`${app}/collection`);
  await page.waitForFunction(() => document.querySelectorAll(".mini-card").length === 10, null, { timeout: 30_000 });
  const names = (await page.locator(".mini-card h3").allTextContents()).map((text) => text.trim());
  check("[en] collection cards use English fortune levels", names.every((name) => /Blessing|Misfortune/.test(name)), names.join(", "));
  await page.locator(".mini-card").first().click();
  await page.waitForURL("**/result");
  const card = await page.locator(".fortune-card").innerText();
  check("[en] result card shows kanji, English level and verse", /[\u4e00-\u9fff]/.test(await readKanji(page)) && /Blessing|Misfortune/.test(card) && /Work[\s\S]*Love[\s\S]*Wealth/.test(card));
  check("[en] verification panel is English", (await page.locator(".verification-panel").innerText()).includes("On-chain record"));
  await page.screenshot({ path: join(SHOTS, "desktop-result-en.png") });
  check("[en] no uncaught page errors", errors.length === 0, errors.join(" | "));
  await context.close();
}

async function walletAuthPhase(browser: Browser) {
  // Supabase SIWE accepts "localhost:<port>" but not an IP address as the domain.
  const app = `http://localhost:${AUTH_PORT}`;
  const [, second] = await createWalletClient({ chain: localChain, transport: http(RPC) }).getAddresses();
  const context = await newWalletContext(browser);
  const page = await context.newPage();
  activePage = page;
  page.on("response", async (response) => {
    if (response.url().startsWith(AUTH_SUPABASE_URL) && response.status() >= 400) {
      console.log(`  [supabase ${response.status()}] ${response.url().replace(AUTH_SUPABASE_URL, "")} ${(await response.text().catch(() => "")).slice(0, 200)}`);
    }
  });
  page.on("console", async (message) => {
    if (message.type() !== "error") return;
    const args = await Promise.all(message.args().map((arg) => arg.jsonValue().catch(() => "?")));
    console.log(`  [console] ${args.map((a) => String(a).slice(0, 120)).join(" | ").slice(0, 400)}`);
  });
  const authKey = () => page.evaluate(() => localStorage.getItem("botchain-omikuji:auth"));
  const signedIn = () => page.getByText("已通过钱包签名登录").isVisible();
  await page.goto(app);
  await connectWallet(page);
  await page.goto(`${app}/profile`);
  await page.getByRole("button", { name: "签名登录" }).waitFor({ timeout: 20_000 });
  check("connected wallet is NOT signed in until it signs", !(await signedIn()) && !(await authKey()));

  await page.evaluate(() => { (window as unknown as { __E2E_REJECT_SIGN__: boolean }).__E2E_REJECT_SIGN__ = true; });
  await page.getByRole("button", { name: "签名登录" }).click();
  await page.getByText("你取消了签名").waitFor({ timeout: 20_000 });
  check("cancelled signature leaves the user signed out", !(await signedIn()));

  await page.getByRole("button", { name: "签名登录" }).click();
  await page.getByText("已通过钱包签名登录").waitFor({ timeout: 40_000 });
  const calls = await page.evaluate(() => (window as unknown as { __E2E_CALLS__: string[] }).__E2E_CALLS__);
  check("wallet sign-in: one personal_sign, no transaction", calls.filter((m) => m === "personal_sign").length === 2 && !calls.includes("eth_sendTransaction"));
  await page.reload();
  await page.getByText("已通过钱包签名登录").waitFor({ timeout: 30_000 });
  check("signed-in wallet session survives a reload", true);

  await page.evaluate((next) => (window as unknown as { __E2E_SET_ACCOUNT__: (a: string) => void }).__E2E_SET_ACCOUNT__(next), second);
  await page.getByRole("button", { name: "签名登录" }).waitFor({ timeout: 20_000 });
  await page.waitForFunction(() => !localStorage.getItem("botchain-omikuji:auth"), null, { timeout: 15_000 }).catch(() => undefined);
  check("switching to another wallet ends the previous account session", !(await signedIn()) && !(await authKey()), `signedIn=${await signedIn()} authKey=${Boolean(await authKey())}`);
  check("profile now shows the new wallet", (await page.locator(".wallet-record").innerText()).toLowerCase().includes(second.slice(0, 6).toLowerCase()));

  await page.evaluate((next) => (window as unknown as { __E2E_SET_ACCOUNT__: (a: string) => void }).__E2E_SET_ACCOUNT__(next), account.address);
  await page.waitForTimeout(1500);
  check("switching back does not silently restore the old session", !(await signedIn()));

  await page.getByRole("button", { name: "签名登录" }).click();
  await page.getByText("已通过钱包签名登录").waitFor({ timeout: 40_000 });
  await page.evaluate(() => (window as unknown as { ethereum: { request: (a: { method: string }) => Promise<unknown> } }).ethereum.request({ method: "wallet_revokePermissions" }));
  await page.waitForFunction(() => !localStorage.getItem("botchain-omikuji:auth"), null, { timeout: 20_000 }).then(() => check("disconnecting the wallet signs the account out", true), () => check("disconnecting the wallet signs the account out", false));
  await page.screenshot({ path: join(SHOTS, "auth-profile.png") });

  // English sign-in copy: the cancel message must still say it was free and sent nothing.
  await page.locator(".lang-toggle").click();
  await connectWallet(page, /Connect wallet/);
  await page.goto(`${app}/profile`);
  await page.evaluate(() => { (window as unknown as { __E2E_REJECT_SIGN__: boolean }).__E2E_REJECT_SIGN__ = true; });
  await page.getByRole("button", { name: "Sign in with wallet" }).click();
  await page.getByText("You cancelled the signature").waitFor({ timeout: 20_000 }).then(() => check("[en] cancelled sign-in is explained in English", true), () => check("[en] cancelled sign-in is explained in English", false));
  await context.close();
}

try {
  await main();
} catch (error) {
  check("e2e run completed", false, error instanceof Error ? `${error.message}\n${(error as { details?: string }).details ?? ""}\n${error.stack?.split("\n").slice(0, 6).join("\n")}` : String(error));
} finally {
  for (const child of children) child.kill("SIGTERM");
}
const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${SHOTS}`);
console.log("Local simulation only — not a BOT Chain Mainnet verification.");
process.exit(failed.length ? 1 : 0);
