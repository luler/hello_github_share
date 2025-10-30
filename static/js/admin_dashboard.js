// ============================================
// 树形选择器核心功能
// ============================================

/**
 * 构建分类树形结构
 */
function buildCategoryTree(categories) {
    if (!categories || categories.length === 0) return [];

    const categoryMap = new Map();
    const rootCategories = [];

    categories.forEach(cat => {
        categoryMap.set(cat.id, {
            id: cat.id,
            name: cat.name,
            parent_id: cat.parent_id || null,
            level: cat.level || 0,
            repo_count: cat.repo_count || 0,
            child_count: cat.child_count || 0,
            children: []
        });
    });

    categories.forEach(cat => {
        const node = categoryMap.get(cat.id);
        if (cat.parent_id && categoryMap.has(cat.parent_id)) {
            categoryMap.get(cat.parent_id).children.push(node);
        } else {
            rootCategories.push(node);
        }
    });

    return rootCategories;
}

/**
 * 渲染树形HTML结构 - 与前台样式一致
 */
function renderTreeHTML(nodes, level = 0, expandedIds = new Set(), selectedId = null) {
    let html = '<ul class="category-tree" style="list-style:none; padding-left:' + (level > 0 ? '1rem' : '0.25rem') + '; margin:0;">';

    nodes.forEach(node => {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedIds.has(node.id);
        const isSelected = selectedId == node.id;

        html += `
      <li class="tree-item ${isExpanded ? 'expanded' : ''} ${isSelected ? 'selected' : ''}" data-id="${node.id}" data-level="${level}" style="margin:0.125rem 0;">
        <div class="tree-row" style="display:flex; align-items:center; padding:0.25rem 0.375rem; cursor:pointer; border-radius:8px; gap:0.5rem; transition: background 0.2s ease; ${isSelected ? 'background:#e6f7ff; border:1px solid #91d5ff;' : ''}">
          ${hasChildren ?
            `<button type="button" class="tree-toggle" data-id="${node.id}" style="width:24px; height:24px; display:inline-flex; align-items:center; justify-content:center; border:none; background:transparent; cursor:pointer; border-radius:6px; padding:0;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform .16s ease; transform: rotate(${isExpanded ? '90deg' : '0deg'});">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>` :
            '<span class="tree-toggle-spacer" style="width:24px; height:24px; display:inline-block;"></span>'
        }
          <span class="tree-label" data-id="${node.id}" style="flex:1; user-select:none; font-size:0.95rem; color:var(--gray-800); font-weight: ${isSelected ? '600' : '400'};">${escapeHtml(node.name)}</span>
        </div>
        ${hasChildren && isExpanded ?
            `<div class="tree-children">${renderTreeHTML(node.children, level + 1, expandedIds, selectedId)}</div>` :
            (hasChildren ? `<div class="tree-children" style="display:none;">${renderTreeHTML(node.children, level + 1, expandedIds, selectedId)}</div>` : '')
        }
      </li>
    `;
    });

    html += '</ul>';
    return html;
}

/**
 * 创建简单树形选择器
 */
function createSimpleTreeSelect(containerId, categories, onSelect, currentSelectedId = null) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    const tree = buildCategoryTree(categories);
    const expandedIds = new Set();
    let selectedId = currentSelectedId;

    function render() {
        container.innerHTML = renderTreeHTML(tree, 0, expandedIds, selectedId);
        attachEvents();
    }

    function attachEvents() {
        // 展开/折叠 - 带动画
        container.querySelectorAll('.tree-toggle').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const nodeId = parseInt(toggle.dataset.id);
                const li = toggle.closest('li.tree-item');
                const childrenDiv = li.querySelector(':scope > .tree-children');
                const svg = toggle.querySelector('svg');

                if (expandedIds.has(nodeId)) {
                    expandedIds.delete(nodeId);
                    li.classList.remove('expanded');
                    if (svg) svg.style.transform = 'rotate(0deg)';
                    if (childrenDiv) {
                        childrenDiv.style.display = 'none';
                    }
                } else {
                    expandedIds.add(nodeId);
                    li.classList.add('expanded');
                    if (svg) svg.style.transform = 'rotate(90deg)';
                    if (childrenDiv) {
                        childrenDiv.style.display = 'block';
                    }
                }
            });
        });

        // 选择
        container.querySelectorAll('.tree-label').forEach(label => {
            label.addEventListener('click', (e) => {
                e.stopPropagation();
                const nodeId = parseInt(label.dataset.id);
                selectedId = nodeId;
                const selected = categories.find(c => c.id == nodeId);
                render();
                if (onSelect && selected) {
                    onSelect(selected);
                }
            });
        });

        // hover效果
        container.querySelectorAll('.tree-row').forEach(row => {
            row.addEventListener('mouseenter', function () {
                if (!this.parentElement.classList.contains('selected')) {
                    this.style.background = 'var(--gray-100)';
                }
            });
            row.addEventListener('mouseleave', function () {
                if (!this.parentElement.classList.contains('selected')) {
                    this.style.background = '';
                }
            });
        });
    }

    render();

    return {
        getSelected: () => categories.find(c => c.id == selectedId),
        setSelected: (id) => {
            selectedId = id;
            render();
        },
        expandAll: () => {
            categories.forEach(c => expandedIds.add(c.id));
            render();
        },
        collapseAll: () => {
            expandedIds.clear();
            render();
        }
    };
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}

