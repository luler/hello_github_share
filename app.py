import asyncio
import os
from datetime import timedelta
from typing import Optional, List

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, Request, Form, Query, BackgroundTasks
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_admin, create_access_token, authenticate_admin, ACCESS_TOKEN_EXPIRE_MINUTES, hash_password
from database import SessionLocal, engine, get_db
from llm_service import generate_repo_summary
from models import Base, Category, Repository, Admin, Config

# 全局变量：记录正在进行LLM摘要处理的仓库ID集合
processing_repositories = set()

# 全局异步锁：确保同时只有一个任务在执行LLM摘要
llm_task_lock = asyncio.Lock()


# 后台任务：异步更新仓库LLM摘要
async def update_repository_llm_summary(repository_id: int, github_url: str):
    """
    后台任务：使用LLM生成摘要并更新仓库描述
    使用异步锁确保同时只有一个任务在执行
    """
    # 标记开始处理（在获取锁之前）
    processing_repositories.add(repository_id)

    # 使用异步锁：确保同时只有一个任务在执行
    async with llm_task_lock:
        db = SessionLocal()
        try:
            print(f"🔒 获得执行锁，开始处理仓库 {repository_id}")

            # 生成LLM摘要
            result = await generate_repo_summary(github_url, db)

            if result.get("success"):
                # 更新仓库描述
                repo = db.query(Repository).filter(Repository.id == repository_id).first()
                if repo:
                    repo.description = result.get("summary", github_url)
                    db.commit()
                    print(f"✅ 成功为仓库 {repository_id} 更新LLM摘要")
            else:
                # LLM生成失败，保持原有描述（GitHub URL）
                print(f"⚠️  仓库 {repository_id} LLM摘要生成失败: {result.get('error')}")
        except Exception as e:
            print(f"❌ 后台任务更新仓库 {repository_id} 摘要时出错: {e}")
            if db:
                db.rollback()
        finally:
            # 确保数据库连接被关闭
            if db:
                db.close()
            # 标记处理完成（释放锁之前）
            processing_repositories.discard(repository_id)
            print(f"🔓 释放执行锁，仓库 {repository_id} 处理完成")


# 仓库对象转换公共函数
def repository_to_dict(repo: Repository) -> dict:
    """将Repository对象转换为字典"""
    # 构建分类路径（从根分类到当前分类）
    category_path = []
    if repo.category:
        current_category = repo.category
        while current_category:
            category_path.insert(0, {
                "id": current_category.id,
                "name": current_category.name,
                "level": current_category.level
            })
            current_category = current_category.parent

    return {
        "id": repo.id,
        "name": repo.name,
        "owner": repo.owner,
        "repo_name": repo.repo_name,
        "github_url": repo.github_url,
        "category_id": repo.category_id,
        "category_name": repo.category.name if repo.category else None,
        "category_path": category_path,  # 完整的分类路径
        "card_url": repo.card_url,
        "description": repo.description,
        "is_processing": repo.id in processing_repositories
    }


# 加载 .env 文件
load_dotenv()

Base.metadata.create_all(bind=engine)

app = FastAPI(title="GitHub Project Navigator")


def init_default_admin():
    """初始化默认管理员账号"""
    db = SessionLocal()
    try:
        # 检查是否已存在管理员
        admin_count = db.query(Admin).count()
        if admin_count == 0:
            # 从环境变量读取管理员账号密码，没有则使用默认值
            default_username = os.getenv("ADMIN_USERNAME", "admin")
            default_password = os.getenv("ADMIN_PASSWORD", "admin123")

            admin = Admin(
                username=default_username,
                password_hash=hash_password(default_password)
            )
            db.add(admin)
            db.commit()
            print(f"默认管理员账户已创建 - 用户名: {default_username}")
    except Exception as e:
        print(f"初始化默认管理员失败: {e}")
        db.rollback()
    finally:
        db.close()


# 启动时初始化默认管理员
init_default_admin()

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


