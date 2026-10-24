"use client";

import dynamic from "next/dynamic";

// 保存データ（localStorage）を読むまでの間は、くるくるマークで「読み込み中」と伝える
const TodoApp = dynamic(() => import("./todo-app"), {
  ssr: false,
  loading: () => (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <h1 className="text-2xl font-bold">やることリスト</h1>
      <div role="status" className="mt-10 flex items-center justify-center gap-3 text-base text-zinc-600">
        <span
          aria-hidden="true"
          className="size-5 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600"
        />
        読み込み中…
      </div>
    </main>
  ),
});

export default function TodoLoader() {
  return <TodoApp />;
}
