#!/usr/bin/env node
/**
 * Dual-stack TCP proxy for Vite dev server.
 *
 * Vite 不接受文件描述符绑定(没法像 uvicorn 那样用 --fd),
 * 而且 Node.js 在 Windows 上 listen(::) 也默认 IPV6_V6ONLY=1。
 *
 * 本脚本:
 *   1. 在 ::PORT 上开 dual-stack 监听 (ipv6Only:false 显式关)
 *   2. 把每个连接 pipe 到 Vite (跑在 127.0.0.1:UPSTREAM_PORT, v4-only)
 *   3. 透传 TCP 字节流,HTTP/HMR/WebSocket 都自然走通
 *
 * 用法:
 *   # 终端 1:  Vite 只跑 v4
 *   pnpm dev --host 127.0.0.1 --port 3012 --strictPort
 *   # 终端 2:  双栈代理
 *   node scripts/dual-stack-proxy.cjs          # 默认监听 3011,转发 3012
 *   # 或者环境变量:
 *   LISTEN_PORT=3011 UPSTREAM_PORT=3012 node scripts/dual-stack-proxy.cjs
 *
 * 也可以两条命令用 && 或 & 串联,见 package.json 的 dev:dual。
 */
"use strict";
const net = require("net");

const LISTEN_PORT = parseInt(process.env.LISTEN_PORT || "3011", 10);
const LISTEN_HOST = process.env.LISTEN_HOST || "::";
const UPSTREAM_HOST = process.env.UPSTREAM_HOST || "127.0.0.1";
const UPSTREAM_PORT = parseInt(process.env.UPSTREAM_PORT || "3012", 10);

const proxy = net.createServer((client) => {
  const upstream = net.connect(UPSTREAM_PORT, UPSTREAM_HOST, () => {
    client.pipe(upstream).pipe(client);
  });
  upstream.on("error", (e) => {
    console.error(`[dual-stack-proxy] upstream error: ${e.message}`);
    client.destroy();
  });
  client.on("error", (e) => {
    console.error(`[dual-stack-proxy] client error: ${e.message}`);
    upstream.destroy();
  });
});

proxy.on("error", (e) => {
  console.error(`[dual-stack-proxy] listen error: ${e.message}`);
  process.exit(1);
});

proxy.listen(
  { port: LISTEN_PORT, host: LISTEN_HOST, ipv6Only: false },
  () => {
    const addr = proxy.address();
    console.log(
      `[dual-stack-proxy] dual-stack on ${addr.address}:${addr.port}` +
        ` -> ${UPSTREAM_HOST}:${UPSTREAM_PORT}` +
        " (ipv4 + ipv6)",
    );
  },
);

// 优雅退出
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log(`[dual-stack-proxy] ${sig}, closing...`);
    proxy.close(() => process.exit(0));
  });
}
