# 代码位置速查

当前项目是 React + TypeScript + Vite PWA。后续开发时优先按下面的位置找代码。

## 应用入口

- `src/main.tsx`：应用状态、底部 Tab、主要页面组件入口。
- `src/styles.css`：全局布局、Liquid Glass 风格、页面组件样式。
- `src/model.ts`：数据类型、默认设置、默认训练模板。
- `src/storage.ts`：IndexedDB 本地存储、导入导出、数据兼容处理。

## 业务能力

- `src/integrations.ts`：Intervals.icu 同步、AI 训练建议、AI 咨询请求。
- `src/trainingUtils.ts`：训练类型展示、模板功率刷新、饮食提示等工具。
- `src/calendarUtils.ts`：日历月视图日期计算。
- `src/time.ts`：日期格式化、今天、本周日期计算。

## 组件

- `src/components/TrainingBits.tsx`：训练标签、指标块、力量动作列表、打卡网格。
- `src/components/TrendChart.tsx`：身体趋势图。

## 文档

- `docs/USER_GUIDE.md`：使用说明。
- `docs/RELEASE.md`：发布流程。
- `docs/CODE_STRUCTURE.md`：本文件，代码位置速查。

## 后续拆分建议

`src/main.tsx` 里仍然保留了页面级组件。后续如果继续扩展，建议按页面逐步拆到：

- `src/pages/TodayPage.tsx`
- `src/pages/PlanPage.tsx`
- `src/pages/CalendarPage.tsx`
- `src/pages/BodyPage.tsx`
- `src/pages/SettingsPage.tsx`

拆分时先移动页面组件，再把只被该页面使用的小组件和工具函数一起移走，避免一次性大改带来回归。
