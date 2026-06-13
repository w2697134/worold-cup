"use client";

import { DEFAULT_PREDICTION_STRATEGIES } from "@/lib/strategies";
import { appPath } from "@/lib/base-path";
import type { PredictionStrategyId } from "@/lib/types";
import { useState } from "react";

const DETAILS: Record<
  PredictionStrategyId,
  {
    trigger: string;
    focus: string;
    data: string[];
    method: string[];
    effect: string;
  }
> = {
  ranking: {
    trigger: "默认",
    focus: "基础强弱、主办国、FIFA 排名",
    data: ["球队强度评级", "主办国/赛地影响", "知识库里的 FIFA 排名"],
    method: ["先给双方基础强弱差", "再修正预期进球", "生成基础胜平负方向"],
    effect: "参与基础概率、预期进球、预测比分。",
  },
  market: {
    trigger: "有赔率",
    focus: "胜平负、盘口、让球、水位",
    data: ["胜平负赔率", "盘口/让球方向", "水位变化"],
    method: ["把赔率折算成市场概率", "判断市场更偏哪一边", "和 Poisson、模型概率融合"],
    effect: "影响胜平负概率和价值观察。",
  },
  h2h: {
    trigger: "有交锋",
    focus: "历史交锋比分、延续性",
    data: ["知识库里的交锋比分", "明确胜负平的历史记录"],
    method: ["解析比分", "过滤日期和时间", "统计候选方向命中率"],
    effect: "显示回测最佳；样本少不硬改概率。",
  },
  form: {
    trigger: "有战绩",
    focus: "近期战绩、进球、失球、走势",
    data: ["近期比分", "进球/失球", "连胜、不胜和走势"],
    method: ["解析近期赛果", "统计短期方向", "做相似样本回测"],
    effect: "作为情报因素和回测提示。",
  },
};

export default function StrategiesPage() {
  const [selected, setSelected] = useState<PredictionStrategyId | null>(null);
  const selectedStrategy = DEFAULT_PREDICTION_STRATEGIES.find((strategy) => strategy.id === selected);
  const selectedDetail = selected ? DETAILS[selected] : null;

  return (
    <main className="min-h-screen px-5 pb-16 pt-6">
      <header className="mx-auto flex max-w-5xl items-center justify-between">
        <a className="flex items-center gap-3" href={appPath("/")} aria-label="返回首页">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-host-gradient text-lg font-black text-white shadow-glow">
            赛
          </span>
          <span>
            <span className="block text-sm font-extrabold tracking-wide text-white">
              世界杯 2026
            </span>
            <span className="block text-[11px] text-white/45">返回预测页</span>
          </span>
        </a>

        <a
          href={appPath("/")}
          className="rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm font-semibold text-white/72 transition hover:text-white"
        >
          返回首页
        </a>
      </header>

      <section className="mx-auto mt-12 max-w-5xl">
        <h1 className="text-3xl font-extrabold tracking-normal text-white">策略库</h1>
        <p className="mt-2 text-sm text-white/42">点卡片查看详细策略</p>
      </section>

      <section className="mx-auto mt-6 grid max-w-5xl gap-3 md:grid-cols-2">
        {DEFAULT_PREDICTION_STRATEGIES.map((strategy) => {
          const detail = DETAILS[strategy.id];

          return (
            <button
              key={strategy.id}
              type="button"
              onClick={() => setSelected(strategy.id)}
              className="glass rounded-lg p-4 text-left transition hover:border-emerald-400/35 hover:bg-emerald-400/5 focus:outline-none focus:ring-2 focus:ring-emerald-300/50"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-white">{strategy.name}</h2>
                <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-400/25">
                  {detail.trigger}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/65">{detail.focus}</p>
            </button>
          );
        })}
      </section>

      {selectedStrategy && selectedDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-lg border border-white/10 bg-ink-800 p-5 shadow-card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white">{selectedStrategy.name}</h2>
                <p className="mt-1 text-sm text-white/45">{selectedDetail.focus}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-full border border-white/10 px-3 py-1.5 text-sm font-semibold text-white/60 transition hover:text-white"
              >
                关闭
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <DetailBlock title="使用数据" items={selectedDetail.data} />
              <DetailBlock title="处理方式" items={selectedDetail.method} />
              <div className="rounded-md border border-white/8 bg-white/[0.025] p-3">
                <p className="text-xs font-semibold text-white/38">影响结果</p>
                <p className="mt-2 text-sm leading-6 text-white/72">{selectedDetail.effect}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function DetailBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-white/8 bg-white/[0.025] p-3">
      <p className="text-xs font-semibold text-white/38">{title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-white/62"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
