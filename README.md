# GitHub 开源导航系统

一个基于 FastAPI 的 GitHub 项目推荐与导航网站，支持多级分类、GitHub 仓库信息展示和智能分类筛选。

## 功能特性

1. **多级分类管理** - 支持创建和管理无限层级的分类结构，树形展示
2. **智能分类筛选** - 首页只显示有仓库的分类，自动过滤空分类
3. **GitHub 仓库管理** - 添加、编辑和删除 GitHub 仓库
4. **信息卡片展示** - 集成第三方服务展示精美的 GitHub 仓库信息卡片
5. **分类浏览** - 支持按分类浏览项目，分类树支持展开/折叠和搜索
6. **管理员后台** - 安全的管理员登录和内容管理系统
   - 仓库管理：分页、搜索、树形分类选择
   - 分类管理：树形展示、展开/收起、搜索
7. **响应式设计** - 现代化的用户界面，支持移动端访问

## 技术栈

- **后端**: FastAPI, SQLAlchemy, SQLite
- **前端**: HTML, CSS, JavaScript (原生)
- **认证**: JWT Token
- **信息卡片**: 集成 gitcard.app.luler.top 服务

## 安装和运行

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

需要的依赖包：
- fastapi
- uvicorn
- sqlalchemy
- python-jose[cryptography]
- passlib[bcrypt]
- python-multipart
- requests
- jinja2

### 2. 配置环境变量（可选）

应用支持通过环境变量配置管理员账号：

```bash
# Linux/Mac
export ADMIN_USERNAME=your_admin
export ADMIN_PASSWORD=your_password

# Windows PowerShell
$env:ADMIN_USERNAME="your_admin"
$env:ADMIN_PASSWORD="your_password"

# Windows CMD
set ADMIN_USERNAME=your_admin
set ADMIN_PASSWORD=your_password
```

如果不设置环境变量，将使用默认值：
- **默认用户名**: `admin`
- **默认密码**: `admin123`

⚠️ **重要提示**: 首次启动时会自动创建管理员账号。如果数据库中已存在管理员，不会重复创建。

### 3. 运行应用

```bash
python app.py
```

或者使用 uvicorn：

```bash
uvicorn app:app --host 0.0.0.0 --port 8000
```

### 4. 访问应用

- **首页**: http://localhost:8000
- **管理后台**: http://localhost:8000/admin

## 项目结构

```
├── app.py                    # 主应用文件，包含所有路由和业务逻辑
├── models.py                 # 数据库模型 (Admin, Category, Repository)
├── database.py               # 数据库连接配置
├── auth.py                   # JWT 认证相关功能
├── github_scraper.py         # GitHub 仓库信息更新
├── init_db.py                # 数据库初始化脚本
├── requirements.txt          # Python 依赖包列表
├── github_navigator.db       # SQLite 数据库文件（自动生成）
├── templates/                # Jinja2 HTML 模板
│   ├── repositories.html     # 首页/仓库列表页
│   ├── category.html         # 分类详情页
│   ├── admin_login.html      # 管理员登录页
│   ├── admin_dashboard.html  # 管理后台主页
│   ├── admin_add_category.html   # 添加分类页
│   └── admin_add_repository.html # 添加仓库页
└── static/                   # 静态文件
    ├── css/
    │   └── style.css         # 全局样式
    └── js/
        ├── category_tree.js  # 分类树组件
        └── admin_dashboard.js # 管理后台交互逻辑
```

## 核心功能说明

### 1. 分类管理

- **树形结构**: 支持无限层级的父子分类关系
- **智能过滤**: 首页只显示有仓库的分类，空分类自动隐藏
- **仓库计数**: 每个分类显示自己的仓库数量（不累加子分类）
- **展开折叠**: 分类树支持展开/折叠，状态保存在 LocalStorage
- **分类搜索**: 支持按分类名称搜索并高亮匹配项

### 2. 仓库管理

- **批量管理**: 管理后台支持分页浏览、搜索和筛选
- **自动解析**: 输入 GitHub URL 自动解析 owner 和 repo_name
- **信息卡片**: 使用第三方服务自动生成精美的仓库信息卡片
- **分类归属**: 每个仓库必须归属于一个分类

### 3. 管理后台

- **仓库管理**:
  - 分页展示（20/50/100 条/页）
  - 按名称/owner/repo 搜索
  - 按分类筛选（树形下拉选择）
  - 编辑和删除仓库

