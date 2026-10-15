// Serves a local page that deploys the tested production build of FortuneContract
// through the browser wallet (MetaMask). The deployer signs in their own wallet;
// no private key is read, stored or needed by this script.
//
//   npx hardhat compile --build-profile production
//   DEPLOYER=0x... node scripts/metamask-deploy.ts      → open http://127.0.0.1:5199
//
// After the transaction confirms, record and verify it with:
//   node scripts/record-deployment.ts <deploymentTxHash>
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { getAddress, keccak256 } from "viem";
import { BOTCHAIN_CHAIN_ID_HEX, BOTCHAIN_EXPLORER_URL, BOTCHAIN_RPC_URL } from "../supabase/functions/_shared/botchain.ts";

const PORT = Number(process.env.PORT ?? 5199);
const deployer = process.env.DEPLOYER ? getAddress(process.env.DEPLOYER) : null;
const artifact = JSON.parse(await readFile(new URL("../artifacts/contracts/FortuneContract.sol/FortuneContract.json", import.meta.url), "utf8"));
const buildInfo = JSON.parse(await readFile(new URL(`../artifacts/build-info/${artifact.buildInfoId}.json`, import.meta.url), "utf8"));
const optimizer = buildInfo.input?.settings?.optimizer;
if (!optimizer?.enabled) throw new Error("Artifact was not built with the production profile. Run: npx hardhat compile --build-profile production");

const config = {
  chainIdHex: BOTCHAIN_CHAIN_ID_HEX,
  rpcUrl: process.env.BOTCHAIN_RPC_URL ?? BOTCHAIN_RPC_URL,
  explorerUrl: BOTCHAIN_EXPLORER_URL,
  deployer,
  bytecode: artifact.bytecode as string,
  bytecodeHash: keccak256(artifact.bytecode),
  buildInfoId: artifact.buildInfoId,
};