# 获取 base URL 函数
def get_base_url(request: Request) -> str:
    """构造正确的 base URL（兼容反向代理）"""
    proto = (request.headers.get("X-Forwarded-Proto")
             or request.headers.get("X-Forwarded-Scheme")
             or str(request.url.scheme))
    host = (request.headers.get("X-Forwarded-Host")
            or request.headers.get("Host")
            or str(request.url.hostname))

    # 如果 host 包含端口号，保留它；否则不添加端口
    if ":" not in host and request.url.port and request.url.port not in (80, 443):
        host = f"{host}:{request.url.port}"

    return f"{proto}://{host}"


# 获取当前页面的完整地址
def get_full_url(request: Request) -> str:
    """构造正确的 canonical URL（兼容反向代理）"""

    # 构造完整的 canonical URL
    canonical_url = f"{get_base_url(request)}{request.url.path}"
    if request.url.query:
        canonical_url += f"?{request.url.query}"

    return canonical_url


# 注册全局函数到 Jinja2 模板环境
templates.env.globals['get_full_url'] = get_full_url


class CategoryCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None


class CategoryResponse(BaseModel):
    id: int
    name: str
    parent_id: Optional[int]
    level: int
    children: List['CategoryResponse'] = []


class RepositoryCreate(BaseModel):
    name: str
    github_url: str
    category_id: int
    description: Optional[str] = None
    auto_llm_summary: Optional[bool] = False


@app.post("/api/categories")
async def create_category(category: CategoryCreate, current_admin: Admin = Depends(get_current_admin),
                          db: Session = Depends(get_db)):
    level = 0
    if category.parent_id:
        parent = db.query(Category).filter(Category.id == category.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="父级分类不存在")
        level = parent.level + 1

        # 限制最多三级分类（level 0, 1, 2）
        if level > 2:
            raise HTTPException(status_code=400, detail="最多只能创建三级分类")

    db_category = Category(
        name=category.name,
        parent_id=category.parent_id,
        level=level
    )
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return {"id": db_category.id, "name": db_category.name, "parent_id": db_category.parent_id,
            "level": db_category.level}


@app.get("/api/categories")
async def get_categories(db: Session = Depends(get_db)):
    categories = db.query(Category).all()
    result = []

    def build_category_tree(category):
        repos = [{"name": repo.name} for repo in category.repositories]

        children = [build_category_tree(child) for child in category.children]

        return {
            "id": category.id,
            "name": category.name,
            "repositories": repos,
            "repo_count": len(category.repositories or []),
            "child_count": len(category.children or []),
            "children": children
        }

    for category in categories:
        if category.parent_id is None:
            result.append(build_category_tree(category))

    return result


@app.get("/api/categories/public")
async def get_categories_public(db: Session = Depends(get_db)):
    """首页分类筛选专用接口：只显示有仓库的分类，每个分类只统计自己的仓库数量"""
    categories = db.query(Category).all()
    result = []

    def has_repositories_in_tree(category):
        """检查分类或其子分类是否有仓库"""
        if category.repositories and len(category.repositories) > 0:
            return True
        for child in category.children:
            if has_repositories_in_tree(child):
                return True
        return False

    def build_category_tree(category):
        # 只统计当前分类自己的仓库数量，不包括子分类
        repos = [{"name": repo.name} for repo in category.repositories]

        # 递归构建子分类树，但只保留有仓库的子分类
        children = []
        for child in category.children:
            # 只有当子分类有仓库时才包含（注意：这里检查的是子分类自己，不是树）
            if child.repositories and len(child.repositories) > 0:
                child_node = build_category_tree(child)
                if child_node:
                    children.append(child_node)
            # 如果子分类没有仓库，但它的子孙分类有仓库，也要保留以维持树形结构
            elif has_repositories_in_tree(child):
                child_node = build_category_tree(child)
                if child_node:
                    children.append(child_node)

        return {
            "id": category.id,
            "name": category.name,
            "repositories": repos,
            "repo_count": len(category.repositories or []),  # 只统计自己的仓库
            "child_count": len(children),
            "children": children
        }

    for category in categories:
        if category.parent_id is None:
            # 顶级分类：只有自己有仓库，或子孙分类有仓库时才包含
            if has_repositories_in_tree(category):
                tree = build_category_tree(category)
                if tree:
                    result.append(tree)

    return result


