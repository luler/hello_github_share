import io
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
from typing import Dict, List, Optional, Tuple

# BookmarkHub 书签数据的 Gist 原始链接
bookmarkhub_content_url = 'https://gist.githubusercontent.com/luler/xxxx/raw/xxxxx'
# 书签树中要同步的根路径，用 => 分隔层级
bookmarkhub_base_path = 'ToolbarFolder=>开源免费'

# GitShare 服务地址及管理员账号
gitshare_url = 'http://127.0.0.1:8000'
gitshare_admin_name = 'admin'
gitshare_admin_pass = 'admin123'


def fetch_bookmarkhub_content() -> dict:
    with urllib.request.urlopen(bookmarkhub_content_url, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))


def find_node_by_path(bookmarks: List[dict], path_expr: str) -> Optional[dict]:
    segments = [seg.strip() for seg in path_expr.split('=>') if seg.strip()]
    if not segments:
        return None

    current_list = bookmarks
    current_node = None

    for seg in segments:
        matched = None
        for item in current_list:
            if item.get('title') == seg:
                matched = item
                break
        if not matched:
            return None
        current_node = matched
        current_list = matched.get('children') or []

    return current_node


def collect_links(nodes: List[dict], folder_path: List[str], out: List[dict]):
    for node in nodes:
        title = (node.get('title') or '').strip()
        url = (node.get('url') or '').strip()
        children = node.get('children') or []

        if url:
            out.append({
                'title': title,
                'url': url,
                'path': folder_path.copy()
            })

        if children:
            next_path = folder_path + ([title] if title else [])
            collect_links(children, next_path, out)


def normalize_github_url(url: str) -> Optional[str]:
    match = re.search(r'https?://(?:www\.)?github\.com/([^/\s?#]+)/([^/\s?#]+)', url, re.IGNORECASE)
    if not match:
        return None

    owner = match.group(1)
    repo = match.group(2).removesuffix('.git')
    return f'https://github.com/{owner}/{repo}'


def create_api_client() -> Tuple[urllib.request.OpenerDirector, CookieJar]:
    cookie_jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))
    return opener, cookie_jar


def login(opener: urllib.request.OpenerDirector):
    form_data = urllib.parse.urlencode({'username': gitshare_admin_name, 'password': gitshare_admin_pass}).encode(
        'utf-8')
    req = urllib.request.Request(
        urllib.parse.urljoin(gitshare_url, '/admin/login'),
        data=form_data,
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
        method='POST'
    )
    opener.open(req, timeout=20).read()


def api_json_request(opener: urllib.request.OpenerDirector, method: str, path: str, payload: Optional[dict] = None):
    url = urllib.parse.urljoin(gitshare_url, path)
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        headers['Content-Type'] = 'application/json'

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with opener.open(req, timeout=30) as resp:
        body = resp.read().decode('utf-8')
        return json.loads(body) if body else None


def load_existing_categories(opener: urllib.request.OpenerDirector) -> Dict[Tuple[Optional[int], str], int]:
    categories = api_json_request(opener, 'GET', '/api/categories/flat') or []
    mapping = {}
    for cat in categories:
        mapping[(cat.get('parent_id'), cat.get('name'))] = cat.get('id')
    return mapping


def ensure_category_path(
        opener: urllib.request.OpenerDirector,
        category_map: Dict[Tuple[Optional[int], str], int],
        path_segments: List[str]
) -> int:
    parent_id = None
    used_segments = [seg.strip() for seg in path_segments if seg and seg.strip()][:3]
    if not used_segments:
        used_segments = ['未分类']

    for seg in used_segments:
        key = (parent_id, seg)
        if key not in category_map:
            created = api_json_request(opener, 'POST', '/api/categories', {
                'name': seg,
                'parent_id': parent_id
            })
            category_map[key] = created['id']
        parent_id = category_map[key]

    return parent_id


