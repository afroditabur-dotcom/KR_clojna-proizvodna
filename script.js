// Глобальный объект состояния приложения
let state = {
    currentVariantIndex: 0, // Текущий вариант (от 0 до 24). Будет установлен выбором пользователя.
    currentTaskIndex: 0,    // Текущая задача в варианте (от 0 до 4)
    correctAnswersInSession: 0, // Количество правильных ответов в текущей сессии (сбрасывается при "списывании")
    attemptsCount: parseInt(localStorage.getItem('attemptsCount') || '0', 10), // Общее количество перезапусков (хранится в localStorage)
    currentVariantTasks: [], // 5 задач для текущего варианта
    isTestActive: false,     // Флаг активности теста для функции "списывания"
    allTasksByDifficulty: { 1: [], 2: [], 3: [] }, // Задачи, загруженные из JSON, сгруппированные по сложности
    allVariants: []          // Сгенерированные 25 вариантов
};

// Объект MathLive поля ввода
let mf;

// --- Вспомогательные функции ---

/**
 * Конвертирует LaTeX-строку из MathLive в формат, понятный Algebrite.
 * @param {string} latex - LaTeX-строка.
 * @returns {string} Строка, совместимая с Algebrite.
 */
function latexToAlgebrite(latex) {
    if (!latex) return "";
    let s = latex;

    // Замена LaTeX-команд на Algebrite-совместимые
    s = s.replace(/\\left\(/g, '(').replace(/\\right\)/g, ')');
    s = s.replace(/\{/g, '(').replace(/\}/g, ')'); // MathLive может использовать {} для группировки
    s = s.replace(/\\cdot/g, '*'); // Явное умножение
    s = s.replace(/\\frac{(.*?)}{(.*?)}/g, '($1)/($2)'); // Дроби
    s = s.replace(/\\sin/g, 'sin');
    s = s.replace(/\\cos/g, 'cos');
    s = s.replace(/\\tan/g, 'tan');
    s = s.replace(/\\cot/g, 'cot'); // Algebrite поддерживает cot
    s = s.replace(/\\ln/g, 'ln');
    s = s.replace(/\\exp/g, 'exp');
    s = s.replace(/\\sqrt{(.*?)}/g, 'sqrt($1)'); // Квадратные корни

    // Обработка неявного умножения (например, 2x, x(y), (x)y, x^2y)
    // Добавляем '*' между цифрой и буквой/функцией/скобкой
    s = s.replace(/([0-9])([a-zA-Z])/g, '$1*$2');
    s = s.replace(/([0-9])(sin|cos|tan|cot|ln|exp|sqrt)/g, '$1*$2'); // 2sin -> 2*sin
    s = s.replace(/([0-9])(\()/g, '$1*$2'); // 2(x+1) -> 2*(x+1)

    // Добавляем '*' между двумя буквами/функциями/скобками, если его нет
    s = s.replace(/([a-zA-Z)])([a-zA-Z(])/g, '$1*$2'); // x(y) -> x*(y), (x)y -> (x)*y
    s = s.replace(/([a-zA-Z])([a-zA-Z])/g, '$1*$2'); // xy -> x*y (может быть x*y или функция)
    s = s.replace(/(\))([a-zA-Z])/g, '$1*$2'); // (x+1)y -> (x+1)*y

    // Специальный случай для e^x: Algebrite использует exp(x)
    s = s.replace(/e\^\{(.*?)\}/g, 'exp($1)'); // e^{2x} -> exp(2x)
    s = s.replace(/e\^([a-zA-Z0-9])/g, 'exp($1)'); // e^x -> exp(x)

    // Удаляем все оставшиеся обратные слеши, которые не являются частью функций Algebrite
    s = s.replace(/\\/g, '');

    return s;
}

/**
 * Отображает всплывающее сообщение обратной связи.
 * @param {string} message - Текст сообщения.
 * @param {'success'|'danger'} type - Тип сообщения (для стилизации).
 * @param {string} [correctAnsLatex=''] - Правильный ответ в LaTeX, если сообщение об ошибке.
 */
function showFeedback(message, type, correctAnsLatex = '') {
    const feedbackEl = document.getElementById('feedback');
    feedbackEl.innerHTML = message + (correctAnsLatex ? `<small>Правильный ответ: ${correctAnsLatex}</small>` : '');
    feedbackEl.style.background = `var(--${type})`;
    feedbackEl.style.display = 'block';
    setTimeout(() => {
        feedbackEl.style.display = 'none';
    }, 2500);
}

// --- Логика тестирования ---

/**
 * Настраивает виртуальную клавиатуру для MathLive поля ввода.
 */