@app.get("/api/categories/flat")
async def get_categories_flat(db: Session = Depends(get_db)):
    categories = db.query(Category).all()
    return [{"id": cat.id, "name": cat.name, "parent_id": cat.parent_id, "level": cat.level} for cat in categories]


@app.put("/api/categories/{category_id}")
async def update_category(
        category_id: int,
        category_update: CategoryCreate,
        current_admin: Admin = Depends(get_current_admin),
        db: Session = Depends(get_db)
):
    # 查找要更新的分类
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="分类不存在")

    # 检查新名称是否为空
    if not category_update.name or not category_update.name.strip():
        raise HTTPException(status_code=400, detail="分类名称不能为空")

    # 如果要修改父级
    if category_update.parent_id != category.parent_id:
        # 检查是否选择了自己作为父级
        if category_update.parent_id == category_id:
            raise HTTPException(status_code=400, detail="不能选择自己作为父级")

        # 检查是否选择了自己的子孙分类作为父级
        def get_descendant_ids(parent_id):
            descendants = []
            children = db.query(Category).filter(Category.parent_id == parent_id).all()
            for child in children:
                descendants.append(child.id)
                descendants.extend(get_descendant_ids(child.id))
            return descendants

        descendant_ids = get_descendant_ids(category_id)
        if category_update.parent_id in descendant_ids:
            raise HTTPException(status_code=400, detail="不能选择自己的子分类作为父级")

        # 如果有新的父级，验证父级存在并计算新的level
        if category_update.parent_id:
            parent = db.query(Category).filter(Category.id == category_update.parent_id).first()
            if not parent:
                raise HTTPException(status_code=404, detail="父级分类不存在")
            new_level = parent.level + 1

            # 限制最多三级分类（level 0, 1, 2）
            if new_level > 2:
                raise HTTPException(status_code=400, detail="最多只能创建三级分类")

            # 检查移动后子孙分类是否会超过三级
            def check_descendants_max_depth(parent_id, current_depth=0):
                """检查子孙分类的最大深度"""
                children = db.query(Category).filter(Category.parent_id == parent_id).all()
                if not children:
                    return current_depth
                max_depth = current_depth
                for child in children:
                    child_depth = check_descendants_max_depth(child.id, current_depth + 1)
                    max_depth = max(max_depth, child_depth)
                return max_depth

            # 如果当前分类有子分类，检查移动后整体深度
            max_descendant_depth = check_descendants_max_depth(category_id)
            if new_level + max_descendant_depth > 2:
                raise HTTPException(status_code=400, detail=f"移动后子分类将超过三级限制")
        else:
            new_level = 0

        # 更新分类的level和parent_id
        old_level = category.level
        category.parent_id = category_update.parent_id
        category.level = new_level

        # 递归更新所有子孙分类的level
        def update_descendants_level(parent_id, level_diff):
            children = db.query(Category).filter(Category.parent_id == parent_id).all()
            for child in children:
                child.level += level_diff
                update_descendants_level(child.id, level_diff)

        level_diff = new_level - old_level
        if level_diff != 0:
            update_descendants_level(category_id, level_diff)

    # 更新名称
    category.name = category_update.name.strip()

    db.commit()
    db.refresh(category)

    return {
        "id": category.id,
        "name": category.name,
        "parent_id": category.parent_id,
        "level": category.level
    }


@app.delete("/api/categories/{category_id}")
async def delete_category(category_id: int, current_admin: Admin = Depends(get_current_admin),
                          db: Session = Depends(get_db)):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="分类不存在")

    # 检查是否有子分类
    if category.children:
        raise HTTPException(status_code=400, detail="该分类下还有子分类，无法删除")

    # 检查是否有仓库
    if category.repositories:
        raise HTTPException(status_code=400, detail="该分类下还有仓库，无法删除")

    db.delete(category)
    db.commit()
    return {"message": "分类已删除"}


def _is_admin_request(request: Request, db: Session) -> bool:
    token = request.cookies.get("access_token")
    if not token:
        return False
    try:
        _ = get_current_admin(token, db)
        return True
    except HTTPException:
        return False


