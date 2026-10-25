"use client";

import { useEffect, useRef, useState } from "react";

type Repeat = "none" | "daily" | "weekly";

type Todo = {
  id: string;
  text: string;
  done: boolean;
  // くり返しタスクだけが持つ。date は「この回の予定日」（YYYY-MM-DD）
  repeat?: Repeat;
  date?: string;
  // 完了したときに作った次の回。未完了に戻したら、それも消す
  nextId?: string;
};

// 片付けたあとも「今週いくつ終わったか」を数えられるように、完了の記録は別に残す
type DoneLog = { id: string; at: number };

type Toast = {
  message: string;
  // 「元に戻す」を押したときに戻す、操作する前の一覧
  undo?: Todo[];
};

const STORAGE_KEY = "todo-next:todos";
const LOG_KEY = "todo-next:done-log";
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const REPEAT_LABEL: Record<Repeat, string> = {
  none: "くり返さない",
  daily: "毎日",
  weekly: "毎週",
};

function load<T>(key: string): T[] {
  try {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as T[]) : [];
  } catch {
    return [];
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDateKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(key: string) {
  const d = parseDateKey(key);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
}

// 次の回の予定日。たまっていた分は飛ばして、今日より後の日にする
function nextDate(date: string, repeat: Repeat, today: string) {
  const step = repeat === "weekly" ? 7 : 1;
  const d = parseDateKey(date);
  do d.setDate(d.getDate() + step);
  while (toDateKey(d) <= today);
  return toDateKey(d);
}

// 完了の記録を足す。古い記録はいらないので、8週間より前のものは捨てる
function addDoneLog(log: DoneLog[], id: string) {
  const now = Date.now();
  return [...log.filter((entry) => entry.at >= now - 56 * DAY_MS), { id, at: now }];
}

// 今週（月曜はじまり）の各曜日の 0:00
function thisWeekDays() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

// localStorage はブラウザにしかないので、この部品は todo-loader.tsx からブラウザ側でだけ表示する
export default function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>(() => load<Todo>(STORAGE_KEY));
  const [log, setLog] = useState<DoneLog[]>(() => load<DoneLog>(LOG_KEY));
  const [text, setText] = useState("");
  const [repeat, setRepeat] = useState<Repeat>("none");
  const [sorting, setSorting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const today = toDateKey(new Date());

  // 予定日がまだ先のくり返しタスクは、一覧とは分けて「次の予定」に出す
  const current = todos.filter((todo) => !todo.date || todo.date <= today);
  const upcoming = todos
    .filter((todo) => todo.date && todo.date > today)
    .sort((a, b) => a.date!.localeCompare(b.date!));
  const remaining = current.filter((todo) => !todo.done).length;
  const doneCount = todos.filter((todo) => todo.done).length;

  // 一覧を変えるときは必ずここを通して、画面と localStorage の両方を更新する
  function updateTodos(next: Todo[], message: Toast) {
    setTodos(next);
    setToast(
      save(STORAGE_KEY, next)
        ? message
        : { message: "保存できませんでした。ブラウザの設定を確認してください" },
    );
  }

  function updateLog(next: DoneLog[]) {
    setLog(next);
    save(LOG_KEY, next);
  }

  // お知らせは4秒で自動的に消す（「元に戻す」付きのときは押す余裕を見て8秒）
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.undo ? 8000 : 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  function addTodo(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setToast({ message: "やることを入力してください" });
      inputRef.current?.focus();
      return;
    }
    const todo: Todo =
      repeat === "none"
        ? { id: createId(), text: trimmed, done: false }
        : { id: createId(), text: trimmed, done: false, repeat, date: today };
    updateTodos([todo, ...todos], {
      message: repeat === "none" ? "追加しました" : `${REPEAT_LABEL[repeat]}くり返すタスクを追加しました`,
    });
    setText("");
    setRepeat("none");
    inputRef.current?.focus();
  }

  function toggleTodo(id: string) {
    const target = todos.find((todo) => todo.id === id);
    if (!target) return;

    if (target.done) {
      updateTodos(
        todos
          .filter((todo) => !(todo.id === target.nextId && !todo.done))
          .map((todo) => (todo.id === id ? { ...todo, done: false, nextId: undefined } : todo)),
        { message: "未完了に戻しました" },
      );
      updateLog(log.filter((entry) => entry.id !== id));
      return;
    }

    let next = todos.map((todo) => (todo.id === id ? { ...todo, done: true } : todo));
    let message = "完了にしました";
    // くり返しタスクは、完了したときに次の回を作る
    if (target.repeat && target.repeat !== "none" && target.date) {
      const date = nextDate(target.date, target.repeat, today);
      const nextTodo: Todo = { id: createId(), text: target.text, done: false, repeat: target.repeat, date };
      const index = next.findIndex((todo) => todo.id === id);
      next[index] = { ...next[index], nextId: nextTodo.id };
      next = [...next.slice(0, index + 1), nextTodo, ...next.slice(index + 1)];
      message = `完了にしました。次は ${formatDate(date)} です`;
    }
    updateTodos(next, { message });
    updateLog(addDoneLog(log, id));
  }

  function deleteTodo(id: string) {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;
    updateTodos(
      todos.filter((t) => t.id !== id),
      { message: `「${todo.text}」を削除しました`, undo: todos },
    );
  }

  function clearDone() {
    updateTodos(
      todos.filter((todo) => !todo.done),
      { message: `完了した ${doneCount} 件を片付けました`, undo: todos },
    );
  }

  function undo() {
    if (!toast?.undo) return;
    updateTodos(toast.undo, { message: "元に戻しました" });
  }

  // 画面に並んでいる順で、となりのタスクと入れ替える
  function moveTodo(id: string, direction: -1 | 1) {
    const ids = current.map((todo) => todo.id);
    const neighborId = ids[ids.indexOf(id) + direction];
    if (!neighborId) return;
    const a = todos.findIndex((todo) => todo.id === id);
    const b = todos.findIndex((todo) => todo.id === neighborId);
    const next = [...todos];
    [next[a], next[b]] = [next[b], next[a]];
    updateTodos(next, { message: direction === -1 ? "1つ上に移動しました" : "1つ下に移動しました" });
  }

  const week = thisWeekDays().map((day) => {
    const start = day.getTime();
    return {
      label: WEEKDAYS[day.getDay()],
      isToday: toDateKey(day) === today,
      count: log.filter((entry) => entry.at >= start && entry.at < start + DAY_MS).length,
    };
  });
  const weekTotal = week.reduce((sum, day) => sum + day.count, 0);
  const weekMax = Math.max(1, ...week.map((day) => day.count));

  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-10 pb-32">
      <h1 className="text-2xl font-bold">やることリスト</h1>
      <p className="mt-1 text-base text-zinc-600">
        {current.length === 0
          ? "まだ何もありません"
          : `残り ${remaining} 件 ／ 全部で ${current.length} 件`}
      </p>

      {/* 今週がんばった数（片付けても減らない） */}
      <section aria-label="今週終わった数" className="mt-4 rounded-lg border border-zinc-200 bg-white p-4">
        <p className="text-base">
          今週 <span className="text-2xl font-bold text-green-700">{weekTotal}</span> 件 終わりました
        </p>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center">
          {week.map((day) => (
            <div key={day.label} className="flex flex-col items-center gap-1">
              <div className="flex h-12 w-full items-end justify-center">
                <div
                  className="w-5 rounded-t bg-green-600"
                  style={{ height: `${(day.count / weekMax) * 100}%`, minHeight: day.count ? 4 : 0 }}
                />
              </div>
              <span className="text-base font-bold">{day.count}</span>
              <span className={`rounded px-1 text-base ${day.isToday ? "bg-zinc-900 text-white" : "text-zinc-600"}`}>
                {day.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      <form onSubmit={addTodo} className="mt-6 space-y-2">
        <div className="flex gap-2">
          <label htmlFor="new-todo" className="sr-only">
            やること
          </label>
          <input
            id="new-todo"
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="例：牛乳を買う"
            maxLength={100}
            className="min-h-12 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-base focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <button
            type="submit"
            className="min-h-12 min-w-20 rounded-lg bg-blue-600 px-4 text-base font-bold text-white hover:bg-blue-700 active:scale-95"
          >
            追加
          </button>
        </div>
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">くり返し</legend>
          <span aria-hidden="true" className="text-base">
            🔁
          </span>
          {(Object.keys(REPEAT_LABEL) as Repeat[]).map((value) => (
            <label
              key={value}
              className={`flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-base has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-300 ${
                repeat === value ? "border-blue-600 bg-blue-50 font-bold text-blue-800" : "border-zinc-300 bg-white"
              }`}
            >
              <input
                type="radio"
                name="repeat"
                value={value}
                checked={repeat === value}
                onChange={() => setRepeat(value)}
                className="sr-only"
              />
              {repeat === value && "✓ "}
              {REPEAT_LABEL[value]}
            </label>
          ))}
        </fieldset>
      </form>

      {current.length === 0 ? (
        <p className="mt-10 rounded-lg border border-dashed border-zinc-300 p-6 text-center text-base text-zinc-600">
          上の入力欄に書いて「追加」を押すと、ここに並びます
        </p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setSorting(!sorting)}
              aria-pressed={sorting}
              className={`min-h-11 rounded-lg border px-4 text-base ${
                sorting ? "border-blue-600 bg-blue-600 font-bold text-white" : "border-zinc-300 bg-white hover:bg-zinc-50"
              }`}
            >
              {sorting ? "✓ 並べ替えを終わる" : "↕ 並べ替え"}
            </button>
            {!sorting && (
              <button
                type="button"
                onClick={clearDone}
                disabled={doneCount === 0}
                className="min-h-11 rounded-lg border border-zinc-300 bg-white px-4 text-base hover:bg-zinc-50 disabled:opacity-40"
              >
                🧹 完了を片付ける（{doneCount}）
              </button>
            )}
          </div>
          <ul className="mt-2 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
            {current.map((todo, index) => (
              <li key={todo.id} className="flex items-center gap-2 px-2 py-1">
                <button
                  type="button"
                  onClick={() => toggleTodo(todo.id)}
                  aria-pressed={todo.done}
                  aria-label={todo.done ? `「${todo.text}」を未完了に戻す` : `「${todo.text}」を完了にする`}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-2 text-left hover:bg-zinc-50"
                >
                  {/* 色だけでなく、チェックの形と取り消し線でも完了がわかるようにする */}
                  <span
                    aria-hidden="true"
                    className={`flex size-6 shrink-0 items-center justify-center rounded-md border-2 text-base font-bold ${
                      todo.done ? "border-green-700 bg-green-700 text-white" : "border-zinc-400 bg-white"
                    }`}
                  >
                    {todo.done ? "✓" : ""}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block text-base [overflow-wrap:anywhere] ${todo.done ? "text-zinc-500 line-through" : ""}`}
                    >
                      {todo.text}
                    </span>
                    {todo.repeat && todo.repeat !== "none" && todo.date && (
                      <span className="block text-base text-zinc-600">
                        🔁 {todo.repeat === "weekly" ? `毎週${WEEKDAYS[parseDateKey(todo.date).getDay()]}曜` : "毎日"}
                        {todo.date < today && !todo.done && `・${formatDate(todo.date)}の分`}
                      </span>
                    )}
                  </span>
                  {todo.done && <span className="sr-only">（完了）</span>}
                </button>
                {sorting ? (
                  <>
                    <button
                      type="button"
                      onClick={() => moveTodo(todo.id, -1)}
                      disabled={index === 0}
                      aria-label={`「${todo.text}」を1つ上へ`}
                      className="min-h-11 min-w-11 shrink-0 rounded-md border border-zinc-300 text-base hover:bg-zinc-50 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveTodo(todo.id, 1)}
                      disabled={index === current.length - 1}
                      aria-label={`「${todo.text}」を1つ下へ`}
                      className="min-h-11 min-w-11 shrink-0 rounded-md border border-zinc-300 text-base hover:bg-zinc-50 disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => deleteTodo(todo.id)}
                    aria-label={`「${todo.text}」を削除`}
                    className="min-h-11 shrink-0 whitespace-nowrap rounded-md px-3 text-base text-red-700 hover:bg-red-50"
                  >
                    🗑 削除
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {upcoming.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-bold text-zinc-700">🔁 次の予定</h2>
          <ul className="mt-2 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-zinc-50">
            {upcoming.map((todo) => (
              <li key={todo.id} className="flex items-center gap-2 px-4 py-1">
                <span className="min-w-0 flex-1 text-base [overflow-wrap:anywhere]">{todo.text}</span>
                <span className="shrink-0 text-base text-zinc-600">{formatDate(todo.date!)}</span>
                <button
                  type="button"
                  onClick={() => deleteTodo(todo.id)}
                  aria-label={`「${todo.text}」のくり返しをやめる`}
                  className="min-h-11 shrink-0 whitespace-nowrap rounded-md px-2 text-base text-red-700 hover:bg-red-100"
                >
                  🗑 やめる
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 操作したら下にお知らせを出して「ちゃんと動いた」ことを伝える */}
      <div aria-live="polite" className="fixed inset-x-0 bottom-6 flex justify-center px-4">
        {toast && (
          <div className="flex items-center gap-4 rounded-lg bg-zinc-900 px-4 py-3 text-base text-white shadow-lg">
            <span>{toast.message}</span>
            {toast.undo && (
              <button
                type="button"
                onClick={undo}
                className="min-h-11 shrink-0 whitespace-nowrap rounded-md px-2 font-bold text-yellow-300 underline"
              >
                元に戻す
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
