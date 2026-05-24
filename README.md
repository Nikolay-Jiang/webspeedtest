# WebSpeedTest

[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![Test Status](https://img.shields.io/badge/tests-passing-brightgreen)](#testing)

命令行网站速度测试工具，测量 DNS 解析、TCP 连接、TLS 握手、TTFB、ICMP Ping、TCP Ping、HTTP 状态码共 7 项指标，支持多轮测试取平均值，生成自包含的静态 HTML 报告。

## 功能特性

- **7 项网络指标**: DNS 解析、TCP 连接、TLS 握手、TTFB、ICMP Ping、TCP Ping、HTTP 状态码
- **多轮测试**: 可配置测试轮次，自动计算平均值
- **优雅降级**: 无效 URL、DNS 失败、超时不崩溃，在报告中标记错误
- **自包含 HTML 报告**: 内联 CSS + 可选 Chart.js 柱状图
- **零运行时依赖**: 仅使用 Node.js 内置模块

## 一键部署

```bash
# 克隆仓库
git clone https://github.com/Nikolay-Jiang/webspeedtest.git
cd webspeedtest

# 方式一：使用部署脚本（推荐）
chmod +x deploy.sh
./deploy.sh

# 方式二：使用部署脚本并全局安装 CLI
./deploy.sh --global-link

# 方式三：手动安装
npm install
npm run typecheck   # 类型检查
npm test            # 运行测试
```

部署脚本 `deploy.sh` 会自动执行：
1. 检查 Node.js 版本（>= 18.0.0）
2. 安装依赖（有 `package-lock.json` 时用 `npm ci`，否则 `npm install`）
3. 运行 TypeScript 类型检查
4. 运行测试套件
5. 可选：全局链接 CLI（`./deploy.sh --global-link`）

> 部署失败时脚本会以非零退出码退出，适合 CI/CD 集成。

## 使用方法

创建 CSV 文件，每行一个 URL：

```csv
example.com
www.google.com
https://github.com
```

运行测试：

```bash
npx tsx src/index.ts --csv urls.csv --count 3 --output report.html
```

### 运行输出示例

```
--- Testing 1/3 ---
[1/3] example.com ✓ 234.5ms
[2/3] example.com ✓ 221.3ms
[3/3] example.com ✓ 218.9ms
--- Testing 2/3 ---
[1/3] www.google.com ✓ 89.2ms
[2/3] www.google.com ✓ 87.1ms
[3/3] www.google.com ✓ 91.4ms
--- Testing 3/3 ---
[1/3] github.com ✗ DNS Failure
[2/3] github.com ✗ DNS Failure
[3/3] github.com ✗ DNS Failure
Report generated: report.html | Success: 2 | Failed: 1
```

### CLI 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--csv <path>` | CSV 文件路径（每行一个 URL） | 必填 |
| `--count <n>` | 每个 URL 的测试轮次 | `3` |
| `--output <path>` | HTML 报告输出路径 | `./report.html` |
| `--help` | 显示帮助信息 | |

### 退出码

| 退出码 | 含义 |
|--------|------|
| `0` | 全部 URL 测试成功 |
| `1` | 存在连接层失败的 URL |
| `2` | 没有成功测试任何 URL |

## 测试指标

每轮测试对每个 URL 测量以下指标：

| 指标 | 说明 | 实现方式 |
|------|------|----------|
| **DNS** | DNS 解析耗时 | 自定义 `dns.lookup` 计时 |
| **TCP** | TCP 连接建立耗时 | Socket `connect` 事件 |
| **TLS** | TLS 握手耗时（仅 HTTPS） | Socket `secureConnect` 事件 |
| **TTFB** | 首字节响应时间 | Response `data` 事件 |
| **Total** | 完整请求耗时 | `process.hrtime.bigint()` |
| **ICMP Ping** | ICMP 往返延迟 | 系统 `ping` 命令 |
| **TCP Ping** | TCP 端口连接耗时 | `net.createConnection` |

结果取所有成功轮次的平均值。失败的轮次不计入平均值，但在报告中标记失败次数。

## HTML 报告

生成的 HTML 报告包含：

- **摘要区**: 总 URL 数、成功数、失败数、平均响应时间
- **结果表格**: 按总响应时间升序排列，9 列（URL、状态、DNS、TCP、TLS、TTFB、Total、ICMP、TCP Ping）
- **失败行**: 红色标记错误信息，数值列显示 "—"
- **可选柱状图**: 通过 Chart.js CDN 加载，CDN 不可用时表格仍正常显示

## 项目结构

```
webspeedtest/
├── deploy.sh              # 一键部署脚本
├── package.json           # 项目配置
├── tsconfig.json          # TypeScript 配置
├── vitest.config.ts       # 测试配置
└── src/
    ├── index.ts            # CLI 入口与主循环
    ├── cli.ts              # 参数解析器
    ├── csv-parser.ts       # CSV 文件读取
    ├── url-normalizer.ts   # URL 规范化（自动补 https://）
    ├── icmp-ping.ts       # ICMP Ping 模块
    ├── tcp-ping.ts         # TCP Ping 模块
    ├── http-timing.ts      # HTTP 时序测量
    ├── orchestrator.ts     # 测试编排与平均计算
    ├── report-generator.ts # HTML 报告生成
    ├── types.ts            # 共享类型定义
    └── __tests__/          # 测试文件（9 个模块测试）
```

## 开发

### 前置条件

- Node.js >= 18
- npm

### 常用命令

```bash
npm install          # 安装依赖
npm run typecheck    # TypeScript 类型检查
npm test             # 运行测试套件
npm start -- --csv urls.csv   # 运行 CLI
```

### 测试

使用 [Vitest](https://vitest.dev/) 测试框架：

```bash
npm test
```

覆盖 9 个模块共 61 个测试用例：参数解析、CSV 解析、URL 规范化、HTTP 时序、ICMP Ping 解析、TCP Ping、测试编排、报告生成、CLI 集成。

## License

MIT