def load_existing_repositories(opener: urllib.request.OpenerDirector) -> List[dict]:
    """加载所有现有仓库，返回包含 id, github_url, category_id 的列表"""
    repos = []
    page = 1
    while True:
        data = api_json_request(opener, 'GET', f'/api/admin/repositories?page={page}&page_size=100') or {}
        for item in data.get('items', []):
            repos.append({
                'id': item.get('id'),
                'github_url': item.get('github_url'),
                'category_id': item.get('category_id'),
                'name': item.get('name')
            })
        if not data.get('has_more'):
            break
        page += 1
    return repos


def load_categories_with_details(opener: urllib.request.OpenerDirector) -> Dict[int, dict]:
    """加载所有分类，返回 id -> {name, parent_id, children_ids, repo_count} 的映射"""
    categories = api_json_request(opener, 'GET', '/api/categories/flat') or []
    cat_map = {}
    for cat in categories:
        cat_map[cat['id']] = {
            'id': cat['id'],
            'name': cat.get('name'),
            'parent_id': cat.get('parent_id'),
            'children_ids': set(),
            'repo_count': 0
        }
    # 建立父子关系
    for cat_id, cat in cat_map.items():
        parent_id = cat['parent_id']
        if parent_id and parent_id in cat_map:
            cat_map[parent_id]['children_ids'].add(cat_id)
    return cat_map


def update_repository_category(opener: urllib.request.OpenerDirector, repo_id: int, category_id: int, name: str,
                               github_url: str):
    """更新仓库的分类"""
    api_json_request(opener, 'PUT', f'/api/repositories/{repo_id}', {
        'name': name,
        'github_url': github_url,
        'category_id': category_id,
        'description': github_url
    })


def delete_empty_categories(opener: urllib.request.OpenerDirector, cat_map: Dict[int, dict]):
    """删除空目录（没有仓库且没有非空子目录的目录）"""
    deleted_count = 0

    def is_empty(cat_id: int) -> bool:
        """递归判断目录是否为空（无仓库且所有子目录也为空）"""
        cat = cat_map.get(cat_id)
        if not cat:
            return True
        # 有仓库则非空
        if cat['repo_count'] > 0:
            return False
        # 检查子目录
        for child_id in list(cat['children_ids']):
            if not is_empty(child_id):
                return False
        return True

    # 从叶子节点向上删除，循环直到没有可删除的
    while True:
        deleted_in_round = False
        # 按层级从深到浅排序（通过 parent_id 依赖关系）
        # 先尝试删除所有空目录
        for cat_id in list(cat_map.keys()):
            cat = cat_map[cat_id]
            if is_empty(cat_id):
                try:
                    api_json_request(opener, 'DELETE', f'/api/categories/{cat_id}')
                    # 更新父目录的 children_ids
                    parent_id = cat['parent_id']
                    if parent_id and parent_id in cat_map:
                        cat_map[parent_id]['children_ids'].discard(cat_id)
                    del cat_map[cat_id]
                    deleted_count += 1
                    deleted_in_round = True
                except urllib.error.HTTPError:
                    # 删除失败则跳过
                    pass
        if not deleted_in_round:
            break

    return deleted_count


