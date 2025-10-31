console.log("category_tree.js 已加载");

document.addEventListener('DOMContentLoaded', () => {
    const autoEl = document.getElementById('category-tree');
    if (autoEl) {
        const selectedAttr = autoEl.getAttribute('data-selected-id');
        const selectedId = selectedAttr ? parseInt(selectedAttr, 10) : null;
        initCategoryTree('category-tree', selectedId);
    }

    // 页面加载时，如果URL有category_id参数，更新显示的分类标题
    const url = new URL(window.location.href);
    const categoryId = url.searchParams.get('category_id');
    if (categoryId) {
        // 延迟执行，等待分类树加载完成
        setTimeout(() => {
            const categoryName = getCategoryNameById(parseInt(categoryId, 10));
            if (categoryName) {
                updatePageTitle(categoryName);
            }
        }, 100);
    }
});

const EXPANDED_KEY = 'categoryTreeExpanded';

async function initCategoryTree(containerId, selectedCategoryId = null) {
    try {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '<div class="loading">正在加载分类树...</div>';

        const res = await fetch('/api/categories/public');
        const categories = await res.json();

        const expandedSet = new Set(loadExpanded());

        const activePath = selectedCategoryId ? findPath(categories, selectedCategoryId) : [];
        activePath.forEach(id => expandedSet.add(id));

        const treeRoot = document.createElement('ul');
        treeRoot.className = 'category-tree';

        categories.forEach(cat => {
            const node = buildTreeNode(cat, 1, selectedCategoryId, expandedSet);
            if (node) treeRoot.appendChild(node);
        });
        container.innerHTML = "";
        container.appendChild(treeRoot);
        // 绑定分类搜索框事件
        const searchInput = document.getElementById("category-search-input");
        if (searchInput) {
            let t;
            searchInput.addEventListener("input", e => {
                clearTimeout(t);
                t = setTimeout(() => filterTree(treeRoot, e.target.value.trim().toLowerCase(), expandedSet), 150);
            });
        }

    } catch (err) {
        console.error('加载分类树失败:', err);
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = '<div class="loading">加载失败</div>';
    }
}

function buildTreeNode(category, depth, selectedCategoryId, expandedSet) {
    if (depth > 3) return null;

    const li = document.createElement('li');
    li.className = 'tree-item';
    li.dataset.id = String(category.id);
    li.dataset.name = category.name.toLowerCase();

    const row = document.createElement('div');
    row.className = 'tree-row';

    const hasChildren = Array.isArray(category.children) && category.children.length > 0 && depth < 3;

    if (hasChildren) {
        const btn = document.createElement('button');
        btn.className = 'tree-toggle';
        btn.setAttribute('aria-label', '展开/折叠');
        btn.innerHTML = getChevronSvg();
        row.appendChild(btn);
        btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            toggleNode(li, expandedSet);
        });
    } else {
        const spacer = document.createElement('span');
        spacer.className = 'tree-toggle-spacer';
        row.appendChild(spacer);
    }

    const link = document.createElement('a');
    link.className = 'tree-link';
    link.textContent = `${category.name}`;
    link.href = `/?category_id=${category.id}`;
    link.dataset.categoryId = category.id;

    // 添加点击事件处理，实现SPA行为
    link.addEventListener("click", (e) => {
        e.preventDefault();
        handleCategoryClick(category.id, category.name);
    });
    if (selectedCategoryId && category.id === selectedCategoryId) {
        link.classList.add('active');
    }

    const repoCount = countCategoryRepositories(category);
    const countEl = document.createElement('span');
    countEl.className = 'repo-count';
    countEl.textContent = ` ${repoCount}`;
    row.appendChild(link);
    row.appendChild(countEl);
    li.appendChild(row);

    let subtree = null;
    if (hasChildren) {
        subtree = document.createElement('ul');
        subtree.className = 'category-subtree';
        category.children.forEach(child => {
            const childNode = buildTreeNode(child, depth + 1, selectedCategoryId, expandedSet);
            if (childNode) subtree.appendChild(childNode);
        });
        li.appendChild(subtree);
    }

    // initial expanded state
    if (expandedSet.has(category.id)) {
        li.classList.add('expanded');
        if (subtree) subtree.style.display = 'block';
    } else if (subtree) {
        subtree.style.display = 'none';
    }

    return li;
}

function toggleNode(li, expandedSet) {
    const id = parseInt(li.dataset.id, 10);
    const subtree = li.querySelector(':scope > ul.category-subtree');
    const chevron = li.querySelector(':scope > .tree-row .tree-toggle svg');
    const willExpand = !li.classList.contains('expanded');
    li.classList.toggle('expanded', willExpand);
    if (chevron) chevron.style.transform = willExpand ? 'rotate(90deg)' : 'rotate(0deg)';
    if (subtree) animateToggle(subtree, willExpand);

    if (willExpand) expandedSet.add(id); else expandedSet.delete(id);
    saveExpanded([...expandedSet]);
}