- **分类管理**:
  - 树形展示所有分类
  - 显示仓库数和子分类数
  - 添加、编辑、删除分类
  - 全部展开/收起功能

## API 接口

### 公开接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 首页，显示最新仓库 |
| GET | `/?category_id={id}` | 按分类筛选仓库 |
| GET | `/categories/{id}` | 分类详情页 |
| GET | `/api/categories/public` | 获取有仓库的分类树（首页用） |
| GET | `/api/categories` | 获取完整分类树（后台用） |
| GET | `/api/categories/flat` | 获取扁平化分类列表 |
| GET | `/api/repositories` | 获取仓库列表 |
| GET | `/api/repositories/search?q={keyword}` | 搜索仓库 |
| GET | `/api/repositories/latest` | 获取最新入库的仓库 |

### 管理接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin` | 管理员登录页 |
| POST | `/admin/login` | 管理员登录 |
| GET | `/admin/logout` | 管理员登出 |
| GET | `/admin/dashboard` | 管理后台主页 |

### API 接口（需要 JWT 认证）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/categories` | 创建分类 |
| PUT | `/api/categories/{id}` | 更新分类 |
| DELETE | `/api/categories/{id}` | 删除分类 |
| GET | `/api/admin/categories` | 获取分类列表（分页） |
| POST | `/api/repositories` | 创建仓库 |
| PUT | `/api/repositories/{id}` | 更新仓库 |
| DELETE | `/api/repositories/{id}` | 删除仓库 |
| GET | `/api/admin/repositories` | 获取仓库列表（分页） |

## 数据库模型

### Admin（管理员）
- id: 主键
- username: 用户名（唯一）
- password_hash: 密码哈希
- created_at: 创建时间

### Category（分类）
- id: 主键
- name: 分类名称
- parent_id: 父分类 ID（外键，可为空）
- level: 层级（0 表示顶级）
- created_at: 创建时间
- 关系: parent（父分类）, children（子分类）, repositories（仓库列表）

### Repository（仓库）
- id: 主键
- name: 仓库名称
- github_url: GitHub URL（唯一）
- owner: 仓库所有者
- repo_name: 仓库名
- updated_at: GitHub 更新时间
- added_at: 入库时间
- category_id: 所属分类 ID（外键）
- 关系: category（所属分类）
- 属性方法: card_url（生成信息卡片 URL）

## 使用说明

### 管理员操作

1. **登录管理后台**
   - 访问 http://localhost:8000/admin
   - 使用默认账号 admin/admin123 登录

2. **创建分类**
   - 在分类管理标签页点击"添加分类"
   - 输入分类名称，选择父分类（可选）
   - 支持多级分类结构

3. **添加仓库**
   - 在仓库管理标签页点击"添加仓库"
   - 输入仓库名称和完整的 GitHub URL
   - 选择所属分类
   - 系统会自动解析并生成信息卡片

4. **编辑/删除**
   - 点击每个项目的"编辑"或"删除"按钮
   - 删除分类前需要先删除其下的所有仓库和子分类

### 用户操作

1. **浏览仓库**
   - 首页显示最新入库的仓库
   - 左侧分类树只显示有仓库的分类

2. **分类筛选**
   - 点击左侧分类树的分类名称筛选
   - 支持展开/折叠子分类
   - 支持搜索分类名称

3. **查看详情**
   - 点击仓库卡片跳转到 GitHub 页面
   - 信息卡片显示仓库的基本信息

## 安全配置

### 生产环境建议

1. **修改 JWT 密钥**（auth.py）
   ```python
   SECRET_KEY = "your-secret-key-here"  # 请使用强随机密钥
   ```

2. **修改管理员密码**
   - 登录后台后及时修改默认密码
   - 或在 init_db.py 中修改初始密码

3. **配置 CORS**（如需要）
   ```python
   from fastapi.middleware.cors import CORSMiddleware
   app.add_middleware(CORSMiddleware, ...)
   ```

4. **使用 HTTPS**
   - 生产环境建议使用 Nginx/Apache 反向代理
   - 配置 SSL 证书

## 注意事项

1. **数据库备份**: SQLite 数据库文件 `github_navigator.db` 需要定期备份
2. **信息卡片服务**: 使用的是第三方服务 gitcard.app.luler.top，请确保网络可访问
3. **分类删除**: 只能删除没有子分类和仓库的分类
4. **URL 格式**: 仓库 URL 必须是完整的 GitHub 地址，如 `https://github.com/owner/repo`

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
