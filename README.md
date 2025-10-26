# GitHub 开源导航系统

一个基于 FastAPI 的 GitHub 项目推荐与导航网站，支持多级分类、GitHub 仓库信息展示和智能分类筛选。

## 主要功能

- 多级分类管理，支持树形结构展示
- GitHub 仓库管理，自动生成信息卡片
- 智能分类筛选，只显示有内容的分类
- 管理员后台，支持分页、搜索和筛选
- 响应式设计，支持移动端访问

## 技术栈

- **后端**: FastAPI, SQLAlchemy, SQLite
- **前端**: HTML, CSS, JavaScript
- **认证**: JWT Token

## 快速开始

### 安装依赖

```bash
pip install -r requirements.txt
```

### 运行应用

```bash
python app.py
```

### 访问应用

- 首页: http://localhost:8000
- 管理后台: http://localhost:8000/admin
- 默认账号: admin / admin123

## 配置管理员账号（可选）

通过环境变量配置：

```bash
# Linux/Mac
export ADMIN_USERNAME=your_admin
export ADMIN_PASSWORD=your_password
export GITCARD_BASE_URL=https://yourdomain.com

# Windows
set ADMIN_USERNAME=your_admin
set ADMIN_PASSWORD=your_password
set GITCARD_BASE_URL=https://yourdomain.com
```

## 基本使用

### 管理员操作

1. 登录管理后台
2. 创建分类（支持多级分类）
3. 添加 GitHub 仓库（输入完整 URL）
4. 系统自动解析并生成信息卡片

### 用户操作

1. 首页浏览最新仓库
2. 使用左侧分类树筛选项目
3. 点击仓库卡片查看详情

## 注意事项

- 生产环境请修改 JWT 密钥和管理员密码
- 定期备份 `github_navigator.db` 数据库文件
- 删除分类前需先删除其下的仓库和子分类
