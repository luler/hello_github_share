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

    const PAGE_SIZE = 50;
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
                performSearch(searchQuery);
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
     */
    function updateUrlParams(query) {
        const url = new URL(window.location);
        if (query) {
            url.searchParams.set('q', query);
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
            resetAndReload();
            return;
        }

        console.log('Performing search for:', query);
        currentSearchQuery = query;

        // 更新URL参数（支持分享）
        updateUrlParams(query);

        // 禁用无限滚动
        disableInfiniteScroll();

        // 重置分页状态
        currentPage = 0;
        hasMore = false;

        try {
            showLoadingIndicator();

            const response = await fetch(`/api/repositories?q=${encodeURIComponent(query)}`);
            if (!response.ok) {
                throw new Error('搜索请求失败');
            }

            const data = await response.json();

            // 清空现有内容
            clearRepositoryGrid();

            // 更新标题和数量
            updatePageTitle(`搜索结果: "${query}"`);
            updateRepoCount(data.total);

            // 显示搜索结果
            if (data.items.length > 0) {
                appendRepositories(data.items);
            } else {
                showEmptyState('未找到相关仓库');
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
        if (isLoading || !hasMore || currentSearchQuery) return;

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

            if (data.items.length > 0) {
                appendRepositories(data.items);
                currentPage = nextPage;
                hasMore = data.has_more;
                updateRepoCount(data.total);
            } else {
                hasMore = false;
            }

            if (!hasMore) {
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

        // 组装元素
        cardEmbed.appendChild(img);
        card.appendChild(descElement);
        card.appendChild(cardEmbed);
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
    function resetAndReload(categoryId) {
        console.log('Resetting and reloading with category:', categoryId);

        // 更新分类ID
        if (categoryId !== undefined) {
            currentCategoryId = categoryId;
        }

        // 重置状态
        currentPage = 0;
        hasMore = true;
        currentSearchQuery = null;

        // 清空内容
        clearRepositoryGrid();

        // 恢复标题
        updatePageTitle(currentCategoryId ? '分类仓库' : '最新入库');

        // 启用无限滚动
        enableInfiniteScroll();

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
