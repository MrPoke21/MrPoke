// UI vezérlőelemek - hamburger menü, koordináta panel mozgatás

// Koordináta panel mozgathatóvá tétele
function initCoordPanelDrag() {
    const coordPanel = document.querySelector('.coord-panel');
    if (!coordPanel) return;
    
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
    
    function startDrag(e) {
        isDragging = true;
        // Egér vagy touch koordináták
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        const rect = coordPanel.getBoundingClientRect();
        offsetX = clientX - rect.left;
        offsetY = clientY - rect.top;
        
        coordPanel.style.userSelect = 'none';
        coordPanel.style.boxShadow = CONSTANTS.UI.COORD_PANEL_SHADOW;
    }
    
    function moveDrag(e) {
        if (!isDragging) return;
        
        e.preventDefault();
        
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        const newX = clientX - offsetX;
        const newY = clientY - offsetY;
        
        coordPanel.style.left = Math.max(0, newX) + 'px';
        coordPanel.style.top = Math.max(0, newY) + 'px';
    }
    
    function endDrag() {
        if (!isDragging) return;
        isDragging = false;
        coordPanel.style.userSelect = 'auto';
        coordPanel.style.boxShadow = '';
    }
    
    // Egér eventlek - bound functions tárolása cleanup-hoz
    const boundMove = moveDrag.bind(null);
    const boundEnd = endDrag.bind(null);
    
    coordPanel.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', boundMove, false);
    document.addEventListener('mouseup', boundEnd);
    
    // Touch eventlek (mobil)
    coordPanel.addEventListener('touchstart', startDrag, false);
    document.addEventListener('touchmove', boundMove, { passive: false });
    document.addEventListener('touchend', boundEnd);
}

// Hamburger menü kezelés
function initMobileMenu() {
    const hamburger = document.getElementById('hamburgerBtn');
    const sidebar = document.getElementById('sidebar');
    const sidebarClose = document.getElementById('sidebarClose');
    
    if (!hamburger || !sidebar) return;
    
    // Nyitás
    hamburger.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        sidebar.classList.remove(CONSTANTS.UI.CLASS_CLOSED);
        hamburger.classList.add(CONSTANTS.UI.CLASS_ACTIVE);
    });
    
    // Zárás gomb
    if (sidebarClose) {
        sidebarClose.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            sidebar.classList.add(CONSTANTS.UI.CLASS_CLOSED);
            hamburger.classList.remove(CONSTANTS.UI.CLASS_ACTIVE);
        });
    }
    
    // Háttér kattintás - szintén zárja a sidebárt mobil nézeten
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= CONSTANTS.UI.MOBILE_BREAKPOINT && !sidebar.classList.contains(CONSTANTS.UI.CLASS_CLOSED)) {
            // Nem zárunk, ha a sidebar-ra vagy hamburger-re klikkeltünk
            if (e.target.closest('#sidebar') || e.target.closest('#hamburgerBtn')) {
                return;
            }
            sidebar.classList.add(CONSTANTS.UI.CLASS_CLOSED);
            hamburger.classList.remove(CONSTANTS.UI.CLASS_ACTIVE);
        }
    });
    
    // Mobil: alapból be legyen csukva
    if (window.innerWidth <= CONSTANTS.UI.MOBILE_BREAKPOINT) {
        sidebar.classList.add(CONSTANTS.UI.CLASS_CLOSED);
    }
}
// ============ VETÜLET MODAL KEZELÉS ============
function initProjectionModal() {
    const helpBtn = document.getElementById('projectionHelpBtn');
    const modal = document.getElementById('projectionModal');
    const closeBtn = document.getElementById('projectionModalClose');
    const okBtn = document.getElementById('projectionModalOK');
    
    if (!helpBtn || !modal) return;
    
    // Modal megnyitása
    helpBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        modal.style.display = 'flex';
    });
    
    // Modal bezárása - close gomb
    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    // Modal bezárása - OK gomb
    okBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    // Modal bezárása - háttérre kattintás
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    // Modal bezárása - Escape gomb
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display !== 'none') {
            modal.style.display = 'none';
        }
    });
}

// ============ FORRÁS MODAL KEZELÉS ============
function initSourceModal() {
    const helpBtn = document.getElementById('sourceHelpBtn');
    const modal = document.getElementById('sourceModal');
    const closeBtn = document.getElementById('sourceModalClose');
    const okBtn = document.getElementById('sourceModalOK');
    
    if (!helpBtn || !modal) return;
    
    // Modal megnyitása
    helpBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        modal.style.display = 'flex';
    });
    
    // Modal bezárása - close gomb
    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    // Modal bezárása - OK gomb
    okBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    // Modal bezárása - háttérre kattintás
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    // Modal bezárása - Escape gomb
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display !== 'none') {
            modal.style.display = 'none';
        }
    });
}