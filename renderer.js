const tabsContainer = document.querySelector('.tabs-container');
const addTabBtn = document.getElementById('add-tab');
let activeTabElement = null;

// --- DOM 操作 ---

function createTabElement(tab) {
    const tabEl = document.createElement('div');
    tabEl.className = 'tab';
    tabEl.dataset.tabId = tab.id;

    const titleEl = document.createElement('span');
    titleEl.className = 'tab-title';
    titleEl.textContent = tab.title;

    const closeBtn = document.createElement('div');
    closeBtn.className = 'tab-close';
    closeBtn.innerHTML = '&times;';
    
    tabEl.append(titleEl, closeBtn);
    tabsContainer.append(tabEl);
    
    // 切换标签
    tabEl.addEventListener('click', (e) => {
        if (e.target.className !== 'tab-close') {
            switchToTab(tab.id);
        }
    });
    
    // 关闭标签
    closeBtn.addEventListener('click', () => {
        closeTab(tab.id);
    });

    return tabEl;
}

function setActiveTab(tabId) {
    if (activeTabElement) {
        activeTabElement.classList.remove('active');
    }
    const tabEl = document.querySelector(`.tab[data-tab-id='${tabId}']`);
    if (tabEl) {
        tabEl.classList.add('active');
        activeTabElement = tabEl;
    }
}

// --- 与主进程的通信 ---

async function addNewTab() {
    const tab = await window.electronAPI.newTab();
    createTabElement(tab);
    switchToTab(tab.id);
}

function switchToTab(tabId) {
    window.electronAPI.switchTab(tabId);
    setActiveTab(tabId);
}

function closeTab(tabId) {
    const tabEl = document.querySelector(`.tab[data-tab-id='${tabId}']`);
    if (tabEl) {
        tabEl.remove();
        window.electronAPI.closeTab(tabId);

        // 如果关闭的是当前激活的tab, 切换到最后一个tab
        if (activeTabElement === tabEl) {
            const lastTab = tabsContainer.querySelector('.tab:last-child');
            if (lastTab) {
                switchToTab(lastTab.dataset.tabId);
            }
        }
    }
}

// --- 事件监听 ---

addTabBtn.addEventListener('click', addNewTab);

// 监听主进程创建的新标签页（例如，从外部链接打开）
window.electronAPI.onTabCreated((tab) => {
    createTabElement(tab);
    switchToTab(tab.id);
});

// 监听标签页标题更新
window.electronAPI.onTabUpdated((tabId, details) => {
    const titleEl = document.querySelector(`.tab[data-tab-id='${tabId}'] .tab-title`);
    if (titleEl && details.title) {
        titleEl.textContent = details.title;
    }
});


// 启动时自动创建一个标签页
document.addEventListener('DOMContentLoaded', addNewTab);