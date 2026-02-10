let state = {
    currentVariantIndex: 0,
    currentTaskIndex: 0,
    correctAnswersInSession: 0,
    attemptsCount: parseInt(localStorage.getItem('attemptsCount') || '0', 10),
    currentVariantTasks: [],
    isTestActive: false,
    allTasksByDifficulty: { 1: [], 2: [], 3: [] },
    allVariants: []
};

let mf;

// Исправленный конвертер LaTeX в формат Algebrite
function latexToAlgebrite(latex) {
    if (!latex) return "";
    let s = latex;

    // 1. Предварительная очистка
    s = s.replace(/\\left/g, '').replace(/\\right/g, '');
    s = s.replace(/\\,/g, ''); // пробелы в LaTeX

    // 2. Замена дробей \frac{a}{b} -> (a)/(b)
    while (s.includes('\\frac')) {
        s = s.replace(/\\frac{((?:[^{}]|{[^{}]*})*)}{((?:[^{}]|{[^{}]*})*)}/g, '(($1)/($2))');
    }

    // 3. Защита функций от разбиения на множители (sin -> SIN_MARKER)
    const funcs = ['sin', 'cos', 'tan', 'cot', 'ln', 'sqrt', 'exp'];
    funcs.forEach(f => {
        const regex = new RegExp('\\\\' + f, 'g');
        s = s.replace(regex, f.toUpperCase());
    });

    // 4. Обработка экспоненты e^{...} и e^x
    s = s.replace(/e\^\{([^}]+)\}/g, 'exp($1)');
    s = s.replace(/e\^([a-z0-9])/g, 'exp($1)');

    // 5. Очистка скобок и специфических символов
    s = s.replace(/\{/g, '(').replace(/\}/g, ')');
    s = s.replace(/\\cdot/g, '*');

    // 6. Расстановка знаков умножения между числом и переменной/скобкой
    s = s.replace(/(\d)([a-zA-Z\(])/g, '$1*$2');
    s = s.replace(/(\))(\()/g, '$1*$2');
    s = s.replace(/(\))([a-zA-Z])/g, '$1*$2');

    // 7. Возврат функций в нижний регистр
    funcs.forEach(f => {
        const regex = new RegExp(f.toUpperCase(), 'g');
        s = s.replace(regex, f);
    });

    // 8. Удаление оставшихся обратных слешей
    s = s.replace(/\\/g, '');

    return s;
}

function showFeedback(message, type, correctAnsLatex = '') {
    const feedbackEl = document.getElementById('feedback');
    feedbackEl.innerHTML = message + (correctAnsLatex ? `<br><small style="font-size:0.8em">Правильно было: ${correctAnsLatex}</small>` : '');
    feedbackEl.style.background = type === 'success' ? 'var(--success)' : 'var(--danger)';
    feedbackEl.style.display = 'block';
    setTimeout(() => { feedbackEl.style.display = 'none'; }, 3000);
}

function setupKeyboard() {
    mf.setOptions({
        virtualKeyboards: 'trainer-keyboard',
        customVirtualKeyboards: {
            'trainer-keyboard': {
                label: 'Math',
                layers: [{
                    name: 'main',
                    rows: [
                        [
                            { label: "1", key: "1" }, { label: "2", key: "2" }, { label: "3", key: "3" },
                            { label: "+", key: "+" }, { label: "-", key: "-" }, 
                            { label: "⌫", command: ["performWithComponent", "mathfield", "deleteBackward"] }
                        ],
                        [
                            { label: "4", key: "4" }, { label: "5", key: "5" }, { label: "6", key: "6" },
                            { label: "×", key: "*" }, { label: "/", latex: "\\frac{#?}{#?}" },
                            { label: "←", command: ["performWithComponent", "mathfield", "moveBackward"] }
                        ],
                        [
                            { label: "7", key: "7" }, { label: "8", key: "8" }, { label: "9", key: "9" },
                            { label: "(", key: "(" }, { label: ")", key: ")" },
                            { label: "→", command: ["performWithComponent", "mathfield", "moveForward"] }
                        ],
                        [
                            { label: "0", key: "0" }, { label: "x", latex: "x" }, 
                            { label: "^", latex: "#?^{#?}" }, { label: "√", latex: "\\sqrt{#?}" },
                            { label: "e", latex: "e" }, { label: "Enter", command: "acceptCommand" }
                        ],
                        [
                            { label: "sin", latex: "\\sin" }, { label: "cos", latex: "\\cos" },
                            { label: "ln", latex: "\\ln" }, { label: "tan", latex: "\\tan" }
                        ]
                    ]
                }]
            }
        }
    });

    // Слушатель для нажатия Enter
    mf.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') checkAnswer();
    });
    // Слушатель для кнопки Enter на виртуальной клавиатуре
    mf.addEventListener('on-command', (e) => {
        if (e.detail.command === 'acceptCommand') checkAnswer();
    });
}