function animateToggle(el, expand) {
    el.style.overflow = 'hidden';
    if (expand) {
        el.style.display = 'block';
        const h = el.scrollHeight;
        el.style.height = '0px';
        el.offsetHeight; // force reflow
        el.style.transition = 'height 160ms ease';
        el.style.height = h + 'px';
        setTimeout(() => {
            el.style.height = '';
            el.style.transition = '';
            el.style.overflow = '';
        }, 200);
    } else {
        const h = el.scrollHeight;
        el.style.height = h + 'px';
        el.offsetHeight;
        el.style.transition = 'height 160ms ease';
        el.style.height = '0px';
        setTimeout(() => {
            el.style.display = 'none';
            el.style.height = '';
            el.style.transition = '';
            el.style.overflow = '';
        }, 180);
    }
}

function findPath(nodes, targetId, path = []) {
    for (const n of nodes) {
        const next = [...path, n.id];
        if (n.id === targetId) return next;
        if (n.children && n.children.length) {
            const p = findPath(n.children, targetId, next);
            if (p.length) return p;
        }
    }
    return [];
}

function filterTree(rootEl, term, expandedSet) {
    const items = rootEl.querySelectorAll('li.tree-item');
    if (!term) {
        items.forEach(li => {
            li.style.display = '';
        });
        // restore display based on expandedSet
        rootEl.querySelectorAll('ul.category-subtree').forEach(ul => {
            const parent = ul.parentElement;
            const id = parseInt(parent.dataset.id, 10);
            const expanded = expandedSet.has(id);
            ul.style.display = expanded ? 'block' : 'none';
            parent.classList.toggle('expanded', expanded);
            const chevron = parent.querySelector(':scope > .tree-row .tree-toggle svg');
            if (chevron) chevron.style.transform = expanded ? 'rotate(90deg)' : 'rotate(0deg)';
        });
        return;
    }

    items.forEach(li => {
        const name = li.dataset.name || '';
        const isMatch = name.includes(term);
        li.dataset.match = isMatch ? '1' : '0';
    });

    // show items that match or have matching descendants
    items.forEach(li => {
        const descendantsMatch = li.querySelector('li.tree-item[data-match="1"]') != null;
        const isMatch = li.dataset.match === '1';
        const show = isMatch || descendantsMatch;
        li.style.display = show ? '' : 'none';
        // expand branches that contain a match
        const subtree = li.querySelector(':scope > ul.category-subtree');
        const chevron = li.querySelector(':scope > .tree-row .tree-toggle svg');
        if (subtree) {
            subtree.style.display = show ? 'block' : 'none';
            li.classList.toggle('expanded', show);
            if (chevron) chevron.style.transform = show ? 'rotate(90deg)' : 'rotate(0deg)';
        }
    });
}

function loadExpanded() {
    try {
        const raw = localStorage.getItem(EXPANDED_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveExpanded(arr) {
    try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify(arr));
    } catch {
    }
}

function countCategoryRepositories(category) {
    // 只统计当前分类自己的仓库数量，不累加子分类
    return (category.repositories || []).length;
}

function getChevronSvg() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform .16s ease;"><polyline points="9 18 15 12 9 6"></polyline></svg>';
}

/**
 * 处理分类点击事件 - 实现SPA行为
 * 点击分类时清空搜索参数
 */
function handleCategoryClick(categoryId, categoryName) {
    console.log('分类点击:', categoryId, categoryName);

    // 清空搜索输入框
    const searchInput = document.getElementById('repo-search-input');
    if (searchInput) {
        searchInput.value = '';
    }

    // 更新URL（不刷新页面），清除q参数，只保留category_id
    const url = new URL(window.location.href);
    url.searchParams.set('category_id', categoryId);
    url.searchParams.delete('q');  // 清除搜索参数
    window.history.pushState({categoryId, categoryName, query: null}, '', url);

    // 更新页面标题和SEO meta信息
    updatePageMetadata(categoryName);

    // 更新页面显示的分类标题
    updatePageTitle(categoryName);

    // 调用RepositoryManager重新加载数据（只传递分类ID，不传递搜索查询）
    if (window.RepositoryManager && typeof window.RepositoryManager.reset === 'function') {
        console.log('调用RepositoryManager重新加载数据, categoryId:', categoryId, 'query: null');
        window.RepositoryManager.reset(categoryId, null);
    } else {
        console.error('RepositoryManager未找到或reset方法不可用');
    }

    // 更新分类树的选中状态
    updateCategoryHighlight(categoryId);
}

/**
 * 更新页面的标题和meta信息
 */