function setupKeyboard() {
    mf.setOptions({
        virtualKeyboards: 'trainer-keyboard',
        customVirtualKeyboards: {
            'trainer-keyboard': {
                label: 'Math',
                layers: [{
                    name: 'main',
                    rows: [
                        // Ряд 1: Переменные, степени, корни, экспоненты, логарифмы
                        [
                            { label: "x", latex: "x" },
                            { label: "^", latex: "#?^{#?}" },
                            { label: "√", latex: "\\sqrt{#?}" },
                            { label: "e", latex: "e" },
                            { label: "ln", latex: "\\ln" }
                        ],
                        // Ряд 2: Тригонометрические функции и скобки
                        [
                            { label: "sin", latex: "\\sin" },
                            { label: "cos", latex: "\\cos" },
                            { label: "tan", latex: "\\tan" },
                            { label: "(", key: "(" },
                            { label: ")", key: ")" }
                        ],
                        // Ряд 3: Арифметические операции и дроби
                        [
                            { label: "×", key: "*" }, // Визуальный символ умножения
                            { label: "/", latex: "\\frac{#?}{#?}" }, // Использование \frac для красивых дробей
                            { label: "+", key: "+" },
                            { label: "-", key: "-" },
                            { label: ".", key: "." } // Десятичная точка
                        ],
                        // Ряд 4: Цифры 1-5
                        [
                            { label: "1", key: "1" }, { label: "2", key: "2" }, { label: "3", key: "3" },
                            { label: "4", key: "4" }, { label: "5", key: "5" }
                        ],
                        // Ряд 5: Цифры 6-0
                        [
                            { label: "6", key: "6" }, { label: "7", key: "7" }, { label: "8", key: "8" },
                            { label: "9", key: "9" }, { label: "0", key: "0" }
                        ],
                        // Ряд 6: Удаление и перемещение курсора
                        [
                            { label: "⌫", command: ["performWithComponent", "mathfield", "deleteBackward"] },
                            { label: "←", command: ["performWithComponent", "mathfield", "moveBackward"] },
                            { label: "→", command: ["performWithComponent", "mathfield", "moveForward"] }
                        ]
                    ]
                }]
            }
        }
    });
}

/**
 * Загружает задачи из `tasks.json` и генерирует 25 вариантов.
 */
async function loadTasksAndGenerateVariants() {
    try {
        const response = await fetch('tasks.json');
        const data = await response.json();

        // Распределяем задачи по уровням сложности
        data.forEach(task => {
            if (state.allTasksByDifficulty[task.difficulty]) {
                state.allTasksByDifficulty[task.difficulty].push(task);
            }
        });

        generateVariants(); // Создаем 25 вариантов
        populateVariantSelector(); // Заполняем выпадающий список
        startTest(); // Начинаем тест с выбранного (или первого) варианта
    } catch (error) {
        console.error('Ошибка загрузки задач:', error);
        alert('Ошибка загрузки задач. Пожалуйста, убедитесь, что файл tasks.json существует и содержит корректные данные.');
    }
}

/**
 * Заполняет выпадающий список выбора вариантов.
 */
function populateVariantSelector() {
    const selectEl = document.getElementById('variant-select');
    selectEl.innerHTML = ''; // Очищаем предыдущие опции

    for (let i = 0; i < state.allVariants.length; i++) {
        const option = document.createElement('option');
        option.value = i; // Используем индекс варианта (0-24) как значение
        option.textContent = `Вариант ${i + 1}`;
        selectEl.appendChild(option);
    }
    // Устанавливаем текущий выбранный вариант в селекторе
    selectEl.value = state.currentVariantIndex;
}

/**
 * Генерирует 25 вариантов, каждый из которых содержит 5 задач,
 * сбалансированных по сложности (2 легкие, 2 средние, 1 сложная).
 * Задачи не повторяются внутри одного варианта.
 */
