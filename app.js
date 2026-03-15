/* ===== ZIELTRACKER APP v1.0 ===== */

(function() {
    'use strict';

    // ===== STORAGE KEYS =====
    const KEYS = {
        PROFILE: 'zt_profile',
        GOALS: 'zt_goals',
        HISTORY: 'zt_history',
    };

    // ===== STATE =====
    let profile = null;
    let goals = [];
    let history = []; // { goalId, goalName, goalIcon, date (ISO string), count }
    let currentView = 'goals';
    let calendarDate = new Date();
    let selectedGoalType = 'daily';

    // ===== HELPERS =====
    function save(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    }

    function load(key) {
        try { return JSON.parse(localStorage.getItem(key)); }
        catch { return null; }
    }

    function todayISO() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    function formatDate(isoStr) {
        const d = new Date(isoStr + 'T00:00:00');
        return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function formatDateTime(isoStr, time) {
        return `${formatDate(isoStr)} ${time || ''}`.trim();
    }

    function genId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    // ===== INIT =====
    function init() {
        profile = load(KEYS.PROFILE);
        goals = load(KEYS.GOALS) || [];
        history = load(KEYS.HISTORY) || [];

        setupNavigation();
        setupModals();

        if (!profile) {
            showOnboarding();
        } else {
            // Apply notification settings
            if (profile.notifyEnabled) {
                document.getElementById('notify-toggle').checked = true;
                document.getElementById('notify-time-container').style.display = 'flex';
                if (profile.notifyTime) {
                    document.getElementById('notify-time').value = profile.notifyTime;
                }
            }
            renderCurrentView();
        }
        
        setupNotifications();
        registerServiceWorker();
    }

    // ===== SERVICE WORKER & NOTIFICATIONS LOGIC =====
    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js')
                    .then(reg => console.log('SW registered!'))
                    .catch(err => console.log('SW Reg Failed:', err));
            });
        }
    }

    function setupNotifications() {
        const toggle = document.getElementById('notify-toggle');
        const timeInput = document.getElementById('notify-time');
        const timeContainer = document.getElementById('notify-time-container');

        toggle.addEventListener('change', async (e) => {
            if (e.target.checked) {
                // Request Permission
                if ('Notification' in window) {
                    const permission = await Notification.requestPermission();
                    if (permission === 'granted') {
                        timeContainer.style.display = 'flex';
                        profile.notifyEnabled = true;
                        profile.notifyTime = timeInput.value;
                        save(KEYS.PROFILE, profile);
                        startNotificationChecker();
                    } else {
                        e.target.checked = false;
                        alert('Benachrichtigungen wurden blockiert. Bitte in den Browsereinstellungen erlauben.');
                    }
                } else {
                    e.target.checked = false;
                    alert('Dein Browser unterstützt keine Benachrichtigungen.');
                }
            } else {
                timeContainer.style.display = 'none';
                profile.notifyEnabled = false;
                save(KEYS.PROFILE, profile);
            }
        });

        timeInput.addEventListener('change', (e) => {
            if (profile && profile.notifyEnabled) {
                profile.notifyTime = e.target.value;
                save(KEYS.PROFILE, profile);
            }
        });

        // Start checking loop if enabled
        if (profile && profile.notifyEnabled) {
            startNotificationChecker();
        }
    }

    let notificationInterval = null;
    function startNotificationChecker() {
        if (notificationInterval) clearInterval(notificationInterval);
        
        notificationInterval = setInterval(() => {
            if (!profile || !profile.notifyEnabled || !profile.notifyTime) return;

            const now = new Date();
            const currentHours = String(now.getHours()).padStart(2, '0');
            const currentMins = String(now.getMinutes()).padStart(2, '0');
            const currentTime = `${currentHours}:${currentMins}`;

            if (currentTime === profile.notifyTime) {
                // Check if we already notified today by tracking in localStorage
                const lastNotified = localStorage.getItem('zt_last_notified');
                const today = todayISO();
                
                if (lastNotified !== today) {
                    checkAndSendNotification();
                }
            }
        }, 60000); // Check every minute
    }

    function checkAndSendNotification() {
        const today = todayISO();
        let hasOpenGoals = false;

        // Check if there are daily goals that are NOT completed today
        for (const goal of goals) {
            if (goal.type === 'daily') {
                const todayEntries = history.filter(h => h.goalId === goal.id && h.date === today);
                if (todayEntries.length === 0) {
                    hasOpenGoals = true;
                    break;
                }
            }
        }

        if (hasOpenGoals) {
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.ready.then(registration => {
                    registration.showNotification('ZielTracker', {
                        body: 'Erinnerung: Du hast heute noch offene Tagesziele!',
                        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🏆</text></svg>',
                        vibrate: [200, 100, 200]
                    });
                });
            } else if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('ZielTracker', {
                    body: 'Erinnerung: Du hast heute noch offene Tagesziele!',
                });
            }
            localStorage.setItem('zt_last_notified', today);
        }
    }

    // ===== NAVIGATION =====
    function setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                switchView(view);
            });
        });
    }

    function switchView(viewName) {
        currentView = viewName;

        // Update nav
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelector(`[data-view="${viewName}"]`).classList.add('active');

        // Update views
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${viewName === 'goals' ? 'goals' : viewName === 'calendar' ? 'calendar' : 'profile'}`).classList.add('active');

        renderCurrentView();
    }

    function renderCurrentView() {
        switch(currentView) {
            case 'goals': renderGoals(); break;
            case 'calendar': renderCalendar(); break;
            case 'profile': renderProfile(); break;
        }
    }

    // ===== ONBOARDING =====
    function showOnboarding() {
        document.getElementById('onboarding-modal').style.display = 'flex';
    }

    function setupModals() {
        // Onboarding form
        document.getElementById('onboarding-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('onboard-name').value.trim();
            const age = document.getElementById('onboard-age').value;
            const bio = document.getElementById('onboard-bio').value.trim();

            if (!name) return;

            profile = { name, age: age ? parseInt(age) : null, bio: bio || null, hearts: 0 };
            save(KEYS.PROFILE, profile);
            document.getElementById('onboarding-modal').style.display = 'none';
            renderCurrentView();
        });

        // Add Goal Modal
        document.getElementById('btn-add-goal').addEventListener('click', () => {
            document.getElementById('add-goal-modal').style.display = 'flex';
            document.getElementById('goal-name').value = '';
            document.getElementById('goal-icon').value = '🎯';
            selectedGoalType = 'daily';
            updateTypeButtons();
        });

        document.getElementById('close-goal-modal').addEventListener('click', () => {
            document.getElementById('add-goal-modal').style.display = 'none';
        });

        // Goal type selector
        document.querySelectorAll('.type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedGoalType = btn.dataset.type;
                updateTypeButtons();
            });
        });

        // Add Goal Form
        document.getElementById('add-goal-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('goal-name').value.trim();
            const icon = document.getElementById('goal-icon').value.trim() || '🎯';

            if (!name) return;

            const goal = {
                id: genId(),
                name,
                icon,
                type: selectedGoalType,
                createdAt: todayISO()
            };

            goals.push(goal);
            save(KEYS.GOALS, goals);
            document.getElementById('add-goal-modal').style.display = 'none';
            renderGoals();
        });

        // Edit Profile Modal
        document.getElementById('btn-edit-profile').addEventListener('click', () => {
            if (!profile) return;
            document.getElementById('edit-name').value = profile.name || '';
            document.getElementById('edit-age').value = profile.age || '';
            document.getElementById('edit-bio').value = profile.bio || '';
            document.getElementById('edit-profile-modal').style.display = 'flex';
        });

        document.getElementById('close-profile-modal').addEventListener('click', () => {
            document.getElementById('edit-profile-modal').style.display = 'none';
        });

        document.getElementById('edit-profile-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('edit-name').value.trim();
            const age = document.getElementById('edit-age').value;
            const bio = document.getElementById('edit-bio').value.trim();

            if (!name) return;

            profile.name = name;
            profile.age = age ? parseInt(age) : null;
            profile.bio = bio || null;
            save(KEYS.PROFILE, profile);
            document.getElementById('edit-profile-modal').style.display = 'none';
            renderProfile();
        });

        // Delete Data
        document.getElementById('btn-delete-all').addEventListener('click', () => {
            document.getElementById('delete-modal').style.display = 'flex';
        });

        document.getElementById('cancel-delete').addEventListener('click', () => {
            document.getElementById('delete-modal').style.display = 'none';
        });

        document.getElementById('confirm-delete').addEventListener('click', () => {
            localStorage.removeItem(KEYS.GOALS);
            localStorage.removeItem(KEYS.HISTORY);
            localStorage.removeItem(KEYS.PROFILE);
            goals = [];
            history = [];
            profile = null;
            document.getElementById('delete-modal').style.display = 'none';
            showOnboarding();
        });

        // Close modals with overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay && overlay.id !== 'onboarding-modal') {
                    overlay.style.display = 'none';
                }
            });
        });

        // Calendar nav
        document.getElementById('cal-prev').addEventListener('click', () => {
            calendarDate.setMonth(calendarDate.getMonth() - 1);
            renderCalendar();
        });

        document.getElementById('cal-next').addEventListener('click', () => {
            calendarDate.setMonth(calendarDate.getMonth() + 1);
            renderCalendar();
        });
    }

    function updateTypeButtons() {
        document.querySelectorAll('.type-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === selectedGoalType);
        });
    }

    // ===== RENDER GOALS =====
    function renderGoals() {
        const container = document.getElementById('goals-container');

        if (goals.length === 0) {
            container.innerHTML = `
                <div class="goals-empty">
                    <div class="goals-empty-icon">🏆</div>
                    <h2>Noch keine Ziele</h2>
                    <p>Tippe auf das + oben, um dein erstes Ziel hinzuzufügen</p>
                </div>
            `;
            return;
        }

        const today = todayISO();
        let html = '<div class="goals-list">';

        goals.forEach(goal => {
            const todayEntries = history.filter(h => h.goalId === goal.id && h.date === today);
            const isDaily = goal.type === 'daily';
            const isDone = isDaily && todayEntries.length > 0;
            const count = todayEntries.reduce((sum, h) => sum + (h.count || 1), 0);

            html += `
                <div class="goal-card ${isDone ? 'completed' : ''}" data-id="${goal.id}">
                    <div class="goal-emoji">${goal.icon}</div>
                    <div class="goal-info">
                        <div class="goal-name">${escapeHtml(goal.name)}</div>
                        <div class="goal-type-badge">${isDaily ? '📅 Tagesziel' : '♾️ Normal'}</div>
                    </div>
                    <div class="goal-actions">
                        ${isDaily ? `
                            <button class="goal-check-btn ${isDone ? 'checked' : ''}" data-action="toggle" data-id="${goal.id}">
                                ${isDone ? '✓' : ''}
                            </button>
                        ` : `
                            <div class="goal-counter">
                                <button class="goal-count-btn" data-action="increment" data-id="${goal.id}">+</button>
                                <span class="goal-count">${count}</span>
                            </div>
                        `}
                        <button class="goal-delete-btn" data-action="delete" data-id="${goal.id}">✕</button>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;

        // Attach events
        container.querySelectorAll('[data-action="toggle"]').forEach(btn => {
            btn.addEventListener('click', () => toggleDailyGoal(btn.dataset.id));
        });

        container.querySelectorAll('[data-action="increment"]').forEach(btn => {
            btn.addEventListener('click', () => incrementNormalGoal(btn.dataset.id));
        });

        container.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', () => deleteGoal(btn.dataset.id));
        });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function toggleDailyGoal(goalId) {
        const today = todayISO();
        const existing = history.findIndex(h => h.goalId === goalId && h.date === today);

        if (existing >= 0) {
            // Undo
            history.splice(existing, 1);
            profile.hearts = Math.max(0, (profile.hearts || 0) - 10);
        } else {
            // Complete
            const goal = goals.find(g => g.id === goalId);
            const now = new Date();
            const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')} Uhr`;
            history.push({
                goalId,
                goalName: goal.name,
                goalIcon: goal.icon,
                date: today,
                time: timeStr,
                count: 1
            });
            profile.hearts = (profile.hearts || 0) + 10;
        }

        save(KEYS.HISTORY, history);
        save(KEYS.PROFILE, profile);
        renderGoals();
    }

    function incrementNormalGoal(goalId) {
        const today = todayISO();
        const goal = goals.find(g => g.id === goalId);
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')} Uhr`;

        history.push({
            goalId,
            goalName: goal.name,
            goalIcon: goal.icon,
            date: today,
            time: timeStr,
            count: 1
        });

        profile.hearts = (profile.hearts || 0) + 10;
        save(KEYS.HISTORY, history);
        save(KEYS.PROFILE, profile);
        renderGoals();
    }

    function deleteGoal(goalId) {
        goals = goals.filter(g => g.id !== goalId);
        save(KEYS.GOALS, goals);
        renderGoals();
    }

    // ===== RENDER CALENDAR =====
    function renderCalendar() {
        renderCalendarStats();
        renderCalendarGrid();
        renderActivities();
    }

    function renderCalendarStats() {
        // Total completions
        const totalCompletions = history.length;
        document.getElementById('stat-achieved').textContent = totalCompletions;

        // Unique goals completed
        const uniqueGoals = new Set(history.map(h => h.goalId)).size;
        document.getElementById('stat-unique').textContent = uniqueGoals;
    }

    function renderCalendarGrid() {
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();

        // Month label
        const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
        document.getElementById('cal-month-year').textContent = `${monthNames[month]} ${year}`;

        // First day of month (0=Sun ... 6=Sat) -> adjust to Mon-start
        const firstDay = new Date(year, month, 1).getDay();
        const startOffset = (firstDay === 0 ? 6 : firstDay - 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrevMonth = new Date(year, month, 0).getDate();

        const today = todayISO();
        const grid = document.getElementById('calendar-grid');

        // Get days with activity
        const activeDays = new Set();
        history.forEach(h => {
            const d = new Date(h.date + 'T00:00:00');
            if (d.getFullYear() === year && d.getMonth() === month) {
                activeDays.add(d.getDate());
            }
        });

        let html = '';

        // Previous month days
        for (let i = startOffset - 1; i >= 0; i--) {
            const day = daysInPrevMonth - i;
            html += `<div class="cal-day other-month">${day}</div>`;
        }

        // Current month days
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const isToday = dateStr === today;
            const hasActivity = activeDays.has(d);

            let classes = 'cal-day';
            if (isToday) classes += ' today';
            if (hasActivity) classes += ' has-activity';

            html += `<div class="${classes}">${d}</div>`;
        }

        // Next month days (fill remaining cells)
        const totalCells = startOffset + daysInMonth;
        const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
        for (let d = 1; d <= remaining; d++) {
            html += `<div class="cal-day other-month">${d}</div>`;
        }

        grid.innerHTML = html;
    }

    function renderActivities() {
        const list = document.getElementById('activities-list');

        // Get last 10 activities, sorted newest first
        const sorted = [...history].sort((a, b) => {
            const dateCompare = b.date.localeCompare(a.date);
            if (dateCompare !== 0) return dateCompare;
            return (b.time || '').localeCompare(a.time || '');
        }).slice(0, 10);

        if (sorted.length === 0) {
            list.innerHTML = '<div class="activities-empty">Noch keine Aktivitäten</div>';
            return;
        }

        let html = '';
        sorted.forEach(entry => {
            html += `
                <div class="activity-item">
                    <div class="activity-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div class="activity-info">
                        <div class="activity-name">${escapeHtml(entry.goalName)}</div>
                        <div class="activity-date">${formatDate(entry.date)} ${entry.time || ''}</div>
                    </div>
                </div>
            `;
        });

        list.innerHTML = html;
    }

    // ===== RENDER PROFILE =====
    function renderProfile() {
        if (!profile) return;

        document.getElementById('profile-name').textContent = profile.name;
        document.getElementById('profile-age').textContent = profile.age ? `${profile.age} Jahre` : '';
        document.getElementById('profile-bio').textContent = profile.bio || '';
        document.getElementById('profile-hearts').textContent = (profile.hearts || 0).toLocaleString('de-DE');

        // Overview stats
        document.getElementById('overview-goals').textContent = goals.length;
        document.getElementById('overview-completed').textContent = history.length;
        document.getElementById('overview-daily').textContent = goals.filter(g => g.type === 'daily').length;
        document.getElementById('overview-normal').textContent = goals.filter(g => g.type === 'normal').length;

        // Achievements
        renderStreaks();
        renderMostCompleted();
    }

    function renderStreaks() {
        // Get unique active dates sorted
        const activeDates = [...new Set(history.map(h => h.date))].sort();

        if (activeDates.length === 0) {
            document.getElementById('ach-current-streak').textContent = '0 Tage';
            document.getElementById('ach-longest-streak').textContent = '0 Tage';
            return;
        }

        // Calculate streaks
        let currentStreak = 0;
        let longestStreak = 0;
        let tempStreak = 1;

        // Check if today or yesterday is in active dates (for current streak)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        for (let i = 1; i < activeDates.length; i++) {
            const prev = new Date(activeDates[i - 1] + 'T00:00:00');
            const curr = new Date(activeDates[i] + 'T00:00:00');
            const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                tempStreak++;
            } else {
                longestStreak = Math.max(longestStreak, tempStreak);
                tempStreak = 1;
            }
        }
        longestStreak = Math.max(longestStreak, tempStreak);

        // Current streak: count backwards from today
        const todayStr = todayISO();
        const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;

        if (activeDates.includes(todayStr) || activeDates.includes(yesterdayStr)) {
            currentStreak = 1;
            let checkDate = activeDates.includes(todayStr) ? new Date(today) : new Date(yesterday);

            while (true) {
                checkDate.setDate(checkDate.getDate() - 1);
                const checkStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth()+1).padStart(2,'0')}-${String(checkDate.getDate()).padStart(2,'0')}`;
                if (activeDates.includes(checkStr)) {
                    currentStreak++;
                } else {
                    break;
                }
            }
        }

        document.getElementById('ach-current-streak').textContent = `${currentStreak} Tage`;
        document.getElementById('ach-longest-streak').textContent = `${longestStreak} Tage`;
    }

    function renderMostCompleted() {
        if (history.length === 0) {
            document.getElementById('ach-most-completed').textContent = '–';
            return;
        }

        const counts = {};
        history.forEach(h => {
            counts[h.goalName] = (counts[h.goalName] || 0) + 1;
        });

        let maxName = '–';
        let maxCount = 0;
        for (const [name, count] of Object.entries(counts)) {
            if (count > maxCount) {
                maxCount = count;
                maxName = name;
            }
        }

        document.getElementById('ach-most-completed').textContent = maxCount > 0 ? `${maxName} (${maxCount}x)` : '–';
    }

    // ===== START =====
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
