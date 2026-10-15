# BOT Omikuji

[English](./README.md)

月夜像素神社里的每日御神签，签运记录在 **BOT Chain 主网**（Chain ID 677）。

纯娱乐应用：除 Gas 外不收费，没有代币、奖品、付费抽奖或任何有经济价值的结果。

![BOT Omikuji 预览](./public/readme-preview.jpg)

## 当前状态

| 项目 | 状态 |
| --- | --- |
| 合约 / 后端 / 前端 | 已完成 |
| 自动化测试（单元、合约、数据库、本地端到端） | 本地全部通过 |
| BOT Chain 主网合约 | 已部署并完成源码验证：[`0x2ecc765e…7b73c`](https://scan.botchain.ai/address/0x2ecc765e201feee88adc81cd4abad62cf327b73c#code)（区块 26794339） |
| 正式网站 | **已上线** https://botchain-omikuji.vercel.app （2026-10-16；首笔主网验证抽签 [`0x36ec…9c6f`](https://scan.botchain.ai/tx/0x36ec858cd24ffacecbbdd413565aeae6f5d2304bbd46cf958397ecdbf81a9c6f)） |

部署记录：[`deployments/botchain-mainnet.json`](./deployments/botchain-mainnet.json)。

## 功能

- 像素神社、巫女动画、樱花粒子与分阶段的抽签仪式（保留原版美术与体验）
- 在 BOT Chain 上发送真实的 `drawFortune` 交易；只有在成功回执中解码出 `FortuneDrawn` 事件后，才会展示签运
- 七种御签（大吉～大凶），每个钱包每天（UTC+8）最多 10 次，由合约强制执行
- 历史记录直接读取合约存储：刷新、重连、换设备都不会丢失，也不依赖后端
- 钱包即账户：用一次免费的钱包签名（SIWE，Chain 677，服务端一次性 nonce，5 分钟过期；不发交易、不花 Gas）登录后，可同步收藏、设置昵称；后端会在链上重新验证每一笔签
- 简体中文 / English 双语界面（i18next），可随时切换；翻译规范见 [`docs/localization-style-guide.md`](./docs/localization-style-guide.md)
- 访客体验：明确标注「未上链」，没有交易哈希，不计入链上数据

## 网络参数

| | |
| --- | --- |
| 网络 | BOT Chain Mainnet |
| Chain ID | 677（`0x2a5`） |
| RPC | https://rpc.botchain.ai |
| 原生币 | BOT |
| 浏览器 | https://scan.botchain.ai |
| 官网 | https://botchain.ai |

## 开发与测试

```bash
npm ci
cp .env.example .env.local
npm run dev

npm run typecheck && npm test && npm run contract:compile && npm run test:contract && npm run build
npm run test:e2e   # 在本机 fork 的节点上用 Chrome 跑真实前端（不是主网验证）
```

未设置 `VITE_CONTRACT_ADDRESS` 时，网站会明确显示「合约未配置」，绝不会回退到旧合约。

## 部署

- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)：合约、Supabase、Vercel 部署步骤
- [docs/RELEASE_CHECKLIST.md](./docs/RELEASE_CHECKLIST.md)：上线与 BOT Chain 验收清单

## 随机性

BOT Chain 的 `block.prevrandao` 是常量，所以合约混合了上一区块哈希、时间戳、发送者和计数器。验证者和模拟者可以预测结果；由于签运没有任何经济价值，这一点可以接受。详见合约中的注释。

## 致谢

游戏、美术与设计：Caro。
