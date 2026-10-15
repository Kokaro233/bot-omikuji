# BOT Omikuji 本地化规范（简体中文 / English）

状态：**v1.1，翻译方向已由项目负责人确认**（2026-10-16）。已按本规范实现，见 `src/i18n/`；最终定稿的签文见 §11。
适用范围：网站全部界面文案、七种签运、签文、巫女对话、技术提示、Metadata 与分享文案。

> 本规范只借鉴参考资料的**方法**。所有英文文案都是本项目原创，不复制任何参考来源的签文或说明。

---

## 0. 参考资料与采用方式

| 来源 | 性质 | 读到的要点（本人已阅读原始页面） | 本项目的采用方式 |
|---|---|---|---|
| David Chart, *Bilingual Omikuji*（mimusubi.com, 2024-10-22） | **专业译者**。作者经由神社本厅，为女子道社（Joshidōsha）翻译整套双语御神签 | 吉 译为 **"Bright Fortune"**；认为 "Big Good Fortune / Small Good Fortune" 这类直译 "sound a bit rubbish"；签诗与解说合并，用诗中意象承载要点；承认这样做会让等级排序变模糊 | 采纳「意象优先、不要机械加程度词」的原则。**不完全照搬**：本项目的等级来自合约，顺序必须清楚，因此保留明确的等级梯度 |
| 明治神宫官方英文页（feelshinto/4） | **官方神社资料** | 该社御神签不分吉凶，而是 30 首明治天皇和昭宪皇太后的和歌，英文称 "oracle"；语气克制、带邀请感（"It is hoped that…"） | 学习其语气：温和、不夸张、不承诺结果。该社**不使用吉凶等级**，不能拿来当吉凶译名的依据 |
| 京都市官方旅游网（kyoto.travel） | **官方地方政府文化介绍** | 七级英文为 great blessing / blessing / middle blessing / small blessing / future blessing / **curse** / great curse；说明数量、顺序与概率「因寺社而异」，伏见稻荷多达 17 种 | 采纳 **"Blessing"** 作为吉系词根。不采纳 "curse"（见 §3）。采纳「顺序因寺社而异」的说明 |
| 神社本厅英文手册 *Jinja: Heart of Japan*（2020，PDF 原文） | **官方神道组织** | **kami 不翻译**（小写、正体、复数也写 kami）；miko 解释为 "female attendants"；栏目写作 "Fortunes (Omikuji)"、"Amulets (Omamori)"、"Votive Tablets (Ema)" | 采纳 kami 不译、不加斜体；采纳「英文 + 括号罗马字」的首次出现格式 |
| omikuji.co.jp（OMIKUJI Project） | **商业产品**（休闲双语签） | Truly Marvelous / Excellent / Very Good / Moderately Good / Slightly Good / Uncertain Luck；英文偏营销口吻，有误拼 | 仅作反例参考：营销腔和 "Luck" 系列不适合神社氛围 |
| PickJa（pickja.com/fortune/omikuji） | **第三方文化/游戏网站** | 大吉 Great good fortune、小吉 Small good fortune、吉 Good fortune、末吉 Good fortune to come、凶 **Ill fortune**；强调保留原诗意象（云、香、旅途、山），并声明签不是对人生的保证 | 采纳 "ill" 表达凶的思路，以及「签是文化文本、不是预言」的免责口吻 |

---

## 1. 整体语气

### 1.1 三种声音，严格区分

| 声音 | 用在 | 中文 | English |
|---|---|---|---|
| **巫女 / 签文**（仪式与文学） | 抽签对话、签文、首页引语、结果页祝词 | 含蓄、简短、有意象，不说教 | 温柔、克制、留白。少用感叹号；不用 "you've got this" 一类鼓劲话；不用奇幻史诗腔 |
| **界面**（导航与说明） | 按钮、标题、统计、空状态 | 平实、简洁 | Plain English，按钮用动词开头，sentence case |
| **技术提示**（必须准确） | 钱包、网络、交易、Gas、签名、错误 | 准确第一，不文学化 | 写清**发生了什么、有没有花钱、下一步怎么做**。不用比喻 |