@app.get("/", response_class=HTMLResponse)
async def home(request: Request, category_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    # 首页显示仓库列表，使用前端无限滚动加载，这里只返回空的初始页面
    categories = db.query(Category).filter(Category.parent_id.is_(None)).all()

    # 获取选中的分类名称，用于SEO title优化
    category_name = None
    if category_id:
        category = db.query(Category).filter(Category.id == category_id).first()
        if category:
            category_name = category.name

    return templates.TemplateResponse("repositories.html", {
        "request": request,
        "categories": categories,
        "repositories": [],  # 初始为空，由前端AJAX加载
        "selected_category": category_id,
        "category_name": category_name,
        "is_admin": _is_admin_request(request, db)
    })


@app.get("/sitemap.xml")
async def sitemap(request: Request, db: Session = Depends(get_db)):
    """生成站点地图，包含首页和所有有仓库的分类页面"""
    from datetime import datetime

    base_url = get_base_url(request)

    # 获取所有有仓库的分类ID
    categories_with_repos = db.query(Category).filter(
        Category.repositories.any()
    ).all()

    # 构建 XML
    xml_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    ]

    # 添加首页
    xml_lines.extend([
        '  <url>',
        f'    <loc>{base_url}/</loc>',
        f'    <lastmod>{datetime.now().strftime("%Y-%m-%d")}</lastmod>',
        '    <changefreq>daily</changefreq>',
        '    <priority>1.0</priority>',
        '  </url>'
    ])

    # 添加所有有仓库的分类页面
    for category in categories_with_repos:
        xml_lines.extend([
            '  <url>',
            f'    <loc>{base_url}/?category_id={category.id}</loc>',
            f'    <lastmod>{datetime.now().strftime("%Y-%m-%d")}</lastmod>',
            '    <changefreq>weekly</changefreq>',
            '    <priority>0.8</priority>',
            '  </url>'
        ])

    xml_lines.append('</urlset>')

    xml_content = '\n'.join(xml_lines)

    return Response(
        content=xml_content,
        media_type="application/xml",
        headers={"Content-Type": "application/xml; charset=utf-8"}
    )


@app.get("/api/repositories")
async def list_repositories(
        q: Optional[str] = Query(None),
        category_id: Optional[int] = Query(None),
        page: int = Query(1, ge=1),
        page_size: int = Query(50, ge=1, le=100),
        db: Session = Depends(get_db)
):
    """公开的仓库列表接口，支持搜索、分页和分类筛选

    参数:
        q: 搜索关键词，模糊匹配name、owner、repo_name、description
        category_id: 分类ID筛选
        page: 页码，从1开始
        page_size: 每页数量，默认50，最大100

    返回:
        items: 仓库列表
        total: 总数量
        page: 当前页码
        page_size: 每页数量
        has_more: 是否还有更多数据
    """
    query = db.query(Repository)

    # 搜索筛选（支持模糊搜索仓库信息和分类名称）
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            (Repository.name.ilike(like)) |
            (Repository.owner.ilike(like)) |
            (Repository.repo_name.ilike(like)) |
            (Repository.description.ilike(like)) |
            (Repository.category.has(Category.name.ilike(like)))
        )

    # 分类筛选
    if category_id:
        query = query.filter(Repository.category_id == category_id)

    # 按最新入库时间排序
    query = query.order_by(Repository.added_at.desc())

    # 获取总数
    total = query.count()

    # 分页
    offset = (page - 1) * page_size
    repositories = query.offset(offset).limit(page_size).all()

    return {
        "items": [repository_to_dict(r) for r in repositories],
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": (page * page_size) < total
    }


