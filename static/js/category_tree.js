document.addEventListener('DOMContentLoaded', () => {
  const autoEl = document.getElementById('category-tree');
  if (autoEl) {
    const selectedAttr = autoEl.getAttribute('data-selected-id');
    const selectedId = selectedAttr ? parseInt(selectedAttr, 10) : null;
    initCategoryTree('category-tree', selectedId);
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

    container.innerHTML = '';
    // Optional: search bar
    const search = document.createElement('div');
    search.className = 'tree-search';
    search.innerHTML = '<input type="text" id="category-tree-search" placeholder="搜索分类...">';
    container.appendChild(search);
    container.appendChild(treeRoot);

    const searchInput = document.getElementById('category-tree-search');
    if (searchInput) {
      let t;
      searchInput.addEventListener('input', e => {
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
  } catch { return []; }
}

function saveExpanded(arr) {
  try { localStorage.setItem(EXPANDED_KEY, JSON.stringify(arr)); } catch {}
}

function countCategoryRepositories(category) {
  // 只统计当前分类自己的仓库数量，不累加子分类
  return (category.repositories || []).length;
}

function getChevronSvg() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform .16s ease;"><polyline points="9 18 15 12 9 6"></polyline></svg>';
}
