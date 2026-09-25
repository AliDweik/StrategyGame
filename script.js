(function () {
    // ========== STORAGE KEY ==========
    const STORAGE_KEY = 'almuhandis_game_state_v1';

    // ========== DYNAMIC TOKENS CONFIGURATION ==========

    const TOKENS = [
        { id: 'battalion', name: 'كتيبة', icon: '🏰', color: '#c9b68a', borderColor: '#9b6e3a' },
        { id: 'fighter-jet', name: 'طائرة', icon: '✈️', color: '#b8d0e0', borderColor: '#5a7c9a' },
        { id: 'soldier', name: 'جندي', icon: '⚔️', color: '#9ebd8a', borderColor: '#4a6e2a' },
        { id: 'tank', name: 'دبابة', icon: '⛴', color: '#e6c8a8', borderColor: '#b86a2a' },
        { id: 'commander', name: 'قائد', icon: '👨🏼‍✈️', color: '#766552', borderColor: '#6f411c' },
        { id: 'secret-headquarters', name: 'مقر سري', icon: '🛕', color: '#b8a2c0', borderColor: '#6a4a7a' }
    ];

    const EMPTY_TOKEN = { id: 'empty', name: 'فارغ', icon: '▢', color: '#dbd4c0', borderColor: '#9e8e6a' };

    // ========== AUDIO CONFIGURATION ==========
    let bombSound = null;
    
    function initAudio() {
        try {
            bombSound = new Audio('bomb.wav');
            bombSound.volume = 0.7;
            bombSound.preload = 'auto';
            bombSound.load();
        } catch(e) {
            console.log('Audio not supported:', e);
        }
    }
    
    function playBombSound() {
        try {
            if (bombSound) {
                const soundClone = bombSound.cloneNode();
                soundClone.volume = 0.7;
                soundClone.play().catch(e => console.log('Audio play failed:', e));
            } else {
                const fallbackSound = new Audio('bomb.wav');
                fallbackSound.volume = 0.7;
                fallbackSound.play().catch(e => console.log('Audio play failed:', e));
            }
        } catch(e) {
            console.log('Audio play failed:', e);
        }
    }
    
    function playHitSound() {
        playBombSound();
    }
    
    function playMissSound() {
        playBombSound();
    }
    
    // Initialize audio
    initAudio();
    
    // ========== GAME STATE ==========
    let phase = 1;
    let groupsCount = 2;
    let rows = 3, cols = 3;
    let groupNames = ['فريق ١', 'فريق ٢'];
    let groupsData = [];
    let revealedState = [];
    let isProcessing = false;
    let gameStarted = false;

    // ========== STORAGE FUNCTIONS ==========
    function saveState() {
        try {
            const state = {
                phase,
                groupsCount,
                rows,
                cols,
                groupNames,
                groupsData,
                revealedState,
                gameStarted
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.log('Failed to save state:', e);
        }
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            const state = JSON.parse(raw);
            if (!state || typeof state !== 'object') return false;
            if (typeof state.phase !== 'number') return false;

            phase = state.phase;
            groupsCount = state.groupsCount ?? 2;
            rows = state.rows ?? 3;
            cols = state.cols ?? 3;
            groupNames = Array.isArray(state.groupNames) ? state.groupNames : ['فريق ١', 'فريق ٢'];
            groupsData = Array.isArray(state.groupsData) ? state.groupsData : [];
            revealedState = Array.isArray(state.revealedState) ? state.revealedState : [];
            gameStarted = !!state.gameStarted;

            // Validate groupsData shape
            if (groupsData.length !== groupsCount || !groupsData.every(g => Array.isArray(g.grid))) {
                buildEmptyGroups();
            }
            // Validate revealedState shape
            if (revealedState.length !== groupsCount || !revealedState.every(r => Array.isArray(r))) {
                resetRevealed();
            }
            return true;
        } catch (e) {
            console.log('Failed to load state:', e);
            return false;
        }
    }

    function clearState() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            console.log('Failed to clear state:', e);
        }
    }

    function resetGame() {
        phase = 1;
        groupsCount = 2;
        rows = 3;
        cols = 3;
        groupNames = ['فريق ١', 'فريق ٢'];
        groupsData = [];
        revealedState = [];
        isProcessing = false;
        buildEmptyGroups();
        resetRevealed();
        saveState();
    }
    
    function getRowLetter(rowIndex) {
        return String.fromCharCode(65 + rowIndex);
    }
    
    function buildEmptyGroups() {
        groupsData = [];
        for (let g = 0; g < groupsCount; g++) {
            const grid = [];
            for (let r = 0; r < rows; r++) {
                grid.push(Array(cols).fill(''));
            }
            groupsData.push({ name: groupNames[g] || `مجموعة ${g+1}`, grid });
        }
    }
    
    function computeCounts(grid) {
        const counts = {};
        TOKENS.forEach(token => { counts[token.id] = 0; });
        
        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[0].length; c++) {
                const val = grid[r][c];
                if (val && val !== '') {
                    counts[val] = (counts[val] || 0) + 1;
                }
            }
        }
        return counts;
    }
    
    function computeFoundedCounts(groupIdx, grid) {
        const counts = {};
        TOKENS.forEach(token => { counts[token.id] = 0; });
        
        const revealed = revealedState[groupIdx];
        if (!revealed) return counts;
        
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (revealed[r][c]) {
                    const val = grid[r][c];
                    if (val && val !== '') {
                        counts[val] = (counts[val] || 0) + 1;
                    }
                }
            }
        }
        return counts;
    }
    
    function computeTotalHits() {
        const totalHits = [];
        for (let g = 0; g < groupsCount; g++) {
            const squadHits = {};
            TOKENS.forEach(token => { squadHits[token.id] = 0; });
            
            const revealed = revealedState[g];
            const grid = groupsData[g].grid;
            
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (revealed[r][c]) {
                        const val = grid[r][c];
                        if (val && val !== '') {
                            squadHits[val] = (squadHits[val] || 0) + 1;
                        }
                    }
                }
            }
            totalHits.push({ name: groupsData[g].name, hits: squadHits });
        }
        return totalHits;
    }
    
    function resetRevealed() {
        revealedState = [];
        for (let g = 0; g < groupsCount; g++) {
            const arr = [];
            for (let r = 0; r < rows; r++) {
                arr.push(Array(cols).fill(false));
            }
            revealedState.push(arr);
        }
    }
    
    function getTokenConfig(tokenId) {
        if (tokenId === 'empty' || tokenId === '') return EMPTY_TOKEN;
        const found = TOKENS.find(t => t.id === tokenId);
        return found || EMPTY_TOKEN;
    }
    
    function getTokenIcon(tokenId) {
        const config = getTokenConfig(tokenId);
        return config.icon;
    }
    
    function getTokenClass(tokenId) {
        if (tokenId === 'empty' || tokenId === '') return 'empty';
        return tokenId;
    }
    
    function animateBomb(cellElement, hasContent) {
        return new Promise((resolve) => {
            if (hasContent) {
                playHitSound();
                cellElement.classList.add('bomb-animation');
            } else {
                playMissSound();
                cellElement.classList.add('empty-bomb');
            }
            
            const explosion = document.createElement('div');
            explosion.style.position = 'absolute';
            explosion.style.top = '50%';
            explosion.style.left = '50%';
            explosion.style.transform = 'translate(-50%, -50%)';
            explosion.style.width = '100%';
            explosion.style.height = '100%';
            explosion.style.borderRadius = '50%';
            explosion.style.pointerEvents = 'none';
            explosion.style.zIndex = '10';
            
            if (hasContent) {
                explosion.style.animation = 'bombBlast 0.6s ease-out';
                explosion.style.background = 'radial-gradient(circle, rgba(255,100,0,0.8) 0%, rgba(255,50,0,0) 70%)';
            } else {
                explosion.style.animation = 'emptyBlast 0.5s ease-out';
                explosion.style.background = 'radial-gradient(circle, rgba(200,180,120,0.6) 0%, rgba(150,130,80,0) 70%)';
            }
            
            cellElement.style.position = 'relative';
            cellElement.appendChild(explosion);
            
            setTimeout(() => {
                if (hasContent) {
                    cellElement.classList.remove('bomb-animation');
                } else {
                    cellElement.classList.remove('empty-bomb');
                }
                if (explosion) explosion.remove();
                resolve();
            }, 600);
        });
    }
    
    function showResults() {
        const hits = computeTotalHits();
        let resultsHtml = `
            <div class="results-modal" id="resultsModal">
                <div class="results-content">
                    <h2>💣 نتائج القصف 💣</h2>
        `;
        
        hits.forEach(squad => {
            resultsHtml += `
                <div class="results-squad">
                    <h3>🎯 ${squad.name}</h3>
                    <div class="results-stats">
            `;
            
            TOKENS.forEach(token => {
                const hitCount = squad.hits[token.id] || 0;
                resultsHtml += `
                    <div class="result-item">
                        <span class="result-icon">${token.icon}</span>
                        <span class="result-name">${token.name}</span>
                        <span class="result-count">${hitCount}</span>
                    </div>
                `;
            });
            
            resultsHtml += `
                    </div>
                </div>
            `;
        });
        
        resultsHtml += `
                    <button class="close-results" id="closeResults">إغلاق</button>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', resultsHtml);
        
        document.getElementById('closeResults').addEventListener('click', () => {
            const modal = document.getElementById('resultsModal');
            if (modal) modal.remove();
        });
    }
    
    // UI Helpers
    const startScreen = document.getElementById('startScreen');
    const gameContainer = document.getElementById('gameContainer');
    const startButton = document.getElementById('startButton');
    const newGameButton = document.getElementById('newGameButton');
    const phase1Step = document.getElementById('phase1Step');
    const phase2Step = document.getElementById('phase2Step');
    const phase3Step = document.getElementById('phase3Step');
    const phase4Step = document.getElementById('phase4Step');
    const phaseContent = document.getElementById('phaseContent');
    
    startButton.addEventListener('click', () => {
        startScreen.style.display = 'none';
        gameContainer.style.display = 'block';
        gameStarted = true;
        saveState();
        render();
    });

    newGameButton.addEventListener('click', () => {
        if (!confirm('هل أنت متأكد من بدء لعبة جديدة؟ سيتم مسح التقدم الحالي.')) return;
        clearState();
        resetGame();
        gameStarted = true;
        startScreen.style.display = 'none';
        gameContainer.style.display = 'block';
        render();
    });
    
    function setActivePhase(p) {
        [phase1Step, phase2Step, phase3Step, phase4Step].forEach((el, idx) => {
            if (idx+1 === p) el.classList.add('active');
            else el.classList.remove('active');
        });
    }
    
    function render() {
        setActivePhase(phase);
        if (phase === 1) renderPhase1();
        else if (phase === 2) renderPhase2();
        else if (phase === 3) renderPhase3();
        else if (phase === 4) renderPhase4();
        saveState();
    }
    
    // ========== PHASE 1 ==========
    function renderPhase1() {
        phaseContent.innerHTML = `
            <div class="pane-title">🎯 إعداد المهمة</div>
            <div class="input-group">
                <div class="input-field">
                    <label>⚔️ الفرق (٢–١٠)</label>
                    <input type="number" id="groupsCountInput" min="2" max="10" value="${groupsCount}">
                </div>
                <div class="input-field">
                    <label>🗺️ الصفوف (ن)</label>
                    <input type="number" id="rowsInput" min="1" max="20" value="${rows}">
                </div>
                <div class="input-field">
                    <label>🗺️ الأعمدة (م)</label>
                    <input type="number" id="colsInput" min="1" max="20" value="${cols}">
                </div>
            </div>
            <div class="nav-buttons">
                <div></div>
                <button id="phase1Next">التالي ←</button>
            </div>
        `;
        
        document.getElementById('phase1Next').addEventListener('click', () => {
            const newGroups = parseInt(document.getElementById('groupsCountInput').value, 10);
            const newRows = parseInt(document.getElementById('rowsInput').value, 10);
            const newCols = parseInt(document.getElementById('colsInput').value, 10);
            
            if (newGroups >= 2 && newGroups <= 10 && newRows > 0 && newCols > 0 && newRows <= 20 && newCols <= 20) {
                groupsCount = newGroups;
                rows = newRows;
                cols = newCols;
                while (groupNames.length < groupsCount) groupNames.push(`فريق ${groupNames.length+1}`);
                while (groupNames.length > groupsCount) groupNames.pop();
                buildEmptyGroups();
                phase = 2;
                render();
            } else {
                alert('النطاق الصحيح: الفرق ٢-١٠، الصفوف/الأعمدة ١-٢٠');
            }
        });
    }
    
    // ========== PHASE 2 ==========
    function renderPhase2() {
        let namesHtml = '';
        for (let i = 0; i < groupsCount; i++) {
            namesHtml += `
                <div class="name-item">
                    <label>الفريق ${i+1}</label>
                    <input type="text" id="groupName${i}" value="${groupNames[i]}" placeholder="مثال: الشبح">
                </div>
            `;
        }
        
        phaseContent.innerHTML = `
            <div class="pane-title">📡 تعيين أسماء الفرق</div>
            <div class="groups-names">${namesHtml}</div>
            <div class="nav-buttons">
                <button class="secondary" id="phase2Back">→ رجوع</button>
                <button id="phase2Next">التالي ←</button>
            </div>
        `;
        
        document.getElementById('phase2Back').addEventListener('click', () => { phase = 1; render(); });
        document.getElementById('phase2Next').addEventListener('click', () => {
            for (let i = 0; i < groupsCount; i++) {
                const inp = document.getElementById(`groupName${i}`);
                if (inp) groupNames[i] = inp.value.trim() || `فريق ${i+1}`;
            }
            buildEmptyGroups();
            phase = 3;
            render();
        });
    }
    
    // ========== PHASE 3 ==========
    function renderPhase3() {
        if (groupsData.length !== groupsCount || groupsData[0]?.grid.length !== rows) buildEmptyGroups();
        else {
            for (let g = 0; g < groupsCount; g++) groupsData[g].name = groupNames[g];
        }
        
        let boardsHtml = '';
        for (let g = 0; g < groupsCount; g++) {
            const group = groupsData[g];
            const counts = computeCounts(group.grid);
            
            let gridHtml = '<div class="col-header">';
            for (let c = 0; c < cols; c++) {
                gridHtml += `<div class="col-number">${c + 1}</div>`;
            }
            gridHtml += '</div>';
            
            for (let r = 0; r < rows; r++) {
                gridHtml += `<div class="cell-row">`;
                gridHtml += `<div class="row-coord">${getRowLetter(r)}</div>`;
                for (let c = 0; c < cols; c++) {
                    const val = group.grid[r][c] || '';
                    const tokenClass = getTokenClass(val);
                    const icon = val ? getTokenIcon(val) : '▢';
                    gridHtml += `<div class="cell ${tokenClass}" data-group="${g}" data-row="${r}" data-col="${c}">${icon}</div>`;
                }
                gridHtml += `</div>`;
            }
            
            let totalsHtml = '';
            TOKENS.forEach(token => {
                totalsHtml += `<span>${token.icon} ${token.name}: ${counts[token.id] || 0}</span>`;
            });
            
            boardsHtml += `
                <div class="group-board">
                    <div class="group-title">💥 ${group.name}</div>
                    <div class="grid-wrapper">
                        <div class="grid-table">${gridHtml}</div>
                    </div>
                    <div class="totals-row">${totalsHtml}</div>
                </div>
            `;
        }
        
        let inventoryHtml = '';
        TOKENS.forEach(token => {
            inventoryHtml += `
                <div class="token ${token.id}" draggable="true" data-type="${token.id}">
                    ${token.icon} ${token.name}
                </div>
            `;
        });
        inventoryHtml += `
            <div class="token empty-token" draggable="true" data-type="empty">
                🗑️ مسح
            </div>
        `;
        
        phaseContent.innerHTML = `
            <div class="pane-title">💣 التخطيط الاستراتيجي</div>
            <div class="inventory" id="inventoryTokens">${inventoryHtml}</div>
            <div class="dashboard">${boardsHtml}</div>
            <div class="nav-buttons">
                <button class="secondary" id="phase3Back">→ رجوع</button>
                <button id="phase3Next">قتال ←</button>
            </div>
        `;
        
        document.querySelectorAll('.token').forEach(t => {
            t.addEventListener('dragstart', e => {
                e.dataTransfer.setData('text/plain', t.dataset.type);
            });
        });
        
        const cells = document.querySelectorAll('.cell');
        cells.forEach(cell => {
            cell.addEventListener('dragover', e => e.preventDefault());
            cell.addEventListener('drop', e => {
                e.preventDefault();
                const tokenType = e.dataTransfer.getData('text/plain');
                if (!tokenType) return;
                const g = parseInt(cell.dataset.group, 10);
                const r = parseInt(cell.dataset.row, 10);
                const c = parseInt(cell.dataset.col, 10);
                groupsData[g].grid[r][c] = tokenType === 'empty' ? '' : tokenType;
                renderPhase3();
                saveState();
            });
        });
        
        document.getElementById('phase3Back').addEventListener('click', () => { phase = 2; render(); });
        document.getElementById('phase3Next').addEventListener('click', () => {
            resetRevealed();
            phase = 4;
            render();
        });
    }
    
    // ========== PHASE 4 ==========
    function renderPhase4() {
        if (!revealedState.length || revealedState.length !== groupsCount || revealedState[0]?.length !== rows) {
            resetRevealed();
        }
        
        let boardsHtml = '';
        for (let g = 0; g < groupsCount; g++) {
            const group = groupsData[g];
            const grid = group.grid;
            const founded = computeFoundedCounts(g, grid);
            
            let gridHtml = '<div class="col-header">';
            for (let c = 0; c < cols; c++) {
                gridHtml += `<div class="col-number">${c + 1}</div>`;
            }
            gridHtml += '</div>';
            
            for (let r = 0; r < rows; r++) {
                gridHtml += `<div class="cell-row">`;
                gridHtml += `<div class="row-coord">${getRowLetter(r)}</div>`;
                for (let c = 0; c < cols; c++) {
                    const isRevealed = revealedState[g][r][c];
                    const val = grid[r][c];
                    
                    let symbol = '❓';
                    let cls = 'secret';
                    
                    if (isRevealed) {
                        if (val && val !== '') {
                            const config = getTokenConfig(val);
                            symbol = config.icon;
                            cls = val;
                        } else {
                            symbol = '▢';
                            cls = 'empty';
                        }
                    }
                    
                    gridHtml += `<div class="cell ${cls}" data-group="${g}" data-row="${r}" data-col="${c}" data-value="${val || 'empty'}">${symbol}</div>`;
                }
                gridHtml += `</div>`;
            }
            
            let totalsHtml = '';
            TOKENS.forEach(token => {
                totalsHtml += `<span>${token.icon} ${token.name}: ${founded[token.id] || 0}</span>`;
            });
            
            boardsHtml += `
                <div class="group-board">
                    <div class="group-title">🎯 ${group.name}</div>
                    <div class="grid-wrapper">
                        <div class="grid-table">${gridHtml}</div>
                    </div>
                    <div class="totals-row">${totalsHtml}</div>
                </div>
            `;
        }
        
        phaseContent.innerHTML = `
            <div class="pane-title">💣 منطقة الحرب</div>
            <div class="dashboard">${boardsHtml}</div>
            <div class="nav-buttons">
                <button class="secondary" id="phase4Back">→ رجوع</button>
                <button id="showResultsBtn">📊 عرض النتائج</button>
            </div>
        `;
        
        const cells = document.querySelectorAll('.cell');
        cells.forEach(cell => {
            cell.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (isProcessing) return;
                
                const g = parseInt(cell.dataset.group, 10);
                const r = parseInt(cell.dataset.row, 10);
                const c = parseInt(cell.dataset.col, 10);
                const hasContent = cell.dataset.value && cell.dataset.value !== 'empty';
                
                if (revealedState[g][r][c]) return;
                
                isProcessing = true;
                await animateBomb(cell, hasContent);
                revealedState[g][r][c] = true;
                renderPhase4();
                saveState();
                isProcessing = false;
            });
        });
        
        document.getElementById('phase4Back').addEventListener('click', () => {
            phase = 3;
            render();
        });
        
        document.getElementById('showResultsBtn').addEventListener('click', () => {
            showResults();
        });
    }
    
    function unlockAudio() {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const silentOsc = audioCtx.createOscillator();
        const silentGain = audioCtx.createGain();
        silentOsc.connect(silentGain);
        silentGain.connect(audioCtx.destination);
        silentGain.gain.value = 0;
        silentOsc.start();
        silentOsc.stop(0.1);
        audioCtx.suspend();
        
        document.removeEventListener('click', unlockAudio);
        document.removeEventListener('touchstart', unlockAudio);
    }
    
    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);

    // ========== INIT: RESTORE STATE ON LOAD ==========
    (function init() {
        const restored = loadState();
        if (restored && gameStarted) {
            // Skip start screen and jump right into the game
            startScreen.style.display = 'none';
            gameContainer.style.display = 'block';
            render();
        } else {
            // Fresh start — ensure a clean initial state
            resetGame();
            // Keep start screen visible until user clicks "ابدأ المهمة"
        }
    })();
})();