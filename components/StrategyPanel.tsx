"use client";

import { useMemo, useState } from "react";
import { DEFAULT_PREDICTION_STRATEGIES } from "@/lib/strategies";
import type { PredictionStrategyId } from "@/lib/types";
import { ChevronToggle } from "@/components/ChevronToggle";

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
    method: ["先给双方基础强弱差", "修正预期进球", "生成基础胜平负方向"],
    effect: "参与基础概率、预期进球、预测比分。",
  },
  market: {
    trigger: "有赔率",
    focus: "胜平负、盘口、让球、水位",
    data: ["胜平负赔率", "盘口/让球方向", "水位变化"],
    method: ["折算市场概率", "判断市场偏向", "和模型概率融合"],
    effect: "影响胜平负概率和价值观察。",
  },
  h2h: {
    trigger: "有交锋",
    focus: "历史交锋比分、延续性",
    data: ["知识库里的交锋比分", "明确胜负平的历史记录"],
    method: ["解析比分", "过滤时间", "统计候选方向命中率"],
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

export function StrategyPanel({ embedded = false }: { embedded?: boolean }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PredictionStrategyId>("ranking");

  const selectedStrategy = useMemo(
    () => DEFAULT_PREDICTION_STRATEGIES.find((strategy) => strategy.id === selected),
    [selected],
  );
  const selectedDetail = DETAILS[selected];

  return (
    <section id="strategy" className={embedded ? "" : "mx-auto mt-10 max-w-6xl"}>
      <div className="glass h-full min-h-[126px] rounded-lg p-6 shadow-card">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpen((current) => !current);
            }
          }}
          className="grid min-h-[78px] cursor-pointer grid-cols-[1fr_auto] items-center gap-6 rounded-md outline-none transition hover:bg-white/[0.025] focus-visible:ring-2 focus-visible:ring-emerald-300"
        >
          <div>
            <h2 className="text-2xl font-extrabold tracking-normal text-white">策略说明</h2>
            <p className="mt-2 text-sm font-semibold text-white/70">判断逻辑</p>
          </div>
          <ChevronToggle
            open={open}
            onClick={() => setOpen((current) => !current)}
            label={open ? "收起策略说明" : "展开策略说明"}
          />
        </div>

        {open && selectedStrategy && (
          <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="grid content-start gap-3">
              {DEFAULT_PREDICTION_STRATEGIES.map((strategy) => {
                const detail = DETAILS[strategy.id];
                const active = strategy.id === selected;

                return (
                  <button
                    key={strategy.id}
                    type="button"
                    onClick={() => setSelected(strategy.id)}
                    className={`rounded-lg p-4 text-left transition ${
                      active
                        ? "bg-emerald-400/12 ring-1 ring-emerald-400/35"
                        : "bg-white/[0.035] hover:bg-white/[0.055]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-base font-bold text-white">{strategy.name}</h4>
                      <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-white/55">
                        {detail.trigger}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-white/62">{detail.focus}</p>
                  </button>
                );
              })}
            </div>

            <div className="rounded-lg bg-white/[0.035] p-4">
              <h4 className="text-xl font-bold text-white">{selectedStrategy.name}</h4>
              <p className="mt-2 text-sm leading-6 text-white/62">{selectedDetail.focus}</p>

              <div className="mt-5 grid gap-4">
                <DetailBlock title="使用数据" items={selectedDetail.data} />
                <DetailBlock title="处理方式" items={selectedDetail.method} />
                <div className="rounded-md bg-white/[0.035] p-3">
                  <p className="text-xs font-semibold text-white/38">影响结果</p>
                  <p className="mt-2 text-sm leading-6 text-white/72">{selectedDetail.effect}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function DetailBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md bg-white/[0.035] p-3">
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