function generateVariants() {
    state.allVariants = [];
    const numVariants = 25;
    const tasksPerVariant = 5;
    // Целевое распределение сложности: 2 легкие, 2 средние, 1 сложная
    const difficultyDistribution = { 1: 2, 2: 2, 3: 1 };

    for (let i = 0; i < numVariants; i++) {
        let currentVariantTasks = [];
        let usedTaskIdsInVariant = new Set(); // Для отслеживания задач, уже добавленных в текущий вариант

        for (const difficultyLevel in difficultyDistribution) {
            const count = difficultyDistribution[difficultyLevel];
            const availableTasks = state.allTasksByDifficulty[difficultyLevel];
            let tasksAdded = 0;

            // Перемешиваем доступные задачи для случайного выбора без повторений для данной сложности
            let shuffledTasks = [...availableTasks].sort(() => Math.random() - 0.5);

            for (let j = 0; j < shuffledTasks.length && tasksAdded < count; j++) {
                const task = shuffledTasks[j];
                // Проверяем, что задача не была использована в этом варианте
                if (task && !usedTaskIdsInVariant.has(task.id)) {
                    currentVariantTasks.push(task);
                    usedTaskIdsInVariant.add(task.id);
                    tasksAdded++;
                }
            }
        }

        // Если по какой-то причине в варианте оказалось меньше 5 задач (например, недостаточно задач в JSON),
        // заполняем оставшиеся места случайными доступными задачами.
        while (currentVariantTasks.length < tasksPerVariant) {
            const allAvailable = Object.values(state.allTasksByDifficulty).flat();
            if (allAvailable.length === 0) {
                 console.error("Банк задач пуст или недостаточен для заполнения вариантов.");
                 break;
            }
            const randomTask = allAvailable[Math.floor(Math.random() * allAvailable.length)];
            if (randomTask && !usedTaskIdsInVariant.has(randomTask.id)) {
                currentVariantTasks.push(randomTask);
                usedTaskIdsInVariant.add(randomTask.id);
            }
        }

        // Перемешиваем задачи внутри варианта, чтобы их порядок был случайным
        currentVariantTasks.sort(() => Math.random() - 0.5);
        state.allVariants.push(currentVariantTasks);
    }
}

/**
 * Начинает или перезапускает тест для текущего выбранного варианта.
 * Сбрасывает текущий счет и позицию в тесте.
 */
function startTest() {
    state.isTestActive = true; // Активируем детектор "списывания"
    state.currentTaskIndex = 0;
    state.correctAnswersInSession = 0; // Сбрасываем счет для новой попытки

    // Убеждаемся, что currentVariantIndex находится в допустимых пределах
    if (state.currentVariantIndex < 0 || state.currentVariantIndex >= state.allVariants.length) {
        state.currentVariantIndex = 0; // Если неверный, сбрасываем на первый
    }

    // Загружаем задачи для текущего выбранного варианта
    state.currentVariantTasks = state.allVariants[state.currentVariantIndex];
    displayTask();
    updateStats();

    // Обновляем селектор, чтобы он показывал текущий вариант
    const selectEl = document.getElementById('variant-select');
    if (selectEl) {
        selectEl.value = state.currentVariantIndex;
    }
}

/**
 * Отображает текущую задачу в интерфейсе.
 */
function displayTask() {
    const currentTask = state.currentVariantTasks[state.currentTaskIndex];
    if (!currentTask) {
        console.error("Задача для текущих индексов не найдена.");
        return;
    }

    const qEl = document.getElementById('question');
    qEl.innerHTML = ""; // Очищаем предыдущий вопрос
    // Рендерим вопрос с помощью KaTeX
    katex.render(currentTask.q, qEl, { throwOnError: false, displayMode: true });

    mf.value = ""; // Очищаем поле ввода
    mf.focus(); // Устанавливаем фокус на поле ввода

    updateStats();
}

/**
 * Обновляет отображение информации о варианте, задаче, счете и попытках.
 */
function updateStats() {
    document.getElementById('variant-info').textContent = `Вариант ${state.currentVariantIndex + 1}/25`;
    document.getElementById('task-info').textContent = `Задача: ${state.currentTaskIndex + 1}/5`;
    document.getElementById('score-display').textContent = `Правильно: ${state.correctAnswersInSession}`;
    document.getElementById('attempts-display').textContent = `Попыток: ${state.attemptsCount}`;
}

/**
 * Проверяет ответ студента.
 */