@app.post("/api/repositories")
async def create_repository(
        repository: RepositoryCreate,
        background_tasks: BackgroundTasks,
        current_admin: Admin = Depends(get_current_admin),
        db: Session = Depends(get_db)
):
    # 根据auto_llm_summary字段决定是否必填描述
    if not repository.auto_llm_summary:
        # 不使用自动LLM摘要时，描述必填
        if not repository.description or not repository.description.strip():
            raise HTTPException(status_code=400, detail="项目描述不能为空")
    else:
        # 使用自动LLM摘要时，描述默认为GitHub URL
        if not repository.description or not repository.description.strip():
            repository.description = repository.github_url

    # 解析GitHub URL获取owner和repo_name
    try:
        if "github.com" in repository.github_url:
            parts = repository.github_url.strip("/").split("/")
            if len(parts) >= 2:
                owner = parts[-2]
                repo_name = parts[-1]
            else:
                raise HTTPException(status_code=400, detail="无效的GitHub URL")
        else:
            raise HTTPException(status_code=400, detail="请提供有效的GitHub URL")
    except Exception:
        raise HTTPException(status_code=400, detail="无效的GitHub URL格式")

    # 检查分类是否存在
    category = db.query(Category).filter(Category.id == repository.category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="分类不存在")

    # 检查URL是否已存在
    existing_repo = db.query(Repository).filter(Repository.github_url == repository.github_url).first()
    if existing_repo:
        raise HTTPException(status_code=400, detail="该仓库已存在")

    db_repository = Repository(
        name=repository.name,
        github_url=repository.github_url,
        owner=owner,
        repo_name=repo_name,
        category_id=repository.category_id,
        description=repository.description.strip()
    )
    db.add(db_repository)
    db.commit()
    db.refresh(db_repository)

    # 如果启用了自动LLM摘要，添加后台任务
    if repository.auto_llm_summary:
        background_tasks.add_task(
            update_repository_llm_summary,
            db_repository.id,
            repository.github_url
        )

    return {"id": db_repository.id, "name": db_repository.name, "github_url": db_repository.github_url}


