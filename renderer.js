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
    
    tabEl.addEventListener('click', (e) => {
        if (e.target.className !== 'tab-close') {
            switchToTab(tab.id);
        }
    });
    
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // 防止触发父元素的点击事件
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
async function addNewTab(url) {
    const tab = await window.electronAPI.newTab(url);
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

        if (activeTabElement === tabEl) {
            const lastTab = tabsContainer.querySelector('.tab:last-child');
            if (lastTab) {
                switchToTab(lastTab.dataset.tabId);
            }
        }
    }
}

// --- 事件监听 ---
addTabBtn.addEventListener('click', () => addNewTab());

window.electronAPI.onTabCreated((tab) => {
    createTabElement(tab);
    switchToTab(tab.id);
});

window.electronAPI.onTabUpdated((tabId, details) => {
    const titleEl = document.querySelector(`.tab[data-tab-id='${tabId}'] .tab-title`);
    if (titleEl && details.title) {
        titleEl.textContent = details.title;
    }
});

// 监听菜单栏创建新标签的请求
window.electronAPI.onNewTabFromMenu(() => addNewTab());

// 启动时自动创建一个标签页
document.addEventListener('DOMContentLoaded', () => addNewTab());