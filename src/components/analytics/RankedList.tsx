import type { NamedValue } from "@/lib/analytics/types";

export interface RankedListProps {
  title: string;
  items: NamedValue[];
  formatValue?: (value: number) => string;
}

export function RankedList({ title, items, formatValue }: RankedListProps) {
  const format = formatValue ?? ((value: number) => value.toLocaleString());

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <p className="text-sm text-gray-500 mb-2">{title}</p>
      <ul className="divide-y divide-gray-100">
        {items.map((item) => (
          <li
            key={item.name}
            className="flex items-center justify-between py-2 text-sm"
          >
            <span>{item.name}</span>
            <span className="font-medium">{format(item.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