const page = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FortuneContract · BOT Chain 部署</title>
<style>
body{font:15px/1.6 system-ui,sans-serif;max-width:720px;margin:32px auto;padding:0 16px;background:#160b24;color:#fbecc8}
h1{font-size:20px;color:#ffcc67}code,.mono{font-family:ui-monospace,monospace;font-size:13px;word-break:break-all}
dl{display:grid;grid-template-columns:150px 1fr;gap:6px 12px}dt{color:#d6b98c}
button{font:inherit;padding:10px 18px;margin:8px 8px 0 0;border:1px solid #ffcc67;background:#2b1636;color:#fff0c1;cursor:pointer}
button:disabled{opacity:.4;cursor:not-allowed}.ok{color:#62eca9}.bad{color:#ff8a8a}.box{border:1px solid #6d4423;padding:12px 16px;margin:16px 0;background:#1f1029}
a{color:#ffcc67}</style></head><body>
<h1>FortuneContract → BOT Chain Mainnet (677)</h1>
<p>本页面只会发起<b>一笔</b>合约部署交易，需要你在 MetaMask 中确认。页面不会接触私钥或助记词。</p>
<div class="box"><dl>
<dt>预期部署地址</dt><dd class="mono" id="expected"></dd>
<dt>当前钱包</dt><dd class="mono" id="account">未连接</dd>
<dt>当前网络</dt><dd id="chain">—</dd>
<dt>余额</dt><dd id="balance">—</dd>
<dt>预计 Gas</dt><dd id="gas">—</dd>
<dt>Bytecode keccak</dt><dd class="mono" id="hash"></dd>
<dt>Build</dt><dd class="mono" id="build"></dd>
</dl></div>
<button id="connect">1. 连接 MetaMask</button><button id="switch" disabled>2. 切换到 BOT Chain</button><button id="deploy" disabled>3. 部署合约</button>
<div class="box" id="log"></div>
<script>
const cfg=${JSON.stringify(config)};
const $=id=>document.getElementById(id);const log=(m,c="")=>{$("log").innerHTML+='<div class="'+c+'">'+m+'</div>'};
$("expected").textContent=cfg.deployer||"（未指定）";$("hash").textContent=cfg.bytecodeHash;$("build").textContent=cfg.buildInfoId;
let account=null,gas=null;const eth=window.ethereum;
async function rpc(method,params){const r=await fetch(cfg.rpcUrl,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});const j=await r.json();if(j.error)throw new Error(j.error.message);return j.result}
async function refresh(){
  if(!eth){log("未检测到 MetaMask。","bad");return}
  const chain=await eth.request({method:"eth_chainId"});
  $("chain").innerHTML=chain===cfg.chainIdHex?'<span class="ok">BOT Chain Mainnet (677)</span>':'<span class="bad">'+parseInt(chain,16)+'（需要切换）</span>';
  $("switch").disabled=!account||chain===cfg.chainIdHex;
  const right=account&&(!cfg.deployer||account.toLowerCase()===cfg.deployer.toLowerCase());
  $("account").innerHTML=account?(right?'<span class="ok">'+account+'</span>':'<span class="bad">'+account+'（不是预期部署地址，请在 MetaMask 切换账户）</span>'):"未连接";
  if(!account)return;
  const bal=BigInt(await rpc("eth_getBalance",[account,"latest"]));
  const price=BigInt(await rpc("eth_gasPrice",[]));
  gas=BigInt(await rpc("eth_estimateGas",[{from:account,data:cfg.bytecode}]));
  $("balance").textContent=(Number(bal)/1e18).toFixed(6)+" BOT";
  $("gas").textContent=gas+" gas ≈ "+(Number(gas*price)/1e18).toFixed(6)+" BOT（"+(Number(price)/1e9)+" gwei）";
  $("deploy").disabled=!(right&&chain===cfg.chainIdHex&&bal>gas*price*12n/10n);
}
$("connect").onclick=async()=>{try{[account]=await eth.request({method:"eth_requestAccounts"});await refresh()}catch(e){log(e.message,"bad")}};
$("switch").onclick=async()=>{try{await eth.request({method:"wallet_switchEthereumChain",params:[{chainId:cfg.chainIdHex}]})}catch(e){if(e.code===4902){await eth.request({method:"wallet_addEthereumChain",params:[{chainId:cfg.chainIdHex,chainName:"BOT Chain Mainnet",nativeCurrency:{name:"BOT",symbol:"BOT",decimals:18},rpcUrls:[cfg.rpcUrl],blockExplorerUrls:[cfg.explorerUrl]}]})}else log(e.message,"bad")}await refresh()};
$("deploy").onclick=async()=>{
  $("deploy").disabled=true;
  try{
    await refresh();
    if(await eth.request({method:"eth_chainId"})!==cfg.chainIdHex)throw new Error("网络不是 BOT Chain Mainnet");
    const hash=await eth.request({method:"eth_sendTransaction",params:[{from:account,data:cfg.bytecode,gas:"0x"+(gas*12n/10n).toString(16)}]});
    log('已发送部署交易：<a target="_blank" href="'+cfg.explorerUrl+'/tx/'+hash+'">'+hash+'</a>');
    log("等待上链确认…");
    for(;;){const r=await rpc("eth_getTransactionReceipt",[hash]);if(r){
      if(r.status==="0x1"){log('部署成功 ✔ 合约地址：<a target="_blank" href="'+cfg.explorerUrl+'/address/'+r.contractAddress+'">'+r.contractAddress+'</a>（区块 '+parseInt(r.blockNumber,16)+'）',"ok");log("请把这笔交易哈希发给开发者，用于校验和记录：<br><code>"+hash+"</code>")}
      else log("交易已上链但执行失败（reverted）。请勿重试，先联系开发者。","bad");break}
      await new Promise(r=>setTimeout(r,1500))}
  }catch(e){log(e.code===4001?"你在 MetaMask 中取消了交易，没有发送任何内容。":e.message,"bad");$("deploy").disabled=false}
};
if(eth){eth.on?.("chainChanged",refresh);eth.on?.("accountsChanged",a=>{account=a[0]||null;refresh()})}
</script></body></html>`;

createServer((request, response) => {
  if (request.url !== "/" && request.url !== "/index.html") { response.writeHead(404).end(); return; }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(page);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Deployment page: http://127.0.0.1:${PORT}`);
  console.log(`Bytecode keccak: ${config.bytecodeHash} (build ${config.buildInfoId}, optimizer runs ${optimizer.runs})`);
  console.log(`Expected deployer: ${deployer ?? "(any)"}`);
});
