"use client";

import { useEffect, useRef, useState } from "react";

type Todo = {
  id: string;
  text: string;
  done: boolean;
};

type Toast = {
  message: string;
  // 削除したときだけ「元に戻す」で復活させるために、消したタスクと元の位置を持っておく
  undo?: { todo: Todo; index: number };
};

const STORAGE_KEY = "todo-next:todos";

function loadTodos(): Todo[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as Todo[]) : [];
  } catch {
    return [];
  }
}

function saveTodos(todos: Todo[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    return true;
  } catch {
    return false;
  }
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// localStorage はブラウザにしかないので、この部品は todo-loader.tsx からブラウザ側でだけ表示する
export default function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>(loadTodos);
  const [text, setText] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 一覧を変えるときは必ずここを通して、画面と localStorage の両方を更新する
  function updateTodos(next: Todo[], message: Toast) {
    setTodos(next);
    setToast(
      saveTodos(next)
        ? message
        : { message: "保存できませんでした。ブラウザの設定を確認してください" },
    );
  }

  // お知らせは4秒で自動的に消す
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
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
    updateTodos([{ id: createId(), text: trimmed, done: false }, ...todos], {
      message: "追加しました",
    });
    setText("");
    inputRef.current?.focus();
  }

  function toggleTodo(id: string) {
    const target = todos.find((todo) => todo.id === id);
    if (!target) return;
    updateTodos(
      todos.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo)),
      { message: target.done ? "未完了に戻しました" : "完了にしました" },
    );
  }

  function deleteTodo(id: string) {
    const index = todos.findIndex((todo) => todo.id === id);
    if (index === -1) return;
    const todo = todos[index];
    updateTodos(
      todos.filter((t) => t.id !== id),
      { message: `「${todo.text}」を削除しました`, undo: { todo, index } },
    );
  }

  function undoDelete() {
    if (!toast?.undo) return;
    const { todo, index } = toast.undo;
    updateTodos([...todos.slice(0, index), todo, ...todos.slice(index)], {
      message: "元に戻しました",
    });
  }

  const remaining = todos.filter((todo) => !todo.done).length;

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <h1 className="text-2xl font-bold">やることリスト</h1>
      <p className="mt-1 text-base text-zinc-600">
        {todos.length === 0
          ? "まだ何もありません"
          : `残り ${remaining} 件 ／ 全部で ${todos.length} 件`}
      </p>

      <form onSubmit={addTodo} className="mt-6 flex gap-2">
        <label htmlFor="new-todo" className="sr-only">
          やること
        </label>
        <input
          id="new-todo"
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="例：牛乳を買う"
          className="min-h-12 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-base focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <button
          type="submit"
          className="min-h-12 min-w-20 rounded-lg bg-blue-600 px-4 text-base font-bold text-white hover:bg-blue-700 active:scale-95"
        >
          追加
        </button>
      </form>

      {todos.length === 0 ? (
        <p className="mt-10 rounded-lg border border-dashed border-zinc-300 p-6 text-center text-base text-zinc-600">
          上の入力欄に書いて「追加」を押すと、ここに並びます
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
          {todos.map((todo) => (
            <li key={todo.id} className="flex items-center gap-2 px-2 py-1">
              <button
                type="button"
                onClick={() => toggleTodo(todo.id)}
                aria-pressed={todo.done}
                aria-label={todo.done ? `「${todo.text}」を未完了に戻す` : `「${todo.text}」を完了にする`}
                className="flex min-h-11 flex-1 items-center gap-3 rounded-md px-2 text-left hover:bg-zinc-50"
              >
                {/* 色だけでなく、チェックの形と取り消し線でも完了がわかるようにする */}
                <span
                  aria-hidden="true"
                  className={`flex size-6 shrink-0 items-center justify-center rounded-md border-2 text-sm font-bold ${
                    todo.done ? "border-green-700 bg-green-700 text-white" : "border-zinc-400 bg-white"
                  }`}
                >
                  {todo.done ? "✓" : ""}
                </span>
                <span
                  className={`text-base break-all ${todo.done ? "text-zinc-500 line-through" : ""}`}
                >
                  {todo.text}
                </span>
                {todo.done && <span className="sr-only">（完了）</span>}
              </button>
              <button
                type="button"
                onClick={() => deleteTodo(todo.id)}
                aria-label={`「${todo.text}」を削除`}
                className="min-h-11 shrink-0 rounded-md px-3 text-base text-red-700 hover:bg-red-50"
              >
                🗑 削除
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 操作したら下にお知らせを出して「ちゃんと動いた」ことを伝える */}
      <div aria-live="polite" className="fixed inset-x-0 bottom-6 flex justify-center px-4">
        {toast && (
          <div className="flex items-center gap-4 rounded-lg bg-zinc-900 px-4 py-3 text-base text-white shadow-lg">
            <span>{toast.message}</span>
            {toast.undo && (
              <button
                type="button"
                onClick={undoDelete}
                className="min-h-11 rounded-md px-2 font-bold text-yellow-300 underline"
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
