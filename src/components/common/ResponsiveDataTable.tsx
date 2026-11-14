import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, LayoutGrid, Table2 } from 'lucide-react';

export interface TableColumn<T> {
  key: string;
  header: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  minWidth?: string;
  stickyLeft?: boolean;
  hideInMobileCard?: boolean;
  render: (row: T) => React.ReactNode;
}

interface ResponsiveDataTableProps<T> {
  data: T[];
  columns: TableColumn<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  mobileCardTitle?: (row: T) => React.ReactNode;
  mobileCardBadge?: (row: T) => React.ReactNode;
  mobileCardActions?: (row: T) => React.ReactNode;
  defaultMobileCardView?: boolean;
}

export function ResponsiveDataTable<T>({
  data,
  columns,
  rowKey,
  loading = false,
  emptyTitle = 'কোনো তথ্য পাওয়া যায়নি',
  emptyDescription = 'অনুসন্ধান বা ফিল্টার পরিবর্তন করে পুনরায় চেষ্টা করুন।',
  emptyAction,
  mobileCardTitle,
  mobileCardBadge,
  mobileCardActions,
  defaultMobileCardView = false,
}: ResponsiveDataTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(
    defaultMobileCardView ? 'cards' : 'table'
  );

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const overflow = el.scrollWidth > el.clientWidth + 4;
    setHasHorizontalOverflow(overflow);
    setCanScrollRight(overflow && el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    window.addEventListener('resize', checkScroll);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', checkScroll);
    };
  }, [data.length, viewMode, columns.length]);

  const scrollByAmount = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="p-4 space-y-2.5 animate-pulse">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 bg-slate-100 rounded-lg w-full" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="py-12 px-4 text-center space-y-2">
        <p className="text-sm font-bold text-slate-700">{emptyTitle}</p>
        <p className="text-xs text-slate-500 max-w-md mx-auto">{emptyDescription}</p>
        {emptyAction && <div className="pt-2">{emptyAction}</div>}
      </div>
    );
  }

  const showCardMode = viewMode === 'cards' && Boolean(mobileCardTitle);

  return (
    <div className="w-full max-w-full min-w-0">
      {/* Subtle scroll indicator + Mobile Table/Card Toggle Bar */}
      {(hasHorizontalOverflow || mobileCardTitle) && (
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 text-[11px] text-slate-600">
          <div className="flex items-center gap-2 min-w-0">
            {hasHorizontalOverflow && viewMode === 'table' && (
              <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">ডানে-বামে স্ক্রল করুন</span>
                {canScrollRight && (
                  <button
                    type="button"
                    onClick={() => scrollByAmount(220)}
                    className="ml-1 px-2 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold whitespace-nowrap"
                  >
                    আরও কলাম →
                  </button>
                )}
              </div>
            )}
          </div>

          {mobileCardTitle && (
            <div className="flex sm:hidden items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2 py-1 rounded flex items-center gap-1 font-semibold ${
                  viewMode === 'table' ? 'bg-emerald-700 text-white' : 'text-slate-600'
                }`}
              >
                <Table2 className="w-3 h-3" />
                <span>টেবিল</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`px-2 py-1 rounded flex items-center gap-1 font-semibold ${
                  viewMode === 'cards' ? 'bg-emerald-700 text-white' : 'text-slate-600'
                }`}
              >
                <LayoutGrid className="w-3 h-3" />
                <span>কার্ড</span>
              </button>
            </div>
          )}
        </div>
      )}

      {showCardMode ? (
        <div className="sm:hidden divide-y divide-slate-200">
          {data.map((row) => (
            <div key={rowKey(row)} className="p-4 space-y-3 bg-white">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 font-bold text-slate-900 text-xs">{mobileCardTitle!(row)}</div>
                {mobileCardBadge && <div className="shrink-0">{mobileCardBadge(row)}</div>}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] bg-slate-50 p-3 rounded-lg border border-slate-100">
                {columns
                  .filter((col) => !col.hideInMobileCard)
                  .map((col) => (
                    <div key={col.key} className="min-w-0">
                      <span className="text-slate-400 block text-[10px]">{col.header}</span>
                      <div className="text-slate-800 font-medium break-words">{col.render(row)}</div>
                    </div>
                  ))}
              </div>
              {mobileCardActions && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">{mobileCardActions(row)}</div>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {/* Horizontal Scroll Table (Always rendered on sm+ and when table mode active on mobile) */}
      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className={`horizontal-scroll-table ${showCardMode ? 'hidden sm:block' : 'block'}`}
      >
        <table className="w-full text-xs text-left border-collapse tabular-nums">
          <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.minWidth ? { minWidth: col.minWidth } : undefined}
                  className={`py-3 px-3 whitespace-nowrap ${
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                      ? 'text-center'
                      : 'text-left'
                  } ${col.stickyLeft ? 'sticky left-0 bg-slate-50 z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]' : ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {data.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-slate-50/80 transition-colors">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`py-2.5 px-3 align-middle ${
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                    } ${
                      col.stickyLeft
                        ? 'sticky left-0 bg-white z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]'
                        : ''
                    }`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