只要信息涉及资金、交易或安全，一律使用技术提示的声音，即使它出现在仪式画面中。

### 1.2 英文要避免的四种腔调

1. **直译腔**：例如 "Your wish has been conveyed to the shrine"（逐字对应「传达至神社」）。
2. **AI 励志鸡汤**：例如 "Great things are coming your way. Stay positive and keep going!"（这正是当前站内的英文，需要替换）。
3. **营销腔**：例如 "Unlock your destiny!"、"Truly Marvelous Luck!"
4. **奇幻史诗腔**：例如 "The ancient gods have spoken, mortal."

### 1.3 真实习俗与游戏原创要分开

- **真实习俗**（可以照实描述）：在寺社求签；签上有吉凶等级；吉凶的种类与顺序因寺社而异；可以把签带回或系在寺社指定的地方。
- **本作原创**（英文不能写成「日本传统如此」）：链上抽签、每日 10 次上限、SSR/SR/R 稀有度、「事业 / 姻缘 / 财运」的星级评分、御签收藏。
- 首次提到时可以说明：*"In Omikuji, your draw is recorded on BOT Chain."* 不要写 *"Traditionally, omikuji are recorded…"*。
- 不说签文「预言」未来。不写 *"This will happen to you."*

---

## 2. 术语表

| 中文 | English（界面） | 说明 |
|---|---|---|
| 御神签 / 御签 / 签 | **omikuji**（复数同形）；称呼单张时用 *fortune* 或 *slip* | 正文小写正体，不加斜体（与神社本厅一致）。品牌名写 "BOT Omikuji" |
| 抽签 / 求签 | **draw (a fortune)** | "Draw a fortune"、"Draw again"。不用 "pull"、"roll"、"gacha" |
| 神社 | **shrine** | 面向一般读者用 shrine。只有解释文化时可以写 "shrine (jinja)" |
| 神明 / 神 | **the kami** | 不译成 "god"/"gods"（神社本厅做法）。巫女台词中可以出现，界面说明中少用 |
| 巫女 | **shrine maiden**；文化说明里可写 *miko* | 首次出现："the shrine maiden (miko)" |
| 签文 | **the fortune's words / verse** | 指签上的文字。本作签文是现代短句，不叫 *waka* |
| 吉凶等级 | **fortune level** | 七级译名见 §3 |
| 事业 / 姻缘 / 财运 | **Work / Love / Wealth** | 三项均为本作原创评分。用短词以适应卡片宽度 |
| 祈愿 | **make a wish**（巫女台词中可用 *prayer*） | 「祈愿仪式」→ "the ritual" |
| 御签收藏 / 御签阁 | **Collection** / "My Omikuji" | 导航用 *Collection* |
| 最近御签 | **Latest fortune** | |
| 我的 | **Profile** | 未来升级为 My Shrine 时再改 |
| 访客体验 | **Guest draw (not on-chain)** | 每处都必须带上 "not on-chain" 或等价说明 |
| 链上 | **on-chain** / "on BOT Chain" | |
| 正式上链 | **On-chain draw** | |
| 交易 | **transaction** | 不能为了诗意写成 "offering" |
| Gas 费 | **gas fee**（金额后加 BOT） | |
| 钱包签名登录 | **Sign in with your wallet** | 必须说明：*free, no transaction, no gas* |
| 连接钱包 | **Connect wallet** | |
| 切换网络 | **Switch to BOT Chain** | |
| 区块确认 | **confirmation** | "Waiting for confirmation on BOT Chain…" |
| 稀有度 SSR/SR/R | **SSR / SR / R**（不翻译） | 游戏术语 |
| BOT Chain / BOTScan | 不翻译 | 网络名写 "BOT Chain Mainnet" |

---

## 3. 七种签运的译法

### 3.1 翻译策略