function checkAnswer() {
    const currentTask = state.currentVariantTasks[state.currentTaskIndex];
    if (!currentTask) return;

    const studentLatex = mf.getValue('latex');
    const studentAlgebrite = latexToAlgebrite(studentLatex);
    const correctAlgebrite = latexToAlgebrite(currentTask.a);

    let isCorrect = false;
    try {
        // Используем Algebrite для упрощения разности. Если результат '0', выражения эквивалентны.
        // Также проверяем, что поле ввода не пустое
        if (studentAlgebrite && Algebrite.run(`simplify((${studentAlgebrite}) - (${correctAlgebrite}))`) === '0') {
            isCorrect = true;
        }
    } catch (e) {
        console.warn("Ошибка Algebrite при сравнении:", e);
        // Если Algebrite не смог разобрать выражение, считаем ответ неверным
        isCorrect = false;
    }

    if (isCorrect) {
        state.correctAnswersInSession++;
        showFeedback("Правильно!", "success");
    } else {
        showFeedback("Ошибка!", "danger", currentTask.a);
    }

    // Переход к следующей задаче или варианту/отчету
    setTimeout(() => {
        state.currentTaskIndex++;
        if (state.currentTaskIndex < 5) { // Следующая задача в текущем варианте
            displayTask();
        } else { // Текущий вариант завершен
            // Если студент выбрал конкретный вариант, и он его завершил,
            // мы не переходим к следующему варианту автоматически, а генерируем отчет.
            // Если же это был полный прогон всех 25 вариантов, то переходим.
            if (state.currentVariantIndex < 24) { // Есть еще варианты после текущего (если не последний)
                state.currentVariantIndex++;
                state.currentTaskIndex = 0; // Сбрасываем индекс задачи для нового варианта
                state.currentVariantTasks = state.allVariants[state.currentVariantIndex]; // Загружаем задачи нового варианта
                displayTask();
            } else { // Все варианты завершены, или текущий (последний) вариант завершен
                generateReport();
            }
        }
        updateStats();
    }, 2500); // Задержка перед переходом к следующей задаче/варианту
}

/**
 * Генерирует и отображает финальный отчет.
 */
function generateReport() {
    state.isTestActive = false; // Отключаем детектор "списывания"
    const finalScore = state.correctAnswersInSession;
    const finalAttempts = state.attemptsCount;
    const variantFinished = state.currentVariantIndex + 1; // Номер варианта, который был только что завершен

    const reportContent = `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Отчет по тесту</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; background-color: #f4f7f9; color: #333; }
                .report-container { max-width: 600px; margin: 30px auto; padding: 30px; border-radius: 15px; background: white; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
                h1 { color: #4a90e2; text-align: center; margin-bottom: 30px; }
                p { font-size: 1.1rem; line-height: 1.6; margin-bottom: 15px; }
                .score { font-size: 1.3rem; font-weight: bold; color: #2ecc71; text-align: center; margin-top: 25px; }
                .attempts { font-size: 1.1rem; color: #e74c3c; text-align: center; margin-top: 15px; }
                .print-button { display: block; width: 180px; margin: 30px auto 0; padding: 12px 20px; border: none; border-radius: 8px; background: #4a90e2; color: white; font-size: 1rem; cursor: pointer; transition: background 0.2s; }
                .print-button:hover { background: #357ABD; }
            </style>
        </head>
        <body>
            <div class="report-container">
                <h1>Отчет по тесту "Производная сложной функции"</h1>
                <p>Тест завершен.</p>
                <p>Вы работали над <strong>Вариантом ${variantFinished}</strong>.</p>
                <p class="score">Количество правильно выполненных задач: <strong>${finalScore}</strong></p>
                <p class="attempts">Количество перезапусков (попыток списывания): <strong>${finalAttempts}</strong></p>
                <button class="print-button" onclick="window.print()">Распечатать отчет</button>
            </div>
        </body>
        </html>
    `;

    const reportWindow = window.open('', '_blank', 'width=800,height=600');
    reportWindow.document.write(reportContent);
    reportWindow.document.close();
}

// --- Функция "списывания" ---

/**
 * Обрабатывает изменение видимости окна для предотвращения "списывания".
 * При сворачивании окна тест перезапускается, и счетчик попыток увеличивается.
 */
function handleVisibilityChange() {
    if (document.hidden && state.isTestActive) {
        state.attemptsCount++;
        localStorage.setItem('attemptsCount', state.attemptsCount); // Сохраняем в локальное хранилище
        alert('Обнаружено сворачивание окна! Тест будет начат заново с текущего варианта, а текущая попытка учтена в отчете.');
        startTest(); // Перезапускаем текущий вариант теста
    }
}

// --- Инициализация DOM и запуск приложения ---
document.addEventListener('DOMContentLoaded', () => {
    mf = document.getElementById('answer-input');
    setupKeyboard(); // Настраиваем виртуальную клавиатуру
    document.getElementById('submit-btn').addEventListener('click', checkAnswer); // Обработчик кнопки "Проверить"
    document.addEventListener('visibilitychange', handleVisibilityChange); // Детектор "списывания"

    // Обработчик для выбора варианта
    document.getElementById('variant-select').addEventListener('change', (event) => {
        state.currentVariantIndex = parseInt(event.target.value, 10);
        startTest(); // Запускаем тест с выбранного варианта
    });

    loadTasksAndGenerateVariants(); // Загружаем задачи и запускаем тест
});
