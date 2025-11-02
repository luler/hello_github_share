/**
 * 仓库管理器 - 统一处理搜索和无限滚动加载
 */
(function () {
    'use strict';

    // ==================== 状态管理 ====================
    let currentPage = 0;
    let isLoading = false;
    let hasMore = true;
    let currentCategoryId = null;
    let isInfiniteScrollEnabled = true;
    let currentSearchQuery = null;

    const PAGE_SIZE = 20;
    const SCROLL_THRESHOLD = 0.7; // 70%

    // ==================== 初始化 ====================
    function init() {
        console.log('Repository Manager initialized');

        // 获取URL参数
        const urlParams = new URLSearchParams(window.location.search);
        currentCategoryId = urlParams.get('category_id');
        const searchQuery = urlParams.get('q');

        // 初始化搜索功能
        initSearch();

        // 如果URL中有搜索参数，自动执行搜索
        if (searchQuery) {
            const searchInput = document.getElementById('repo-search-input');
            if (searchInput) {
                searchInput.value = searchQuery;
                // 如果同时有分类参数，使用resetAndReload；否则使用performSearch
                if (currentCategoryId) {
                    console.log('初始化加载：分类 + 搜索', currentCategoryId, searchQuery);
                    resetAndReload(parseInt(currentCategoryId, 10), searchQuery);
                } else {
                    performSearch(searchQuery);
                }
            }
        } else {
            // 初始化无限滚动
            initInfiniteScroll();
        }
    }

    // ==================== 搜索功能 ====================
    function initSearch() {
        const searchInput = document.getElementById('repo-search-input');
        if (!searchInput) {
            console.warn('Search input not found');
            return;
        }

        console.log('Search functionality initialized');

        // 监听回车键
        searchInput.addEventListener('keypress', async function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const query = searchInput.value.trim();
                await performSearch(query);
            }
        });
    }

    /**
     * 更新URL参数，不刷新页面
     * 搜索时删除category_id参数，保留q参数
     */
    function updateUrlParams(query) {
        const url = new URL(window.location);

        if (query) {
            url.searchParams.set('q', query);
            url.searchParams.delete('category_id');  // 搜索时清除分类
        } else {
            url.searchParams.delete('q');
        }

        window.history.pushState({}, '', url);
    }

    async function performSearch(query) {
        if (!query) {
            // 清空搜索，恢复无限滚动
            currentSearchQuery = null;
            updateUrlParams(null); // 清空URL参数

            // 恢复默认的页面标题和meta信息
            if (window.updatePageMetadata) {
                window.updatePageMetadata(null);
            }
            if (window.updatePageTitle) {
                window.updatePageTitle(null);
            }

            resetAndReload();
            return;
        }

        console.log('Performing search for:', query);

        // 搜索时清除分类选择
        const previousCategoryId = currentCategoryId;
        currentCategoryId = null;
        currentSearchQuery = query;

        // 更新URL参数（支持分享）- 清除category_id
        updateUrlParams(query);

        // 禁用无限滚动
        disableInfiniteScroll();

        // 重置分页状态
        currentPage = 0;
        hasMore = false;

        try {
            showLoadingIndicator();

            // 使用 buildApiUrl 构建URL，确保包含搜索参数但不含分类
            const url = buildApiUrl(1);
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('搜索请求失败');
            }

            const data = await response.json();

            // 清空现有内容
            clearRepositoryGrid();

            // 更新页面标题和数量
            updatePageTitle(`搜索结果: "${query}"`);
            updateRepoCount(data.total);

            // 更新页面元数据（恢复默认，因为搜索时没有分类）
            if (window.updatePageMetadata) {
                window.updatePageMetadata(null);
            }

            // 显示搜索结果
            if (data.items.length > 0) {
                appendRepositories(data.items);
            } else {
                showEmptyState('未找到相关仓库');
            }

            // 更新分类树的高亮状态
            if (window.updateCategoryHighlight) {
                window.updateCategoryHighlight(null);
            }

        } catch (error) {
            console.error('Search error:', error);
            showErrorIndicator(error.message);
        } finally {
            hideLoadingIndicator();
        }
    }

    // ==================== 无限滚动功能 ====================
    function initInfiniteScroll() {
        console.log('Infinite scroll initialized');

        // 加载第一页
        loadNextPage();

        // 监听滚动事件
        window.addEventListener('scroll', handleScroll);

        // 监听分类切换
        document.addEventListener('categoryChanged', function (e) {
            console.log('Category changed to:', e.detail.categoryId);
            resetAndReload(e.detail.categoryId);
        });
    }

    function handleScroll() {
        if (!isInfiniteScrollEnabled || isLoading || !hasMore || currentSearchQuery) {
            return;
        }

        const scrollHeight = document.documentElement.scrollHeight;
        const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
        const clientHeight = document.documentElement.clientHeight;
        const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

        if (scrollPercentage >= SCROLL_THRESHOLD) {
            console.log('Reached scroll threshold, loading next page...');
            loadNextPage();
        }
    }

    async function loadNextPage() {
        // 如果正在加载或没有更多数据，则直接返回
        if (isLoading || !hasMore) return;

        // 如果有搜索查询，禁用无限滚动，但仍然可以加载第一页
        if (currentSearchQuery && currentPage > 0) {
            return;
        }

        isLoading = true;
        showLoadingIndicator();

        try {
            const nextPage = currentPage + 1;
            const url = buildApiUrl(nextPage);

            console.log('Loading page', nextPage, 'from:', url);

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Failed to load repositories');
            }

            const data = await response.json();
            console.log('Loaded', data.items.length, 'items, has_more:', data.has_more);

            // 无论是否有数据，都要更新仓库总数
            updateRepoCount(data.total);

            if (data.items.length > 0) {
                appendRepositories(data.items);
                currentPage = nextPage;
                hasMore = data.has_more;
            } else {
                hasMore = false;
                // 如果是第一页且没有数据，显示空状态
                if (currentPage === 0) {
                    showEmptyState('该分类下暂无仓库');
                }
            }

            if (!hasMore && currentPage > 0) {
                showNoMoreIndicator();
            }

        } catch (error) {
            console.error('Error loading repositories:', error);
            showErrorIndicator(error.message);
        } finally {
            isLoading = false;
            hideLoadingIndicator();
        }
    }

    function buildApiUrl(page) {
        const params = new URLSearchParams({
            page: page,
            page_size: PAGE_SIZE
        });

        if (currentCategoryId) {
            params.append('category_id', currentCategoryId);
        }

        if (currentSearchQuery) {
            params.append('q', currentSearchQuery);
        }

        return `/api/repositories?${params.toString()}`;
    }

    // ==================== DOM 操作 ====================
    function clearRepositoryGrid() {
        const grid = document.querySelector('.repositories-grid');
        if (grid) {
            grid.innerHTML = '';
        }
        removeNoMoreIndicator();
    }

    function appendRepositories(repositories) {
        const grid = document.querySelector('.repositories-grid');
        if (!grid) return;

        repositories.forEach(repo => {
            const card = createRepositoryCard(repo);
            grid.appendChild(card);
        });
    }

    function createRepositoryCard(repo) {
        // 创建链接
        const link = document.createElement('a');
        link.href = repo.github_url;
        link.target = '_blank';
        link.className = 'repo-card-link';

        // 创建卡片
        const card = document.createElement('div');
        card.className = 'repository-card';

        // 描述
        const description = repo.description || '';
        const descElement = document.createElement('p');
        descElement.className = 'repo-description';
        if (description) {
            descElement.textContent = description;
            descElement.title = description;
        } else {
            descElement.innerHTML = '&nbsp;';
            descElement.style.minHeight = '4.32rem';
        }

        // GitHub 卡片
        const cardEmbed = document.createElement('div');
        cardEmbed.className = 'card-embed';

        const img = document.createElement('img');
        img.src = `${repo.card_url}?image=1`;
        img.style.width = '100%';
        img.style.height = 'auto';
        img.style.objectFit = 'contain';
        img.alt = 'GitHub 信息卡片';

        // 分类标签容器
        const categoryTags = document.createElement('div');
        categoryTags.className = 'category-tags';

        // 如果有分类路径，显示所有分类标签
        if (repo.category_path && repo.category_path.length > 0) {
            repo.category_path.forEach((category, index) => {
                const tag = document.createElement('span');
                tag.className = 'category-tag';
                tag.textContent = category.name;
                tag.setAttribute('data-category-id', category.id);
                tag.setAttribute('data-level', category.level);
                categoryTags.appendChild(tag);

                // 在标签之间添加分隔符（除了最后一个标签）
                if (index < repo.category_path.length - 1) {
                    const separator = document.createElement('span');
                    separator.className = 'category-separator';
                    separator.textContent = ' › ';
                    categoryTags.appendChild(separator);
                }
            });
        }

        // 组装元素
        cardEmbed.appendChild(img);
        card.appendChild(descElement);
        card.appendChild(cardEmbed);
        card.appendChild(categoryTags);  // 在卡片底部添加分类标签
        link.appendChild(card);

        return link;
    }

    function updateRepoCount(total) {
        const repoCount = document.querySelector('.section-header .header-actions .repo-count');
        if (repoCount) {
            repoCount.textContent = `共 ${total} 个仓库`;
        }
    }

    function updatePageTitle(title) {
        const header = document.querySelector('.section-header h2');
        if (header) {
            header.textContent = title;
        }
    }

    // ==================== 加载指示器 ====================
    function showLoadingIndicator() {
        let indicator = document.getElementById('loading-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'loading-indicator';
            indicator.className = 'loading-indicator';
            indicator.innerHTML = '<p>加载中</p>';

            const grid = document.querySelector('.repositories-grid');
            if (grid && grid.parentNode) {
                grid.parentNode.insertBefore(indicator, grid.nextSibling);
            }
        }
        indicator.style.display = 'block';
    }

    function hideLoadingIndicator() {
        const indicator = document.getElementById('loading-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    function showNoMoreIndicator() {
        removeNoMoreIndicator();

        const indicator = document.createElement('div');
        indicator.id = 'no-more-indicator';
        indicator.className = 'no-more-indicator';
        indicator.innerHTML = '<p>没有更多了</p>';

        const grid = document.querySelector('.repositories-grid');
        if (grid && grid.parentNode) {
            grid.parentNode.insertBefore(indicator, grid.nextSibling);
        }
    }

    function removeNoMoreIndicator() {
        const indicator = document.getElementById('no-more-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    function showEmptyState(message) {
        const grid = document.querySelector('.repositories-grid');
        if (grid) {
            grid.innerHTML = `
                <div class="empty-state">
                    <p>${message}</p>
                </div>
            `;
        }
    }

    function showErrorIndicator(message) {
        const indicator = document.createElement('div');
        indicator.className = 'error-indicator';
        indicator.innerHTML = `<p>加载失败: ${message}</p>`;

        const grid = document.querySelector('.repositories-grid');
        if (grid && grid.parentNode) {
            grid.parentNode.insertBefore(indicator, grid.nextSibling);
        }

        setTimeout(() => {
            indicator.remove();
        }, 3000);
    }

    // ==================== 状态控制 ====================
    function resetAndReload(categoryId, searchQuery = null) {
        console.log('Resetting and reloading with category:', categoryId, 'search:', searchQuery);

        // 更新分类ID
        if (categoryId !== undefined) {
            currentCategoryId = categoryId;
        }

        // 设置搜索查询（如果提供）
        currentSearchQuery = searchQuery;

        // 重置状态
        currentPage = 0;
        hasMore = true;

        // 清空内容
        clearRepositoryGrid();

        // 根据情况更新页面标题和元数据
        if (currentCategoryId) {
            // 有分类时，从DOM获取分类名称并更新
            const categoryName = window.getCategoryNameById ? window.getCategoryNameById(currentCategoryId) : null;
            if (categoryName) {
                if (window.updatePageMetadata) {
                    window.updatePageMetadata(categoryName);
                }
                if (window.updatePageTitle) {
                    window.updatePageTitle(categoryName);
                }
            } else {
                // 如果获取不到分类名称，使用默认标题
                updatePageTitle('分类仓库');
            }
        } else {
            // 没有分类时，恢复默认
            if (window.updatePageMetadata) {
                window.updatePageMetadata(null);
            }
            if (window.updatePageTitle) {
                window.updatePageTitle(null);
            }
        }

        // 如果有搜索查询，禁用无限滚动；否则启用
        if (currentSearchQuery) {
            disableInfiniteScroll();
        } else {
            enableInfiniteScroll();
        }

        // 加载第一页
        loadNextPage();
    }

    function enableInfiniteScroll() {
        console.log('Infinite scroll enabled');
        isInfiniteScrollEnabled = true;
    }

    function disableInfiniteScroll() {
        console.log('Infinite scroll disabled');
        isInfiniteScrollEnabled = false;
        hideLoadingIndicator();
        removeNoMoreIndicator();
    }

    // ==================== 公开 API ====================
    window.RepositoryManager = {
        reset: resetAndReload,
        enableInfiniteScroll: enableInfiniteScroll,
        disableInfiniteScroll: disableInfiniteScroll
    };

    // 向后兼容旧的API
    window.resetInfiniteScroll = resetAndReload;
    window.enableInfiniteScroll = enableInfiniteScroll;
    window.disableInfiniteScroll = disableInfiniteScroll;

    // ==================== 启动 ====================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