function updatePageMetadata(categoryName) {
    if (categoryName) {
        // 更新页面标题
        document.title = `${categoryName} - GitHub 开源导航`;

        // 更新meta描述
        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription) {
            metaDescription.setAttribute('content', `精选${categoryName}分类下优质GitHub开源项目，包含${categoryName}相关的代码库和工具，助您快速找到合适的开源项目`);
        }

        // 更新meta关键词
        const metaKeywords = document.querySelector('meta[name="keywords"]');
        if (metaKeywords) {
            metaKeywords.setAttribute('content', `${categoryName},GitHub,开源,代码库,项目导航,开源项目`);
        }

        // 更新Open Graph标题
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) {
            ogTitle.setAttribute('content', `${categoryName} - GitHub 开源导航`);
        }

        // 更新Open Graph描述
        const ogDescription = document.querySelector('meta[property="og:description"]');
        if (ogDescription) {
            ogDescription.setAttribute('content', `发现${categoryName}分类下的优质GitHub开源项目`);
        }

        // 更新Twitter标题
        const twitterTitle = document.querySelector('meta[property="twitter:title"]');
        if (twitterTitle) {
            twitterTitle.setAttribute('content', `${categoryName} - GitHub 开源导航`);
        }

        // 更新Twitter描述
        const twitterDescription = document.querySelector('meta[property="twitter:description"]');
        if (twitterDescription) {
            twitterDescription.setAttribute('content', `发现${categoryName}分类下的优质GitHub开源项目`);
        }
    } else {
        // 恢复默认标题
        document.title = 'GitHub 开源导航';

        // 恢复默认meta描述
        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription) {
            metaDescription.setAttribute('content', '精选GitHub开源项目导航，按分类整理优质开源代码库，帮助开发者快速找到合适的开源项目');
        }

        const metaKeywords = document.querySelector('meta[name="keywords"]');
        if (metaKeywords) {
            metaKeywords.setAttribute('content', 'GitHub,开源,代码库,项目导航,开源项目,编程,开发');
        }

        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) {
            ogTitle.setAttribute('content', 'GitHub 开源导航');
        }

        const ogDescription = document.querySelector('meta[property="og:description"]');
        if (ogDescription) {
            ogDescription.setAttribute('content', '精选GitHub开源项目导航，按分类整理优质开源代码库');
        }

        const twitterTitle = document.querySelector('meta[property="twitter:title"]');
        if (twitterTitle) {
            twitterTitle.setAttribute('content', 'GitHub 开源导航');
        }

        const twitterDescription = document.querySelector('meta[property="twitter:description"]');
        if (twitterDescription) {
            twitterDescription.setAttribute('content', '精选GitHub开源项目导航，按分类整理优质开源代码库');
        }
    }
}

/**
 * 更新页面显示的分类标题
 */
function updatePageTitle(categoryName) {
    const sectionHeader = document.querySelector('.section-header h2');
    if (sectionHeader) {
        if (categoryName) {
            sectionHeader.textContent = categoryName;
        } else {
            sectionHeader.textContent = '最新入库';
        }
    }
}

/**
 * 更新分类树的选中高亮状态
 */
function updateCategoryHighlight(selectedId) {
    const allLinks = document.querySelectorAll('#category-tree .tree-link');
    allLinks.forEach(link => {
        const id = parseInt(link.dataset.categoryId, 10);
        if (id === selectedId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// 暴露到全局作用域，供其他脚本调用
window.updateCategoryHighlight = updateCategoryHighlight;
window.updatePageMetadata = updatePageMetadata;
window.updatePageTitle = updatePageTitle;
window.getCategoryNameById = getCategoryNameById;

/**
 * 处理浏览器前进/后退事件
 * 从URL读取参数并加载对应数据
 */
window.addEventListener('popstate', (e) => {
    console.log('浏览器历史记录变更:', e.state);

    // 从当前URL获取参数
    const url = new URL(window.location.href);
    const categoryId = url.searchParams.get('category_id');
    const query = url.searchParams.get('q');

    // 同步搜索输入框的值
    const searchInput = document.getElementById('repo-search-input');
    if (searchInput) {
        searchInput.value = query || '';
    }

    if (categoryId) {
        // 从state或DOM获取分类名称
        const categoryName = e.state?.categoryName || getCategoryNameById(parseInt(categoryId, 10));

        // 更新页面标题和meta信息
        updatePageMetadata(categoryName);
        updatePageTitle(categoryName);

        // 重新加载对应分类的数据
        if (window.RepositoryManager && typeof window.RepositoryManager.reset === 'function') {
            window.RepositoryManager.reset(categoryId, query);
        }
        updateCategoryHighlight(parseInt(categoryId, 10));
    } else {
        // 回到所有仓库
        updatePageMetadata(null);
        updatePageTitle(null);

        if (window.RepositoryManager && typeof window.RepositoryManager.reset === 'function') {
            window.RepositoryManager.reset(null, query);
        }
        updateCategoryHighlight(null);
    }
});

/**
 * 从DOM中根据分类ID获取分类名称
 */
function getCategoryNameById(categoryId) {
    const link = document.querySelector(`#category-tree .tree-link[data-category-id="${categoryId}"]`);
    return link ? link.textContent.trim().replace(/\s+\d+$/, '') : null;
}