@app.get("/admin", response_class=HTMLResponse)
async def admin_login_page(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get("access_token")
    if token:
        try:
            # 如果已有有效会话，直接进入后台
            _ = get_current_admin(token, db)
            return RedirectResponse(url="/admin/dashboard")
        except HTTPException:
            pass
    return templates.TemplateResponse("admin_login.html", {"request": request})


@app.post("/admin/login")
async def admin_login(request: Request, username: str = Form(...), password: str = Form(...),
                      db: Session = Depends(get_db)):
    admin = authenticate_admin(username, password, db)
    if not admin:
        return templates.TemplateResponse("admin_login.html", {
            "request": request,
            "error": "用户名或密码错误"
        })

    access_token = create_access_token(
        data={"sub": admin.username},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    response = RedirectResponse(url="/admin/dashboard", status_code=303)
    # 记住会话：设置持久化 Cookie，持续到令牌过期
    max_age = ACCESS_TOKEN_EXPIRE_MINUTES * 60
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=max_age,
        samesite="lax",
        path="/"
    )
    return response


@app.get("/admin/dashboard", response_class=HTMLResponse)
async def admin_dashboard(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get("access_token")
    if not token:
        return RedirectResponse(url="/admin")

    try:
        current_admin = get_current_admin(token, db)
    except HTTPException:
        return RedirectResponse(url="/admin")

    categories = db.query(Category).all()
    repositories = db.query(Repository).order_by(Repository.added_at.desc()).limit(20).all()

    return templates.TemplateResponse("admin_dashboard.html", {
        "request": request,
        "admin": current_admin,
        "categories": categories,
        "repositories": repositories
    })


@app.get("/admin/configs", response_class=HTMLResponse)
async def admin_configs_page(request: Request, db: Session = Depends(get_db)):
    """配置管理页面"""
    token = request.cookies.get("access_token")
    if not token:
        return RedirectResponse(url="/admin")

    try:
        current_admin = get_current_admin(token, db)
    except HTTPException:
        return RedirectResponse(url="/admin")

    configs = db.query(Config).all()
    return templates.TemplateResponse("admin_configs.html", {
        "request": request,
        "admin": current_admin,
        "configs": configs
    })


@app.get("/admin/logout")
async def admin_logout():
    response = RedirectResponse(url="/admin")
    response.delete_cookie("access_token")
    return response


# 管理后台仓库列表（分页与筛选）
@app.get("/api/admin/repositories")
async def admin_list_repositories(
        request: Request,
        db: Session = Depends(get_db),
        q: Optional[str] = Query(None),
        category_id: Optional[int] = Query(None),
        page: int = Query(1, ge=1),
        page_size: int = Query(20, ge=1, le=100)
):
    token = request.cookies.get("access_token")
    try:
        _ = get_current_admin(token, db)
    except Exception:
        raise HTTPException(status_code=401, detail="未授权")

    query = db.query(Repository)
    if category_id:
        query = query.filter(Repository.category_id == category_id)
    if q:
        like = f"%{q}%"
        query = query.filter(
            (Repository.name.ilike(like)) |
            (Repository.owner.ilike(like)) |
            (Repository.repo_name.ilike(like)) |
            (Repository.description.ilike(like)) |
            (Repository.category.has(Category.name.ilike(like)))
        )

    total = query.count()
    items = query.order_by(Repository.added_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": [repository_to_dict(r) for r in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": (page * page_size) < total
    }


@app.put("/api/repositories/{repository_id}")
async def update_repository(repository_id: int, repository: RepositoryCreate,
                            current_admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    db_repository = db.query(Repository).filter(Repository.id == repository_id).first()
    if not db_repository:
        raise HTTPException(status_code=404, detail="仓库不存在")

    # 验证描述不能为空
    if not repository.description or not repository.description.strip():
        raise HTTPException(status_code=400, detail="项目描述不能为空")

    # 解析GitHub URL
    try:
        if "github.com" in repository.github_url:
            parts = repository.github_url.strip("/").split("/")
            if len(parts) >= 2:
                owner = parts[-2]
                repo_name = parts[-1]
            else:
                raise HTTPException(status_code=400, detail="无效的GitHub URL")
        else:
            raise HTTPException(status_code=400, detail="请提供有效的GitHub URL")
    except Exception:
        raise HTTPException(status_code=400, detail="无效的GitHub URL格式")

    # 检查分类是否存在
    category = db.query(Category).filter(Category.id == repository.category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="分类不存在")

    db_repository.name = repository.name
    db_repository.github_url = repository.github_url
    db_repository.owner = owner
    db_repository.repo_name = repo_name
    db_repository.category_id = repository.category_id
    db_repository.description = repository.description.strip()

    db.commit()
    return {"message": "仓库已更新"}


@app.delete("/api/repositories/{repository_id}")
async def delete_repository(repository_id: int, current_admin: Admin = Depends(get_current_admin),
                            db: Session = Depends(get_db)):
    repository = db.query(Repository).filter(Repository.id == repository_id).first()
    if not repository:
        raise HTTPException(status_code=404, detail="仓库不存在")

    db.delete(repository)
    db.commit()
    return {"message": "仓库已删除"}


# ========== 配置管理 API ==========
@app.get("/api/admin/configs")
async def get_configs(current_admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """获取所有配置"""
    configs = db.query(Config).all()
    return [{"key": c.key, "value": c.value, "description": c.description} for c in configs]


@app.put("/api/admin/configs")
async def update_configs(
        configs: dict,
        current_admin: Admin = Depends(get_current_admin),
        db: Session = Depends(get_db)
):
    """批量更新配置"""
    for key, value in configs.items():
        config = db.query(Config).filter(Config.key == key).first()
        if config:
            config.value = value
        else:
            new_config = Config(key=key, value=value)
            db.add(new_config)
    db.commit()
    return {"message": "配置已更新"}


# ========== LLM 摘要 API ==========
@app.post("/api/repositories/generate-summary")
async def api_generate_summary(
        data: dict,
        current_admin: Admin = Depends(get_current_admin),
        db: Session = Depends(get_db)
):
    """生成仓库摘要"""
    github_url = data.get("github_url")
    if not github_url:
        raise HTTPException(status_code=400, detail="缺少 github_url 参数")

    result = await generate_repo_summary(github_url, db)
    if result["success"]:
        return {"success": True, "summary": result["summary"]}
    else:
        return {"success": False, "error": result["error"]}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