- **卡片保留汉字**作为主视觉，这是美术的一部分，任何语言下都显示。英文模式在汉字下方只显示**英文等级名**和英文签文；中文模式显示中文副标题和中文签文。
- **不在卡片上同时堆叠汉字、英文和罗马字**（负责人确认）：视觉层级与手机可读性优先。罗马字只放在汉字的悬停提示（`title`）里，并可用于收藏搜索。
- **等级名用一个词根表示梯度**：吉系统一用 *Blessing*（与京都市官方用词一致），凶系用 *Misfortune*。这样英语读者不需要懂日语也能看出高低。
- 不使用 *Luck*：语气偏休闲、偏营销，见 omikuji.co.jp。
- 不使用 *curse*：京都市官方用了 curse，但在英语里 curse 指「被人施咒、恶意诅咒」，而凶的本义是「不吉、宜慎」。凶没有恶意的意味，用 curse 会改变原意并制造恐惧。
- 不沿用当前站内的 *Caution / Great Caution*：它们把凶「软化」成了建议，改变了吉凶等级的原意。安慰性的内容应放在签文里，不放在等级名上。
- 当前的英文名 *Rising Fortune*（中吉）、*Gentle Blessing*（小吉）、*Future Fortune*（末吉）同样存在问题：前两个改变了程度含义，后者用词不统一。
- **顺序**：本作的顺序由合约固定，为 大吉 > 中吉 > 小吉 > 吉 > 末吉 > 凶 > 大凶。说明页需注明 *"Shrines rank these differently; this is the order used in Omikuji."*（依据：京都市官方说明「因寺社而异」）。

### 3.2 候选与推荐

| 汉字 | 罗马字 | 中文副标题（保留现有） | 候选 A（推荐） | 候选 B | 不采用 |
|---|---|---|---|---|---|
| 大吉 | Daikichi | 鸿运当头 | **Great Blessing** | Great Fortune | Excellent Luck；Truly Marvelous |
| 中吉 | Chūkichi | 吉运渐升 | **Middle Blessing** | Fair Blessing | Rising Fortune（意思被改动）；Moderately Good Luck |
| 小吉 | Shōkichi | 小福相随 | **Small Blessing** | Modest Blessing | Gentle Blessing（不是程度词）；Slightly Good Luck |
| 吉 | Kichi | 吉祥顺遂 | **Blessing** | Bright Fortune（Chart 译法） | Good Fortune（与 Blessing 词根不统一） |
| 末吉 | Suekichi | 福在后至 | **Blessing Yet to Come** | Late Blessing | Future Fortune；Uncertain Luck（"uncertain" 不是原意） |
| 凶 | Kyō | 谨慎徐行 | **Misfortune** | Ill Fortune（PickJa 译法） | Curse；Caution |
| 大凶 | Daikyō | 静待转机 | **Great Misfortune** | Great Ill Fortune | Great Curse；Great Caution |

**需要你决定的一点**：中吉用 *Middle Blessing* 还是 *Fair Blessing*。

- *Middle* 能准确表示等级梯度，京都市官方也这么用，但英语读起来略显生硬。
- *Fair* 读起来更自然，还隐含「晴好」的意象，但「中等」这层意思会弱一些。
- 我推荐 *Middle Blessing*，因为在这里等级清楚比读起来顺更重要。

---

## 4. 巫女的说话风格

- 人物：年轻、温柔、沉静。主持仪式，不卖萌，不说教。
- 中文：短句，常用「……」留白，少用感叹号。
- 英文：
  - 第二人称 *you*，现在时，句子短。
  - 不用 *Hey*、*Awesome* 之类的口语，也不用古英语（*thee/thou*）。
  - 允许使用 *the kami*。
  - 可以用祈使句，但要轻：*"Breathe slowly."* 而不是 *"Focus!"*
  - 省略号统一用单个字符 *…*，后面不加空格。
- 涉及钱包或交易时，巫女的话也必须包含准确的技术信息（见 §6 样例 4）。

---

## 5. 签文翻译规则

