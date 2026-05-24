# IT技术社区聊天室

一个基于 Node.js + Express + Socket.IO 的实时技术交流社区，支持多人在线聊天、文件共享、文件夹管理以及后台管理功能。
<img width="1530" height="1015" alt="image" src="https://github.com/user-attachments/assets/1702ad06-fe55-4b85-8fd1-8ea08d5f918f" />

## 功能特性

### 用户功能
- **注册/登录**：支持用户名密码注册登录，JWT Token 认证
- **实时聊天**：基于 Socket.IO 的即时消息推送，支持在线/离线状态显示
- **个人资料**：可修改头像、昵称、性别和密码
- **频道成员**：实时显示在线成员列表，管理员昵称浅绿色高亮标识
- **表情包**：内置表情面板，支持在聊天中发送 emoji

### 文件共享
- **文件上传**：支持上传 PDF、Word、图片、代码文件等（最大 50MB）
- **文件夹管理**：支持创建文件夹、切换目录、级联删除子目录及文件
- **文件预览**：支持图片、PDF、Word(docx)、文本及代码文件在线预览
- **文件下载**：点击即可下载文件
- **文件描述**：展开文件可查看上传时填写的文档描述

### 权限管理
- **角色系统**：普通用户与管理员双角色
- **管理员标识**：管理员昵称在成员列表和聊天消息中显示为浅绿色
- **实时权限同步**：后台修改用户角色后，前端实时更新权限（上传按钮、管理入口）
- **上传权限**：仅管理员可上传文件

### 后台管理
- **仪表盘**：统计用户数量、在线人数、文档数量
- **用户管理**：查看、编辑、封禁/解封、删除用户，支持修改用户角色
- **文档管理**：查看、删除所有上传的文档
- **文件夹管理**：创建、删除文件夹（递归删除子目录及文件）
- **消息管理**：查看、删除聊天记录

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Node.js, Express, Socket.IO |
| 数据库 | MySQL (mysql2/promise) |
| 认证 | JWT, bcryptjs |
| 文件上传 | Multer |
| 文档预览 | mammoth (docx), iconv-lite (编码转换) |
| 前端 | 原生 HTML5, CSS3, JavaScript |

## 项目结构

```
.
├── server.js              # 主服务器入口
├── package.json           # 项目依赖
├── .env                   # 环境变量配置
├── README.md              # 项目说明
├── uploads/               # 上传文件存储目录
│   ├── avatars/           # 用户头像
│   └── documents/         # 共享文档
├── public/                # 前端静态文件
│   ├── index.html         # 登录/注册页面
│   ├── chat.html          # 聊天室主页面
│   ├── admin.html         # 后台管理页面
│   ├── preview.html       # 文件预览页面
│   ├── css/style.css      # 全局样式
│   └── js/                # 前端脚本
│       ├── auth.js        # 登录注册逻辑
│       ├── chat.js        # 聊天室逻辑
│       └── admin.js       # 后台管理逻辑
├── middleware/            # 中间件
├── models/                # 数据模型
└── routes/                # 路由模块
```

## 安装与部署

### 环境要求
- Node.js >= 16
- MySQL >= 5.7

### 安装依赖
```bash
npm install
```

### 配置数据库
编辑 `server.js` 中的数据库连接配置：
```javascript
const pool = mysql.createPool({
  host: 'your-mysql-host',
  port: 3306,
  user: 'your-username',
  password: 'your-password',
  database: 'it_community_chat',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});
```

> 首次启动时，服务器会自动创建所需的数据库表结构并初始化默认管理员账号。

### 环境变量
在项目根目录创建 `.env` 文件：
```env
PORT=3000
JWT_SECRET=your-secret-key
```

### 启动服务

**生产环境**
```bash
npm start
```

**开发环境（热重载）**
```bash
npm run dev
```

服务启动后访问：
- 聊天室：`http://localhost:3000`
- 后台管理：`http://localhost:3000/admin.html`

### 默认管理员账号
首次启动会自动创建：
- 用户名：`admin`
- 密码：`admin123`

## API 接口概览

### 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 用户注册 |
| POST | `/api/auth/login` | 用户登录 |
| GET | `/api/auth/me` | 获取当前用户信息 |

### 用户
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/user/list` | 获取用户列表 |
| GET | `/api/user/online` | 获取在线用户 |
| PATCH | `/api/user/profile` | 更新个人资料 |
| POST | `/api/user/avatar` | 上传头像 |
| POST | `/api/user/password` | 修改密码 |

### 文档
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/document/upload` | 上传文档 |
| GET | `/api/document/:id` | 获取文档信息 |
| GET | `/api/document/download/:id` | 下载文档 |
| GET | `/api/document/inline/:id` | 内联查看（图片/PDF） |
| GET | `/api/document/preview-html/:id` | HTML 预览（docx/文本） |
| DELETE | `/api/document/:id` | 删除文档 |
| GET | `/api/document/list` | 获取文档列表 |

### 后台管理
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/stats` | 统计数据 |
| GET | `/api/admin/users` | 用户列表 |
| PATCH | `/api/admin/users/:id` | 编辑用户 |
| PATCH | `/api/admin/users/:id/ban` | 封禁/解封 |
| DELETE | `/api/admin/users/:id` | 删除用户 |
| GET | `/api/admin/documents` | 文档列表 |
| DELETE | `/api/admin/documents/:id` | 删除文档 |
| GET | `/api/admin/folders` | 文件夹列表 |
| POST | `/api/admin/folders` | 创建文件夹 |
| DELETE | `/api/admin/folders/:id` | 删除文件夹 |
| GET | `/api/admin/messages` | 消息列表 |
| DELETE | `/api/admin/messages/:id` | 删除消息 |

## 实时事件（Socket.IO）

| 事件 | 方向 | 说明 |
|------|------|------|
| `newMessage` | 服务端 → 客户端 | 新消息推送 |
| `history` | 服务端 → 客户端 | 历史消息 |
| `userOnline` | 服务端 → 客户端 | 用户上线通知 |
| `userOffline` | 服务端 → 客户端 | 用户离线通知 |
| `usersList` | 服务端 → 客户端 | 用户列表更新 |
| `userTyping` | 双向 | 正在输入状态 |
| `userRoleChanged` | 服务端 → 客户端 | 用户角色变更通知 |

## 注意事项

1. **数据库**：项目使用 MySQL，启动时会自动建表。请确保数据库连接配置正确。
2. **上传目录**：`uploads/avatars` 和 `uploads/documents` 目录会自动创建，用于存储头像和共享文件。
3. **CSP 策略**：默认设置了 Content-Security-Policy，如需引入外部资源请修改 `server.js` 中的 CSP 配置。
4. **端口**：默认运行在 `3000` 端口，可通过环境变量 `PORT` 修改。

## 开源协议

MIT License