def main():
    try:
        content = fetch_bookmarkhub_content()
        root_node = find_node_by_path(content.get('bookmarks') or [], bookmarkhub_base_path)

        if not root_node:
            raise RuntimeError(f'未找到路径: {bookmarkhub_base_path}')

        links = []
        collect_links(root_node.get('children') or [], [], links)

        opener, cookie_jar = create_api_client()
        login(opener)

        if not any(cookie.name == 'access_token' for cookie in cookie_jar):
            raise RuntimeError('登录失败：未获取 access_token')

        category_map = load_existing_categories(opener)
        existing_repos = load_existing_repositories(opener)

        # 构建 github_url -> repo 的映射
        url_to_repo = {}
        for repo in existing_repos:
            if repo['github_url']:
                url_to_repo[repo['github_url']] = repo

        created_count = 0
        skip_non_github_count = 0
        updated_category_count = 0
        failed_count = 0

        # 构建 category_id -> repo_count 的统计
        cat_map = load_categories_with_details(opener)
        # 用已有仓库的分类初始化 repo_count，避免误删有仓库的分类
        for repo in existing_repos:
            cat_id = repo.get('category_id')
            if cat_id and cat_id in cat_map:
                cat_map[cat_id]['repo_count'] += 1

        # 处理远程书签中的仓库（同一 URL 只处理第一次出现，避免重复分类在不同路径间反复切换）
        seen_urls = set()
        for item in links:
            normalized_url = normalize_github_url(item['url'])
            if not normalized_url:
                skip_non_github_count += 1
                continue
            if normalized_url in seen_urls:
                continue
            seen_urls.add(normalized_url)

            # 确保 category_path 存在，并获取 category_id
            category_id = ensure_category_path(opener, category_map, item['path'])

            if normalized_url in url_to_repo:
                # 仓库已存在，检查分类是否需要更新
                repo = url_to_repo[normalized_url]
                repo_cat_id = repo.get('category_id')
                # 统一转换为 int 比较
                if repo_cat_id is not None:
                    repo_cat_id = int(repo_cat_id)
                if repo_cat_id != category_id:
                    # 分类变更，更新仓库
                    try:
                        # 从 URL 提取 owner/repo 格式
                        parts = normalized_url.rstrip('/').split('/')
                        repo_name = f"{parts[-2]}/{parts[-1]}" if len(parts) >= 2 else parts[-1]
                        update_repository_category(opener, repo['id'], category_id, repo_name, normalized_url)
                        # 更新统计
                        old_cat_id = repo.get('category_id')
                        if old_cat_id and old_cat_id in cat_map:
                            cat_map[old_cat_id]['repo_count'] -= 1
                        if category_id in cat_map:
                            cat_map[category_id]['repo_count'] += 1
                        repo['category_id'] = category_id
                        updated_category_count += 1
                    except urllib.error.HTTPError as e:
                        failed_count += 1
                        error_body = e.read().decode('utf-8', errors='ignore')
                        print(f"更新分类失败: {normalized_url} -> {e.code}, {error_body}")
            else:
                # 新仓库，创建
                # 从 URL 提取 owner/repo 格式
                parts = normalized_url.rstrip('/').split('/')
                repo_name = f"{parts[-2]}/{parts[-1]}" if len(parts) >= 2 else parts[-1]
                payload = {
                    'name': repo_name,
                    'github_url': normalized_url,
                    'category_id': category_id,
                    'description': '',
                    'auto_llm_summary': True
                }
                try:
                    api_json_request(opener, 'POST', '/api/repositories', payload)
                    url_to_repo[normalized_url] = {'id': None, 'github_url': normalized_url, 'category_id': category_id}
                    if category_id in cat_map:
                        cat_map[category_id]['repo_count'] += 1
                    created_count += 1
                except urllib.error.HTTPError as e:
                    failed_count += 1
                    error_body = e.read().decode('utf-8', errors='ignore')
                    print(f"创建失败: {normalized_url} -> {e.code}, {error_body}")

        # 删除空目录
        deleted_categories = delete_empty_categories(opener, cat_map)

        print('同步完成:')
        print(f'- 新增仓库: {created_count}')
        print(f'- 分类变更更新: {updated_category_count}')
        print(f'- 非 GitHub 链接跳过: {skip_non_github_count}')
        print(f'- 删除空目录: {deleted_categories}')
        print(f'- 失败数量: {failed_count}')

    except urllib.error.URLError as e:
        exit(f"请求失败: {e}")
    except Exception as e:
        exit(f"执行失败: {e}")


if __name__ == '__main__':
    main()