1. **先读懂，再写英文**：先确定中文签文的核心判断，以及它包含的意象（花、月、光、门、路、夜、风……）。
2. **意象保留，不新增**（负责人确认）：可以调整句式、让意象在英文里更自然，但**不引入原文没有的象征、景物或含义**。如果中文本身需要改进，中英文一起改，不只美化英文。
3. **不改变吉凶判断**：大凶的签文可以给出转机，但不能写成好事。
4. **不加内容**：不添加中文没有的承诺，例如 *"you will find love"*。
5. **长度**：英文签文不超过 2 句、约 25 词，以保证卡片排版。
6. **标点**：句号收尾；分号尽量不用；破折号用 em dash（—），两侧不加空格。

---

## 6. 翻译样例（中文原文 → 直译的问题 → 推荐英文 → 理由）

### 样例 1　大吉签文（定稿见 §11，下面保留草案思路）

- **中文原文**：盛运已至，心怀光明，勇敢前行。
- **直译**：*"Great fortune has arrived. Keep brightness in your heart and go forward bravely."*
  - 问题："keep brightness in your heart" 不是英语的说法；三个并列命令句读起来像口号。
  - 现有英文 *"Great things are coming your way. Stay positive and keep going!"* 是典型的励志鸡汤，而且丢掉了「光」这个意象。
- **推荐英文**：*"Your season of fortune has come. Carry its light with you, and step forward without fear."*
- **理由**：
  - 保留「已至」和「光明」两层意思；用 *season* 呼应全套签文的季节意象。
  - 不加感叹号。
  - 「勇敢前行」译成 *step forward without fear*，意思一致，但比 *bravely* 更克制。

### 样例 2　末吉签文

- **中文原文**：花期未至，静候属于你的季节。
- **直译**：*"The flowering period has not arrived; quietly wait for the season that belongs to you."*
  - 问题："flowering period" 是植物学用语，"the season that belongs to you" 是中文结构。
- **推荐英文**：*"The blossoms have not opened yet. Wait quietly — your season is still on its way."*
- **理由**：
  - 「花期」换成 *blossoms*，在日本语境里自然联想到樱花，而且不需要写出 sakura。
  - 「静候」对应 *wait quietly*。
  - 末吉的含义（福气会晚一些来）与等级名 *Blessing Yet to Come* 呼应。

### 样例 3　凶签文

- **中文原文**：今日宜缓，柔韧者不折。
- **直译**：*"Today it is suitable to be slow; the soft and tough do not break."*
  - 问题："the soft and tough" 不成英语，「宜」被译成了 "it is suitable"。
  - 现有英文 *"Move gently today. What bends in the wind does not break."* 方向是对的，但第二句缺少一个具体的画面。
- **定稿英文**：*"Go slowly today. What bends does not break."*
- **理由**：
  - 草案曾建议补入「柳」的意象；负责人确认**不新增原文没有的意象**，因此撤回。
  - *What bends does not break* 本身就是自然的英语说法，准确对应「柔韧者不折」，判断不变：今天不顺，宜放慢。

### 样例 4　巫女对话：钱包确认（仪式声音 + 技术信息）

- **中文原文**：请在钱包中确认这场祈愿仪式。
- **直译**：*"Please confirm this prayer ritual in your wallet."*
  - 问题：用户不知道这一步要签一笔**交易**、会花 **gas**。为了氛围把交易称为 "prayer ritual"，违反「技术信息准确」的要求。
- **推荐英文**：*"Please confirm the transaction in your wallet. It records your draw on BOT Chain and costs a small gas fee."*
- **建议同步调整中文**：请在钱包中确认交易，这笔交易会把你的签记录在 BOT Chain 上，需要少量 Gas。
- **理由**：仪式感留给前后几句台词，这一句必须准确。

### 样例 5　巫女对话：仪式进行中

| 中文 | 直译的问题 | 推荐英文 |
|---|---|---|
| 放缓呼吸，待心绪澄明，便可开始。 | "Slow your breathing; when your mind becomes clear you may start." 读起来像操作说明 | *"Breathe slowly. When your heart is still, we can begin."* |
| 你的愿望，已经传达至神社…… | "conveyed to the shrine" 是直译；在神道语境中，愿望是向 kami 祈求，不是「向建筑物」祈求 | *"Your wish has been offered to the kami…"* |
| 万千道路中，有一条选择了你。 | "Among ten thousand roads, one chose you." 中文的「万千」不需要直译成数字 | *"Of all the paths, one has chosen you."* |
| 神明已作出回应。 | "The gods have made a response." 用了 gods，而且是公文腔 | *"The kami have answered."* |

