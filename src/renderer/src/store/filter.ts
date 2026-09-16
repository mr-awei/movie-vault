import { create } from 'zustand'
import type { SortKey } from '../../../shared/types'

/**
 * 筛选状态 Store（Zustand）。
 * 管理浏览页的筛选条件：搜索、排序、多选标签/类别/演员/制片公司/系列、
 * 分辨率/时长/评分/年份维度筛选。
 * 从 App.tsx 上帝组件中拆出来。
 */

export interface FilterState {
  search: string
  sort: SortKey
  desc: boolean
  /** 分组模式：grouped 按 Excel 分类分组 / flat 全库单网格（适用于所有排序） */
  groupMode: 'grouped' | 'flat'
  /** 当前选中的分类（点击侧栏分类切换；null = 全部） */
  category: string | null
}

/** 支持函数式更新的 setter 类型（与 React setState 语义一致） */
type Setter<T> = (v: T | ((prev: T) => T)) => void

interface FilterStore {
  filter: FilterState
  /** 搜索输入框的值（立即更新 UI）；实际过滤用防抖后的 filter.search */
  searchInput: string
  /** 多选标签 AND 过滤（侧栏交互） */
  selectedTags: Set<string>
  /** 类别（genre）筛选：从 meta.genres 提取单标签，独立于「分类」 */
  selectedGenres: Set<string>
  /** 演员 / 制片公司 / 系列 维度筛选（各维度内 OR，跨维度 AND；点击详情页字段触发） */
  selectedActors: Set<string>
  selectedStudios: Set<string>
  selectedSeries: Set<string>
  /** 技术规格 / 时间 维度筛选（分辨率 / 时长 / 评分 / 年份），各维度内 OR、跨维度 AND */
  selectedResolutions: Set<string>
  selectedDurations: Set<string>
  selectedScores: Set<string>
  selectedYears: Set<string>

  setFilter: Setter<FilterState>
  setSearchInput: Setter<string>
  setSelectedTags: Setter<Set<string>>
  setSelectedGenres: Setter<Set<string>>
  setSelectedActors: Setter<Set<string>>
  setSelectedStudios: Setter<Set<string>>
  setSelectedSeries: Setter<Set<string>>
  setSelectedResolutions: Setter<Set<string>>
  setSelectedDurations: Setter<Set<string>>
  setSelectedScores: Setter<Set<string>>
  setSelectedYears: Setter<Set<string>>
  /** 清空全部筛选条件 */
  clearAllFilters: () => void
}

/** 生成支持函数式更新的 setter */
function apply<K extends keyof FilterStore>(
  set: (fn: (s: FilterStore) => Partial<FilterStore>) => void,
  key: K
) {
  return (v: FilterStore[K] | ((prev: FilterStore[K]) => FilterStore[K])) =>
    set((s) => ({ [key]: typeof v === 'function' ? (v as (p: FilterStore[K]) => FilterStore[K])(s[key]) : v }) as Partial<FilterStore>)
}

export const useFilterStore = create<FilterStore>((set) => ({
  filter: {
    search: '',
    sort: 'title',
    desc: false,
    groupMode: 'flat',
    category: null
  },
  searchInput: '',
  selectedTags: new Set<string>(),
  selectedGenres: new Set<string>(),
  selectedActors: new Set<string>(),
  selectedStudios: new Set<string>(),
  selectedSeries: new Set<string>(),
  selectedResolutions: new Set<string>(),
  selectedDurations: new Set<string>(),
  selectedScores: new Set<string>(),
  selectedYears: new Set<string>(),

  setFilter: apply(set, 'filter'),
  setSearchInput: apply(set, 'searchInput'),
  setSelectedTags: apply(set, 'selectedTags'),
  setSelectedGenres: apply(set, 'selectedGenres'),
  setSelectedActors: apply(set, 'selectedActors'),
  setSelectedStudios: apply(set, 'selectedStudios'),
  setSelectedSeries: apply(set, 'selectedSeries'),
  setSelectedResolutions: apply(set, 'selectedResolutions'),
  setSelectedDurations: apply(set, 'selectedDurations'),
  setSelectedScores: apply(set, 'selectedScores'),
  setSelectedYears: apply(set, 'selectedYears'),
  clearAllFilters: () =>
    set({
      filter: { search: '', sort: 'title', desc: false, groupMode: 'flat', category: null },
      searchInput: '',
      selectedTags: new Set(),
      selectedGenres: new Set(),
      selectedActors: new Set(),
      selectedStudios: new Set(),
      selectedSeries: new Set(),
      selectedResolutions: new Set(),
      selectedDurations: new Set(),
      selectedScores: new Set(),
      selectedYears: new Set()
    })
}))