// ============================================
// 主程序开始
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Tabs
    const tabRepo = document.getElementById('tabRepo');
    const tabCategory = document.getElementById('tabCategory');
    const repoTabContent = document.getElementById('repoTabContent');
    const categoryTabContent = document.getElementById('categoryTabContent');

    function showRepoTab(shouldRefresh = false) {
        repoTabContent.style.display = 'block';
        categoryTabContent.style.display = 'none';
        tabRepo.classList.add('btn-success');
        tabCategory.classList.remove('btn-success');
        document.getElementById('openAddRepository').style.display = 'inline-block';
        document.getElementById('openAddCategory').style.display = 'none';

        // 更新URL参数
        const url = new URL(window.location);
        url.searchParams.set('tab', 'repos');
        window.history.pushState({}, '', url);

        // 刷新数据
        if (shouldRefresh) {
            loadRepos();
        }
    }

    function showCategoryTab(shouldRefresh = false) {
        repoTabContent.style.display = 'none';
        categoryTabContent.style.display = 'block';
        tabCategory.classList.add('btn-success');
        tabRepo.classList.remove('btn-success');
        document.getElementById('openAddCategory').style.display = 'inline-block';
        document.getElementById('openAddRepository').style.display = 'none';

        // 停止仓库列表的定时刷新（因为已经不在仓库管理tab）
        stopRepoAutoRefresh();

        // 更新URL参数
        const url = new URL(window.location);
        url.searchParams.set('tab', 'categories');
        window.history.pushState({}, '', url);

        // 刷新数据
        if (shouldRefresh) {
            loadCategories();
        }
    }

    tabRepo.addEventListener('click', () => showRepoTab(true));
    tabCategory.addEventListener('click', () => showCategoryTab(true));

    // Modal utilities
    const modal = createModal();
    let isModalClosing = false; // 防止重复关闭

    function createModal() {
        const overlay = document.createElement('div');
        overlay.id = 'modalOverlay';
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.4); display:none; align-items:center; justify-content:center; z-index:9999;';
        const panel = document.createElement('div');
        panel.style.cssText = 'background:#fff; border-radius:10px; box-shadow:0 10px 25px rgba(0,0,0,0.2); width:640px; max-width:90%;';
        const header = document.createElement('div');
        header.style.cssText = 'padding:1rem 1.25rem; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;';
        const titleEl = document.createElement('h4');
        titleEl.style.margin = 0;
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.setAttribute('aria-label', '关闭');
        closeBtn.style.cssText = 'border:none; background:transparent; font-size:1.25rem; cursor:pointer;';
        const body = document.createElement('div');
        body.style.cssText = 'padding:1rem 1.25rem;';
        const footer = document.createElement('div');
        footer.style.cssText = 'padding:0.75rem 1.25rem; border-top:1px solid #eee; display:flex; gap:0.5rem; justify-content:flex-end;';
        const okBtn = document.createElement('button');
        okBtn.className = 'btn btn-success';
        okBtn.textContent = '确定';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = '取消';
        header.append(titleEl, closeBtn);
        footer.append(cancelBtn, okBtn);
        panel.append(header, body, footer);
        overlay.append(panel);
        document.body.appendChild(overlay);

        // 统一的关闭处理函数
        const handleClose = (e) => {
            if (e) {
                e.stopPropagation();
                e.preventDefault();
            }
            if (isModalClosing) {
                console.log('弹框正在关闭,忽略重复点击');
                return;
            }
            isModalClosing = true;
            // 清理内容
            body.innerHTML = '';
            titleEl.textContent = '';
            // 延迟关闭,确保状态更新
            setTimeout(() => {
                overlay.style.display = 'none';
                document.body.style.overflow = '';  // 恢复滚动
                isModalClosing = false;
            }, 50);
        };

        closeBtn.addEventListener('click', handleClose);
        cancelBtn.addEventListener('click', handleClose);

        // 点击遮罩关闭(可选)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                handleClose(e);
            }
        });

        return {overlay, titleEl, body, okBtn, handleClose};
    }

    function openModal(title, innerHTML, onSubmit) {
        // 重置关闭状态
        isModalClosing = false;

        modal.titleEl.textContent = title;
        modal.body.innerHTML = innerHTML;

        let isSubmitting = false;

        // 移除旧的事件监听器,绑定新的
        const newOkBtn = modal.okBtn.cloneNode(true);
        modal.okBtn.parentNode.replaceChild(newOkBtn, modal.okBtn);
        modal.okBtn = newOkBtn;

        modal.okBtn.onclick = async (e) => {
            e.stopPropagation();
            e.preventDefault();

            if (isSubmitting) {
                console.log('正在提交,请稍候...');
                return;
            }

            try {
                isSubmitting = true;
                modal.okBtn.textContent = '提交中...';
                modal.okBtn.disabled = true;

                await onSubmit();

                // 提交成功后关闭
                modal.handleClose();
            } catch (e) {
                alert(e?.message || '操作失败');
            } finally {
                isSubmitting = false;
                modal.okBtn.textContent = '确定';
                modal.okBtn.disabled = false;
            }
        };

        modal.overlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';  // 禁用滚动
    }

    // Populate category tree selectors
    let repoCategoryTreeSelect = null;
    let catParentTreeSelect = null;
    let allCategories = [];

    async function populateCategoryTrees() {
        try {
            const resp = await fetch('/api/categories/flat');
            const cats = await resp.json();
            allCategories = cats;

            // 仓库分类筛选树
            const repoCategoryTree = document.getElementById('repo-category-tree');
            if (repoCategoryTree && cats.length > 0) {
                repoCategoryTreeSelect = createSimpleTreeSelect('repo-category-tree', cats, (selected) => {
                    repoState.categoryId = selected.id;
                    const label = document.getElementById('repo-category-label');
                    if (label) label.textContent = selected.name;
                    // 关闭下拉框
                    const dropdown = document.getElementById('repo-category-dropdown');
                    if (dropdown) dropdown.style.display = 'none';
                });
            }

            // 分类父级筛选树
            const catParentTree = document.getElementById('cat-parent-tree');
            if (catParentTree && cats.length > 0) {
                catParentTreeSelect = createSimpleTreeSelect('cat-parent-tree', cats, (selected) => {
                    catState.parentId = selected.id;
                    const label = document.getElementById('cat-parent-label');
                    if (label) label.textContent = selected.name;
                    // 关闭下拉框
                    const dropdown = document.getElementById('cat-parent-dropdown');
                    if (dropdown) dropdown.style.display = 'none';
                });
            }
        } catch (e) {
            console.error('加载分类树失败:', e);
        }
    }

    // 下拉框切换
    const repoCategoryToggle = document.getElementById('repo-category-toggle');
    const repoCategoryDropdown = document.getElementById('repo-category-dropdown');
    const catParentToggle = document.getElementById('cat-parent-toggle');
    const catParentDropdown = document.getElementById('cat-parent-dropdown');

    if (repoCategoryToggle && repoCategoryDropdown) {
        repoCategoryToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = repoCategoryDropdown.style.display === 'block';
            repoCategoryDropdown.style.display = isVisible ? 'none' : 'block';
            // 关闭其他下拉框
            if (catParentDropdown) catParentDropdown.style.display = 'none';
        });

        // 清除选择按钮
        const clearBtn = document.querySelector('.repo-cat-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                repoState.categoryId = '';
                const label = document.getElementById('repo-category-label');
                if (label) label.textContent = '全部分类';
                repoCategoryDropdown.style.display = 'none';
                if (repoCategoryTreeSelect) {
                    repoCategoryTreeSelect.setSelected(null);
                }
            });
        }
    }

    if (catParentToggle && catParentDropdown) {
        catParentToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = catParentDropdown.style.display === 'block';
            catParentDropdown.style.display = isVisible ? 'none' : 'block';
            // 关闭其他下拉框
            if (repoCategoryDropdown) repoCategoryDropdown.style.display = 'none';
        });

        // 清除选择按钮
        const clearBtn = document.querySelector('.cat-parent-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                catState.parentId = '';
                const label = document.getElementById('cat-parent-label');
                if (label) label.textContent = '全部父级';
                catParentDropdown.style.display = 'none';
                if (catParentTreeSelect) {
                    catParentTreeSelect.setSelected(null);
                }
            });
        }
    }

    // 点击外部关闭下拉框
    document.addEventListener('click', (e) => {
        if (repoCategoryDropdown && !repoCategoryToggle.contains(e.target) && !repoCategoryDropdown.contains(e.target)) {
            repoCategoryDropdown.style.display = 'none';
        }
        if (catParentDropdown && !catParentToggle.contains(e.target) && !catParentDropdown.contains(e.target)) {
            catParentDropdown.style.display = 'none';
        }
    });

    // State and loaders
    const catState = {q: '', expandedSet: new Set(loadExpandedCategories())};
    const repoState = {q: '', categoryId: '', page: 1, pageSize: 20};

    // 定时刷新管理
    let repoRefreshTimer = null;
    const REFRESH_INTERVAL = 3000; // 3秒刷新一次

    function startRepoAutoRefresh() {
        // 如果已有定时器，不重复创建
        if (repoRefreshTimer) return;

        console.log('启动仓库列表自动刷新（检测到异步处理中的仓库）');
        repoRefreshTimer = setInterval(() => {
            loadRepos();
        }, REFRESH_INTERVAL);
    }

    function stopRepoAutoRefresh() {
        if (repoRefreshTimer) {
            console.log('停止仓库列表自动刷新（所有异步任务已完成）');
            clearInterval(repoRefreshTimer);
            repoRefreshTimer = null;
        }
    }

    async function loadCategories() {
        const url = new URL(location.origin + '/api/categories');
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error('分类加载失败');
        const data = await res.json();
        renderCategoryTree(data);
    }

    function renderCategoryTree(categories) {
        const cont = document.getElementById('cat-results');
        if (!cont) return;
        cont.innerHTML = '';

        if (!categories || categories.length === 0) {
            cont.innerHTML = '<p class="loading">暂无分类数据</p>';
            return;
        }

        const treeRoot = document.createElement('ul');
        treeRoot.className = 'admin-category-tree';
        treeRoot.id = 'admin-cat-tree-root';

        categories.forEach(cat => {
            const node = buildAdminTreeNode(cat, 1);
            if (node) treeRoot.appendChild(node);
        });

        cont.appendChild(treeRoot);

        // 应用搜索过滤
        if (catState.q) {
            filterAdminTree(treeRoot, catState.q.toLowerCase());
        }
    }

    function buildAdminTreeNode(category, depth) {
        if (depth > 10) return null; // 防止无限递归

        const li = document.createElement('li');
        li.className = 'admin-tree-item';
        li.dataset.id = String(category.id);
        li.dataset.name = (category.name || '').toLowerCase();

        const row = document.createElement('div');
        row.className = 'admin-tree-row';

        const hasChildren = Array.isArray(category.children) && category.children.length > 0;

        // 切换按钮或占位符
        if (hasChildren) {
            const btn = document.createElement('button');
            btn.className = 'admin-tree-toggle';
            btn.setAttribute('aria-label', '展开/折叠');
            btn.innerHTML = getChevronSvg();
            row.appendChild(btn);
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                toggleAdminNode(li);
            });
        } else {
            const spacer = document.createElement('span');
            spacer.className = 'admin-tree-toggle-spacer';
            row.appendChild(spacer);
        }

        // 分类名称
        const nameSpan = document.createElement('span');
        nameSpan.className = 'admin-tree-name';
        nameSpan.textContent = category.name;
        row.appendChild(nameSpan);

        // 统计信息
        const stats = document.createElement('span');
        stats.className = 'admin-tree-stats';
        const repoCount = category.repo_count || 0;
        const childCount = hasChildren ? category.children.length : 0;
        stats.innerHTML = `<span class="stat-badge">ID: ${category.id}</span> <span class="stat-badge">仓库: ${repoCount}</span> <span class="stat-badge">子分类: ${childCount}</span>`;
        row.appendChild(stats);

        // 操作按钮
        const actions = document.createElement('div');
        actions.className = 'admin-tree-actions';
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-sm';
        editBtn.textContent = '修改';
        editBtn.addEventListener('click', () => editCategory(category));
        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-sm btn-secondary';
        delBtn.textContent = '删除';
        delBtn.addEventListener('click', () => deleteCategory(category));
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        row.appendChild(actions);

        li.appendChild(row);

        // 子分类
        let subtree = null;
        if (hasChildren) {
            subtree = document.createElement('ul');
            subtree.className = 'admin-category-subtree';
            category.children.forEach(child => {
                const childNode = buildAdminTreeNode(child, depth + 1);
                if (childNode) subtree.appendChild(childNode);
            });
            li.appendChild(subtree);
        }

        // 初始展开状态
        if (catState.expandedSet.has(category.id)) {
            li.classList.add('expanded');
            if (subtree) subtree.style.display = 'block';
        } else if (subtree) {
            subtree.style.display = 'none';
        }

        return li;
    }

    function toggleAdminNode(li) {
        const id = parseInt(li.dataset.id, 10);
        const subtree = li.querySelector(':scope > ul.admin-category-subtree');
        const chevron = li.querySelector(':scope > .admin-tree-row .admin-tree-toggle svg');
        const willExpand = !li.classList.contains('expanded');

        li.classList.toggle('expanded', willExpand);
        if (chevron) chevron.style.transform = willExpand ? 'rotate(90deg)' : 'rotate(0deg)';
        if (subtree) animateToggle(subtree, willExpand);

        if (willExpand) {
            catState.expandedSet.add(id);
        } else {
            catState.expandedSet.delete(id);
        }
        saveExpandedCategories([...catState.expandedSet]);
    }

    function animateToggle(el, expand) {
        el.style.overflow = 'hidden';
        if (expand) {
            el.style.display = 'block';
            const h = el.scrollHeight;
            el.style.height = '0px';
            el.offsetHeight;
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

    function filterAdminTree(rootEl, term) {
        const items = rootEl.querySelectorAll('li.admin-tree-item');
        if (!term) {
            items.forEach(li => {
                li.style.display = '';
            });
            // 恢复展开状态
            rootEl.querySelectorAll('ul.admin-category-subtree').forEach(ul => {
                const parent = ul.parentElement;
                const id = parseInt(parent.dataset.id, 10);
                const expanded = catState.expandedSet.has(id);
                ul.style.display = expanded ? 'block' : 'none';
                parent.classList.toggle('expanded', expanded);
                const chevron = parent.querySelector(':scope > .admin-tree-row .admin-tree-toggle svg');
                if (chevron) chevron.style.transform = expanded ? 'rotate(90deg)' : 'rotate(0deg)';
            });
            return;
        }

        items.forEach(li => {
            const name = li.dataset.name || '';
            const isMatch = name.includes(term);
            li.dataset.match = isMatch ? '1' : '0';
        });

        // 显示匹配的项或包含匹配后代的项
        items.forEach(li => {
            const descendantsMatch = li.querySelector('li.admin-tree-item[data-match="1"]') != null;
            const isMatch = li.dataset.match === '1';
            const show = isMatch || descendantsMatch;
            li.style.display = show ? '' : 'none';

            const subtree = li.querySelector(':scope > ul.admin-category-subtree');
            const chevron = li.querySelector(':scope > .admin-tree-row .admin-tree-toggle svg');
            if (subtree) {
                subtree.style.display = show ? 'block' : 'none';
                li.classList.toggle('expanded', show);
                if (chevron) chevron.style.transform = show ? 'rotate(90deg)' : 'rotate(0deg)';
            }
        });
    }

    function loadExpandedCategories() {
        try {
            const raw = localStorage.getItem('adminCategoryTreeExpanded');
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    function saveExpandedCategories(arr) {
        try {
            localStorage.setItem('adminCategoryTreeExpanded', JSON.stringify(arr));
        } catch {
        }
    }

    function getChevronSvg() {
        return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform .16s ease;"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    }

    async function loadRepos() {
        const url = new URL(location.origin + '/api/admin/repositories');
        if (repoState.q) url.searchParams.set('q', repoState.q);
        if (repoState.categoryId) url.searchParams.set('category_id', repoState.categoryId);
        url.searchParams.set('page', repoState.page);
        url.searchParams.set('page_size', repoState.pageSize);
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error('仓库加载失败');
        const data = await res.json();
        renderRepoResults(data);
    }

    function renderRepoResults(data) {
        const cont = document.getElementById('repo-results');
        if (!cont) return;
        cont.innerHTML = '';
        if (!data.items || data.items.length === 0) {
            cont.innerHTML = '<p class="loading">暂无仓库数据</p>';
            const info = document.getElementById('repo-page-info');
            if (info) info.textContent = '';
            // 没有数据，停止定时刷新
            stopRepoAutoRefresh();
            return;
        }

        // 检查是否有正在处理中的仓库
        const hasProcessing = data.items.some(r => r.is_processing);

        // 创建表格
        const table = document.createElement('table');
        table.className = 'admin-table';
        table.innerHTML = `
      <thead>
        <tr>
          <th style="width: 60px;">ID</th>
          <th style="width: 180px;">仓库名称</th>
          <th style="width: 320px;">信息卡片</th>
          <th style="width: 300px;">项目描述</th>
          <th style="width: 100px;">分类</th>
          <th style="width: 200px; text-align: right;">操作</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

        const tbody = table.querySelector('tbody');
        data.items.forEach(r => {
            const tr = document.createElement('tr');

            // 构建描述文本，如果正在处理中则添加标签
            let descriptionText = '';
            if (r.is_processing) {
                descriptionText = '<span style="display:inline-block; background:#1890ff; color:white; padding:2px 8px; border-radius:4px; font-size:0.75rem; margin-right:8px; vertical-align:middle;">正在异步LLM摘要中</span>';
            }
            descriptionText += r.description ? escapeHtml(r.description) : '<span style="color: var(--gray-400);">暂无描述</span>';

            // Card URL显示为图片（参考首页实现，不添加点击跳转）
            cardUrlContent = `
          <div style="width: 100%;">
            <img src="${escapeHtml(r.card_url)}?image=1" alt="GitHub 信息卡片" style="width: 100%; max-width: 300px; height: auto; object-fit: contain; border: 1px solid var(--gray-200); border-radius: 4px;"/>
          </div>
        `;

            tr.innerHTML = `
        <td class="col-id">${r.id}</td>
        <td class="col-name"><a href="${escapeHtml(r.github_url)}" target="_blank" style="color: var(--primary); text-decoration: none;">${escapeHtml(r.name)}</a></td>
        <td class="col-card-url">${cardUrlContent}</td>
        <td class="col-description">${descriptionText}</td>
        <td><span class="col-category">${escapeHtml(r.category_name || '-')}</span></td>
        <td class="col-actions">
          <div class="btn-group">
            <button class="btn btn-sm" data-action="edit">修改</button>
            <button class="btn btn-sm btn-danger" data-action="delete">删除</button>
          </div>
        </td>
      `;
            tr.querySelector('[data-action="edit"]').addEventListener('click', () => editRepo(r));
            tr.querySelector('[data-action="delete"]').addEventListener('click', () => deleteRepo(r));
            tbody.appendChild(tr);
        });

        cont.appendChild(table);

        const total = data.total || 0;
        const page = data.page || repoState.page;
        const size = data.page_size || repoState.pageSize;
        const info = document.getElementById('repo-page-info');
        if (info) info.textContent = `第 ${page} 页 / 共 ${Math.ceil(total / size)} 页，${total} 条`;
        const prev = document.getElementById('repo-prev');
        const next = document.getElementById('repo-next');
        if (prev) prev.disabled = page <= 1;
        if (next) next.disabled = page >= Math.ceil(total / size);

        // 根据是否有正在处理的仓库来决定是否启动定时刷新
        if (hasProcessing) {
            startRepoAutoRefresh();
        } else {
            stopRepoAutoRefresh();
        }
    }

    // Event wiring for filters
    const catSearch = document.getElementById('cat-search');
    const catReset = document.getElementById('cat-reset');
    const catQInput = document.getElementById('cat-q');

    // 分类搜索处理函数
    const handleCatSearch = () => {
        catState.q = (document.getElementById('cat-q')?.value || '').trim();
        const rootEl = document.getElementById('admin-cat-tree-root');
        if (rootEl) {
            filterAdminTree(rootEl, catState.q.toLowerCase());
        }
    };

    if (catSearch) catSearch.addEventListener('click', handleCatSearch);

    // 分类搜索输入框回车键支持
    if (catQInput) {
        catQInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleCatSearch();
            }
        });
    }

    if (catReset) catReset.addEventListener('click', () => {
        const q = document.getElementById('cat-q');
        if (q) q.value = '';
        catState.q = '';
        const rootEl = document.getElementById('admin-cat-tree-root');
        if (rootEl) {
            filterAdminTree(rootEl, '');
        }
    });

    // 全部展开按钮
    const catExpandAll = document.getElementById('cat-expand-all');
    if (catExpandAll) {
        catExpandAll.addEventListener('click', () => {
            const rootEl = document.getElementById('admin-cat-tree-root');
            if (!rootEl) return;
            const items = rootEl.querySelectorAll('li.admin-tree-item');
            items.forEach(li => {
                const id = parseInt(li.dataset.id, 10);
                const subtree = li.querySelector(':scope > ul.admin-category-subtree');
                if (subtree) {
                    li.classList.add('expanded');
                    subtree.style.display = 'block';
                    const chevron = li.querySelector(':scope > .admin-tree-row .admin-tree-toggle svg');
                    if (chevron) chevron.style.transform = 'rotate(90deg)';
                    catState.expandedSet.add(id);
                }
            });
            saveExpandedCategories([...catState.expandedSet]);
        });
    }

    // 全部收起按钮
    const catCollapseAll = document.getElementById('cat-collapse-all');
    if (catCollapseAll) {
        catCollapseAll.addEventListener('click', () => {
            const rootEl = document.getElementById('admin-cat-tree-root');
            if (!rootEl) return;
            const items = rootEl.querySelectorAll('li.admin-tree-item');
            items.forEach(li => {
                const id = parseInt(li.dataset.id, 10);
                const subtree = li.querySelector(':scope > ul.admin-category-subtree');
                if (subtree) {
                    li.classList.remove('expanded');
                    subtree.style.display = 'none';
                    const chevron = li.querySelector(':scope > .admin-tree-row .admin-tree-toggle svg');
                    if (chevron) chevron.style.transform = 'rotate(0deg)';
                    catState.expandedSet.delete(id);
                }
            });
            saveExpandedCategories([...catState.expandedSet]);
        });
    }

    const repoSearch = document.getElementById('repo-search');
    const repoReset = document.getElementById('repo-reset');
    const repoQInput = document.getElementById('repo-q');

    // 仓库搜索处理函数
    const handleRepoSearch = () => {
        repoState.q = (document.getElementById('repo-q')?.value || '').trim();
        // repoState.categoryId 已经通过树形选择器设置
        repoState.page = 1;
        repoState.pageSize = parseInt(document.getElementById('repo-page-size')?.value || '20', 10);
        loadRepos();
    };

    if (repoSearch) repoSearch.addEventListener('click', handleRepoSearch);

    // 仓库搜索输入框回车键支持
    if (repoQInput) {
        repoQInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleRepoSearch();
            }
        });
    }
    if (repoReset) repoReset.addEventListener('click', () => {
        const q = document.getElementById('repo-q');
        const s = document.getElementById('repo-page-size');
        if (q) q.value = '';
        if (s) s.value = '20';
        repoState.q = '';
        repoState.categoryId = '';
        repoState.page = 1;
        repoState.pageSize = 20;
        // 重置树形选择器
        const label = document.getElementById('repo-category-label');
        if (label) label.textContent = '全部分类';
        if (repoCategoryTreeSelect) repoCategoryTreeSelect.setSelected(null);
        loadRepos();
    });
    const repoPrev = document.getElementById('repo-prev');
    const repoNext = document.getElementById('repo-next');
    if (repoPrev) repoPrev.addEventListener('click', () => {
        if (repoState.page > 1) {
            repoState.page--;
            loadRepos();
        }
    });
    if (repoNext) repoNext.addEventListener('click', () => {
        repoState.page++;
        loadRepos();
    });

    // Add buttons
    const addCatBtn = document.getElementById('openAddCategory');
    if (addCatBtn) addCatBtn.addEventListener('click', () => {
        let selectedParentId = null;

        openModal('添加分类', `
      <div class="form-group">
        <label>分类名称 <span style="color:red;">*</span></label>
        <input type="text" id="modal-cat-name" style="width:100%; padding:8px; border:1px solid #d9d9d9; border-radius:4px;" />
      </div>
      <div class="form-group">
        <label>父级分类 <span style="color:#999; font-size:12px;">(可选,不选则创建为顶级分类)</span></label>
        <div id="modal-cat-tree-container" style="border:1px solid #d9d9d9; border-radius:4px; padding:8px; max-height:300px; overflow-y:auto; background:#fafafa;">
          <div style="color:#999; padding:20px; text-align:center;">加载分类数据中...</div>
        </div>
        <div id="modal-cat-selected" style="margin-top:8px; color:#666; font-size:14px;">未选择(将创建为顶级分类)</div>
      </div>
    `, async () => {
            const name = (document.getElementById('modal-cat-name')?.value || '').trim();
            if (!name) throw new Error('请填写分类名称');

            const res = await fetch('/api/categories', {
                method: 'POST',
                headers: {'Content-Type': 'application/json; charset=UTF-8'},
                body: JSON.stringify({
                    name,
                    parent_id: selectedParentId ? parseInt(selectedParentId, 10) : null
                })
            });

            if (!res.ok) throw new Error('添加失败');
            await populateCategoryTrees();
            loadCategories();
        });

        // 异步加载分类数据并创建树形选择器
        fetch('/api/categories/flat')
            .then(r => {
                if (!r.ok) throw new Error('加载分类失败');
                return r.json();
            })
            .then(cats => {
                const container = document.getElementById('modal-cat-tree-container');
                const selectedDisplay = document.getElementById('modal-cat-selected');

                if (!container) return;

                if (cats && cats.length > 0) {
                    // 使用树形选择器
                    createSimpleTreeSelect('modal-cat-tree-container', cats, (selected) => {
                        selectedParentId = selected.id;
                        if (selectedDisplay) {
                            selectedDisplay.textContent = `已选择: ${selected.name}`;
                            selectedDisplay.style.color = '#52c41a';
                        }
                    });
                } else {
                    container.innerHTML = '<div style="color:#52c41a; padding:20px; text-align:center;">暂无分类<br/><span style="font-size:12px;">可直接创建顶级分类</span></div>';
                }
            })
            .catch(err => {
                console.error('加载分类失败:', err);
                const container = document.getElementById('modal-cat-tree-container');
                if (container) {
                    container.innerHTML = '<div style="color:#f5222d; padding:20px; text-align:center;">加载分类失败,请刷新重试</div>';
                }
            });
    });

    const addRepoBtn = document.getElementById('openAddRepository');
    if (addRepoBtn) addRepoBtn.addEventListener('click', () => {
        let selectedCategoryId = null;

        openModal('添加仓库', `
      <div class="form-group">
        <label>GitHub URL <span style="color:red;">*</span></label>
        <input type="url" id="modal-repo-url" placeholder="https://github.com/owner/repo" style="width:100%; padding:8px; border:1px solid #d9d9d9; border-radius:4px;" />
        <div style="margin-top:0.5rem; font-size:0.875rem; color:var(--gray-600);">仓库名称将自动从URL中提取</div>
      </div>
      <div class="form-group">
        <label>项目描述 <span id="modal-desc-required" style="color:red;">*</span></label>
        <textarea id="modal-repo-description" rows="4" placeholder="项目的主要功能和特点" style="width:100%; padding:8px; border:1px solid #d9d9d9; border-radius:4px; font-family:inherit; resize:vertical;"></textarea>
        <div style="display:flex; align-items:center; gap:0.75rem; margin-top:0.5rem; flex-wrap:wrap;">
          <button type="button" id="modal-generate-summary" class="btn btn-secondary btn-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:0.25rem; vertical-align:middle;">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            LLM 摘要
          </button>
          <label style="display:inline-flex; align-items:center; gap:0.5rem; cursor:pointer; user-select:none; margin:0; padding:0; height:32px;">
            <input type="checkbox" id="modal-auto-llm-summary" style="width:16px; height:16px; cursor:pointer; margin:0;" />
            <span style="font-size:0.875rem; line-height:1;">是否自动LLM摘要</span>
          </label>
        </div>
        <div id="modal-summary-status" style="margin-top:0.5rem; font-size:0.875rem; color:var(--gray-600);"></div>
      </div>
      <div class="form-group">
        <label>分类 <span style="color:red;">*</span></label>
        <div id="modal-repo-tree-container" style="border:1px solid #d9d9d9; border-radius:4px; padding:8px; max-height:300px; overflow-y:auto; background:#fafafa;">
          <div style="color:#999; padding:20px; text-align:center;">加载分类数据中...</div>
        </div>
        <div id="modal-repo-selected" style="margin-top:8px; color:#666; font-size:14px;">未选择</div>
      </div>
    `, async () => {
            const github_url = (document.getElementById('modal-repo-url')?.value || '').trim();
            const description = (document.getElementById('modal-repo-description')?.value || '').trim();
            const autoLlmSummary = document.getElementById('modal-auto-llm-summary')?.checked || false;

            if (!github_url || !selectedCategoryId) {
                throw new Error('请填写GitHub URL并选择分类');
            }

            // 根据是否勾选自动LLM摘要来决定描述的验证逻辑
            if (!autoLlmSummary && !description) {
                throw new Error('请填写项目描述');
            }

            // 从URL中提取仓库名称
            const urlMatch = github_url.match(/github\.com\/([^\/]+\/[^\/]+)/);
            if (!urlMatch) {
                throw new Error('无效的GitHub URL格式');
            }
            const name = urlMatch[1]; // 例如: "owner/repo"

            const res = await fetch('/api/repositories', {
                method: 'POST',
                headers: {'Content-Type': 'application/json; charset=UTF-8'},
                body: JSON.stringify({
                    name,
                    github_url,
                    category_id: selectedCategoryId,
                    description: description || github_url,
                    auto_llm_summary: autoLlmSummary
                })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.detail || '添加失败');
            }

            loadRepos();
        });

        // 自动LLM摘要勾选框联动逻辑
        setTimeout(() => {
            const autoLlmCheckbox = document.getElementById('modal-auto-llm-summary');
            const descInput = document.getElementById('modal-repo-description');
            const descRequired = document.getElementById('modal-desc-required');
            const urlInput = document.getElementById('modal-repo-url');

            if (autoLlmCheckbox && descInput && descRequired) {
                autoLlmCheckbox.addEventListener('change', () => {
                    if (autoLlmCheckbox.checked) {
                        // 勾选时：禁用描述输入框，设置为GitHub URL，移除必填标识
                        descInput.disabled = true;
                        descInput.style.backgroundColor = '#f5f5f5';
                        descInput.style.cursor = 'not-allowed';
                        descInput.value = urlInput?.value || '';
                        descRequired.style.display = 'none';
                    } else {
                        // 不勾选时：启用描述输入框，清空默认值，显示必填标识
                        descInput.disabled = false;
                        descInput.style.backgroundColor = '';
                        descInput.style.cursor = '';
                        if (descInput.value === urlInput?.value) {
                            descInput.value = '';
                        }
                        descRequired.style.display = '';
                    }
                });

                // 当GitHub URL改变时，如果勾选了自动LLM摘要，同步更新描述
                if (urlInput) {
                    urlInput.addEventListener('input', () => {
                        if (autoLlmCheckbox.checked) {
                            descInput.value = urlInput.value;
                        }
                    });
                }
            }
        }, 100);

        // LLM摘要按钮事件
        setTimeout(() => {
            const generateBtn = document.getElementById('modal-generate-summary');
            if (generateBtn) {
                generateBtn.addEventListener('click', async () => {
                    const urlInput = document.getElementById('modal-repo-url');
                    const descInput = document.getElementById('modal-repo-description');
                    const statusEl = document.getElementById('modal-summary-status');

                    const github_url = (urlInput?.value || '').trim();
                    if (!github_url) {
                        if (statusEl) {
                            statusEl.textContent = '请先输入GitHub URL';
                            statusEl.style.color = 'var(--danger)';
                        }
                        return;
                    }

                    generateBtn.disabled = true;
                    generateBtn.textContent = '生成中...';
                    if (statusEl) {
                        statusEl.textContent = '正在使用LLM生成摘要，请稍候...';
                        statusEl.style.color = 'var(--primary)';
                    }

                    try {
                        const response = await fetch('/api/repositories/generate-summary', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({github_url})
                        });

                        const result = await response.json();

                        if (result.success && descInput) {
                            descInput.value = result.summary;
                            if (statusEl) {
                                statusEl.textContent = '摘要生成成功！';
                                statusEl.style.color = 'var(--success)';
                            }
                        } else {
                            if (statusEl) {
                                statusEl.textContent = '生成失败: ' + (result.error || '未知错误');
                                statusEl.style.color = 'var(--danger)';
                            }
                        }
                    } catch (error) {
                        console.error('生成摘要失败:', error);
                        if (statusEl) {
                            statusEl.textContent = '生成失败: ' + error.message;
                            statusEl.style.color = 'var(--danger)';
                        }
                    } finally {
                        generateBtn.disabled = false;
                        generateBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:0.25rem; vertical-align:middle;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>LLM 摘要';
                    }
                });
            }
        }, 100);

        // 异步加载分类数据并创建树形选择器
        fetch('/api/categories/flat')
            .then(r => {
                if (!r.ok) throw new Error('加载分类失败');
                return r.json();
            })
            .then(cats => {
                const container = document.getElementById('modal-repo-tree-container');
                const selectedDisplay = document.getElementById('modal-repo-selected');

                if (!container) return;

                if (cats && cats.length > 0) {
                    // 使用树形选择器
                    createSimpleTreeSelect('modal-repo-tree-container', cats, (selected) => {
                        selectedCategoryId = selected.id;
                        if (selectedDisplay) {
                            selectedDisplay.textContent = `已选择: ${selected.name}`;
                            selectedDisplay.style.color = '#52c41a';
                        }
                    });
                } else {
                    container.innerHTML = '<div style="color:#fa8c16; padding:20px; text-align:center;">暂无可用分类,请先添加分类</div>';
                }
            })
            .catch(err => {
                console.error('加载分类失败:', err);
                const container = document.getElementById('modal-repo-tree-container');
                if (container) {
                    container.innerHTML = '<div style="color:#f5222d; padding:20px; text-align:center;">加载分类失败,请刷新重试</div>';
                }
            });
    });

    // Edit/Delete handlers
    function editCategory(c) {
        let selectedParentId = c.parent_id;

        openModal('修改分类', `
      <div class="form-group">
        <label>分类名称 <span style="color:red;">*</span></label>
        <input type="text" id="modal-cat-name" value="${escapeHtml(c.name)}" style="width:100%; padding:8px; border:1px solid #d9d9d9; border-radius:4px;" />
      </div>
      <div class="form-group">
        <label>父级分类 <span style="color:#999; font-size:12px;">(可选)</span></label>
        <button type="button" id="modal-edit-cat-clear" style="width: 100%; padding: 0.5rem; border: 1px solid var(--gray-200); border-radius: 4px; background: white; cursor: pointer; text-align: left; margin-bottom: 0.5rem; font-size: 0.875rem; color: var(--gray-700); transition: all 0.2s ease;">
          清除父级（设为顶级分类）
        </button>
        <div id="modal-edit-cat-tree-container" style="border:1px solid #d9d9d9; border-radius:4px; padding:8px; max-height:300px; overflow-y:auto; background:#fafafa;">
          <div style="color:#999; padding:20px; text-align:center;">加载分类数据中...</div>
        </div>
        <div id="modal-edit-cat-selected" style="margin-top:8px; color:#666; font-size:14px;">加载中...</div>
        <div style="margin-top:8px; color:#ff9800; font-size:12px;">⚠️ 不能选择自己或自己的子分类作为父级</div>
      </div>
    `, async () => {
            const name = (document.getElementById('modal-cat-name')?.value || '').trim();
            if (!name) throw new Error('请填写分类名称');

            // 调用更新API
            // 确保 parent_id 有明确的值，如果 selectedParentId 是 undefined，则使用 null
            const parentId = selectedParentId === undefined ? c.parent_id : selectedParentId;

            const res = await fetch(`/api/categories/${c.id}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    name: name,
                    parent_id: parentId
                })
            });

            if (!res.ok) {
                const error = await res.json().catch(() => ({detail: '更新失败'}));
                throw new Error(error.detail || '更新失败');
            }

            loadCategories();
            populateCategoryTrees();
        });

        // 加载分类数据并过滤掉自己和子分类
        fetch('/api/categories/flat')
            .then(r => r.json())
            .then(cats => {
                const container = document.getElementById('modal-edit-cat-tree-container');
                const selectedDisplay = document.getElementById('modal-edit-cat-selected');

                if (!container) return;

                // 过滤掉自己和所有子孙分类
                const getDescendantIds = (parentId) => {
                    const ids = [parentId];
                    cats.forEach(cat => {
                        if (cat.parent_id == parentId) {
                            ids.push(...getDescendantIds(cat.id));
                        }
                    });
                    return ids;
                };

                const invalidIds = getDescendantIds(c.id);
                const filteredCats = cats.filter(cat => !invalidIds.includes(cat.id));

                if (filteredCats.length === 0) {
                    container.innerHTML = '<div style="color:#999; padding:20px; text-align:center;">无可用的父级分类<br/><span style="font-size:12px;">当前分类只能保持为顶级分类</span></div>';

                    // 即使没有可用父级，也可以清除当前父级
                    const clearBtn = document.getElementById('modal-edit-cat-clear');
                    if (clearBtn && c.parent_id) {
                        clearBtn.addEventListener('click', () => {
                            selectedParentId = null;
                            if (selectedDisplay) {
                                selectedDisplay.textContent = '已清除父级(将设为顶级分类)';
                                selectedDisplay.style.color = '#52c41a';
                            }
                        });
                    } else if (clearBtn) {
                        clearBtn.disabled = true;
                        clearBtn.style.opacity = '0.5';
                        clearBtn.style.cursor = 'not-allowed';
                    }

                    if (selectedDisplay) {
                        if (c.parent_id) {
                            selectedDisplay.textContent = '当前有父级，但无其他可选父级（可点击"清除父级"按钮设为顶级分类）';
                            selectedDisplay.style.color = '#ff9800';
                        } else {
                            selectedDisplay.textContent = '当前为顶级分类，无可用父级分类';
                        }
                    }
                } else {
                    // 使用树形选择器
                    const treeSelect = createSimpleTreeSelect('modal-edit-cat-tree-container', filteredCats, (selected) => {
                        selectedParentId = selected.id;
                        if (selectedDisplay) {
                            selectedDisplay.textContent = `已选择: ${selected.name}`;
                            selectedDisplay.style.color = '#52c41a';
                        }
                    }, c.parent_id);

                    // 如果有当前父级且存在于过滤后的列表中，确保展开到该节点
                    if (c.parent_id && filteredCats.find(cat => cat.id == c.parent_id)) {
                        // 展开路径到当前父级
                        const expandPath = (targetId) => {
                            const target = filteredCats.find(cat => cat.id == targetId);
                            if (target && target.parent_id) {
                                expandPath(target.parent_id);
                            }
                        };
                        expandPath(c.parent_id);
                    }

                    // 添加清除按钮事件
                    const clearBtn = document.getElementById('modal-edit-cat-clear');
                    if (clearBtn) {
                        clearBtn.addEventListener('click', () => {
                            selectedParentId = null;
                            if (treeSelect && treeSelect.setSelected) {
                                treeSelect.setSelected(null);
                            }
                            if (selectedDisplay) {
                                selectedDisplay.textContent = '未选择(将设为顶级分类)';
                                selectedDisplay.style.color = '#52c41a';
                            }
                        });
                    }

                    // 设置初始显示
                    if (c.parent_id && selectedDisplay) {
                        const parent = cats.find(cat => cat.id == c.parent_id);
                        if (parent) {
                            selectedDisplay.textContent = `当前父级: ${parent.name}`;
                            selectedDisplay.style.color = '#1890ff';
                        } else {
                            selectedDisplay.textContent = '未选择(将创建为顶级分类)';
                        }
                    } else if (selectedDisplay) {
                        selectedDisplay.textContent = '未选择(当前为顶级分类)';
                    }
                }
            });
    }

    async function deleteCategory(c) {
        if (!confirm('确定删除此分类？')) return;
        const res = await fetch(`/api/categories/${c.id}`, {method: 'DELETE'});
        if (!res.ok) {
            const j = await res.json().catch(() => ({detail: '失败'}));
            alert(j.detail || '删除失败');
            return;
        }
        loadCategories();
        populateCategoryTrees();
    }

    function editRepo(r) {
        let selectedCategoryId = r.category_id;

        openModal('修改仓库', `
      <div class="form-group">
        <label>GitHub URL <span style="color:red;">*</span></label>
        <input type="url" id="modal-repo-url" value="${escapeHtml(r.github_url)}" style="width:100%; padding:8px; border:1px solid #d9d9d9; border-radius:4px;" />
        <div style="margin-top:0.5rem; font-size:0.875rem; color:var(--gray-600);">仓库名称将自动从URL中提取</div>
      </div>
      <div class="form-group">
        <label>项目描述 <span style="color:red;">*</span></label>
        <textarea id="modal-repo-description" rows="4" placeholder="项目的主要功能和特点" style="width:100%; padding:8px; border:1px solid #d9d9d9; border-radius:4px; font-family:inherit; resize:vertical;">${escapeHtml(r.description || '')}</textarea>
        <button type="button" id="modal-generate-summary-edit" class="btn btn-secondary btn-sm" style="margin-top:0.5rem;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:0.25rem; vertical-align:middle;">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          LLM 摘要
        </button>
        <div id="modal-summary-status-edit" style="margin-top:0.5rem; font-size:0.875rem; color:var(--gray-600);"></div>
      </div>
      <div class="form-group">
        <label>分类 <span style="color:red;">*</span></label>
        <div id="modal-edit-repo-tree-container" style="border:1px solid #d9d9d9; border-radius:4px; padding:8px; max-height:300px; overflow-y:auto; background:#fafafa;">
          <div style="color:#999; padding:20px; text-align:center;">加载分类数据中...</div>
        </div>
        <div id="modal-edit-repo-selected" style="margin-top:8px; color:#666; font-size:14px;">加载中...</div>
      </div>
    `, async () => {
            const github_url = (document.getElementById('modal-repo-url')?.value || '').trim();
            const description = (document.getElementById('modal-repo-description')?.value || '').trim();

            if (!github_url || !selectedCategoryId) {
                throw new Error('请填写GitHub URL并选择分类');
            }

            if (!description) {
                throw new Error('请填写项目描述');
            }

            // 从URL中提取仓库名称
            const urlMatch = github_url.match(/github\.com\/([^\/]+\/[^\/]+)/);
            if (!urlMatch) {
                throw new Error('无效的GitHub URL格式');
            }
            const name = urlMatch[1]; // 例如: "owner/repo"

            const res = await fetch(`/api/repositories/${r.id}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json; charset=UTF-8'},
                body: JSON.stringify({name, github_url, category_id: selectedCategoryId, description: description})
            });

            if (!res.ok) throw new Error('修改失败');
            loadRepos();
        });

        // LLM摘要按钮事件（编辑模式）
        setTimeout(() => {
            const generateBtn = document.getElementById('modal-generate-summary-edit');
            if (generateBtn) {
                generateBtn.addEventListener('click', async () => {
                    const urlInput = document.getElementById('modal-repo-url');
                    const descInput = document.getElementById('modal-repo-description');
                    const statusEl = document.getElementById('modal-summary-status-edit');

                    const github_url = (urlInput?.value || '').trim();
                    if (!github_url) {
                        if (statusEl) {
                            statusEl.textContent = '请先输入GitHub URL';
                            statusEl.style.color = 'var(--danger)';
                        }
                        return;
                    }

                    generateBtn.disabled = true;
                    generateBtn.textContent = '生成中...';
                    if (statusEl) {
                        statusEl.textContent = '正在使用LLM生成摘要，请稍候...';
                        statusEl.style.color = 'var(--primary)';
                    }

                    try {
                        const response = await fetch('/api/repositories/generate-summary', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({github_url})
                        });

                        const result = await response.json();

                        if (result.success && descInput) {
                            descInput.value = result.summary;
                            if (statusEl) {
                                statusEl.textContent = '摘要生成成功！';
                                statusEl.style.color = 'var(--success)';
                            }
                        } else {
                            if (statusEl) {
                                statusEl.textContent = '生成失败: ' + (result.error || '未知错误');
                                statusEl.style.color = 'var(--danger)';
                            }
                        }
                    } catch (error) {
                        console.error('生成摘要失败:', error);
                        if (statusEl) {
                            statusEl.textContent = '生成失败: ' + error.message;
                            statusEl.style.color = 'var(--danger)';
                        }
                    } finally {
                        generateBtn.disabled = false;
                        generateBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:0.25rem; vertical-align:middle;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>LLM 摘要';
                    }
                });
            }
        }, 100);

        // 加载分类数据并设置当前选中项
        fetch('/api/categories/flat')
            .then(resp => resp.json())
            .then(cats => {
                const container = document.getElementById('modal-edit-repo-tree-container');
                const selectedDisplay = document.getElementById('modal-edit-repo-selected');

                if (!container) return;

                if (cats && cats.length > 0) {
                    // 使用树形选择器,传入当前选中的分类ID
                    const treeSelect = createSimpleTreeSelect('modal-edit-repo-tree-container', cats, (selected) => {
                        selectedCategoryId = selected.id;
                        if (selectedDisplay) {
                            selectedDisplay.textContent = `已选择: ${selected.name}`;
                            selectedDisplay.style.color = '#52c41a';
                        }
                    }, r.category_id);

                    // 设置初始显示
                    if (r.category_id && selectedDisplay) {
                        const currentCat = cats.find(cat => cat.id == r.category_id);
                        if (currentCat) {
                            selectedDisplay.textContent = `当前分类: ${currentCat.name}`;
                            selectedDisplay.style.color = '#1890ff';
                        }
                    }
                } else {
                    container.innerHTML = '<div style="color:#fa8c16; padding:20px; text-align:center;">暂无可用分类</div>';
                }
            });
    }

    async function deleteRepo(r) {
        if (!confirm('确定删除此仓库？')) return;
        const res = await fetch(`/api/repositories/${r.id}`, {method: 'DELETE', credentials: 'include'});
        if (!res.ok) {
            const j = await res.json().catch(() => ({detail: '删除失败'}));
            alert(j.detail || '删除失败');
            return;
        }
        loadRepos();
    }

    // Init
    // 从URL参数获取当前tab
    const urlParams = new URLSearchParams(window.location.search);
    const currentTab = urlParams.get('tab') || 'repos';

    // 先加载分类树（供选择器使用）
    populateCategoryTrees().then(() => {
        // 根据URL参数显示对应tab并加载数据
        if (currentTab === 'categories') {
            showCategoryTab(false); // 不需要刷新，因为下面会加载
            loadCategories();
            loadRepos(); // 后台仓库选择器需要
        } else {
            showRepoTab(false); // 不需要刷新，因为下面会加载
            loadRepos();
            loadCategories(); // 后台分类树需要
        }
    });

    // 处理浏览器前进/后退按钮
    window.addEventListener('popstate', () => {
        const urlParams = new URLSearchParams(window.location.search);
        const tab = urlParams.get('tab') || 'repos';
        if (tab === 'categories') {
            showCategoryTab(true);
        } else {
            showRepoTab(true);
        }
    });
});