### 样例 6　技术错误（不文学化）

| 中文 | 推荐英文 |
|---|---|
| 你取消了钱包操作，本次没有发送任何交易。 | *"You cancelled in your wallet. No transaction was sent."* |
| 交易已上链但执行失败（已回滚），本次结果不会被保存。 | *"The transaction was included on BOT Chain but failed (reverted). No fortune was saved."* |
| 钱包中的 BOT 不足以支付 Gas（约需 0.0030 BOT）。 | *"Not enough BOT for the gas fee (about 0.0030 BOT needed)."* |
| 这个钱包今天的十次链上求签机会已经用完… | *"This wallet has used all 10 on-chain draws for today. Draws reset at 00:00 (UTC+8)."* |

---

## 7. 各页面的翻译结构

| 页面 | 结构要点 |
|---|---|
| 首页 | 引语（巫女声音）→ 标题 *BOT Omikuji* → 一句说明（界面声音：*Draw a daily fortune, recorded on BOT Chain.*）→「如何抽签」四步（界面声音）→ 统计（界面）→ 今日祝福（签文声音） |
| 抽签 | 巫女台词（仪式声音）+ 状态行（技术声音，例如剩余次数、网络、交易链接） |
| 结果 | 卡片：汉字 + 等级名 + 罗马字 + 签文 + Work/Love/Wealth；凭证面板全部用技术声音 |
| 收藏 | 界面声音；空状态可以带一句温和的引导 |
| 我的 | 界面 + 技术声音（签名、隐私说明要准确） |
| Footer | *Powered by BOT Chain*（不译） |
| Metadata / 分享 | 标题：*BOT Omikuji — Daily fortunes on BOT Chain*；分享句：*"I drew 中吉 · Middle Blessing at BOT Omikuji."* 分享句必须保留汉字 |

---

## 8. 标点与大小写

- 按钮和标题用 **sentence case**（*Draw a fortune*、*Connect wallet*）。品牌名、网络名、七种等级名用 **Title Case**。
- 英文不使用全角标点。中文继续使用全角标点。
- 省略号：英文用 *…*（U+2026）；中文用「……」。
- 罗马字：在等级行带长音符（Chūkichi、Shōkichi、Kyō、Daikyō），正文中的 *omikuji*、*kami* 不加长音符、不加斜体。
- 数字与单位之间加空格（10 draws、0.003 BOT）；时间写 *00:00 (UTC+8)*。
- 不用全大写表达强调。

---

## 9. 长度与响应式

- 英文一般比中文长 1.3–1.8 倍。导航项 ≤ 12 字符（Home / Draw / Collection / Profile）；主按钮 ≤ 22 字符。
- 卡片等级名最长为 *Blessing Yet to Come*（20 字符），需要在 360 px 宽度下测试，允许换行，但不允许截断。
- 对话框：英文台词不超过 2 行（桌面）/ 3 行（手机）。
- CSS 只做必要调整：`overflow-wrap: anywhere` 只用于地址和哈希；正文使用 `hyphens: auto` 并设置 `lang="en"`。
- 每个页面都要在中英两种语言、桌面与 390 px 手机宽度下截图检查。

---

## 10. 实施方式（确认方向后执行）

- 采用 **i18next + react-i18next**：资源按页面拆分到 `src/i18n/zh-CN/*.json` 和 `src/i18n/en/*.json`，并预留 `ja`。
- 首次访问默认英文（负责人 2026-10-16 决定）；之后语言偏好保存在 `localStorage`，同时设置 `<html lang>`；切换语言不刷新页面、不改变路由，也不影响钱包状态。
- 签运数据：汉字、ID、稀有度、权重保持不变（与合约一致）；只有名称和签文按语言读取资源。
- 所有链上结果仍然只来自合约事件，翻译只影响显示。

---

## 11. 定稿（已上线）

### 11.1 七种签运

