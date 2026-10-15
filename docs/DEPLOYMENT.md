# 部署指南 — BOT Omikuji

按顺序执行：**合约 → Supabase → Vercel → 主网冒烟测试**。



> 需要你本人操作的步骤都标了 🔑。任何时候都不要把私钥或助记词粘贴到聊天、Issue 或代码里。

---

## 0. 准备

- Node.js ≥ 22.13（已在 Node 24 上验证）
- 一个**专用部署钱包**，只放少量 BOT。
  - 部署估算：Gas 约 656,843，按 20 gwei 计约 **0.0131 BOT**（2026-10-15 在主网只读估算）。
  - 建议准备 0.05 BOT，留出余量，也够做几次主网冒烟测试抽签。每次抽签约 0.002–0.003 BOT。
- 准备好以下三个账号：GitHub、Vercel、Supabase。

```bash
npm ci
npm run test:all     # typecheck + 单元/数据库测试 + 合约编译 + 合约测试 + 前端构建
npm run test:e2e     # 可选：本地 fork 端到端（需要 Chrome）
```

---

## 1. 部署合约到 BOT Chain Mainnet

### 1.1 🔑 把部署私钥存进 Hardhat 加密 keystore

```bash
npx hardhat keystore set BOTCHAIN_DEPLOYER_PRIVATE_KEY
```

私钥会以加密形式存在本机，每次使用时都会要求输入 keystore 密码。不要写进 `.env`。

### 1.2 Dry run（不发送任何交易）

```bash
npm run deploy:dry-run
```

脚本会依次检查以下几项，任一不满足都会直接退出：

- RPC 的 Chain ID 是否为 677；
- 是否使用了 `production` 编译配置；
- 部署地址的余额是否足够。

之后打印预计 Gas 和费用，然后停止。

### 1.3 🔑 正式部署（会花费 BOT，需要你确认）

```bash
CONFIRM_MAINNET_DEPLOY=deploy-fortune-contract-to-botchain-677 npm run deploy:dry-run
```

部署成功后，脚本会依次完成：

1. 等待 3 个区块确认；
2. 校验链上 bytecode 与本地编译产物完全一致；
3. 校验 `MAX_DAILY_DRAWS = 10`、`totalDraws = 0`；
4. 写入 `deployments/botchain-mainnet.json`，记录合约地址、部署交易、区块和时间；
5. 打印需要设置的环境变量。

### 1.4 在 BOT Chain Scan（Blockscout）上验证源码

```bash
npm run contract:verify-source -- <合约地址>
```

### 1.5 只读复查

```bash
npm run contract:check
```

### 1.6 提交部署记录

```bash
git add deployments/botchain-mainnet.json
git commit -m "Record BOT Chain Mainnet deployment"
```

---

## 2. Supabase：新建独立项目

请使用专用的 Supabase 项目。schema 把所有链上数据固定为 chain 677，并且会 `revoke` 掉客户端对表的直接写权限。

1. 🔑 在 https://supabase.com/dashboard 新建项目，例如 `botchain-omikuji`，区域建议选新加坡或东京。
2. 关联项目并推送 schema：

   ```bash
   npx supabase login
   npx supabase link --project-ref <新项目 ref>
   npx supabase db push              # 应用 supabase/migrations/20261015000001_botchain_omikuji_init.sql
   ```

3. 设置 Edge Function secrets（`SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 由平台自动注入）：

   ```bash
   npx supabase secrets set CONTRACT_ADDRESS=<合约地址> BOTCHAIN_RPC_URL=https://rpc.botchain.ai ALLOWED_ORIGIN=https://<正式域名>
   ```

4. 部署函数：

   ```bash
   npx supabase functions deploy record-draw --no-verify-jwt
   npx supabase functions deploy wallet-claim
   ```

5. Auth 设置（Dashboard → Authentication）：
   - **Site URL**：`https://<正式域名>`
   - **Redirect URLs**：`https://<正式域名>/profile`、`http://localhost:5173/profile`
   - Email 模板：可以把 `supabase/templates/magic-link.html` 粘贴到 Magic Link 模板，标题使用 `supabase/config.toml` 中的设置。
   - 正式环境建议配置自定义 SMTP，因为 Supabase 默认的发信额度很低。
6. 记下 Project URL 和 **anon public key**，供 Vercel 使用。service_role key 只能留在 Supabase 内部，不要放进 Vercel。

---

## 3. Vercel：新建独立项目

1. 🔑 Vercel Dashboard → **Add New → Project** → 导入 `Kokaro233/botchain-omikuji`。这会创建一个新项目。
2. 构建设置：Framework Preset 选 **Vite**，Build Command 用 `npm run build`，Output Directory 填 `dist`。
3. 在 Production 环境设置以下环境变量：

   | 变量 | 值 |
   | --- | --- |
   | `VITE_CONTRACT_ADDRESS` | 第 1 步得到的合约地址 |
   | `VITE_CONTRACT_DEPLOY_BLOCK` | 部署区块号 |
   | `VITE_SUPABASE_URL` | 新 Supabase 项目 URL |
   | `VITE_SUPABASE_ANON_KEY` | 新项目 anon key |
   | `VITE_WALLETCONNECT_PROJECT_ID` | https://cloud.walletconnect.com 新建项目的 ID（在 Allowlist 里加上正式域名） |
   | `VITE_BOTCHAIN_RPC_URL` | 可留空，默认 `https://rpc.botchain.ai` |

4. Deploy。拿到域名后，回到第 2.5 步和 `ALLOWED_ORIGIN` 更新成正式域名。
5. Preview 环境建议不填 `VITE_CONTRACT_ADDRESS`，让预览站显示「合约未配置」，避免测试流量打到主网合约。

`vercel.json` 已经配置了 SPA 路由回退和基本的安全响应头。HTTPS 由 Vercel 自动提供。

---

## 4. 主网冒烟测试（上线前，必须真人操作）

用你自己的一个钱包，在 PC 和手机钱包内置浏览器上各操作一遍：

1. 打开网站，确认 Footer 显示 `Powered by BOT Chain`，以及合约地址链接。
2. 连接钱包，确认会提示添加或切换到 BOT Chain（677）。
3. 抽一次签，确认结果页链接指向 `scan.botchain.ai/tx/...`，并且交易状态为 Success。
4. 运行 `CONTRACT_ADDRESS=<地址> npm run verify:draw -- <tx hash>`，应输出 `"ok": true`，fortuneId 与页面一致。
5. 刷新页面、清空站点数据、重新连接钱包，历史记录应仍然完整。
6. 注册邮箱账号并绑定钱包，确认「御签收藏」显示已同步。
7. 在 Supabase Table Editor 中查看 `verified_fortune_draws`，应有对应行，`chain_id = 677`。

这些步骤全部通过后，才算「已在 BOT Chain 主网验证通过」。

---

## 回滚

- 前端：在 Vercel 中回滚到上一版本即可。
- 合约：合约不可升级。如果需要修复，重新部署新合约并更新 `VITE_CONTRACT_ADDRESS` / `CONTRACT_ADDRESS`。旧合约的链上记录依然存在；数据库按 `contract_address` 区分新旧合约的数据。
