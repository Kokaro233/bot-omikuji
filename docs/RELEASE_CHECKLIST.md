# Release Checklist — BOT Omikuji

状态标记：`[ ]` 未做 · `[x]` 已完成（附证据）。只有拿到证据后才能打勾。

## A. 代码与测试（本地）

- [x] typecheck / 单元 / 数据库 RLS / 合约 / 构建测试全部通过（`npm run test:all`）
- [x] 本地 fork 端到端 31/31 通过（`npm run test:e2e`）。这是本机模拟，**不代表**主网已验证
- [x] 代码合入 `main`，Vercel 生产构建 Ready

## B. 合约（BOT Chain Mainnet）

- [x] 部署钱包 `0xc106…7aac` 由 BOT Chain 团队充值 2 BOT
- [x] 主网 Gas 估算 656,843（≈0.0131 BOT）；改用 MetaMask 签名部署（`scripts/metamask-deploy.ts`），本地演练通过
- [x] 已部署：`0x2ecc765e201feee88adc81cd4abad62cf327b73c`，tx `0x757dd4ca…789f`，区块 26794339，实际费用 0.01301 BOT
- [x] `deployments/botchain-mainnet.json` 已提交（创建字节码与运行时字节码均与产物一致）
- [x] BOTScan 源码验证通过
- [x] 合约读取正常：MAX_DAILY_DRAWS=10、FORTUNE_COUNT=7

## C. 后端（新 Supabase 项目）

- [x] 新项目 `botchain-omikuji`（`yvdigcvyusmvqrbowspu`，Singapore）
- [x] migration `20261015000001` 已应用
- [x] secrets 已设置：`CONTRACT_ADDRESS`、`BOTCHAIN_RPC_URL`、`ALLOWED_ORIGIN`
- [x] `record-draw`（no-verify-jwt）和 `wallet-claim` 已部署且 ACTIVE
- [x] Auth 的 Site URL 与 Redirect URLs 指向正式域名
- [ ] 邮件：免费套餐只能用默认登录链接邮件、额度低；计划改为钱包即账号（Wallet-first），邮箱不再是必需项

## D. 前端（新 Vercel 项目）

- [x] 独立的 Vercel 项目 `botchain-omikuji`，已连接 GitHub
- [x] Production 环境变量齐全（WalletConnect ID 除外）
- [x] https://botchain-omikuji.vercel.app 可访问（HSTS、nosniff、DENY framing）
- [ ] WalletConnect Project ID 尚未配置（扫码连接不可用；插件与钱包内置浏览器可用）

## E. 主网冒烟测试（真人、真钱包）

- [x] PC + MetaMask：错误网络 → 切换 → 拒绝交易提示 → 抽签成功：tx `0x36ec858cd24ffacecbbdd413565aeae6f5d2304bbd46cf958397ecdbf81a9c6f`（末吉，费用 0.00316 BOT）
- [ ] 手机钱包内置浏览器真机测试（线上移动端布局已自动检查）
- [x] `verify:draw` 返回 ok：事件、合约存储、页面一致
- [x] 全新浏览器（无本地数据）连接钱包后从合约恢复历史，刷新后保持
- [ ] 邮箱登录 + 钱包绑定：未做真人验收，将由钱包签名登录替代
- [x] `verified_fortune_draws` 已自动写入该笔，`chain_id = 677`；重复提交不产生新行

完成 E 后，才能对外说「已在 BOT Chain 主网上线」。

## F. 正式上线公告（E 完成后）

- [ ] 用项目 X 或个人 X 发布上线公告，标记 **@Roy4by4** 和 **@Josh_0zh**
- [ ] 公告中附上网站 URL、合约地址的 scan.botchain.ai 链接
- [ ] 记录实际上线日期：`2026-10-16`（网站与首笔主网抽签验证完成；公告待发）

公告草稿（发布前替换占位符）：

> ⛩️ Omikuji is now live on @BOTChain Mainnet!
> Draw your daily pixel-shrine fortune — every draw is a real on-chain transaction you can verify on BOT Chain Scan.
> 🌸 <APP_URL>
> 📜 Contract: https://scan.botchain.ai/address/<CONTRACT>
> Thanks @Roy4by4 @Josh_0zh for the support!

## G. BOT Chain 官方验收材料

| 项目 | 值 | 来源 |
| --- | --- | --- |
| Mainnet Contract Address | `0x2ecc765e201feee88adc81cd4abad62cf327b73c` | `deployments/botchain-mainnet.json` |
| Deployment Transaction Hash | `0x757dd4cab165cf4d722a97e3d23fc7baf48b4bbe655cc4b61d22c3fc671e789f` | 同上 |
| Successful Core Function Transaction Links | https://scan.botchain.ai/tx/0x36ec858cd24ffacecbbdd413565aeae6f5d2304bbd46cf958397ecdbf81a9c6f （自测）；上线后补充真实用户交易 | 主网 `drawFortune` 交易 |
| Working Application URL | https://botchain-omikuji.vercel.app | Vercel 正式域名 |
| Actual Launch Date | 2026-10-16 | |

## H. 上线后 7 天内的运营指标

目标：至少 3 个不同的真实用户钱包，至少 5 笔有效的 `drawFortune` 交易。

统计方式（只读）：
- Blockscout：合约地址页 → Transactions，按 From 去重。
- 或 Supabase SQL：`select count(distinct wallet_address), count(*) from verified_fortune_draws where contract_address = '<地址小写>';`
- 合约 `totalDraws()` 是链上总次数。

**禁止：**用自己控制的多个钱包刷交易、伪造用户、编造交易哈希、在未上线时发布上线公告。自测钱包的交易可以作为「核心功能交易链接」的证据，但**不计入**「真实用户」。

- [ ] 第 7 天复核数据并截图
- [ ] 提交最终表单：https://forms.gle/vJtpMpmsYuP8zGAh9