async function loadTasksAndGenerateVariants() {
    try {
        const response = await fetch('tasks.json');
        const data = await response.json();
        data.forEach(task => {
            if (state.allTasksByDifficulty[task.difficulty]) state.allTasksByDifficulty[task.difficulty].push(task);
        });
        generateVariants();
        populateVariantSelector();
        startTest();
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

function generateVariants() {
    state.allVariants = [];
    for (let i = 0; i < 25; i++) {
        let vTasks = [
            ...getRandom(state.allTasksByDifficulty[1], 2),
            ...getRandom(state.allTasksByDifficulty[2], 2),
            ...getRandom(state.allTasksByDifficulty[3], 1)
        ];
        state.allVariants.push(vTasks.sort(() => Math.random() - 0.5));
    }
}

function getRandom(arr, n) {
    return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

function populateVariantSelector() {
    const selectEl = document.getElementById('variant-select');
    for (let i = 0; i < 25; i++) {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = `Вариант ${i + 1}`;
        selectEl.appendChild(opt);
    }
    selectEl.value = state.currentVariantIndex;
}

function startTest() {
    state.isTestActive = true;
    state.currentTaskIndex = 0;
    state.correctAnswersInSession = 0;
    state.currentVariantTasks = state.allVariants[state.currentVariantIndex];
    displayTask();
}

function displayTask() {
    const task = state.currentVariantTasks[state.currentTaskIndex];
    const qEl = document.getElementById('question');
    katex.render(task.q, qEl, { throwOnError: false, displayMode: true });
    mf.value = "";
    setTimeout(() => mf.focus(), 100);
    updateStats();
}

function updateStats() {
    document.getElementById('variant-info').textContent = `Вариант ${state.currentVariantIndex + 1}`;
    document.getElementById('task-info').textContent = `Задача: ${state.currentTaskIndex + 1}/5`;
    document.getElementById('score-display').textContent = `Правильно: ${state.correctAnswersInSession}`;
    document.getElementById('attempts-display').textContent = `Попыток: ${state.attemptsCount}`;
}

function checkAnswer() {
    const task = state.currentVariantTasks[state.currentTaskIndex];
    if (!task || !mf.value) return;

    const studentAlg = latexToAlgebrite(mf.getValue('latex'));
    const correctAlg = latexToAlgebrite(task.a);

    let isCorrect = false;
    try {
        const diff = Algebrite.run(`simplify((${studentAlg}) - (${correctAlg}))`);
        if (diff === '0') isCorrect = true;
    } catch (e) { isCorrect = false; }

    if (isCorrect) {
        state.correctAnswersInSession++;
        showFeedback("Правильно!", "success");
    } else {
        showFeedback("Неверно", "danger", task.a);
    }

    setTimeout(() => {
        state.currentTaskIndex++;
        if (state.currentTaskIndex < 5) {
            displayTask();
        } else {
            generateReport();
            startTest();
        }
    }, 2000);
}

function generateReport() {
    const report = `Результат: ${state.correctAnswersInSession} из 5. Попыток сворачивания: ${state.attemptsCount}`;
    alert(report);
}

document.addEventListener('DOMContentLoaded', () => {
    mf = document.getElementById('answer-input');
    setupKeyboard();
    document.getElementById('variant-select').addEventListener('change', (e) => {
        state.currentVariantIndex = parseInt(e.target.value);
        startTest();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && state.isTestActive) {
            state.attemptsCount++;
            localStorage.setItem('attemptsCount', state.attemptsCount);
            startTest();
        }
    });
    loadTasksAndGenerateVariants();
});