| 汉字 | 中文副标题 | English level | 中文签文 | English verse |
|---|---|---|---|---|
| 大吉 | 鸿运当头 | Great Blessing | 盛运已至，心怀光明，勇敢前行。 | Great fortune has arrived. Keep a bright heart, and go forward without fear. |
| 中吉 | 吉运渐升 | Middle Blessing | 守心待时，福门渐开。 | Keep your heart steady and bide your time. Little by little, the gate of fortune opens. |
| 小吉 | 小福相随 | Small Blessing | 微光成炬，小福终成大喜。 | Faint lights gather into a torch, and small blessings into great joy. |
| 吉 | 吉祥顺遂 | Blessing | 循迹而行，良缘自会相逢。 | Follow the signs you are given. A good encounter will come of its own accord. |
| 末吉 | 福在后至 | Blessing Yet to Come | 花期未至，静候属于你的季节。 | The blossoms have not opened yet. Wait quietly—your season is still on its way. |
| 凶 | 谨慎徐行 | Misfortune | 今日宜缓，柔韧者不折。 | Go slowly today. What bends does not break. |
| 大凶 | 静待转机 | Great Misfortune | 暂歇自省，长夜终将破晓。 | Rest a while and look within. Even the longest night ends in dawn. |

每句英文只使用中文原文里已有的意象（光、门、微光与火炬、迹、花期与季节、夜与破晓）。

### 11.2 中英文同步修改的地方

| 位置 | 原中文 | 新中文 | English |
|---|---|---|---|
| 巫女：祈愿 | 你的愿望，已经传达至神社…… | 你的愿望，已经传达给神明…… | Your wish has been offered to the kami… |
| 巫女：钱包 | 请在钱包中确认这场祈愿仪式。 | 请在钱包中确认交易。这笔交易会把你的签记录在 BOT Chain 上，需要支付少量 Gas。 | Please confirm the transaction in your wallet. It records your draw on BOT Chain and costs a small gas fee. |
| 访客结果 | 保存在你的访客收藏中，未上链 | 这支御签只保存在本设备，没有上链。 | This fortune is saved on this device only. It is not on-chain. |
| 结果页按钮 | 收入御签阁 | 查看御签收藏 | View collection |
| 各处时间 | 每日 00:00 | 每日 00:00（UTC+8） | 00:00 (UTC+8) |
| 合约报错 | 本次交易已在提交前停止 | 交易在发送前已停止，没有花费 Gas | The transaction was stopped before it was sent, and no gas was spent |

新增：交易确认阶段显示预计 Gas（「预计 Gas 费约 X BOT（以钱包显示为准）」/ "Estimated gas fee: about X BOT (your wallet shows the final amount)"）。

### 11.3 kami 的首次说明

英文模式在抽签页的仪式开始前（以及「Your wish has been offered to the kami…」「The kami have answered.」出现时）在对话框中显示一行说明：*"Kami are the deities and spirits honored at Shinto shrines."* 中文不显示（「神明」无需解释）。

### 11.4 自动检查（`tests/i18n.test.ts`）

中英文键名与插值变量一致；七种签运齐全且等级名固定；英文中不得出现中文标点、`...`、god(s)/curse/luck；签文与巫女台词不用感叹号；签文 ≤ 25 词；钱包交易台词必须包含 transaction / gas fee（中文：交易 / Gas）。

---

## 附：方向确认记录（2026-10-16）

负责人确认：1–2、4–5 按草案执行（中吉 = Middle Blessing）；第 3 条改为「不新增原文没有的意象」；另加两条：卡片不强制同时显示汉字 / 英文 / 罗马字；kami 首次出现时给出简短说明。

### 草案原问题

1. 吉系用 **Blessing**、凶系用 **Misfortune** 的等级体系（不用 Luck、curse、Caution）。
2. 中吉用 **Middle Blessing**（推荐）还是 **Fair Blessing**。
3. 签文允许补充极少量日本诗歌传统意象，并逐条登记（例如凶签中的「柳」）。
4. 「请在钱包中确认……」这类台词改为准确的技术说明，中文也同步修改。
5. kami 不译，不用 god/gods。
